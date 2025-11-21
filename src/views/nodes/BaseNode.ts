import * as vscode from "vscode";

export abstract class BaseNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string
  ) {
    super(label, collapsibleState);
  }

  abstract getChildren(): Promise<BaseNode[]>;
}

export class ActionNode extends BaseNode {
  constructor(
    label: string,
    public readonly command: vscode.Command,
    public readonly iconPath?: vscode.ThemeIcon | string,
    public readonly description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None, "action");
    this.command = command;
    this.iconPath = iconPath;
    this.description = description;
    this.tooltip = description || label;
  }

  async getChildren(): Promise<BaseNode[]> {
    return [];
  }
}

export class CategoryNode extends BaseNode {
  constructor(
    label: string,
    public readonly children: BaseNode[] = [],
    public readonly iconPath?: vscode.ThemeIcon | string
  ) {
    super(
      label,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
      "category"
    );
    this.iconPath = iconPath;
  }

  async getChildren(): Promise<BaseNode[]> {
    return this.children;
  }
}