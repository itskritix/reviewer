import * as vscode from "vscode";
import { BaseNode, CategoryNode } from "./nodes/BaseNode";

interface GitStatus {
  currentBranch: string;
  changedFiles: number;
  stagedFiles: number;
  isGitRepo: boolean;
}

export class DashboardProvider implements vscode.TreeDataProvider<BaseNode> {
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
      return this.getRootItems();
    }
    return element.getChildren();
  }

  private async getRootItems(): Promise<BaseNode[]> {
    const gitStatus = await this.getGitStatus();
    const config = this.getReviewerConfig();

    const items: BaseNode[] = [];

    // Repository Status
    const repoStatus = new CategoryNode(
      "Repository Status",
      [],
      new vscode.ThemeIcon("repo")
    );

    if (gitStatus.isGitRepo) {
      repoStatus.description = `${gitStatus.currentBranch} • ${gitStatus.changedFiles} changed`;
      repoStatus.tooltip = `Branch: ${gitStatus.currentBranch}\nChanged files: ${gitStatus.changedFiles}\nStaged files: ${gitStatus.stagedFiles}`;
    } else {
      repoStatus.description = "Not a Git repository";
      repoStatus.tooltip = "Initialize Git to use review features";
    }
    items.push(repoStatus);

    // AI Configuration
    const aiConfig = new CategoryNode(
      "AI Configuration",
      [],
      new vscode.ThemeIcon("hubot")
    );
    aiConfig.description = `${config.provider} (${config.model})`;
    aiConfig.tooltip = `Provider: ${config.provider}\nModel: ${config.model}`;
    items.push(aiConfig);

    // Quick Stats
    const stats = new CategoryNode(
      "Quick Stats",
      [],
      new vscode.ThemeIcon("graph")
    );
    const reportsCount = await this.getReportsCount();
    stats.description = `${reportsCount} reports generated`;
    stats.tooltip = `Total reports generated: ${reportsCount}`;
    items.push(stats);

    return items;
  }

  private async getGitStatus(): Promise<GitStatus> {
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!workspacePath) {
        return { currentBranch: "", changedFiles: 0, stagedFiles: 0, isGitRepo: false };
      }

      // For now, return mock data. This would be replaced with actual git status checking
      return {
        currentBranch: "main",
        changedFiles: 5,
        stagedFiles: 2,
        isGitRepo: true
      };
    } catch (error) {
      return { currentBranch: "", changedFiles: 0, stagedFiles: 0, isGitRepo: false };
    }
  }

  private getReviewerConfig() {
    const config = vscode.workspace.getConfiguration("reviewer");
    const provider = config.get<string>("aiProvider") || "gemini";
    let model = "";

    if (provider === "openrouter") {
      model = config.get<string>("openRouterModel") || "openai/gpt-4o";
    } else {
      model = config.get<string>("aiModel") || "gemini-3-pro-preview";
    }

    return { provider, model };
  }

  private async getReportsCount(): Promise<number> {
    // This would read from workspace state or file system
    // For now, return a placeholder
    return 3;
  }
}