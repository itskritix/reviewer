#!/usr/bin/env node

/**
 * CI/CD Review Script for Reviewer AI Extension
 * Runs AI code reviews in CI/CD environments
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration from environment variables
const CONFIG = {
  reviewDepth: process.env.REVIEW_DEPTH || 'standard',
  focusArea: process.env.FOCUS_AREA || 'comprehensive',
  developerLevel: process.env.DEVELOPER_LEVEL || 'mid',
  aiProvider: process.env.AI_PROVIDER || 'gemini',
  geminiApiKey: process.env.GEMINI_API_KEY,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  prNumber: process.env.PR_NUMBER,
  baseSha: process.env.BASE_SHA,
  headSha: process.env.HEAD_SHA || process.env.GITHUB_SHA,
  repository: process.env.GITHUB_REPOSITORY || process.env.CI_PROJECT_PATH,
  branch: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_REF_NAME
};

async function main() {
  try {
    console.log('🤖 Starting AI Code Review...');
    console.log(`Repository: ${CONFIG.repository}`);
    console.log(`Branch: ${CONFIG.branch}`);
    console.log(`Review Depth: ${CONFIG.reviewDepth}`);
    console.log(`Focus Area: ${CONFIG.focusArea}`);

    // Validate prerequisites
    await validateEnvironment();

    // Generate diff and analyze changes
    const { diff, changedFiles, stats } = await generateDiff();

    if (!diff || diff.length === 0) {
      console.log('ℹ️ No changes detected, skipping review');
      return;
    }

    console.log(`📊 Changes detected: ${changedFiles.length} files, ${stats.additions} additions, ${stats.deletions} deletions`);

    // Build project context
    const projectContext = await buildProjectContext(changedFiles, stats);

    // Generate AI review
    const review = await generateAIReview(projectContext, diff);

    // Save review results
    await saveReviewResults(review, changedFiles, stats);

    // Generate additional outputs
    await generateJUnitReport(review);
    await generateSummaryReport(review, stats);

    console.log('✅ AI Code Review completed successfully');

  } catch (error) {
    console.error('❌ AI Code Review failed:', error);

    // Generate failure report
    await saveFailureReport(error);

    process.exit(1);
  }
}

async function validateEnvironment() {
  console.log('🔍 Validating environment...');

  // Check if we're in a git repository
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  } catch (error) {
    throw new Error('Not in a Git repository');
  }

  // Check for API keys
  if (!CONFIG.geminiApiKey && !CONFIG.openrouterApiKey) {
    throw new Error('No AI API key found. Set GEMINI_API_KEY or OPENROUTER_API_KEY');
  }

  // Check if extension is built
  if (!fs.existsSync('out/src/extension.js')) {
    throw new Error('Extension not built. Run "npm run compile" first');
  }

  console.log('✅ Environment validation passed');
}

async function generateDiff() {
  console.log('📝 Generating diff...');

  let diffCommand;
  let fileListCommand;

  if (CONFIG.prNumber && CONFIG.baseSha && CONFIG.headSha) {
    // Pull request context
    diffCommand = `git diff ${CONFIG.baseSha}..${CONFIG.headSha}`;
    fileListCommand = `git diff --name-only ${CONFIG.baseSha}..${CONFIG.headSha}`;
  } else {
    // Push context - compare with previous commit
    diffCommand = 'git diff HEAD~1 HEAD';
    fileListCommand = 'git diff --name-only HEAD~1 HEAD';
  }

  try {
    const diff = execSync(diffCommand, { encoding: 'utf8' });
    const changedFilesOutput = execSync(fileListCommand, { encoding: 'utf8' });

    const changedFiles = changedFilesOutput
      .split('\n')
      .filter(file => file.trim())
      .filter(file => !isExcludedFile(file));

    // Get diff stats
    const statsOutput = execSync(`${diffCommand} --numstat`, { encoding: 'utf8' });
    const stats = parseDiffStats(statsOutput);

    return { diff, changedFiles, stats };

  } catch (error) {
    if (error.status === 1 && error.stdout) {
      // Git diff returns status 1 when there are differences, but that's normal
      return {
        diff: error.stdout,
        changedFiles: [],
        stats: { additions: 0, deletions: 0 }
      };
    }
    throw new Error(`Failed to generate diff: ${error.message}`);
  }
}

function isExcludedFile(file) {
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /\.vscode/,
    /dist/,
    /build/,
    /coverage/,
    /\.log$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /\.vsix$/
  ];

  return excludePatterns.some(pattern => pattern.test(file));
}

function parseDiffStats(statsOutput) {
  const lines = statsOutput.trim().split('\n').filter(line => line.trim());
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      additions += parseInt(parts[0]) || 0;
      deletions += parseInt(parts[1]) || 0;
    }
  }

  return { additions, deletions };
}

async function buildProjectContext(changedFiles, stats) {
  console.log('🏗️ Building project context...');

  const projectContext = {
    workspacePath: process.cwd(),
    repoName: CONFIG.repository || 'unknown',
    currentBranch: CONFIG.branch || 'unknown',
    techStack: [],
    frameworks: [],
    gitInfo: {
      changedFiles: changedFiles,
      linesAdded: stats.additions,
      linesDeleted: stats.deletions
    }
  };

  // Try to read package.json for tech stack detection
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      projectContext.packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (error) {
      console.warn('Failed to parse package.json:', error.message);
    }
  }

  // Detect tech stack from file extensions
  projectContext.techStack = detectTechStackFromFiles(changedFiles);

  return projectContext;
}

function detectTechStackFromFiles(files) {
  const techStack = new Set();

  for (const file of files) {
    if (file.match(/\.(ts|tsx)$/)) techStack.add('TypeScript');
    if (file.match(/\.(js|jsx)$/)) techStack.add('JavaScript');
    if (file.match(/\.py$/)) techStack.add('Python');
    if (file.match(/\.java$/)) techStack.add('Java');
    if (file.match(/\.go$/)) techStack.add('Go');
    if (file.match(/\.rs$/)) techStack.add('Rust');
    if (file.match(/\.php$/)) techStack.add('PHP');
    if (file.match(/\.rb$/)) techStack.add('Ruby');
    if (file.match(/\.(css|scss|sass)$/)) techStack.add('CSS');
    if (file.match(/\.html$/)) techStack.add('HTML');
    if (file.match(/\.sql$/)) techStack.add('SQL');
  }

  return Array.from(techStack);
}

async function generateAIReview(projectContext, diff) {
  console.log('🧠 Generating AI review...');

  // Dynamically import the extension modules
  const { PromptManager } = require('../out/src/prompts/PromptManager.js');
  const extensionModule = require('../out/src/extension.js');

  const promptManager = new PromptManager();

  // Generate context-aware prompt
  const prompt = await promptManager.generatePrompt(
    projectContext,
    diff,
    CONFIG.focusArea,
    CONFIG.reviewDepth,
    CONFIG.developerLevel
  );

  console.log('📤 Calling AI API...');

  let review;
  if (CONFIG.geminiApiKey && CONFIG.aiProvider === 'gemini') {
    review = await extensionModule.callGeminiAPI(CONFIG.geminiApiKey, prompt, 'gemini-1.5-pro');
  } else if (CONFIG.openrouterApiKey && CONFIG.aiProvider === 'openrouter') {
    review = await extensionModule.callOpenRouterAPI(CONFIG.openrouterApiKey, prompt, 'openai/gpt-4o');
  } else {
    throw new Error('No valid AI API configuration found');
  }

  return review;
}

async function saveReviewResults(review, changedFiles, stats) {
  console.log('💾 Saving review results...');

  // Save main review file
  fs.writeFileSync('ai_review.md', review);

  // Save changed files list
  fs.writeFileSync('changed_files.txt', changedFiles.join('\n'));

  // Save metadata
  const metadata = {
    timestamp: new Date().toISOString(),
    repository: CONFIG.repository,
    branch: CONFIG.branch,
    commit: CONFIG.headSha,
    pr: CONFIG.prNumber,
    config: {
      reviewDepth: CONFIG.reviewDepth,
      focusArea: CONFIG.focusArea,
      developerLevel: CONFIG.developerLevel,
      aiProvider: CONFIG.aiProvider
    },
    stats: stats,
    files: changedFiles
  };

  fs.writeFileSync('review_metadata.json', JSON.stringify(metadata, null, 2));
}

async function generateJUnitReport(review) {
  console.log('📋 Generating JUnit report...');

  // Parse review for issues (simple heuristic)
  const criticalIssues = (review.match(/\*\*Critical|CRITICAL|🔴/g) || []).length;
  const highIssues = (review.match(/\*\*High|HIGH|🔶/g) || []).length;
  const mediumIssues = (review.match(/\*\*Medium|MEDIUM|🟡/g) || []).length;

  const totalIssues = criticalIssues + highIssues + mediumIssues;
  const hasFailures = criticalIssues > 0;

  const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="AI Code Review" tests="1" failures="${hasFailures ? 1 : 0}" time="0">
  <testcase name="Code Quality Review" classname="ai.review">
    ${hasFailures ? `
    <failure message="${totalIssues} issues found (${criticalIssues} critical, ${highIssues} high, ${mediumIssues} medium)">
      <![CDATA[${review.substring(0, 1000)}...]]>
    </failure>
    ` : ''}
    <system-out>
      <![CDATA[
      Review Summary:
      - Critical Issues: ${criticalIssues}
      - High Priority Issues: ${highIssues}
      - Medium Priority Issues: ${mediumIssues}
      - Total Issues: ${totalIssues}
      ]]>
    </system-out>
  </testcase>
</testsuite>`;

  fs.writeFileSync('review-report.xml', junitXml);
}

async function generateSummaryReport(review, stats) {
  console.log('📊 Generating summary report...');

  const summary = `# AI Review Summary

**Generated**: ${new Date().toISOString()}
**Repository**: ${CONFIG.repository}
**Branch**: ${CONFIG.branch}
**Commit**: ${CONFIG.headSha}

## Changes
- **Files**: ${stats.files || 'N/A'}
- **Additions**: +${stats.additions}
- **Deletions**: -${stats.deletions}

## Review Configuration
- **Depth**: ${CONFIG.reviewDepth}
- **Focus**: ${CONFIG.focusArea}
- **AI Provider**: ${CONFIG.aiProvider}

## Quick Stats
- **Critical Issues**: ${(review.match(/\*\*Critical|CRITICAL|🔴/g) || []).length}
- **High Issues**: ${(review.match(/\*\*High|HIGH|🔶/g) || []).length}
- **Medium Issues**: ${(review.match(/\*\*Medium|MEDIUM|🟡/g) || []).length}

---

${review}
`;

  fs.writeFileSync('review_summary.md', summary);
}

async function saveFailureReport(error) {
  const failureReport = `# AI Review Failed

**Error**: ${error.message}
**Timestamp**: ${new Date().toISOString()}
**Repository**: ${CONFIG.repository}
**Branch**: ${CONFIG.branch}

## Configuration
- Review Depth: ${CONFIG.reviewDepth}
- Focus Area: ${CONFIG.focusArea}
- AI Provider: ${CONFIG.aiProvider}

## Error Details
\`\`\`
${error.stack || error.message}
\`\`\`

## Troubleshooting
1. Check that API keys are properly configured
2. Verify the extension was built successfully
3. Check network connectivity to AI providers
4. Ensure git repository is in a valid state
`;

  fs.writeFileSync('ai_review.md', failureReport);
  fs.writeFileSync('review_error.log', error.stack || error.message);
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main };