import * as vscode from 'vscode';
import { ChannelClient, ChannelRefused, ms } from 'api-profiler';
import { buildLenses } from './codelens';
import type { Connection } from './connection';
import type { RouteIndex } from './routeIndex';
import { normalize } from './inline';

export interface LoadSettings {
  connections: number;
  duration: number;
}

// Starts load tests from the editor and keeps the CodeLenses in step with what the app can do.
export class LoadRuns implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private running: string | null = null;
  private signature = '';
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly connection: Connection,
    private readonly index: RouteIndex,
    private readonly settings: () => LoadSettings,
  ) {
    this.subscriptions.push(
      vscode.languages.registerCodeLensProvider([{ scheme: 'file', language: 'javascript' }, { scheme: 'file', language: 'typescript' }], this),
      index.onDidChange(() => this.changed.fire()),
    );
    // Polls arrive every second; lenses only change when the connection kind or the recorded set does.
    this.subscriptions.push({ dispose: connection.onChange((state) => {
      const next = state.kind === 'connected' ? `connected ${[...state.recorded].sort().join(',')}` : state.kind;
      if (next !== this.signature) {
        this.signature = next;
        this.changed.fire();
      }
    }) });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = normalize(document.uri.fsPath);
    const locations = this.index.all().filter((l) => normalize(l.file) === file);
    return buildLenses(locations, this.connection.state, this.running).flatMap((lens) => {
      if (lens.line > document.lineCount) {
        return [];
      }
      const range = document.lineAt(lens.line - 1).range;
      const command = lens.command
        ? { command: lens.command.id, title: lens.title, arguments: [{ method: lens.command.method, route: lens.command.route }] }
        : { command: '', title: lens.title };
      return [new vscode.CodeLens(range, command)];
    });
  }

  async start(target: { method: string; route: string }): Promise<void> {
    const key = `${target.method} ${target.route}`;
    if (this.running) {
      void vscode.window.showWarningMessage(`API Profiler: ${this.running} is still running. One load test at a time.`);
      return;
    }
    if (this.connection.state.kind !== 'connected') {
      void vscode.window.showWarningMessage('API Profiler: the app is not running, nothing to load test.');
      return;
    }
    const { connections, duration } = this.settings();
    this.running = key;
    this.changed.fire();
    try {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Load test ${key}: ${connections} connections × ${duration}s` },
        () => new ChannelClient(this.connection.url).startRun({ method: target.method, route: target.route, connections, duration }),
      );
      await this.connection.refresh();
      if (result.stats) {
        void vscode.window.showInformationMessage(
          `${key} under load: ${ms(result.stats.averageMs)} average, ${result.stats.count} requests, ${result.sent.non2xx} non-2xx.`,
        );
      } else {
        void vscode.window.showWarningMessage(`${key}: ${result.note ?? 'the target did not report through this profiler'}`);
      }
    } catch (error) {
      const reason = error instanceof ChannelRefused ? error.message : `could not start the run: ${(error as Error).message}`;
      void vscode.window.showWarningMessage(`API Profiler: ${reason}`);
    } finally {
      this.running = null;
      this.changed.fire();
    }
  }

  explain(target: { method: string; route: string }): void {
    void vscode.window.showInformationMessage(
      `${target.method} ${target.route} has no recording yet. Send one real request to it (with the auth and body it needs) and the profiler will replay that request under load.`,
    );
  }

  dispose(): void {
    for (const s of this.subscriptions) {
      s.dispose();
    }
    this.changed.dispose();
  }
}
