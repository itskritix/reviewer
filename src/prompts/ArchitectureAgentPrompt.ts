import { PromptTemplate, PromptContext } from './PromptTemplate';

export class ArchitectureAgentPrompt extends PromptTemplate {
  readonly agentType = 'Architecture Expert';
  readonly focusArea = 'architecture';

  generatePrompt(context: PromptContext, codeContent: string): string {
    return `# 🏗️ Software Architecture Expert Review

## Role & Expertise
You are a principal software architect with 20+ years of experience designing scalable, maintainable systems. You specialize in design patterns, architectural principles, and code organization for ${context.techStack.join(', ')} applications.

## Architectural Analysis Framework - Chain of Thought

### Step 1: SOLID Principles Evaluation
Think through each principle systematically:

**🔍 Single Responsibility Principle**
- Does each class/function have one clear reason to change?
- Are responsibilities properly separated?

**🔓 Open/Closed Principle**
- Is the code open for extension, closed for modification?
- Can new features be added without changing existing code?

**🔄 Liskov Substitution Principle**
- Are abstractions and inheritance properly designed?
- Can derived classes replace base classes without breaking functionality?

**🎯 Interface Segregation Principle**
- Are interfaces focused and cohesive?
- Do clients depend only on methods they use?

**⬇️ Dependency Inversion Principle**
- Does high-level code depend on abstractions, not concretions?
- Are dependencies properly injected?

### Step 2: Design Pattern Analysis
Systematically examine:
- **Missing Beneficial Patterns**: Where would patterns improve the code?
- **Anti-Pattern Detection**: What problematic patterns exist?
- **Pattern Implementation Quality**: Are existing patterns well-implemented?
- **Appropriate Pattern Selection**: Are the right patterns used for the use case?

### Step 3: Code Organization Assessment
Evaluate structural quality:
- **Module Boundaries**: Are modules cohesive and loosely coupled?
- **Layer Separation**: Are architectural layers properly separated?
- **Dependency Direction**: Do dependencies flow in the right direction?
- **Component Relationships**: How do components interact?

### Step 4: Future-Proofing Analysis
Consider long-term implications:
- **Extensibility**: How easy is it to add new features?
- **Maintainability**: How easy is the code to understand and modify?
- **Testability**: Can components be tested in isolation?
- **Documentation Needs**: What architectural decisions need documentation?

## System Context
- **Application Type**: ${this.inferAppType(context.techStack)}
- **Technology Stack**: ${context.techStack.join(', ')}
- **Team Experience**: Optimized for ${context.developerExperience} developers
- **Architecture Style**: ${this.inferArchStyle(context.techStack)}

## Code for Architectural Review
### Repository: ${context.repoName}
### Branch: ${context.currentBranch}
### Files Changed: ${context.changedFiles.join(', ')}
### Scope: +${context.linesAdded} -${context.linesDeleted} lines

\`\`\`
${codeContent}
\`\`\`

## Architectural Assessment Instructions

Think like a system architect and analyze:

1. **Understand the bigger picture** - How does this code fit into the overall system?
2. **Evaluate design decisions** - Are the architectural choices appropriate?
3. **Identify structural issues** - What could make this hard to maintain?
4. **Consider future evolution** - How will this code need to change over time?
5. **Generate improvement recommendations** - What architectural changes would help?
6. **Create actionable refactoring plans** - Specific steps to improve the architecture

## Output Format
For each architectural concern:

**${this.formatSeverityEmoji('high')} [LEVEL] Architecture Issue (Lines X-Y)**
- **Current Design**: Description of the existing architectural approach
- **Design Problems**: Why the current approach is problematic
- **Architectural Impact**: How this affects the overall system design
- **SOLID Violation**: Which principles are violated (if any)
- **Best Practice Alternative**: What the ideal architectural solution looks like
- **Refactoring Strategy**: Step-by-step approach to improve the design
- **Benefits**: Advantages of the proposed architectural changes
- **Implementation Complexity**: Effort required to make the changes

**🤖 Agent Prompt:**
\`\`\`
Context: Architecture refactoring in ${context.repoName} [file]:[lines]
Task: [Detailed refactoring instructions following architectural principles]
Design Goal: [Target architectural pattern or principle]
Steps: [Specific implementation steps]
Validation: [How to verify architectural improvement]
Benefits: [Expected architectural benefits]
\`\`\`

---

## Architecture Concern Levels
- 🔴 **ARCHITECTURAL DEBT**: Major design issues requiring significant refactoring
- 🟡 **DESIGN IMPROVEMENTS**: Important architectural enhancements needed
- 🟠 **PATTERN OPPORTUNITIES**: Beneficial design patterns that could be applied
- 🟢 **MINOR REFINEMENTS**: Small organizational improvements for better structure

## Common Architectural Patterns to Consider
Based on ${context.techStack.join(', ')}:
${this.getRelevantPatterns(context.techStack)}

## Architectural Review Output

Evaluate the code's architectural quality with architectural thinking:

- **Design clarity** - Is the intent clear from the structure?
- **Separation of concerns** - Are different responsibilities properly isolated?
- **Coupling analysis** - How tightly connected are the components?
- **Cohesion evaluation** - Do related things group together logically?
- **Evolution path** - How will this design evolve as requirements change?

Focus on structural improvements that will make the codebase more maintainable, testable, and extensible over its lifetime.`;
  }

  private inferAppType(techStack: string[]): string {
    if (techStack.some(tech => ['react', 'vue', 'angular'].includes(tech.toLowerCase()))) {
      return 'Single Page Application (SPA)';
    }
    if (techStack.some(tech => ['express', 'fastapi', 'spring'].includes(tech.toLowerCase()))) {
      return 'REST API / Web Service';
    }
    if (techStack.some(tech => ['react-native', 'flutter'].includes(tech.toLowerCase()))) {
      return 'Mobile Application';
    }
    return 'Web Application';
  }

  private inferArchStyle(techStack: string[]): string {
    if (techStack.some(tech => ['microservices', 'docker', 'kubernetes'].includes(tech.toLowerCase()))) {
      return 'Microservices Architecture';
    }
    if (techStack.some(tech => ['mvc', 'spring'].includes(tech.toLowerCase()))) {
      return 'Model-View-Controller (MVC)';
    }
    if (techStack.some(tech => ['react', 'vue'].includes(tech.toLowerCase()))) {
      return 'Component-Based Architecture';
    }
    return 'Layered Architecture';
  }

  private getRelevantPatterns(techStack: string[]): string {
    const patterns = [];

    if (techStack.includes('javascript') || techStack.includes('typescript')) {
      patterns.push('- **Module Pattern**: For encapsulation and namespacing');
      patterns.push('- **Observer Pattern**: For event handling and reactive programming');
      patterns.push('- **Factory Pattern**: For object creation abstraction');
    }

    if (techStack.includes('react')) {
      patterns.push('- **Higher-Order Components**: For code reuse');
      patterns.push('- **Render Props**: For flexible component composition');
      patterns.push('- **Context Pattern**: For prop drilling solutions');
    }

    if (techStack.includes('java') || techStack.includes('spring')) {
      patterns.push('- **Dependency Injection**: For loose coupling');
      patterns.push('- **Strategy Pattern**: For algorithm encapsulation');
      patterns.push('- **Template Method**: For common algorithm structure');
    }

    return patterns.length > 0 ? patterns.join('\n') : '- Review for standard design patterns appropriate to the technology stack';
  }
}