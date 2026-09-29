/** Explicit opt-in; this suite cannot touch the production database. */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { closePool, withConnection } from '../lib/db.ts';
import { checkSchema, grantGaps, loadExpectedSchema, readActualSchema, schemaState } from '../lib/schema-check.ts';
import { diff, readMigrationFiles } from '../lib/schema-expectations.ts';

/*
 * Applies every migration to an empty database, as the admin role would, and
 * checks the comparison end to end against the real catalog. The
 * suite resets schema public, so it refuses any database not named like a
 * throwaway: SCHEMA_TEST_DATABASE must match a4t_schema_test_N, and
 * DATABASE_URL supplies only the host and credentials. The role steps use
 * SET ROLE, so DATABASE_URL's user must be a superuser (a local test cluster).
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
      // A recreated public schema loses the default USAGE for PUBLIC; restore
      // it so the app role sees what it sees on a stock database.
      await sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC');
      // 019 grants to the app role, which is cluster-wide and may not exist
      // here. The second role holds no grant on anything.
      await sql(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a4m_app') THEN CREATE ROLE a4m_app NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'a4t_schema_test_nogrant')
          THEN CREATE ROLE a4t_schema_test_nogrant NOLOGIN; END IF;
        END $$`);
      const files = (await readMigrationFiles()).sort((a, b) => (a.name < b.name ? -1 : 1));
      for (const file of files) await sql(file.sql);

      await t.step('every migration applied: no drift', async () => {
        assertEquals(await checkSchema(), { missingTables: [], missingColumns: [] });
      });

      // The regression this pins: information_schema showed a4m_app only the 2
      // tables 019 grants it, so /api/health (which connects as a4m_app) would
      // have reported the other 26 as missing and answered 503 for good.
      await t.step('the app role and a role with no grants see the same schema as the admin', async () => {
        const expected = await loadExpectedSchema();
        for (const role of ['a4m_app', 'a4t_schema_test_nogrant']) {
          const drift = await withConnection(async (c) => {
            await c.queryObject(`SET ROLE ${role}`);
            try {
              return diff(expected, await readActualSchema(c));
            } finally {
              await c.queryObject('RESET ROLE');
            }
          });
          assertEquals(drift, { missingTables: [], missingColumns: [] }, role);
        }
      });

      await t.step('the grant check names ungranted tables, apart from drift', async () => {
        const expected = await loadExpectedSchema();
        // Run as the app role itself, the way the deploy script's .env would.
        const asApp = (role: string) =>
          withConnection(async (c) => {
            await c.queryObject('SET ROLE a4m_app');
            try {
              return await grantGaps(role, expected.tables, c);
            } finally {
              await c.queryObject('RESET ROLE');
            }
          });
        const gaps = (await asApp('a4m_app'))!;
        assertEquals(gaps.schemaUsage, true);
        // 019 is the only migration here that grants; everything else is named.
        assertEquals(gaps.noSelect.includes('mesh_answers'), false);
        assertEquals(gaps.noSelect.includes('mesh_questions_sent'), false);
        assertEquals(gaps.noSelect.includes('pdf_delivery_jobs'), true);
        assertEquals(gaps.noSelect.length, expected.tables.size - 2);
        assertEquals(await asApp('a4t_schema_test_no_such_role'), null);

        // Without USAGE on the schema, that is reported, and the table check
        // still answers rather than failing on name resolution.
        await sql('REVOKE USAGE ON SCHEMA public FROM PUBLIC');
        try {
          const blocked = (await asApp('a4m_app'))!;
          assertEquals(blocked.schemaUsage, false);
          assertEquals(blocked.noSelect.length, expected.tables.size - 2);
        } finally {
          await sql('GRANT USAGE ON SCHEMA public TO PUBLIC');
        }
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
