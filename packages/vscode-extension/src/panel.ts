import * as vscode from 'vscode';
import { newLiveState, Thresholds } from 'api-profiler';
import type { Connection } from './connection';
import { buildPanel, Row, Section } from './rows';

type Node = { kind: 'section'; section: Section } | { kind: 'row'; row: Row } | { kind: 'message'; text: string; detail?: string };

export class RoutesPanel implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private live = newLiveState();

  constructor(
    private readonly connection: Connection,
    private readonly thresholds: () => Thresholds,
  ) {
    connection.onChange(() => this.changed.fire(undefined));
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
        item.tooltip = new vscode.MarkdownString(node.row.tooltip);
        item.contextValue = node.row.stale ? 'stale-route' : 'route';
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
