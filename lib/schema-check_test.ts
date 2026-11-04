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

/**
 * A comparison that stays pending until the test releases it. Every hung check
 * must be released before its test ends: schemaState deliberately refuses to
 * start a new comparison while an earlier one is unsettled, so a check left
 * hanging would turn every later test's answer into 'unknown'.
 */
function hungCheck() {
  let calls = 0;
  let release = () => {};
  const check = () => {
    calls++;
    return new Promise<SchemaDrift>((resolve) => {
      release = () => resolve(clean);
    });
  };
  return { check, calls: () => calls, release: () => release() };
}

Deno.test('a hung comparison answers unknown at the timeout instead of hanging health', async () => {
  const hung = hungCheck();
  try {
    const started = Date.now();
    assertEquals(await schemaState(fresh(), { check: hung.check, timeoutMs: 20 }), 'unknown');
    // Bounded by the timeout, not by the check; generous margin for a slow runner.
    assertEquals(Date.now() - started < 2_000, true);
  } finally {
    hung.release();
  }
});

Deno.test('the timeout answer is cached, so a stuck database is not asked again on every poll', async () => {
  const hung = hungCheck();
  try {
    const t0 = fresh();
    assertEquals(await schemaState(t0, { check: hung.check, timeoutMs: 20 }), 'unknown');
    assertEquals(await schemaState(t0 + 30_000, { check: hung.check, timeoutMs: 20 }), 'unknown');
    assertEquals(hung.calls(), 1);
  } finally {
    hung.release();
  }
});

Deno.test('a hung comparison is never joined by another, so it holds one pool connection at most', async () => {
  // The pool has 10 connections (lib/db.ts). If each cache expiry started a
  // fresh comparison while earlier ones still hung, ten minutes of a stuck
  // catalog read would take the whole pool, and the app's own queries with it.
  const hung = hungCheck();
  const t0 = fresh();
  try {
    for (let minute = 0; minute < 12; minute++) {
      assertEquals(await schemaState(t0 + minute * 61_000, { check: hung.check, timeoutMs: 20 }), 'unknown');
    }
    assertEquals(hung.calls(), 1);
  } finally {
    hung.release();
  }
  // Once it settles, the next expiry may ask again, and gets a real answer.
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(await schemaState(t0 + 13 * 61_000, { check: () => Promise.resolve(drifted) }), 'drift');
});
