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

  // Save theme to localStorage
  function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
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
  function updateActiveButton(activeTheme) {
    const buttons = document.querySelectorAll('.theme-btn');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-theme') === activeTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Initialize theme on page load
  function initTheme() {
    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);
  }

  // Set up event listeners
  function setupEventListeners() {
    const buttons = document.querySelectorAll('.theme-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', function() {
        const theme = this.getAttribute('data-theme');
        applyTheme(theme);
      });
    });
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

})();
