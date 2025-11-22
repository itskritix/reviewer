import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface CIConfig {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'custom';
  enabled: boolean;
  triggerOnPR: boolean;
  triggerOnPush: boolean;
  reviewDepth: 'surface' | 'standard' | 'deep';
  focusArea: 'comprehensive' | 'security' | 'performance' | 'architecture' | 'testing' | 'documentation';
  webhookUrl?: string;
  apiKey?: string;
}

export class CIIntegration {
  private config: CIConfig;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.config = this.loadConfig();
  }

  /**
   * Initialize CI/CD integration for the current workspace
   */
  async initializeCIIntegration(): Promise<void> {
    const provider = await this.promptForProvider();
    if (!provider) return;

    this.config.provider = provider as 'github' | 'gitlab' | 'bitbucket' | 'custom';
    this.config.enabled = true;

    await this.setupProvider(provider);
    await this.saveConfig();

    vscode.window.showInformationMessage(
      `✅ CI/CD integration configured for ${provider}`,
      'View Files'
    ).then(action => {
      if (action === 'View Files') {
        this.showGeneratedFiles();
      }
    });
  }

  /**
   * Setup provider-specific CI configuration
   */
  private async setupProvider(provider: string): Promise<void> {
    switch (provider) {
      case 'github':
        await this.setupGitHubActions();
        break;
      case 'gitlab':
        await this.setupGitLabCI();
        break;
      case 'bitbucket':
        await this.setupBitbucketPipelines();
        break;
      case 'custom':
        await this.setupCustomWebhook();
        break;
    }
  }

  /**
   * Setup GitHub Actions workflow
   */
  private async setupGitHubActions(): Promise<void> {
    const workflowDir = path.join(this.workspaceRoot, '.github', 'workflows');
    const workflowFile = path.join(workflowDir, 'reviewer-ai.yml');

    // Create .github/workflows directory if it doesn't exist
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
    }

    // Copy our workflow template
    const templatePath = path.join(__dirname, '../..', '.github', 'workflows', 'reviewer-ci.yml');
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, workflowFile);
    }

    // Create setup instructions
    const readmePath = path.join(this.workspaceRoot, '.github', 'REVIEWER_SETUP.md');
    const setupInstructions = this.generateGitHubSetupInstructions();
    fs.writeFileSync(readmePath, setupInstructions);
  }

  /**
   * Setup GitLab CI configuration
   */
  private async setupGitLabCI(): Promise<void> {
    const ciFile = path.join(this.workspaceRoot, '.gitlab-ci.yml');

    const gitlabConfig = `
# AI Code Review with Reviewer Extension
stages:
  - review

variables:
  REVIEW_DEPTH: "standard"
  FOCUS_AREA: "comprehensive"

ai-code-review:
  stage: review
  image: node:18-alpine
  before_script:
    - apk add --no-cache git
    - npm install -g @vscode/vsce
  script:
    - npm ci
    - npm run compile
    - vsce package --out reviewer-ci.vsix
    - node scripts/ci-review.js
  artifacts:
    reports:
      junit: review-report.xml
    paths:
      - ai_review.md
      - review-report.xml
    expire_in: 30 days
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH == "develop"

security-review:
  extends: ai-code-review
  variables:
    FOCUS_AREA: "security"
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes:
        - "**/*auth*"
        - "**/*security*"
        - "**/*login*"
        - "**/*password*"
`;

    fs.writeFileSync(ciFile, gitlabConfig.trim());
  }

  /**
   * Setup Bitbucket Pipelines
   */
  private async setupBitbucketPipelines(): Promise<void> {
    const pipelineFile = path.join(this.workspaceRoot, 'bitbucket-pipelines.yml');

    const bitbucketConfig = `
image: node:18

definitions:
  steps:
    - step: &ai-review
        name: AI Code Review
        caches:
          - node
        script:
          - npm ci
          - npm run compile
          - npx @vscode/vsce package --out reviewer-ci.vsix
          - node scripts/ci-review.js
        artifacts:
          - ai_review.md
          - review-report.xml

pipelines:
  pull-requests:
    '**':
      - step: *ai-review

  branches:
    main:
      - step: *ai-review
    master:
      - step: *ai-review
    develop:
      - step: *ai-review

  custom:
    security-review:
      - step:
          <<: *ai-review
          name: Security-Focused Review
          script:
            - export FOCUS_AREA="security"
            - npm ci
            - npm run compile
            - node scripts/ci-review.js
`;

    fs.writeFileSync(pipelineFile, bitbucketConfig.trim());
  }

  /**
   * Setup custom webhook integration
   */
  private async setupCustomWebhook(): Promise<void> {
    const webhookUrl = await vscode.window.showInputBox({
      prompt: 'Enter webhook URL for custom CI integration',
      placeHolder: 'https://your-ci-system.com/webhook'
    });

    if (webhookUrl) {
      this.config.webhookUrl = webhookUrl;

      // Create webhook handler script
      const webhookScript = this.generateWebhookScript(webhookUrl);
      const scriptPath = path.join(this.workspaceRoot, 'scripts', 'webhook-ci.js');

      if (!fs.existsSync(path.dirname(scriptPath))) {
        fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      }

      fs.writeFileSync(scriptPath, webhookScript);
    }
  }

  /**
   * Generate GitHub setup instructions
   */
  private generateGitHubSetupInstructions(): string {
    return `
# Reviewer AI - GitHub Actions Setup

## Required Secrets

To enable AI code reviews in your GitHub Actions, add these secrets to your repository:

### Repository Secrets (Settings → Secrets → Actions)

1. **GEMINI_API_KEY** (Required)
   - Get from: https://makersuite.google.com/app/apikey
   - Used for: AI code review generation

2. **OPENROUTER_API_KEY** (Optional)
   - Get from: https://openrouter.ai/settings/keys
   - Used for: Alternative AI models (GPT-4, Claude, etc.)

## Workflow Configuration

The workflow is configured to:
- ✅ Run on pull requests to main/master/develop branches
- ✅ Run on pushes to main/master branches
- ✅ Support manual triggers with custom parameters
- ✅ Post review comments on PRs
- ✅ Create summary issues for main branch pushes
- ✅ Generate downloadable review artifacts

## Customization

You can customize the review behavior by:

1. **Editing workflow inputs** in \`.github/workflows/reviewer-ai.yml\`
2. **Adding custom focus areas** for specific file patterns
3. **Configuring review depth** based on change size
4. **Setting up conditional reviews** for security-sensitive files

## Usage

### Automatic Reviews
- Reviews run automatically on PR creation and updates
- Main branch pushes generate summary issues

### Manual Reviews
- Go to Actions → AI Code Review → Run workflow
- Select review depth and focus area
- Choose specific branch if needed

### Review Outputs
- **PR Comments**: Detailed review posted as PR comment
- **Issues**: Summary issues for main branch changes
- **Artifacts**: Downloadable review files (30-day retention)

## Troubleshooting

If reviews fail:
1. Check that API keys are correctly set in repository secrets
2. Verify the extension builds successfully
3. Check Actions logs for specific error messages
4. Ensure repository has proper permissions for the workflow

## Security Note

- API keys are stored as encrypted secrets
- Reviews only access code in the repository
- No sensitive data is sent to external services beyond the AI providers
`;
  }

  /**
   * Generate custom webhook script
   */
  private generateWebhookScript(webhookUrl: string): string {
    return `
#!/usr/bin/env node

/**
 * Custom CI Webhook Integration for Reviewer AI
 */

const https = require('https');
const fs = require('fs');
const { PromptManager } = require('../out/src/prompts/PromptManager.js');

async function sendWebhookReview() {
  try {
    // Read review data
    const review = fs.readFileSync('ai_review.md', 'utf8');
    const changedFiles = fs.readFileSync('changed_files.txt', 'utf8');

    const payload = {
      timestamp: new Date().toISOString(),
      review: review,
      files: changedFiles.split('\\n').filter(f => f.trim()),
      repository: process.env.GITHUB_REPOSITORY || process.env.CI_PROJECT_PATH,
      branch: process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_REF_NAME,
      commit: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA
    };

    // Send to webhook
    await sendWebhook('${webhookUrl}', payload);
    console.log('Review sent to webhook successfully');

  } catch (error) {
    console.error('Webhook failed:', error);
    process.exit(1);
  }
}

function sendWebhook(url, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Reviewer-AI-Extension'
      }
    };

    const req = https.request(url, options, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res);
      } else {
        reject(new Error(\`Webhook failed with status: \${res.statusCode}\`));
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

sendWebhookReview();
`;
  }

  /**
   * Prompt user to select CI provider
   */
  private async promptForProvider(): Promise<string | undefined> {
    const providers = [
      { label: '🐙 GitHub Actions', value: 'github', description: 'Integrate with GitHub Actions workflows' },
      { label: '🦊 GitLab CI', value: 'gitlab', description: 'Integrate with GitLab CI/CD pipelines' },
      { label: '🪣 Bitbucket Pipelines', value: 'bitbucket', description: 'Integrate with Bitbucket Pipelines' },
      { label: '🔗 Custom Webhook', value: 'custom', description: 'Custom CI system with webhook support' }
    ];

    const selected = await vscode.window.showQuickPick(providers, {
      placeHolder: 'Select your CI/CD provider',
      title: 'CI/CD Integration Setup'
    });

    return selected?.value;
  }

  /**
   * Show generated files to user
   */
  private async showGeneratedFiles(): Promise<void> {
    const files: string[] = [];

    switch (this.config.provider) {
      case 'github':
        files.push('.github/workflows/reviewer-ai.yml', '.github/REVIEWER_SETUP.md');
        break;
      case 'gitlab':
        files.push('.gitlab-ci.yml');
        break;
      case 'bitbucket':
        files.push('bitbucket-pipelines.yml');
        break;
      case 'custom':
        files.push('scripts/webhook-ci.js');
        break;
    }

    for (const file of files) {
      const filePath = path.join(this.workspaceRoot, file);
      if (fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      }
    }
  }

  /**
   * Load CI configuration
   */
  private loadConfig(): CIConfig {
    const configPath = path.join(this.workspaceRoot, '.vscode', 'reviewer-ci.json');

    if (fs.existsSync(configPath)) {
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.error('Failed to load CI config:', e);
      }
    }

    return {
      provider: 'github' as const,
      enabled: false,
      triggerOnPR: true,
      triggerOnPush: true,
      reviewDepth: 'standard',
      focusArea: 'comprehensive'
    };
  }

  /**
   * Save CI configuration
   */
  private async saveConfig(): Promise<void> {
    const configDir = path.join(this.workspaceRoot, '.vscode');
    const configPath = path.join(configDir, 'reviewer-ci.json');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Check if CI integration is configured
   */
  isConfigured(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): CIConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<CIConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }
}