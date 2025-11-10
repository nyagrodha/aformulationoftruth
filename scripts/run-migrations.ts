import { runMigrations } from '../src/db/migrate.js';
import { closePool } from '../src/db/pool.js';
import { logger } from '../src/utils/logger.js';

runMigrations()
  .then(async () => {
    logger.info('Migrations completed');
    await closePool();
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'Migration failed');
    await closePool();
    process.exitCode = 1;
  });
