import * as vscode from 'vscode';
import { ChannelClient, Thresholds } from 'api-profiler';
import { Connection, ConnectionState } from './connection';
import { InlineDecorations } from './decorations';
import { RoutesPanel } from './panel';
import { RouteIndex } from './routeIndex';

let connection: Connection | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'apiProfiler.showRoutes';
  status.show();
  context.subscriptions.push(status);

  const index = new RouteIndex();
  context.subscriptions.push(index);
  let panel: RoutesPanel | null = null;
  let tree: vscode.TreeView<unknown> | null = null;
  let inline: InlineDecorations | null = null;

  const connect = () => {
    connection?.stop();
    tree?.dispose();
    inline?.dispose();
    connection = new Connection({ port: configuredPort(), isInstalled: profilerInstalled });
    connection.onChange((state) => render(status, state));
    render(status, connection.state);
    panel = new RoutesPanel(connection, index, thresholds);
    tree = vscode.window.createTreeView('apiProfiler.routes', { treeDataProvider: panel, showCollapseAll: false });
    inline = new InlineDecorations(panel, index, decorationsEnabled);
    context.subscriptions.push(tree, inline);
    connection.start();
  };
  connect();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('apiProfiler.port')) {
        connect();
      } else if (event.affectsConfiguration('apiProfiler.thresholds')) {
        panel?.forget();
      } else if (event.affectsConfiguration('apiProfiler.decorations')) {
        inline?.refresh();
      }
    }),
    vscode.window.onDidChangeWindowState((window) => {
      if (window.focused) {
        connection?.resume();
      } else {
        connection?.pause();
      }
    }),
    vscode.commands.registerCommand('apiProfiler.refresh', () => Promise.all([connection?.refresh(), index.refresh()])),
    vscode.commands.registerCommand('apiProfiler.showRoutes', () =>
      vscode.commands.executeCommand('apiProfiler.routes.focus'),
    ),
    vscode.commands.registerCommand('apiProfiler.showStatus', () => showStatus(connection?.state)),
    vscode.commands.registerCommand('apiProfiler.clearMetrics', () => clearMetrics(panel)),
    vscode.commands.registerCommand('apiProfiler.toggleDecorations', () =>
      vscode.workspace
        .getConfiguration('apiProfiler')
        .update('decorations', !decorationsEnabled(), vscode.ConfigurationTarget.Global),
    ),
    { dispose: () => connection?.stop() },
  );
}

export function deactivate(): void {
  connection?.stop();
  connection = null;
}

function configuredPort(): number {
  return vscode.workspace.getConfiguration('apiProfiler').get<number>('port', 4780);
}

function decorationsEnabled(): boolean {
  return vscode.workspace.getConfiguration('apiProfiler').get<boolean>('decorations', true);
}

function thresholds(): Thresholds {
  const config = vscode.workspace.getConfiguration('apiProfiler.thresholds');
  const fast = config.get<number>('fast', 200);
  const warn = config.get<number>('warn', 500);
  return warn > fast ? { fast, warn } : { fast: 200, warn: 500 };
}

async function clearMetrics(panel: RoutesPanel | null): Promise<void> {
  if (!connection || connection.state.kind !== 'connected') {
    void vscode.window.showWarningMessage('API Profiler: no app connected, nothing to clear.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    'Forget all metrics, recordings and load results in the running app?',
    { modal: true },
    'Clear',
  );
  if (choice !== 'Clear') {
    return;
  }
  try {
    await new ChannelClient(connection.url).reset();
    panel?.forget();
    await connection.refresh();
  } catch (error) {
    void vscode.window.showErrorMessage(`API Profiler: ${(error as Error).message}`);
  }
}

async function profilerInstalled(): Promise<boolean> {
  const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 25);
  for (const file of files) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString();
      if (/"@api-profiler\/(express|node|nestjs)"/.test(text)) {
        return true;
      }
    } catch {
      // unreadable file: keep looking
    }
  }
  return false;
}

function render(status: vscode.StatusBarItem, state: ConnectionState): void {
  switch (state.kind) {
    case 'connected': {
      const routes = new Set(state.stats.map((s) => `${s.method} ${s.route}`)).size;
      status.text = `$(pulse) API Profiler: ${routes} route${routes === 1 ? '' : 's'}`;
      status.tooltip = `Connected to ${state.url} (profiler v${state.version})`;
      status.backgroundColor = undefined;
      return;
    }
    case 'unreachable':
      status.text = '$(debug-disconnect) API Profiler: app not running';
      status.tooltip = `Nothing is answering at ${state.url}. Start your app with app.use(profiler()).`;
      status.backgroundColor = undefined;
      return;
    case 'setup-needed':
      status.text = '$(warning) API Profiler: setup needed';
      status.tooltip = 'This workspace does not have @api-profiler/express installed.';
      status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
  }
}

function showStatus(state: ConnectionState | undefined): void {
  if (!state) {
    return;
  }
  switch (state.kind) {
    case 'connected':
      void vscode.window.showInformationMessage(
        `API Profiler is connected to ${state.url} (v${state.version}), ${state.stats.length} route entries in the window.`,
      );
      return;
    case 'unreachable':
      void vscode.window.showWarningMessage(
        `API Profiler cannot reach the app at ${state.url}. Is it running with app.use(profiler())? Change apiProfiler.port if you use another port.`,
      );
      return;
    case 'setup-needed':
      void vscode.window.showWarningMessage(
        'API Profiler is not installed in this workspace yet. Run: npm install @api-profiler/express, then add app.use(profiler()).',
      );
  }
}
