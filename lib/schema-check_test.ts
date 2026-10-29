import { assertEquals } from '$std/assert/mod.ts';
import { schemaState } from './schema-check.ts';
import type { SchemaDrift } from './schema-expectations.ts';

/*
 * Pure: the comparison is injected, so no database is needed. schemaState
 * caches for 60 s by the `now` it is given, so each case passes a `now` far
 * from the others to start from an empty cache.
 */

const clean: SchemaDrift = { missingTables: [], missingColumns: [] };
const drifted: SchemaDrift = {
  missingTables: [{ table: 'pdf_delivery_jobs', file: '015_pdf_delivery_queue.sql' }],
  missingColumns: [],
};
let epoch = 0;
const fresh = () => (epoch += 10 * 60_000);

Deno.test('a clean comparison is ok, a drifted one is drift', async () => {
  assertEquals(await schemaState(fresh(), { check: () => Promise.resolve(clean) }), 'ok');
  assertEquals(await schemaState(fresh(), { check: () => Promise.resolve(drifted) }), 'drift');
});

Deno.test('a failed comparison is unknown', async () => {
  assertEquals(await schemaState(fresh(), { check: () => Promise.reject(new Error('down')) }), 'unknown');
});

Deno.test('a hung comparison answers unknown at the timeout instead of hanging health', async () => {
  const started = Date.now();
  const never = () => new Promise<SchemaDrift>(() => {});
  assertEquals(await schemaState(fresh(), { check: never, timeoutMs: 20 }), 'unknown');
  // Bounded by the timeout, not by the check; generous margin for a slow runner.
  assertEquals(Date.now() - started < 2_000, true);
});

Deno.test('the timeout answer is cached, so a stuck database is not asked again on every poll', async () => {
  const t0 = fresh();
  let calls = 0;
  const never = () => {
    calls++;
    return new Promise<SchemaDrift>(() => {});
  };
  assertEquals(await schemaState(t0, { check: never, timeoutMs: 20 }), 'unknown');
  assertEquals(await schemaState(t0 + 30_000, { check: never, timeoutMs: 20 }), 'unknown');
  assertEquals(calls, 1);
});
