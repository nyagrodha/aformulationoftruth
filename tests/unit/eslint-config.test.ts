/**
 * Tests for .eslintrc.js configuration
 *
 * Validates the ESLint configuration structure, rule settings, and overrides
 * introduced in this PR to enforce code quality standards.
 *
 * Note: .eslintrc.js uses CommonJS (module.exports) syntax. Because package.json
 * has "type": "module", we use Module._compile to load it as CJS explicitly.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Module from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a CommonJS config file in an ESM (type:module) package context.
 * This is needed because package.json has "type":"module", which causes
 * Node to treat .js files as ESM. The .eslintrc.js file uses module.exports,
 * so we compile it as CJS manually.
 */
function loadCJSFile(relativePath: string): Record<string, unknown> {
  const filepath = resolve(__dirname, relativePath);
  const content = readFileSync(filepath, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = new (Module as any)(filepath);
  m.filename = filepath;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m.paths = (Module as any)._nodeModulePaths(dirname(filepath));
  m._compile(content, filepath);
  return m.exports as Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eslintConfig: any;

beforeAll(() => {
  // Path from tests/unit/ up to project root where .eslintrc.js lives
  eslintConfig = loadCJSFile('../../.eslintrc.js');
});

describe('.eslintrc.js configuration', () => {
  describe('module export', () => {
    it('exports a non-null object', () => {
      expect(eslintConfig).toBeDefined();
      expect(typeof eslintConfig).toBe('object');
      expect(eslintConfig).not.toBeNull();
    });

    it('contains all top-level configuration keys', () => {
      expect(eslintConfig).toHaveProperty('env');
      expect(eslintConfig).toHaveProperty('extends');
      expect(eslintConfig).toHaveProperty('parserOptions');
      expect(eslintConfig).toHaveProperty('rules');
      expect(eslintConfig).toHaveProperty('overrides');
      expect(eslintConfig).toHaveProperty('ignorePatterns');
    });
  });

  describe('env', () => {
    it('enables browser environment', () => {
      expect(eslintConfig.env.browser).toBe(true);
    });

    it('enables ES2021 environment', () => {
      expect(eslintConfig.env.es2021).toBe(true);
    });

    it('enables Node.js environment', () => {
      expect(eslintConfig.env.node).toBe(true);
    });
  });

  describe('extends', () => {
    it('is an array', () => {
      expect(Array.isArray(eslintConfig.extends)).toBe(true);
    });

    it('includes eslint:recommended', () => {
      expect(eslintConfig.extends).toContain('eslint:recommended');
    });
  });

  describe('parserOptions', () => {
    it('sets ecmaVersion to latest', () => {
      expect(eslintConfig.parserOptions.ecmaVersion).toBe('latest');
    });

    it('sets sourceType to module', () => {
      expect(eslintConfig.parserOptions.sourceType).toBe('module');
    });
  });

  describe('rules', () => {
    describe('no-irregular-whitespace', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['no-irregular-whitespace'];
        expect(Array.isArray(rule)).toBe(true);
        expect(rule[0]).toBe('error');
      });

      it('does not skip strings', () => {
        const options = eslintConfig.rules['no-irregular-whitespace'][1];
        expect(options.skipStrings).toBe(false);
      });

      it('does not skip comments', () => {
        const options = eslintConfig.rules['no-irregular-whitespace'][1];
        expect(options.skipComments).toBe(false);
      });

      it('does not skip regular expressions', () => {
        const options = eslintConfig.rules['no-irregular-whitespace'][1];
        expect(options.skipRegExps).toBe(false);
      });

      it('does not skip template literals', () => {
        const options = eslintConfig.rules['no-irregular-whitespace'][1];
        expect(options.skipTemplates).toBe(false);
      });
    });

    describe('quotes', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['quotes'];
        expect(rule[0]).toBe('error');
      });

      it('enforces single quotes', () => {
        const rule = eslintConfig.rules['quotes'];
        expect(rule[1]).toBe('single');
      });

      it('allows escape to avoid quote conflicts', () => {
        const options = eslintConfig.rules['quotes'][2];
        expect(options.avoidEscape).toBe(true);
      });

      it('allows template literals', () => {
        const options = eslintConfig.rules['quotes'][2];
        expect(options.allowTemplateLiterals).toBe(true);
      });
    });

    describe('no-unused-vars', () => {
      it('is set to warn level', () => {
        const rule = eslintConfig.rules['no-unused-vars'];
        expect(rule[0]).toBe('warn');
      });

      it('checks arguments after used position', () => {
        const options = eslintConfig.rules['no-unused-vars'][1];
        expect(options.args).toBe('after-used');
      });

      it('ignores rest siblings', () => {
        const options = eslintConfig.rules['no-unused-vars'][1];
        expect(options.ignoreRestSiblings).toBe(true);
      });

      it('ignores args prefixed with underscore', () => {
        const options = eslintConfig.rules['no-unused-vars'][1];
        expect(options.argsIgnorePattern).toBe('^_');
      });
    });

    describe('semi', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['semi'];
        expect(rule[0]).toBe('error');
      });

      it('always requires semicolons', () => {
        const rule = eslintConfig.rules['semi'];
        expect(rule[1]).toBe('always');
      });
    });

    describe('comma-dangle', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['comma-dangle'];
        expect(rule[0]).toBe('error');
      });

      it('never allows trailing commas', () => {
        const rule = eslintConfig.rules['comma-dangle'];
        expect(rule[1]).toBe('never');
      });
    });

    describe('no-trailing-spaces', () => {
      it('is set to error', () => {
        expect(eslintConfig.rules['no-trailing-spaces']).toBe('error');
      });
    });

    describe('eol-last', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['eol-last'];
        expect(rule[0]).toBe('error');
      });

      it('always requires newline at end of file', () => {
        const rule = eslintConfig.rules['eol-last'];
        expect(rule[1]).toBe('always');
      });
    });

    describe('indent', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['indent'];
        expect(rule[0]).toBe('error');
      });

      it('enforces 2-space indentation', () => {
        const rule = eslintConfig.rules['indent'];
        expect(rule[1]).toBe(2);
      });

      it('indents switch cases by 1 level', () => {
        const options = eslintConfig.rules['indent'][2];
        expect(options.SwitchCase).toBe(1);
      });
    });

    describe('object-curly-spacing', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['object-curly-spacing'];
        expect(rule[0]).toBe('error');
      });

      it('always requires spaces inside braces', () => {
        const rule = eslintConfig.rules['object-curly-spacing'];
        expect(rule[1]).toBe('always');
      });
    });

    describe('array-bracket-spacing', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['array-bracket-spacing'];
        expect(rule[0]).toBe('error');
      });

      it('never allows spaces inside brackets', () => {
        const rule = eslintConfig.rules['array-bracket-spacing'];
        expect(rule[1]).toBe('never');
      });
    });

    describe('space-before-blocks', () => {
      it('is set to error', () => {
        expect(eslintConfig.rules['space-before-blocks']).toBe('error');
      });
    });

    describe('keyword-spacing', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['keyword-spacing'];
        expect(rule[0]).toBe('error');
      });

      it('requires space before keywords', () => {
        const options = eslintConfig.rules['keyword-spacing'][1];
        expect(options.before).toBe(true);
      });

      it('requires space after keywords', () => {
        const options = eslintConfig.rules['keyword-spacing'][1];
        expect(options.after).toBe(true);
      });
    });

    describe('space-infix-ops', () => {
      it('is set to error', () => {
        expect(eslintConfig.rules['space-infix-ops']).toBe('error');
      });
    });

    describe('arrow-spacing', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['arrow-spacing'];
        expect(rule[0]).toBe('error');
      });

      it('requires space before arrow', () => {
        const options = eslintConfig.rules['arrow-spacing'][1];
        expect(options.before).toBe(true);
      });

      it('requires space after arrow', () => {
        const options = eslintConfig.rules['arrow-spacing'][1];
        expect(options.after).toBe(true);
      });
    });

    describe('no-multiple-empty-lines', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['no-multiple-empty-lines'];
        expect(rule[0]).toBe('error');
      });

      it('allows at most 2 consecutive empty lines', () => {
        const options = eslintConfig.rules['no-multiple-empty-lines'][1];
        expect(options.max).toBe(2);
      });

      it('allows 0 empty lines at end of file', () => {
        const options = eslintConfig.rules['no-multiple-empty-lines'][1];
        expect(options.maxEOF).toBe(0);
      });
    });

    describe('no-misleading-character-class', () => {
      it('is set to error', () => {
        expect(eslintConfig.rules['no-misleading-character-class']).toBe('error');
      });
    });

    describe('unicode-bom', () => {
      it('is set to error level', () => {
        const rule = eslintConfig.rules['unicode-bom'];
        expect(rule[0]).toBe('error');
      });

      it('never allows BOM characters', () => {
        const rule = eslintConfig.rules['unicode-bom'];
        expect(rule[1]).toBe('never');
      });
    });

    describe('no-console (environment-dependent)', () => {
      it('is off in non-production environments', () => {
        // In the test environment NODE_ENV is not 'production', so the rule is 'off'
        // The config evaluates: process.env.NODE_ENV === 'production' ? 'warn' : 'off'
        expect(eslintConfig.rules['no-console']).toBe('off');
      });
    });

    describe('no-debugger (environment-dependent)', () => {
      it('is off in non-production environments', () => {
        // In the test environment NODE_ENV is not 'production', so the rule is 'off'
        // The config evaluates: process.env.NODE_ENV === 'production' ? 'error' : 'off'
        expect(eslintConfig.rules['no-debugger']).toBe('off');
      });
    });
  });

  describe('overrides', () => {
    it('is an array', () => {
      expect(Array.isArray(eslintConfig.overrides)).toBe(true);
    });

    it('contains at least one override', () => {
      expect(eslintConfig.overrides.length).toBeGreaterThanOrEqual(1);
    });

    describe('TypeScript override', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tsOverride: any;

      beforeAll(() => {
        tsOverride = eslintConfig.overrides.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (o: any) => Array.isArray(o.files) && o.files.includes('*.ts')
        );
      });

      it('exists for *.ts and *.tsx files', () => {
        expect(tsOverride).toBeDefined();
        expect(tsOverride.files).toContain('*.ts');
        expect(tsOverride.files).toContain('*.tsx');
      });

      it('uses @typescript-eslint/parser', () => {
        expect(tsOverride.parser).toBe('@typescript-eslint/parser');
      });

      it('extends @typescript-eslint/recommended', () => {
        expect(tsOverride.extends).toContain('plugin:@typescript-eslint/recommended');
      });

      it('sets @typescript-eslint/no-explicit-any to warn', () => {
        expect(tsOverride.rules['@typescript-eslint/no-explicit-any']).toBe('warn');
      });

      it('turns off explicit-module-boundary-types', () => {
        expect(tsOverride.rules['@typescript-eslint/explicit-module-boundary-types']).toBe('off');
      });
    });
  });

  describe('ignorePatterns', () => {
    it('is an array', () => {
      expect(Array.isArray(eslintConfig.ignorePatterns)).toBe(true);
    });

    it('ignores node_modules/', () => {
      expect(eslintConfig.ignorePatterns).toContain('node_modules/');
    });

    it('ignores dist/', () => {
      expect(eslintConfig.ignorePatterns).toContain('dist/');
    });

    it('ignores build/', () => {
      expect(eslintConfig.ignorePatterns).toContain('build/');
    });

    it('ignores minified JS files', () => {
      expect(eslintConfig.ignorePatterns).toContain('*.min.js');
    });

    it('ignores coverage directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('coverage/');
    });

    it('ignores .git directory', () => {
      expect(eslintConfig.ignorePatterns).toContain('.git/');
    });
  });

  describe('rule severity consistency', () => {
    it('all formatting rules use error level not numeric 2', () => {
      const errorRules = [
        'no-irregular-whitespace',
        'semi',
        'comma-dangle',
        'no-trailing-spaces',
        'eol-last',
        'indent',
        'object-curly-spacing',
        'array-bracket-spacing',
        'space-before-blocks',
        'space-infix-ops',
        'no-misleading-character-class',
        'keyword-spacing',
        'arrow-spacing',
        'no-multiple-empty-lines',
        'unicode-bom',
      ];

      for (const ruleName of errorRules) {
        const rule = eslintConfig.rules[ruleName];
        const severity = Array.isArray(rule) ? rule[0] : rule;
        expect(severity).toBe('error');
      }
    });

    it('no-unused-vars uses warn severity not numeric 1', () => {
      const rule = eslintConfig.rules['no-unused-vars'];
      const severity = Array.isArray(rule) ? rule[0] : rule;
      expect(severity).toBe('warn');
    });
  });

  describe('config consistency and design intent', () => {
    it('indent and object-curly-spacing are compatible (2-space indent with spaced braces)', () => {
      expect(eslintConfig.rules['indent'][1]).toBe(2);
      expect(eslintConfig.rules['object-curly-spacing'][1]).toBe('always');
    });

    it('no-trailing-spaces and eol-last together eliminate file whitespace issues', () => {
      expect(eslintConfig.rules['no-trailing-spaces']).toBe('error');
      expect(eslintConfig.rules['eol-last'][1]).toBe('always');
    });

    it('keyword-spacing and space-before-blocks ensure consistent spacing around blocks', () => {
      expect(eslintConfig.rules['keyword-spacing'][1].before).toBe(true);
      expect(eslintConfig.rules['keyword-spacing'][1].after).toBe(true);
      expect(eslintConfig.rules['space-before-blocks']).toBe('error');
    });

    it('no-irregular-whitespace is configured strictly with all skip options disabled', () => {
      const opts = eslintConfig.rules['no-irregular-whitespace'][1];
      expect(opts.skipStrings).toBe(false);
      expect(opts.skipComments).toBe(false);
      expect(opts.skipRegExps).toBe(false);
      expect(opts.skipTemplates).toBe(false);
    });

    it('quotes rule allows template literals to support multi-line strings', () => {
      expect(eslintConfig.rules['quotes'][1]).toBe('single');
      expect(eslintConfig.rules['quotes'][2].allowTemplateLiterals).toBe(true);
    });

    it('comma-dangle never and eol-last always prevent trailing comma + no-newline issues', () => {
      expect(eslintConfig.rules['comma-dangle'][1]).toBe('never');
      expect(eslintConfig.rules['eol-last'][1]).toBe('always');
    });
  });
});