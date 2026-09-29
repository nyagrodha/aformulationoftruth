/**
 * Schema Check: compares what db/migrations/ describes with what exists.
 *
 * The one part of the drift check that touches the database, and it only
 * reads the catalog. lib/schema-expectations.ts holds the parsing and the
 * diff, and explains why the _migrations ledger cannot answer this.
 *
 * Existence is read from pg_catalog, NOT information_schema. The
 * information_schema views list only objects the connecting role holds some
 * privilege on, and /api/health connects as a4m_app: on a database where the
 * app is granted only the tables it uses, information_schema showed it 2 of
 * the 28 expected tables. Every legacy table the app never touches would read
 * as "missing", health would answer 503 forever, and the CLI would say "apply
 * the migration" when the truth was "no grant" -- the wrong fix for the wrong
 * problem. pg_class and pg_attribute list every table whoever connects, so
 * the admin role and the app role get the same answer.
 *
 * Grants are a separate question, answered separately by grantGaps()
 * for the CLI only. They never count as drift and never reach /api/health.
 *
 * gupta-vidya compliance: names of tables and columns are schema, not data.
 * No row is read and no error object is logged; a failure is logged by
 * category only, because a connection error can carry the connection string.
 */

import type { PoolClient } from 'postgres';
import { withConnection } from './db.ts';
import {
  type ActualSchema,
  diff,
  type ExpectedSchema,
  expectedSchema,
  hasDrift,
  readMigrationFiles,
  type SchemaDrift,
} from './schema-expectations.ts';

let expectation: Promise<ExpectedSchema> | null = null;

/**
 * Parsed once per process: the migration files cannot change under a running
 * service, and a deploy that adds one restarts it. A failed read is not kept,
 * so a transient filesystem error does not pin the answer to "unknown".
 */
export function loadExpectedSchema(): Promise<ExpectedSchema> {
  expectation ??= readMigrationFiles().then(expectedSchema).catch((error) => {
    expectation = null;
    throw error;
  });
  return expectation;
}

/**
 * Ordinary and partitioned tables in schema public, and their live columns.
 * attnum > 0 skips system columns (ctid, xmin, ...); attisdropped skips the
 * placeholders a DROP COLUMN leaves behind.
 *
 * Pass a client to read through a specific session (the integration test does,
 * to prove the answer does not depend on the role); otherwise a pooled one.
 */
export async function readActualSchema(client?: PoolClient): Promise<ActualSchema> {
  return client ? await readCatalog(client) : await withConnection(readCatalog);
}

async function readCatalog(client: PoolClient): Promise<ActualSchema> {
  const tables = await client.queryObject<{ table_name: string }>(
    `SELECT c.relname AS table_name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  );
  const columns = await client.queryObject<{ table_name: string; column_name: string }>(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND a.attnum > 0 AND NOT a.attisdropped`,
  );
  const actual: ActualSchema = { tables: new Set(), columns: new Map() };
  for (const { table_name } of tables.rows) actual.tables.add(table_name);
  for (const { table_name, column_name } of columns.rows) {
    if (!actual.columns.has(table_name)) actual.columns.set(table_name, new Set());
    actual.columns.get(table_name)!.add(column_name);
  }
  return actual;
}

/**
 * Which grants `role` lacks, or null when the role does not exist on this
 * server ("no such role" is an answer, not a failure). `noSelect` names the
 * given tables it cannot SELECT from; only tables that exist should be passed.
 *
 * Advisory, for the operator: a missing grant is fixed with GRANT, a missing
 * table by applying a migration, and printing one as the other sends whoever
 * reads it to the wrong fix. Deliberately not part of SchemaDrift, so it can
 * never turn /api/health red over a legacy table the app has no reason to read.
 *
 * Privileges are tested by OID, not by name: has_table_privilege('public.x')
 * must first resolve the name, which needs USAGE on the schema and fails
 * outright without it. Missing USAGE is reported on its own instead, because
 * it blocks every table at once and deserves its own line.
 */
export async function grantGaps(
  role: string,
  tables: Iterable<string>,
  client?: PoolClient,
): Promise<{ schemaUsage: boolean; noSelect: string[] } | null> {
  const run = async (c: PoolClient) => {
    const exists = await c.queryObject('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [role]);
    if (exists.rows.length === 0) return null;
    const usage = await c.queryObject<{ ok: boolean }>(
      `SELECT has_schema_privilege($1, n.oid, 'USAGE') AS ok
         FROM pg_catalog.pg_namespace n WHERE n.nspname = 'public'`,
      [role],
    );
    const { rows } = await c.queryObject<{ table_name: string }>(
      `SELECT c.relname AS table_name
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = ANY($1::text[])
          AND NOT has_table_privilege($2, c.oid, 'SELECT')
        ORDER BY c.relname`,
      [[...tables], role],
    );
    return { schemaUsage: usage.rows[0]?.ok === true, noSelect: rows.map((r) => r.table_name) };
  };
  return client ? await run(client) : await withConnection(run);
}

/** Uncached: the operator CLI wants the answer now, with names. */
export async function checkSchema(): Promise<SchemaDrift> {
  const expected = await loadExpectedSchema();
  return diff(expected, await readActualSchema());
}

export type SchemaState = 'ok' | 'drift' | 'unknown';

/**
 * Health polling would otherwise run two information_schema scans on every
 * hit. A minute of staleness is nothing against a failure that went unseen for
 * a week.
 */
const CACHE_MS = 60_000;
let cached: { state: SchemaState; at: number } | null = null;
let inflight: Promise<SchemaState> | null = null;

/**
 * The public, nameless answer for /api/health. Names stay in the CLI: which
 * tables are missing is a map of what is broken, and the health endpoint is
 * unauthenticated.
 */
export function schemaState(now: number = Date.now()): Promise<SchemaState> {
  if (cached && now - cached.at < CACHE_MS) return Promise.resolve(cached.state);
  inflight ??= (async () => {
    let state: SchemaState;
    try {
      state = hasDrift(await checkSchema()) ? 'drift' : 'ok';
    } catch {
      state = 'unknown';
    }
    // Once per change of state, not once per minute: the journal should show
    // when drift began, not a line per health poll.
    if (state !== cached?.state) {
      if (state === 'drift') console.error('[schema-check] Drift detected; run scripts/check-schema.ts');
      if (state === 'unknown') console.error('[schema-check] Schema comparison failed');
    }
    cached = { state, at: now };
    return state;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
