import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";

// Comparison modes for comprehensive diff
const COMPARISON_MODES = [
  {
    label: "Staged changes",
    description: "git diff --cached",
    command: "git diff --cached",
    desc: "staged changes",
  },
  {
    label: "Working directory changes",
    description: "git diff",
    command: "git diff",
    desc: "working directory changes",
  },
  {
    label: "All changes since last commit",
    description: "git diff HEAD",
    command: "git diff HEAD",
    desc: "all changes since last commit",
  },
  {
    label: "Compare with another branch",
    description: "Select a branch to compare with",
    command: "custom",
    desc: "changes compared to selected branch",
  },
  {
    label: "Compare with specific commit",
    description: "Select a commit hash to compare with",
    command: "commit",
    desc: "changes compared to selected commit",
  },
  {
    label: "Compare with origin/main",
    description: "git diff origin/main",
    command: "git diff origin/main",
    desc: "changes compared to origin/main",
  },
  {
    label: "Compare with origin/master",
    description: "git diff origin/master",
    command: "git diff origin/master",
    desc: "changes compared to origin/master",
  },
];

// Function to get file extension for syntax highlighting
function getFileExtension(filePath: string): string {
  return path.extname(filePath).slice(1);
}

// Function to get syntax highlighting language
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
  };

  return languageMap[ext] || "text";
}

// Function to check if file is binary
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
    return true;
  }
}

// Function to execute git command and return output
async function executeGitCommand(
  command: string,
  workspacePath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { exec } = require("child_process");
    exec(
      command,
      { cwd: workspacePath },
      (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

// Function to generate comprehensive diff
async function generateComprehensiveDiff() {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspacePath) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  // Check if we're in a git repository
  try {
    await executeGitCommand("git rev-parse --git-dir", workspacePath);
  } catch (error) {
    vscode.window.showErrorMessage("Not inside a Git repository!");
    return;
  }

  // Get current branch
  let currentBranch: string;
  try {
    currentBranch = (
      await executeGitCommand("git branch --show-current", workspacePath)
    ).trim();
  } catch (error) {
    vscode.window.showErrorMessage("Failed to get current branch");
    return;
  }

  // Show comparison mode selection
  const selectedMode = await vscode.window.showQuickPick(COMPARISON_MODES, {
    placeHolder: "Select comparison mode for comprehensive diff",
    title: "Generate Comprehensive Diff Report",
  });

  if (!selectedMode) {
    return;
  }

  let diffCommand = selectedMode.command;
  let comparisonDesc = selectedMode.desc;

  // Handle custom branch selection
  if (selectedMode.command === "custom") {
    const branchName = await vscode.window.showInputBox({
      prompt: "Enter branch name to compare with",
      placeHolder: "e.g., main, develop, feature/branch-name",
    });

    if (!branchName) {
      return;
    }

    // Validate branch exists
    try {
      await executeGitCommand(
        `git show-ref --verify --quiet refs/heads/${branchName}`,
        workspacePath
      );
    } catch (error) {
      try {
        await executeGitCommand(
          `git show-ref --verify --quiet refs/remotes/origin/${branchName}`,
          workspacePath
        );
      } catch (error2) {
        vscode.window.showErrorMessage(`Branch '${branchName}' not found!`);
        return;
      }
    }

    diffCommand = `git diff ${branchName}`;
    comparisonDesc = `changes compared to ${branchName}`;
  }

  // Handle specific commit selection
  if (selectedMode.command === "commit") {
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
      return;
    }

    const trimmedCommitHash = commitHash.trim();

    // Validate commit exists
    try {
      await executeGitCommand(
        `git cat-file -e ${trimmedCommitHash}`,
        workspacePath
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Commit '${trimmedCommitHash}' not found!`
      );
      return;
    }

    // Get commit info for better description
    try {
      const commitInfo = await executeGitCommand(
        `git log --oneline -1 ${trimmedCommitHash}`,
        workspacePath
      );
      const commitMessage = commitInfo.trim();

      diffCommand = `git diff ${trimmedCommitHash}`;
      comparisonDesc = `changes compared to commit ${commitMessage}`;
    } catch (error) {
      diffCommand = `git diff ${trimmedCommitHash}`;
      comparisonDesc = `changes compared to commit ${trimmedCommitHash}`;
    }
  }

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating Comprehensive Diff Report",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Analyzing changed files..." });

      try {
        // Get list of changed files
        const changedFilesOutput = await executeGitCommand(
          `${diffCommand} --name-only`,
          workspacePath
        );
        const changedFiles = changedFilesOutput
          .trim()
          .split("\n")
          .filter((file) => file.length > 0)
          .filter((file) => file !== "api/package-lock.json");

        if (changedFiles.length === 0) {
          vscode.window.showInformationMessage(
            "No changes found for the selected comparison!"
          );
          return;
        }

        progress.report({
          increment: 20,
          message: `Found ${changedFiles.length} changed files...`,
        });

        // Generate timestamp and filename
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const outputFileName = `comprehensive_diff_${currentBranch.replace(
          /[\/\\]/g,
          "-"
        )}_${timestamp}.md`;
        const outputPath = path.join(workspacePath, outputFileName);

        // Start building the report
        let reportContent = `# Comprehensive Diff Report

**Generated on:** ${new Date().toLocaleString()}  
**Branch:** ${currentBranch}  
**Comparison:** ${comparisonDesc}  

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
`;

        progress.report({ increment: 40, message: "Generating git diff..." });

        // Get git diff
        try {
          const gitDiff = await executeGitCommand(
            `${diffCommand} -- . ':(glob,exclude)**/node_modules' ':(glob,exclude)**/package-lock.json' ':(glob,exclude)api/package-lock.json' ':(glob,exclude)**/yarn.lock' ':(glob,exclude)**/*.png' ':(glob,exclude)**/*.jpg' ':(glob,exclude)**/*.jpeg' ':(glob,exclude)**/*.gif' ':(glob,exclude)**/*.svg' ':(glob,exclude)**/*.ico' ':(glob,exclude)**/*.pdf' ':(glob,exclude)**/*.zip' ':(glob,exclude)**/*.tar.gz' ':(glob,exclude)**/*.log'`,
            workspacePath
          );
          reportContent += gitDiff;
        } catch (error) {
          reportContent += "Error generating diff\n";
        }

        reportContent += `\`\`\`

---

## Complete File Contents

`;

        progress.report({
          increment: 60,
          message: "Processing file contents...",
        });

        // Process each changed file
        for (let i = 0; i < changedFiles.length; i++) {
          const file = changedFiles[i];

          // Skip api/package-lock.json file
          if (file === "api/package-lock.json") {
            continue;
          }

          const filePath = path.join(workspacePath, file);

          progress.report({
            increment: 60 + (30 * (i + 1)) / changedFiles.length,
            message: `Processing ${file}...`,
          });

          reportContent += `\n### 📁 \`${file}\`\n\n`;

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            reportContent += "*This file was deleted.*\n\n";
            continue;
          }

          // Check if file is binary
          if (isBinaryFile(filePath)) {
            reportContent +=
              "*This is a binary file and its content is not displayed.*\n\n";
            continue;
          }

          // Get file stats
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          // Skip very large files (>1MB)
          if (fileSize > 1048576) {
            reportContent += `*This file is too large to display (${fileSize} bytes).*\n\n`;
            continue;
          }

          // Get line count
          const content = fs.readFileSync(filePath, "utf8");
          const lineCount = content.split("\n").length;

          reportContent += `**Lines:** ${lineCount} | **Size:** ${fileSize} bytes\n\n`;

          // Add file content with syntax highlighting
          const language = getLanguage(file);
          reportContent += `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
        }

        // Add footer
        reportContent += `---

*Report generated by Deploy Extension on ${new Date().toLocaleString()}*
`;

        progress.report({ increment: 100, message: "Saving report..." });

        // Write the report file
        fs.writeFileSync(outputPath, reportContent, "utf8");

        // Show success message and open file
        const openAction = "Open Report";
        const result = await vscode.window.showInformationMessage(
          `Comprehensive diff report generated successfully! (${changedFiles.length} files processed)`,
          openAction
        );

        if (result === openAction) {
          const document = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(document);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to generate comprehensive diff: ${error}`
        );
      }
    }
  );
}

// Function to call Gemini API
async function callGeminiAPI(apiKey: string, prompt: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    });
    return response.text || "No response generated.";
  } catch (error: any) {
    throw new Error(`Gemini API Error: ${error.message || error}`);
  }
}

// Function to generate AI Review
async function generateAIReview() {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspacePath) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  // Check if we're in a git repository
  try {
    await executeGitCommand("git rev-parse --git-dir", workspacePath);
  } catch (error) {
    vscode.window.showErrorMessage("Not inside a Git repository!");
    return;
  }

  // Get current branch
  let currentBranch: string;
  try {
    currentBranch = (
      await executeGitCommand("git branch --show-current", workspacePath)
    ).trim();
  } catch (error) {
    vscode.window.showErrorMessage("Failed to get current branch");
    return;
  }

  // Show comparison mode selection
  const selectedMode = await vscode.window.showQuickPick(COMPARISON_MODES, {
    placeHolder: "Select comparison mode for AI Review",
    title: "Generate AI Review",
  });

  if (!selectedMode) {
    return;
  }

  let diffCommand = selectedMode.command;
  let comparisonDesc = selectedMode.desc;

  // Handle custom branch selection
  if (selectedMode.command === "custom") {
    const branchName = await vscode.window.showInputBox({
      prompt: "Enter branch name to compare with",
      placeHolder: "e.g., main, develop, feature/branch-name",
    });

    if (!branchName) {
      return;
    }

    // Validate branch exists
    try {
      await executeGitCommand(
        `git show-ref --verify --quiet refs/heads/${branchName}`,
        workspacePath
      );
    } catch (error) {
      try {
        await executeGitCommand(
          `git show-ref --verify --quiet refs/remotes/origin/${branchName}`,
          workspacePath
        );
      } catch (error2) {
        vscode.window.showErrorMessage(`Branch '${branchName}' not found!`);
        return;
      }
    }

    diffCommand = `git diff ${branchName}`;
    comparisonDesc = `changes compared to ${branchName}`;
  }

  // Handle specific commit selection
  if (selectedMode.command === "commit") {
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
      return;
    }

    const trimmedCommitHash = commitHash.trim();

    // Validate commit exists
    try {
      await executeGitCommand(
        `git cat-file -e ${trimmedCommitHash}`,
        workspacePath
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Commit '${trimmedCommitHash}' not found!`
      );
      return;
    }

    // Get commit info for better description
    try {
      const commitInfo = await executeGitCommand(
        `git log --oneline -1 ${trimmedCommitHash}`,
        workspacePath
      );
      const commitMessage = commitInfo.trim();

      diffCommand = `git diff ${trimmedCommitHash}`;
      comparisonDesc = `changes compared to commit ${commitMessage}`;
    } catch (error) {
      diffCommand = `git diff ${trimmedCommitHash}`;
      comparisonDesc = `changes compared to commit ${trimmedCommitHash}`;
    }
  }

  // Get API Key
  let apiKey = vscode.workspace.getConfiguration("reviewer").get<string>("geminiApiKey");
  if (!apiKey) {
    apiKey = await vscode.window.showInputBox({
      prompt: "Enter your Gemini API Key",
      placeHolder: "AIza...",
      password: true,
      ignoreFocusOut: true,
    });
    
    if (!apiKey) {
      vscode.window.showErrorMessage("API Key is required for AI Review");
      return;
    }
  }

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating AI Review",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Analyzing changed files..." });

      try {
        // Get list of changed files
        const changedFilesOutput = await executeGitCommand(
          `${diffCommand} --name-only`,
          workspacePath
        );
        const changedFiles = changedFilesOutput
          .trim()
          .split("\n")
          .filter((file) => file.length > 0)
          .filter((file) => file !== "api/package-lock.json");

        if (changedFiles.length === 0) {
          vscode.window.showInformationMessage(
            "No changes found for the selected comparison!"
          );
          return;
        }

        progress.report({
          increment: 10,
          message: `Found ${changedFiles.length} changed files...`,
        });

        // Build the content for AI
        let codeContent = "";

        // Get git diff
        progress.report({ increment: 20, message: "Generating git diff..." });
        try {
          const gitDiff = await executeGitCommand(
            `${diffCommand} -- . ':(glob,exclude)**/node_modules' ':(glob,exclude)**/package-lock.json' ':(glob,exclude)api/package-lock.json' ':(glob,exclude)**/yarn.lock' ':(glob,exclude)**/*.png' ':(glob,exclude)**/*.jpg' ':(glob,exclude)**/*.jpeg' ':(glob,exclude)**/*.gif' ':(glob,exclude)**/*.svg' ':(glob,exclude)**/*.ico' ':(glob,exclude)**/*.pdf' ':(glob,exclude)**/*.zip' ':(glob,exclude)**/*.tar.gz' ':(glob,exclude)**/*.log'`,
            workspacePath
          );
          codeContent += "## Git Diff\n\n" + gitDiff + "\n\n";
        } catch (error) {
          codeContent += "Error generating diff\n";
        }

        codeContent += "## File Contents\n\n";

        progress.report({
          increment: 30,
          message: "Processing file contents...",
        });

        // Process each changed file
        for (let i = 0; i < changedFiles.length; i++) {
          const file = changedFiles[i];

          // Skip api/package-lock.json file
          if (file === "api/package-lock.json") {
            continue;
          }

          const filePath = path.join(workspacePath, file);

          progress.report({
            increment: 30 + (20 * (i + 1)) / changedFiles.length,
            message: `Reading ${file}...`,
          });

          codeContent += `\n### File: ${file}\n\n`;

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            codeContent += "(File deleted)\n";
            continue;
          }

          // Check if file is binary
          if (isBinaryFile(filePath)) {
            codeContent += "(Binary file)\n";
            continue;
          }

          // Get file stats
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          // Skip very large files (>1MB)
          if (fileSize > 1048576) {
            codeContent += `(File too large: ${fileSize} bytes)\n`;
            continue;
          }

          // Get content
          const content = fs.readFileSync(filePath, "utf8");
          codeContent += content + "\n";
        }

        progress.report({ increment: 60, message: "Sending to Gemini AI..." });

        const prompt = `# Review this code with senior developer standards

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

        const fullPrompt = `${prompt}\n\n${codeContent}`;
        
        // Call API
        const aiResponse = await callGeminiAPI(apiKey!, fullPrompt);

        progress.report({ increment: 90, message: "Saving report..." });

        // Generate timestamp and filename
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const outputFileName = `ai_review_${currentBranch.replace(
          /[\/\\]/g,
          "-"
        )}_${timestamp}.md`;
        const outputPath = path.join(workspacePath, outputFileName);

        const reportContent = `# AI Code Review Report

**Generated on:** ${new Date().toLocaleString()}  
**Branch:** ${currentBranch}  
**Comparison:** ${comparisonDesc}  

---

${aiResponse}

---

*Report generated by Reviewer Extension using Gemini AI*
`;

        // Write the report file
        fs.writeFileSync(outputPath, reportContent, "utf8");

        // Show success message and open file
        const openAction = "Open Review";
        const result = await vscode.window.showInformationMessage(
          `AI Review generated successfully!`,
          openAction
        );

        if (result === openAction) {
          const document = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(document);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to generate AI review: ${error}`
        );
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Deploy extension is now active");

  // Comprehensive Diff button
  const comprehensiveDiffButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    96
  );
  comprehensiveDiffButton.text = "$(diff) Comprehensive Diff";
  comprehensiveDiffButton.command = "reviewer.generateComprehensiveDiff";
  comprehensiveDiffButton.tooltip =
    "Generate comprehensive diff report with full file contents";
  comprehensiveDiffButton.show();

  // Register comprehensive diff command
  let generateComprehensiveDiffCommand = vscode.commands.registerCommand(
    "reviewer.generateComprehensiveDiff",
    async () => {
      await generateComprehensiveDiff();
    }
  );

  // Register AI Review command
  let generateAIReviewCommand = vscode.commands.registerCommand(
    "reviewer.generateAIReview",
    async () => {
      await generateAIReview();
    }
  );

  context.subscriptions.push(comprehensiveDiffButton);
  context.subscriptions.push(generateComprehensiveDiffCommand);
  context.subscriptions.push(generateAIReviewCommand);
}

export function deactivate() {
  // Clean up resources
}
