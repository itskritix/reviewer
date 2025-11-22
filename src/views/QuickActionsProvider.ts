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
        "🔍 AI Review (Choose Type)",
        {
          command: "reviewer.generateAIReview",
          title: "Generate AI Review",
        },
        new vscode.ThemeIcon("hubot"),
        "Get AI-powered code review with type selection"
      ),
      new ActionNode(
        "🔍 Comprehensive Review",
        {
          command: "reviewer.generateComprehensiveReview",
          title: "Generate Comprehensive Review",
        },
        new vscode.ThemeIcon("checklist"),
        "Full analysis: Security, Performance, Architecture, Testing, Docs"
      ),
      new ActionNode(
        "🛡️ Security Review",
        {
          command: "reviewer.generateSecurityReview",
          title: "Generate Security Review",
        },
        new vscode.ThemeIcon("shield"),
        "Focus on security vulnerabilities and best practices"
      ),
      new ActionNode(
        "⚡ Performance Review",
        {
          command: "reviewer.generatePerformanceReview",
          title: "Generate Performance Review",
        },
        new vscode.ThemeIcon("dashboard"),
        "Analyze performance bottlenecks and optimizations"
      ),
      new ActionNode(
        "🏗️ Architecture Review",
        {
          command: "reviewer.generateArchitectureReview",
          title: "Generate Architecture Review",
        },
        new vscode.ThemeIcon("organization"),
        "Review design patterns and code structure"
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