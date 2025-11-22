import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { BaseNode } from "./nodes/BaseNode";
import { ReviewStorage, ReviewMetadata } from "../storage/ReviewStorage";

// Alias for backward compatibility
type ReviewReport = ReviewMetadata;

export class ReportNode extends BaseNode {
  constructor(public readonly report: ReviewReport) {
    super(
      report.filename,
      vscode.TreeItemCollapsibleState.None,
      "report"
    );

    this.description = `${report.branch} • ${this.formatDate(report.timestamp)}`;
    this.tooltip = `Type: ${report.type === 'ai_review' ? 'AI Review' : 'Diff Report'}\nBranch: ${report.branch}\nGenerated: ${report.timestamp.toLocaleString()}`;

    if (report.type === "ai_review") {
      this.iconPath = new vscode.ThemeIcon("hubot");
    } else {
      this.iconPath = new vscode.ThemeIcon("diff");
    }

    // Add command to open the report
    this.command = {
      command: "reviewer.openReport",
      title: "Open Report",
      arguments: [this.report]
    };
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  async getChildren(): Promise<BaseNode[]> {
    return [];
  }
}

export class HistoryProvider implements vscode.TreeDataProvider<BaseNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<BaseNode | undefined | null | void> =
    new vscode.EventEmitter<BaseNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BaseNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private reports: ReviewReport[] = [];
  private storage: ReviewStorage;

  constructor(private context: vscode.ExtensionContext) {
    this.storage = new ReviewStorage(context);
    this.loadReports();
  }

  async refresh(): Promise<void> {
    await this.loadReports();
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

  private getRootItems(): BaseNode[] {
    return this.reports
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .map(report => new ReportNode(report));
  }

  private async loadReports(): Promise<void> {
    try {
      // Load from persistent storage
      this.reports = await this.storage.getAllReviews();

      // Also scan workspace for any new files not in storage
      await this.syncWorkspaceReports();
    } catch (error) {
      console.error("Failed to load reports:", error);
      this.reports = [];
    }
  }

  /**
   * Sync workspace reports with storage
   */
  private async syncWorkspaceReports(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!workspacePath) return;

    const reportFiles = this.findReportFiles(workspacePath);
    const storedPaths = new Set(this.reports.map(r => r.path));

    for (const filePath of reportFiles) {
      if (!storedPaths.has(filePath)) {
        // New file found, add to storage
        const reportData = this.parseReportFile(filePath);
        await this.storage.saveReview(reportData);
      }
    }

    // Reload after sync
    this.reports = await this.storage.getAllReviews();
  }

  private findReportFiles(workspacePath: string): string[] {
    const files: string[] = [];

    try {
      const workspaceFiles = fs.readdirSync(workspacePath);
      for (const file of workspaceFiles) {
        if (file.match(/^(comprehensive_diff|ai_review)_.*\.md$/)) {
          files.push(path.join(workspacePath, file));
        }
      }

      // Also check custom output directory if configured
      const config = vscode.workspace.getConfiguration("reviewer");
      const outputDir = config.get<string>("outputDirectory");
      if (outputDir && outputDir.trim().length > 0) {
        const fullOutputPath = path.join(workspacePath, outputDir);
        if (fs.existsSync(fullOutputPath)) {
          const outputFiles = fs.readdirSync(fullOutputPath);
          for (const file of outputFiles) {
            if (file.match(/^(comprehensive_diff|ai_review)_.*\.md$/)) {
              files.push(path.join(fullOutputPath, file));
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to scan for report files:", error);
    }

    return files.slice(0, 20); // Limit to most recent 20 reports
  }

  private parseReportFile(filePath: string): Omit<ReviewReport, 'id' | 'timestamp'> {
    const filename = path.basename(filePath);
    const stats = fs.statSync(filePath);

    // Parse filename to extract info
    const isAiReview = filename.startsWith("ai_review_");
    const type = isAiReview ? "ai_review" : "diff";

    // Extract branch name from filename
    // Format: ai_review_branch-name_2025-01-21T10-30-00.md
    const parts = filename.split("_");
    let branch = "unknown";
    if (parts.length >= 3) {
      branch = parts[1];
    }

    // Get repository name from workspace
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    const repository = workspacePath ? path.basename(workspacePath) : 'unknown';

    // Parse file content for additional metadata
    let aiProvider: string | undefined;
    let aiModel: string | undefined;
    let summary: string | undefined;
    let fileCount = 0;
    let linesAdded = 0;
    let linesDeleted = 0;

    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Extract AI provider and model
      const providerMatch = content.match(/\*\*AI Provider\*\*: (.+)/);
      if (providerMatch) {
        aiProvider = providerMatch[1].trim();
      }

      const modelMatch = content.match(/\*\*Model\*\*: (.+)/);
      if (modelMatch) {
        aiModel = modelMatch[1].trim();
      }

      // Extract summary (first 200 characters of the review)
      const summaryMatch = content.match(/## (?:Review|Summary)[\s\S]*?\n\n([\s\S]{1,200})/);
      if (summaryMatch) {
        summary = summaryMatch[1].trim().replace(/\n/g, ' ').substring(0, 200);
      }

      // Extract file count and line changes
      const fileCountMatch = content.match(/(\d+) files? changed/i);
      if (fileCountMatch) {
        fileCount = parseInt(fileCountMatch[1]);
      }

      const linesMatch = content.match(/\+(\d+) -(\d+) lines/);
      if (linesMatch) {
        linesAdded = parseInt(linesMatch[1]);
        linesDeleted = parseInt(linesMatch[2]);
      }
    } catch (error) {
      console.error('Failed to parse file content:', error);
    }

    return {
      filename: filename,
      path: filePath,
      type,
      branch,
      repository,
      aiProvider,
      aiModel,
      summary,
      fileCount,
      linesAdded,
      linesDeleted,
      tags: [] // Could be extracted from content or user-defined
    };
  }

  public async addReport(reportPath: string): Promise<void> {
    const reportData = this.parseReportFile(reportPath);
    await this.storage.saveReview(reportData);
    await this.refresh();
  }

  public async deleteReport(report: ReviewReport): Promise<void> {
    try {
      await this.storage.deleteReview(report.id);
      await this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete report: ${error}`);
    }
  }

  /**
   * Get review statistics for dashboard
   */
  public async getStatistics() {
    return this.storage.getReviewStatistics();
  }

  /**
   * Search reviews
   */
  public async searchReviews(query: string): Promise<ReviewReport[]> {
    return this.storage.searchReviews(query);
  }

  /**
   * Export reviews
   */
  public async exportReviews(filePath: string, filters?: any): Promise<void> {
    return this.storage.exportReviews(filePath, filters);
  }

  /**
   * Import reviews
   */
  public async importReviews(filePath: string): Promise<number> {
    const imported = await this.storage.importReviews(filePath);
    await this.refresh();
    return imported;
  }

  /**
   * Clear all reviews
   */
  public async clearAllReviews(): Promise<void> {
    await this.storage.clearAllReviews();
    await this.refresh();
  }
}