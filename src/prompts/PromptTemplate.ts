export interface PromptContext {
  repoName: string;
  techStack: string[];
  frameworkVersion?: string;
  environment: 'development' | 'staging' | 'production';
  teamStandards?: string;
  currentBranch: string;
  changedFiles: string[];
  linesAdded: number;
  linesDeleted: number;
  aiProvider: string;
  aiModel: string;
  reviewDepth: 'surface' | 'standard' | 'deep';
  developerExperience: 'junior' | 'mid' | 'senior';
  focusAreas: string[];
  complianceRequirements?: string[];
}

export interface ReviewIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'architecture' | 'testing' | 'documentation' | 'style';
  title: string;
  description: string;
  file: string;
  lines: number[];
  impact: string;
  solution: string;
  learningNote: string;
  agentPrompt: AgentPrompt;
}

export interface AgentPrompt {
  agent: 'claude-code' | 'cursor' | 'copilot' | 'custom';
  context: string;
  task: string;
  location: string;
  requirements: string[];
  validation: string;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  estimatedTime: string;
}

export abstract class PromptTemplate {
  abstract readonly agentType: string;
  abstract readonly focusArea: string;

  abstract generatePrompt(context: PromptContext, codeContent: string): string;

  protected formatSeverityEmoji(severity: ReviewIssue['severity']): string {
    const emojiMap = {
      critical: '🔴',
      high: '🟡',
      medium: '🟠',
      low: '🟢'
    };
    return emojiMap[severity];
  }

  protected generateAgentPrompt(issue: Partial<ReviewIssue>, fixInstructions: string): AgentPrompt {
    const complexity = this.assessComplexity(fixInstructions);
    const estimatedTime = this.estimateTime(complexity);

    return {
      agent: 'claude-code', // Default, can be overridden
      context: `${issue.file}:${issue.lines?.join('-') || 'unknown'} - ${issue.category} issue`,
      task: fixInstructions,
      location: `${issue.file}:${issue.lines?.join('-') || 'unknown'}`,
      requirements: this.extractRequirements(fixInstructions),
      validation: this.generateValidation(issue.category || 'general'),
      estimatedComplexity: complexity,
      estimatedTime
    };
  }

  private assessComplexity(instructions: string): 'simple' | 'medium' | 'complex' {
    const indicators = {
      simple: ['fix typo', 'add semicolon', 'import missing', 'rename variable'],
      complex: ['refactor', 'redesign', 'implement pattern', 'restructure', 'migrate']
    };

    const lowerInstructions = instructions.toLowerCase();

    if (indicators.complex.some(indicator => lowerInstructions.includes(indicator))) {
      return 'complex';
    }

    if (indicators.simple.some(indicator => lowerInstructions.includes(indicator))) {
      return 'simple';
    }

    return 'medium';
  }

  private estimateTime(complexity: 'simple' | 'medium' | 'complex'): string {
    const timeMap = {
      simple: '2-5 minutes',
      medium: '10-20 minutes',
      complex: '30-60 minutes'
    };
    return timeMap[complexity];
  }

  private extractRequirements(instructions: string): string[] {
    const requirements: string[] = [];

    if (instructions.includes('test')) {
      requirements.push('Add appropriate tests');
    }
    if (instructions.includes('type') || instructions.includes('interface')) {
      requirements.push('Maintain type safety');
    }
    if (instructions.includes('performance')) {
      requirements.push('Verify performance improvement');
    }
    if (instructions.includes('security')) {
      requirements.push('Ensure security compliance');
    }

    return requirements.length > 0 ? requirements : ['Maintain existing functionality'];
  }

  private generateValidation(category: string): string {
    const validationMap: Record<string, string> = {
      security: 'Verify no security vulnerabilities introduced, test edge cases',
      performance: 'Measure performance before/after, ensure no regression',
      testing: 'Run test suite, verify coverage improvement',
      architecture: 'Check design principles maintained, no coupling introduced',
      style: 'Ensure consistent formatting, run linter',
      default: 'Test functionality, run existing tests'
    };

    return validationMap[category] || validationMap.default;
  }
}