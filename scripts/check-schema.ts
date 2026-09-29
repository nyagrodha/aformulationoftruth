#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Schema drift check: does the database have what db/migrations/ promises?
 *
 *   deno run -A scripts/check-schema.ts
 *
 * Prints one line per missing table or column, with the migration file that
 * introduced it, e.g.
 *
 *   missing table pdf_delivery_jobs (015_pdf_delivery_queue.sql)
 *
 * Separately, for every expected table that DOES exist, it checks whether the
 * app role can SELECT from it, and says so in different words:
 *
 *   table fresh_otp exists but a4m_app has no SELECT
 *   schema public exists but a4m_app has no USAGE on it
 *
 * The two are kept apart because their fixes differ: a missing table means
 * apply the migration, a missing grant means GRANT. The grant lines are
 * advisory -- a legacy table the app never reads needs no grant -- so they
 * never change the exit status. --app-role NAME checks a role other than
 * a4m_app.
 *
 * Exit status is the contract, so a deploy script can gate on it:
 *   0  the database has every table and column the migrations describe
 *   1  drift: something is missing; apply the named files as the admin role
 *   2  the check could not run (no DATABASE_URL, no connection, or a migration
 *      the parser cannot read -- see lib/schema-expectations.ts)
 *
 * Existence is read from pg_catalog, so any role gets the same answer; see
 * lib/schema-check.ts for why information_schema would not. Why this exists
 * and why the _migrations ledger cannot answer the same question: see
 * lib/schema-expectations.ts. Objects the database has beyond the migrations
 * are not drift and are not listed.
 */

import { closePool, isDatabaseConfigured } from '../lib/db.ts';
import { grantGaps, loadExpectedSchema, readActualSchema } from '../lib/schema-check.ts';
import { type ActualSchema, diff, type ExpectedSchema, MigrationParseError } from '../lib/schema-expectations.ts';

// Load env files so DATABASE_URL is present from a deploy script, as the other
// operator scripts do -- but, as in prune-qr-salts.ts, the inherited
// environment WINS: a DATABASE_URL given on the command line is the one the
// operator meant, and a stray readable .env must not quietly replace it.

const roleFlag = Deno.args.indexOf('--app-role');
const appRole = roleFlag >= 0 && Deno.args[roleFlag + 1] ? Deno.args[roleFlag + 1] : 'a4m_app';
const inherited = new Set(Object.keys(Deno.env.toObject()));
for (const envFile of ['.env.fresh', '.env']) {
  try {
    for (const line of (await Deno.readTextFile(envFile)).split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const i = t.indexOf('=');
        if (i > 0) {
          const key = t.slice(0, i).trim();
          if (!inherited.has(key)) Deno.env.set(key, t.slice(i + 1).trim());
        }
      }
    }
  } catch { /* file optional */ }
}

async function main(): Promise<number> {
  let expected: ExpectedSchema;
  try {
    expected = await loadExpectedSchema();
  } catch (error) {
    // A parse error's message is ours: a file name and a slice of committed
    // SQL. Anything else (a filesystem error) is reported by category only.
    if (error instanceof MigrationParseError) console.error(`[check-schema] Cannot parse ${error.message}`);
    else console.error('[check-schema] Cannot read db/migrations/');
    return 2;
  }

  if (!isDatabaseConfigured()) {
    console.error('[check-schema] DATABASE_URL not set');
    return 2;
  }

  let actual: ActualSchema;
  try {
    actual = await readActualSchema();
  } catch {
    // Never print the error: a connection failure can carry the connection
    // string, password included. Category only, as migrate.ts and
    // routes/api/health.ts do.
    console.error('[check-schema] Cannot connect to the database or read its schema');
    return 2;
  }

  const drift = diff(expected, actual);
  for (const { table, file } of drift.missingTables) console.log(`missing table ${table} (${file})`);
  for (const { table, column, file } of drift.missingColumns) {
    console.log(`missing column ${table}.${column} (${file})`);
  }

  // Only tables that exist: a missing one is already reported above, and "no
  // grant on a table that is not there" would be the same line twice.
  const present = [...expected.tables].filter((t) => actual.tables.has(t));
  try {
    const gaps = await grantGaps(appRole, present);
    if (gaps === null) console.log(`[check-schema] role ${appRole} does not exist here; grant check skipped`);
    else {
      if (!gaps.schemaUsage) console.log(`schema public exists but ${appRole} has no USAGE on it`);
      for (const table of gaps.noSelect) console.log(`table ${table} exists but ${appRole} has no SELECT`);
    }
  } catch {
    // Advisory: a failure here must not turn a clean schema into exit 2.
    console.error('[check-schema] Grant check failed; schema result stands');
  }

  if (drift.missingTables.length || drift.missingColumns.length) {
    const files = new Set([...drift.missingTables, ...drift.missingColumns].map((m) => m.file));
    console.error(`[check-schema] Drift: apply ${[...files].sort().join(', ')} as the admin role`);
    return 1;
  }

  const columnCount = [...expected.columns.values()].reduce((n, cols) => n + cols.size, 0);
  console.log(`[check-schema] ok: ${expected.tables.size} tables and ${columnCount} added columns present`);
  return 0;
}

let status = 2;
try {
  status = await main();
} finally {
  await closePool().catch(() => {});
}
Deno.exit(status);
