import * as vscode from "vscode";
import { BaseNode, ActionNode } from "./nodes/BaseNode";

export class QuickActionsProvider implements vscode.TreeDataProvider<BaseNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseNode | undefined | null | void> =
    new vscode.EventEmitter<BaseNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BaseNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BaseNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BaseNode): Promise<BaseNode[]> {
    if (!element) {
      return this.getRootActions();
    }
    return element.getChildren();
  }

  private getRootActions(): BaseNode[] {
    return [
      new ActionNode(
        "Generate Comprehensive Diff",
        {
          command: "reviewer.generateComprehensiveDiff",
          title: "Generate Comprehensive Diff",
        },
        new vscode.ThemeIcon("diff"),
        "Create detailed diff report"
      ),
      new ActionNode(
        "Generate AI Review",
        {
          command: "reviewer.generateAIReview",
          title: "Generate AI Review",
        },
        new vscode.ThemeIcon("hubot"),
        "Get AI-powered code review"
      ),
      new ActionNode(
        "Setup API Keys",
        {
          command: "reviewer.setupApiKeys",
          title: "Setup API Keys",
        },
        new vscode.ThemeIcon("key"),
        "Configure AI provider credentials"
      ),
      new ActionNode(
        "Switch AI Provider",
        {
          command: "reviewer.switchProvider",
          title: "Switch AI Provider",
        },
        new vscode.ThemeIcon("arrow-swap"),
        "Change between Gemini and OpenRouter"
      ),
      new ActionNode(
        "Clear API Keys",
        {
          command: "reviewer.clearApiKey",
          title: "Clear API Keys",
        },
        new vscode.ThemeIcon("trash"),
        "Remove stored credentials"
      ),
    ];
  }
}