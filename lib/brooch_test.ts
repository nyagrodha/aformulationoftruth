/**
 * lib/brooch.ts against an in-memory stand-in for the two tables. Hermetic:
 * DATABASE_URL is never parsed; both seams route to the fake client.
 */
import { assert, assertEquals } from '$std/assert/mod.ts';
import { encodeBase64 } from '$std/encoding/base64.ts';
import { encodeCode, importBroochKey } from './brooch_code.ts';
import { loadKek, wrapBroochKey } from './brooch_keys.ts';
import { acceptEncounter, codeStatus, dbForTesting, stampScanner } from './brooch.ts';
import { sha256 } from './crypto.ts';

const TEST_KEY = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));
Deno.env.set('BROOCH_KEK', encodeBase64(new Uint8Array(32).fill(0xaa)));
const t0 = new Date('2026-09-23T12:00:00Z');

interface Brooch {
  key_enc: string;
  last_counter: bigint;
  wearable_token: string;
  revoked: boolean;
}
interface CodeRow {
  brooch_id: number;
  counter: number;
  first_seen: Date;
  scanner_email_hash: string | null;
}

/** One recorded call, tagged with which seam (withConnection vs withTransaction) it came through. */
interface Call {
  sql: string;
  args: unknown[];
  viaTransaction: boolean;
}

async function fakeDb(lastCounter = 0) {
  const kek = await loadKek();
  assert(kek);
  const brooch: Brooch = {
    key_enc: await wrapBroochKey(TEST_KEY, kek),
    last_counter: BigInt(lastCounter),
    wearable_token: 'tok_0123456789abcdef',
    revoked: false,
  };
  const codes = new Map<string, CodeRow>();
  const calls: Call[] = [];
  const clock = t0;

  function dispatch(sql: string, args: unknown[]) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT key_enc')) {
      return Promise.resolve({ rows: args[0] === 1 && !brooch.revoked ? [brooch] : [] });
    }
    if (q.startsWith('SELECT first_seen')) {
      const r = codes.get(args[0] as string);
      return Promise.resolve({ rows: r ? [{ first_seen: r.first_seen }] : [] });
    }
    if (q.startsWith('INSERT INTO fresh_encounter_codes')) {
      codes.set(args[0] as string, {
        brooch_id: args[1] as number,
        counter: args[2] as number,
        first_seen: clock,
        scanner_email_hash: null,
      });
      return Promise.resolve({ rows: [] });
    }
    if (q.startsWith('UPDATE fresh_brooches SET last_counter')) {
      brooch.last_counter = BigInt(args[1] as number);
      return Promise.resolve({ rows: [] });
    }
    if (q.startsWith('UPDATE fresh_encounter_codes SET scanner_email_hash')) {
      const r = codes.get(args[0] as string);
      if (r && r.scanner_email_hash === null) r.scanner_email_hash = args[1] as string;
      return Promise.resolve({ rows: [] });
    }
    throw new Error('unexpected SQL in test: ' + q.slice(0, 60));
  }

  function makeClient(viaTransaction: boolean) {
    return {
      queryObject(sql: string, args: unknown[] = []) {
        calls.push({ sql, args, viaTransaction });
        return dispatch(sql, args);
      },
    };
  }

  // deno-lint-ignore no-explicit-any
  const runConnection = (<T>(h: (c: any) => Promise<T>) => h(makeClient(false))) as never;

  // The real withTransaction holds a single Postgres connection for the
  // transaction's lifetime, and acceptEncounter's `FOR UPDATE` blocks a second
  // concurrent transaction on that row until the first commits. Model that
  // with a promise-chain mutex: each call to this seam only starts its
  // handler once the previous one has fully settled, so two "concurrent"
  // acceptEncounter calls actually run one after the other -- exactly the
  // serialisation the row lock is relied on to provide.
  let chain: Promise<unknown> = Promise.resolve();
  // deno-lint-ignore no-explicit-any
  const runTransaction = (<T>(h: (c: any) => Promise<T>): Promise<T> => {
    const client = makeClient(true);
    const result = chain.then(() => h(client));
    chain = result.then(() => undefined, () => undefined);
    return result;
  }) as never;

  dbForTesting.withConnection = runConnection;
  dbForTesting.withTransaction = runTransaction;
  return { brooch, codes, calls };
}

const key = await importBroochKey(TEST_KEY);
const code = (ctr: number) => encodeCode(key, 1, ctr);

Deno.test('a fresh code is a new encounter: row written, last_counter advanced', async () => {
  const db = await fakeDb(0);
  const c = await code(1);
  const r = await acceptEncounter(c, t0);
  assert(r);
  assertEquals(r.wearableToken, 'tok_0123456789abcdef');
  assertEquals(r.codeHash, await sha256(c));
  assertEquals(db.brooch.last_counter, 1n);
  assertEquals(db.codes.size, 1);

  // Every query for an accept runs inside the transaction, never the plain
  // connection seam -- that's what makes the row lock below effective.
  assert(db.calls.length > 0);
  assert(db.calls.every((call) => call.viaTransaction));

  // The lock itself: the first query (the brooch lookup) takes FOR UPDATE.
  assert(db.calls[0].sql.includes('FOR UPDATE'));

  // last_counter is set by brooch id ($1), to the new counter ($2).
  const updateCall = db.calls.find((call) =>
    call.sql.replace(/\s+/g, ' ').trim().startsWith('UPDATE fresh_brooches SET last_counter')
  );
  assert(updateCall);
  assertEquals(updateCall.args, [1, 1]);

  // The raw code is never written anywhere -- only its sha256 hash.
  for (const call of db.calls) {
    for (const arg of call.args) {
      assert(arg !== c, `raw code leaked into a query arg: ${call.sql}`);
    }
  }
});

Deno.test('second scan of the same code is grace; after 15 min it is refused', async () => {
  const db = await fakeDb(0);
  const c = await code(1);
  assert(await acceptEncounter(c, t0));
  assert(await acceptEncounter(c, new Date(t0.getTime() + 60_000)));
  assertEquals(db.codes.size, 1); // still one encounter
  assertEquals(await acceptEncounter(c, new Date(t0.getTime() + 16 * 60_000)), null);
});

Deno.test('an older counter than one already accepted is refused', async () => {
  const db = await fakeDb(5);
  assertEquals(await acceptEncounter(await code(3), t0), null);
  assertEquals(db.codes.size, 0); // no encounter row for a rejected accept
});

Deno.test('two concurrent scans of a fresh code: exactly one wins', async () => {
  const db = await fakeDb(0);
  const c = await code(1);
  const [a, b] = await Promise.all([acceptEncounter(c, t0), acceptEncounter(c, t0)]);
  assert(a);
  assert(b);
  assertEquals(a.codeHash, b.codeHash);
  assertEquals(db.codes.size, 1);
  assertEquals(db.brooch.last_counter, 1n);
});

Deno.test('a broochId outside the INT4 range refuses before any query reaches the database', async () => {
  const db = await fakeDb(0);
  for (const badId of [0x80000001, 0]) {
    const bad = await encodeCode(key, badId, 1);
    assertEquals(await acceptEncounter(bad, t0), null);
    assertEquals(await codeStatus(bad), null);
  }
  assertEquals(db.calls.length, 0);
});

Deno.test('tampered, unknown-brooch, revoked and malformed codes are refused', async () => {
  const db = await fakeDb(0);
  const c = await code(1);
  assertEquals(await acceptEncounter(c.slice(0, 26) + (c[26] === 'A' ? 'E' : 'A'), t0), null);
  assertEquals(await acceptEncounter(await encodeCode(key, 2, 1), t0), null); // brooch 2 absent
  assertEquals(await acceptEncounter('not-a-code', t0), null);
  db.brooch.revoked = true;
  assertEquals(await acceptEncounter(c, t0), null);
  assertEquals(db.codes.size, 0);
});

Deno.test('a missing BROOCH_KEK refuses everything', async () => {
  await fakeDb(0);
  const c = await code(1);
  const prev = Deno.env.get('BROOCH_KEK')!;
  Deno.env.delete('BROOCH_KEK');
  try {
    assertEquals(await acceptEncounter(c, t0), null);
    assertEquals(await codeStatus(c), null);
  } finally {
    Deno.env.set('BROOCH_KEK', prev);
  }
});

Deno.test('codeStatus: fresh, then redeemed; a skipped code is stale', async () => {
  await fakeDb(0);
  const c1 = await code(1), c2 = await code(2), c3 = await code(3);
  assertEquals(await codeStatus(c1), 'fresh');
  await acceptEncounter(c1, t0);
  assertEquals(await codeStatus(c1), 'redeemed');
  await acceptEncounter(c3, t0); // c2 was shown but never scanned
  assertEquals(await codeStatus(c2), 'stale');
  assertEquals(await codeStatus('garbage'), null);
});

Deno.test('stampScanner fills scanner_email_hash once', async () => {
  const db = await fakeDb(0);
  const c = await code(1);
  const r = await acceptEncounter(c, t0);
  assert(r);
  await stampScanner(r.codeHash, 'hash-a');
  await stampScanner(r.codeHash, 'hash-b');
  assertEquals(db.codes.get(r.codeHash)?.scanner_email_hash, 'hash-a');
});
