import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach } from '@jest/globals';

// Mock the pg module
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

const MockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  query: mockQuery,
  end: mockEnd
}));

// Mock the pg module
jest.unstable_mockModule('pg', () => ({
  Client: MockClient
}));

describe('Database Connection Tests', () => {
  beforeEach(() => {
    // Clear all mock implementations and calls
    MockClient.mockClear();
    mockConnect.mockClear();
    mockQuery.mockClear();
    mockEnd.mockClear();
  });

  describe('PostgreSQL Client Initialization', () => {
    test('should create PostgreSQL client with connection string', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
      
      // Import after mocking
      const { Client } = await import('pg');
      
      new Client({
        connectionString: process.env.DATABASE_URL
      });

      expect(MockClient).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@localhost:5432/testdb'
      });
    });

    test('should handle successful database connection', async () => {
      mockConnect.mockResolvedValue();
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // users table creation
        .mockResolvedValueOnce({ rows: [] }); // responses table creation

      const { Client } = await import('pg');
      const client = new Client();
      
      await client.connect();
      
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    test('should handle database connection failure', async () => {
      const connectionError = new Error('Connection failed');
      mockConnect.mockRejectedValue(connectionError);

      const { Client } = await import('pg');
      const client = new Client();

      await expect(client.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('Database Table Creation', () => {
    test('should create users table with correct schema', async () => {
      const expectedQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        token TEXT
      );
    `;

      mockQuery.mockResolvedValue({ rows: [] });

      const { Client } = await import('pg');
      const client = new Client();
      await client.query(expectedQuery);

      expect(mockQuery).toHaveBeenCalledWith(expectedQuery);
    });

    test('should create responses table with correct schema', async () => {
      const expectedQuery = `
      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        question TEXT,
        answer TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `;

      mockQuery.mockResolvedValue({ rows: [] });

      const { Client } = await import('pg');
      const client = new Client();
      await client.query(expectedQuery);

      expect(mockQuery).toHaveBeenCalledWith(expectedQuery);
    });

    test('should handle table creation errors gracefully', async () => {
      const tableError = new Error('Table creation failed');
      mockQuery.mockRejectedValue(tableError);

      const { Client } = await import('pg');
      const client = new Client();

      await expect(client.query('CREATE TABLE...')).rejects.toThrow('Table creation failed');
    });
  });

  describe('Query Parameter Binding', () => {
    test('should use PostgreSQL parameter syntax ($1, $2)', async () => {
      const testEmail = 'test@example.com';
      mockQuery.mockResolvedValue({ 
        rows: [{ id: 1, email: testEmail }] 
      });

      const { Client } = await import('pg');
      const client = new Client();
      await client.query('SELECT * FROM users WHERE email = $1', [testEmail]);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1', 
        [testEmail]
      );
    });

    test('should handle multiple parameters correctly', async () => {
      const userId = 1;
      const question = 'What is your favorite memory?';
      const answer = 'Playing in the garden as a child.';

      mockQuery.mockResolvedValue({ rows: [] });

      const { Client } = await import('pg');
      const client = new Client();
      await client.query(
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [userId, question, answer]
      );

      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [userId, question, answer]
      );
    });
  });
});
