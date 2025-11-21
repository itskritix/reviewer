import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { BaseNode } from "./nodes/BaseNode";

interface ReviewReport {
  id: string;
  filename: string;
  path: string;
  type: "diff" | "ai_review";
  timestamp: Date;
  branch: string;
  aiProvider?: string;
  aiModel?: string;
}

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

  constructor(private context: vscode.ExtensionContext) {
    this.loadReports();
  }

  refresh(): void {
    this.loadReports();
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

  private loadReports(): void {
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!workspacePath) {
        this.reports = [];
        return;
      }

      // Look for report files in workspace
      const reportFiles = this.findReportFiles(workspacePath);
      this.reports = reportFiles.map(file => this.parseReportFile(file));
    } catch (error) {
      console.error("Failed to load reports:", error);
      this.reports = [];
    }
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

  private parseReportFile(filePath: string): ReviewReport {
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

    return {
      id: filename,
      filename: filename,
      path: filePath,
      type,
      timestamp: stats.mtime,
      branch,
      aiProvider: undefined, // Could be parsed from file content
      aiModel: undefined
    };
  }

  public addReport(reportPath: string): void {
    const report = this.parseReportFile(reportPath);
    this.reports.unshift(report); // Add to beginning
    this.refresh();
  }

  public deleteReport(report: ReviewReport): void {
    try {
      fs.unlinkSync(report.path);
      this.reports = this.reports.filter(r => r.id !== report.id);
      this.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete report: ${error}`);
    }
  }
}