/**
 * fresh.gen.ts Manifest Tests
 *
 * fresh.gen.ts is Fresh's generated route/island manifest. This PR adds
 * two new entries to it:
 *   - routes: './routes/questions.tsx'
 *   - islands: './islands/QuaternarySpheroid.tsx'
 *
 * These tests verify the manifest wires those modules up correctly and
 * that pre-existing entries were not dropped or duplicated in the process.
 */

import { assertEquals, assertExists, assertMatch } from '$std/assert/mod.ts';
import manifest from '../fresh.gen.ts';

Deno.test({
  name: 'fresh.gen manifest: registers the questions route added by this PR',
  fn() {
    const route = (manifest.routes as any)['./routes/questions.tsx'];

    assertExists(route);
    assertExists(route.handler);
    assertEquals(typeof route.handler.GET, 'function');
  },
});

Deno.test({
  name: 'fresh.gen manifest: registers the QuaternarySpheroid island added by this PR',
  fn() {
    const island = (manifest.islands as any)['./islands/QuaternarySpheroid.tsx'];

    assertExists(island);
    assertEquals(typeof island.default, 'function');
  },
});

Deno.test({
  name: 'fresh.gen manifest: islands map contains exactly the two expected entries',
  fn() {
    const islandKeys = Object.keys(manifest.islands).sort();

    assertEquals(islandKeys, [
      './islands/GateQuestionnaire.tsx',
      './islands/QuaternarySpheroid.tsx',
    ]);
  },
});

Deno.test({
  name: 'fresh.gen manifest: pre-existing index route still resolves with its handler and default export',
  fn() {
    const route = (manifest.routes as any)['./routes/index.tsx'];

    assertExists(route);
    assertEquals(typeof route.handler.GET, 'function');
    assertEquals(typeof route.default, 'function');
  },
});

Deno.test({
  name: 'fresh.gen manifest: exposes a baseUrl pointing at this manifest file',
  fn() {
    assertEquals(typeof manifest.baseUrl, 'string');
    assertMatch(manifest.baseUrl, /fresh\.gen\.ts$/);
  },
});

Deno.test({
  name: 'fresh.gen manifest: every registered route key is unique and rooted at ./routes/',
  fn() {
    const keys = Object.keys(manifest.routes);
    const uniqueKeys = new Set(keys);

    assertEquals(keys.length, uniqueKeys.size);
    for (const key of keys) {
      assertMatch(key, /^\.\/routes\//);
    }
  },
});

Deno.test({
  name: 'fresh.gen manifest: every registered island key is unique and rooted at ./islands/',
  fn() {
    const keys = Object.keys(manifest.islands);
    const uniqueKeys = new Set(keys);

    assertEquals(keys.length, uniqueKeys.size);
    for (const key of keys) {
      assertMatch(key, /^\.\/islands\//);
    }
  },
});