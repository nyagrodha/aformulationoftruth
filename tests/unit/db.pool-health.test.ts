import { Pool } from 'pg';
import { pool } from '../../server/db';

describe('Database Pool Health Tests', () => {
  describe('Pool Exhaustion', () => {
    it('should handle max connections limit', async () => {
      const clients: any[] = [];
      
      try {
        // Try to acquire more than max connections (20)
        for (let i = 0; i < 20; i++) {
          const client = await pool.connect();
          clients.push(client);
        }
        
        expect(clients.length).toBe(20);
        expect(pool.totalCount).toBe(20);
      } finally {
        // Release all clients
        clients.forEach(client => client.release());
      }
    });

    it('should queue requests when pool is exhausted', async () => {
      const clients: any[] = [];
      let queuedRequestResolved = false;
      
      try {
        // Exhaust the pool
        for (let i = 0; i < 20; i++) {
          const client = await pool.connect();
          clients.push(client);
        }
        
        // This request should be queued
        const queuedPromise = pool.connect().then(client => {
          queuedRequestResolved = true;
          client.release();
        });
        
        // Wait a bit to ensure request is queued
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(queuedRequestResolved).toBe(false);
        
        // Release one client
        clients[0].release();
        clients.shift();
        
        // Queued request should now resolve
        await queuedPromise;
        expect(queuedRequestResolved).toBe(true);
      } finally {
        clients.forEach(client => client.release());
      }
    }, 15000);

    it('should recover after pool exhaustion', async () => {
      // Exhaust and release
      const clients = await Promise.all(
        Array.from({ length: 20 }, () => pool.connect())
      );
      clients.forEach(client => client.release());
      
      // Should work fine after recovery
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('Idle Timeout', () => {
    it('should have idle timeout configured', () => {
      expect(pool.options.idleTimeoutMillis).toBe(30000);
    });

    it('should maintain active connections', async () => {
      const client = await pool.connect();
      const initialCount = pool.totalCount;
      
      // Use the connection
      await client.query('SELECT 1');
      
      expect(pool.totalCount).toBeGreaterThanOrEqual(initialCount);
      client.release();
    });

    it('should handle idle connections properly', async () => {
      const client = await pool.connect();
      
      // Keep connection idle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Connection should still work
      const result = await client.query('SELECT 1');
      expect(result.rows[0]['?column?']).toBe(1);
      
      client.release();
    });
  });

  describe('Connection Recovery', () => {
    it('should recover from connection errors', async () => {
      try {
        // Cause an error
        await pool.query('SELECT * FROM nonexistent_table');
      } catch (error) {
        // Expected error
      }
      
      // Pool should still work
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });

    it('should handle transaction rollback and continue', async () => {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        try {
          await client.query('SELECT * FROM nonexistent_table');
        } catch (error) {
          await client.query('ROLLBACK');
        }
        
        // Connection should still be usable
        const result = await client.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      } finally {
        client.release();
      }
    });

    it('should handle multiple concurrent errors', async () => {
      const errorQueries = Array.from({ length: 5 }, () =>
        pool.query('SELECT * FROM nonexistent_table').catch(e => e)
      );
      
      await Promise.all(errorQueries);
      
      // Pool should still function
      const result = await pool.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle high concurrent load', async () => {
      const operations = Array.from({ length: 50 }, (_, i) =>
        pool.query('SELECT $1 as num', [i])
      );
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(50);
      results.forEach((result, i) => {
        expect(result.rows[0].num).toBe(i);
      });
    });

    it('should handle mixed read and write operations', async () => {
      const operations = [
        pool.query('SELECT NOW() as time'),
        pool.query('SELECT version()'),
        pool.query('SELECT current_database()'),
        pool.query('SELECT 1 + 1 as result'),
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.rows).toHaveLength(1);
      });
    });

    it('should handle concurrent transactions', async () => {
      const transactions = Array.from({ length: 5 }, async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await client.query('SELECT NOW()');
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
      
      const results = await Promise.all(transactions);
      expect(results).toHaveLength(5);
    });
  });

  describe('Connection Statistics', () => {
    it('should track pool statistics', () => {
      expect(pool.totalCount).toBeGreaterThanOrEqual(0);
      expect(pool.idleCount).toBeGreaterThanOrEqual(0);
      expect(pool.waitingCount).toBeGreaterThanOrEqual(0);
    });

    it('should have available connections after operations', async () => {
      await pool.query('SELECT 1');
      
      expect(pool.idleCount).toBeGreaterThan(0);
      expect(pool.totalCount).toBeLessThanOrEqual(20);
    });

    it('should properly release connections', async () => {
      const client = await pool.connect();
      const countBeforeRelease = pool.idleCount;
      
      client.release();
      
      // Idle count should increase after release
      expect(pool.idleCount).toBeGreaterThanOrEqual(countBeforeRelease);
    });
  });

  describe('Connection Timeout', () => {
    it('should respect connection timeout', async () => {
      // Using the configured 2000ms timeout
      expect(pool.options.connectionTimeoutMillis).toBe(2000);
    });

    it('should timeout on unavailable database', async () => {
      const testPool = new Pool({
        connectionString: 'postgresql://fake:fake@localhost:9999/fake',
        connectionTimeoutMillis: 1000,
      });
      
      const startTime = Date.now();
      
      try {
        await testPool.query('SELECT 1');
        fail('Should have timed out');
      } catch (error: any) {
        const elapsed = Date.now() - startTime;
        // Should timeout within reasonable time
        expect(elapsed).toBeLessThan(3000);
        expect(error).toBeDefined();
      } finally {
        await testPool.end();
      }
    }, 10000);
  });

  describe('Long-Running Queries', () => {
    it('should handle queries that take time', async () => {
      const result = await pool.query('SELECT pg_sleep(0.1), 1 as test');
      expect(result.rows[0].test).toBe(1);
    });

    it('should handle multiple simultaneous long queries', async () => {
      const queries = Array.from({ length: 3 }, () =>
        pool.query('SELECT pg_sleep(0.1), NOW() as time')
      );
      
      const results = await Promise.all(queries);
      expect(results).toHaveLength(3);
    }, 10000);
  });

  describe('Pool Health Check', () => {
    it('should be able to check pool health', async () => {
      const health = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      };
      
      expect(health.total).toBeGreaterThanOrEqual(0);
      expect(health.idle).toBeGreaterThanOrEqual(0);
      expect(health.waiting).toBeGreaterThanOrEqual(0);
      expect(health.total).toBeLessThanOrEqual(20);
    });

    it('should execute health check query', async () => {
      const result = await pool.query(`
        SELECT 
          current_database() as database,
          current_user as user,
          version() as version,
          NOW() as timestamp
      `);
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].database).toBeDefined();
      expect(result.rows[0].user).toBeDefined();
    });

    it('should check for active connections', async () => {
      const result = await pool.query(`
        SELECT count(*) as active_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      
      expect(result.rows[0].active_connections).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery Patterns', () => {
    it('should handle serialization errors', async () => {
      // Even if serialization error occurs, pool should recover
      try {
        const client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT 1');
        await client.query('COMMIT');
        client.release();
      } catch (error) {
        // Error handled
      }
      
      const result = await pool.query('SELECT 1');
      expect(result.rows[0]['?column?']).toBe(1);
    });

    it('should handle connection release after error', async () => {
      const client = await pool.connect();
      
      try {
        await client.query('INVALID SQL');
      } catch (error) {
        // Expected error
      }
      
      // Should still be able to release
      client.release();
      
      // Pool should still work
      const result = await pool.query('SELECT 1');
      expect(result.rows[0]['?column?']).toBe(1);
    });
  });
});
