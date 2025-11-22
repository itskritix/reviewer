import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

// Import view providers
import { QuickActionsProvider } from "./views/QuickActionsProvider";
import { DashboardProvider } from "./views/DashboardProvider";
import { HistoryProvider } from "./views/HistoryProvider";
import { ConfigurationProvider } from "./views/ConfigurationProvider";

// Import enhanced prompt system
import { PromptManager, ProjectContext, ReviewFocus, ReviewDepth } from "./prompts/PromptManager";

// Review type selection interface
interface ReviewTypeOption {
  label: string;
  description: string;
  focus: ReviewFocus;
  depth: ReviewDepth;
  icon: string;
}

// Import CI integration
import { CIIntegration } from "./integrations/CIIntegration";

// Import interactive review panel
import { InteractiveReviewPanel, ReviewData } from "./views/InteractiveReviewPanel";
import { ReviewParser } from "./parsers/ReviewParser";
import { ReviewStorage, ReviewMetadata } from "./storage/ReviewStorage";

const execFileAsync = promisify(execFile);

// Global output channel for logging
let outputChannel: vscode.OutputChannel;

// Global view providers
let historyProvider: any;

// Global prompt system
let promptManager: PromptManager;

// Global CI integration
let ciIntegration: CIIntegration;

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
  aiProvider: string;
  aiModel: string;
  openRouterModel: string;
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
    aiProvider: config.get<string>("aiProvider") || "gemini",
    aiModel: config.get<string>("aiModel") || "gemini-3-pro-preview",
    openRouterModel: config.get<string>("openRouterModel") || "openai/gpt-4o",
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

async function getApiKey(context: vscode.ExtensionContext, provider: string): Promise<string | null> {
  try {
    const keyName = provider === "openrouter" ? "reviewer.openRouterApiKey" : "reviewer.geminiApiKey";
    const providerName = provider === "openrouter" ? "OpenRouter" : "Gemini";
    const placeholder = provider === "openrouter" ? "sk-or-v1-..." : "AIza...";
    const apiUrl = provider === "openrouter"
      ? "https://openrouter.ai/settings/keys"
      : "https://makersuite.google.com/app/apikey";

    // Try to get from SecretStorage
    let apiKey = await context.secrets.get(keyName);

    if (!apiKey) {
      // Prompt user for API key
      apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${providerName} API Key`,
        placeHolder: placeholder,
        password: true,
        ignoreFocusOut: true,
      });

      if (!apiKey) {
        vscode.window.showErrorMessage(
          `API Key is required for AI Review. Get your ${providerName} key at: ${apiUrl}`,
          "Get API Key"
        ).then(action => {
          if (action === "Get API Key") {
            vscode.env.openExternal(vscode.Uri.parse(apiUrl));
          }
        });
        return null;
      }

      // Save to SecretStorage
      await context.secrets.store(keyName, apiKey);
      log(`${providerName} API key stored securely`);
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

async function callOpenRouterAPI(
  apiKey: string,
  prompt: string,
  model: string
): Promise<string> {
  try {
    log(`Calling OpenRouter API with model: ${model}`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/reviewer-vscode-extension",
        "X-Title": "Reviewer VSCode Extension"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    log("OpenRouter API call successful");
    return data.choices?.[0]?.message?.content || "No response generated.";
  } catch (error: any) {
    log(`OpenRouter API Error: ${error.message}`, "ERROR");

    let userMessage = "Failed to get AI review from OpenRouter.";
    if (error.message?.includes("401")) {
      userMessage = "Invalid OpenRouter API key. Please check your key and try again.";
    } else if (error.message?.includes("429")) {
      userMessage = "API rate limit exceeded. Please try again later.";
    } else if (error.message?.includes("404")) {
      userMessage = `Model '${model}' not found on OpenRouter. Please check the model name.`;
    }

    throw new Error(userMessage);
  }
}

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

async function generateEnhancedPrompt(
  workspacePath: string,
  currentBranch: string,
  changedFiles: string[],
  linesAdded: number,
  linesDeleted: number,
  customPrompt?: string,
  reviewFocus: ReviewFocus = 'comprehensive',
  reviewDepth: ReviewDepth = 'standard'
): Promise<string> {
  try {
    // Build project context
    const projectContext: ProjectContext = {
      workspacePath,
      repoName: path.basename(workspacePath),
      currentBranch,
      techStack: await detectTechStackFromWorkspace(workspacePath),
      frameworks: await detectFrameworksFromWorkspace(workspacePath),
      packageJson: await readPackageJson(workspacePath),
      gitInfo: {
        changedFiles,
        linesAdded,
        linesDeleted
      }
    };

    // For general AI review, use comprehensive review instead of auto-detection
    // Auto-detection is useful for specialized CI/CD workflows, but for manual reviews
    // users typically want a comprehensive analysis covering all areas
    if (reviewFocus === 'comprehensive') {
      // Keep comprehensive focus for full end-to-end review
      reviewFocus = 'comprehensive';

      // Auto-detect depth based on change size
      const totalChanges = linesAdded + linesDeleted;
      if (totalChanges > 500) {
        reviewDepth = 'deep';
      } else if (totalChanges > 100) {
        reviewDepth = 'standard';
      } else {
        reviewDepth = 'surface';
      }

      log(`Using comprehensive review config: ${reviewFocus} focus, ${reviewDepth} depth. Change size: ${totalChanges} lines`);
    }

    // Get the git diff content
    const gitDiffArgs = buildGitDiffArgs(null, getConfig().excludePatterns);
    const gitDiff = await executeGitCommand(gitDiffArgs, workspacePath);

    // Generate enhanced prompt
    const enhancedPrompt = await promptManager.generatePrompt(
      projectContext,
      gitDiff,
      reviewFocus,
      reviewDepth,
      'mid', // Default developer level, could be configurable
      customPrompt
    );

    return enhancedPrompt;
  } catch (error) {
    log(`Failed to generate enhanced prompt: ${error}`, "ERROR");
    // Fallback to basic prompt
    return getBasicReviewPrompt(currentBranch);
  }
}

function getBasicReviewPrompt(currentBranch: string): string {
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

async function detectTechStackFromWorkspace(workspacePath: string): Promise<string[]> {
  const techStack = new Set<string>();

  try {
    // Check package.json for JavaScript/TypeScript projects
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      Object.keys(deps).forEach(dep => {
        if (dep.includes('react')) techStack.add('React');
        if (dep.includes('vue')) techStack.add('Vue');
        if (dep.includes('angular')) techStack.add('Angular');
        if (dep.includes('express')) techStack.add('Express');
        if (dep.includes('typescript')) techStack.add('TypeScript');
        if (dep.includes('jest')) techStack.add('Jest');
      });

      if (packageJson.scripts) {
        if (packageJson.scripts.tsc) techStack.add('TypeScript');
        if (packageJson.scripts.webpack) techStack.add('Webpack');
      }
    }

    // Check for other language indicators
    const files = fs.readdirSync(workspacePath);
    files.forEach(file => {
      if (file.includes('pom.xml') || file.includes('build.gradle')) techStack.add('Java');
      if (file.includes('requirements.txt') || file.includes('setup.py')) techStack.add('Python');
      if (file.includes('go.mod')) techStack.add('Go');
      if (file.includes('Cargo.toml')) techStack.add('Rust');
      if (file.includes('composer.json')) techStack.add('PHP');
      if (file.includes('Gemfile')) techStack.add('Ruby');
    });

  } catch (error) {
    log(`Error detecting tech stack: ${error}`, "WARN");
  }

  return Array.from(techStack);
}

async function detectFrameworksFromWorkspace(workspacePath: string): Promise<string[]> {
  const frameworks = new Set<string>();

  try {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      Object.keys(deps).forEach(dep => {
        if (dep === 'next') frameworks.add('Next.js');
        if (dep === 'nuxt') frameworks.add('Nuxt.js');
        if (dep === 'gatsby') frameworks.add('Gatsby');
        if (dep === '@nestjs/core') frameworks.add('NestJS');
        if (dep === 'fastify') frameworks.add('Fastify');
      });
    }
  } catch (error) {
    log(`Error detecting frameworks: ${error}`, "WARN");
  }

  return Array.from(frameworks);
}

async function readPackageJson(workspacePath: string): Promise<any> {
  try {
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
  } catch (error) {
    log(`Error reading package.json: ${error}`, "WARN");
  }
  return null;
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

        // Notify history provider to refresh
        if (historyProvider) {
          await historyProvider.addReport(outputPath);
        }

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

// ============================================================================
// REVIEW TYPE SELECTION
// ============================================================================

async function selectReviewType(): Promise<ReviewTypeOption | undefined> {
  const reviewOptions: ReviewTypeOption[] = [
    {
      label: "Comprehensive Review",
      description: "Complete analysis covering all areas (Security, Performance, Architecture, Testing, Documentation)",
      focus: 'comprehensive',
      depth: 'standard',
      icon: "$(checklist)"
    },
    {
      label: "Deep Comprehensive Review",
      description: "Thorough, detailed analysis of all aspects - best for complex changes",
      focus: 'comprehensive',
      depth: 'deep',
      icon: "$(search)"
    },
    {
      label: "Security Review",
      description: "Focus on vulnerabilities, authentication, authorization, and security best practices",
      focus: 'security',
      depth: 'standard',
      icon: "$(shield)"
    },
    {
      label: "Performance Review",
      description: "Analyze algorithms, bottlenecks, memory usage, and optimization opportunities",
      focus: 'performance',
      depth: 'standard',
      icon: "$(dashboard)"
    },
    {
      label: "Architecture Review",
      description: "Evaluate design patterns, code structure, and maintainability",
      focus: 'architecture',
      depth: 'standard',
      icon: "$(organization)"
    },
    {
      label: "Testing Review",
      description: "Identify missing tests, improve coverage, and enhance testing strategies",
      focus: 'testing',
      depth: 'standard',
      icon: "$(beaker)"
    },
    {
      label: "Documentation Review",
      description: "Review code documentation, comments, and API documentation quality",
      focus: 'documentation',
      depth: 'standard',
      icon: "$(book)"
    },
    {
      label: "Quick Surface Review",
      description: "Fast overview of obvious issues and quick wins",
      focus: 'comprehensive',
      depth: 'surface',
      icon: "$(rocket)"
    }
  ];

  const selectedOption = await vscode.window.showQuickPick(reviewOptions, {
    placeHolder: "Choose the type of AI code review you want to generate",
    matchOnDescription: true,
    ignoreFocusOut: false
  });

  return selectedOption;
}

// ============================================================================
// SPECIFIC REVIEW TYPE FUNCTIONS
// ============================================================================

async function generateComprehensiveReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'comprehensive', 'standard');
}

async function generateSecurityReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'security', 'standard');
}

async function generatePerformanceReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'performance', 'standard');
}

async function generateArchitectureReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'architecture', 'standard');
}

async function generateTestingReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'testing', 'standard');
}

async function generateDocumentationReview(context: vscode.ExtensionContext) {
  await generateSpecificReview(context, 'documentation', 'standard');
}

async function generateAIReview(context: vscode.ExtensionContext) {
  // Show review type selection dialog
  const selectedReviewType = await selectReviewType();
  if (!selectedReviewType) {
    log("AI review cancelled by user");
    return;
  }

  // Generate review with selected type
  await generateSpecificReview(context, selectedReviewType.focus, selectedReviewType.depth);
}

async function generateSpecificReview(context: vscode.ExtensionContext, reviewFocus: ReviewFocus, reviewDepth: ReviewDepth) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspacePath) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  log(`=== Starting ${reviewFocus} ${reviewDepth} AI Review ===`);

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

  // Get configuration to determine provider
  const config = getConfig();
  const provider = config.aiProvider;

  // Get API key for selected provider
  const apiKey = await getApiKey(context, provider);
  if (!apiKey) {
    return;
  }

  // Get diff options
  const options = await getDiffOptions(workspacePath);
  if (!options) {
    log("AI review cancelled by user");
    return;
  }

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

        // Generate enhanced prompt with selected focus and depth
        const prompt = config.customPrompt ||
          await generateEnhancedPrompt(
            workspacePath,
            options.currentBranch,
            changedFiles,
            processedFiles.reduce((total, file) => total + (file.lineCount || 0), 0),
            0, // We don't track deleted lines in this context
            config.customPrompt,
            reviewFocus,
            reviewDepth
          );
        const fullPrompt = `${prompt}\n\n${codeContent}`;

        // Call appropriate AI API based on provider
        let aiResponse: string;
        if (provider === "openrouter") {
          log(`Using OpenRouter with model: ${config.openRouterModel}`);
          aiResponse = await callOpenRouterAPI(apiKey, fullPrompt, config.openRouterModel);
        } else {
          log(`Using Gemini with model: ${config.aiModel}`);
          aiResponse = await callGeminiAPI(apiKey, fullPrompt, config.aiModel);
        }

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
        const aiProviderText = provider === "openrouter"
          ? `OpenRouter (${config.openRouterModel})`
          : `Gemini (${config.aiModel})`;

        const reportContent = `# AI Code Review Report

**Generated on:** ${new Date().toLocaleString()}
**Branch:** ${options.currentBranch}
**Comparison:** ${options.mode.desc}
**AI Provider:** ${aiProviderText}

---

${aiResponse}

---

*Report generated by Reviewer Extension using ${provider === "openrouter" ? "OpenRouter" : "Gemini"} AI*
`;

        // Write report
        fs.writeFileSync(outputPath, reportContent, "utf8");
        log(`AI review saved to: ${outputPath}`);

        // Notify history provider to refresh
        if (historyProvider) {
          await historyProvider.addReport(outputPath);
        }

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

// ============================================================================
// CI CONFIGURATION HELPERS
// ============================================================================

async function handleCIConfiguration(setting: string, config: any): Promise<void> {
  switch (setting) {
    case 'Review Depth':
      const depths = ['surface', 'standard', 'deep'];
      const selectedDepth = await vscode.window.showQuickPick(depths, {
        placeHolder: 'Select review depth for CI/CD'
      });
      if (selectedDepth && ciIntegration) {
        await ciIntegration.updateConfig({ reviewDepth: selectedDepth as any });
        vscode.window.showInformationMessage(`Review depth set to: ${selectedDepth}`);
      }
      break;

    case 'Focus Area':
      const focusAreas = ['comprehensive', 'security', 'performance', 'architecture', 'testing', 'documentation'];
      const selectedFocus = await vscode.window.showQuickPick(focusAreas, {
        placeHolder: 'Select focus area for CI/CD'
      });
      if (selectedFocus && ciIntegration) {
        await ciIntegration.updateConfig({ focusArea: selectedFocus as any });
        vscode.window.showInformationMessage(`Focus area set to: ${selectedFocus}`);
      }
      break;

    case 'Trigger on PR':
      const prOptions = ['Enable', 'Disable'];
      const selectedPR = await vscode.window.showQuickPick(prOptions, {
        placeHolder: 'Trigger reviews on pull requests?'
      });
      if (selectedPR && ciIntegration) {
        const enabled = selectedPR === 'Enable';
        await ciIntegration.updateConfig({ triggerOnPR: enabled });
        vscode.window.showInformationMessage(`PR triggers ${enabled ? 'enabled' : 'disabled'}`);
      }
      break;

    case 'Trigger on Push':
      const pushOptions = ['Enable', 'Disable'];
      const selectedPush = await vscode.window.showQuickPick(pushOptions, {
        placeHolder: 'Trigger reviews on push to main branch?'
      });
      if (selectedPush && ciIntegration) {
        const enabled = selectedPush === 'Enable';
        await ciIntegration.updateConfig({ triggerOnPush: enabled });
        vscode.window.showInformationMessage(`Push triggers ${enabled ? 'enabled' : 'disabled'}`);
      }
      break;
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Initialize output channel
  outputChannel = vscode.window.createOutputChannel("Reviewer");
  context.subscriptions.push(outputChannel);

  log("=== Reviewer Extension Activated ===");
  log(`Version: 0.0.2`);
  log(`Workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || "None"}`);

  // Initialize enhanced prompt system
  promptManager = new PromptManager();
  log("Enhanced prompt system initialized");

  // Initialize CI integration
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (workspaceRoot) {
    ciIntegration = new CIIntegration(workspaceRoot);
    log("CI/CD integration initialized");
  }

  // Initialize tree view providers
  const quickActionsProvider = new QuickActionsProvider();
  const dashboardProvider = new DashboardProvider();
  historyProvider = new HistoryProvider(context); // Assign to global variable
  const configurationProvider = new ConfigurationProvider();

  // Register tree views
  const quickActionsView = vscode.window.createTreeView("reviewer.quickActions", {
    treeDataProvider: quickActionsProvider,
    showCollapseAll: false
  });

  const dashboardView = vscode.window.createTreeView("reviewer.dashboard", {
    treeDataProvider: dashboardProvider,
    showCollapseAll: false
  });

  const historyView = vscode.window.createTreeView("reviewer.history", {
    treeDataProvider: historyProvider,
    showCollapseAll: false
  });

  const configurationView = vscode.window.createTreeView("reviewer.configuration", {
    treeDataProvider: configurationProvider,
    showCollapseAll: true
  });

  // Create status bar button (keep for backward compatibility)
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

  // Specific review type commands
  const generateComprehensiveReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateComprehensiveReview",
    async () => {
      await generateComprehensiveReview(context);
    }
  );

  const generateSecurityReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateSecurityReview",
    async () => {
      await generateSecurityReview(context);
    }
  );

  const generatePerformanceReviewCommand = vscode.commands.registerCommand(
    "reviewer.generatePerformanceReview",
    async () => {
      await generatePerformanceReview(context);
    }
  );

  const generateArchitectureReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateArchitectureReview",
    async () => {
      await generateArchitectureReview(context);
    }
  );

  const generateTestingReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateTestingReview",
    async () => {
      await generateTestingReview(context);
    }
  );

  const generateDocumentationReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateDocumentationReview",
    async () => {
      await generateDocumentationReview(context);
    }
  );

  const clearApiKeyCommand = vscode.commands.registerCommand(
    "reviewer.clearApiKey",
    async () => {
      // Clear both API keys
      await context.secrets.delete("reviewer.geminiApiKey");
      await context.secrets.delete("reviewer.openRouterApiKey");
      vscode.window.showInformationMessage("All API keys cleared successfully");
      log("All API keys cleared by user");
    }
  );

  const showLogsCommand = vscode.commands.registerCommand(
    "reviewer.showLogs",
    () => {
      outputChannel.show();
    }
  );

  // New sidebar commands
  const refreshQuickActionsCommand = vscode.commands.registerCommand(
    "reviewer.refreshQuickActions",
    () => {
      quickActionsProvider.refresh();
    }
  );

  const refreshDashboardCommand = vscode.commands.registerCommand(
    "reviewer.refreshDashboard",
    () => {
      dashboardProvider.refresh();
    }
  );

  const refreshHistoryCommand = vscode.commands.registerCommand(
    "reviewer.refreshHistory",
    () => {
      historyProvider.refresh();
    }
  );

  const setupApiKeysCommand = vscode.commands.registerCommand(
    "reviewer.setupApiKeys",
    async () => {
      const config = getConfig();
      await getApiKey(context, config.aiProvider);
      dashboardProvider.refresh();
      configurationProvider.refresh();
    }
  );

  const switchProviderCommand = vscode.commands.registerCommand(
    "reviewer.switchProvider",
    async () => {
      const config = vscode.workspace.getConfiguration("reviewer");
      const currentProvider = config.get<string>("aiProvider") || "gemini";
      const newProvider = currentProvider === "gemini" ? "openrouter" : "gemini";

      await config.update("aiProvider", newProvider, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`Switched to ${newProvider === "gemini" ? "Google Gemini" : "OpenRouter"}`);

      dashboardProvider.refresh();
      configurationProvider.refresh();
    }
  );

  const openReportCommand = vscode.commands.registerCommand(
    "reviewer.openReport",
    async (report: any) => {
      if (report && report.path) {
        const document = await vscode.workspace.openTextDocument(report.path);
        await vscode.window.showTextDocument(document);
      }
    }
  );

  const deleteReportCommand = vscode.commands.registerCommand(
    "reviewer.deleteReport",
    async (report: any) => {
      if (report && report.path) {
        const response = await vscode.window.showWarningMessage(
          `Delete report "${report.filename}"?`,
          "Delete",
          "Cancel"
        );
        if (response === "Delete") {
          historyProvider.deleteReport(report);
          vscode.window.showInformationMessage("Report deleted successfully");
        }
      }
    }
  );

  // CI/CD Integration Commands
  const setupCICommand = vscode.commands.registerCommand(
    "reviewer.setupCI",
    async () => {
      if (ciIntegration) {
        await ciIntegration.initializeCIIntegration();
      } else {
        vscode.window.showErrorMessage("CI integration not available. Ensure you have a workspace opened.");
      }
    }
  );

  const configureCICommand = vscode.commands.registerCommand(
    "reviewer.configureCI",
    async () => {
      if (ciIntegration) {
        const config = ciIntegration.getConfig();
        const options = [
          { label: 'Review Depth', description: `Current: ${config.reviewDepth}` },
          { label: 'Focus Area', description: `Current: ${config.focusArea}` },
          { label: 'Trigger on PR', description: `Current: ${config.triggerOnPR ? 'Enabled' : 'Disabled'}` },
          { label: 'Trigger on Push', description: `Current: ${config.triggerOnPush ? 'Enabled' : 'Disabled'}` }
        ];

        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select CI setting to configure'
        });

        if (selected) {
          // Handle configuration based on selection
          await handleCIConfiguration(selected.label, config);
        }
      } else {
        vscode.window.showErrorMessage("CI integration not configured. Run 'Setup CI/CD Integration' first.");
      }
    }
  );

  // History Management Commands
  const searchHistoryCommand = vscode.commands.registerCommand(
    "reviewer.searchHistory",
    async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search review history',
        placeHolder: 'Enter search terms (filename, branch, repository, or content)'
      });

      if (query && historyProvider) {
        const results = await historyProvider.searchReviews(query);

        if (results.length === 0) {
          vscode.window.showInformationMessage(`No reviews found for "${query}"`);
          return;
        }

        const items = results.map((review: any) => ({
          label: review.filename,
          description: `${review.branch} • ${review.timestamp.toLocaleDateString()}`,
          detail: review.summary || `${review.type} review`,
          review: review
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${results.length} review(s) found for "${query}"`
        });

        if (selected && (selected as any).review) {
          // Open the selected review
          const doc = await vscode.workspace.openTextDocument((selected as any).review.path);
          await vscode.window.showTextDocument(doc);
        }
      }
    }
  );

  const exportHistoryCommand = vscode.commands.registerCommand(
    "reviewer.exportHistory",
    async () => {
      if (!historyProvider) return;

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('review-history.json'),
        filters: {
          'JSON Files': ['json']
        }
      });

      if (uri) {
        try {
          await historyProvider.exportReviews(uri.fsPath);
          vscode.window.showInformationMessage(`Review history exported to ${uri.fsPath}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to export history: ${error}`);
        }
      }
    }
  );

  const importHistoryCommand = vscode.commands.registerCommand(
    "reviewer.importHistory",
    async () => {
      if (!historyProvider) return;

      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'JSON Files': ['json']
        }
      });

      if (uris && uris[0]) {
        try {
          const imported = await historyProvider.importReviews(uris[0].fsPath);
          vscode.window.showInformationMessage(`Imported ${imported} review(s) from ${uris[0].fsPath}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to import history: ${error}`);
        }
      }
    }
  );

  const clearHistoryCommand = vscode.commands.registerCommand(
    "reviewer.clearHistory",
    async () => {
      if (!historyProvider) return;

      const response = await vscode.window.showWarningMessage(
        'This will permanently delete all review history. This action cannot be undone.',
        'Clear History',
        'Cancel'
      );

      if (response === 'Clear History') {
        try {
          await historyProvider.clearAllReviews();
          vscode.window.showInformationMessage('Review history cleared successfully');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to clear history: ${error}`);
        }
      }
    }
  );

  const showStatisticsCommand = vscode.commands.registerCommand(
    "reviewer.showStatistics",
    async () => {
      if (!historyProvider) return;

      try {
        const stats = await historyProvider.getStatistics();

        const statsMarkdown = `# Review Statistics

## Overview
- **Total Reviews**: ${stats.totalReviews}
- **Diff Reports**: ${stats.reviewsByType.diff}
- **AI Reviews**: ${stats.reviewsByType.ai_review}
- **Average Reviews/Day**: ${stats.averageReviewsPerDay.toFixed(1)} (last 30 days)

## Activity
- **Most Active Repository**: ${stats.mostActiveRepository}
- **Most Active Branch**: ${stats.mostActiveBranch}

## AI Providers Used
${Object.entries(stats.reviewsByProvider).map(([provider, count]) =>
  `- **${provider}**: ${count} reviews`).join('\n') || '- None'}

## Recent Activity (Last 7 Days)
${stats.recentActivity.map((day: any) =>
  `- **${new Date(day.date).toLocaleDateString()}**: ${day.count} reviews`).join('\n')}

---
*Generated on ${new Date().toLocaleString()}*
`;

        // Create a new document with the statistics
        const doc = await vscode.workspace.openTextDocument({
          content: statsMarkdown,
          language: 'markdown'
        });

        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate statistics: ${error}`);
      }
    }
  );

  const openInteractiveReviewCommand = vscode.commands.registerCommand(
    "reviewer.openInteractiveReview",
    async (reviewFile?: any) => {
      try {
        let filePath: string;

        if (reviewFile && reviewFile.report && reviewFile.report.path) {
          // Called from history provider with ReportNode object
          filePath = reviewFile.report.path;
        } else if (reviewFile && reviewFile.path) {
          // Called with direct path object
          filePath = reviewFile.path;
        } else {
          // Fallback: Try to find the most recent AI review file
          const storage = new ReviewStorage(context);
          const reports = await storage.getAllReviews();
          const aiReports = reports.filter((r: ReviewMetadata) => r.type === 'ai_review');

          if (aiReports.length > 0) {
            // Use the most recent AI review
            const latestReport = aiReports.sort((a: ReviewMetadata, b: ReviewMetadata) => b.timestamp.getTime() - a.timestamp.getTime())[0];
            filePath = latestReport.path;
          } else {
            // Let user select a review file
            const uris = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              filters: {
                'Markdown Files': ['md'],
                'All Files': ['*']
              },
              title: 'Select AI Review File'
            });

            if (!uris || uris.length === 0) {
              return;
            }

            filePath = uris[0].fsPath;
          }
        }

        // Parse the review file
        const parsedData = ReviewParser.parseReviewFile(filePath);

        // Convert to ReviewData format
        const reviewData: ReviewData = {
          title: parsedData.title,
          timestamp: parsedData.timestamp,
          branch: parsedData.branch,
          repository: parsedData.repository,
          provider: parsedData.provider,
          model: parsedData.model,
          summary: parsedData.summary,
          issues: parsedData.issues.map(issue => ({
            line: issue.line,
            column: issue.column,
            severity: issue.severity,
            category: issue.category,
            title: issue.title,
            description: issue.description,
            suggestion: issue.suggestion,
            agentPrompt: issue.agentPrompt,
            file: issue.file
          })),
          codeContent: parsedData.codeContent,
          diffContent: parsedData.diffContent
        };

        // Open interactive review panel
        InteractiveReviewPanel.createOrShow(context.extensionUri, reviewData);

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open interactive review: ${error}`);
        log(`Interactive review error: ${error}`);
      }
    }
  );

  // Add to subscriptions
  context.subscriptions.push(comprehensiveDiffButton);
  context.subscriptions.push(quickActionsView);
  context.subscriptions.push(dashboardView);
  context.subscriptions.push(historyView);
  context.subscriptions.push(configurationView);
  context.subscriptions.push(generateComprehensiveDiffCommand);
  context.subscriptions.push(generateAIReviewCommand);
  context.subscriptions.push(generateComprehensiveReviewCommand);
  context.subscriptions.push(generateSecurityReviewCommand);
  context.subscriptions.push(generatePerformanceReviewCommand);
  context.subscriptions.push(generateArchitectureReviewCommand);
  context.subscriptions.push(generateTestingReviewCommand);
  context.subscriptions.push(generateDocumentationReviewCommand);
  context.subscriptions.push(clearApiKeyCommand);
  context.subscriptions.push(showLogsCommand);
  context.subscriptions.push(refreshQuickActionsCommand);
  context.subscriptions.push(refreshDashboardCommand);
  context.subscriptions.push(refreshHistoryCommand);
  context.subscriptions.push(setupApiKeysCommand);
  context.subscriptions.push(switchProviderCommand);
  context.subscriptions.push(openReportCommand);
  context.subscriptions.push(deleteReportCommand);
  context.subscriptions.push(setupCICommand);
  context.subscriptions.push(configureCICommand);
  context.subscriptions.push(searchHistoryCommand);
  context.subscriptions.push(exportHistoryCommand);
  context.subscriptions.push(importHistoryCommand);
  context.subscriptions.push(clearHistoryCommand);
  context.subscriptions.push(showStatisticsCommand);
  context.subscriptions.push(openInteractiveReviewCommand);

  log("All commands and tree views registered successfully");
}

export function deactivate() {
  log("=== Reviewer Extension Deactivated ===");
  if (outputChannel) {
    outputChannel.dispose();
  }
}
