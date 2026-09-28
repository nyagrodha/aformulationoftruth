/** Explicit opt-in; this suite cannot touch the production database. */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { closePool, withConnection } from '../lib/db.ts';
import { checkSchema, schemaState } from '../lib/schema-check.ts';
import { readMigrationFiles } from '../lib/schema-expectations.ts';

/*
 * Applies every migration to an empty database, as the admin role would, and
 * checks the comparison end to end against real information_schema. The
 * suite resets schema public, so it refuses any database not named like a
 * throwaway: SCHEMA_TEST_DATABASE must match a4t_schema_test_N, and
 * DATABASE_URL supplies only the host and credentials.
 *
 *   createdb a4t_schema_test_1
 *   SCHEMA_TEST_DATABASE=a4t_schema_test_1 DATABASE_URL=postgres://... \
 *     deno test --allow-net --allow-env --allow-read tests/schema_check_test.ts
 */
const database = Deno.env.get('SCHEMA_TEST_DATABASE');
if (database) {
  if (!/^a4t_schema_test_[0-9]+$/.test(database)) throw Error('isolated test database required');
  const url = new URL(Deno.env.get('DATABASE_URL')!);
  url.pathname = '/' + database;
  Deno.env.set('DATABASE_URL', url.toString());
}

Deno.test({
  name: 'schema check against a real database: clean, then a skipped 015, then a skipped 017',
  ignore: !database,
  async fn(t) {
    const sql = (query: string) => withConnection((c) => c.queryObject(query));
    try {
      await sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
      // 019 grants to the app role, which is cluster-wide and may not exist here.
      await sql(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a4m_app') THEN CREATE ROLE a4m_app NOLOGIN; END IF;
        END $$`);
      const files = (await readMigrationFiles()).sort((a, b) => (a.name < b.name ? -1 : 1));
      for (const file of files) await sql(file.sql);

      await t.step('every migration applied: no drift', async () => {
        assertEquals(await checkSchema(), { missingTables: [], missingColumns: [] });
      });

      await t.step('the health answer is cached for a minute, then sees the change', async () => {
        const t0 = Date.now();
        assertEquals(await schemaState(t0), 'ok');
        await sql('DROP TABLE mesh_answers');
        assertEquals(await schemaState(t0 + 1_000), 'ok');
        assertEquals(await schemaState(t0 + 61_000), 'drift');
        // 019 is idempotent; re-applying it restores the table for the steps below.
        await sql(files.find((f) => f.name.startsWith('019_'))!.sql);
      });

      await t.step('pdf_delivery_jobs missing: exactly that table, attributed to 015', async () => {
        await sql('DROP TABLE pdf_delivery_jobs');
        assertEquals(await checkSchema(), {
          missingTables: [{ table: 'pdf_delivery_jobs', file: '015_pdf_delivery_queue.sql' }],
          missingColumns: [],
        });
      });

      await t.step("017's columns missing: both reported, attributed to 017", async () => {
        await sql(`ALTER TABLE fresh_audience_windows DROP COLUMN unclassified_visitors,
          DROP COLUMN optout_navigations`);
        const drift = await checkSchema();
        assertEquals(drift.missingColumns.map((m) => `${m.table}.${m.column} ${m.file}`), [
          'fresh_audience_windows.optout_navigations 017_audience_buckets.sql',
          'fresh_audience_windows.unclassified_visitors 017_audience_buckets.sql',
        ]);
      });
    } finally {
      await closePool();
    }
  },
});
