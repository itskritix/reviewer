import { PromptTemplate, PromptContext } from './PromptTemplate';
import { SecurityAgentPrompt } from './SecurityAgentPrompt';
import { PerformanceAgentPrompt } from './PerformanceAgentPrompt';
import { ArchitectureAgentPrompt } from './ArchitectureAgentPrompt';

export interface ProjectContext {
  workspacePath: string;
  repoName: string;
  currentBranch: string;
  techStack: string[];
  frameworks: string[];
  packageJson?: any;
  gitInfo?: {
    changedFiles: string[];
    linesAdded: number;
    linesDeleted: number;
    commitMessage?: string;
  };
}

export type ReviewFocus = 'security' | 'performance' | 'architecture' | 'testing' | 'general' | 'comprehensive';
export type ReviewDepth = 'surface' | 'standard' | 'deep';
export type DeveloperLevel = 'junior' | 'mid' | 'senior';

export class PromptManager {
  private agents: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    this.agents.set('security', new SecurityAgentPrompt());
    this.agents.set('performance', new PerformanceAgentPrompt());
    this.agents.set('architecture', new ArchitectureAgentPrompt());
  }

  /**
   * Generate context-aware prompts based on project analysis
   */
  async generatePrompt(
    projectContext: ProjectContext,
    codeContent: string,
    focus: ReviewFocus = 'comprehensive',
    depth: ReviewDepth = 'standard',
    developerLevel: DeveloperLevel = 'mid',
    customPrompt?: string
  ): Promise<string> {

    // Build comprehensive context
    const context = await this.buildPromptContext(
      projectContext,
      focus,
      depth,
      developerLevel
    );

    // If custom prompt provided, enhance it with context
    if (customPrompt) {
      return this.enhanceCustomPrompt(customPrompt, context, codeContent);
    }

    // For comprehensive reviews, combine multiple agents
    if (focus === 'comprehensive') {
      return this.generateComprehensivePrompt(context, codeContent);
    }

    // Generate specialized prompt
    if (focus === 'general') {
      return this.generateGeneralPrompt(context, codeContent);
    }

    return this.generateSpecializedPrompt(context, codeContent, focus);
  }

  /**
   * Auto-detect optimal review configuration based on code changes
   */
  autoDetectReviewConfig(projectContext: ProjectContext): {
    suggestedFocus: ReviewFocus[];
    suggestedDepth: ReviewDepth;
    reasoning: string;
  } {
    const changedFiles = projectContext.gitInfo?.changedFiles || [];
    const suggestions: ReviewFocus[] = [];
    let depth: ReviewDepth = 'standard';
    const reasons: string[] = [];

    // Security focus detection
    if (this.hasSecurityRelevantChanges(changedFiles, projectContext)) {
      suggestions.push('security');
      reasons.push('Security-relevant files modified');
    }

    // Performance focus detection
    if (this.hasPerformanceRelevantChanges(changedFiles, projectContext)) {
      suggestions.push('performance');
      reasons.push('Performance-critical code changes detected');
    }

    // Architecture focus detection
    if (this.hasArchitectureRelevantChanges(changedFiles, projectContext)) {
      suggestions.push('architecture');
      reasons.push('Architectural changes or new patterns introduced');
    }

    // Determine depth based on change scope
    const linesChanged = (projectContext.gitInfo?.linesAdded || 0) +
                        (projectContext.gitInfo?.linesDeleted || 0);

    if (linesChanged > 500) {
      depth = 'deep';
      reasons.push('Large changeset requires deep analysis');
    } else if (linesChanged < 50) {
      depth = 'surface';
      reasons.push('Small changeset suitable for surface review');
    }

    // Default to general if no specific areas detected
    if (suggestions.length === 0) {
      suggestions.push('general');
      reasons.push('General review for standard code changes');
    }

    return {
      suggestedFocus: suggestions,
      suggestedDepth: depth,
      reasoning: reasons.join('; ')
    };
  }

  private async buildPromptContext(
    projectContext: ProjectContext,
    focus: ReviewFocus,
    depth: ReviewDepth,
    developerLevel: DeveloperLevel
  ): Promise<PromptContext> {
    const techStack = await this.detectTechStack(projectContext);
    const frameworkVersion = await this.detectFrameworkVersions(projectContext);

    return {
      repoName: projectContext.repoName,
      techStack: techStack,
      frameworkVersion: frameworkVersion,
      environment: this.inferEnvironment(projectContext.currentBranch),
      teamStandards: await this.detectTeamStandards(projectContext),
      currentBranch: projectContext.currentBranch,
      changedFiles: projectContext.gitInfo?.changedFiles || [],
      linesAdded: projectContext.gitInfo?.linesAdded || 0,
      linesDeleted: projectContext.gitInfo?.linesDeleted || 0,
      aiProvider: 'gemini', // Will be set by caller
      aiModel: 'gemini-3-pro-preview', // Will be set by caller
      reviewDepth: depth,
      developerExperience: developerLevel,
      focusAreas: [focus],
      complianceRequirements: this.detectComplianceRequirements(techStack)
    };
  }

  private async detectTechStack(projectContext: ProjectContext): Promise<string[]> {
    const techStack = new Set<string>();

    // Analyze package.json if available
    if (projectContext.packageJson) {
      const deps = {
        ...projectContext.packageJson.dependencies,
        ...projectContext.packageJson.devDependencies
      };

      for (const dep of Object.keys(deps)) {
        if (dep.includes('react')) techStack.add('React');
        if (dep.includes('vue')) techStack.add('Vue');
        if (dep.includes('angular')) techStack.add('Angular');
        if (dep.includes('express')) techStack.add('Express');
        if (dep.includes('typescript')) techStack.add('TypeScript');
        if (dep.includes('jest')) techStack.add('Jest');
        if (dep.includes('webpack')) techStack.add('Webpack');
        if (dep.includes('eslint')) techStack.add('ESLint');
      }
    }

    // Analyze file extensions
    const files = projectContext.gitInfo?.changedFiles || [];
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) techStack.add('TypeScript');
      if (file.endsWith('.js') || file.endsWith('.jsx')) techStack.add('JavaScript');
      if (file.endsWith('.py')) techStack.add('Python');
      if (file.endsWith('.java')) techStack.add('Java');
      if (file.endsWith('.go')) techStack.add('Go');
      if (file.endsWith('.rs')) techStack.add('Rust');
      if (file.endsWith('.php')) techStack.add('PHP');
      if (file.endsWith('.rb')) techStack.add('Ruby');
      if (file.endsWith('.css') || file.endsWith('.scss')) techStack.add('CSS');
      if (file.endsWith('.html')) techStack.add('HTML');
      if (file.endsWith('.sql')) techStack.add('SQL');
    }

    return Array.from(techStack);
  }

  private async detectFrameworkVersions(projectContext: ProjectContext): Promise<string | undefined> {
    if (projectContext.packageJson?.dependencies) {
      const deps = projectContext.packageJson.dependencies;

      if (deps.react) return `React ${deps.react}`;
      if (deps.vue) return `Vue ${deps.vue}`;
      if (deps['@angular/core']) return `Angular ${deps['@angular/core']}`;
      if (deps.express) return `Express ${deps.express}`;
    }

    return undefined;
  }

  private inferEnvironment(branch: string): 'development' | 'staging' | 'production' {
    if (branch.includes('main') || branch.includes('master')) return 'production';
    if (branch.includes('staging') || branch.includes('stage')) return 'staging';
    return 'development';
  }

  private async detectTeamStandards(_projectContext: ProjectContext): Promise<string | undefined> {
    // Check for common config files that indicate team standards
    const _configIndicators = [
      '.eslintrc', 'prettier.config', 'tsconfig.json',
      '.editorconfig', 'stylelint.config'
    ];

    // This would check for actual files in the workspace
    // For now, return a default based on tech stack
    return 'Standard linting and formatting rules configured';
  }

  private detectComplianceRequirements(techStack: string[]): string[] {
    const requirements: string[] = [];

    if (techStack.includes('security')) {
      requirements.push('Security compliance standards');
    }

    // Add more compliance detection logic based on project characteristics
    return requirements;
  }

  private hasSecurityRelevantChanges(changedFiles: string[], _context: ProjectContext): boolean {
    const securityPatterns = [
      /auth/i, /security/i, /login/i, /password/i, /token/i, /session/i,
      /encrypt/i, /decrypt/i, /hash/i, /salt/i, /key/i, /secret/i,
      /permission/i, /role/i, /access/i, /cors/i, /csrf/i
    ];

    return changedFiles.some(file =>
      securityPatterns.some(pattern => pattern.test(file))
    );
  }

  private hasPerformanceRelevantChanges(changedFiles: string[], context: ProjectContext): boolean {
    const performancePatterns = [
      /database/i, /query/i, /cache/i, /redis/i, /memory/i,
      /optimization/i, /performance/i, /async/i, /promise/i,
      /loop/i, /algorithm/i, /sort/i, /search/i
    ];

    const linesChanged = (context.gitInfo?.linesAdded || 0) +
                        (context.gitInfo?.linesDeleted || 0);

    return linesChanged > 100 || changedFiles.some(file =>
      performancePatterns.some(pattern => pattern.test(file))
    );
  }

  private hasArchitectureRelevantChanges(changedFiles: string[], _context: ProjectContext): boolean {
    const architecturePatterns = [
      /component/i, /service/i, /controller/i, /model/i, /view/i,
      /factory/i, /builder/i, /strategy/i, /observer/i, /singleton/i,
      /interface/i, /abstract/i, /base/i, /core/i, /framework/i
    ];

    return changedFiles.some(file =>
      architecturePatterns.some(pattern => pattern.test(file)) ||
      file.includes('index.') || // Entry points often indicate architectural changes
      file.includes('config') || // Configuration changes
      file.split('/').length > 3 // Deep nested changes often architectural
    );
  }

  private generateComprehensivePrompt(context: PromptContext, codeContent: string): string {
    return `# 🔍 Comprehensive AI Code Review

## Review Configuration
- **Repository**: ${context.repoName}
- **Technology Stack**: ${context.techStack.join(', ')}
- **Review Depth**: ${context.reviewDepth}
- **Developer Level**: ${context.developerExperience}
- **Environment**: ${context.environment}

## Multi-Agent Analysis Approach

You will conduct a comprehensive review combining multiple expert perspectives:

### 🛡️ Security Analysis
- Identify security vulnerabilities and attack vectors
- Check authentication, authorization, and data protection
- Assess input validation and injection risks

### ⚡ Performance Analysis
- Evaluate algorithmic efficiency and resource usage
- Identify bottlenecks and scalability concerns
- Assess memory management and async patterns

### 🏗️ Architecture Analysis
- Review design patterns and SOLID principles
- Assess code organization and separation of concerns
- Evaluate maintainability and extensibility

### 🧪 Quality Analysis
- Check code style and consistency
- Evaluate error handling and edge cases
- Assess testing needs and coverage gaps

## Code Under Review
### Files: ${context.changedFiles.join(', ')}
### Changes: +${context.linesAdded} -${context.linesDeleted} lines

\`\`\`
${codeContent}
\`\`\`

## Analysis Instructions

1. **Read and understand** the complete code context
2. **Think systematically** through each expert lens
3. **Prioritize findings** by severity and impact
4. **Provide actionable solutions** with specific implementation details
5. **Generate agent prompts** for immediate implementation

## Output Format

For each issue found across all analysis areas:

**[SEVERITY] [CATEGORY] Issue Title (Line X)**
- **Problem**: Clear description of the issue
- **Impact**: Potential consequences if not addressed
- **Category**: Security/Performance/Architecture/Quality
- **Solution**: Specific remediation steps
- **Priority**: Critical/High/Medium/Low

**🤖 Agent Prompt:**
\`\`\`
Context: [Specific file and location]
Task: [Detailed fix instructions]
Requirements: [Technical constraints]
Validation: [How to verify the fix]
\`\`\`

## Final Assessment
- **Overall Status**: APPROVE / NEEDS CHANGES / REJECT
- **Critical Issues**: [Must-fix items]
- **Improvement Opportunities**: [Enhancement suggestions]
- **Production Readiness**: Assessment with reasoning

Conduct your comprehensive analysis now, thinking through each perspective systematically.`;
  }

  private generateGeneralPrompt(context: PromptContext, codeContent: string): string {
    return `# 📋 General Code Review

## Review Context
- **Repository**: ${context.repoName}
- **Technology**: ${context.techStack.join(', ')}
- **Branch**: ${context.currentBranch}
- **Review Level**: ${context.reviewDepth} analysis for ${context.developerExperience} developer

## Code Under Review
### Changed Files: ${context.changedFiles.join(', ')}
### Modifications: +${context.linesAdded} -${context.linesDeleted} lines

\`\`\`
${codeContent}
\`\`\`

## Review Focus Areas
1. **Correctness**: Does the code do what it's supposed to do?
2. **Safety**: Are there any potential runtime errors or edge cases?
3. **Clarity**: Is the code easy to read and understand?
4. **Maintainability**: Will this be easy to modify and extend?
5. **Best Practices**: Does it follow language and framework conventions?

## Instructions
Please review this code and provide:
- Clear identification of any issues with specific line numbers
- Practical solutions with code examples where helpful
- Agent-ready prompts for implementing fixes
- Assessment of overall code quality

For each issue, format as:
**[SEVERITY] Issue Description (Line X)**
- Problem details
- Suggested fix
- 🤖 **Agent Prompt**: [Copy-paste ready instructions]

Focus on practical improvements that will make this code more robust and maintainable.`;
  }

  private generateSpecializedPrompt(
    context: PromptContext,
    codeContent: string,
    focus: ReviewFocus
  ): string {
    const agent = this.agents.get(focus);
    if (!agent) {
      throw new Error(`No agent found for focus area: ${focus}`);
    }

    return agent.generatePrompt(context, codeContent);
  }

  private enhanceCustomPrompt(
    customPrompt: string,
    context: PromptContext,
    codeContent: string
  ): string {
    const contextBlock = `
## Project Context
- **Repository**: ${context.repoName}
- **Technology Stack**: ${context.techStack.join(', ')}
- **Environment**: ${context.environment}
- **Files Changed**: ${context.changedFiles.join(', ')}
- **Scope**: +${context.linesAdded} -${context.linesDeleted} lines

## Code Under Review
\`\`\`
${codeContent}
\`\`\`

---

`;

    return contextBlock + customPrompt + `

---

## Enhanced Output Requirements
For each issue you identify, please include:
🤖 **Agent Prompt:**
\`\`\`
Context: [File and location details]
Task: [Specific implementation instructions]
Validation: [How to verify the fix works]
\`\`\`

This will help developers implement your suggestions immediately using AI coding assistants.`;
  }
}