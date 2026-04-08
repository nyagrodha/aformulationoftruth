/**
 * Tests for .eslintrc.js - ESLint Configuration
 *
 * Validates that the ESLint configuration is correctly structured
 * with the expected rules, environments, and overrides.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const configPath = path.resolve(__dirname, '../../.eslintrc.js');

// Helper to load the config with a specific NODE_ENV
function loadConfig(nodeEnv?: string): Record<string, unknown> {
  // Clear the module from cache so NODE_ENV changes take effect
  delete require.cache[configPath];
  const originalEnv = process.env.NODE_ENV;
  if (nodeEnv !== undefined) {
    process.env.NODE_ENV = nodeEnv;
  }
  try {
    return require(configPath) as Record<string, unknown>;
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
}

describe('.eslintrc.js Configuration', () => {
  let config: Record<string, unknown>;

  beforeEach(() => {
    config = loadConfig('test');
  });

  afterEach(() => {
    // Clean require cache after each test
    delete require.cache[configPath];
  });

  describe('Module structure', () => {
    it('should export a configuration object', () => {
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config).not.toBeNull();
    });

    it('should have all top-level keys', () => {
      expect(config).toHaveProperty('env');
      expect(config).toHaveProperty('extends');
      expect(config).toHaveProperty('parserOptions');
      expect(config).toHaveProperty('rules');
      expect(config).toHaveProperty('overrides');
      expect(config).toHaveProperty('ignorePatterns');
    });
  });

  describe('env settings', () => {
    it('should enable browser environment', () => {
      const env = config.env as Record<string, boolean>;
      expect(env.browser).toBe(true);
    });

    it('should enable ES2021 environment', () => {
      const env = config.env as Record<string, boolean>;
      expect(env.es2021).toBe(true);
    });

    it('should enable Node.js environment', () => {
      const env = config.env as Record<string, boolean>;
      expect(env.node).toBe(true);
    });
  });

  describe('extends', () => {
    it('should extend eslint:recommended', () => {
      const ext = config.extends as string[];
      expect(Array.isArray(ext)).toBe(true);
      expect(ext).toContain('eslint:recommended');
    });
  });

  describe('parserOptions', () => {
    it('should set ecmaVersion to latest', () => {
      const parserOptions = config.parserOptions as Record<string, unknown>;
      expect(parserOptions.ecmaVersion).toBe('latest');
    });

    it('should set sourceType to module', () => {
      const parserOptions = config.parserOptions as Record<string, unknown>;
      expect(parserOptions.sourceType).toBe('module');
    });
  });

  describe('rules', () => {
    let rules: Record<string, unknown>;

    beforeEach(() => {
      rules = config.rules as Record<string, unknown>;
    });

    describe('no-irregular-whitespace', () => {
      it('should be set to error', () => {
        const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
        expect(Array.isArray(rule)).toBe(true);
        expect(rule[0]).toBe('error');
      });

      it('should not skip strings', () => {
        const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
        expect(rule[1].skipStrings).toBe(false);
      });

      it('should not skip comments', () => {
        const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
        expect(rule[1].skipComments).toBe(false);
      });

      it('should not skip regular expressions', () => {
        const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
        expect(rule[1].skipRegExps).toBe(false);
      });

      it('should not skip template literals', () => {
        const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
        expect(rule[1].skipTemplates).toBe(false);
      });
    });

    describe('quotes', () => {
      it('should enforce single quotes as an error', () => {
        const rule = rules['quotes'] as [string, string, Record<string, boolean>];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('single');
      });

      it('should allow escape avoidance', () => {
        const rule = rules['quotes'] as [string, string, Record<string, boolean>];
        expect(rule[2].avoidEscape).toBe(true);
      });

      it('should allow template literals', () => {
        const rule = rules['quotes'] as [string, string, Record<string, boolean>];
        expect(rule[2].allowTemplateLiterals).toBe(true);
      });
    });

    describe('no-unused-vars', () => {
      it('should be set to warn level', () => {
        const rule = rules['no-unused-vars'] as [string, Record<string, unknown>];
        expect(rule[0]).toBe('warn');
      });

      it('should check args after-used', () => {
        const rule = rules['no-unused-vars'] as [string, Record<string, unknown>];
        expect(rule[1].args).toBe('after-used');
      });

      it('should ignore rest siblings', () => {
        const rule = rules['no-unused-vars'] as [string, Record<string, unknown>];
        expect(rule[1].ignoreRestSiblings).toBe(true);
      });

      it('should ignore args with underscore prefix pattern', () => {
        const rule = rules['no-unused-vars'] as [string, Record<string, unknown>];
        expect(rule[1].argsIgnorePattern).toBe('^_');
      });
    });

    describe('no-console (NODE_ENV-dependent)', () => {
      it('should be off in non-production environments', () => {
        const testConfig = loadConfig('test');
        const testRules = testConfig.rules as Record<string, unknown>;
        expect(testRules['no-console']).toBe('off');
      });

      it('should be off in development environment', () => {
        const devConfig = loadConfig('development');
        const devRules = devConfig.rules as Record<string, unknown>;
        expect(devRules['no-console']).toBe('off');
      });

      it('should be warn in production environment', () => {
        const prodConfig = loadConfig('production');
        const prodRules = prodConfig.rules as Record<string, unknown>;
        expect(prodRules['no-console']).toBe('warn');
      });
    });

    describe('no-debugger (NODE_ENV-dependent)', () => {
      it('should be off in non-production environments', () => {
        const testConfig = loadConfig('test');
        const testRules = testConfig.rules as Record<string, unknown>;
        expect(testRules['no-debugger']).toBe('off');
      });

      it('should be off in development environment', () => {
        const devConfig = loadConfig('development');
        const devRules = devConfig.rules as Record<string, unknown>;
        expect(devRules['no-debugger']).toBe('off');
      });

      it('should be error in production environment', () => {
        const prodConfig = loadConfig('production');
        const prodRules = prodConfig.rules as Record<string, unknown>;
        expect(prodRules['no-debugger']).toBe('error');
      });
    });

    describe('semi', () => {
      it('should require semicolons as an error', () => {
        const rule = rules['semi'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('always');
      });
    });

    describe('comma-dangle', () => {
      it('should disallow trailing commas as an error', () => {
        const rule = rules['comma-dangle'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('never');
      });
    });

    describe('no-trailing-spaces', () => {
      it('should disallow trailing spaces as an error', () => {
        expect(rules['no-trailing-spaces']).toBe('error');
      });
    });

    describe('eol-last', () => {
      it('should require newline at end of file', () => {
        const rule = rules['eol-last'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('always');
      });
    });

    describe('indent', () => {
      it('should require 2-space indentation as an error', () => {
        const rule = rules['indent'] as [string, number, Record<string, number>];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe(2);
      });

      it('should apply 1 level indentation to switch cases', () => {
        const rule = rules['indent'] as [string, number, Record<string, number>];
        expect(rule[2].SwitchCase).toBe(1);
      });
    });

    describe('object-curly-spacing', () => {
      it('should require spaces inside curly braces', () => {
        const rule = rules['object-curly-spacing'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('always');
      });
    });

    describe('array-bracket-spacing', () => {
      it('should disallow spaces inside array brackets', () => {
        const rule = rules['array-bracket-spacing'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('never');
      });
    });

    describe('space-before-blocks', () => {
      it('should require space before blocks as an error', () => {
        expect(rules['space-before-blocks']).toBe('error');
      });
    });

    describe('keyword-spacing', () => {
      it('should require space before keywords', () => {
        const rule = rules['keyword-spacing'] as [string, Record<string, boolean>];
        expect(rule[0]).toBe('error');
        expect(rule[1].before).toBe(true);
      });

      it('should require space after keywords', () => {
        const rule = rules['keyword-spacing'] as [string, Record<string, boolean>];
        expect(rule[1].after).toBe(true);
      });
    });

    describe('space-infix-ops', () => {
      it('should require spacing around infix operators', () => {
        expect(rules['space-infix-ops']).toBe('error');
      });
    });

    describe('arrow-spacing', () => {
      it('should require space before arrow', () => {
        const rule = rules['arrow-spacing'] as [string, Record<string, boolean>];
        expect(rule[0]).toBe('error');
        expect(rule[1].before).toBe(true);
      });

      it('should require space after arrow', () => {
        const rule = rules['arrow-spacing'] as [string, Record<string, boolean>];
        expect(rule[1].after).toBe(true);
      });
    });

    describe('no-multiple-empty-lines', () => {
      it('should be an error', () => {
        const rule = rules['no-multiple-empty-lines'] as [string, Record<string, number>];
        expect(rule[0]).toBe('error');
      });

      it('should allow at most 2 consecutive empty lines', () => {
        const rule = rules['no-multiple-empty-lines'] as [string, Record<string, number>];
        expect(rule[1].max).toBe(2);
      });

      it('should allow no empty lines at end of file', () => {
        const rule = rules['no-multiple-empty-lines'] as [string, Record<string, number>];
        expect(rule[1].maxEOF).toBe(0);
      });
    });

    describe('no-misleading-character-class', () => {
      it('should be set to error', () => {
        expect(rules['no-misleading-character-class']).toBe('error');
      });
    });

    describe('unicode-bom', () => {
      it('should disallow BOM characters as an error', () => {
        const rule = rules['unicode-bom'] as [string, string];
        expect(rule[0]).toBe('error');
        expect(rule[1]).toBe('never');
      });
    });
  });

  describe('overrides', () => {
    let overrides: Array<Record<string, unknown>>;

    beforeEach(() => {
      overrides = config.overrides as Array<Record<string, unknown>>;
    });

    it('should have at least one override', () => {
      expect(Array.isArray(overrides)).toBe(true);
      expect(overrides.length).toBeGreaterThanOrEqual(1);
    });

    describe('TypeScript override', () => {
      let tsOverride: Record<string, unknown>;

      beforeEach(() => {
        tsOverride = overrides.find(
          (o) => Array.isArray(o.files) && (o.files as string[]).includes('*.ts')
        ) as Record<string, unknown>;
      });

      it('should have a TypeScript override configured', () => {
        expect(tsOverride).toBeDefined();
      });

      it('should match .ts and .tsx files', () => {
        const files = tsOverride.files as string[];
        expect(files).toContain('*.ts');
        expect(files).toContain('*.tsx');
      });

      it('should use @typescript-eslint parser', () => {
        expect(tsOverride.parser).toBe('@typescript-eslint/parser');
      });

      it('should extend @typescript-eslint/recommended', () => {
        const ext = tsOverride.extends as string[];
        expect(ext).toContain('plugin:@typescript-eslint/recommended');
      });

      it('should warn on explicit any type usage', () => {
        const tsRules = tsOverride.rules as Record<string, unknown>;
        expect(tsRules['@typescript-eslint/no-explicit-any']).toBe('warn');
      });

      it('should turn off explicit-module-boundary-types requirement', () => {
        const tsRules = tsOverride.rules as Record<string, unknown>;
        expect(tsRules['@typescript-eslint/explicit-module-boundary-types']).toBe('off');
      });
    });
  });

  describe('ignorePatterns', () => {
    let ignorePatterns: string[];

    beforeEach(() => {
      ignorePatterns = config.ignorePatterns as string[];
    });

    it('should be an array', () => {
      expect(Array.isArray(ignorePatterns)).toBe(true);
    });

    it('should ignore node_modules', () => {
      expect(ignorePatterns).toContain('node_modules/');
    });

    it('should ignore dist directory', () => {
      expect(ignorePatterns).toContain('dist/');
    });

    it('should ignore build directory', () => {
      expect(ignorePatterns).toContain('build/');
    });

    it('should ignore minified JavaScript files', () => {
      expect(ignorePatterns).toContain('*.min.js');
    });

    it('should ignore coverage directory', () => {
      expect(ignorePatterns).toContain('coverage/');
    });

    it('should ignore .git directory', () => {
      expect(ignorePatterns).toContain('.git/');
    });
  });

  describe('rule severity levels', () => {
    let rules: Record<string, unknown>;

    beforeEach(() => {
      rules = config.rules as Record<string, unknown>;
    });

    it('should have all critical formatting rules as errors', () => {
      const errorRules = ['no-trailing-spaces', 'space-before-blocks', 'space-infix-ops'];
      for (const rule of errorRules) {
        expect(rules[rule]).toBe('error');
      }
    });

    it('should have no-unused-vars as a warning (not error)', () => {
      const rule = rules['no-unused-vars'] as [string, unknown];
      expect(rule[0]).toBe('warn');
    });

    it('should have array rules configured consistently', () => {
      // Array brackets: never spacing
      const arrayRule = rules['array-bracket-spacing'] as [string, string];
      expect(arrayRule[0]).toBe('error');
      expect(arrayRule[1]).toBe('never');

      // Object curly: always spacing
      const objectRule = rules['object-curly-spacing'] as [string, string];
      expect(objectRule[0]).toBe('error');
      expect(objectRule[1]).toBe('always');
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should not have undefined rules', () => {
      const rules = config.rules as Record<string, unknown>;
      for (const [key, value] of Object.entries(rules)) {
        expect(value).not.toBeUndefined();
        expect(value).not.toBeNull();
      }
    });

    it('should have correct rule count', () => {
      const rules = config.rules as Record<string, unknown>;
      // The config has 18 rules explicitly defined
      expect(Object.keys(rules).length).toBeGreaterThanOrEqual(18);
    });

    it('should have consistent arrow and keyword spacing (both before and after)', () => {
      const rules = config.rules as Record<string, unknown>;

      const arrowRule = rules['arrow-spacing'] as [string, Record<string, boolean>];
      expect(arrowRule[1].before).toBe(true);
      expect(arrowRule[1].after).toBe(true);

      const keywordRule = rules['keyword-spacing'] as [string, Record<string, boolean>];
      expect(keywordRule[1].before).toBe(true);
      expect(keywordRule[1].after).toBe(true);
    });

    it('should not skip any whitespace contexts in no-irregular-whitespace', () => {
      const rules = config.rules as Record<string, unknown>;
      const rule = rules['no-irregular-whitespace'] as [string, Record<string, boolean>];
      const options = rule[1];

      // All skip options should be false to be maximally strict
      expect(options.skipStrings).toBe(false);
      expect(options.skipComments).toBe(false);
      expect(options.skipRegExps).toBe(false);
      expect(options.skipTemplates).toBe(false);
    });

    it('should allow reloading config multiple times without error', () => {
      for (let i = 0; i < 3; i++) {
        delete require.cache[configPath];
        const reloaded = require(configPath);
        expect(reloaded).toBeDefined();
        expect(typeof reloaded).toBe('object');
      }
    });

    it('should have no-unused-vars pattern that matches single underscore prefix', () => {
      const rules = config.rules as Record<string, unknown>;
      const rule = rules['no-unused-vars'] as [string, Record<string, unknown>];
      const pattern = new RegExp(rule[1].argsIgnorePattern as string);

      // Should match _unused, _param, etc.
      expect(pattern.test('_unused')).toBe(true);
      expect(pattern.test('_param')).toBe(true);

      // Should NOT match variables without underscore prefix
      expect(pattern.test('unused')).toBe(false);
      expect(pattern.test('myVar')).toBe(false);
    });
  });
});