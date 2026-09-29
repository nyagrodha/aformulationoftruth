/**
 * Shred clock edge cases and operational stability.
 *
 * Run: deno test --allow-read --allow-write romania/tests/shred_stability_test.ts
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { loadIdentity, markDelivered, shredExpired, storeIdentity, touchActivity } from '../keystore.ts';

const ID = '11111111-2222-3333-4444-555555555555';
const ID2 = '22222222-3333-4444-5555-666666666666';
const POLICY = { afterDelivery: 7, absolute: 30 };
const tmp = () => Deno.makeTempDir({ prefix: 'shred-stab-' });
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

// ── Boundary precision ───────────────────────────────────────────────

Deno.test('shredExpired - shreds exactly on the boundary (>= semantics)', async () => {
  const dir = await tmp();
  const now = new Date();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, now);
  // Exactly afterDelivery days later.
  const exactBoundary = new Date(now.getTime() + POLICY.afterDelivery * 86_400_000);
  assertEquals(await shredExpired(dir, exactBoundary, POLICY), 1, 'must shred at exact boundary');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - keeps key one millisecond before the boundary', async () => {
  const dir = await tmp();
  const now = new Date();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, now);
  const justBefore = new Date(now.getTime() + POLICY.afterDelivery * 86_400_000 - 1);
  assertEquals(await shredExpired(dir, justBefore, POLICY), 0, 'must keep just before boundary');
  await Deno.remove(dir, { recursive: true });
});

// ── Far-future activity ──────────────────────────────────────────────

Deno.test('shredExpired - a far-future activity stamp still expires after policy.absolute days', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  const farFuture = new Date('2099-01-01T00:00:00Z');
  await touchActivity(dir, ID, farFuture);
  // 30 days after 2099-01-01.
  const deadline = new Date(farFuture.getTime() + POLICY.absolute * 86_400_000);
  assertEquals(await shredExpired(dir, deadline, POLICY), 1, 'far-future activity must still expire');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - far-future activity keeps key before its own deadline', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  const farFuture = new Date('2099-01-01T00:00:00Z');
  await touchActivity(dir, ID, farFuture);
  // Well past "today" but before 2099 + 30 days.
  assertEquals(await shredExpired(dir, new Date('2099-01-15T00:00:00Z'), POLICY), 0);
  await Deno.remove(dir, { recursive: true });
});

// ── Zero-day policy ──────────────────────────────────────────────────

Deno.test('shredExpired - afterDelivery=0 means shred immediately on delivery', async () => {
  const dir = await tmp();
  const now = new Date();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, now);
  assertEquals(
    await shredExpired(dir, now, { afterDelivery: 0, absolute: 30 }),
    1,
    'zero-day policy must shred immediately',
  );
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - absolute=0 means shred any undelivered key immediately', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  assertEquals(
    await shredExpired(dir, new Date(), { afterDelivery: 7, absolute: 0 }),
    1,
  );
  await Deno.remove(dir, { recursive: true });
});

// ── Shred-then-load race ─────────────────────────────────────────────

Deno.test('loadIdentity - throws NotFound after shred (sequential race simulation)', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  assertEquals(await shredExpired(dir, days(31), POLICY), 1, 'the key must actually have been shredded');
  await assertRejects(() => loadIdentity(dir, ID), Deno.errors.NotFound);
  await Deno.remove(dir, { recursive: true });
});

// ── Empty and missing directories ────────────────────────────────────

Deno.test('shredExpired - returns 0 on an empty directory', async () => {
  const dir = await tmp();
  assertEquals(await shredExpired(dir, new Date(), POLICY), 0);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('loadIdentity - throws for a nonexistent session', async () => {
  const dir = await tmp();
  await assertRejects(
    () => loadIdentity(dir, 'deadbeef-dead-beef-dead-beefdeadbeef'),
    Deno.errors.NotFound,
  );
  await Deno.remove(dir, { recursive: true });
});

// ── Multiple keys: only expired ones die ─────────────────────────────

Deno.test('shredExpired - removes only the expired key in a mixed set', async () => {
  const dir = await tmp();
  const now = new Date();
  // ID: delivered, will expire.
  await storeIdentity(dir, ID, 'old');
  await markDelivered(dir, ID, now);
  // ID2: fresh, undelivered.
  await storeIdentity(dir, ID2, 'new');
  await touchActivity(dir, ID2, days(1));

  assertEquals(await shredExpired(dir, days(8), POLICY), 1);
  // ID should be gone, ID2 should survive.
  await assertRejects(() => loadIdentity(dir, ID), Deno.errors.NotFound);
  assertEquals(await loadIdentity(dir, ID2), 'new');
  await Deno.remove(dir, { recursive: true });
});

// ── Delivery clock vs absolute clock interaction ─────────────────────

Deno.test('shredExpired - delivery clock wins when it is shorter', async () => {
  const dir = await tmp();
  const now = new Date();
  await storeIdentity(dir, ID, 'k');
  await touchActivity(dir, ID, now);
  await markDelivered(dir, ID, now);
  // Day 8: past 7-day delivery clock, but within 30-day absolute.
  assertEquals(await shredExpired(dir, days(8), POLICY), 1, 'delivery clock must win');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - absolute clock wins when delivery has not happened', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  // No delivery marker. Day 8: well within absolute.
  assertEquals(await shredExpired(dir, days(8), POLICY), 0, 'undelivered key survives within absolute');
  assertEquals(await shredExpired(dir, days(31), POLICY), 1, 'but dies at absolute ceiling');
  await Deno.remove(dir, { recursive: true });
});

// ── File permission on all marker files ──────────────────────────────

Deno.test('markDelivered - writes marker as 0600', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await markDelivered(dir, ID, new Date());
  const info = await Deno.stat(`${dir}/${ID}.delivered`);
  assertEquals(info.mode! & 0o777, 0o600);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('touchActivity - writes marker as 0600', async () => {
  const dir = await tmp();
  await storeIdentity(dir, ID, 'k');
  await touchActivity(dir, ID, new Date());
  const info = await Deno.stat(`${dir}/${ID}.seen`);
  assertEquals(info.mode! & 0o777, 0o600);
  await Deno.remove(dir, { recursive: true });
});

// ── Non-key files are never touched ──────────────────────────────────

Deno.test('shredExpired - leaves .delivered and .seen orphans alone', async () => {
  const dir = await tmp();
  // Orphaned markers without a .key file.
  await Deno.writeTextFile(`${dir}/${ID}.delivered`, new Date().toISOString());
  await Deno.writeTextFile(`${dir}/${ID}.seen`, new Date().toISOString());
  assertEquals(await shredExpired(dir, days(999), POLICY), 0, 'orphaned markers are not keys');
  // They should still be there.
  assert((await Deno.stat(`${dir}/${ID}.delivered`)).isFile);
  assert((await Deno.stat(`${dir}/${ID}.seen`)).isFile);
  await Deno.remove(dir, { recursive: true });
});

// ── A new key under a reused id is not killed by stale markers ───────

Deno.test('storeIdentity - clears orphaned markers so a new key is not shredded on sight', async () => {
  const dir = await tmp();
  // Markers left behind from an earlier key under the same id: delivered long ago.
  const longAgo = days(-60);
  await Deno.writeTextFile(`${dir}/${ID}.delivered`, longAgo.toISOString());
  await Deno.writeTextFile(`${dir}/${ID}.seen`, longAgo.toISOString());

  await storeIdentity(dir, ID, 'fresh');
  assertEquals(await shredExpired(dir, new Date(), POLICY), 0, 'the new key must not inherit the old clocks');
  assertEquals(await loadIdentity(dir, ID), 'fresh');
  await assertRejects(() => Deno.stat(`${dir}/${ID}.delivered`), Deno.errors.NotFound);
  await Deno.remove(dir, { recursive: true });
});

// ── Orphaned temporary files from interrupted writes ─────────────────

Deno.test('shredExpired - removes temporary files an hour old, keeps fresh ones', async () => {
  const dir = await tmp();
  const now = new Date();
  const stale = `${dir}/${ID}.key.tmp-${crypto.randomUUID()}`;
  const fresh = `${dir}/${ID2}.seen.tmp-${crypto.randomUUID()}`;
  await Deno.writeTextFile(stale, 'AGE-SECRET-KEY-1ORPHAN', { mode: 0o600 });
  await Deno.writeTextFile(fresh, now.toISOString(), { mode: 0o600 });
  const hourAgo = new Date(now.getTime() - 3_600_000);
  await Deno.utime(stale, hourAgo, hourAgo);

  assertEquals(await shredExpired(dir, now, POLICY), 0, 'temporaries are not counted as identities');
  await assertRejects(() => Deno.stat(stale), Deno.errors.NotFound);
  assert((await Deno.stat(fresh)).isFile, 'a write still in progress must be left alone');
  await Deno.remove(dir, { recursive: true });
});

Deno.test('shredExpired - leaves files that only look temporary alone', async () => {
  const dir = await tmp();
  const hourAgo = new Date(Date.now() - 2 * 3_600_000);
  for (const name of ['notes.tmp-x', `${ID}.delivered.tmp-${crypto.randomUUID()}`]) {
    await Deno.writeTextFile(`${dir}/${name}`, '');
    await Deno.utime(`${dir}/${name}`, hourAgo, hourAgo);
  }
  await shredExpired(dir, new Date(), POLICY);
  assertEquals((await Array.fromAsync(Deno.readDir(dir))).length, 2);
  await Deno.remove(dir, { recursive: true });
});
