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
 * Exit status is the contract, so a deploy script can gate on it:
 *   0  the database has every table and column the migrations describe
 *   1  drift: something is missing; apply the named files as the admin role
 *   2  the check could not run (no DATABASE_URL, no connection, or a migration
 *      the parser cannot read -- see lib/schema-expectations.ts)
 *
 * Why this exists and why the _migrations ledger cannot answer the same
 * question: see lib/schema-expectations.ts. Objects the database has beyond
 * the migrations are not drift and are not listed.
 *
 * Run it as the role you want the answer for. information_schema hides tables
 * the connecting role has no privilege on, so as a4m_app an ungranted table
 * reads as missing -- which the service would hit too.
 */

import { closePool, isDatabaseConfigured } from '../lib/db.ts';
import { loadExpectedSchema, readActualSchema } from '../lib/schema-check.ts';
import { diff, type ExpectedSchema, MigrationParseError, type SchemaDrift } from '../lib/schema-expectations.ts';

// Load env files so DATABASE_URL is present from a deploy script, as the other
// operator scripts do -- but, as in prune-qr-salts.ts, the inherited
// environment WINS. The useful way to run this against production is with the
// admin role's DATABASE_URL on the command line, and a readable .env holding
// the app role's URL must not silently answer for a different role instead.
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

  let drift: SchemaDrift;
  try {
    drift = diff(expected, await readActualSchema());
  } catch {
    // Never print the error: a connection failure can carry the connection
    // string, password included. Category only, as migrate.ts and
    // routes/api/health.ts do.
    console.error('[check-schema] Cannot connect to the database or read its schema');
    return 2;
  }

  for (const { table, file } of drift.missingTables) console.log(`missing table ${table} (${file})`);
  for (const { table, column, file } of drift.missingColumns) {
    console.log(`missing column ${table}.${column} (${file})`);
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
