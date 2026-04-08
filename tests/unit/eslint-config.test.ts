/**
 * Unit tests for .eslintrc.js - ESLint Configuration
 *
 * Tests cover:
 * - Config object structure
 * - Environment settings
 * - Parser options
 * - Rule configurations (smart quotes prevention, formatting, etc.)
 * - TypeScript override settings
 * - Ignore patterns
 * - NODE_ENV-dependent rule behavior
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Load the ESLint config (CommonJS module)
const eslintConfig = require('../../.eslintrc.js');

describe('ESLint Configuration (.eslintrc.js)', () => {
  describe('Config Structure', () => {
    it('should export a non-null config object', () => {
      expect(eslintConfig).toBeDefined();
      expect(eslintConfig).not.toBeNull();
      expect(typeof eslintConfig).toBe('object');
    });

    it('should have all required top-level keys', () => {
      expect(eslintConfig).toHaveProperty('env');
      expect(eslintConfig).toHaveProperty('extends');
      expect(eslintConfig).toHaveProperty('parserOptions');
      expect(eslintConfig).toHaveProperty('rules');
      expect(eslintConfig).toHaveProperty('overrides');
      expect(eslintConfig).toHaveProperty('ignorePatterns');
    });
  });

  describe('Environment Settings', () => {
    it('should enable browser environment', () => {
      expect(eslintConfig.env.browser).toBe(true);
    });

    it('should enable ES2021 features', () => {
      expect(eslintConfig.env.es2021).toBe(true);
    });

    it('should enable Node.js globals', () => {
      expect(eslintConfig.env.node).toBe(true);
    });

    it('should have exactly the expected environment keys', () => {
      const envKeys = Object.keys(eslintConfig.env);
      expect(envKeys).toContain('browser');
      expect(envKeys).toContain('es2021');
      expect(envKeys).toContain('node');
    });
  });

  describe('Extends Configuration', () => {
    it('should extend eslint:recommended', () => {
      expect(Array.isArray(eslintConfig.extends)).toBe(true);
      expect(eslintConfig.extends).toContain('eslint:recommended');
    });

    it('should only extend eslint:recommended at the top level (no extra global extends)', () => {
      expect(eslintConfig.extends).toHaveLength(1);
    });
  });

  describe('Parser Options', () => {
    it('should use latest ECMAScript version', () => {
      expect(eslintConfig.parserOptions.ecmaVersion).toBe('latest');
    });

    it('should use ES module source type', () => {
      expect(eslintConfig.parserOptions.sourceType).toBe('module');
    });
  });

  describe('Smart Quote Prevention Rules', () => {
    it('should flag no-irregular-whitespace as error', () => {
      const rule = eslintConfig.rules['no-irregular-whitespace'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
    });

    it('should not skip strings in no-irregular-whitespace', () => {
      const ruleOptions = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(ruleOptions.skipStrings).toBe(false);
    });

    it('should not skip comments in no-irregular-whitespace', () => {
      const ruleOptions = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(ruleOptions.skipComments).toBe(false);
    });

    it('should not skip regular expressions in no-irregular-whitespace', () => {
      const ruleOptions = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(ruleOptions.skipRegExps).toBe(false);
    });

    it('should not skip template literals in no-irregular-whitespace', () => {
      const ruleOptions = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(ruleOptions.skipTemplates).toBe(false);
    });

    it('should flag no-misleading-character-class as error', () => {
      expect(eslintConfig.rules['no-misleading-character-class']).toBe('error');
    });

    it('should flag unicode-bom as error and disallow BOM', () => {
      const rule = eslintConfig.rules['unicode-bom'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });
  });

  describe('Quote Rules', () => {
    it('should enforce single quotes', () => {
      const rule = eslintConfig.rules['quotes'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('single');
    });

    it('should allow escape to avoid unnecessary quoting issues', () => {
      const ruleOptions = eslintConfig.rules['quotes'][2];
      expect(ruleOptions.avoidEscape).toBe(true);
    });

    it('should allow template literals', () => {
      const ruleOptions = eslintConfig.rules['quotes'][2];
      expect(ruleOptions.allowTemplateLiterals).toBe(true);
    });
  });

  describe('Unused Variables Rule', () => {
    it('should warn (not error) on unused variables', () => {
      const rule = eslintConfig.rules['no-unused-vars'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('warn');
    });

    it('should use after-used strategy for args', () => {
      const ruleOptions = eslintConfig.rules['no-unused-vars'][1];
      expect(ruleOptions.args).toBe('after-used');
    });

    it('should ignore rest siblings', () => {
      const ruleOptions = eslintConfig.rules['no-unused-vars'][1];
      expect(ruleOptions.ignoreRestSiblings).toBe(true);
    });

    it('should allow underscore-prefixed arguments to be unused', () => {
      const ruleOptions = eslintConfig.rules['no-unused-vars'][1];
      expect(ruleOptions.argsIgnorePattern).toBe('^_');
    });
  });

  describe('Formatting Rules', () => {
    it('should require semicolons', () => {
      const rule = eslintConfig.rules['semi'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });

    it('should disallow trailing commas', () => {
      const rule = eslintConfig.rules['comma-dangle'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });

    it('should disallow trailing whitespace', () => {
      expect(eslintConfig.rules['no-trailing-spaces']).toBe('error');
    });

    it('should require a newline at end of file', () => {
      const rule = eslintConfig.rules['eol-last'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });

    it('should enforce 2-space indentation', () => {
      const rule = eslintConfig.rules['indent'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe(2);
    });

    it('should indent switch cases by 1 level', () => {
      const ruleOptions = eslintConfig.rules['indent'][2];
      expect(ruleOptions.SwitchCase).toBe(1);
    });

    it('should require spaces inside object curly braces', () => {
      const rule = eslintConfig.rules['object-curly-spacing'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });

    it('should disallow spaces inside array brackets', () => {
      const rule = eslintConfig.rules['array-bracket-spacing'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });

    it('should require space before blocks', () => {
      expect(eslintConfig.rules['space-before-blocks']).toBe('error');
    });

    it('should require keyword spacing before and after', () => {
      const rule = eslintConfig.rules['keyword-spacing'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1].before).toBe(true);
      expect(rule[1].after).toBe(true);
    });

    it('should require spaces around infix operators', () => {
      expect(eslintConfig.rules['space-infix-ops']).toBe('error');
    });

    it('should require spaces before and after arrow function arrows', () => {
      const rule = eslintConfig.rules['arrow-spacing'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1].before).toBe(true);
      expect(rule[1].after).toBe(true);
    });

    it('should limit consecutive empty lines to 2', () => {
      const rule = eslintConfig.rules['no-multiple-empty-lines'];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1].max).toBe(2);
    });

    it('should disallow empty lines at end of file', () => {
      const ruleOptions = eslintConfig.rules['no-multiple-empty-lines'][1];
      expect(ruleOptions.maxEOF).toBe(0);
    });
  });

  describe('NODE_ENV-Dependent Rules', () => {
    it('should have no-console rule configured (value depends on NODE_ENV)', () => {
      const rule = eslintConfig.rules['no-console'];
      expect(rule).toBeDefined();
      // In test environment (NODE_ENV=test), rule should be 'off'
      // In production environment, rule should be 'warn'
      expect(['off', 'warn']).toContain(rule);
    });

    it('should turn off no-console rule in non-production environments', () => {
      // NODE_ENV is 'test' in this test context (set by setup.ts)
      expect(process.env.NODE_ENV).toBe('test');
      // The config is loaded with current NODE_ENV='test', which is not 'production'
      expect(eslintConfig.rules['no-console']).toBe('off');
    });

    it('should have no-debugger rule configured (value depends on NODE_ENV)', () => {
      const rule = eslintConfig.rules['no-debugger'];
      expect(rule).toBeDefined();
      expect(['off', 'error']).toContain(rule);
    });

    it('should turn off no-debugger rule in non-production environments', () => {
      // NODE_ENV is 'test' in this test context
      expect(eslintConfig.rules['no-debugger']).toBe('off');
    });
  });

  describe('TypeScript Override Configuration', () => {
    it('should have an overrides array', () => {
      expect(Array.isArray(eslintConfig.overrides)).toBe(true);
      expect(eslintConfig.overrides.length).toBeGreaterThan(0);
    });

    it('should have a TypeScript-specific override', () => {
      const tsOverride = eslintConfig.overrides.find(
        (o: { files: string | string[] }) =>
          Array.isArray(o.files) &&
          o.files.includes('*.ts') &&
          o.files.includes('*.tsx')
      );
      expect(tsOverride).toBeDefined();
    });

    it('should use @typescript-eslint/parser for TypeScript files', () => {
      const tsOverride = eslintConfig.overrides[0];
      expect(tsOverride.parser).toBe('@typescript-eslint/parser');
    });

    it('should extend @typescript-eslint/recommended for TypeScript files', () => {
      const tsOverride = eslintConfig.overrides[0];
      expect(Array.isArray(tsOverride.extends)).toBe(true);
      expect(tsOverride.extends).toContain('plugin:@typescript-eslint/recommended');
    });

    it('should warn (not error) on explicit-any in TypeScript files', () => {
      const tsOverride = eslintConfig.overrides[0];
      expect(tsOverride.rules['@typescript-eslint/no-explicit-any']).toBe('warn');
    });

    it('should turn off explicit-module-boundary-types in TypeScript files', () => {
      const tsOverride = eslintConfig.overrides[0];
      expect(tsOverride.rules['@typescript-eslint/explicit-module-boundary-types']).toBe('off');
    });

    it('TypeScript override should target .ts and .tsx files', () => {
      const tsOverride = eslintConfig.overrides[0];
      expect(tsOverride.files).toContain('*.ts');
      expect(tsOverride.files).toContain('*.tsx');
    });
  });

  describe('Ignore Patterns', () => {
    it('should ignore node_modules', () => {
      expect(eslintConfig.ignorePatterns).toContain('node_modules/');
    });

    it('should ignore dist directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('dist/');
    });

    it('should ignore build directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('build/');
    });

    it('should ignore minified JavaScript files', () => {
      expect(eslintConfig.ignorePatterns).toContain('*.min.js');
    });

    it('should ignore coverage directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('coverage/');
    });

    it('should ignore .git directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('.git/');
    });

    it('should have exactly 6 ignore patterns', () => {
      expect(eslintConfig.ignorePatterns).toHaveLength(6);
    });
  });

  describe('Rule Severity Validation', () => {
    const errorRules = [
      'no-irregular-whitespace',
      'quotes',
      'semi',
      'comma-dangle',
      'no-trailing-spaces',
      'eol-last',
      'indent',
      'object-curly-spacing',
      'array-bracket-spacing',
      'space-before-blocks',
      'keyword-spacing',
      'space-infix-ops',
      'arrow-spacing',
      'no-multiple-empty-lines',
      'no-misleading-character-class',
      'unicode-bom',
    ];

    errorRules.forEach((ruleName) => {
      it(`should configure "${ruleName}" with error severity`, () => {
        const rule = eslintConfig.rules[ruleName];
        const severity = Array.isArray(rule) ? rule[0] : rule;
        expect(severity).toBe('error');
      });
    });

    it('should configure no-unused-vars with warn severity', () => {
      const rule = eslintConfig.rules['no-unused-vars'];
      const severity = Array.isArray(rule) ? rule[0] : rule;
      expect(severity).toBe('warn');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should not have empty rules object', () => {
      expect(Object.keys(eslintConfig.rules).length).toBeGreaterThan(0);
    });

    it('should define at least 15 rules', () => {
      // Ensures the config is comprehensive and not accidentally trimmed
      expect(Object.keys(eslintConfig.rules).length).toBeGreaterThanOrEqual(15);
    });

    it('no-irregular-whitespace options should all be booleans', () => {
      const options = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(typeof options.skipStrings).toBe('boolean');
      expect(typeof options.skipComments).toBe('boolean');
      expect(typeof options.skipRegExps).toBe('boolean');
      expect(typeof options.skipTemplates).toBe('boolean');
    });

    it('indent rule should use a positive integer for spaces', () => {
      const spaces = eslintConfig.rules['indent'][1];
      expect(typeof spaces).toBe('number');
      expect(spaces).toBeGreaterThan(0);
    });

    it('no-multiple-empty-lines max should be non-negative', () => {
      const { max, maxEOF } = eslintConfig.rules['no-multiple-empty-lines'][1];
      expect(max).toBeGreaterThanOrEqual(0);
      expect(maxEOF).toBeGreaterThanOrEqual(0);
    });

    it('argsIgnorePattern should be a valid regex pattern string', () => {
      const pattern = eslintConfig.rules['no-unused-vars'][1].argsIgnorePattern;
      expect(typeof pattern).toBe('string');
      // Verify it compiles as a valid regex without throwing
      expect(() => new RegExp(pattern)).not.toThrow();
      // Pattern should match underscore-prefixed names
      expect(new RegExp(pattern).test('_unused')).toBe(true);
      // Pattern should not match regular variable names
      expect(new RegExp(pattern).test('usedVar')).toBe(false);
    });

    it('overrides should be an array (not undefined or object)', () => {
      expect(Array.isArray(eslintConfig.overrides)).toBe(true);
    });

    it('ignorePatterns should be an array of strings', () => {
      expect(Array.isArray(eslintConfig.ignorePatterns)).toBe(true);
      eslintConfig.ignorePatterns.forEach((pattern: unknown) => {
        expect(typeof pattern).toBe('string');
      });
    });

    it('no-console rule value should only be off or warn (never error)', () => {
      // no-console should never be 'error' level - it's development-friendly
      const rule = eslintConfig.rules['no-console'];
      expect(rule).not.toBe('error');
      expect(['off', 'warn']).toContain(rule);
    });
  });
});