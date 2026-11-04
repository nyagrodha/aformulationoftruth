export default {
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  rootDir: '..',
  moduleDirectories: ['node_modules', '<rootDir>/tests/node_modules'],
  testEnvironment: 'node',
  testRegex: '/tests/newsletter_form_test\\.ts$',
  transform: {
    '^.+\\.tsx?$': [
      '<rootDir>/tests/node_modules/ts-jest',
      {
        diagnostics: false,
        isolatedModules: true,
        useESM: true,
        tsconfig: {
          allowImportingTsExtensions: true,
          esModuleInterop: true,
          jsx: 'react-jsx',
          jsxImportSource: 'preact',
          module: 'ESNext',
          moduleResolution: 'node',
          target: 'ES2022',
        },
      },
    ],
  },
};
