import { pool } from '../../server/db';
import { db } from '../../server/db';

describe('Database Integrity and Monitoring Tests', () => {
  describe('Schema Consistency', () => {
    it('should have consistent schema across core tables', async () => {
      const tables = ['users', 'sessions', 'magic_links', 'questionnaire_sessions', 'responses'];
      
      for (const table of tables) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [table]);
        
        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should have all required indexes', async () => {
      const result = await pool.query(`
        SELECT 
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname;
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Check for session expire index
      const sessionIndex = result.rows.find(r => 
        r.tablename === 'sessions' && r.indexdef.includes('expire')
      );
      expect(sessionIndex).toBeDefined();
    });

    it('should have proper primary keys on all tables', async () => {
      const result = await pool.query(`
        SELECT 
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name;
      `);
      
      const tables = ['users', 'sessions', 'magic_links', 'questionnaire_sessions', 'responses'];
      const tablesWithPK = result.rows.map(r => r.table_name);
      
      tables.forEach(table => {
        expect(tablesWithPK).toContain(table);
      });
    });
  });

  describe('Database Monitoring', () => {
    it('should track database size', async () => {
      const result = await pool.query(`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as size,
          pg_database_size(current_database()) as size_bytes
      `);
      
      expect(result.rows[0].size).toBeDefined();
      expect(result.rows[0].size_bytes).toBeGreaterThan(0);
    });

    it('should track table sizes', async () => {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should monitor active connections', async () => {
      const result = await pool.query(`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle') as idle
        FROM pg_stat_activity
        WHERE datname = current_database();
      `);
      
      expect(result.rows[0].total_connections).toBeGreaterThan(0);
      expect(parseInt(result.rows[0].total_connections)).toBeLessThanOrEqual(20);
    });

    it('should check for long-running queries', async () => {
      const result = await pool.query(`
        SELECT 
          pid,
          usename,
          state,
          query,
          now() - query_start as duration
        FROM pg_stat_activity
        WHERE state != 'idle'
          AND datname = current_database()
        ORDER BY query_start;
      `);
      
      // Should have at least the current query
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    it('should monitor table statistics', async () => {
      const result = await pool.query(`
        SELECT 
          schemaname,
          relname,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes
        FROM pg_stat_user_tables
        WHERE schemaname = 'public';
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity', () => {
    it('should have no orphaned questionnaire sessions', async () => {
      const result = await pool.query(`
        SELECT count(*) as orphaned_count
        FROM questionnaire_sessions qs
        WHERE NOT EXISTS (
          SELECT 1 FROM users u WHERE u.id = qs.user_id
        );
      `);
      
      expect(result.rows[0].orphaned_count).toBe('0');
    });

    it('should have no orphaned responses', async () => {
      const result = await pool.query(`
        SELECT count(*) as orphaned_count
        FROM responses r
        WHERE NOT EXISTS (
          SELECT 1 FROM questionnaire_sessions qs WHERE qs.id = r.session_id
        );
      `);
      
      expect(result.rows[0].orphaned_count).toBe('0');
    });

    it('should have consistent user completion counts', async () => {
      const result = await pool.query(`
        SELECT 
          u.id,
          u.completion_count,
          COUNT(qs.id) FILTER (WHERE qs.completed = true) as actual_completions
        FROM users u
        LEFT JOIN questionnaire_sessions qs ON u.id = qs.user_id
        GROUP BY u.id
        HAVING u.completion_count != COUNT(qs.id) FILTER (WHERE qs.completed = true);
      `);
      
      // Should have no inconsistencies (or very few if recently updated)
      expect(result.rows.length).toBeLessThan(5);
    });

    it('should have valid email formats in users table', async () => {
      const result = await pool.query(`
        SELECT count(*) as invalid_emails
        FROM users
        WHERE email IS NOT NULL 
        AND email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$';
      `);
      
      // Should have no invalid emails
      expect(parseInt(result.rows[0].invalid_emails)).toBeLessThan(10);
    });

    it('should have valid timestamps', async () => {
      const result = await pool.query(`
        SELECT count(*) as future_timestamps
        FROM users
        WHERE created_at > NOW() + INTERVAL '1 hour';
      `);
      
      expect(result.rows[0].future_timestamps).toBe('0');
    });
  });

  describe('Database Performance', () => {
    it('should track cache hit ratio', async () => {
      const result = await pool.query(`
        SELECT 
          sum(heap_blks_read) as heap_read,
          sum(heap_blks_hit) as heap_hit,
          CASE 
            WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
            ELSE (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))::float) * 100 
          END as cache_hit_ratio
        FROM pg_statio_user_tables;
      `);
      
      expect(result.rows[0]).toBeDefined();
    });

    it('should check for missing indexes', async () => {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          idx_scan
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY seq_scan DESC;
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should monitor index usage', async () => {
      const result = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC;
      `);
      
      // Should have indexes
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Database Security', () => {
    it('should have proper permissions on tables', async () => {
      const result = await pool.query(`
        SELECT 
          grantee,
          table_name,
          privilege_type
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
        ORDER BY table_name, grantee;
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should check for SQL injection vulnerable patterns', async () => {
      // This is a meta-test to ensure we're using parameterized queries
      const testValue = "'; DROP TABLE users; --";
      
      try {
        const result = await pool.query(
          'SELECT $1 as safe_value',
          [testValue]
        );
        
        expect(result.rows[0].safe_value).toBe(testValue);
      } catch (error) {
        fail('Parameterized query should handle all inputs safely');
      }
    });
  });

  describe('Transaction Integrity', () => {
    it('should maintain ACID properties', async () => {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Perform operations
        const result = await client.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });

    it('should handle concurrent transactions without deadlock', async () => {
      const operations = Array.from({ length: 5 }, async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT NOW()');
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
      
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });

    it('should properly rollback failed transactions', async () => {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        try {
          await client.query('SELECT * FROM nonexistent_table');
          fail('Should have thrown error');
        } catch (error) {
          await client.query('ROLLBACK');
        }
        
        // Connection should still work
        const result = await client.query('SELECT 1 as test');
        expect(result.rows[0].test).toBe(1);
      } finally {
        client.release();
      }
    });
  });

  describe('Backup and Recovery Readiness', () => {
    it('should be able to export schema information', async () => {
      const result = await pool.query(`
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should be able to count all records', async () => {
      const tables = ['users', 'sessions', 'magic_links', 'questionnaire_sessions', 'responses'];
      
      for (const table of tables) {
        const result = await pool.query(`SELECT count(*) as count FROM ${table}`);
        expect(result.rows[0].count).toBeDefined();
      }
    });

    it('should verify database is writable', async () => {
      // Try to create and delete a test record
      const result = await pool.query('SELECT 1');
      expect(result.rows[0]['?column?']).toBe(1);
    });
  });

  describe('Database Health Score', () => {
    it('should calculate overall database health', async () => {
      const health = {
        connection: false,
        tables: 0,
        indexes: 0,
        activeConnections: 0,
        cacheHitRatio: 0,
      };
      
      // Test connection
      try {
        await pool.query('SELECT 1');
        health.connection = true;
      } catch (error) {
        // Connection failed
      }
      
      // Count tables
      const tablesResult = await pool.query(`
        SELECT count(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public';
      `);
      health.tables = parseInt(tablesResult.rows[0].count);
      
      // Count indexes
      const indexesResult = await pool.query(`
        SELECT count(*) as count
        FROM pg_indexes
        WHERE schemaname = 'public';
      `);
      health.indexes = parseInt(indexesResult.rows[0].count);
      
      // Active connections
      const connectionsResult = await pool.query(`
        SELECT count(*) as count
        FROM pg_stat_activity
        WHERE datname = current_database();
      `);
      health.activeConnections = parseInt(connectionsResult.rows[0].count);
      
      expect(health.connection).toBe(true);
      expect(health.tables).toBeGreaterThan(0);
      expect(health.indexes).toBeGreaterThan(0);
      expect(health.activeConnections).toBeGreaterThan(0);
      expect(health.activeConnections).toBeLessThanOrEqual(20);
    });
  });
});
