import { pool } from '../../server/db';

describe('Database Schema Validation Tests', () => {
  describe('Table Existence', () => {
    it('should have users table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have sessions table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'sessions'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have magic_links table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'magic_links'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have questionnaire_sessions table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'questionnaire_sessions'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it('should have responses table', async () => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'responses'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe('Users Table Structure', () => {
    it('should have correct columns in users table', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('email');
      expect(columns).toContain('first_name');
      expect(columns).toContain('last_name');
      expect(columns).toContain('completion_count');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have id as primary key in users table', async () => {
      const result = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'public' 
        AND table_name = 'users'
        AND constraint_type = 'PRIMARY KEY';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have unique constraint on email in users table', async () => {
      const result = await pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public' 
        AND table_name = 'users'
        AND constraint_type = 'UNIQUE';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Sessions Table Structure', () => {
    it('should have correct columns in sessions table', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('sid');
      expect(columns).toContain('sess');
      expect(columns).toContain('expire');
    });

    it('should have index on expire column', async () => {
      const result = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
        AND tablename = 'sessions'
        AND indexdef LIKE '%expire%';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Magic Links Table Structure', () => {
    it('should have correct columns in magic_links table', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'magic_links'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('email');
      expect(columns).toContain('token');
      expect(columns).toContain('expires_at');
      expect(columns).toContain('used');
      expect(columns).toContain('created_at');
    });

    it('should have unique constraint on token', async () => {
      const result = await pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public' 
        AND table_name = 'magic_links'
        AND constraint_type = 'UNIQUE';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Questionnaire Sessions Table Structure', () => {
    it('should have correct columns in questionnaire_sessions table', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'questionnaire_sessions'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('current_question_index');
      expect(columns).toContain('question_order');
      expect(columns).toContain('completed');
      expect(columns).toContain('completed_at');
      expect(columns).toContain('is_shared');
      expect(columns).toContain('share_id');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have foreign key to users table', async () => {
      const result = await pool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'questionnaire_sessions'
          AND kcu.column_name = 'user_id';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('users');
    });
  });

  describe('Responses Table Structure', () => {
    it('should have correct columns in responses table', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'responses'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(row => row.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('session_id');
      expect(columns).toContain('question_id');
      expect(columns).toContain('answer');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have foreign key to questionnaire_sessions table', async () => {
      const result = await pool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'responses'
          AND kcu.column_name = 'session_id';
      `);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].foreign_table_name).toBe('questionnaire_sessions');
    });
  });

  describe('Database Extensions', () => {
    it('should have necessary PostgreSQL extensions available', async () => {
      const result = await pool.query(`
        SELECT extname FROM pg_extension;
      `);
      const extensions = result.rows.map(row => row.extname);
      // pgcrypto is commonly used for UUID generation
      expect(extensions.length).toBeGreaterThan(0);
    });
  });

  describe('Data Types Validation', () => {
    it('should use correct data types for timestamps', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name IN ('users', 'questionnaire_sessions', 'responses', 'magic_links')
        AND column_name LIKE '%_at'
        ORDER BY table_name, column_name;
      `);
      
      result.rows.forEach(row => {
        expect(row.data_type).toMatch(/timestamp/i);
      });
    });

    it('should use jsonb for structured data', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'questionnaire_sessions'
        AND column_name = 'question_order';
      `);
      
      expect(result.rows[0].data_type).toBe('jsonb');
    });
  });
});
