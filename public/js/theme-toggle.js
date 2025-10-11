/**
 * Three-Way Theme Toggle System
 * Arctic Glow | Cyber Mint | Carbon Glow
 */

(function() {
  'use strict';

  // Theme configuration
  const THEMES = ['arctic', 'mint', 'carbon'];
  const STORAGE_KEY = 'a4ot-theme';

  // Get saved theme or default to 'arctic'
  function getSavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : 'arctic';
  }

  // Save theme to localStorage
  function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
  }

  // Apply theme to document
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    updateActiveButton(theme);
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

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initTheme();
      setupEventListeners();
    });
  } else {
    initTheme();
    setupEventListeners();
  }

})();
