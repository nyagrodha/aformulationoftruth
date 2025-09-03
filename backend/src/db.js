// backend/src/db.js
import { Pool } from 'pg';

// Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSFILE from the environment
export const pool = new Pool();

// Optional: export a simple helper
export const db = {
  query: (text, params) => pool.query(text, params),
};
