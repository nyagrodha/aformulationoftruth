/**
 * Theme Toggle Script for A Formulation of Truth
 * Handles switching between tamas, nila, and uruvam themes
 */

(function() {
    'use strict';

    // Theme definitions
    const THEMES = {
        tamas: {
            name: 'tamas',
            class: 'theme-tamas',
            vars: {
                '--bg-primary': '#000000',
                '--bg-secondary': '#0a0a0a',
                '--bg-card': 'rgba(10, 10, 10, 0.9)',
                '--text-primary': '#e0e0ff',
                '--text-secondary': '#00d9ff',
                '--accent-1': '#00d9ff',
                '--accent-2': '#8b00ff',
                '--accent-3': '#00ff41',
                '--border-color': 'rgba(0, 217, 255, 0.3)',
                '--glow-1': 'rgba(0, 217, 255, 0.8)',
                '--glow-2': 'rgba(139, 0, 255, 0.8)',
                '--glow-3': 'rgba(0, 255, 65, 0.8)'
            }
        },
        nila: {
            name: 'nila',
            class: 'theme-nila',
            vars: {
                '--bg-primary': '#0a0e1a',
                '--bg-secondary': '#0f1420',
                '--bg-card': 'rgba(15, 20, 32, 0.85)',
                '--text-primary': '#e8f1ff',
                '--text-secondary': '#00f0ff',
                '--accent-1': '#00f0ff',
                '--accent-2': '#ff00e5',
                '--accent-3': '#ffd700',
                '--border-color': 'rgba(0, 240, 255, 0.3)',
                '--glow-1': 'rgba(0, 240, 255, 0.8)',
                '--glow-2': 'rgba(255, 0, 229, 0.7)',
                '--glow-3': 'rgba(255, 215, 0, 0.6)'
            }
        },
        uruvam: {
            name: 'uruvam',
            class: 'theme-uruvam',
            vars: {
                '--bg-primary': '#1a0a1a',
                '--bg-secondary': '#200f20',
                '--bg-card': 'rgba(32, 15, 32, 0.85)',
                '--text-primary': '#ffe8f1',
                '--text-secondary': '#ff69b4',
                '--accent-1': '#ff69b4',
                '--accent-2': '#9400d3',
                '--accent-3': '#ff6347',
                '--border-color': 'rgba(255, 105, 180, 0.3)',
                '--glow-1': 'rgba(255, 105, 180, 0.8)',
                '--glow-2': 'rgba(148, 0, 211, 0.7)',
                '--glow-3': 'rgba(255, 99, 71, 0.6)'
            }
        }
    };

    const STORAGE_KEY = 'afot-theme';

    /**
     * Apply a theme to the document
     */
    function applyTheme(themeName) {
        const theme = THEMES[themeName] || THEMES.tamas;
        const root = document.documentElement;

        // Remove all theme classes
        Object.values(THEMES).forEach(t => {
            document.body.classList.remove(t.class);
        });

        // Add new theme class
        document.body.classList.add(theme.class);

        // Apply CSS variables
        Object.entries(theme.vars).forEach(([prop, value]) => {
            root.style.setProperty(prop, value);
        });

        // Update active button state
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });

        // Save preference
        try {
            localStorage.setItem(STORAGE_KEY, themeName);
        } catch (e) {
            // localStorage not available, silent fail
        }
    }

    /**
     * Get saved theme or default
     */
    function getSavedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'tamas';
        } catch (e) {
            return 'tamas';
        }
    }

    /**
     * Initialize theme toggle
     */
    function init() {
        // Apply saved theme immediately
        applyTheme(getSavedTheme());

        // Set up click handlers for theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const themeName = this.dataset.theme;
                if (themeName && THEMES[themeName]) {
                    applyTheme(themeName);
                }
            });
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for external use
    window.ThemeToggle = {
        apply: applyTheme,
        getCurrent: getSavedTheme,
        themes: Object.keys(THEMES)
    };
})();
