/**
 * TreeViewProvider - Sidebar navigation for DevArk
 *
 * Provides a tree view in the sidebar with navigation items:
 * - Menu (opens Menu panel)
 * - Co-Pilot (opens Co-Pilot panel)
 */

import * as vscode from 'vscode';

export class TreeViewProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor() {}

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get the tree item representation
   */
  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get the children of a tree item
   */
  getChildren(element?: TreeItem): Thenable<TreeItem[]> {
    if (element) {
      // No nested items for now
      return Promise.resolve([]);
    } else {
      // Root level items
      return Promise.resolve(this.getRootItems());
    }
  }

  /**
   * Get root level items
   */
  private getRootItems(): TreeItem[] {
    return [
      new TreeItem(
        'Open DevArk',
        'Open the DevArk dashboard (Co-Pilot & Reports)',
        vscode.TreeItemCollapsibleState.None,
        'devark.showMenu',
        new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.purple'))
      )
    ];
  }
}

/**
 * TreeItem - Represents an item in the tree view
 */
class TreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly tooltip: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly commandId: string,
    public readonly iconPath: vscode.ThemeIcon
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
    this.iconPath = iconPath;

    // Set the command to execute when the item is clicked
    this.command = {
      command: commandId,
      title: label,
      arguments: []
    };
  }

  // Context value for when clauses in package.json
  contextValue = 'vibeLogItem';
}
