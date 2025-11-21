import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);

// Global output channel for logging
let outputChannel: vscode.OutputChannel;

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface ComparisonMode {
  label: string;
  description: string;
  command: string | null;
  desc: string;
  type: "direct" | "custom" | "commit";
}

interface DiffOptions {
  mode: ComparisonMode;
  branchOrCommit?: string;
  workspacePath: string;
  currentBranch: string;
}

interface ChangedFile {
  path: string;
  exists: boolean;
  isBinary: boolean;
  size: number;
  content?: string;
  lineCount?: number;
}

interface ReviewerConfig {
  maxFileSize: number;
  excludePatterns: string[];
  aiModel: string;
  customPrompt?: string;
  outputDirectory: string;
  autoOpenReports: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const COMPARISON_MODES: ComparisonMode[] = [
  {
    label: "Staged changes",
    description: "git diff --cached",
    command: "--cached",
    desc: "staged changes",
    type: "direct",
  },
  {
    label: "Working directory changes",
    description: "git diff",
    command: null,
    desc: "working directory changes",
    type: "direct",
  },
  {
    label: "All changes since last commit",
    description: "git diff HEAD",
    command: "HEAD",
    desc: "all changes since last commit",
    type: "direct",
  },
  {
    label: "Compare with another branch",
    description: "Select a branch to compare with",
    command: null,
    desc: "changes compared to selected branch",
    type: "custom",
  },
  {
    label: "Compare with specific commit",
    description: "Select a commit hash to compare with",
    command: null,
    desc: "changes compared to selected commit",
    type: "commit",
  },
  {
    label: "Compare with origin/main",
    description: "git diff origin/main",
    command: "origin/main",
    desc: "changes compared to origin/main",
    type: "direct",
  },
  {
    label: "Compare with origin/master",
    description: "git diff origin/master",
    command: "origin/master",
    desc: "changes compared to origin/master",
    type: "direct",
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message: string, level: "INFO" | "ERROR" | "WARN" = "INFO"): void {
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  outputChannel.appendLine(logMessage);
  if (level === "ERROR") {
    console.error(logMessage);
  }
}

function getConfig(): ReviewerConfig {
  const config = vscode.workspace.getConfiguration("reviewer");
  return {
    maxFileSize: config.get<number>("maxFileSize") || 1048576,
    excludePatterns: config.get<string[]>("excludePatterns") || [
      "**/node_modules/**",
      "**/package-lock.json",
      "**/yarn.lock",
      "**/*.log",
    ],
    aiModel: config.get<string>("aiModel") || "gemini-3-pro-preview",
    customPrompt: config.get<string>("customPrompt"),
    outputDirectory: config.get<string>("outputDirectory") || "",
    autoOpenReports: config.get<boolean>("autoOpenReports") !== false,
  };
}

function getFileExtension(filePath: string): string {
  return path.extname(filePath).slice(1);
}

function getLanguage(filePath: string): string {
  const ext = getFileExtension(filePath);

  const languageMap: { [key: string]: string } = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    sh: "bash",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    css: "css",
    scss: "scss",
    sass: "scss",
    html: "html",
    htm: "html",
    xml: "xml",
    sql: "sql",
    md: "markdown",
    php: "php",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    go: "go",
    rb: "ruby",
    rs: "rust",
    swift: "swift",
    kt: "kotlin",
    dart: "dart",
    vue: "vue",
    r: "r",
    scala: "scala",
    clj: "clojure",
  };

  return languageMap[ext] || "text";
}

function isBinaryFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return true;
    }

    const buffer = fs.readFileSync(filePath);
    const size = Math.min(buffer.length, 8000);

    for (let i = 0; i < size; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    return false;
  } catch (error) {
    log(`Error checking if file is binary: ${error}`, "WARN");
    return true;
  }
}

function sanitizeFilename(filename: string): string {
  // Remove or replace invalid filename characters
  return filename
    .replace(/[\/\\:*?"<>|]/g, "-") // Replace invalid chars with dash
    .replace(/\.\.+/g, ".") // Replace multiple dots with single dot
    .replace(/^\.+/, "") // Remove leading dots
    .replace(/\.+$/, "") // Remove trailing dots
    .substring(0, 200); // Limit length
}

// ============================================================================
// GIT OPERATIONS (SECURE)
// ============================================================================

async function executeGitCommand(
  args: string[],
  workspacePath: string
): Promise<string> {
  try {
    log(`Executing git command: git ${args.join(" ")}`);
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspacePath,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return stdout;
  } catch (error: any) {
    log(`Git command failed: ${error.message}`, "ERROR");
    throw error;
  }
}

async function isGitRepository(workspacePath: string): Promise<boolean> {
  try {
    await executeGitCommand(["rev-parse", "--git-dir"], workspacePath);
    return true;
  } catch {
    return false;
  }
}

async function getCurrentBranch(workspacePath: string): Promise<string> {
  const output = await executeGitCommand(
    ["branch", "--show-current"],
    workspacePath
  );
  return output.trim();
}

async function branchExists(
  branchName: string,
  workspacePath: string
): Promise<boolean> {
  try {
    await executeGitCommand(
      ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
      workspacePath
    );
    return true;
  } catch {
    try {
      await executeGitCommand(
        ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branchName}`],
        workspacePath
      );
      return true;
    } catch {
      return false;
    }
  }
}

async function commitExists(
  commitHash: string,
  workspacePath: string
): Promise<boolean> {
  try {
    await executeGitCommand(["cat-file", "-e", commitHash], workspacePath);
    return true;
  } catch {
    return false;
  }
}


function buildGitDiffArgs(
  diffCommand: string | null,
  excludePatterns: string[]
): string[] {
  const args = ["diff"];

  if (diffCommand) {
    if (diffCommand === "--cached") {
      args.push("--cached");
    } else {
      args.push(diffCommand);
    }
  }

  // Add path specifications
  args.push("--", ".");

  // Add exclusion patterns
  for (const pattern of excludePatterns) {
    args.push(`:(exclude)${pattern}`);
  }

  // Exclude common binary files
  const binaryExclusions = [
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.svg",
    "**/*.ico",
    "**/*.pdf",
    "**/*.zip",
    "**/*.tar.gz",
  ];

  for (const pattern of binaryExclusions) {
    args.push(`:(exclude)${pattern}`);
  }

  return args;
}

async function getChangedFiles(
  diffCommand: string | null,
  workspacePath: string,
  excludePatterns: string[]
): Promise<string[]> {
  const args = buildGitDiffArgs(diffCommand, excludePatterns);
  args.push("--name-only");

  const output = await executeGitCommand(args, workspacePath);
  return output
    .trim()
    .split("\n")
    .filter((file) => file.length > 0);
}

async function getGitDiff(
  diffCommand: string | null,
  workspacePath: string,
  excludePatterns: string[]
): Promise<string> {
  const args = buildGitDiffArgs(diffCommand, excludePatterns);
  return await executeGitCommand(args, workspacePath);
}

// ============================================================================
// FILE PROCESSING
// ============================================================================

async function processChangedFiles(
  files: string[],
  workspacePath: string,
  maxFileSize: number
): Promise<ChangedFile[]> {
  const results: ChangedFile[] = [];

  for (const file of files) {
    const filePath = path.join(workspacePath, file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      results.push({
        path: file,
        exists: false,
        isBinary: false,
        size: 0,
      });
      continue;
    }

    // Check if binary
    if (isBinaryFile(filePath)) {
      results.push({
        path: file,
        exists: true,
        isBinary: true,
        size: 0,
      });
      continue;
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Check size limit
    if (fileSize > maxFileSize) {
      results.push({
        path: file,
        exists: true,
        isBinary: false,
        size: fileSize,
      });
      continue;
    }

    // Read content
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lineCount = content.split("\n").length;

      results.push({
        path: file,
        exists: true,
        isBinary: false,
        size: fileSize,
        content,
        lineCount,
      });
    } catch (error) {
      log(`Error reading file ${file}: ${error}`, "ERROR");
      results.push({
        path: file,
        exists: true,
        isBinary: false,
        size: fileSize,
      });
    }
  }

  return results;
}

// ============================================================================
// USER INTERACTIONS
// ============================================================================

async function selectComparisonMode(
  title: string
): Promise<ComparisonMode | undefined> {
  return await vscode.window.showQuickPick(COMPARISON_MODES, {
    placeHolder: "Select comparison mode",
    title,
  });
}

async function getDiffOptions(workspacePath: string): Promise<DiffOptions | null> {
  const currentBranch = await getCurrentBranch(workspacePath);

  const selectedMode = await selectComparisonMode(
    "Generate Comprehensive Diff Report"
  );

  if (!selectedMode) {
    return null;
  }

  let diffCommand = selectedMode.command;

  // Handle custom branch selection
  if (selectedMode.type === "custom") {
    const branchName = await vscode.window.showInputBox({
      prompt: "Enter branch name to compare with",
      placeHolder: "e.g., main, develop, feature/branch-name",
    });

    if (!branchName) {
      return null;
    }

    // Validate branch exists
    if (!(await branchExists(branchName, workspacePath))) {
      vscode.window.showErrorMessage(
        `Branch '${branchName}' not found!`,
        "View Logs"
      ).then(action => {
        if (action === "View Logs") {
          outputChannel.show();
        }
      });
      return null;
    }

    diffCommand = branchName;
  }

  // Handle specific commit selection
  if (selectedMode.type === "commit") {
    const commitHash = await vscode.window.showInputBox({
      prompt: "Enter commit hash to compare with",
      placeHolder: "e.g., abc1234, HEAD~1, or full commit hash",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter a commit hash";
        }
        if (value.trim().length < 4) {
          return "Commit hash should be at least 4 characters";
        }
        return null;
      },
    });

    if (!commitHash) {
      return null;
    }

    const trimmedCommitHash = commitHash.trim();

    // Validate commit exists
    if (!(await commitExists(trimmedCommitHash, workspacePath))) {
      vscode.window.showErrorMessage(
        `Commit '${trimmedCommitHash}' not found!`,
        "View Logs"
      ).then(action => {
        if (action === "View Logs") {
          outputChannel.show();
        }
      });
      return null;
    }

    diffCommand = trimmedCommitHash;
  }

  return {
    mode: selectedMode,
    branchOrCommit: diffCommand || undefined,
    workspacePath,
    currentBranch,
  };
}

// ============================================================================
// API KEY MANAGEMENT (SECURE)
// ============================================================================

async function getApiKey(context: vscode.ExtensionContext): Promise<string | null> {
  try {
    // Try to get from SecretStorage
    let apiKey = await context.secrets.get("reviewer.geminiApiKey");

    if (!apiKey) {
      // Prompt user for API key
      apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Gemini API Key",
        placeHolder: "AIza...",
        password: true,
        ignoreFocusOut: true,
      });

      if (!apiKey) {
        vscode.window.showErrorMessage(
          "API Key is required for AI Review. Get your key at: https://makersuite.google.com/app/apikey",
          "Get API Key"
        ).then(action => {
          if (action === "Get API Key") {
            vscode.env.openExternal(vscode.Uri.parse("https://makersuite.google.com/app/apikey"));
          }
        });
        return null;
      }

      // Save to SecretStorage
      await context.secrets.store("reviewer.geminiApiKey", apiKey);
      log("API key stored securely");
    }

    return apiKey;
  } catch (error) {
    log(`Error getting API key: ${error}`, "ERROR");
    vscode.window.showErrorMessage(
      "Failed to retrieve API key",
      "View Logs"
    ).then(action => {
      if (action === "View Logs") {
        outputChannel.show();
      }
    });
    return null;
  }
}

// ============================================================================
// AI OPERATIONS
// ============================================================================

async function callGeminiAPI(
  apiKey: string,
  prompt: string,
  model: string
): Promise<string> {
  try {
    log(`Calling Gemini API with model: ${model}`);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    log("Gemini API call successful");
    return response.text || "No response generated.";
  } catch (error: any) {
    log(`Gemini API Error: ${error.message}`, "ERROR");

    let userMessage = "Failed to get AI review.";
    if (error.message?.includes("API key")) {
      userMessage = "Invalid Gemini API key. Please check your key and try again.";
    } else if (error.message?.includes("quota") || error.message?.includes("429")) {
      userMessage = "API quota exceeded. Please try again later or check your billing.";
    } else if (error.message?.includes("model")) {
      userMessage = `Model '${model}' not found. Please update your configuration.`;
    }

    throw new Error(userMessage);
  }
}

function getDefaultReviewPrompt(currentBranch: string): string {
  return `# Review this code with senior developer standards

Feature: ${currentBranch}
Check For:
Bugs & Runtime Errors: Null refs, type errors, logic bugs, edge cases
Production Issues: Performance bottlenecks, security vulnerabilities, memory leaks
Environment Handling: Dev/UAT overrides working correctly, no production impact
Code Quality: Naming, structure, error handling, consistency
Architecture: Proper patterns, separation of concerns, maintainability

Review Format:
Analyze the entire diff/codebase and provide:

Critical Issues: [Production-breaking problems with line numbers]
High Priority: [Important fixes needed with specific locations]
Medium/Low: [Improvements and suggestions]

Final Assessment:

Status: APPROVE / NEEDS CHANGES / REJECT
Must Fix: [Critical items blocking merge]
Production Ready: Yes/No with reasoning

Instructions: Be thorough, check every line, think long-term maintainability, provide specific line numbers and concrete fixes.`;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReportPath(
  workspacePath: string,
  reportType: string,
  branchName: string,
  outputDirectory: string
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const sanitizedBranch = sanitizeFilename(branchName);
  const filename = `${reportType}_${sanitizedBranch}_${timestamp}.md`;

  if (outputDirectory && outputDirectory.trim().length > 0) {
    const fullPath = path.join(workspacePath, outputDirectory);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    return path.join(fullPath, filename);
  }

  return path.join(workspacePath, filename);
}

async function generateComprehensiveDiffReport(
  options: DiffOptions,
  config: ReviewerConfig
): Promise<string> {
  const { workspacePath, currentBranch } = options;

  // Get changed files
  const changedFiles = await getChangedFiles(
    options.branchOrCommit || null,
    workspacePath,
    config.excludePatterns
  );

  if (changedFiles.length === 0) {
    throw new Error("No changes found for the selected comparison!");
  }

  log(`Found ${changedFiles.length} changed files`);

  // Get git diff
  const gitDiff = await getGitDiff(
    options.branchOrCommit || null,
    workspacePath,
    config.excludePatterns
  );

  // Process files
  const processedFiles = await processChangedFiles(
    changedFiles,
    workspacePath,
    config.maxFileSize
  );

  // Build report
  let reportContent = `# Comprehensive Diff Report

**Generated on:** ${new Date().toLocaleString()}
**Branch:** ${currentBranch}
**Comparison:** ${options.mode.desc}

---

## Table of Contents

1. [Summary](#summary)
2. [Git Diff](#git-diff)
3. [Complete File Contents](#complete-file-contents)

---

## Summary

**Total files changed:** ${changedFiles.length}

**Changed files:**
\`\`\`
${changedFiles.join("\n")}
\`\`\`

---

## Git Diff

\`\`\`diff
${gitDiff}
\`\`\`

---

## Complete File Contents

`;

  // Add file contents
  for (const file of processedFiles) {
    reportContent += `\n### 📁 \`${file.path}\`\n\n`;

    if (!file.exists) {
      reportContent += "*This file was deleted.*\n\n";
      continue;
    }

    if (file.isBinary) {
      reportContent += "*This is a binary file and its content is not displayed.*\n\n";
      continue;
    }

    if (!file.content) {
      reportContent += `*This file is too large to display (${file.size} bytes, max: ${config.maxFileSize} bytes).*\n\n`;
      continue;
    }

    reportContent += `**Lines:** ${file.lineCount} | **Size:** ${file.size} bytes\n\n`;

    const language = getLanguage(file.path);
    reportContent += `\`\`\`${language}\n${file.content}\n\`\`\`\n\n`;
  }

  // Add footer
  reportContent += `---

*Report generated by Reviewer Extension on ${new Date().toLocaleString()}*
`;

  return reportContent;
}

// ============================================================================
// MAIN COMMANDS
// ============================================================================

async function generateComprehensiveDiff() {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspacePath) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  log("=== Starting Comprehensive Diff Generation ===");

  // Check if git repository
  if (!(await isGitRepository(workspacePath))) {
    vscode.window.showErrorMessage(
      "Not inside a Git repository!",
      "View Logs"
    ).then(action => {
      if (action === "View Logs") {
        outputChannel.show();
      }
    });
    return;
  }

  // Get diff options
  const options = await getDiffOptions(workspacePath);
  if (!options) {
    log("Diff generation cancelled by user");
    return;
  }

  const config = getConfig();

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating Comprehensive Diff Report",
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ increment: 0, message: "Analyzing changed files..." });

        if (token.isCancellationRequested) {
          log("Diff generation cancelled by user");
          return;
        }

        const reportContent = await generateComprehensiveDiffReport(options, config);

        progress.report({ increment: 90, message: "Saving report..." });

        if (token.isCancellationRequested) {
          log("Diff generation cancelled by user");
          return;
        }

        // Generate output path
        const outputPath = generateReportPath(
          workspacePath,
          "comprehensive_diff",
          options.currentBranch,
          config.outputDirectory
        );

        // Write report
        fs.writeFileSync(outputPath, reportContent, "utf8");
        log(`Report saved to: ${outputPath}`);

        progress.report({ increment: 100, message: "Done!" });

        // Show success message
        const actions = ["Open Report", "Show in Finder"];
        const result = await vscode.window.showInformationMessage(
          `Comprehensive diff report generated successfully!`,
          ...actions
        );

        if (result === "Open Report" || (config.autoOpenReports && !result)) {
          const document = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(document);
        } else if (result === "Show in Finder") {
          vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(outputPath));
        }
      } catch (error: any) {
        log(`Failed to generate comprehensive diff: ${error.message}`, "ERROR");
        vscode.window.showErrorMessage(
          error.message || "Failed to generate comprehensive diff",
          "View Logs"
        ).then(action => {
          if (action === "View Logs") {
            outputChannel.show();
          }
        });
      }
    }
  );
}

async function generateAIReview(context: vscode.ExtensionContext) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspacePath) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  log("=== Starting AI Review Generation ===");

  // Check if git repository
  if (!(await isGitRepository(workspacePath))) {
    vscode.window.showErrorMessage(
      "Not inside a Git repository!",
      "View Logs"
    ).then(action => {
      if (action === "View Logs") {
        outputChannel.show();
      }
    });
    return;
  }

  // Get API key
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    return;
  }

  // Get diff options
  const options = await getDiffOptions(workspacePath);
  if (!options) {
    log("AI review cancelled by user");
    return;
  }

  const config = getConfig();

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating AI Review",
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({ increment: 0, message: "Analyzing changed files..." });

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        // Get changed files
        const changedFiles = await getChangedFiles(
          options.branchOrCommit || null,
          workspacePath,
          config.excludePatterns
        );

        if (changedFiles.length === 0) {
          vscode.window.showInformationMessage(
            "No changes found for the selected comparison!"
          );
          return;
        }

        log(`Found ${changedFiles.length} changed files for AI review`);
        progress.report({ increment: 10, message: `Found ${changedFiles.length} changed files...` });

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        // Get git diff
        progress.report({ increment: 20, message: "Generating git diff..." });
        const gitDiff = await getGitDiff(
          options.branchOrCommit || null,
          workspacePath,
          config.excludePatterns
        );

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        // Process files
        progress.report({ increment: 30, message: "Processing file contents..." });
        const processedFiles = await processChangedFiles(
          changedFiles,
          workspacePath,
          config.maxFileSize
        );

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        // Build content for AI
        let codeContent = "## Git Diff\n\n" + gitDiff + "\n\n## File Contents\n\n";

        for (const file of processedFiles) {
          codeContent += `\n### File: ${file.path}\n\n`;

          if (!file.exists) {
            codeContent += "(File deleted)\n";
          } else if (file.isBinary) {
            codeContent += "(Binary file)\n";
          } else if (!file.content) {
            codeContent += `(File too large: ${file.size} bytes)\n`;
          } else {
            codeContent += file.content + "\n";
          }
        }

        progress.report({ increment: 50, message: "Sending to Gemini AI..." });

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        // Get prompt
        const prompt = config.customPrompt || getDefaultReviewPrompt(options.currentBranch);
        const fullPrompt = `${prompt}\n\n${codeContent}`;

        // Call AI
        const aiResponse = await callGeminiAPI(apiKey, fullPrompt, config.aiModel);

        if (token.isCancellationRequested) {
          log("AI review cancelled by user");
          return;
        }

        progress.report({ increment: 90, message: "Saving report..." });

        // Generate output path
        const outputPath = generateReportPath(
          workspacePath,
          "ai_review",
          options.currentBranch,
          config.outputDirectory
        );

        // Build report
        const reportContent = `# AI Code Review Report

**Generated on:** ${new Date().toLocaleString()}
**Branch:** ${options.currentBranch}
**Comparison:** ${options.mode.desc}
**AI Model:** ${config.aiModel}

---

${aiResponse}

---

*Report generated by Reviewer Extension using Gemini AI*
`;

        // Write report
        fs.writeFileSync(outputPath, reportContent, "utf8");
        log(`AI review saved to: ${outputPath}`);

        progress.report({ increment: 100, message: "Done!" });

        // Show success message
        const actions = ["Open Review", "Show in Finder"];
        const result = await vscode.window.showInformationMessage(
          `AI Review generated successfully!`,
          ...actions
        );

        if (result === "Open Review" || (config.autoOpenReports && !result)) {
          const document = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(document);
        } else if (result === "Show in Finder") {
          vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(outputPath));
        }
      } catch (error: any) {
        log(`Failed to generate AI review: ${error.message}`, "ERROR");
        vscode.window.showErrorMessage(
          error.message || "Failed to generate AI review",
          "View Logs"
        ).then(action => {
          if (action === "View Logs") {
            outputChannel.show();
          }
        });
      }
    }
  );
}

// ============================================================================
// EXTENSION LIFECYCLE
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  // Initialize output channel
  outputChannel = vscode.window.createOutputChannel("Reviewer");
  context.subscriptions.push(outputChannel);

  log("=== Reviewer Extension Activated ===");
  log(`Version: 0.0.1`);
  log(`Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "None"}`);

  // Create status bar button
  const comprehensiveDiffButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    96
  );
  comprehensiveDiffButton.text = "$(diff) Comprehensive Diff";
  comprehensiveDiffButton.command = "reviewer.generateComprehensiveDiff";
  comprehensiveDiffButton.tooltip = "Generate comprehensive diff report with full file contents";
  comprehensiveDiffButton.show();

  // Register commands
  const generateComprehensiveDiffCommand = vscode.commands.registerCommand(
    "reviewer.generateComprehensiveDiff",
    async () => {
      await generateComprehensiveDiff();
    }
  );

  const generateAIReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateAIReview",
    async () => {
      await generateAIReview(context);
    }
  );

  const clearApiKeyCommand = vscode.commands.registerCommand(
    "reviewer.clearApiKey",
    async () => {
      await context.secrets.delete("reviewer.geminiApiKey");
      vscode.window.showInformationMessage("API key cleared successfully");
      log("API key cleared by user");
    }
  );

  const showLogsCommand = vscode.commands.registerCommand(
    "reviewer.showLogs",
    () => {
      outputChannel.show();
    }
  );

  // Add to subscriptions
  context.subscriptions.push(comprehensiveDiffButton);
  context.subscriptions.push(generateComprehensiveDiffCommand);
  context.subscriptions.push(generateAIReviewCommand);
  context.subscriptions.push(clearApiKeyCommand);
  context.subscriptions.push(showLogsCommand);

  log("All commands registered successfully");
}

export function deactivate() {
  log("=== Reviewer Extension Deactivated ===");
  if (outputChannel) {
    outputChannel.dispose();
  }
}
