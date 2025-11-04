import { getPool, closePool } from '../src/db/pool.js';
import { hashPassword } from '../src/utils/password.js';
import { logger } from '../src/utils/logger.js';

async function run(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const username = process.env.SEED_ADMIN_USERNAME;

  if (!email || !password || !username) {
    throw new Error('SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_USERNAME must be set');
  }

  const pool = getPool();
  const passwordHash = await hashPassword(password);

  await pool.query(
    `
      INSERT INTO users (email, username, password_hash, role)
      VALUES ($1, $2, $3, 'admin')
      ON CONFLICT (email) DO UPDATE
        SET username = EXCLUDED.username,
            password_hash = EXCLUDED.password_hash,
            role = 'admin',
            updated_at = NOW()
    `,
    [email.toLowerCase(), username.toLowerCase(), passwordHash]
  );

  logger.info({ email }, 'Seeded admin user');
  await closePool();
}

run().catch((error) => {
  logger.error({ err: error }, 'Failed to seed database');
  process.exitCode = 1;
});
