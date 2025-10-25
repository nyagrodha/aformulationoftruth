import { Pool } from 'pg';
import { pool } from '../../server/db';

describe('Database Connection Tests', () => {
  describe('Connection Pool Configuration', () => {
    it('should have correct pool configuration', () => {
      expect(pool.options.max).toBe(20);
      expect(pool.options.idleTimeoutMillis).toBe(30000);
      expect(pool.options.connectionTimeoutMillis).toBe(2000);
    });

    it('should have DATABASE_URL set', () => {
      expect(process.env.DATABASE_URL).toBeDefined();
      expect(process.env.DATABASE_URL).toBeTruthy();
    });
  });

  describe('Basic Connection', () => {
    it('should successfully connect to database', async () => {
      const client = await pool.connect();
      expect(client).toBeDefined();
      client.release();
    });

    it('should execute a simple query', async () => {
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });

    it('should return current database name', async () => {
      const result = await pool.query('SELECT current_database()');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_database).toBeDefined();
    });

    it('should check PostgreSQL version', async () => {
      const result = await pool.query('SELECT version()');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].version).toContain('PostgreSQL');
    });
  });

  describe('Connection Pool Health', () => {
    it('should have available connections', () => {
      expect(pool.totalCount).toBeLessThanOrEqual(20);
      expect(pool.idleCount).toBeGreaterThanOrEqual(0);
      expect(pool.waitingCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple concurrent connections', async () => {
      const promises = Array.from({ length: 5 }, () =>
        pool.query('SELECT NOW()')
      );
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.rows).toHaveLength(1);
      });
    });

    it('should reuse connections from pool', async () => {
      const client1 = await pool.connect();
      const initialCount = pool.totalCount;
      client1.release();
      
      const client2 = await pool.connect();
      expect(pool.totalCount).toBeLessThanOrEqual(initialCount + 1);
      client2.release();
    });
  });

  describe('Connection Error Handling', () => {
    it('should handle query errors gracefully', async () => {
      await expect(
        pool.query('SELECT * FROM nonexistent_table')
      ).rejects.toThrow();
    });

    it('should handle syntax errors', async () => {
      await expect(
        pool.query('INVALID SQL SYNTAX')
      ).rejects.toThrow();
    });

    it('should recover after an error', async () => {
      try {
        await pool.query('SELECT * FROM nonexistent_table');
      } catch (error) {
        // Expected error
      }
      
      // Should still work after error
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('Transaction Support', () => {
    it('should support transactions', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });

    it('should rollback on error', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await expect(
          client.query('SELECT * FROM nonexistent_table')
        ).rejects.toThrow();
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  describe('Connection Timeout', () => {
    it('should respect connection timeout settings', async () => {
      const testPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 100,
      });
      
      try {
        // This should work with valid connection
        const result = await testPool.query('SELECT 1');
        expect(result.rows[0]).toEqual({ '?column?': 1 });
      } finally {
        await testPool.end();
      }
    });
  });

  afterAll(async () => {
    // Don't close the main pool as it might be used by other tests
    // await pool.end();
  });
});
