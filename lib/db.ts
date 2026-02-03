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
let activeDbUrl: string | null = null;

interface DbConfig {
  hostname?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tls?: { enabled: boolean; enforce: boolean };
}

function parseDbUrl(databaseUrl: string): DbConfig | null {
  try {
    const url = new URL(databaseUrl);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return {
      hostname: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      tls: isLocalhost
        ? { enabled: false, enforce: false }
        : url.searchParams.get('sslmode') === 'require'
          ? { enabled: true, enforce: false }
          : undefined,
    };
  } catch {
    return null;
  }
}

async function testConnection(config: DbConfig, timeoutMs = 5000): Promise<boolean> {
  try {
    const testPool = new Pool({ ...config, connection: { attempts: 1 } }, 1);

    // Race between connection and timeout
    const connectPromise = testPool.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
    );

    const client = await Promise.race([connectPromise, timeoutPromise]);
    await client.queryObject('SELECT 1');
    client.release();
    await testPool.end();
    return true;
  } catch {
    return false;
  }
}

async function resolveConfigWithFailover(): Promise<DbConfig | null> {
  // Priority order: PRIMARY (VPN) -> LOCAL (localhost)
  const urlsToTry = [
    { name: 'PRIMARY', url: Deno.env.get('DATABASE_URL_PRIMARY') },
    { name: 'LOCAL', url: Deno.env.get('DATABASE_URL_LOCAL') },
    { name: 'DEFAULT', url: Deno.env.get('DATABASE_URL') },
  ];

  for (const { name, url } of urlsToTry) {
    if (!url) continue;

    const config = parseDbUrl(url);
    if (!config) {
      console.error(`[db] Invalid ${name} DATABASE_URL format`);
      continue;
    }

    console.log(`[db] Testing ${name} connection (${config.hostname})...`);
    if (await testConnection(config)) {
      console.log(`[db] Connected to ${name} database (${config.hostname})`);
      activeDbUrl = url;
      return config;
    }
    console.warn(`[db] ${name} connection failed, trying next...`);
  }

  // Fallback to PG* environment variables
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

function resolveConfig(): DbConfig | null {
  const databaseUrl = Deno.env.get('DATABASE_URL');

  if (databaseUrl) {
    const config = parseDbUrl(databaseUrl);
    if (!config) {
      console.error('[db] Invalid DATABASE_URL format');
      return null;
    }
    return config;
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

function createPool(config: DbConfig): Pool {
  return new Pool(config, 10); // max 10 connections
}

/**
 * Initialize pool with failover support.
 * Tries PRIMARY (VPN) first, then LOCAL, then DEFAULT.
 * Call this at app startup for proper failover behavior.
 */
export async function initPool(): Promise<Pool> {
  if (pool) return pool;

  const config = await resolveConfigWithFailover();
  if (!config) {
    throw new Error(
      'PostgreSQL connection not configured. Set DATABASE_URL_PRIMARY/DATABASE_URL_LOCAL or DATABASE_URL.'
    );
  }

  pool = createPool(config);
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    // Synchronous fallback - uses DATABASE_URL directly without failover testing
    const config = resolveConfig();
    if (!config) {
      throw new Error(
        'PostgreSQL connection not configured. Call initPool() first or set DATABASE_URL.'
      );
    }
    pool = createPool(config);
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const currentPool = pool;
    pool = null;
    activeDbUrl = null;
    await currentPool.end();
  }
}

export function isDatabaseConfigured(): boolean {
  return resolveConfig() !== null;
}

export function getActiveDbHost(): string | null {
  if (!activeDbUrl) return null;
  try {
    return new URL(activeDbUrl).hostname;
  } catch {
    return null;
  }
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
