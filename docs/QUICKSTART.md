# 🚀 Quick Start Guide - Reviewer Extension

## Installation (2 minutes)

### Step 1: Install the Extension
```bash
code --install-extension reviewer-0.0.1.vsix
```

Or manually:
1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Extensions: Install from VSIX..."
4. Select `reviewer-0.0.1.vsix`
5. Restart VS Code

### Step 2: Get Gemini API Key
1. Visit https://makersuite.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key (starts with `AIza...`)

### Step 3: Test It!
1. Open any Git repository in VS Code
2. Click the "$(diff) Comprehensive Diff" button in the status bar
3. Select "Working directory changes"
4. See your first diff report!

## First AI Review (3 minutes)

1. Make some code changes
2. Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
3. Select comparison mode (e.g., "Staged changes")
4. Enter your Gemini API key when prompted
5. Wait 10-30 seconds
6. View your AI code review!

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Shift+D` | Generate Comprehensive Diff |
| `Cmd/Ctrl+Shift+R` | Generate AI Review |

## Common Tasks

### Change AI Model
```json
// Settings.json
{
  "reviewer.aiModel": "gemini-3-pro-preview" // or gemini-1.5-pro, gemini-1.5-flash
}
```

### Exclude More Files
```json
{
  "reviewer.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.min.js",
    "**/build/**"
  ]
}
```

### Custom Review Prompt
```json
{
  "reviewer.customPrompt": "Review focusing on:\n1. Security vulnerabilities\n2. Performance issues\n3. Code maintainability"
}
```

### Save Reports to Folder
```json
{
  "reviewer.outputDirectory": "code-reviews"
}
```

## Tips

💡 **Use staged changes** for faster reviews (less code to analyze)

💡 **Compare with main branch** before creating PRs

💡 **Use gemini-1.5-flash** for faster, cheaper reviews

💡 **Check logs** if something fails: `Cmd+Shift+P` → "Reviewer: Show Logs"

💡 **Clear API key** if you need to change it: `Cmd+Shift+P` → "Reviewer: Clear Gemini API Key"

## Troubleshooting

### "Not inside a Git repository"
- Make sure you're in a folder with a `.git` directory
- Run `git init` if needed

### "API quota exceeded"
- Check your usage at https://makersuite.google.com
- Wait for quota reset
- Upgrade your API plan

### "No changes found"
- Make some code changes first
- Or try different comparison mode

### Extension not working?
1. Check logs: `Cmd+Shift+P` → "Reviewer: Show Logs"
2. Restart VS Code
3. Reinstall extension

## Next Steps

📖 Read the full [README.md](README.md) for all features

⚙️ Customize settings in VS Code preferences

🎨 Try different comparison modes

🤖 Experiment with different AI models

💬 Create custom review prompts for your team

---

**Need help?** Check the logs with `Reviewer: Show Logs` command!
