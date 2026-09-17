import * as vscode from 'vscode';
import { Connection, ConnectionState } from './connection';

let connection: Connection | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'apiProfiler.showStatus';
  status.show();
  context.subscriptions.push(status);

  const connect = () => {
    connection?.stop();
    connection = new Connection({ port: configuredPort(), isInstalled: profilerInstalled });
    connection.onChange((state) => render(status, state));
    render(status, connection.state);
    connection.start();
  };
  connect();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('apiProfiler.port')) {
        connect();
      }
    }),
    vscode.window.onDidChangeWindowState((window) => {
      if (window.focused) {
        connection?.resume();
      } else {
        connection?.pause();
      }
    }),
    vscode.commands.registerCommand('apiProfiler.refresh', () => connection?.refresh()),
    vscode.commands.registerCommand('apiProfiler.showStatus', () => showStatus(connection?.state)),
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
