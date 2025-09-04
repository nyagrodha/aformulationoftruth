// jest.config.cjs
module.exports = {
  testEnvironment: 'node',
  // Disable Babel transforms so Jest uses Node's built-in ESM loader
  transform: {},
  // Only run tests in the tests/ folder
  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
