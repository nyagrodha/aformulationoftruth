import { readFileSync, existsSync } from 'fs';
import { Pool, type PoolConfig } from 'pg';
import { randomUUID } from 'crypto';
import { newDb, type IMemoryDb } from 'pg-mem';
import { env } from '../config/env.js';

let pool: Pool | undefined;
let memoryDb: IMemoryDb | undefined;

export function getPool(): Pool {
  if (!pool) {
    if (env.NODE_ENV === 'test') {
      memoryDb = newDb({ autoCreateForeignKeyIndices: true });
      memoryDb.public.registerFunction({
        name: 'gen_random_uuid',
        implementation: () => randomUUID()
      });
      const adapter = memoryDb.adapters.createPg();
      pool = new adapter.Pool();
      } else {
        let ca: string | undefined;

        if (env.DATABASE_CA_CERT_PATH) {
          if (!existsSync(env.DATABASE_CA_CERT_PATH)) {
            throw new Error(`DATABASE_CA_CERT_PATH ${env.DATABASE_CA_CERT_PATH} does not exist`);
          }
          ca = readFileSync(env.DATABASE_CA_CERT_PATH, 'utf-8');
        }

        const sslConfig: PoolConfig['ssl'] = {
          rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED,
          ca
        };

        pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: 10,
          ssl: sslConfig
        });
      }
  }

  if (!pool) {
    throw new Error('Database pool could not be initialized');
  }

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }

  if (memoryDb) {
    memoryDb = undefined;
  }
}
