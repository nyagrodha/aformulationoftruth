import { getPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

let migrationsRan = false;

export async function setupDatabase(): Promise<void> {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
  await resetDatabase();
}

export async function resetDatabase(): Promise<void> {
  const pool = getPool();
  const tables = ['password_resets', 'questionnaire_responses', '"session"', 'users'];
  for (const table of tables) {
    await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
  }
}

export async function teardownDatabase(): Promise<void> {
  await closePool();
}
