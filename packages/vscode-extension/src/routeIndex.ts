import * as vscode from 'vscode';
import { discoverRoutes, matchRoute, RouteLocation, SourceFileInput, usesProfiler } from './discover';

const SOURCES = '**/*.{js,ts,mjs,cjs}';
const IGNORED = '{**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**,**/*.d.ts,**/*.test.*,**/*.spec.*}';
const MAX_FILES = 2000;
const MAX_BYTES = 512 * 1024;

// Keeps the file:line of every route declared in the workspace, rescanning after saves.
export class RouteIndex implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private locations: RouteLocation[] = [];
  private wired = false;
  private timer: NodeJS.Timeout | null = null;
  private scanning: Promise<void> | null = null;
  private dirty = false;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(SOURCES);
    this.subscriptions.push(
      watcher,
      watcher.onDidCreate(() => this.schedule()),
      watcher.onDidDelete(() => this.schedule()),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (/\.(js|ts|mjs|cjs)$/.test(doc.fileName)) {
          this.schedule();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule()),
    );
    this.schedule(0);
  }

  all(): RouteLocation[] {
    return this.locations;
  }

  // Whether some file in the workspace calls app.use(profiler()).
  middlewareWired(): boolean {
    return this.wired;
  }

  find(method: string, route: string): RouteLocation | undefined {
    return matchRoute(this.locations, method, route);
  }

  refresh(): Promise<void> {
    return this.scan();
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const s of this.subscriptions) {
      s.dispose();
    }
    this.changed.dispose();
  }

  private schedule(delay = 500): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.scan();
    }, delay);
  }

  // A save during a scan marks it dirty so one more scan follows; scans never overlap.
  private scan(): Promise<void> {
    if (this.scanning) {
      this.dirty = true;
      return this.scanning;
    }
    this.scanning = this.run().finally(() => {
      this.scanning = null;
      if (this.dirty) {
        this.dirty = false;
        this.schedule(0);
      }
    });
    return this.scanning;
  }

  private async run(): Promise<void> {
    const uris = await vscode.workspace.findFiles(SOURCES, IGNORED, MAX_FILES);
    const files: SourceFileInput[] = [];
    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength <= MAX_BYTES) {
          files.push({ path: uri.fsPath, text: Buffer.from(bytes).toString('utf8') });
        }
      } catch {
        // unreadable file: skip it
      }
    }
    this.locations = discoverRoutes(files);
    this.wired = files.some((f) => usesProfiler(f.text));
    this.changed.fire();
  }
}
