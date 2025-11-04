import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { closePool } from './db/pool.js';

const port = env.PORT ?? 5742;

const server = app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});

async function shutdown(): Promise<void> {
  logger.info('Shutting down server');
  server.close();
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
