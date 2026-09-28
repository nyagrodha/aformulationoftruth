/**
 * Schema Check: compares what db/migrations/ describes with what exists.
 *
 * The one part of the drift check that touches the database, and it only
 * reads information_schema. lib/schema-expectations.ts holds the parsing and
 * the diff, and explains why the _migrations ledger cannot answer this.
 *
 * Visibility caveat: information_schema lists only the tables and columns the
 * connecting role holds some privilege on. Run as a4m_app, a table the app has
 * no grant on reads as missing. That is deliberate rather than a false alarm --
 * the service would fail on it exactly as if it were absent -- but the CLI
 * output should be read with it in mind when the admin role sees no drift.
 *
 * gupta-vidya compliance: names of tables and columns are schema, not data.
 * No row is read and no error object is logged; a failure is logged by
 * category only, because a connection error can carry the connection string.
 */

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

export async function readActualSchema(): Promise<ActualSchema> {
  return await withConnection(async (client) => {
    const tables = await client.queryObject<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const columns = await client.queryObject<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const actual: ActualSchema = { tables: new Set(), columns: new Map() };
    for (const { table_name } of tables.rows) actual.tables.add(table_name);
    for (const { table_name, column_name } of columns.rows) {
      if (!actual.columns.has(table_name)) actual.columns.set(table_name, new Set());
      actual.columns.get(table_name)!.add(column_name);
    }
    return actual;
  });
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
