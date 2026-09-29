import { assert, assertEquals, assertThrows } from '$std/assert/mod.ts';
import {
  type ActualSchema,
  diff,
  expectedSchema,
  hasDrift,
  type MigrationFile,
  MigrationParseError,
  readMigrationFiles,
} from './schema-expectations.ts';

/*
 * Pure: no database. The real db/migrations/ directory is read from disk, so
 * a migration someone adds in a style the parser cannot read fails here, in
 * CI, rather than shrinking the expectation on the server.
 */

const real = await readMigrationFiles();

/** An actual schema holding exactly what the migrations describe. */
function perfectActual(files: MigrationFile[]): ActualSchema {
  const e = expectedSchema(files);
  const columns = new Map<string, Set<string>>();
  for (const t of e.tables) columns.set(t, new Set(e.columns.get(t) ?? []));
  return { tables: new Set(e.tables), columns };
}

Deno.test('the real migrations parse, and include the queue and the mesh tables', () => {
  const e = expectedSchema(real);
  assert(e.tables.has('pdf_delivery_jobs'));
  assertEquals(e.tableSources.get('pdf_delivery_jobs'), '015_pdf_delivery_queue.sql');
  assert(e.tables.has('mesh_questions_sent'));
  assert(e.tables.has('mesh_answers'));
});

Deno.test('the real migrations: alter-only files 004 and 017 still leave expectations', () => {
  // A table-only check could never see either file skipped.
  const e = expectedSchema(real);
  assertEquals(e.columnSources.get('fresh_gate_responses')?.get('encrypted_email'), '004_pdf_delivery_pipeline.sql');
  assertEquals(
    e.columnSources.get('fresh_audience_windows')?.get('unclassified_visitors'),
    '017_audience_buckets.sql',
  );
  assertEquals(
    e.columnSources.get('fresh_audience_windows')?.get('optout_navigations'),
    '017_audience_buckets.sql',
  );
});

Deno.test('the real migrations: legacy tables dropped by 001/002 are not expected', () => {
  const e = expectedSchema(real);
  for (const legacy of ['users', 'session', 'responses', 'magic_links', 'magic_link_tokens']) {
    assert(!e.tables.has(legacy), legacy);
  }
});

Deno.test("the real migrations: 004's conditional DO block is not an expectation", () => {
  // gate_responses exists only on a legacy database; the DO block guards on it.
  const e = expectedSchema(real);
  assert(!e.tables.has('gate_responses'));
  assert(!e.columns.has('gate_responses'));
});

Deno.test('regression: everything except pdf_delivery_jobs is exactly one missing table', () => {
  // The September 2026 incident: 015 skipped, 016-018 applied.
  const actual = perfectActual(real);
  actual.tables.delete('pdf_delivery_jobs');
  actual.columns.delete('pdf_delivery_jobs');
  assertEquals(diff(expectedSchema(real), actual), {
    missingTables: [{ table: 'pdf_delivery_jobs', file: '015_pdf_delivery_queue.sql' }],
    missingColumns: [],
  });
});

Deno.test('a database with exactly the migrated schema has no drift; extra objects are not drift', () => {
  const actual = perfectActual(real);
  actual.tables.add('_migrations');
  actual.tables.add('some_legacy_table');
  actual.columns.get('pdf_delivery_jobs')!.add('an_extra_column');
  assertEquals(hasDrift(diff(expectedSchema(real), actual)), false);
});

Deno.test('a skipped 017 is reported as its two columns, by file', () => {
  const actual = perfectActual(real);
  actual.columns.get('fresh_audience_windows')!.delete('unclassified_visitors');
  actual.columns.get('fresh_audience_windows')!.delete('optout_navigations');
  assertEquals(diff(expectedSchema(real), actual), {
    missingTables: [],
    missingColumns: [
      { table: 'fresh_audience_windows', column: 'optout_navigations', file: '017_audience_buckets.sql' },
      { table: 'fresh_audience_windows', column: 'unclassified_visitors', file: '017_audience_buckets.sql' },
    ],
  });
});

Deno.test('create, then drop, then re-create resolves in filename order', () => {
  const files = [
    // Deliberately out of order: expectedSchema must sort.
    { name: '003_again.sql', sql: 'CREATE TABLE t (id INT);' },
    { name: '001_make.sql', sql: 'CREATE TABLE t (id INT); ALTER TABLE t ADD COLUMN old_col INT;' },
    { name: '002_drop.sql', sql: 'DROP TABLE IF EXISTS t CASCADE;' },
  ];
  const e = expectedSchema(files);
  assert(e.tables.has('t'));
  assertEquals(e.tableSources.get('t'), '003_again.sql');
  // The column went with the dropped table and nothing re-added it.
  assert(!e.columns.get('t')?.has('old_col'));

  const dropped = expectedSchema(files.slice(1));
  assert(!dropped.tables.has('t'));
});

Deno.test('DROP TABLE with several names drops each', () => {
  const e = expectedSchema([
    { name: '001.sql', sql: 'CREATE TABLE a (x INT); CREATE TABLE b (x INT); CREATE TABLE c (x INT);' },
    { name: '002.sql', sql: 'DROP TABLE IF EXISTS a, public.b RESTRICT;' },
  ]);
  assertEquals([...e.tables], ['c']);
});

Deno.test('ADD COLUMN is recorded against the right table, several per ALTER', () => {
  const e = expectedSchema([
    { name: '001.sql', sql: 'CREATE TABLE a (id INT); CREATE TABLE b (id INT);' },
    {
      name: '002.sql',
      sql: `ALTER TABLE a ADD COLUMN IF NOT EXISTS one TEXT DEFAULT 'x, y', ADD two NUMERIC(10, 2),
              ADD CONSTRAINT a_pos CHECK (two > 0), ALTER COLUMN one SET NOT NULL;
            ALTER TABLE ONLY b ADD COLUMN three INT; ALTER TABLE b DROP COLUMN IF EXISTS id;`,
    },
  ]);
  assertEquals([...e.columns.get('a')!].sort(), ['one', 'two']);
  assertEquals([...e.columns.get('b')!], ['three']);
  assertEquals(e.columnSources.get('a')?.get('one'), '002.sql');
});

Deno.test('ALTER TABLE IF EXISTS on a table no migration creates expects nothing', () => {
  const e = expectedSchema([{ name: '001.sql', sql: 'ALTER TABLE IF EXISTS legacy ADD COLUMN c INT;' }]);
  assertEquals(e.columns.size, 0);
});

Deno.test('comments, strings and quoted identifiers are handled', () => {
  const e = expectedSchema([{
    name: '001.sql',
    sql: `-- CREATE TABLE commented_out (id INT);
          /* CREATE TABLE also_out (id INT); /* nested */ still a comment; DROP TABLE x; */
          CREATE TABLE IF NOT EXISTS public."MixedCase" (id INT); CREATE TABLE "session" (id INT);
          CREATE TABLE Folded (note TEXT DEFAULT 'it''s; CREATE TABLE in_a_string (x INT)');
          INSERT INTO folded VALUES (E'\\'; CREATE TABLE in_an_escape_string (x INT)');
          ALTER TABLE "MixedCase" ADD COLUMN "Quoted Col" INT, ADD COLUMN Plain_Col INT;`,
  }]);
  assertEquals([...e.tables].sort(), ['MixedCase', 'folded', 'session']);
  assertEquals([...e.columns.get('MixedCase')!].sort(), ['Quoted Col', 'plain_col']);
});

Deno.test('statements inside function bodies are not expectations', () => {
  const e = expectedSchema([{
    name: '001.sql',
    sql: `CREATE TABLE t (id INT);
          CREATE OR REPLACE FUNCTION f() RETURNS TRIGGER AS $body$
          BEGIN ALTER TABLE t ADD COLUMN sneaky INT; RETURN NEW; END; $body$ LANGUAGE plpgsql;
          CREATE INDEX IF NOT EXISTS idx ON t (id); GRANT SELECT ON TABLE t TO a4m_app;
          COMMENT ON TABLE t IS 'x';`,
  }]);
  assertEquals([...e.tables], ['t']);
  assertEquals(e.columns.size, 0);
});

function assertParseError(sql: string, name = '099_broken.sql'): MigrationParseError {
  const error = assertThrows(() =>
    expectedSchema([{ name: '001_ok.sql', sql: 'CREATE TABLE ok (id INT);' }, {
      name,
      sql,
    }])
  );
  assert(error instanceof MigrationParseError, String(error));
  assertEquals(error.file, name);
  assert(error.message.startsWith(`${name}: `), error.message);
  return error;
}

Deno.test('a malformed CREATE TABLE throws and names its file', () => {
  assertParseError('CREATE TABLE (id INT);');
  assertParseError('CREATE TABLE IF NOT EXISTS broken name (id INT);');
});

Deno.test('constructs the parser does not understand throw rather than guess', () => {
  assertParseError('CREATE TABLE copy AS SELECT * FROM ok;');
  assertParseError('CREATE TABLE part PARTITION OF ok FOR VALUES IN (1);');
  assertParseError('CREATE TEMP TABLE scratch (id INT);');
  assertParseError('CREATE FOREIGN TABLE remote (id INT) SERVER s;');
  assertParseError('ALTER TABLE ok RENAME TO renamed;');
  assertParseError('ALTER TABLE ok RENAME COLUMN id TO ident;');
  assertParseError('ALTER TABLE ok SET SCHEMA archive;');
  assertParseError('CREATE TABLE archive.elsewhere (id INT);');
  assertParseError('ALTER TABLE ok FROBNICATE;');
  assertParseError('ALTER TABLE ok;');
  assertParseError('DROP TABLE ok, ;');
  assertParseError('DO $$ BEGIN CREATE TABLE hidden (id INT); END $$;');
  assertParseError("CREATE TABLE s (note TEXT DEFAULT 'never closed);");
  assertParseError('/* never closed CREATE TABLE s (id INT);');
});

Deno.test('ignored statements never throw', () => {
  const e = expectedSchema([{
    name: '001.sql',
    sql: `CREATE VIEW v AS SELECT 1; CREATE UNIQUE INDEX u ON x (y); DROP INDEX IF EXISTS u;
          DROP TRIGGER IF EXISTS tr ON x; TRUNCATE TABLE x; LOCK TABLE x; SELECT $1::int;
          DO $$ BEGIN IF to_regclass('public.x') IS NOT NULL THEN ALTER TABLE x ADD COLUMN y INT; END IF; END $$;`,
  }]);
  assertEquals(e.tables.size, 0);
  assertEquals(e.columns.size, 0);
});

/*
 * Migration numbering guard.
 *
 * 001, 002 and 003 each carry two files: two lineages of the schema were merged
 * before anyone numbered them centrally. They are NOT renamed, because any
 * _migrations ledger that recorded them records them by filename, and a rename
 * would make migrate.ts re-apply them. Anything else sharing a prefix is new,
 * and two files with one number leave "was 015 applied?" with no single answer.
 */
const GRANDFATHERED_DUPLICATE_PREFIXES: Record<string, string[]> = {
  '001': ['001_deno_fresh_schema.sql', '001_initial_schema.sql'],
  '002': ['002_magic_links.sql', '002_opaque_resume_tokens.sql'],
  '003': ['003_newsletter_subscribers.sql', '003_wearables_encounters.sql'],
};

Deno.test('every migration has a three-digit prefix, and no new prefix is shared', () => {
  const byPrefix = new Map<string, string[]>();
  for (const { name } of real) {
    const prefix = name.match(/^(\d{3})_/)?.[1];
    assert(prefix, `${name} has no NNN_ prefix`);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name].sort());
  }
  for (const [prefix, names] of byPrefix) {
    if (names.length === 1) continue;
    assertEquals(
      names,
      GRANDFATHERED_DUPLICATE_PREFIXES[prefix],
      `migration prefix ${prefix} is shared by ${names.join(', ')}; take the next free number instead`,
    );
  }
});
