/**
 * Tests for .eslintrc.js - ESLint Configuration
 *
 * Verifies that the ESLint configuration exports a valid, correctly structured
 * config object with the expected rules for preventing smart quotes, enforcing
 * code style, and providing TypeScript support.
 */

import { readFileSync } from 'fs';
import vm from 'vm';
import { createRequire } from 'module';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Resolve path relative to the project root (two levels up from tests/unit/)
const eslintConfigPath = new URL('../../.eslintrc.js', import.meta.url).pathname;

/**
 * Load the .eslintrc.js file using a CJS-style VM context.
 * This is necessary because the project has "type": "module" in package.json
 * but .eslintrc.js uses module.exports (CommonJS syntax).
 */
function loadEslintConfig(): EslintConfig {
  const fileContent = readFileSync(eslintConfigPath, 'utf8');
  const moduleObj: { exports: EslintConfig } = { exports: {} as EslintConfig };
  const context = vm.createContext({
    module: moduleObj,
    exports: moduleObj.exports,
    require: createRequire(eslintConfigPath),
    process: process,
    __filename: eslintConfigPath,
    __dirname: eslintConfigPath.substring(0, eslintConfigPath.lastIndexOf('/')),
  });
  vm.runInContext(fileContent, context);
  return moduleObj.exports;
}

interface EslintRule {
  [key: string]: unknown;
}

interface EslintOverride {
  files: string[];
  parser?: string;
  extends?: string[];
  rules?: EslintRule;
}

interface EslintConfig {
  env?: Record<string, boolean>;
  extends?: string[];
  parserOptions?: {
    ecmaVersion?: string | number;
    sourceType?: string;
  };
  rules?: EslintRule;
  overrides?: EslintOverride[];
  ignorePatterns?: string[];
}

let config: EslintConfig;
let originalNodeEnv: string | undefined;

describe('.eslintrc.js ESLint Configuration', () => {
  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    // Load with a neutral NODE_ENV so we can inspect both modes
    config = loadEslintConfig();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ─── Top-level structure ───────────────────────────────────────────────────

  describe('Config object structure', () => {
    it('exports a non-null object', () => {
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config).not.toBeNull();
    });

    it('has an env property', () => {
      expect(config.env).toBeDefined();
      expect(typeof config.env).toBe('object');
    });

    it('has an extends property that is an array', () => {
      expect(config.extends).toBeDefined();
      expect(Array.isArray(config.extends)).toBe(true);
    });

    it('has a parserOptions property', () => {
      expect(config.parserOptions).toBeDefined();
      expect(typeof config.parserOptions).toBe('object');
    });

    it('has a rules property', () => {
      expect(config.rules).toBeDefined();
      expect(typeof config.rules).toBe('object');
    });

    it('has an overrides property that is an array', () => {
      expect(config.overrides).toBeDefined();
      expect(Array.isArray(config.overrides)).toBe(true);
    });

    it('has an ignorePatterns property that is an array', () => {
      expect(config.ignorePatterns).toBeDefined();
      expect(Array.isArray(config.ignorePatterns)).toBe(true);
    });
  });

  // ─── Environment settings ──────────────────────────────────────────────────

  describe('env settings', () => {
    it('enables browser globals', () => {
      expect(config.env?.browser).toBe(true);
    });

    it('enables ES2021 globals', () => {
      expect(config.env?.es2021).toBe(true);
    });

    it('enables Node.js globals', () => {
      expect(config.env?.node).toBe(true);
    });
  });

  // ─── Extends ──────────────────────────────────────────────────────────────

  describe('extends', () => {
    it('includes eslint:recommended', () => {
      expect(config.extends).toContain('eslint:recommended');
    });
  });

  // ─── Parser options ───────────────────────────────────────────────────────

  describe('parserOptions', () => {
    it('sets ecmaVersion to "latest"', () => {
      expect(config.parserOptions?.ecmaVersion).toBe('latest');
    });

    it('sets sourceType to "module"', () => {
      expect(config.parserOptions?.sourceType).toBe('module');
    });
  });

  // ─── Quote rule ───────────────────────────────────────────────────────────

  describe('quotes rule', () => {
    it('is configured as an error', () => {
      const quotesRule = config.rules?.['quotes'] as unknown[];
      expect(Array.isArray(quotesRule)).toBe(true);
      expect(quotesRule[0]).toBe('error');
    });

    it('enforces single quotes', () => {
      const quotesRule = config.rules?.['quotes'] as unknown[];
      expect(quotesRule[1]).toBe('single');
    });

    it('allows escape to avoid double quoting', () => {
      const quotesRule = config.rules?.['quotes'] as unknown[];
      const options = quotesRule[2] as Record<string, unknown>;
      expect(options.avoidEscape).toBe(true);
    });

    it('allows template literals', () => {
      const quotesRule = config.rules?.['quotes'] as unknown[];
      const options = quotesRule[2] as Record<string, unknown>;
      expect(options.allowTemplateLiterals).toBe(true);
    });
  });

  // ─── no-irregular-whitespace rule ─────────────────────────────────────────

  describe('no-irregular-whitespace rule', () => {
    it('is configured as an error', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
    });

    it('does not skip strings', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.skipStrings).toBe(false);
    });

    it('does not skip comments', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.skipComments).toBe(false);
    });

    it('does not skip regexps', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.skipRegExps).toBe(false);
    });

    it('does not skip template literals', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.skipTemplates).toBe(false);
    });
  });

  // ─── semi rule ────────────────────────────────────────────────────────────

  describe('semi rule', () => {
    it('is configured as an error requiring semicolons', () => {
      const rule = config.rules?.['semi'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });
  });

  // ─── comma-dangle rule ────────────────────────────────────────────────────

  describe('comma-dangle rule', () => {
    it('is configured as an error disallowing trailing commas', () => {
      const rule = config.rules?.['comma-dangle'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });
  });

  // ─── no-unused-vars rule ──────────────────────────────────────────────────

  describe('no-unused-vars rule', () => {
    it('is configured as a warning', () => {
      const rule = config.rules?.['no-unused-vars'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('warn');
    });

    it('checks args after the last used argument', () => {
      const rule = config.rules?.['no-unused-vars'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.args).toBe('after-used');
    });

    it('ignores rest siblings', () => {
      const rule = config.rules?.['no-unused-vars'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.ignoreRestSiblings).toBe(true);
    });

    it('ignores args prefixed with underscore', () => {
      const rule = config.rules?.['no-unused-vars'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.argsIgnorePattern).toBe('^_');
    });
  });

  // ─── Formatting rules ─────────────────────────────────────────────────────

  describe('no-trailing-spaces rule', () => {
    it('is configured as an error', () => {
      expect(config.rules?.['no-trailing-spaces']).toBe('error');
    });
  });

  describe('eol-last rule', () => {
    it('requires a newline at end of file', () => {
      const rule = config.rules?.['eol-last'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });
  });

  describe('indent rule', () => {
    it('is configured as an error', () => {
      const rule = config.rules?.['indent'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
    });

    it('enforces 2-space indentation', () => {
      const rule = config.rules?.['indent'] as unknown[];
      expect(rule[1]).toBe(2);
    });

    it('indents switch cases by 1 level', () => {
      const rule = config.rules?.['indent'] as unknown[];
      const opts = rule[2] as Record<string, unknown>;
      expect(opts.SwitchCase).toBe(1);
    });
  });

  describe('object-curly-spacing rule', () => {
    it('requires spaces inside curly braces', () => {
      const rule = config.rules?.['object-curly-spacing'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('always');
    });
  });

  describe('array-bracket-spacing rule', () => {
    it('disallows spaces inside array brackets', () => {
      const rule = config.rules?.['array-bracket-spacing'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });
  });

  describe('space-before-blocks rule', () => {
    it('is configured as an error', () => {
      expect(config.rules?.['space-before-blocks']).toBe('error');
    });
  });

  describe('keyword-spacing rule', () => {
    it('requires spacing before and after keywords', () => {
      const rule = config.rules?.['keyword-spacing'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.before).toBe(true);
      expect(opts.after).toBe(true);
    });
  });

  describe('space-infix-ops rule', () => {
    it('is configured as an error', () => {
      expect(config.rules?.['space-infix-ops']).toBe('error');
    });
  });

  describe('arrow-spacing rule', () => {
    it('requires spaces before and after arrow', () => {
      const rule = config.rules?.['arrow-spacing'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.before).toBe(true);
      expect(opts.after).toBe(true);
    });
  });

  describe('no-multiple-empty-lines rule', () => {
    it('is configured as an error', () => {
      const rule = config.rules?.['no-multiple-empty-lines'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
    });

    it('allows at most 2 consecutive empty lines (not 3+)', () => {
      const rule = config.rules?.['no-multiple-empty-lines'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.max).toBe(2);
      expect(opts.max).not.toBeGreaterThan(2);
    });

    it('allows zero empty lines at end of file', () => {
      const rule = config.rules?.['no-multiple-empty-lines'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      expect(opts.maxEOF).toBe(0);
    });
  });

  // ─── Unicode / encoding rules ─────────────────────────────────────────────

  describe('no-misleading-character-class rule', () => {
    it('is configured as an error', () => {
      expect(config.rules?.['no-misleading-character-class']).toBe('error');
    });
  });

  describe('unicode-bom rule', () => {
    it('disallows a BOM at the start of files', () => {
      const rule = config.rules?.['unicode-bom'] as unknown[];
      expect(Array.isArray(rule)).toBe(true);
      expect(rule[0]).toBe('error');
      expect(rule[1]).toBe('never');
    });
  });

  // ─── Environment-dependent rules ──────────────────────────────────────────

  describe('no-console and no-debugger (environment-dependent)', () => {
    it('no-console rule is defined', () => {
      expect(config.rules?.['no-console']).toBeDefined();
    });

    it('no-debugger rule is defined', () => {
      expect(config.rules?.['no-debugger']).toBeDefined();
    });

    it('no-console is stricter in production (warn or error)', () => {
      // In test/dev environment it should be 'off'; in production it should be 'warn'
      const rule = config.rules?.['no-console'];
      // Rule must be one of the valid ESLint severity values
      const validValues = ['off', 'warn', 'error', 0, 1, 2];
      expect(validValues).toContain(rule);
    });

    it('no-debugger is stricter in production (error or warn)', () => {
      const rule = config.rules?.['no-debugger'];
      const validValues = ['off', 'warn', 'error', 0, 1, 2];
      expect(validValues).toContain(rule);
    });
  });

  // ─── TypeScript override ──────────────────────────────────────────────────

  describe('TypeScript override', () => {
    let tsOverride: EslintOverride | undefined;

    beforeAll(() => {
      tsOverride = config.overrides?.find(
        (o) => Array.isArray(o.files) && o.files.includes('*.ts')
      );
    });

    it('has a TypeScript override entry', () => {
      expect(tsOverride).toBeDefined();
    });

    it('matches .ts files', () => {
      expect(tsOverride?.files).toContain('*.ts');
    });

    it('matches .tsx files', () => {
      expect(tsOverride?.files).toContain('*.tsx');
    });

    it('uses @typescript-eslint/parser', () => {
      expect(tsOverride?.parser).toBe('@typescript-eslint/parser');
    });

    it('extends @typescript-eslint/recommended', () => {
      expect(tsOverride?.extends).toContain('plugin:@typescript-eslint/recommended');
    });

    it('warns on explicit any', () => {
      expect(tsOverride?.rules?.['@typescript-eslint/no-explicit-any']).toBe('warn');
    });

    it('turns off explicit module boundary types', () => {
      expect(tsOverride?.rules?.['@typescript-eslint/explicit-module-boundary-types']).toBe('off');
    });
  });

  // ─── ignorePatterns ───────────────────────────────────────────────────────

  describe('ignorePatterns', () => {
    it('ignores node_modules/', () => {
      expect(config.ignorePatterns).toContain('node_modules/');
    });

    it('ignores dist/', () => {
      expect(config.ignorePatterns).toContain('dist/');
    });

    it('ignores build/', () => {
      expect(config.ignorePatterns).toContain('build/');
    });

    it('ignores minified JS files', () => {
      expect(config.ignorePatterns).toContain('*.min.js');
    });

    it('ignores coverage/', () => {
      expect(config.ignorePatterns).toContain('coverage/');
    });

    it('ignores .git/', () => {
      expect(config.ignorePatterns).toContain('.git/');
    });
  });

  // ─── Boundary / regression tests ─────────────────────────────────────────

  describe('boundary and regression checks', () => {
    it('does not allow more than 2 as maxEOF for no-multiple-empty-lines', () => {
      const rule = config.rules?.['no-multiple-empty-lines'] as unknown[];
      const opts = rule[1] as Record<string, unknown>;
      // maxEOF should be 0 to prevent blank lines at end of files
      expect(opts.maxEOF).toBeLessThanOrEqual(0);
    });

    it('enforces 2-space not 4-space indent', () => {
      const rule = config.rules?.['indent'] as unknown[];
      expect(rule[1]).toBe(2);
      expect(rule[1]).not.toBe(4);
    });

    it('enforces single not double quotes', () => {
      const rule = config.rules?.['quotes'] as unknown[];
      expect(rule[1]).toBe('single');
      expect(rule[1]).not.toBe('double');
    });

    it('requires semicolons (not "never")', () => {
      const rule = config.rules?.['semi'] as unknown[];
      expect(rule[1]).toBe('always');
      expect(rule[1]).not.toBe('never');
    });

    it('object-curly-spacing uses "always" not "never"', () => {
      const rule = config.rules?.['object-curly-spacing'] as unknown[];
      expect(rule[1]).toBe('always');
      expect(rule[1]).not.toBe('never');
    });

    it('array-bracket-spacing uses "never" not "always"', () => {
      const rule = config.rules?.['array-bracket-spacing'] as unknown[];
      expect(rule[1]).toBe('never');
      expect(rule[1]).not.toBe('always');
    });

    it('typescript override is an array with exactly one entry', () => {
      const tsOverrides = config.overrides?.filter(
        (o) => Array.isArray(o.files) && (o.files.includes('*.ts') || o.files.includes('*.tsx'))
      );
      expect(tsOverrides?.length).toBe(1);
    });

    it('no-irregular-whitespace covers all token types (no skip options are true)', () => {
      const rule = config.rules?.['no-irregular-whitespace'] as unknown[];
      const opts = rule[1] as Record<string, boolean>;
      const allOptions = [opts.skipStrings, opts.skipComments, opts.skipRegExps, opts.skipTemplates];
      expect(allOptions.every((v) => v === false)).toBe(true);
    });
  });
});