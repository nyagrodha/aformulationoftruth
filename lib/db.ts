/**
 * PostgreSQL Database Connection Pool
 *
 * gupta-vidya compliance:
 * - No PII logging
 * - Connection errors logged without sensitive details
 * - Pool lifecycle managed explicitly
 */

import { Pool, PoolClient } from 'postgres';

let pool: Pool | null = null;

interface DbConfig {
  hostname?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tls?: { enabled: boolean; enforce: boolean };
}

function resolveConfig(): DbConfig | null {
  const databaseUrl = Deno.env.get('DATABASE_URL');

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      return {
        hostname: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        // Disable TLS for localhost connections
        tls: isLocalhost
          ? { enabled: false }
          : url.searchParams.get('sslmode') === 'require'
            ? { enabled: true, enforce: false }
            : undefined,
      };
    } catch {
      console.error('[db] Invalid DATABASE_URL format');
      return null;
    }
  }

  const hostname = Deno.env.get('PGHOST');
  const port = Deno.env.get('PGPORT');
  const database = Deno.env.get('PGDATABASE');
  const user = Deno.env.get('PGUSER');
  const password = Deno.env.get('PGPASSWORD');
  const sslmode = Deno.env.get('PGSSLMODE');

  if (hostname || database || user) {
    return {
      hostname,
      port: port ? parseInt(port) : undefined,
      database,
      user,
      password,
      tls: sslmode === 'require' ? { enabled: true, enforce: false } : undefined,
    };
  }

  return null;
}

function createPool(): Pool {
  const config = resolveConfig();

  if (!config) {
    throw new Error(
      'PostgreSQL connection not configured. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD.'
    );
  }

  return new Pool(config, 10); // max 10 connections
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const currentPool = pool;
    pool = null;
    await currentPool.end();
  }
}

export function isDatabaseConfigured(): boolean {
  return resolveConfig() !== null;
}

/**
 * Execute a database operation with automatic connection management.
 * Connection is released back to pool after handler completes.
 */
export async function withConnection<T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

/**
 * Execute a database operation within a transaction.
 * Automatically commits on success, rolls back on error.
 */
export async function withTransaction<T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.queryObject('BEGIN');
    const result = await handler(client);
    await client.queryObject('COMMIT');
    return result;
  } catch (error) {
    await client.queryObject('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
