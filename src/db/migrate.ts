import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './pool.js';

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    let sql = await readFile(path.join(migrationsDir, file), 'utf8');
    if (process.env.NODE_ENV === 'test') {
      sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";?/gi, '');
    }
    await pool.query(sql);
  }
}
