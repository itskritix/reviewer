import { AgentPrompt, ReviewIssue } from '../prompts/PromptTemplate';

export type SupportedAgent = 'claude-code' | 'cursor' | 'copilot' | 'windsurf' | 'custom';
export type IssueCategory = 'security' | 'performance' | 'architecture' | 'testing' | 'style' | 'bug';

export interface AgentPromptOptions {
  preferredAgent?: SupportedAgent;
  includeContext?: boolean;
  includeValidation?: boolean;
  verbosity?: 'minimal' | 'standard' | 'detailed';
  codeStyle?: 'conservative' | 'modern' | 'aggressive';
}

/**
 * Revolutionary Agent Prompt Generator
 *
 * This is the core innovation - generating ready-to-use prompts for AI coding agents
 * that bridge the gap between "knowing what's wrong" and "actually fixing it"
 */
export class AgentPromptGenerator {
  private agentTemplates: Map<SupportedAgent, AgentTemplate> = new Map();

  constructor() {
    this.initializeAgentTemplates();
  }

  /**
   * Generate agent-ready prompts from review issues
   * This is THE killer feature that differentiates our extension
   */
  generateAgentPrompts(
    issues: ReviewIssue[],
    options: AgentPromptOptions = {}
  ): AgentPromptCollection {
    const {
      preferredAgent = 'claude-code',
      includeContext = true,
      includeValidation = true,
      verbosity = 'standard',
      codeStyle = 'modern'
    } = options;

    const prompts: AgentPromptCollection = {
      summary: this.generateSummaryPrompt(issues, preferredAgent),
      individual: [],
      batch: this.generateBatchPrompt(issues, preferredAgent, options),
      statistics: {
        totalIssues: issues.length,
        bySeverity: this.groupBySeverity(issues),
        byCategory: this.groupByCategory(issues),
        estimatedFixTime: this.estimateTotalFixTime(issues)
      }
    };

    // Generate individual prompts for each issue
    for (const issue of issues) {
      const agentPrompt = this.generateSingleAgentPrompt(
        issue,
        preferredAgent,
        options
      );
      prompts.individual.push(agentPrompt);
    }

    return prompts;
  }

  /**
   * Generate a single agent prompt for a specific issue
   */
  generateSingleAgentPrompt(
    issue: ReviewIssue,
    agent: SupportedAgent = 'claude-code',
    options: AgentPromptOptions = {}
  ): EnhancedAgentPrompt {
    const template = this.agentTemplates.get(agent);
    if (!template) {
      throw new Error(`Unsupported agent: ${agent}`);
    }

    const basePrompt = this.buildBasePrompt(issue, options);
    const agentSpecificPrompt = template.formatPrompt(basePrompt, issue, options);

    return {
      id: issue.id,
      agent,
      issue,
      prompt: agentSpecificPrompt,
      copyablePrompt: this.formatForClipboard(agentSpecificPrompt, agent),
      estimatedComplexity: issue.agentPrompt.estimatedComplexity,
      estimatedTime: issue.agentPrompt.estimatedTime,
      tags: this.generateTags(issue),
      prerequisites: this.identifyPrerequisites(issue),
      followUpActions: this.suggestFollowUpActions(issue)
    };
  }

  /**
   * Generate a comprehensive batch prompt for multiple issues
   */
  private generateBatchPrompt(
    issues: ReviewIssue[],
    agent: SupportedAgent,
    options: AgentPromptOptions
  ): string {
    const template = this.agentTemplates.get(agent);
    if (!template) return '';

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const highPriorityIssues = issues.filter(i => i.severity === 'high');

    let batchPrompt = `# 🔧 Batch Fix Session - ${issues.length} Issues\n\n`;

    if (criticalIssues.length > 0) {
      batchPrompt += `## 🚨 Critical Issues (Fix First)\n`;
      criticalIssues.forEach((issue, index) => {
        batchPrompt += `\n### ${index + 1}. ${issue.title}\n`;
        batchPrompt += `**File**: ${issue.file}:${issue.lines.join('-')}\n`;
        batchPrompt += `**Fix**: ${issue.solution}\n`;
        batchPrompt += `**Validation**: ${issue.agentPrompt.validation}\n\n`;
      });
    }

    if (highPriorityIssues.length > 0) {
      batchPrompt += `## ⚠️ High Priority Issues\n`;
      highPriorityIssues.forEach((issue, index) => {
        batchPrompt += `\n### ${index + 1}. ${issue.title}\n`;
        batchPrompt += `**File**: ${issue.file}:${issue.lines.join('-')}\n`;
        batchPrompt += `**Fix**: ${issue.solution}\n\n`;
      });
    }

    batchPrompt += `\n## 🎯 Execution Strategy\n`;
    batchPrompt += `1. Start with critical issues to ensure system stability\n`;
    batchPrompt += `2. Test after each critical fix to prevent cascading failures\n`;
    batchPrompt += `3. Address high priority issues in order of complexity\n`;
    batchPrompt += `4. Run full test suite after all fixes\n\n`;

    batchPrompt += `**Estimated Total Time**: ${this.estimateTotalFixTime(issues)}\n`;
    batchPrompt += `**Recommended Approach**: Fix ${criticalIssues.length} critical issues first, then batch the remaining ${issues.length - criticalIssues.length} issues.\n`;

    return template.formatBatchPrompt ? template.formatBatchPrompt(batchPrompt) : batchPrompt;
  }

  private generateSummaryPrompt(issues: ReviewIssue[], agent: SupportedAgent): string {
    const stats = {
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length
    };

    return `# 📊 AI Review Summary - ${issues.length} Issues Found

## Issue Breakdown
- 🔴 Critical: ${stats.critical} issues
- 🟡 High: ${stats.high} issues
- 🟠 Medium: ${stats.medium} issues
- 🟢 Low: ${stats.low} issues

## Quick Action Items
${this.generateQuickActionItems(issues)}

## Recommended Fixing Order
${this.generateFixingOrder(issues)}

**Ready-to-use prompts generated for ${agent} below** ⬇️`;
  }

  private generateQuickActionItems(issues: ReviewIssue[]): string {
    const critical = issues.filter(i => i.severity === 'critical');
    if (critical.length === 0) return '✅ No critical issues found';

    return critical.map(issue =>
      `- **${issue.title}** in ${issue.file}:${issue.lines.join('-')}`
    ).join('\n');
  }

  private generateFixingOrder(issues: ReviewIssue[]): string {
    const ordered = issues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return ordered.slice(0, 5).map((issue, index) =>
      `${index + 1}. ${issue.title} (${issue.agentPrompt.estimatedTime || 'Quick fix'})`
    ).join('\n');
  }

  private buildBasePrompt(issue: ReviewIssue, options: AgentPromptOptions): string {
    const context = options.includeContext ?
      `**Context**: ${issue.file}:${issue.lines.join('-')} - ${issue.category} issue\n` : '';

    const validation = options.includeValidation ?
      `**Validation**: ${issue.agentPrompt.validation}\n` : '';

    return `${context}**Task**: ${issue.solution}\n${validation}`;
  }

  private formatForClipboard(prompt: string, agent: SupportedAgent): string {
    // Add agent-specific formatting for easy copy-paste
    const timestamp = new Date().toLocaleTimeString();
    return `${prompt}\n\n<!-- Generated by Reviewer Extension at ${timestamp} for ${agent} -->`;
  }

  private generateTags(issue: ReviewIssue): string[] {
    const tags: string[] = [issue.severity, issue.category];

    if (issue.agentPrompt.estimatedComplexity === 'complex') tags.push('complex-fix');
    if (issue.solution.toLowerCase().includes('refactor')) tags.push('refactoring');
    if (issue.solution.toLowerCase().includes('test')) tags.push('testing-needed');
    if (issue.impact.toLowerCase().includes('security')) tags.push('security-critical');

    return tags;
  }

  private identifyPrerequisites(issue: ReviewIssue): string[] {
    const prerequisites: string[] = [];

    if (issue.category === 'testing') prerequisites.push('Test framework available');
    if (issue.category === 'security') prerequisites.push('Security testing tools');
    if (issue.agentPrompt.estimatedComplexity === 'complex') prerequisites.push('Backup current code');

    return prerequisites;
  }

  private suggestFollowUpActions(issue: ReviewIssue): string[] {
    const actions: string[] = ['Test the fix thoroughly'];

    if (issue.category === 'security') actions.push('Run security scan');
    if (issue.category === 'performance') actions.push('Benchmark performance');
    if (issue.severity === 'critical') actions.push('Deploy and monitor closely');

    return actions;
  }

  private groupBySeverity(issues: ReviewIssue[]): Record<string, number> {
    return issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupByCategory(issues: ReviewIssue[]): Record<string, number> {
    return issues.reduce((acc, issue) => {
      acc[issue.category] = (acc[issue.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private estimateTotalFixTime(issues: ReviewIssue[]): string {
    const timeMap = { 'simple': 5, 'medium': 15, 'complex': 45 };
    const totalMinutes = issues.reduce((total, issue) => {
      return total + (timeMap[issue.agentPrompt.estimatedComplexity] || 15);
    }, 0);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private initializeAgentTemplates(): void {
    // Claude Code template
    this.agentTemplates.set('claude-code', {
      name: 'Claude Code',
      formatPrompt: (basePrompt, issue, options) => {
        return `# Fix: ${issue.title}

${basePrompt}

**Requirements**: ${issue.agentPrompt.requirements.join(', ')}

Please implement this fix while maintaining code style consistency. Include any necessary imports and ensure the solution follows best practices for ${this.inferLanguage(issue.file)}.`;
      }
    });

    // Cursor template
    this.agentTemplates.set('cursor', {
      name: 'Cursor AI',
      formatPrompt: (basePrompt, issue, options) => {
        return `@fix ${issue.file}:${issue.lines.join('-')}

${issue.title}

${issue.solution}

Requirements:
${issue.agentPrompt.requirements.map(req => `- ${req}`).join('\n')}

Please apply this fix and verify it works correctly.`;
      }
    });

    // GitHub Copilot template
    this.agentTemplates.set('copilot', {
      name: 'GitHub Copilot',
      formatPrompt: (basePrompt, issue, options) => {
        return `// Fix: ${issue.title}
// Location: ${issue.file}:${issue.lines.join('-')}
// Problem: ${issue.description}
// Solution: ${issue.solution}
// TODO: Implement the following changes:
${issue.agentPrompt.requirements.map(req => `// - ${req}`).join('\n')}`;
      }
    });

    // Windsurf template
    this.agentTemplates.set('windsurf', {
      name: 'Windsurf',
      formatPrompt: (basePrompt, issue, options) => {
        return `## 🔧 Fix Request

**Issue**: ${issue.title}
**File**: ${issue.file}:${issue.lines.join('-')}

**Problem Description**:
${issue.description}

**Solution**:
${issue.solution}

**Acceptance Criteria**:
${issue.agentPrompt.requirements.map(req => `✓ ${req}`).join('\n')}

**Validation Steps**:
${issue.agentPrompt.validation}

Please implement this fix using best practices.`;
      }
    });

    // Custom template for other agents
    this.agentTemplates.set('custom', {
      name: 'Custom Agent',
      formatPrompt: (basePrompt, issue, options) => {
        return `${issue.title}

File: ${issue.file}:${issue.lines.join('-')}
Issue: ${issue.description}
Fix: ${issue.solution}
Validation: ${issue.agentPrompt.validation}`;
      }
    });
  }

  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'TypeScript', 'tsx': 'TypeScript',
      'js': 'JavaScript', 'jsx': 'JavaScript',
      'py': 'Python', 'java': 'Java',
      'go': 'Go', 'rs': 'Rust',
      'php': 'PHP', 'rb': 'Ruby'
    };
    return languageMap[ext || ''] || 'the current language';
  }
}

// Supporting interfaces
interface AgentTemplate {
  name: string;
  formatPrompt: (basePrompt: string, issue: ReviewIssue, options: AgentPromptOptions) => string;
  formatBatchPrompt?: (batchPrompt: string) => string;
}

export interface EnhancedAgentPrompt {
  id: string;
  agent: SupportedAgent;
  issue: ReviewIssue;
  prompt: string;
  copyablePrompt: string;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  estimatedTime: string;
  tags: string[];
  prerequisites: string[];
  followUpActions: string[];
}

export interface AgentPromptCollection {
  summary: string;
  individual: EnhancedAgentPrompt[];
  batch: string;
  statistics: {
    totalIssues: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    estimatedFixTime: string;
  };
}