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
import {
  _countersForTest,
  _persistHooks,
  _resetForTest,
  audienceHash,
  noteRequest,
  type OpenWindow,
  recordOptOutNavigation,
  recordVisit,
  siteFor,
  WINDOW_MS,
  windowStart,
} from './audience.ts';

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

  // Updated 2026-09-23 (task 5b): unclassified_visitors and
  // optout_navigations joined the row. Both are integers -- see the banned-name
  // loop below, which still runs over this exact list.
  assertEquals(columns, [
    'window_start',
    'site',
    'run_id',
    'visitors',
    'bot_visitors',
    'unclassified_visitors',
    'optout_navigations',
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

// 017 is additive-only; the same invariant applies to what it adds.
Deno.test('017 adds no address-derived column either', async () => {
  const sql = await Deno.readTextFile(
    new URL('../db/migrations/017_audience_buckets.sql', import.meta.url),
  );
  const alterStart = sql.indexOf('ALTER TABLE');
  // Search for the terminating ';' from the ALTER, not from file start --
  // the surrounding comment prose (deliberately) contains semicolons too.
  const body = sql.slice(alterStart, sql.indexOf(';', alterStart));
  for (const banned of [/\bvisitor_hash\b/, /\bip\b\s+\w/, /\buser_agent\b/, /\binet\b/, /\bcidr\b/]) {
    assert(!banned.test(body), `017 declares a forbidden column: ${banned}`);
  }
  assert(/unclassified_visitors\s+INT/.test(body));
  assert(/optout_navigations\s+INT/.test(body));
});

// --- classified buckets (task 5b, 2026-09-23) ------------------------------

// person/bot/unclassified are independent sets keyed by the same digest
// space, and opting out must never touch any of them -- only its own plain
// counter. _resetForTest clears in-memory state without touching Postgres,
// so this stays hermetic as long as it never crosses a window boundary.
Deno.test('person, bot and unclassified buckets stay separate, and opting out enters none of them', async () => {
  _resetForTest();
  try {
    const now = at('2026-09-23T10:00:00Z');
    // Same (ip, UA) in three different buckets: the bucket is the caller's
    // classification, not something recordVisit re-derives from the UA.
    await recordVisit('aformulationoftruth.com', '203.0.113.9', 'same-ua', 'person', now);
    await recordVisit('aformulationoftruth.com', '203.0.113.9', 'same-ua', 'bot', now);
    await recordVisit('aformulationoftruth.com', '203.0.113.9', 'same-ua', 'unclassified', now);
    await recordOptOutNavigation('aformulationoftruth.com', now);

    const counters = _countersForTest('a4t');
    assert(counters);
    assertEquals(counters.person, 1);
    assertEquals(counters.bot, 1);
    assertEquals(counters.unclassified, 1);
    assertEquals(counters.optoutNavigations, 1);
    // Ruling S17: recordVisit/recordOptOutNavigation no longer touch
    // `requests` at all -- only noteRequest does, and it was never called
    // here, so this must stay 0 rather than double-counting.
    assertEquals(counters.requests, 0);
  } finally {
    _resetForTest();
  }
});

Deno.test('recordOptOutNavigation never computes a pseudonym', async () => {
  const src = await Deno.readTextFile(new URL('./audience.ts', import.meta.url));
  const start = src.indexOf('export async function recordOptOutNavigation');
  assert(start !== -1, 'recordOptOutNavigation not found in lib/audience.ts');
  const end = src.indexOf('\n}\n', start);
  assert(end !== -1, 'could not find the end of recordOptOutNavigation');
  const body = src.slice(start, end);
  assert(
    !body.includes('audienceHash('),
    'recordOptOutNavigation must never compute a pseudonym -- Sec-GPC/DNT gets none at all',
  );
});

// --- Ruling S17: noteRequest gives every window somewhere to put a row ----

type CapturedCounters = {
  person: number;
  bot: number;
  unclassified: number;
  optoutNavigations: number;
  requests: number;
};

/** Snapshot a window's counts as plain numbers, keyed by site. Test-only. */
function snapshotWindow(w: OpenWindow): Record<string, CapturedCounters> {
  const out: Record<string, CapturedCounters> = {};
  for (const [site, c] of w.bySite) {
    out[site] = {
      person: c.person.size,
      bot: c.bot.size,
      unclassified: c.unclassified.size,
      optoutNavigations: c.optoutNavigations,
      requests: c.requests,
    };
  }
  return out;
}

// Before Ruling S17, a window touched only by noteRequest-shaped traffic
// (404s, /api/*, POSTs -- nothing that ever reached recordVisit or
// recordOptOutNavigation) never created a Counters entry at all, so
// `persist` (bySite.size === 0) skipped it entirely: the window got NO row,
// and monitoring/daily_report.py reads "no row" as "the counter wasn't
// running". noteRequest existing, and creating that entry, is the fix.
Deno.test('a window touched only by noteRequest still has something to persist', async () => {
  _resetForTest();
  const captured: Record<string, CapturedCounters>[] = [];
  _persistHooks.persist = (w: OpenWindow) => {
    captured.push(snapshotWindow(w));
    return Promise.resolve();
  };
  try {
    const now = at('2026-09-23T10:00:00Z');
    await noteRequest('aformulationoftruth.com', now);
    await noteRequest('aformulationoftruth.com', now);

    // Force the window to close by rotating to a later one.
    await noteRequest('aformulationoftruth.com', at('2026-09-23T14:00:00Z'));

    assertEquals(captured.length, 1, 'the first window should have been persisted exactly once');
    assertEquals(captured[0]['a4t'], {
      person: 0,
      bot: 0,
      unclassified: 0,
      optoutNavigations: 0,
      requests: 2,
    });
  } finally {
    _resetForTest();
  }
});

// --- F14: the window-rotation race (Ruling S18) ----------------------------

// The bug this pins: the pre-fix openCounters() re-checked the *global*
// `open` after its own `await mint(start)`, so two concurrent callers who
// both saw the window stale would each mint their OWN window, and whichever
// finished last silently overwrote the other -- discarding every count
// already added to the one it replaced. 50 concurrent calls landing in the
// SAME just-opened window is exactly the shape that triggered it: with
// `open` starting null, every one of the 50 sees "no window yet" before any
// of them has minted one.
Deno.test('rotation race: 50 concurrent recordVisit calls into a freshly-opened window lose nobody', async () => {
  _resetForTest();
  try {
    const now = at('2026-09-23T10:00:00Z');
    await Promise.all(
      Array.from(
        { length: 50 },
        (_, i) => recordVisit('aformulationoftruth.com', `203.0.113.${i}`, 'ua', 'person', now),
      ),
    );
    const counters = _countersForTest('a4t');
    assert(counters);
    assertEquals(counters.person, 50, 'no distinct visitor should have been lost to the mint race');
  } finally {
    _resetForTest();
  }
});

// The harder case: 50 concurrent recordVisit calls straddling a REAL
// boundary, half with a `now` just before it and half just after. Whichever
// window ends up superseded gets persisted via the hook below (never a real
// database); whichever is still open is read via _countersForTest. Their
// combined total must be exactly 50, proving no count was lost to the race
// AND none was double-attributed (counted in both).
Deno.test('rotation race: 50 concurrent recordVisit calls straddling a real boundary sum to 50, not lost or doubled', async () => {
  _resetForTest();
  const persistedPersons: number[] = [];
  _persistHooks.persist = (w: OpenWindow) => {
    const snap = snapshotWindow(w);
    persistedPersons.push(snap['a4t']?.person ?? 0);
    return Promise.resolve();
  };
  try {
    const boundary = windowStart(at('2026-09-23T12:00:01Z')).getTime();
    const before = new Date(boundary - 1); // last ms of the earlier window
    const after = new Date(boundary); // first ms of the later window

    const calls: Promise<void>[] = [];
    for (let i = 0; i < 25; i++) {
      calls.push(recordVisit('aformulationoftruth.com', `203.0.113.${i}`, 'ua', 'person', before));
    }
    for (let i = 25; i < 50; i++) {
      calls.push(recordVisit('aformulationoftruth.com', `203.0.113.${i}`, 'ua', 'person', after));
    }
    await Promise.all(calls);

    const stillOpen = _countersForTest('a4t');
    assert(stillOpen, 'one of the two windows should still be open');
    const total = persistedPersons.reduce((a, b) => a + b, 0) + stillOpen.person;
    assertEquals(total, 50, `expected no count lost or double-attributed across the boundary, got ${total}`);
  } finally {
    _resetForTest();
  }
});

// Same shape, but for noteRequest -- the ruling asked for the rotation-race
// coverage to also cover it, not only recordVisit. requests is a plain
// integer (no distinct-pseudonym set to dedupe against), so the invariant
// here is simpler: the sum across both windows must equal the call count
// exactly, every time.
Deno.test('rotation race: 20 concurrent noteRequest calls straddling a boundary sum to 20', async () => {
  _resetForTest();
  const persistedRequests: number[] = [];
  _persistHooks.persist = (w: OpenWindow) => {
    const snap = snapshotWindow(w);
    persistedRequests.push(snap['a4t']?.requests ?? 0);
    return Promise.resolve();
  };
  try {
    const boundary = windowStart(at('2026-09-23T16:00:01Z')).getTime();
    const before = new Date(boundary - 1);
    const after = new Date(boundary);

    const calls: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) calls.push(noteRequest('aformulationoftruth.com', before));
    for (let i = 0; i < 10; i++) calls.push(noteRequest('aformulationoftruth.com', after));
    await Promise.all(calls);

    const stillOpen = _countersForTest('a4t');
    assert(stillOpen);
    const total = persistedRequests.reduce((a, b) => a + b, 0) + stillOpen.requests;
    assertEquals(total, 20, `expected exactly 20 requests across both windows, got ${total}`);
  } finally {
    _resetForTest();
  }
});
