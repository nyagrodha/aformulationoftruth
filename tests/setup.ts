// Global test setup
import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Load environment from /etc/a4mula.env
const envPath = '/etc/a4mula.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    }
  });
}

// Set test-specific environment variables
process.env.NODE_ENV = 'test';

// Ensure required variables are set (use defaults if not loaded from env file)
if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL not found in /etc/a4mula.env, tests will fail');
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret';
}
if (!process.env.VPS_ENCRYPTION_KEY) {
  process.env.VPS_ENCRYPTION_KEY = 'test-encryption-key-32-chars!!!';
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up test timeout
jest.setTimeout(10000); // 10 seconds

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
