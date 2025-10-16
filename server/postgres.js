const { Pool } = require('pg');
const dotenv = require('dotenv');

// Support loading environment variables before this module is imported.
dotenv.config();

let pool;

function parsePort(port) {
  if (!port) return undefined;
  const parsed = Number(port);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

  if (PGHOST || PGPORT || PGDATABASE || PGUSER || PGPASSWORD) {
    return {
      host: PGHOST,
      port: parsePort(PGPORT),
      database: PGDATABASE,
      user: PGUSER,
      password: PGPASSWORD
    };
  }

  return null;
}

function createPool() {
  const baseConfig = resolveConnectionConfig();

  if (!baseConfig) {
    throw new Error(
      'PostgreSQL connection details not provided. Set DATABASE_URL or configure PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD.'
    );
  }

  const ssl = process.env.PGSSLMODE === 'require'
    ? { rejectUnauthorized: false }
    : undefined;

  const createdPool = new Pool({
    ...baseConfig,
    ssl
  });

  createdPool.on('error', (error) => {
    console.error('Unexpected PostgreSQL client error', error);
  });

  return createdPool;
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }

  return pool;
}

async function closePool() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;

  try {
    await currentPool.end();
  } catch (error) {
    console.error('Failed to close PostgreSQL pool cleanly', error);
  }
}

function isDatabaseConfigured() {
  return resolveConnectionConfig() !== null;
}

module.exports = {
  getPool,
  closePool,
  isDatabaseConfigured
};
