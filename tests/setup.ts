// Global test setup
import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'util';
import * as fs from 'fs';

// Load environment from /etc/a4mula.env if present
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

// Ensure required variables are set (use defaults if not loaded from env file)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? 'test-session-secret';
process.env.VPS_ENCRYPTION_KEY = process.env.VPS_ENCRYPTION_KEY ?? 'test-encryption-key-32-chars!!!';
process.env.PORT = process.env.PORT ?? '0';

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

// Provide Node <-> browser polyfills that some modules rely on
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

if (!global.fetch) {
  global.fetch = jest.fn() as unknown as typeof fetch;
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
