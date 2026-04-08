import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

function buildSslConfig(): boolean | { rejectUnauthorized: boolean } {
  if (process.env.DATABASE_SSL === 'false') return false;
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  return { rejectUnauthorized };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
});
const db = drizzle(pool);

await migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') });
console.log('Migrations applied successfully');
await pool.end();
