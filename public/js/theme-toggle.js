/**
 * Four-Way Theme Toggle System
 * System | Tamas | Nīla | Uruvam
 */

(function() {
    'use strict';

  // Theme configuration
  const THEMES = ['system', 'tamas', 'nila', 'uruvam'];
  const STORAGE_KEY = 'a4ot-theme';

  // Detect system color scheme preference
  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'tamas'; // Dark theme
    } else {
      return 'uruvam'; // Light theme
    }
  }

  // Get saved theme or default to 'system'
  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  }

  // Apply theme to document
  function applyTheme(theme) {
    let actualTheme = theme;

    // If theme is 'system', detect the actual theme from system preferences
    if (theme === 'system') {
      actualTheme = getSystemTheme();
    }

    document.body.setAttribute('data-theme', actualTheme);
    updateActiveButton(theme); // Update button for the selected theme (not resolved theme)
    saveTheme(theme);
  }

  // Update active button state
  function updateActiveButton(theme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  // Save theme preference
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage not available, silent fail
    }
  }

  // Set up click handlers for theme buttons
  function setupEventListeners() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const themeName = this.dataset.theme;
        if (themeName && THEMES.includes(themeName)) {
          applyTheme(themeName);
        }
      });
    });
  }

  // Initialize theme
  function initTheme() {
    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);
  }

  // Listen for system theme changes
  function setupSystemThemeListener() {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

      // Listen for changes in system color scheme
      darkModeQuery.addEventListener('change', function() {
        const savedTheme = getSavedTheme();
        // Only react if user has selected 'system' theme
        if (savedTheme === 'system') {
          applyTheme('system');
        }
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initTheme();
      setupEventListeners();
      setupSystemThemeListener();
    });
  } else {
    initTheme();
    setupEventListeners();
    setupSystemThemeListener();
  }

    // Expose for external use
    window.ThemeToggle = {
        apply: applyTheme,
        getCurrent: getSavedTheme,
        themes: THEMES
    };
})();
