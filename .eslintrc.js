/**
 * ESLint Configuration for A Formulation of Truth
 *
 * Enforces code quality standards and prevents common issues
 * including smart quotes that can cause syntax errors.
 */

module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // Prevent smart quotes that cause syntax errors
    'no-irregular-whitespace': ['error', {
      skipStrings: false,
      skipComments: false,
      skipRegExps: false,
      skipTemplates: false
    }],

    // Enforce consistent quotes (single quotes preferred)
    'quotes': ['error', 'single', {
      avoidEscape: true,
      allowTemplateLiterals: true
    }],

    // Other useful rules for code quality
    'no-unused-vars': ['warn', {
      args: 'after-used',
      ignoreRestSiblings: true,
      argsIgnorePattern: '^_'
    }],
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],
    'indent': ['error', 2, {
      SwitchCase: 1
    }],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-blocks': 'error',
    'keyword-spacing': ['error', {
      before: true,
      after: true
    }],
    'space-infix-ops': 'error',
    'arrow-spacing': ['error', {
      before: true,
      after: true
    }],
    'no-multiple-empty-lines': ['error', {
      max: 2,
      maxEOF: 0
    }],

    // Prevent other Unicode issues
    'no-misleading-character-class': 'error',
    'unicode-bom': ['error', 'never']
  },
  overrides: [
    {
      // TypeScript files
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      extends: [
        'plugin:@typescript-eslint/recommended'
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'off'
      }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '*.min.js',
    'coverage/',
    '.git/'
  ]
};