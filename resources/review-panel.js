// Interactive Review Panel JavaScript

(function() {
    'use strict';

    // Check if we're in VS Code WebView environment
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        console.error('Document or window not available in WebView context');
        return;
    }

    // Global state
    let filteredIssues = [];
    let currentFilters = {
        severity: '',
        category: ''
    };

    // VS Code API
    const vscode = acquireVsCodeApi();

    // Safe DOM helper function
    function safeQuerySelector(selector) {
        try {
            return document.querySelector(selector);
        } catch (e) {
            console.warn(`Failed to query selector ${selector}:`, e);
            return null;
        }
    }

    function safeQuerySelectorAll(selector) {
        try {
            return document.querySelectorAll(selector) || [];
        } catch (e) {
            console.warn(`Failed to query selector all ${selector}:`, e);
            return [];
        }
    }

    function safeGetElementById(id) {
        try {
            return document.getElementById(id);
        } catch (e) {
            console.warn(`Failed to get element by id ${id}:`, e);
            return null;
        }
    }

    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    function initialize() {
        try {
            initializePanel();
            setupEventListeners();
            applyInitialFilters();
        } catch (error) {
            console.error('Error initializing review panel:', error);
        }
    }

    function initializePanel() {
        console.log('Initializing Interactive Review Panel');

        // Store original issues for filtering
        if (window.reviewData && window.reviewData.issues) {
            filteredIssues = [...window.reviewData.issues];
        }

        // Initialize syntax highlighting if available
        initializeSyntaxHighlighting();

        // Set up diff highlighting
        highlightDiffContent();
    }

    function setupEventListeners() {
        // Message listener for communication with VS Code
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'highlightIssue':
                    highlightIssueInView(message.line);
                    break;
                case 'applyFilter':
                    if (message.type === 'severity') {
                        filterBySeverity(message.value);
                    } else if (message.type === 'category') {
                        filterByCategory(message.value);
                    }
                    break;
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Ctrl/Cmd + F for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                focusSearchInput();
            }

            // Escape to clear filters
            if (e.key === 'Escape') {
                clearAllFilters();
            }
        });

        // Click handlers for code lines
        safeQuerySelectorAll('.line-with-issue').forEach(line => {
            line.addEventListener('click', function(e) {
                const lineNumber = parseInt(this.dataset.line);
                if (lineNumber) {
                    showIssueDetails(lineNumber);
                }
            });
        });
    }

    function applyInitialFilters() {
        // Apply any URL-based filters or default settings
        updateIssueVisibility();
    }

    // Global functions (called from HTML)
    window.filterBySeverity = function(severity) {
        currentFilters.severity = severity;
        updateIssueVisibility();
        updateFilterUI();
    };

    window.filterByCategory = function(category) {
        currentFilters.category = category;
        updateIssueVisibility();
        updateFilterUI();
    };

    window.showTab = function(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });

        // Show selected tab content
        const selectedContent = document.getElementById(tabName + '-content') ||
                               document.getElementById(tabName.replace(/[^a-zA-Z0-9]/g, '-') + '-content');
        if (selectedContent) {
            selectedContent.classList.add('active');
        }

        // Add active class to selected tab button
        const selectedButton = document.getElementById(tabName + '-tab') ||
                              document.getElementById(tabName.replace(/[^a-zA-Z0-9]/g, '-') + '-tab');
        if (selectedButton) {
            selectedButton.classList.add('active');
        }
    };

    window.openFile = function(file, line) {
        vscode.postMessage({
            command: 'openFile',
            file: file,
            line: line || 1
        });
    };

    window.copyAgentPrompt = function(prompt) {
        // Try to use the clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(prompt).then(() => {
                showNotification('Agent prompt copied to clipboard!', 'success');
            }).catch(() => {
                fallbackCopyToClipboard(prompt);
            });
        } else {
            fallbackCopyToClipboard(prompt);
        }

        // Also send to VS Code for system clipboard
        vscode.postMessage({
            command: 'copyAgentPrompt',
            prompt: prompt
        });
    };

    window.applyFix = function(file, line, suggestion) {
        vscode.postMessage({
            command: 'applyFix',
            file: file,
            line: line,
            suggestion: suggestion
        });
    };

    window.jumpToIssue = function(file, line) {
        // Jump to issue in editor
        vscode.postMessage({
            command: 'jumpToIssue',
            file: file,
            line: line
        });

        // Highlight issue in the current view
        highlightIssueInView(line);
    };

    window.showIssueDetails = function(lineNumber) {
        // Find and show details for issues on this line
        const issues = filteredIssues.filter(issue => issue.line === lineNumber);
        if (issues.length > 0) {
            showIssueModal(issues);
        }
    };

    function updateIssueVisibility() {
        const issueCards = document.querySelectorAll('.issue-card');
        let visibleCount = 0;

        issueCards.forEach((card, index) => {
            const issue = window.reviewData.issues[index];
            if (!issue) return;

            const matchesSeverity = !currentFilters.severity || issue.severity === currentFilters.severity;
            const matchesCategory = !currentFilters.category || issue.category === currentFilters.category;

            if (matchesSeverity && matchesCategory) {
                card.classList.remove('hidden', 'filtering-out');
                visibleCount++;
            } else {
                card.classList.add('filtering-out');
                setTimeout(() => {
                    card.classList.add('hidden');
                    card.classList.remove('filtering-out');
                }, 300);
            }
        });

        // Update filteredIssues array
        filteredIssues = window.reviewData.issues.filter(issue => {
            const matchesSeverity = !currentFilters.severity || issue.severity === currentFilters.severity;
            const matchesCategory = !currentFilters.category || issue.category === currentFilters.category;
            return matchesSeverity && matchesCategory;
        });

        // Show no results message if needed
        showNoResultsMessage(visibleCount === 0);

        // Update stats
        updateFilteredStats();
    }

    function updateFilterUI() {
        // Update select elements
        const severitySelect = safeGetElementById('severity-filter');
        const categorySelect = safeGetElementById('category-filter');

        if (severitySelect) {
            severitySelect.value = currentFilters.severity;
        }

        if (categorySelect) {
            categorySelect.value = currentFilters.category;
        }

        // Update URL or state if needed
        updateUrlState();
    }

    function clearAllFilters() {
        currentFilters = { severity: '', category: '' };
        updateIssueVisibility();
        updateFilterUI();
        showNotification('All filters cleared', 'info');
    }

    function updateFilteredStats() {
        const stats = {
            critical: filteredIssues.filter(i => i.severity === 'critical').length,
            high: filteredIssues.filter(i => i.severity === 'high').length,
            medium: filteredIssues.filter(i => i.severity === 'medium').length,
            low: filteredIssues.filter(i => i.severity === 'low').length,
            info: filteredIssues.filter(i => i.severity === 'info').length
        };

        const total = Object.values(stats).reduce((a, b) => a + b, 0);

        // Update stats display if it exists
        const statsContainer = document.querySelector('.stats-summary');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stats-item">Total: <strong>${total}</strong></div>
                <div class="stats-item critical">Critical: <strong>${stats.critical}</strong></div>
                <div class="stats-item high">High: <strong>${stats.high}</strong></div>
                <div class="stats-item medium">Medium: <strong>${stats.medium}</strong></div>
                <div class="stats-item low">Low: <strong>${stats.low}</strong></div>
            `;
        }
    }

    function showNoResultsMessage(show) {
        let noResultsMsg = document.querySelector('.no-results-message');

        if (show && !noResultsMsg) {
            noResultsMsg = document.createElement('div');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.innerHTML = `
                <div style="text-align: center; padding: 40px; opacity: 0.7;">
                    <h3>No issues match current filters</h3>
                    <p>Try adjusting your filter criteria or <button onclick="clearAllFilters()" style="background: none; border: none; color: var(--primary-color); text-decoration: underline; cursor: pointer;">clear all filters</button></p>
                </div>
            `;

            const issuesList = safeGetElementById('issues-list');
            if (issuesList) {
                issuesList.appendChild(noResultsMsg);
            }
        } else if (!show && noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    function highlightIssueInView(lineNumber) {
        // Remove existing highlights
        document.querySelectorAll('.highlighted-issue').forEach(el => {
            el.classList.remove('highlighted-issue');
        });

        // Add highlight to target line
        const targetLines = document.querySelectorAll(`.line-with-issue[data-line="${lineNumber}"]`);
        targetLines.forEach(line => {
            line.classList.add('highlighted-issue');
            line.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Remove highlight after a few seconds
            setTimeout(() => {
                line.classList.remove('highlighted-issue');
            }, 3000);
        });

        // Also scroll to corresponding issue card
        const issueCards = document.querySelectorAll('.issue-card');
        issueCards.forEach(card => {
            const locationText = card.querySelector('.issue-location')?.textContent || '';
            if (locationText.includes(`:${lineNumber}`)) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                card.style.animation = 'pulse 2s ease-in-out';
                setTimeout(() => {
                    card.style.animation = '';
                }, 2000);
            }
        });
    }

    function showIssueModal(issues) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'issue-modal-overlay';
        modal.innerHTML = `
            <div class="issue-modal">
                <div class="modal-header">
                    <h3>Issues on Line ${issues[0].line}</h3>
                    <button class="modal-close" onclick="this.closest('.issue-modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-content">
                    ${issues.map(issue => `
                        <div class="modal-issue">
                            <div class="issue-header">
                                <span class="severity-badge ${issue.severity}">${getSeverityIcon(issue.severity)} ${issue.severity.toUpperCase()}</span>
                                <span class="category-badge">${getCategoryIcon(issue.category)} ${issue.category}</span>
                            </div>
                            <h4>${issue.title}</h4>
                            <p>${issue.description}</p>
                            <div class="issue-suggestion">
                                <strong>💡 Suggestion:</strong>
                                <p>${issue.suggestion}</p>
                            </div>
                            ${issue.agentPrompt ? `
                                <div class="agent-prompt">
                                    <strong>🤖 Agent Prompt:</strong>
                                    <pre>${escapeHtml(issue.agentPrompt)}</pre>
                                    <button onclick="copyAgentPrompt(\`${escapeHtml(issue.agentPrompt)}\`)">📋 Copy Prompt</button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('<hr>')}
                </div>
            </div>
        `;

        // Add modal styles
        const style = document.createElement('style');
        style.textContent = `
            .issue-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }
            .issue-modal {
                background: var(--vscode-editorWidget-background);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                max-width: 80%;
                max-height: 80%;
                overflow-y: auto;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                background: var(--vscode-editorGroupHeader-tabsBackground);
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--foreground-color);
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
            }
            .modal-close:hover {
                background: var(--hover-color);
            }
            .modal-content {
                padding: 20px;
            }
            .modal-issue {
                margin-bottom: 20px;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(modal);

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                style.remove();
            }
        });

        // Close on Escape key
        const closeOnEscape = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                style.remove();
                document.removeEventListener('keydown', closeOnEscape);
            }
        };
        document.addEventListener('keydown', closeOnEscape);
    }

    function initializeSyntaxHighlighting() {
        // Basic syntax highlighting for common languages
        document.querySelectorAll('code[data-file]').forEach(codeBlock => {
            const fileName = codeBlock.getAttribute('data-file');
            const ext = fileName.split('.').pop().toLowerCase();

            // Add language class for potential external highlighters
            codeBlock.classList.add(`language-${ext}`);

            // Apply basic highlighting
            applySyntaxHighlighting(codeBlock, ext);
        });
    }

    function applySyntaxHighlighting(codeBlock, language) {
        // Basic keyword highlighting for common languages
        const keywords = {
            'js': ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export'],
            'ts': ['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export', 'interface', 'type'],
            'py': ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except'],
            'java': ['public', 'private', 'protected', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'import'],
            'go': ['func', 'var', 'const', 'if', 'else', 'for', 'range', 'return', 'import', 'package', 'type'],
            'rust': ['fn', 'let', 'mut', 'if', 'else', 'for', 'while', 'return', 'use', 'mod', 'struct', 'enum', 'impl'],
        };

        if (keywords[language]) {
            let html = codeBlock.innerHTML;
            keywords[language].forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'g');
                html = html.replace(regex, `<span class="keyword">${keyword}</span>`);
            });
            codeBlock.innerHTML = html;
        }
    }

    function highlightDiffContent() {
        // Highlight diff syntax in diff view
        const diffContent = document.getElementById('diff-content');
        if (diffContent) {
            const code = diffContent.querySelector('code');
            if (code) {
                let html = code.textContent;
                const lines = html.split('\n');

                const highlightedLines = lines.map(line => {
                    if (line.startsWith('+')) {
                        return `<span class="line-added">${escapeHtml(line)}</span>`;
                    } else if (line.startsWith('-')) {
                        return `<span class="line-removed">${escapeHtml(line)}</span>`;
                    } else if (line.startsWith('@@')) {
                        return `<span class="line-hunk">${escapeHtml(line)}</span>`;
                    } else {
                        return `<span class="line-context">${escapeHtml(line)}</span>`;
                    }
                });

                code.innerHTML = highlightedLines.join('\n');
            }
        }
    }

    function fallbackCopyToClipboard(text) {
        // Fallback clipboard method
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            showNotification('Agent prompt copied to clipboard!', 'success');
        } catch (err) {
            showNotification('Failed to copy to clipboard', 'error');
        }

        document.body.removeChild(textArea);
    }

    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                color: white;
                font-weight: 500;
                z-index: 1001;
                transform: translateX(400px);
                transition: transform 0.3s ease;
            }
            .notification-success { background: var(--success-color); }
            .notification-error { background: var(--error-color); }
            .notification-info { background: var(--info-color); }
            .notification.show { transform: translateX(0); }
        `;

        document.head.appendChild(style);
        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);

        // Hide notification
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
        }, 3000);
    }

    function updateUrlState() {
        // Update browser history or internal state
        // This could be used to maintain filter state across refreshes
        const state = {
            severity: currentFilters.severity,
            category: currentFilters.category
        };

        // Store in sessionStorage
        sessionStorage.setItem('reviewPanelState', JSON.stringify(state));
    }

    function focusSearchInput() {
        // Focus the filter controls for quick access
        const severityFilter = safeGetElementById('severity-filter');
        if (severityFilter) {
            severityFilter.focus();
        }
    }

    // Utility functions
    function getSeverityIcon(severity) {
        const icons = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🔵',
            info: 'ℹ️'
        };
        return icons[severity] || 'ℹ️';
    }

    function getCategoryIcon(category) {
        const icons = {
            security: '🛡️',
            performance: '⚡',
            architecture: '🏗️',
            testing: '🧪',
            documentation: '📚',
            general: '📋'
        };
        return icons[category] || '📋';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Load saved state on initialization
    document.addEventListener('DOMContentLoaded', function() {
        const savedState = sessionStorage.getItem('reviewPanelState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                currentFilters = { ...currentFilters, ...state };
                updateFilterUI();
                updateIssueVisibility();
            } catch (e) {
                console.warn('Failed to load saved state:', e);
            }
        }
    });

})();