import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from '../shared/schema';

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

// SSL defaults to enabled with certificate verification.
// Set DATABASE_SSL=false to disable (dev only),
// or DATABASE_SSL_REJECT_UNAUTHORIZED=false to skip cert verification.
function buildSslConfig(): boolean | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === 'false') return false;
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  return { rejectUnauthorized };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
});

export const db = drizzle(pool, { schema });
