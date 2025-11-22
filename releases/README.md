# Releases

This folder contains built VSIX packages for the Reviewer extension.

## Version History

### v0.0.2 (Latest)
- Added OpenRouter support for 100+ AI models
- Implemented custom sidebar with 4 panels
- Enhanced prompt system with specialized AI agents
- Added "Prompt for Agent" feature (revolutionary!)
- Multi-language support and context-aware reviews

### v0.0.1
- Initial release
- Basic Gemini integration
- Comprehensive diff reports
- AI-powered code reviews

## Installation

To install a VSIX file:

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type: `Extensions: Install from VSIX...`
4. Select the desired `.vsix` file from this folder
5. Reload VS Code when prompted

## Note

VSIX files are excluded from Git via `.gitignore` to keep the repository size manageable. To build a new release:

```bash
npm run compile
npx @vscode/vsce package
```

The new VSIX file will be created in the root directory and should be moved here.