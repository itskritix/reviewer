import { PromptContext } from './PromptTemplate';

/**
 * Language-Specific Prompt Modifiers
 *
 * Adds language and framework-specific expertise to base prompts
 * Ensures AI understands the specific conventions, patterns, and best practices
 */

export class LanguageSpecificPrompts {
  private static readonly languageModifiers = new Map<string, LanguageModifier>();

  static {
    this.initializeLanguageModifiers();
  }

  /**
   * Enhance a base prompt with language-specific expertise
   */
  static enhancePrompt(
    basePrompt: string,
    techStack: string[],
    primaryLanguage?: string
  ): string {
    const detectedLanguage = primaryLanguage || this.detectPrimaryLanguage(techStack);
    const modifier = this.languageModifiers.get(detectedLanguage.toLowerCase());

    if (!modifier) {
      return basePrompt + this.getGenericLanguageGuidance(techStack);
    }

    const enhancement = `

## ${detectedLanguage} Expertise Mode

${modifier.expertiseStatement}

### Language-Specific Review Focus
${modifier.reviewFocus.map(focus => `- **${focus.category}**: ${focus.description}`).join('\n')}

### Common ${detectedLanguage} Issues to Check
${modifier.commonIssues.map(issue => `- **${issue.pattern}**: ${issue.description}`).join('\n')}

### ${detectedLanguage} Best Practices
${modifier.bestPractices.map(practice => `- **${practice.area}**: ${practice.guideline}`).join('\n')}

### Framework-Specific Considerations
${this.getFrameworkSpecificGuidance(techStack, detectedLanguage)}

### Agent Prompt Enhancement for ${detectedLanguage}
When generating agent prompts, include:
- Language version requirements
- Framework-specific imports and patterns
- Testing framework conventions
- Linting/formatting tool compliance
${modifier.agentPromptEnhancement}

---

`;

    return basePrompt + enhancement;
  }

  private static detectPrimaryLanguage(techStack: string[]): string {
    const languageIndicators = [
      { lang: 'TypeScript', indicators: ['typescript', 'ts', 'tsx', '@types'] },
      { lang: 'JavaScript', indicators: ['javascript', 'js', 'jsx', 'node'] },
      { lang: 'Python', indicators: ['python', 'py', 'django', 'flask', 'fastapi'] },
      { lang: 'Java', indicators: ['java', 'spring', 'maven', 'gradle'] },
      { lang: 'Go', indicators: ['go', 'golang'] },
      { lang: 'Rust', indicators: ['rust', 'cargo'] },
      { lang: 'PHP', indicators: ['php', 'laravel', 'symfony', 'composer'] },
      { lang: 'Ruby', indicators: ['ruby', 'rails', 'gem'] },
      { lang: 'C#', indicators: ['csharp', 'dotnet', '.net', 'nuget'] }
    ];

    const techStackLower = techStack.map(tech => tech.toLowerCase());

    for (const { lang, indicators } of languageIndicators) {
      if (indicators.some(indicator =>
        techStackLower.some(tech => tech.includes(indicator))
      )) {
        return lang;
      }
    }

    return 'Generic';
  }

  private static getFrameworkSpecificGuidance(techStack: string[], language: string): string {
    const frameworkGuidance = new Map<string, string>([
      ['react', `
- **Component Design**: Check for proper component composition and reusability
- **Hooks Usage**: Verify correct usage of useEffect, useState, useCallback, useMemo
- **Performance**: Look for unnecessary re-renders, missing keys in lists
- **Accessibility**: Ensure ARIA attributes and semantic HTML
- **State Management**: Evaluate state lifting and context usage`],

      ['vue', `
- **Component Structure**: Check template, script, and style organization
- **Reactivity**: Verify proper use of ref, reactive, computed
- **Composition API**: Review composable design and reusability
- **Template Syntax**: Check v-if/v-for usage and performance implications`],

      ['angular', `
- **Component Architecture**: Review component lifecycle and communication
- **Dependency Injection**: Check service design and injection patterns
- **RxJS Usage**: Verify observable patterns and memory management
- **Change Detection**: Evaluate OnPush strategy and performance`],

      ['express', `
- **Middleware Order**: Check middleware sequence and error handling
- **Route Organization**: Verify RESTful design and route structure
- **Security**: Review helmet, CORS, and validation middleware
- **Error Handling**: Check async error catching and response patterns`],

      ['spring', `
- **Dependency Injection**: Review @Autowired and constructor injection
- **Transaction Management**: Check @Transactional usage and propagation
- **Security Configuration**: Verify Spring Security setup
- **Data Access**: Review JPA/Hibernate patterns and query optimization`],

      ['django', `
- **Model Design**: Check field definitions and relationships
- **View Patterns**: Review CBV vs FBV usage and permissions
- **URL Configuration**: Verify URL patterns and namespace usage
- **Security**: Check CSRF protection, SQL injection prevention`]
    ]);

    const applicableFrameworks = techStack
      .map(tech => tech.toLowerCase())
      .filter(tech => frameworkGuidance.has(tech));

    if (applicableFrameworks.length === 0) {
      return '- Review for language-specific framework best practices';
    }

    return applicableFrameworks
      .map(framework => `**${framework.toUpperCase()}**:${frameworkGuidance.get(framework)}`)
      .join('\n');
  }

  private static getGenericLanguageGuidance(techStack: string[]): string {
    return `

## Multi-Language Code Review

### Technology Stack: ${techStack.join(', ')}

### General Best Practices to Review
- **Code Style**: Consistent formatting and naming conventions
- **Error Handling**: Appropriate exception/error management
- **Documentation**: Clear comments and function documentation
- **Testing**: Adequate test coverage and test quality
- **Performance**: Efficient algorithms and resource usage
- **Security**: Input validation and secure coding practices

### Cross-Language Concerns
- **API Design**: RESTful principles and consistent interfaces
- **Data Validation**: Input sanitization and type checking
- **Logging**: Structured logging and appropriate log levels
- **Configuration Management**: Environment-specific settings
- **Dependency Management**: Version pinning and security updates

`;
  }

  private static initializeLanguageModifiers(): void {
    // TypeScript/JavaScript
    this.languageModifiers.set('typescript', {
      expertiseStatement: 'You are now operating as a TypeScript/JavaScript expert with deep knowledge of modern ES6+, TypeScript patterns, Node.js ecosystem, and frontend frameworks.',
      reviewFocus: [
        { category: 'Type Safety', description: 'Strong typing, interface design, generic usage, type guards' },
        { category: 'Async Patterns', description: 'Promise handling, async/await usage, callback patterns' },
        { category: 'Modern JavaScript', description: 'ES6+ features, destructuring, arrow functions, modules' },
        { category: 'Performance', description: 'Bundle size, memory leaks in closures, event listener cleanup' }
      ],
      commonIssues: [
        { pattern: 'Type Assertions', description: 'Overuse of `any` or unsafe type assertions' },
        { pattern: 'Memory Leaks', description: 'Uncleaned event listeners, timers, or closure references' },
        { pattern: 'Promise Chains', description: 'Nested callbacks, unhandled promise rejections' },
        { pattern: 'Import/Export', description: 'Circular dependencies, unused imports' }
      ],
      bestPractices: [
        { area: 'Type Definitions', guideline: 'Use interfaces over type aliases for object shapes, prefer union types for restricted values' },
        { area: 'Error Handling', guideline: 'Use proper Error objects, implement error boundaries in React' },
        { area: 'Async Code', guideline: 'Prefer async/await over Promises, handle all async operations properly' },
        { area: 'Module Design', guideline: 'Use barrel exports, avoid default exports for utilities' }
      ],
      agentPromptEnhancement: `
- Specify TypeScript strict mode compliance
- Include proper import statements and type annotations
- Reference specific tsconfig.json rules when relevant
- Suggest appropriate @types/ packages if needed`
    });

    this.languageModifiers.set('javascript', {
      expertiseStatement: 'You are now operating as a JavaScript expert with deep knowledge of modern ES6+, Node.js ecosystem, browser APIs, and JavaScript design patterns.',
      reviewFocus: [
        { category: 'ES6+ Features', description: 'Modern syntax usage, arrow functions, destructuring, modules' },
        { category: 'Async Patterns', description: 'Callback handling, Promise usage, async/await patterns' },
        { category: 'Scope & Closures', description: 'Variable hoisting, closure patterns, memory management' },
        { category: 'DOM Manipulation', description: 'Event handling, DOM queries, performance considerations' }
      ],
      commonIssues: [
        { pattern: 'Variable Hoisting', description: 'var usage instead of let/const, temporal dead zone issues' },
        { pattern: 'Equality Checks', description: 'Using == instead of ===, type coercion issues' },
        { pattern: 'Callback Hell', description: 'Deeply nested callbacks, error handling in callbacks' },
        { pattern: 'Global Scope', description: 'Unintentional global variable creation, namespace pollution' }
      ],
      bestPractices: [
        { area: 'Variable Declaration', guideline: 'Use const by default, let when reassignment needed, avoid var' },
        { area: 'Function Design', guideline: 'Prefer arrow functions for callbacks, use proper this binding' },
        { area: 'Error Handling', guideline: 'Always handle promise rejections, use try-catch for async/await' },
        { area: 'Performance', guideline: 'Minimize DOM queries, debounce expensive operations' }
      ],
      agentPromptEnhancement: `
- Include babel/webpack configuration considerations
- Reference browser compatibility requirements
- Suggest polyfills when using newer features
- Include ESLint rule compliance`
    });

    // Python
    this.languageModifiers.set('python', {
      expertiseStatement: 'You are now operating as a Python expert with deep knowledge of Pythonic patterns, PEP standards, Django/Flask frameworks, and Python ecosystem best practices.',
      reviewFocus: [
        { category: 'Pythonic Code', description: 'PEP 8 compliance, idiomatic Python patterns, list comprehensions' },
        { category: 'Error Handling', description: 'Exception handling, custom exceptions, context managers' },
        { category: 'Performance', description: 'Generator usage, memory efficiency, algorithm complexity' },
        { category: 'Security', description: 'Input validation, SQL injection prevention, pickle security' }
      ],
      commonIssues: [
        { pattern: 'Mutable Defaults', description: 'Mutable default arguments in function definitions' },
        { pattern: 'Import Issues', description: 'Circular imports, wildcard imports, relative import problems' },
        { pattern: 'Resource Management', description: 'File handles not closed, database connections leaked' },
        { pattern: 'Type Annotations', description: 'Missing or incorrect type hints in Python 3.5+' }
      ],
      bestPractices: [
        { area: 'Code Style', guideline: 'Follow PEP 8, use meaningful names, proper docstrings' },
        { area: 'Error Handling', guideline: 'Use specific exception types, avoid bare except clauses' },
        { area: 'Performance', guideline: 'Use generators for large datasets, prefer dict.get() over try/except' },
        { area: 'Security', guideline: 'Validate all inputs, use parameterized queries, avoid eval()' }
      ],
      agentPromptEnhancement: `
- Include Python version compatibility (3.8+, 3.9+, etc.)
- Reference virtual environment and requirements.txt
- Include pytest/unittest testing patterns
- Suggest appropriate Python packages from PyPI`
    });

    // Java
    this.languageModifiers.set('java', {
      expertiseStatement: 'You are now operating as a Java expert with deep knowledge of object-oriented design, Spring Framework, JVM performance, and enterprise Java patterns.',
      reviewFocus: [
        { category: 'OOP Design', description: 'SOLID principles, design patterns, inheritance vs composition' },
        { category: 'Memory Management', description: 'Garbage collection impact, memory leaks, object lifecycle' },
        { category: 'Concurrency', description: 'Thread safety, synchronization, concurrent collections' },
        { category: 'Exception Handling', description: 'Checked vs unchecked exceptions, resource management' }
      ],
      commonIssues: [
        { pattern: 'Resource Leaks', description: 'Unclosed streams, database connections, file handles' },
        { pattern: 'Null Pointer', description: 'Null safety, optional usage, defensive programming' },
        { pattern: 'String Concatenation', description: 'Inefficient string building, StringBuilder usage' },
        { pattern: 'Collection Usage', description: 'Wrong collection types, inefficient iterations' }
      ],
      bestPractices: [
        { area: 'Resource Management', guideline: 'Use try-with-resources, properly close streams and connections' },
        { area: 'Collections', guideline: 'Choose appropriate collection types, use streams for processing' },
        { area: 'Exception Handling', guideline: 'Catch specific exceptions, use suppressed exceptions properly' },
        { area: 'Performance', guideline: 'Use StringBuilder for concatenation, prefer primitives over wrappers' }
      ],
      agentPromptEnhancement: `
- Include Java version features (8+, 11+, 17+, 21+)
- Reference Maven/Gradle dependency management
- Include JUnit 5 testing patterns
- Suggest appropriate Spring annotations and patterns`
    });

    // Add more languages...
    this.addMoreLanguageModifiers();
  }

  private static addMoreLanguageModifiers(): void {
    // Go
    this.languageModifiers.set('go', {
      expertiseStatement: 'You are now operating as a Go expert with deep knowledge of Go idioms, concurrency patterns, error handling, and the Go standard library.',
      reviewFocus: [
        { category: 'Idiomatic Go', description: 'Go conventions, package organization, interface design' },
        { category: 'Error Handling', description: 'Proper error handling patterns, error wrapping' },
        { category: 'Concurrency', description: 'Goroutines, channels, sync package usage' },
        { category: 'Performance', description: 'Memory allocation, garbage collection, profiling' }
      ],
      commonIssues: [
        { pattern: 'Error Handling', description: 'Ignored errors, improper error wrapping' },
        { pattern: 'Goroutine Leaks', description: 'Goroutines that never terminate, channel deadlocks' },
        { pattern: 'Interface Usage', description: 'Over-engineering with interfaces, empty interfaces' },
        { pattern: 'Package Design', description: 'Circular dependencies, improper package structure' }
      ],
      bestPractices: [
        { area: 'Error Handling', guideline: 'Always check errors, use errors.Is and errors.As for error checking' },
        { area: 'Concurrency', guideline: 'Use channels for communication, mutexes for shared state' },
        { area: 'Interface Design', guideline: 'Keep interfaces small and focused, accept interfaces, return structs' },
        { area: 'Testing', guideline: 'Use table-driven tests, test packages, benchmarks' }
      ],
      agentPromptEnhancement: `
- Include go mod requirements and version constraints
- Reference standard library packages appropriately
- Include proper test file naming and structure
- Suggest go vet and golint compliance`
    });

    // Rust
    this.languageModifiers.set('rust', {
      expertiseStatement: 'You are now operating as a Rust expert with deep knowledge of ownership, borrowing, lifetimes, and safe systems programming.',
      reviewFocus: [
        { category: 'Ownership & Borrowing', description: 'Proper ownership patterns, borrowing rules, lifetime management' },
        { category: 'Error Handling', description: 'Result and Option types, error propagation patterns' },
        { category: 'Memory Safety', description: 'Safe/unsafe code boundaries, memory management' },
        { category: 'Performance', description: 'Zero-cost abstractions, allocation patterns' }
      ],
      commonIssues: [
        { pattern: 'Borrow Checker', description: 'Fighting the borrow checker, unnecessary cloning' },
        { pattern: 'Error Handling', description: 'Improper use of unwrap(), panic in library code' },
        { pattern: 'Lifetime Issues', description: 'Over-specified lifetimes, lifetime elision misuse' },
        { pattern: 'Unsafe Code', description: 'Unnecessary unsafe blocks, undefined behavior' }
      ],
      bestPractices: [
        { area: 'Error Handling', guideline: 'Use Result and Option types, avoid unwrap() in production' },
        { area: 'Memory Management', guideline: 'Prefer borrowing over cloning, use Cow when appropriate' },
        { area: 'API Design', guideline: 'Design for zero-cost abstractions, use type system for safety' },
        { area: 'Testing', guideline: 'Use cargo test, doc tests, property-based testing' }
      ],
      agentPromptEnhancement: `
- Include Cargo.toml dependency specifications
- Reference appropriate crates from crates.io
- Include proper module structure and visibility
- Suggest clippy lint compliance`
    });
  }
}

interface LanguageModifier {
  expertiseStatement: string;
  reviewFocus: Array<{
    category: string;
    description: string;
  }>;
  commonIssues: Array<{
    pattern: string;
    description: string;
  }>;
  bestPractices: Array<{
    area: string;
    guideline: string;
  }>;
  agentPromptEnhancement: string;
}

/**
 * Framework-specific enhancement utilities
 */
export class FrameworkEnhancer {
  /**
   * Add React-specific review guidance
   */
  static addReactGuidance(basePrompt: string): string {
    return basePrompt + `

## React-Specific Review Focus

### Component Design Patterns
- **Component Composition**: Prefer composition over inheritance
- **Props Interface**: TypeScript interfaces for props, default values
- **Render Optimization**: useMemo, useCallback, React.memo usage
- **State Management**: Local vs global state decisions

### Hooks Best Practices
- **Dependency Arrays**: Complete and accurate dependencies in useEffect
- **Custom Hooks**: Reusable stateful logic extraction
- **Performance Hooks**: Proper useMemo and useCallback usage
- **Effect Cleanup**: Cleanup functions for subscriptions and timers

### Common React Anti-Patterns
- **Mutating Props**: Direct prop modification
- **Index as Key**: Using array index as React key
- **Inline Objects**: Creating objects in render causing re-renders
- **Unnecessary Effects**: useEffect for derived state

### Agent Prompts for React
When generating React fix prompts:
- Include proper import statements for hooks
- Reference React 18+ features and patterns
- Include TypeScript prop interface definitions
- Consider component testing with React Testing Library`;
  }

  /**
   * Add Node.js-specific review guidance
   */
  static addNodeGuidance(basePrompt: string): string {
    return basePrompt + `

## Node.js-Specific Review Focus

### Async Programming
- **Promise Handling**: Proper async/await usage, error handling
- **Event Loop**: Understanding blocking vs non-blocking operations
- **Stream Processing**: Efficient stream usage for large data
- **Error Propagation**: Proper error handling in async chains

### Performance & Security
- **Memory Management**: Event listener cleanup, stream disposal
- **Security**: Input validation, SQL injection, XSS prevention
- **Performance**: Profiling, clustering, caching strategies
- **Dependencies**: Security audit, version management

### Common Node.js Issues
- **Callback Hell**: Nested callback patterns
- **Memory Leaks**: Event listener accumulation, closure references
- **Blocking Operations**: Synchronous file operations in production
- **Error Handling**: Uncaught exceptions, unhandled rejections

### Agent Prompts for Node.js
When generating Node.js fix prompts:
- Include proper error handling with try-catch
- Reference appropriate npm packages
- Consider production deployment factors
- Include package.json script considerations`;
  }
}