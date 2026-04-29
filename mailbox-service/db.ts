import { Pool } from 'postgres';

const DEFAULT_MAX_CONNECTIONS = 5;

export interface MailboxInsert {
  mailboxId: Uint8Array;
  ciphertext: Uint8Array;
  expiresAt: Date;
}

export interface ClaimedMailboxItem {
  pk: number;
  ciphertext: Uint8Array;
  createdAt: Date;
}

export interface MailboxStore {
  countActiveItems(mailboxId: Uint8Array): Promise<number>;
  insertItem(input: MailboxInsert): Promise<void>;
  claimItems(mailboxId: Uint8Array): Promise<ClaimedMailboxItem[]>;
}

interface DbConfig {
  hostname?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tls?: { enabled: boolean; enforce: boolean };
}

function parseDatabaseUrl(databaseUrl: string): DbConfig {
  const url = new URL(databaseUrl);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  return {
    hostname: url.hostname,
    port: Number.parseInt(url.port || '5432', 10),
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    tls: isLocalhost
      ? { enabled: false, enforce: false }
      : url.searchParams.get('sslmode') === 'require'
      ? { enabled: true, enforce: true }
      : undefined,
  };
}

function resolveConfig(): DbConfig {
  const databaseUrl = Deno.env.get('DATABASE_URL');
  if (databaseUrl) {
    return parseDatabaseUrl(databaseUrl);
  }

  const hostname = Deno.env.get('PGHOST');
  const port = Deno.env.get('PGPORT');
  const database = Deno.env.get('PGDATABASE');
  const user = Deno.env.get('PGUSER');
  const password = Deno.env.get('PGPASSWORD');
  const sslmode = Deno.env.get('PGSSLMODE');

  if (!hostname || !database || !user) {
    throw new Error(
      'Database configuration missing. Set DATABASE_URL or PGHOST/PGDATABASE/PGUSER.',
    );
  }

  return {
    hostname,
    port: port ? Number.parseInt(port, 10) : 5432,
    database,
    user,
    password: password ?? undefined,
    tls: sslmode === 'require' ? { enabled: true, enforce: true } : undefined,
  };
}

export function hasDatabaseConfig(): boolean {
  return Boolean(
    Deno.env.get('DATABASE_URL') ||
      (
        Deno.env.get('PGHOST') &&
        Deno.env.get('PGDATABASE') &&
        Deno.env.get('PGUSER')
      ),
  );
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool(resolveConfig(), DEFAULT_MAX_CONNECTIONS, true);
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  const existingPool = pool;
  pool = null;
  await existingPool.end();
}

interface MemoryMailboxItem extends MailboxInsert {
  pk: number;
  createdAt: Date;
  fetchedAt: Date | null;
}

export class InMemoryMailboxStore implements MailboxStore {
  #items: MemoryMailboxItem[] = [];
  #nextPk = 1;

  countActiveItems(mailboxId: Uint8Array): Promise<number> {
    return Promise.resolve(
      this.#items.filter((item) =>
        equalBytes(item.mailboxId, mailboxId) && item.expiresAt > new Date()
      ).length,
    );
  }

  insertItem(input: MailboxInsert): Promise<void> {
    this.#items.push({
      ...input,
      pk: this.#nextPk++,
      createdAt: new Date(),
      fetchedAt: null,
    });
    return Promise.resolve();
  }

  claimItems(mailboxId: Uint8Array): Promise<ClaimedMailboxItem[]> {
    const claimable = this.#items
      .filter((item) =>
        equalBytes(item.mailboxId, mailboxId) &&
        item.expiresAt > new Date() &&
        item.fetchedAt === null
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    const claimedAt = new Date();
    for (const item of claimable) {
      item.fetchedAt = claimedAt;
    }

    return Promise.resolve(
      claimable.map((item) => ({
        pk: item.pk,
        ciphertext: item.ciphertext,
        createdAt: item.createdAt,
      })),
    );
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export class PostgresMailboxStore implements MailboxStore {
  async countActiveItems(mailboxId: Uint8Array): Promise<number> {
    const client = await getPool().connect();

    try {
      const result = await client.queryObject<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM mailbox_items
         WHERE mailbox_id = $1
           AND expires_at > NOW()`,
        [mailboxId],
      );

      return result.rows[0]?.count ?? 0;
    } finally {
      client.release();
    }
  }

  async insertItem(input: MailboxInsert): Promise<void> {
    const client = await getPool().connect();

    try {
      await client.queryObject(
        `INSERT INTO mailbox_items (mailbox_id, ciphertext, expires_at)
         VALUES ($1, $2, $3)`,
        [input.mailboxId, input.ciphertext, input.expiresAt],
      );
    } finally {
      client.release();
    }
  }

  async claimItems(mailboxId: Uint8Array): Promise<ClaimedMailboxItem[]> {
    const client = await getPool().connect();

    try {
      await client.queryObject('BEGIN');

      const rows = await client.queryObject<ClaimedMailboxItem>(
        `SELECT pk, ciphertext, created_at AS "createdAt"
         FROM mailbox_items
         WHERE mailbox_id = $1
           AND expires_at > NOW()
           AND fetched_at IS NULL
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED`,
        [mailboxId],
      );

      if (rows.rows.length > 0) {
        await client.queryObject(
          `UPDATE mailbox_items
           SET fetched_at = NOW()
           WHERE pk = ANY($1)`,
          [rows.rows.map((row) => row.pk)],
        );
      }

      await client.queryObject('COMMIT');
      return rows.rows;
    } catch (error) {
      await client.queryObject('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
