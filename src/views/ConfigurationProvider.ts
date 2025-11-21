import * as vscode from "vscode";
import { BaseNode, ActionNode, CategoryNode } from "./nodes/BaseNode";

export class ConfigurationProvider implements vscode.TreeDataProvider<BaseNode> {
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

  private getRootItems(): BaseNode[] {
    const config = vscode.workspace.getConfiguration("reviewer");
    const provider = config.get<string>("aiProvider") || "gemini";
    const geminiModel = config.get<string>("aiModel") || "gemini-3-pro-preview";
    const openRouterModel = config.get<string>("openRouterModel") || "openai/gpt-4o";

    return [
      // AI Provider Section
      new CategoryNode(
        "AI Provider",
        [
          new ActionNode(
            `Current: ${provider}`,
            {
              command: "reviewer.switchProvider",
              title: "Switch Provider"
            },
            new vscode.ThemeIcon(provider === "gemini" ? "star" : "globe"),
            "Click to change provider"
          )
        ],
        new vscode.ThemeIcon("hubot")
      ),

      // Model Configuration
      new CategoryNode(
        "Model Configuration",
        [
          new ActionNode(
            provider === "gemini" ? `Gemini: ${geminiModel}` : `OpenRouter: ${openRouterModel}`,
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: [`@ext:reviewer reviewer.${provider === "gemini" ? "aiModel" : "openRouterModel"}`]
            },
            new vscode.ThemeIcon("settings-gear"),
            "Click to change model"
          )
        ],
        new vscode.ThemeIcon("gear")
      ),

      // API Keys
      new CategoryNode(
        "API Keys",
        [
          new ActionNode(
            "Setup/Change API Keys",
            {
              command: "reviewer.setupApiKeys",
              title: "Setup API Keys"
            },
            new vscode.ThemeIcon("key"),
            "Configure API credentials"
          ),
          new ActionNode(
            "Clear All API Keys",
            {
              command: "reviewer.clearApiKey",
              title: "Clear API Keys"
            },
            new vscode.ThemeIcon("trash"),
            "Remove stored credentials"
          )
        ],
        new vscode.ThemeIcon("lock")
      ),

      // File Settings
      new CategoryNode(
        "File Settings",
        [
          new ActionNode(
            `Max Size: ${this.formatBytes(config.get<number>("maxFileSize") || 1048576)}`,
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: ["@ext:reviewer reviewer.maxFileSize"]
            },
            new vscode.ThemeIcon("file"),
            "Maximum file size to include"
          ),
          new ActionNode(
            "Exclude Patterns",
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: ["@ext:reviewer reviewer.excludePatterns"]
            },
            new vscode.ThemeIcon("exclude"),
            "Configure file exclusion patterns"
          ),
          new ActionNode(
            `Output Directory: ${config.get<string>("outputDirectory") || "workspace root"}`,
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: ["@ext:reviewer reviewer.outputDirectory"]
            },
            new vscode.ThemeIcon("folder"),
            "Set custom output directory"
          )
        ],
        new vscode.ThemeIcon("files")
      ),

      // Advanced Settings
      new CategoryNode(
        "Advanced",
        [
          new ActionNode(
            "Custom Prompt",
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: ["@ext:reviewer reviewer.customPrompt"]
            },
            new vscode.ThemeIcon("edit"),
            "Set custom AI review prompt"
          ),
          new ActionNode(
            `Auto-open Reports: ${config.get<boolean>("autoOpenReports") ? "On" : "Off"}`,
            {
              command: "workbench.action.openSettings",
              title: "Open Settings",
              arguments: ["@ext:reviewer reviewer.autoOpenReports"]
            },
            new vscode.ThemeIcon(config.get<boolean>("autoOpenReports") ? "eye" : "eye-closed"),
            "Toggle automatic report opening"
          ),
          new ActionNode(
            "Show Logs",
            {
              command: "reviewer.showLogs",
              title: "Show Logs"
            },
            new vscode.ThemeIcon("output"),
            "View extension logs"
          )
        ],
        new vscode.ThemeIcon("settings")
      )
    ];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i)) + " " + sizes[i];
  }
}