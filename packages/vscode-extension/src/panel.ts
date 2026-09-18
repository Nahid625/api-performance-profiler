import * as vscode from 'vscode';
import { newLiveState, Thresholds } from 'api-profiler';
import type { Connection } from './connection';
import type { RouteIndex } from './routeIndex';
import { buildPanel, Row, Section } from './rows';

type Node = { kind: 'section'; section: Section } | { kind: 'row'; row: Row } | { kind: 'message'; text: string; detail?: string };

export class RoutesPanel implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private live = newLiveState();

  constructor(
    private readonly connection: Connection,
    private readonly index: RouteIndex,
    private readonly thresholds: () => Thresholds,
  ) {
    connection.onChange(() => this.changed.fire(undefined));
    index.onDidChange(() => this.changed.fire(undefined));
  }

  forget(): void {
    this.live = newLiveState();
    this.changed.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'section': {
        const item = new vscode.TreeItem(node.section.title, vscode.TreeItemCollapsibleState.Expanded);
        item.contextValue = 'section';
        return item;
      }
      case 'row': {
        const item = new vscode.TreeItem(node.row.label);
        item.id = node.row.key;
        item.description = node.row.description;
        item.contextValue = node.row.stale ? 'stale-route' : 'route';
        const location = this.index.find(node.row.method, node.row.route);
        if (location) {
          const where = vscode.workspace.asRelativePath(location.file);
          const note = location.prefixKnown ? '' : ' (mount prefix unknown, matched by path tail)';
          item.tooltip = new vscode.MarkdownString(`${node.row.tooltip}\n\nDefined in ${where}:${location.line}${note}`);
          item.command = {
            command: 'vscode.open',
            title: 'Open route',
            arguments: [vscode.Uri.file(location.file), { selection: new vscode.Range(location.line - 1, 0, location.line - 1, 0) }],
          };
        } else {
          item.tooltip = new vscode.MarkdownString(`${node.row.tooltip}\n\nSource not found in this workspace`);
        }
        return item;
      }
      case 'message': {
        const item = new vscode.TreeItem(node.text);
        item.description = node.detail;
        item.tooltip = node.detail;
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (node?.kind === 'section') {
      return node.section.rows.map((row) => ({ kind: 'row', row }));
    }
    if (node) {
      return [];
    }
    const panel = buildPanel(this.connection.state, this.live, this.thresholds(), Date.now());
    if (panel.kind === 'message') {
      return [{ kind: 'message', text: panel.text, detail: panel.detail }];
    }
    return panel.sections.map((section) => ({ kind: 'section', section }));
  }
}
