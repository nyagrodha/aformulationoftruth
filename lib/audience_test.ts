/**
 * Audience counter contract.
 *
 * The privacy claims in lib/audience.ts are only worth the bytes they occupy if
 * something fails when they stop being true. These are those tests:
 * unlinkability across a rotation, domain separation from the QR pipeline,
 * separator unforgeability, and — the most valuable one — a structural
 * assertion that nothing but integers can reach the database.
 *
 *   deno test --allow-env --allow-read lib/audience_test.ts
 */

import { assert, assertEquals, assertNotEquals } from '$std/assert/mod.ts';
import { hmacKey, randomBytes } from './crypto.ts';
import { visitorHash } from './qr-scans.ts';
import { audienceHash, siteFor, WINDOW_MS, windowStart } from './audience.ts';

const at = (iso: string) => new Date(iso);

// --- window boundaries ---------------------------------------------------

Deno.test('windowStart floors to a 4h UTC boundary', () => {
  assertEquals(windowStart(at('2026-08-19T00:00:00Z')).toISOString(), '2026-08-19T00:00:00.000Z');
  assertEquals(windowStart(at('2026-08-19T03:59:59Z')).toISOString(), '2026-08-19T00:00:00.000Z');
  assertEquals(windowStart(at('2026-08-19T04:00:00Z')).toISOString(), '2026-08-19T04:00:00.000Z');
  assertEquals(windowStart(at('2026-08-19T23:59:59Z')).toISOString(), '2026-08-19T20:00:00.000Z');
});

// The whole reason 4h was chosen over a random length: a window that straddled
// midnight would make "visitors today" ambiguous at the boundary.
Deno.test('no window straddles midnight UTC', () => {
  for (let h = 0; h < 24; h += 4) {
    const start = windowStart(at(`2026-08-19T${String(h).padStart(2, '0')}:00:00Z`));
    const end = new Date(start.getTime() + WINDOW_MS - 1);
    assertEquals(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }
});

Deno.test('windowStart is UTC, not host-local', () => {
  // 23:00Z falls in the 20:00Z window regardless of the machine's timezone.
  assertEquals(windowStart(at('2026-08-19T23:00:00Z')).toISOString(), '2026-08-19T20:00:00.000Z');
});

Deno.test('windowStart crosses month and year boundaries cleanly', () => {
  assertEquals(windowStart(at('2026-08-31T22:10:00Z')).toISOString(), '2026-08-31T20:00:00.000Z');
  assertEquals(windowStart(at('2027-01-01T01:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

// --- the pseudonym -------------------------------------------------------

Deno.test('the same visitor under the same key hashes identically', async () => {
  const key = await hmacKey(new Uint8Array(32).fill(1));
  assertEquals(
    await audienceHash(key, '203.0.113.7', 'Mozilla/5.0'),
    await audienceHash(key, '203.0.113.7', 'Mozilla/5.0'),
  );
});

Deno.test('a different address or user agent is a different visitor', async () => {
  const key = await hmacKey(new Uint8Array(32).fill(1));
  const base = await audienceHash(key, '203.0.113.7', 'Mozilla/5.0');
  assertNotEquals(base, await audienceHash(key, '203.0.113.8', 'Mozilla/5.0'));
  assertNotEquals(base, await audienceHash(key, '203.0.113.7', 'Firefox/1.0'));
});

// THE UNLINKABILITY PROPERTY. If this fails, rotation is decorative and every
// past window stays correlatable with the present one.
Deno.test('rotation unlinks: the same visitor under a new key is a new pseudonym', async () => {
  const keyA = await hmacKey(new Uint8Array(32).fill(1));
  const keyB = await hmacKey(new Uint8Array(32).fill(2));
  assertNotEquals(
    await audienceHash(keyA, '203.0.113.7', 'Mozilla/5.0'),
    await audienceHash(keyB, '203.0.113.7', 'Mozilla/5.0'),
  );
});

// DOMAIN SEPARATION. Same salt bytes, same visitor, two pipelines -- the
// digests must still differ, so that "do not correlate across logs" survives
// someone later deciding the two salts are duplication worth removing.
Deno.test('domain tag separates audience digests from QR digests', async () => {
  const raw = new Uint8Array(32).fill(7) as Uint8Array<ArrayBuffer>;
  const key = await hmacKey(raw);
  assertNotEquals(
    await audienceHash(key, '203.0.113.7', 'Mozilla/5.0'),
    await visitorHash(raw, '203.0.113.7', 'Mozilla/5.0'),
  );
});

// The separator must not be forgeable across ANY pair of adjacent fields.
Deno.test('newline separator cannot be forged across field boundaries', async () => {
  const key = await hmacKey(new Uint8Array(32).fill(1));
  assertNotEquals(
    await audienceHash(key, '203.0.113.7\nEvil/1.0', ''),
    await audienceHash(key, '203.0.113.7', 'Evil/1.0'),
  );
});

Deno.test('the digest is fixed-length hex and leaks no input length', async () => {
  const key = await hmacKey(new Uint8Array(32).fill(1));
  const short = await audienceHash(key, '1.1.1.1', 'a');
  const long = await audienceHash(key, '1.1.1.1', 'a'.repeat(4000));
  assertEquals(short.length, 64);
  assertEquals(long.length, 64);
  assert(/^[0-9a-f]+$/.test(short));
});

Deno.test('a real random salt produces a distinct key each time', async () => {
  const a = await hmacKey(randomBytes(32));
  const b = await hmacKey(randomBytes(32));
  assertNotEquals(
    await audienceHash(a, '203.0.113.7', 'ua'),
    await audienceHash(b, '203.0.113.7', 'ua'),
  );
});

// --- host normalisation --------------------------------------------------

Deno.test('siteFor maps known hosts and collapses everything else', () => {
  assertEquals(siteFor('aformulationoftruth.com'), 'a4t');
  assertEquals(siteFor('www.aformulationoftruth.com'), 'a4t');
  assertEquals(siteFor('gimbal.fobdongle.com'), 'gimbal');
  assertEquals(siteFor('evil.example'), 'other');
  assertEquals(siteFor(null), 'other');
});

Deno.test('siteFor strips the port and is case-insensitive', () => {
  assertEquals(siteFor('AFormulationOfTruth.com:443'), 'a4t');
});

// Host is client-supplied, so an allowlist miss must not become a new label --
// otherwise the site column's cardinality is whatever an attacker picks.
Deno.test('siteFor gives an attacker no way to mint a label', () => {
  assertEquals(siteFor('x'.repeat(10_000)), 'other');
  assertEquals(siteFor('a4t'), 'other');
});

// --- the structural guarantee -------------------------------------------

// THE MOST VALUABLE TEST IN THIS FILE. The privacy claim is not "we hash the
// address", it is "nothing derived from the address is ever persisted". That is
// a property of the INSERT's column list, so pin the column list. A future edit
// that starts writing a digest fails here rather than shipping.
Deno.test('the persisted column set contains no digest, address or user agent', async () => {
  const src = await Deno.readTextFile(new URL('./audience.ts', import.meta.url));
  const insert = src.slice(src.indexOf('INSERT INTO fresh_audience_windows'));
  const columns = insert.slice(insert.indexOf('(') + 1, insert.indexOf(')'))
    .split(',').map((c) => c.trim()).filter(Boolean);

  assertEquals(columns, [
    'window_start',
    'site',
    'run_id',
    'visitors',
    'bot_visitors',
    'requests',
    'truncated',
    'updated_at',
  ]);

  for (const banned of ['hash', 'digest', 'pseudonym', 'ip', 'address', 'user_agent', 'ua']) {
    assert(
      !columns.includes(banned),
      `fresh_audience_windows must never persist a ${banned} column`,
    );
  }
});

// The migration must agree with the code about what may be stored.
Deno.test('the migration declares no address-derived column', async () => {
  const sql = await Deno.readTextFile(
    new URL('../db/migrations/011_audience_windows.sql', import.meta.url),
  );
  const body = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');'));
  for (const banned of [/\bvisitor_hash\b/, /\bip\b\s+\w/, /\buser_agent\b/, /\binet\b/, /\bcidr\b/]) {
    assert(!banned.test(body), `migration declares a forbidden column: ${banned}`);
  }
});

// --- concurrency at the window boundary -----------------------------------

import { _openSnapshotForTest, _resetForTest, recordVisit } from './audience.ts';

// recordVisit's rotation check and assignment straddled an await: two requests
// arriving with no window open (or a stale one) both saw "stale", both minted,
// and the second assignment orphaned the first window with its visit inside.
// That is an UNDERcount, the one direction the header promises never to err in.
Deno.test('two concurrent first visits land in one window, not two', async () => {
  _resetForTest();
  const now = at('2026-08-19T04:00:00Z');
  await Promise.all([
    recordVisit('aformulationoftruth.com', '203.0.113.7', 'Mozilla/5.0', now),
    recordVisit('aformulationoftruth.com', '203.0.113.8', 'Mozilla/5.0', now),
  ]);
  const snap = _openSnapshotForTest();
  assertEquals(snap?.bySite.a4t?.requests, 2);
  assertEquals(snap?.bySite.a4t?.visitors, 2);
  _resetForTest();
});

// persist() used to replace the row outright, so two overlapping flushes of the
// same window could store the SMALLER snapshot last. Within one (window, site,
// run) every counter only grows, so the larger value is always the later one.
Deno.test('the upsert never lets a stale flush shrink a stored count', async () => {
  const src = await Deno.readTextFile(new URL('./audience.ts', import.meta.url));
  const upsert = src.slice(src.indexOf('ON CONFLICT (window_start, site, run_id)'));
  const setClause = upsert.slice(0, upsert.indexOf('updated_at'));
  for (const col of ['visitors', 'bot_visitors', 'requests']) {
    assert(
      new RegExp(`${col}\\s*=\\s*GREATEST\\(`).test(setClause),
      `${col} must be merged with GREATEST, not replaced`,
    );
  }
  assert(
    /truncated\s*=\s*fresh_audience_windows\.truncated OR/.test(setClause),
    'truncated must only ever become true',
  );
});

// A visit stamped in the previous slot can arrive AFTER a later request has
// already rotated forward. Installing its older window over the live one would
// regress `open`, orphan the live window, and lose everything recorded in it.
// A window is only ever replaced by a strictly newer one; the straggler is
// counted in whichever window is live, which over-counts at worst, never under.
//
// Sequential on purpose. Racing the two mints would make the assertion depend
// on which importKey resolves first: if the older one wins, it is installed and
// then correctly superseded, its visit written through from the closed window,
// and the live snapshot legitimately shows one request. Both orders are right;
// only this order has an assertion that is order-independent, and only this
// order keeps a unit test off the database.
Deno.test('a straggler from the previous slot never regresses the live window', async () => {
  _resetForTest();
  const newer = at('2026-08-19T04:00:00Z');
  const older = at('2026-08-19T03:59:59Z');
  await recordVisit('aformulationoftruth.com', '203.0.113.7', 'Mozilla/5.0', newer);
  await recordVisit('aformulationoftruth.com', '203.0.113.8', 'Mozilla/5.0', older);
  const snap = _openSnapshotForTest();
  assertEquals(snap?.start, windowStart(newer).getTime());
  assertEquals(snap?.bySite.a4t?.requests, 2);
  assertEquals(snap?.bySite.a4t?.visitors, 2);
  _resetForTest();
});
