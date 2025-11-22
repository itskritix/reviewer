import * as vscode from 'vscode';
import * as path from 'path';

export interface ReviewIssue {
  line: number;
  column?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'performance' | 'architecture' | 'testing' | 'documentation' | 'general';
  title: string;
  description: string;
  suggestion: string;
  agentPrompt?: string;
  file?: string;
}

export interface ReviewData {
  title: string;
  timestamp: string;
  branch: string;
  repository: string;
  provider: string;
  model: string;
  summary: string;
  issues: ReviewIssue[];
  codeContent: { [file: string]: string };
  diffContent: string;
}

export class InteractiveReviewPanel {
  public static currentPanel: InteractiveReviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, reviewData: ReviewData) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    // If we already have a panel, show it
    if (InteractiveReviewPanel.currentPanel) {
      InteractiveReviewPanel.currentPanel.panel.reveal(column);
      InteractiveReviewPanel.currentPanel.updateContent(reviewData);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'interactiveReview',
      'Interactive Code Review',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'resources')
        ]
      }
    );

    InteractiveReviewPanel.currentPanel = new InteractiveReviewPanel(panel, extensionUri);
    InteractiveReviewPanel.currentPanel.updateContent(reviewData);
  }

  private constructor(panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri) {
    this.panel = panel;

    // Set the webview's initial html content
    this.updateContent({} as ReviewData);

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'openFile':
            this.openFile(message.file, message.line);
            break;
          case 'copyAgentPrompt':
            this.copyAgentPrompt(message.prompt);
            break;
          case 'applyFix':
            this.applyFix(message.file, message.line, message.suggestion);
            break;
          case 'jumpToIssue':
            this.jumpToIssue(message.file, message.line);
            break;
          case 'filterBySeverity':
            this.filterBySeverity(message.severity);
            break;
          case 'filterByCategory':
            this.filterByCategory(message.category);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  private updateContent(reviewData: ReviewData) {
    this.panel.title = reviewData.title || 'Interactive Code Review';
    this.panel.webview.html = this.getWebviewContent(reviewData);
  }

  private getWebviewContent(reviewData: ReviewData): string {
    // Get URIs for resources
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'resources', 'review-panel.css')
    );
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'resources', 'review-panel.js')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Interactive Code Review</title>
</head>
<body>
    <div class="review-container">
        <!-- Header -->
        <div class="review-header">
            <div class="review-title">
                <h1>${reviewData.title || 'Code Review'}</h1>
                <div class="review-metadata">
                    <span class="metadata-item">📅 ${reviewData.timestamp || new Date().toLocaleString()}</span>
                    <span class="metadata-item">🌿 ${reviewData.branch || 'main'}</span>
                    <span class="metadata-item">🏗️ ${reviewData.repository || 'Repository'}</span>
                    <span class="metadata-item">🤖 ${reviewData.provider || 'AI'} (${reviewData.model || 'model'})</span>
                </div>
            </div>
        </div>

        <!-- Summary -->
        <div class="review-summary">
            <h2>📋 Summary</h2>
            <p>${reviewData.summary || 'No summary available'}</p>
        </div>

        <!-- Filters and Controls -->
        <div class="review-controls">
            <div class="filter-group">
                <label for="severity-filter">Severity:</label>
                <select id="severity-filter" onchange="filterBySeverity(this.value)">
                    <option value="">All Severities</option>
                    <option value="critical">🔴 Critical</option>
                    <option value="high">🟠 High</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="low">🔵 Low</option>
                    <option value="info">ℹ️ Info</option>
                </select>
            </div>
            <div class="filter-group">
                <label for="category-filter">Category:</label>
                <select id="category-filter" onchange="filterByCategory(this.value)">
                    <option value="">All Categories</option>
                    <option value="security">🛡️ Security</option>
                    <option value="performance">⚡ Performance</option>
                    <option value="architecture">🏗️ Architecture</option>
                    <option value="testing">🧪 Testing</option>
                    <option value="documentation">📚 Documentation</option>
                    <option value="general">📋 General</option>
                </select>
            </div>
            <div class="stats-summary">
                ${this.generateStatsHtml(reviewData.issues || [])}
            </div>
        </div>

        <!-- Issues List -->
        <div class="issues-container">
            <h2>🔍 Issues Found</h2>
            <div id="issues-list">
                ${this.generateIssuesHtml(reviewData.issues || [])}
            </div>
        </div>

        <!-- Code View -->
        <div class="code-container">
            <h2>💻 Code Changes</h2>
            <div class="code-tabs">
                <button class="tab-button active" onclick="showTab('diff')" id="diff-tab">Diff View</button>
                ${Object.keys(reviewData.codeContent || {}).map(file =>
                  `<button class="tab-button" onclick="showTab('${file}')" id="${file}-tab">${path.basename(file)}</button>`
                ).join('')}
            </div>
            <div class="code-content">
                <div id="diff-content" class="tab-content active">
                    <pre><code class="diff">${this.escapeHtml(reviewData.diffContent || 'No diff available')}</code></pre>
                </div>
                ${Object.entries(reviewData.codeContent || {}).map(([file, content]) =>
                  `<div id="${file}-content" class="tab-content">
                     <div class="file-header">
                       <span class="file-name">${file}</span>
                       <button onclick="openFile('${file}', 1)" class="open-file-btn">Open in Editor</button>
                     </div>
                     <pre><code class="language-auto" data-file="${file}">${this.highlightCode(content, file, reviewData.issues || [])}</code></pre>
                   </div>`
                ).join('')}
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        // Pass review data to JavaScript
        window.reviewData = ${JSON.stringify(reviewData)};
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private generateStatsHtml(issues: ReviewIssue[]): string {
    const stats = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
      info: issues.filter(i => i.severity === 'info').length
    };

    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    return `
      <div class="stats-item">Total: <strong>${total}</strong></div>
      <div class="stats-item critical">Critical: <strong>${stats.critical}</strong></div>
      <div class="stats-item high">High: <strong>${stats.high}</strong></div>
      <div class="stats-item medium">Medium: <strong>${stats.medium}</strong></div>
      <div class="stats-item low">Low: <strong>${stats.low}</strong></div>
    `;
  }

  private generateIssuesHtml(issues: ReviewIssue[]): string {
    if (issues.length === 0) {
      return '<div class="no-issues">✅ No issues found! Great job!</div>';
    }

    return issues.map((issue, index) => `
      <div class="issue-card" data-severity="${issue.severity}" data-category="${issue.category}">
        <div class="issue-header">
          <span class="severity-badge ${issue.severity}">${this.getSeverityIcon(issue.severity)} ${issue.severity.toUpperCase()}</span>
          <span class="category-badge">${this.getCategoryIcon(issue.category)} ${issue.category}</span>
          <span class="issue-location" onclick="jumpToIssue('${issue.file || ''}', ${issue.line})">
            ${issue.file ? path.basename(issue.file) : 'Unknown'}:${issue.line}
          </span>
        </div>
        <div class="issue-content">
          <h3>${issue.title}</h3>
          <p class="issue-description">${issue.description}</p>
          <div class="issue-suggestion">
            <strong>💡 Suggestion:</strong>
            <p>${issue.suggestion}</p>
          </div>
          ${issue.agentPrompt ? `
            <div class="agent-prompt">
              <strong>🤖 Agent Prompt:</strong>
              <pre>${this.escapeHtml(issue.agentPrompt)}</pre>
              <button onclick="copyAgentPrompt(\`${this.escapeHtml(issue.agentPrompt)}\`)">📋 Copy Prompt</button>
            </div>
          ` : ''}
          <div class="issue-actions">
            ${issue.file ? `
              <button onclick="openFile('${issue.file}', ${issue.line})">📂 Open File</button>
              <button onclick="applyFix('${issue.file}', ${issue.line}, \`${this.escapeHtml(issue.suggestion)}\`)">🔧 Apply Fix</button>
            ` : ''}
            <button onclick="jumpToIssue('${issue.file || ''}', ${issue.line})">🎯 Jump to Code</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  private highlightCode(content: string, file: string, issues: ReviewIssue[]): string {
    const lines = content.split('\n');
    const fileIssues = issues.filter(issue => issue.file === file);

    return lines.map((line, index) => {
      const lineNumber = index + 1;
      const issuesOnLine = fileIssues.filter(issue => issue.line === lineNumber);

      if (issuesOnLine.length > 0) {
        const maxSeverity = this.getMaxSeverity(issuesOnLine.map(i => i.severity));
        const issuesList = issuesOnLine.map(issue =>
          `${this.getSeverityIcon(issue.severity)} ${issue.title}`
        ).join('\\n');

        return `<span class="line-with-issue ${maxSeverity}" title="${issuesList}" onclick="showIssueDetails(${lineNumber})">${this.escapeHtml(line)}</span>`;
      }

      return this.escapeHtml(line);
    }).join('\n');
  }

  private getMaxSeverity(severities: string[]): string {
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    for (const severity of order) {
      if (severities.includes(severity)) {
        return severity;
      }
    }
    return 'info';
  }

  private getSeverityIcon(severity: string): string {
    const icons = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️'
    };
    return icons[severity as keyof typeof icons] || 'ℹ️';
  }

  private getCategoryIcon(category: string): string {
    const icons = {
      security: '🛡️',
      performance: '⚡',
      architecture: '🏗️',
      testing: '🧪',
      documentation: '📚',
      general: '📋'
    };
    return icons[category as keyof typeof icons] || '📋';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private async openFile(file: string, line: number) {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const editor = await vscode.window.showTextDocument(document);

      // Jump to the specific line
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file ${file}: ${error}`);
    }
  }

  private copyAgentPrompt(prompt: string) {
    vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Agent prompt copied to clipboard!');
  }

  private async applyFix(file: string, line: number, suggestion: string) {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
      const editor = await vscode.window.showTextDocument(document);

      // Show suggestion as a comment or in a dialog
      const action = await vscode.window.showInformationMessage(
        `Apply suggested fix at line ${line}?`,
        'Apply Fix',
        'Show Suggestion',
        'Cancel'
      );

      if (action === 'Apply Fix') {
        // This is a placeholder - actual implementation would depend on the fix type
        vscode.window.showInformationMessage('Fix application feature coming soon! For now, please apply manually.');
      } else if (action === 'Show Suggestion') {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));

        vscode.window.showInformationMessage(suggestion, { modal: true });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to apply fix: ${error}`);
    }
  }

  private async jumpToIssue(file: string, line: number) {
    if (file) {
      await this.openFile(file, line);
    }

    // Also scroll the webview to the corresponding issue
    this.panel.webview.postMessage({
      command: 'highlightIssue',
      line: line
    });
  }

  private filterBySeverity(severity: string) {
    this.panel.webview.postMessage({
      command: 'applyFilter',
      type: 'severity',
      value: severity
    });
  }

  private filterByCategory(category: string) {
    this.panel.webview.postMessage({
      command: 'applyFilter',
      type: 'category',
      value: category
    });
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose() {
    InteractiveReviewPanel.currentPanel = undefined;

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}