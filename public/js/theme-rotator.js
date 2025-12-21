/**
 * Theme Rotation System
 * Automatically rotates between themes every few days
 */

(function() {
  // Configuration
  const THEMES = ['tamas', 'neon-nexus'];
  const ROTATION_DAYS = 3; // Change theme every 3 days
  const STORAGE_KEY = 'a4ot-theme-config';

  /**
   * Get theme configuration from localStorage
   */
  function getThemeConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load theme config:', e);
    }

    // Default configuration
    return {
      currentTheme: 'tamas',
      lastRotation: Date.now(),
      themeIndex: 0
    };
  }

  /**
   * Save theme configuration to localStorage
   */
  function saveThemeConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save theme config:', e);
    }
  }

  /**
   * Calculate days since last rotation
   */
  function daysSinceRotation(lastRotation) {
    const now = Date.now();
    const diffMs = now - lastRotation;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays;
  }

  /**
   * Get next theme in rotation
   */
  function getNextTheme(currentIndex) {
    const nextIndex = (currentIndex + 1) % THEMES.length;
    return {
      theme: THEMES[nextIndex],
      index: nextIndex
    };
  }

  /**
   * Apply theme to the body element
   */
  function applyTheme(themeName) {
    // Remove all theme classes
    THEMES.forEach(theme => {
      document.body.classList.remove(theme);
    });

    // Add the current theme class (except for 'tamas' which is default)
    if (themeName !== 'tamas') {
      document.body.classList.add(themeName);
    }

    console.log(`Theme applied: ${themeName}`);
  }

  /**
   * Check if theme should rotate and apply appropriate theme
   */
  function checkAndApplyTheme() {
    let config = getThemeConfig();
    const daysPassed = daysSinceRotation(config.lastRotation);

    // Check if it's time to rotate
    if (daysPassed >= ROTATION_DAYS) {
      console.log(`Rotating theme (${daysPassed.toFixed(1)} days passed)`);
      const nextTheme = getNextTheme(config.themeIndex);

      config = {
        currentTheme: nextTheme.theme,
        themeIndex: nextTheme.index,
        lastRotation: Date.now()
      };

      saveThemeConfig(config);
    }

    // Apply the current theme
    applyTheme(config.currentTheme);

    // Log rotation info
    const daysUntilNext = ROTATION_DAYS - daysPassed;
    if (daysUntilNext > 0) {
      console.log(`Next theme rotation in ${daysUntilNext.toFixed(1)} days`);
    }
  }

  /**
   * Force rotate to next theme (for testing/debugging)
   */
  window.forceRotateTheme = function() {
    let config = getThemeConfig();
    const nextTheme = getNextTheme(config.themeIndex);

    config = {
      currentTheme: nextTheme.theme,
      themeIndex: nextTheme.index,
      lastRotation: Date.now()
    };

    saveThemeConfig(config);
    applyTheme(config.currentTheme);

    console.log(`Forced rotation to: ${config.currentTheme}`);
    return config.currentTheme;
  };

  /**
   * Get current theme info (for debugging)
   */
  window.getThemeInfo = function() {
    const config = getThemeConfig();
    const daysPassed = daysSinceRotation(config.lastRotation);
    const daysUntilNext = ROTATION_DAYS - daysPassed;

    return {
      currentTheme: config.currentTheme,
      availableThemes: THEMES,
      daysSinceRotation: daysPassed.toFixed(1),
      daysUntilNextRotation: daysUntilNext.toFixed(1),
      rotationInterval: ROTATION_DAYS + ' days',
      lastRotation: new Date(config.lastRotation).toLocaleString()
    };
  };

  // Initialize theme rotation on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndApplyTheme);
  } else {
    checkAndApplyTheme();
  }

  console.log('Theme rotation system initialized');
  console.log('Use window.getThemeInfo() to see current theme status');
  console.log('Use window.forceRotateTheme() to immediately switch to the next theme');
})();
