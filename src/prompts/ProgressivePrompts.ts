import { PromptContext } from './PromptTemplate';

/**
 * Progressive Prompting System
 *
 * Implements three levels of code review depth:
 * - Surface: Quick 2-5 minute scan for obvious issues
 * - Standard: Comprehensive 10-20 minute review
 * - Deep: Expert-level 30+ minute analysis
 */

export class ProgressivePrompts {
  /**
   * Surface Level: Quick Issue Detection
   * Perfect for: Immediate feedback, pre-commit hooks, junior developers
   */
  static generateSurfacePrompt(context: PromptContext, codeContent: string): string {
    return `# ⚡ Quick Code Review - Surface Analysis

## Review Parameters
- **Speed**: Fast 2-5 minute scan
- **Focus**: Critical issues and obvious problems
- **Technology**: ${context.techStack.join(', ')}
- **Files**: ${context.changedFiles.join(', ')}

## Quick Scan Instructions
You are conducting a **rapid surface-level review**. Focus only on:

### 🚨 Critical Issues (MUST FIND)
1. **Syntax Errors & Obvious Bugs**
   - Compilation/runtime errors
   - Undefined variables or functions
   - Type mismatches (if applicable)

2. **Security Red Flags**
   - Hardcoded secrets or passwords
   - SQL injection vulnerabilities
   - XSS vulnerabilities in user input

3. **Major Performance Issues**
   - Infinite loops or recursion
   - Obvious N+1 query problems
   - Memory leaks (event listeners, timers)

4. **Broken Functionality**
   - Logic errors that would break core features
   - Missing error handling for critical operations
   - Incorrect API usage

## Code to Review
\`\`\`
${codeContent}
\`\`\`

## Output Format
For each critical issue found:

**🔴 CRITICAL: [Brief Title] (Line X)**
- **Problem**: One-sentence description
- **Fix**: Quick solution
- **🤖 Agent Prompt**: \`Fix [specific issue] at line X: [specific instruction]\`

## Surface Review Guidelines
- **Speed is key** - don't spend more than 30 seconds per issue
- **Only flag critical problems** that could break the system
- **Provide quick, actionable fixes**
- **Skip style/minor issues** unless they cause bugs
- **Maximum 5 issues** - focus on the most important

Begin your rapid scan now. Look for the most critical issues first.`;
  }

  /**
   * Standard Level: Comprehensive Review
   * Perfect for: Regular development workflow, balanced depth vs speed
   */
  static generateStandardPrompt(context: PromptContext, codeContent: string): string {
    return `# 🔍 Standard Code Review - Comprehensive Analysis

## Review Configuration
- **Depth**: Balanced comprehensive review
- **Time**: 10-20 minute thorough analysis
- **Technology**: ${context.techStack.join(', ')}
- **Experience Level**: Optimized for ${context.developerExperience} developers
- **Environment**: ${context.environment}

## Comprehensive Review Areas

### 🛡️ Security Analysis
- Authentication and authorization flaws
- Input validation and sanitization
- Data protection and privacy concerns
- Common vulnerability patterns (OWASP Top 10)

### ⚡ Performance Evaluation
- Algorithm efficiency and Big O analysis
- Memory usage and potential leaks
- Database query optimization
- Async/await patterns and blocking operations

### 🏗️ Code Architecture
- SOLID principles adherence
- Design patterns usage and opportunities
- Code organization and modularity
- Separation of concerns

### 🧪 Quality Assurance
- Error handling completeness
- Edge case coverage
- Code readability and maintainability
- Testing requirements

### 📚 Best Practices
- Language-specific conventions
- Framework best practices
- Documentation quality
- Code style consistency

## Project Context
- **Repository**: ${context.repoName}
- **Current Branch**: ${context.currentBranch}
- **Changed Files**: ${context.changedFiles.join(', ')}
- **Scope**: +${context.linesAdded} -${context.linesDeleted} lines

## Code Under Review
\`\`\`
${codeContent}
\`\`\`

## Standard Review Process

1. **Read and Understand**: Comprehend the code's purpose and context
2. **Security First**: Check for vulnerabilities and security issues
3. **Performance Check**: Evaluate efficiency and scalability
4. **Architecture Review**: Assess design quality and patterns
5. **Quality Evaluation**: Check error handling, testing, and maintainability
6. **Best Practices**: Verify adherence to standards and conventions

## Output Format
For each issue found, provide:

**[SEVERITY] [CATEGORY] Issue Title (Line X)**
- **Problem**: Clear description of the issue
- **Impact**: What could go wrong if not fixed
- **Solution**: Detailed remediation steps
- **Learning**: Why this is important (for junior/mid developers)
- **🤖 Agent Prompt**:
\`\`\`
Context: ${context.repoName} ${context.currentBranch} - [file]:[lines]
Task: [Specific fix with code examples]
Requirements: [Technical constraints]
Validation: [How to test the fix]
\`\`\`

## Issue Priority Guide
- **🔴 Critical**: Security vulnerabilities, data loss, system crashes
- **🟡 High**: Performance issues, functionality problems, major bugs
- **🟠 Medium**: Code quality, maintainability, minor bugs
- **🟢 Low**: Style improvements, optimizations, suggestions

## Final Assessment
Provide:
- **Status**: APPROVE / NEEDS CHANGES / REJECT
- **Summary**: Key findings and recommendations
- **Next Steps**: Priority order for fixing issues

Conduct your thorough standard review now.`;
  }

  /**
   * Deep Level: Expert Analysis
   * Perfect for: Critical code paths, architecture changes, senior review
   */
  static generateDeepPrompt(context: PromptContext, codeContent: string): string {
    return `# 🧠 Deep Code Review - Expert-Level Analysis

## Expert Review Parameters
- **Depth**: Comprehensive expert-level analysis
- **Time**: 30+ minutes of detailed examination
- **Expertise**: Senior developer / architect perspective
- **Scope**: Holistic system impact assessment

## Deep Analysis Dimensions

### 🏛️ Architectural Impact Assessment
- **System Design**: How does this fit into the overall architecture?
- **Future Evolution**: How will this code need to change over time?
- **Scalability**: How does this perform under 10x, 100x load?
- **Integration Points**: How does this interact with other systems?
- **Technical Debt**: What long-term maintenance burden does this create?

### 🛡️ Security Deep Dive
- **Threat Modeling**: What are all possible attack vectors?
- **Data Flow Analysis**: How does sensitive data move through the system?
- **Trust Boundaries**: Where are the security perimeters?
- **Compliance**: Does this meet regulatory requirements?
- **Defense in Depth**: Are there multiple layers of protection?

### ⚡ Performance Engineering
- **Profiling Analysis**: Where would a profiler show hotspots?
- **Memory Patterns**: Allocation patterns and garbage collection impact
- **Concurrency**: Thread safety and race condition analysis
- **Resource Utilization**: CPU, memory, network, I/O optimization
- **Caching Strategy**: What should be cached and how?

### 🧪 Quality Engineering
- **Test Strategy**: What testing approach is needed?
- **Error Scenarios**: What could fail and how to handle it?
- **Monitoring**: What metrics should be tracked in production?
- **Rollback Strategy**: How to safely revert if issues arise?
- **Documentation**: What knowledge needs to be captured?

### 📚 Knowledge Transfer
- **Team Education**: What patterns should be shared with the team?
- **Standards Evolution**: Should this become a team standard?
- **Mentorship Opportunities**: What can junior developers learn here?
- **Best Practices**: What industry best practices apply?

## Expert Context
- **Repository**: ${context.repoName}
- **Technology Ecosystem**: ${context.techStack.join(', ')}
- **Business Environment**: ${context.environment}
- **Team Maturity**: ${context.developerExperience} development team
- **Compliance**: ${context.complianceRequirements?.join(', ') || 'Standard practices'}

## Code for Deep Analysis
### Change Summary: +${context.linesAdded} -${context.linesDeleted} lines
### Files in Scope: ${context.changedFiles.join(', ')}

\`\`\`
${codeContent}
\`\`\`

## Expert Review Process

### Phase 1: Holistic Understanding (5-10 minutes)
1. **Context Mapping**: Understand where this code fits in the larger system
2. **Intent Analysis**: Determine the business purpose and technical goals
3. **Stakeholder Impact**: Consider effects on users, developers, operations

### Phase 2: Multi-Dimensional Analysis (15-20 minutes)
1. **Architecture Lens**: Design patterns, coupling, cohesion, extensibility
2. **Security Lens**: Attack surfaces, data protection, access control
3. **Performance Lens**: Scalability, resource usage, optimization opportunities
4. **Maintainability Lens**: Readability, testability, documentation

### Phase 3: Strategic Assessment (5-10 minutes)
1. **Risk Evaluation**: What are the potential long-term consequences?
2. **Investment Analysis**: Is this the right technical approach for the business?
3. **Team Impact**: How does this affect team productivity and knowledge?

## Expert Output Format

### Executive Summary
- **Strategic Assessment**: High-level impact and recommendations
- **Risk Profile**: Key risks and mitigation strategies
- **Investment Recommendation**: Continue, modify, or reconsider approach

### Detailed Findings
For each significant finding:

**[IMPACT] [DOMAIN] Expert Insight (Lines X-Y)**
- **Current State**: What exists now
- **Expert Assessment**: Why this is significant from an expert perspective
- **Business Impact**: How this affects the organization
- **Technical Debt**: Long-term maintenance implications
- **Strategic Recommendation**: What should be done and why
- **Implementation Strategy**: Step-by-step approach to improvement
- **Success Metrics**: How to measure improvement
- **Knowledge Transfer**: What the team should learn from this

**🤖 Expert Agent Prompt**:
\`\`\`
Expert Context: [Domain expertise and business context]
Strategic Goal: [High-level objective]
Technical Implementation: [Detailed technical steps]
Quality Gates: [Verification criteria]
Knowledge Capture: [Documentation requirements]
Team Communication: [How to share learnings]
\`\`\`

### Architecture Decision Records (ADRs)
Document key decisions that emerge from this review:
- **Decision**: What was decided
- **Context**: Why this decision was necessary
- **Consequences**: Expected outcomes and trade-offs
- **Alternatives**: Other options considered

### Mentorship Opportunities
- **Learning Moments**: Key insights for team growth
- **Pattern Recognition**: Reusable solutions and anti-patterns
- **Best Practices**: Standards that should be adopted
- **Knowledge Gaps**: Areas where team training would help

## Expert Conclusion
- **Production Readiness**: Comprehensive go/no-go assessment
- **Strategic Alignment**: How well this serves long-term goals
- **Team Development**: How this contributes to team capability growth
- **Next Steps**: Prioritized action plan with business justification

Conduct your expert-level deep analysis now. Think like a principal engineer making architectural decisions that will impact the system for years to come.`;
  }

  /**
   * Auto-select appropriate prompt level based on context
   */
  static selectOptimalLevel(context: PromptContext): 'surface' | 'standard' | 'deep' {
    const factors = {
      linesChanged: context.linesAdded + context.linesDeleted,
      filesChanged: context.changedFiles.length,
      environment: context.environment,
      developerLevel: context.developerExperience
    };

    // Deep review criteria
    if (
      factors.linesChanged > 500 ||
      factors.filesChanged > 10 ||
      factors.environment === 'production' ||
      context.focusAreas.includes('architecture')
    ) {
      return 'deep';
    }

    // Surface review criteria
    if (
      factors.linesChanged < 50 ||
      factors.filesChanged <= 2 ||
      factors.developerLevel === 'junior'
    ) {
      return 'surface';
    }

    // Default to standard
    return 'standard';
  }

  /**
   * Generate explanation of why a specific level was chosen
   */
  static explainLevelChoice(context: PromptContext, level: 'surface' | 'standard' | 'deep'): string {
    const factors = [];

    const linesChanged = context.linesAdded + context.linesDeleted;
    const filesChanged = context.changedFiles.length;

    if (level === 'deep') {
      if (linesChanged > 500) factors.push(`Large changeset (${linesChanged} lines)`);
      if (filesChanged > 10) factors.push(`Many files affected (${filesChanged})`);
      if (context.environment === 'production') factors.push('Production environment');
      if (context.focusAreas.includes('architecture')) factors.push('Architectural changes');
    }

    if (level === 'surface') {
      if (linesChanged < 50) factors.push(`Small changeset (${linesChanged} lines)`);
      if (filesChanged <= 2) factors.push(`Few files (${filesChanged})`);
      if (context.developerExperience === 'junior') factors.push('Junior developer focus');
    }

    if (level === 'standard') {
      factors.push('Balanced comprehensive review appropriate for the changes');
    }

    return factors.length > 0 ? factors.join(', ') : 'Standard review selected';
  }
}