import * as fs from 'fs';
import * as path from 'path';

export interface ParsedReviewIssue {
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

export interface ParsedReviewData {
  title: string;
  timestamp: string;
  branch: string;
  repository: string;
  provider: string;
  model: string;
  summary: string;
  issues: ParsedReviewIssue[];
  codeContent: { [file: string]: string };
  diffContent: string;
}

export class ReviewParser {
  /**
   * Parse an AI review markdown file and extract structured data
   */
  static parseReviewFile(filePath: string): ParsedReviewData {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Review file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    return this.parseReviewContent(content, fileName);
  }

  /**
   * Parse AI review content and extract structured data
   */
  static parseReviewContent(content: string, fileName?: string): ParsedReviewData {
    const result: ParsedReviewData = {
      title: fileName || 'AI Code Review',
      timestamp: new Date().toISOString(),
      branch: 'main',
      repository: 'unknown',
      provider: 'AI',
      model: 'unknown',
      summary: '',
      issues: [],
      codeContent: {},
      diffContent: ''
    };

    // Parse metadata from header
    this.parseMetadata(content, result);

    // Parse summary
    this.parseSummary(content, result);

    // Parse issues
    this.parseIssues(content, result);

    // Parse code and diff content
    this.parseCodeContent(content, result);

    return result;
  }

  private static parseMetadata(content: string, result: ParsedReviewData): void {
    // Extract timestamp
    const timestampMatch = content.match(/\*\*Generated on\*\*: (.+)/i) ||
                          content.match(/Generated on: (.+)/i) ||
                          content.match(/\*\*Date\*\*: (.+)/i);
    if (timestampMatch) {
      result.timestamp = timestampMatch[1].trim();
    }

    // Extract branch
    const branchMatch = content.match(/\*\*Branch\*\*: (.+)/i) ||
                       content.match(/Branch: (.+)/i);
    if (branchMatch) {
      result.branch = branchMatch[1].trim();
    }

    // Extract repository
    const repoMatch = content.match(/\*\*Repository\*\*: (.+)/i) ||
                     content.match(/Repository: (.+)/i);
    if (repoMatch) {
      result.repository = repoMatch[1].trim();
    }

    // Extract AI provider
    const providerMatch = content.match(/\*\*AI Provider\*\*: (.+)/i) ||
                         content.match(/Provider: (.+)/i);
    if (providerMatch) {
      result.provider = providerMatch[1].trim();
    }

    // Extract model
    const modelMatch = content.match(/\*\*Model\*\*: (.+)/i) ||
                      content.match(/Model: (.+)/i);
    if (modelMatch) {
      result.model = modelMatch[1].trim();
    }

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }
  }

  private static parseSummary(content: string, result: ParsedReviewData): void {
    // Look for summary sections
    const summaryMatches = [
      /## Summary\s*\n([\s\S]*?)(?=\n##|\n\*\*|$)/i,
      /## Review Summary\s*\n([\s\S]*?)(?=\n##|\n\*\*|$)/i,
      /## Overview\s*\n([\s\S]*?)(?=\n##|\n\*\*|$)/i
    ];

    for (const regex of summaryMatches) {
      const match = content.match(regex);
      if (match) {
        result.summary = this.cleanMarkdown(match[1]).substring(0, 500);
        break;
      }
    }

    // Fallback: use first paragraph
    if (!result.summary) {
      const firstParagraph = content.split('\n\n')[1];
      if (firstParagraph) {
        result.summary = this.cleanMarkdown(firstParagraph).substring(0, 300);
      }
    }
  }

  private static parseIssues(content: string, result: ParsedReviewData): void {
    // Pattern to match issue entries
    const issuePatterns = [
      // Pattern: **[SEVERITY] Issue Title (Line X)**
      /\*\*\[?(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]?\s+(.+?)\s*\((?:Line\s+)?(\d+)\)\*\*/gi,
      // Pattern: ### 🔴 CRITICAL - Issue Title (file.js:123)
      /###\s*[🔴🟠🟡🔵ℹ️]?\s*(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*-?\s*(.+?)\s*\(([^:]+):(\d+)\)/gi,
      // Pattern: ❌ **Critical Issue (Line 42)**: Description
      /[❌🔶🟡🔵ℹ️]\s*\*\*(.+?)\s*\((?:Line\s+)?(\d+)\)\*\*:?\s*(.+)/gi,
      // Pattern: **SEVERITY**: Issue title - Line X
      /\*\*(CRITICAL|HIGH|MEDIUM|LOW|INFO)\*\*:?\s*(.+?)\s*-?\s*Line\s+(\d+)/gi
    ];

    let issueIndex = 0;

    for (const pattern of issuePatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state

      while ((match = pattern.exec(content)) !== null) {
        const issue = this.extractIssueDetails(content, match, issueIndex++);
        if (issue) {
          result.issues.push(issue);
        }
      }
    }

    // If no issues found with patterns, try to extract from structured content
    if (result.issues.length === 0) {
      this.parseStructuredIssues(content, result);
    }

    // Sort issues by line number and severity
    result.issues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.line - b.line;
    });
  }

  private static extractIssueDetails(content: string, match: RegExpExecArray, index: number): ParsedReviewIssue | null {
    try {
      let severity: string;
      let title: string;
      let lineStr: string;
      let file: string | undefined;

      // Extract based on match groups
      if (match.length === 4) {
        [, severity, title, lineStr] = match;
      } else if (match.length === 5) {
        [, severity, title, file, lineStr] = match;
      } else {
        return null;
      }

      const line = parseInt(lineStr);

      // Normalize severity
      const normalizedSeverity = this.normalizeSeverity(severity);
      if (!normalizedSeverity) return null;

      // Get context around the match to extract more details
      const matchIndex = match.index || 0;
      const contextStart = Math.max(0, matchIndex - 200);
      const contextEnd = Math.min(content.length, matchIndex + 1000);
      const context = content.substring(contextStart, contextEnd);

      // Extract description and suggestion
      const { description, suggestion, agentPrompt, category } = this.extractIssueContext(context, title);

      return {
        line: line,
        severity: normalizedSeverity,
        category,
        title: this.cleanMarkdown(title),
        description: description || 'No description available',
        suggestion: suggestion || 'No specific suggestion provided',
        agentPrompt,
        file
      };

    } catch (error) {
      console.error('Failed to extract issue details:', error);
      return null;
    }
  }

  private static parseStructuredIssues(content: string, result: ParsedReviewData): void {
    // Try to find sections with issues
    const sections = content.split(/\n(?=##\s)/);

    for (const section of sections) {
      // Look for severity indicators
      const severityIndicators = ['critical', 'high', 'medium', 'low'];
      const hasSeverity = severityIndicators.some(s =>
        section.toLowerCase().includes(s) ||
        section.includes('🔴') ||
        section.includes('🟠') ||
        section.includes('🟡') ||
        section.includes('🔵')
      );

      if (hasSeverity) {
        // Extract line numbers and create issues
        const lineMatches = section.match(/line\s+(\d+)/gi);
        if (lineMatches) {
          lineMatches.forEach((lineMatch, index) => {
            const lineNum = parseInt(lineMatch.replace(/\D/g, ''));
            if (lineNum > 0) {
              const issue: ParsedReviewIssue = {
                line: lineNum,
                severity: this.inferSeverityFromContent(section),
                category: this.inferCategoryFromContent(section),
                title: this.extractTitleFromSection(section) || `Issue at line ${lineNum}`,
                description: this.extractDescriptionFromSection(section) || 'Issue found in code review',
                suggestion: this.extractSuggestionFromSection(section) || 'Review and address this issue'
              };

              result.issues.push(issue);
            }
          });
        }
      }
    }
  }

  private static extractIssueContext(context: string, title: string): {
    description: string;
    suggestion: string;
    agentPrompt?: string;
    category: ParsedReviewIssue['category'];
  } {
    // Extract description (usually follows the title)
    let description = '';
    const descLines = context.split('\n').slice(1, 5);
    description = descLines
      .filter(line => line.trim() && !line.startsWith('**') && !line.startsWith('#'))
      .join(' ')
      .substring(0, 300);

    // Extract suggestion
    let suggestion = '';
    const suggestionMatch = context.match(/(?:Suggestion|Fix|Solution|Recommendation):\s*([\s\S]*?)(?=\n\*\*|\n##|$)/i);
    if (suggestionMatch) {
      suggestion = this.cleanMarkdown(suggestionMatch[1]).substring(0, 400);
    }

    // Extract agent prompt
    let agentPrompt: string | undefined;
    const agentPromptMatch = context.match(/(?:Agent Prompt|🤖):\s*```?\s*([\s\S]*?)```?/i) ||
                            context.match(/Context:.*?\nTask:.*?\n/s);
    if (agentPromptMatch) {
      agentPrompt = agentPromptMatch[1].trim();
    }

    // Infer category from content
    const category = this.inferCategoryFromContent(context + title);

    return {
      description: description || 'No description available',
      suggestion: suggestion || 'Review and address this issue',
      agentPrompt,
      category
    };
  }

  private static parseCodeContent(content: string, result: ParsedReviewData): void {
    // Extract diff content
    const diffMatch = content.match(/```diff\n([\s\S]*?)\n```/) ||
                     content.match(/```\n([\s\S]*?)\n```/);
    if (diffMatch) {
      result.diffContent = diffMatch[1];
    }

    // Extract file contents
    const codeBlockPattern = /```(\w+)?\s*(?:\/\/\s*(.+))?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      const [, language, fileName, code] = match;

      if (fileName) {
        result.codeContent[fileName] = code;
      } else if (language && language !== 'diff') {
        // Generate a default filename based on language
        const ext = this.getExtensionForLanguage(language);
        const defaultName = `code.${ext}`;
        result.codeContent[defaultName] = code;
      }
    }
  }

  // Helper methods
  private static normalizeSeverity(severity: string): ParsedReviewIssue['severity'] | null {
    const normalized = severity.toLowerCase();
    if (normalized.includes('critical') || normalized.includes('🔴')) return 'critical';
    if (normalized.includes('high') || normalized.includes('🟠')) return 'high';
    if (normalized.includes('medium') || normalized.includes('🟡')) return 'medium';
    if (normalized.includes('low') || normalized.includes('🔵')) return 'low';
    if (normalized.includes('info') || normalized.includes('ℹ️')) return 'info';
    return null;
  }

  private static inferSeverityFromContent(content: string): ParsedReviewIssue['severity'] {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('critical') || lowerContent.includes('🔴')) return 'critical';
    if (lowerContent.includes('high') || lowerContent.includes('🟠')) return 'high';
    if (lowerContent.includes('medium') || lowerContent.includes('🟡')) return 'medium';
    if (lowerContent.includes('low') || lowerContent.includes('🔵')) return 'low';
    return 'info';
  }

  private static inferCategoryFromContent(content: string): ParsedReviewIssue['category'] {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('security') || lowerContent.includes('🛡️') ||
        lowerContent.includes('vulnerability') || lowerContent.includes('auth')) return 'security';

    if (lowerContent.includes('performance') || lowerContent.includes('⚡') ||
        lowerContent.includes('optimization') || lowerContent.includes('slow')) return 'performance';

    if (lowerContent.includes('architecture') || lowerContent.includes('🏗️') ||
        lowerContent.includes('design') || lowerContent.includes('pattern')) return 'architecture';

    if (lowerContent.includes('test') || lowerContent.includes('🧪') ||
        lowerContent.includes('coverage')) return 'testing';

    if (lowerContent.includes('document') || lowerContent.includes('📚') ||
        lowerContent.includes('comment') || lowerContent.includes('docs')) return 'documentation';

    return 'general';
  }

  private static extractTitleFromSection(section: string): string {
    const lines = section.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('##') || trimmed.startsWith('**')) {
        return this.cleanMarkdown(trimmed);
      }
    }
    return '';
  }

  private static extractDescriptionFromSection(section: string): string {
    const lines = section.split('\n');
    return lines
      .filter(line => line.trim() && !line.startsWith('#') && !line.startsWith('**'))
      .slice(0, 3)
      .join(' ')
      .substring(0, 200);
  }

  private static extractSuggestionFromSection(section: string): string {
    const suggestionMatch = section.match(/(?:suggestion|fix|solution):\s*(.*)/i);
    return suggestionMatch ? suggestionMatch[1].substring(0, 200) : '';
  }

  private static cleanMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')      // Italic
      .replace(/`(.*?)`/g, '$1')        // Code
      .replace(/#{1,6}\s*/g, '')        // Headers
      .replace(/^\s*[-*+]\s*/gm, '')    // List items
      .trim();
  }

  private static getExtensionForLanguage(language: string): string {
    const extensions: { [key: string]: string } = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      go: 'go',
      rust: 'rs',
      php: 'php',
      ruby: 'rb',
      css: 'css',
      html: 'html',
      json: 'json',
      yaml: 'yml',
      sql: 'sql'
    };

    return extensions[language.toLowerCase()] || 'txt';
  }
}