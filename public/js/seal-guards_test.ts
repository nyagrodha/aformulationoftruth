import { assert, assertEquals, assertRejects, assertThrows } from '$std/assert/mod.ts';
import {
  b64,
  checkedEnvelope,
  checkedIterations,
  checkedPassphrase,
  DEFAULT_ITERATIONS,
  decodeField,
  keyFromPassphrase,
  MAX_ITERATIONS,
} from './seal-guards.js';

/*
 * These cases came over from routes/messenger_test.tsx when the seal/open
 * scratchpad was removed. They used to run against a slice of messenger.js
 * lifted out with string markers and evaluated, because that script called
 * getElementById at module scope. seal-guards.js touches no DOM, so they
 * import it like anything else.
 */

Deno.test('a hostile iteration count is refused rather than run', () => {
  for (const hostile of [1e12, MAX_ITERATIONS + 1, 0, -1, 1.5, 'many']) {
    assertThrows(() => checkedIterations(hostile as number));
  }
});

Deno.test('a legitimate iteration count still opens', () => {
  assertEquals(checkedIterations(600000), 600000);
  assertEquals(checkedIterations(MAX_ITERATIONS), MAX_ITERATIONS);
});

Deno.test('an absent iteration count falls back rather than failing', () => {
  assertEquals(checkedIterations(undefined), DEFAULT_ITERATIONS);
  assertEquals(checkedIterations(null), DEFAULT_ITERATIONS);
});

Deno.test('an empty passphrase is refused before anything is sealed', () => {
  for (const empty of ['', '   ', '\t\n', undefined, null]) {
    assertThrows(() => checkedPassphrase(empty as string), Error, 'a passphrase is required');
  }
});

/*
 * The raw value is returned, not the trimmed one. Trimming before derivation
 * would silently change the key, so a passphrase with deliberate padding would
 * seal envelopes it could never reopen.
 */
Deno.test('a padded passphrase is passed through untouched', () => {
  assertEquals(checkedPassphrase('  spaced  '), '  spaced  ');
});

Deno.test('an oversized envelope field is refused before it is decoded', () => {
  const huge = 'A'.repeat(4096);
  assertThrows(() => decodeField('salt', huge, 64), Error, 'larger than');
});

Deno.test('a missing envelope field is named in the error', () => {
  assertThrows(() => decodeField('iv', undefined as unknown as string, 16), Error, 'missing iv');
  assertThrows(() => decodeField('iv', '', 16), Error, 'missing iv');
});

Deno.test('a legitimately sized field still decodes, including a larger salt', () => {
  const salt32 = b64(crypto.getRandomValues(new Uint8Array(32)));
  assertEquals(decodeField('salt', salt32, 64).length, 32);
});

Deno.test('checkedEnvelope validates every field before returning', () => {
  assertThrows(() => checkedEnvelope(null), Error, 'envelope must be an object');
  assertThrows(
    () => checkedEnvelope({ salt: b64(new Uint8Array(16)), iv: 'AAAA' }),
    Error,
    'missing data',
  );
});

/*
 * The round trip is the claim the guards exist to protect: an envelope sealed
 * with these parameters opens again, and only with the right passphrase.
 */
Deno.test('an envelope sealed by these guards opens again', async () => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassphrase(checkedPassphrase('correct horse'), salt, 1000);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode('the record was never checked'));

  const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  assertEquals(dec.decode(opened), 'the record was never checked');

  const envelope = checkedEnvelope({ salt: b64(salt), iv: b64(iv), data: b64(data), iterations: 1000 });
  assertEquals(envelope.iterations, 1000);
  assert(envelope.salt.length === 16);
});

Deno.test('the wrong passphrase does not open an envelope', async () => {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFromPassphrase('right', salt, 1000),
    enc.encode('secret'),
  );

  const wrong = await keyFromPassphrase('wrong', salt, 1000);
  await assertRejects(() => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrong, sealed));
});
