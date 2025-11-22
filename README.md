# Reviewer - AI Code Review Assistant

![Version](https://img.shields.io/badge/version-0.0.2-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-green.svg)
![Local Install](https://img.shields.io/badge/install-local%20VSIX-orange.svg)

A powerful VS Code extension that generates comprehensive diff reports and AI-powered code reviews using Google Gemini or OpenRouter. Features an interactive review panel for visualizing issues and copying agent prompts.

## Features

### 🔍 Comprehensive Diff Reports
Generate detailed markdown reports of your Git changes with:
- Complete file contents with syntax highlighting
- Full git diff output
- File statistics (lines, size)
- Smart filtering (excludes binaries, large files, node_modules)

### 🤖 AI-Powered Code Reviews
Get intelligent code reviews from multiple AI providers:
- **Google Gemini** - Fast and efficient analysis
- **OpenRouter** - Access to GPT-4, Claude, and 100+ models
- Analyzes bugs, security issues, and performance problems
- Provides actionable feedback with line numbers
- Customizable review prompts
- **Interactive Review Panel** - Visual issue browser with filtering
- **Copy Agent Prompts** - One-click copying for AI assistants

### 🎨 Interactive Review Panel
Visualize and manage code review results:
- **Issue Dashboard** - See all issues with severity and category badges
- **Smart Filtering** - Filter by severity (critical, high, medium, low) or category
- **Agent Prompt Integration** - Copy prompts for use with AI coding assistants
- **Quick Navigation** - Jump directly to problematic code lines
- **Statistics Overview** - Review summary with issue counts

### ⚡ Multiple Comparison Modes
Choose from 7 flexible comparison options:
1. **Staged changes** - Review what you're about to commit
2. **Working directory changes** - See all uncommitted changes
3. **All changes since last commit** - Everything since HEAD
4. **Compare with another branch** - Cross-branch comparison
5. **Compare with specific commit** - Point-in-time comparison
6. **Compare with origin/main** - Check against main branch
7. **Compare with origin/master** - Check against master branch

## Installation

### 🚀 Local Installation (Recommended - Skip Microsoft's Bureaucracy!)

The extension is distributed as a `.vsix` file for easy local installation without dealing with marketplace approval processes.

#### Method 1: VS Code GUI (Easiest)
1. Download `reviewer-0.0.2.vsix` from the releases
2. Open VS Code
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type "Extensions: Install from VSIX..."
5. Select the `reviewer-0.0.2.vsix` file
6. **Done!** 🎉 The extension is immediately available

#### Method 2: Command Line
```bash
# If you have the 'code' command available:
code --install-extension reviewer-0.0.2.vsix

# Or with full path to VS Code:
/Applications/Visual\ Studio\ Code.app/Contents/Resources/app/bin/code --install-extension reviewer-0.0.2.vsix
```

### 🔄 Easy Updates
When a new version is released:
1. Download the new `.vsix` file
2. Install using the same method above
3. VS Code will automatically update the extension

### From Source
```bash
git clone <repository-url>
cd reviewer
npm install
npm run compile
code .
# Press F5 to run in development mode
```

## Setup

### Get API Keys

#### For Google Gemini:
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. The extension will prompt you for it on first use

#### For OpenRouter:
1. Visit [OpenRouter](https://openrouter.ai/settings/keys)
2. Create an account and get an API key
3. The extension will prompt you for it when you select OpenRouter

Your keys are stored securely using VS Code's SecretStorage

## Usage

### Quick Start
1. Click the "$(diff) Comprehensive Diff" button in the status bar
2. Or use the robot icon in the Source Control panel for AI reviews
3. Select a comparison mode
4. View your generated report
5. **New!** Click "Open Interactive Review" to see the visual issue browser

### Keyboard Shortcuts
- **Cmd+Shift+D** (Mac) / **Ctrl+Shift+D** (Windows/Linux) - Generate Comprehensive Diff
- **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows/Linux) - Generate AI Review

### Commands
Access via Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

#### Core Features
- `Reviewer: Generate Comprehensive Diff`
- `Reviewer: Generate AI Review`
- `Reviewer: Open Interactive Review` ⭐ **New!**

#### Specialized Reviews
- `Reviewer: Generate Comprehensive Review`
- `Reviewer: Generate Security Review`
- `Reviewer: Generate Performance Review`
- `Reviewer: Generate Architecture Review`
- `Reviewer: Generate Testing Review`
- `Reviewer: Generate Documentation Review`

#### Utilities
- `Reviewer: Clear API Keys`
- `Reviewer: Show Logs`
- `Reviewer: Switch AI Provider`

## Configuration

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `reviewer.maxFileSize` | number | 1048576 (1MB) | Maximum file size in bytes to include in reports |
| `reviewer.excludePatterns` | array | `["**/node_modules/**", "**/package-lock.json", "**/yarn.lock", "**/*.log"]` | Glob patterns to exclude from diffs |
| `reviewer.aiProvider` | string | `gemini` | AI provider to use (`gemini`, `openrouter`) |
| `reviewer.aiModel` | string | `gemini-3-pro-preview` | Gemini AI model (`gemini-3-pro-preview`, `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash-exp`) |
| `reviewer.openRouterModel` | string | `openai/gpt-4o` | OpenRouter model (e.g., `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `google/gemini-pro-1.5`) |
| `reviewer.customPrompt` | string | `""` | Custom AI review prompt (leave empty for default) |
| `reviewer.outputDirectory` | string | `""` | Custom directory for reports (relative to workspace root) |
| `reviewer.autoOpenReports` | boolean | `true` | Automatically open reports after generation |

### Example Configuration

```json
{
  "reviewer.maxFileSize": 2097152,
  "reviewer.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.min.js",
    "**/package-lock.json"
  ],
  "reviewer.aiProvider": "openrouter",
  "reviewer.openRouterModel": "anthropic/claude-3.5-sonnet",
  "reviewer.outputDirectory": "code-reviews",
  "reviewer.autoOpenReports": true
}
```

### Custom AI Prompts

Create your own review criteria:

```json
{
  "reviewer.customPrompt": "Review this code focusing on:\n1. TypeScript type safety\n2. React best practices\n3. Performance optimization\n4. Accessibility (a11y)\n\nProvide specific line numbers and fixes."
}
```

## Features in Detail

### Security Features
- ✅ **Secure API Key Storage** - Uses VS Code SecretStorage (encrypted)
- ✅ **Command Injection Protection** - Safe git command execution
- ✅ **Path Traversal Prevention** - Sanitized filenames
- ✅ **Comprehensive Error Logging** - Debug issues easily

### Code Quality
- ✅ **TypeScript Interfaces** - Full type safety
- ✅ **Zero Code Duplication** - Refactored shared logic
- ✅ **Proper Error Handling** - User-friendly messages
- ✅ **Modular Architecture** - Clean, maintainable code

### User Experience
- ✅ **Cancellable Operations** - Stop long-running tasks
- ✅ **Progress Indicators** - Know what's happening
- ✅ **Actionable Error Messages** - Clear guidance when things fail
- ✅ **Configurable Everything** - Customize to your needs

## Generated Reports

### Comprehensive Diff Report Format
```markdown
# Comprehensive Diff Report

**Generated on:** [timestamp]
**Branch:** [current-branch]
**Comparison:** [comparison-mode]

## Summary
- Total files changed
- List of changed files

## Git Diff
- Complete diff output with syntax highlighting

## Complete File Contents
- Full contents of each changed file
- With language-specific syntax highlighting
- File statistics (lines, size)
```

### AI Review Report Format
```markdown
# AI Code Review Report

**Generated on:** [timestamp]
**Branch:** [current-branch]
**Comparison:** [comparison-mode]
**AI Provider:** [provider-name (model)]

[AI-generated review with:]
- Critical Issues
- High Priority Issues
- Medium/Low Priority Issues
- Final Assessment (APPROVE/NEEDS CHANGES/REJECT)
- Production Readiness Analysis
```

## Supported File Types

Syntax highlighting for 30+ languages:
- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`)
- PHP (`.php`)
- Ruby (`.rb`)
- Swift (`.swift`)
- Kotlin (`.kt`)
- Dart (`.dart`)
- Vue (`.vue`)
- HTML/CSS (`.html`, `.css`, `.scss`)
- YAML/JSON (`.yaml`, `.json`)
- Markdown (`.md`)
- And more...

## Troubleshooting

### API Key Issues
```bash
# Clear your stored API keys
Cmd+Shift+P → "Reviewer: Clear API Keys"
```

### View Logs
```bash
# Check detailed logs
Cmd+Shift+P → "Reviewer: Show Logs"
```

### Common Issues

**Q: "Not inside a Git repository"**
- Ensure you're in a Git-initialized folder
- Check that `.git` folder exists

**Q: "API quota exceeded"**
- Check your Gemini API usage at Google AI Studio
- Consider upgrading your API plan
- Try `gemini-1.5-flash` for lower costs

**Q: "Branch not found"**
- Verify branch name spelling
- Run `git fetch` to update remote branches

**Q: Reports too large**
- Reduce `reviewer.maxFileSize`
- Add more patterns to `reviewer.excludePatterns`
- Review specific files instead of all changes

## Performance Tips

1. **Use Flash Model** - `gemini-1.5-flash` is faster and cheaper
2. **Exclude Large Files** - Add patterns to `excludePatterns`
3. **Reduce File Size Limit** - Lower `maxFileSize` if needed
4. **Review Staged Changes** - Smaller diffs = faster processing
5. **Custom Output Directory** - Keep reports organized

## Changelog

### v0.0.2 (2025-11-22) - Interactive Review Panel
- ⭐ **New Interactive Review Panel** - Visual issue browser with filtering
- 🤖 **Agent Prompt Integration** - Copy prompts for AI coding assistants
- 📊 **Issue Statistics** - Dashboard with severity and category breakdowns
- 🔍 **Smart Filtering** - Filter by severity, category, or search terms
- 🎯 **Quick Navigation** - Jump directly to problematic code lines
- 🏷️ **Specialized Reviews** - Security, Performance, Architecture, Testing, Documentation
- 📈 **Review History & Storage** - Track and manage past reviews
- 🔄 **Enhanced Parsing** - Better issue extraction and categorization
- Added OpenRouter support for 100+ AI models
- Support for GPT-4, Claude, and other models via OpenRouter
- Multi-provider API key management
- Enhanced error handling for different providers

### v0.0.1 (2025-01-21)
- Initial release
- Comprehensive diff reports
- AI-powered code reviews with Gemini
- 7 comparison modes
- Secure API key storage
- Full TypeScript type safety
- Configurable exclusion patterns
- Keyboard shortcuts
- Cancellable operations

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Why Local Installation?

We chose to distribute via `.vsix` files instead of the VS Code Marketplace to:
- ⚡ **Skip bureaucracy** - No publisher accounts, approvals, or delays
- 🔒 **Maintain control** - Direct updates without marketplace restrictions
- 🚀 **Faster releases** - Push updates immediately when ready
- 💰 **No fees** - Avoid marketplace fees or restrictions
- 🛠️ **Easy development** - Install directly from build artifacts

## License

MIT - See [LICENSE](LICENSE) file for details

## Support

- 📧 Report issues on GitHub
- 💬 Check logs with `Reviewer: Show Logs`
- 📖 Read the [Gemini AI Documentation](https://ai.google.dev/docs)
- 📖 Read the [OpenRouter Documentation](https://openrouter.ai/docs)

---

**Made with ❤️ for developers who care about code quality**
