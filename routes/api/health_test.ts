/**
 * /api/health schema reporting.
 *
 * Hermetic: the database probe and the schema checker are both stubbed
 * through the route's ForTesting seams, and DATABASE_URL is set to a
 * parseable address nothing listens on, so isDatabaseConfigured() is true
 * without any socket being opened.
 *
 *   deno test --allow-read --allow-env routes/api/health_test.ts
 */

import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import type { PoolClient } from 'postgres';
import type { SchemaState } from '../../lib/schema-check.ts';
import { expectedSchema, readMigrationFiles } from '../../lib/schema-expectations.ts';
import { dbForTesting, handler, schemaForTesting } from './health.ts';

const fakeClient = {
  queryObject: () => Promise.resolve({ rows: [{ now: new Date('2026-09-28T00:00:00Z') }] }),
} as unknown as PoolClient;

async function health(schema: SchemaState): Promise<{ status: number; text: string }> {
  // Set per call and restored, not at module top: `deno test` loads every
  // listed file into one process, and a top-level set would hand every later
  // suite a "configured" database pointing at a port nothing listens on.
  const previousUrl = Deno.env.get('DATABASE_URL');
  Deno.env.set('DATABASE_URL', 'postgres://nobody:nothing@127.0.0.1:1/unused');
  dbForTesting.withConnection = (fn) => fn(fakeClient) as never;
  schemaForTesting.current = () => Promise.resolve(schema);
  try {
    const response = await (handler.GET as CallableFunction)(new Request('http://localhost/api/health'), {});
    return { status: response.status, text: await response.text() };
  } finally {
    delete dbForTesting.withConnection;
    delete schemaForTesting.current;
    if (previousUrl === undefined) Deno.env.delete('DATABASE_URL');
    else Deno.env.set('DATABASE_URL', previousUrl);
  }
}

Deno.test('schema ok: 200 and status ok', async () => {
  const before = Deno.env.get('DATABASE_URL');
  const { status, text } = await health('ok');
  assertEquals(Deno.env.get('DATABASE_URL'), before, 'DATABASE_URL must not leak to later suites');
  assertEquals(status, 200);
  assertEquals(JSON.parse(text).status, 'ok');
  assertEquals(JSON.parse(text).schema, 'ok');
});

Deno.test('schema drift: 503 and status degraded, so an uptime monitor goes red', async () => {
  const { status, text } = await health('drift');
  assertEquals(status, 503);
  assertEquals(JSON.parse(text).status, 'degraded');
  assertEquals(JSON.parse(text).schema, 'drift');
});

Deno.test('schema drift: the public body names no table and no column', async () => {
  const { text } = await health('drift');
  const expected = expectedSchema(await readMigrationFiles());
  const names = [...expected.tables, ...[...expected.columns.values()].flatMap((cols) => [...cols])];
  for (const name of names) {
    assertEquals(text.includes(name), false, `health body discloses ${name}`);
  }
  // And the body is only the fields it is meant to have.
  assertEquals(Object.keys(JSON.parse(text)).sort(), ['databaseTime', 'schema', 'status']);
});

Deno.test('schema unknown: reported, but the database answered, so still 200', async () => {
  const { status, text } = await health('unknown');
  assertEquals(status, 200);
  assertStringIncludes(text, '"schema":"unknown"');
});
