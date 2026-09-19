import * as vscode from 'vscode';
import { buildInline, buildSetupInline, InlineItem, normalize } from './inline';
import type { RoutesPanel } from './panel';
import type { RouteIndex } from './routeIndex';

// Paints "🟢 84.0ms · live" after each route line in every visible editor.
export class InlineDecorations implements vscode.Disposable {
  private readonly live = vscode.window.createTextEditorDecorationType({
    after: { margin: '0 0 0 2em', color: new vscode.ThemeColor('editorCodeLens.foreground') },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly stale = vscode.window.createTextEditorDecorationType({
    after: { margin: '0 0 0 2em', color: new vscode.ThemeColor('disabledForeground') },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly panel: RoutesPanel,
    private readonly index: RouteIndex,
    private readonly enabled: () => boolean,
  ) {
    this.subscriptions.push(
      panel.onDidChangeTreeData(() => this.refresh()),
      index.onDidChange(() => this.refresh()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()),
    );
    this.refresh();
  }

  refresh(): void {
    const items = this.enabled() ? this.items() : new Map<string, InlineItem[]>();
    for (const editor of vscode.window.visibleTextEditors) {
      const forFile = items.get(normalize(editor.document.uri.fsPath)) ?? [];
      editor.setDecorations(this.live, this.options(editor, forFile.filter((i: InlineItem) => !i.stale)));
      editor.setDecorations(this.stale, this.options(editor, forFile.filter((i: InlineItem) => i.stale)));
    }
  }

  private items(): Map<string, InlineItem[]> {
    const panel = this.panel.snapshot();
    if (panel.kind === 'message') {
      return panel.setup ? buildSetupInline(this.index.all()) : new Map();
    }
    return buildInline(panel, (m, r) => this.index.find(m, r));
  }

  dispose(): void {
    for (const s of this.subscriptions) {
      s.dispose();
    }
    this.live.dispose();
    this.stale.dispose();
  }

  private options(editor: vscode.TextEditor, items: InlineItem[]): vscode.DecorationOptions[] {
    const out: vscode.DecorationOptions[] = [];
    for (const item of items) {
      // The file may have changed since the last scan; never decorate a line that no longer exists.
      if (item.line < 1 || item.line > editor.document.lineCount) {
        continue;
      }
      const hover = new vscode.MarkdownString(item.hover);
      hover.isTrusted = { enabledCommands: ['apiProfiler.install', 'apiProfiler.addMiddleware'] };
      out.push({
        range: editor.document.lineAt(item.line - 1).range,
        renderOptions: { after: { contentText: item.text } },
        hoverMessage: hover,
      });
    }
    return out;
  }
}
