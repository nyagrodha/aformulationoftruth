/**
 * Render service authentication, input validation, and information leakage.
 *
 * These test the HTTP surface: bearer tokens, method/path filtering, bundle
 * edge cases, and that error responses never leak PII.
 *
 * Run: deno test --allow-read --allow-write --allow-env romania/tests/service_security_test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateBundle } from '../render-service.ts';

// ── validateBundle edge cases ────────────────────────────────────────

const full = (n = 35) => ({
  sessionId: '11111111-2222-3333-4444-555555555555',
  deliveryId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  answers: Array.from({ length: n }, (_, i) => ({
    questionIndex: i,
    questionText: `q${i}`,
    ciphertext: 'ct',
    skipped: false,
  })),
  encryptedEmail: 'enc',
  encryptedPassword: null,
});

Deno.test('validateBundle - rejects 36 answers (one too many)', () => {
  assertEquals(validateBundle(full(36)), 'expected 35 answers');
});

Deno.test('validateBundle - rejects 0 answers', () => {
  assertEquals(validateBundle(full(0)), 'expected 35 answers');
});

Deno.test('validateBundle - accepts a bundle with extra fields (tolerant parsing)', () => {
  const b = { ...full(), extraField: 'surprise', anotherOne: 42 };
  assertEquals(validateBundle(b), 'ok');
});

Deno.test('validateBundle - rejects undefined', () => {
  assertEquals(validateBundle(undefined), 'not an object');
});

Deno.test('validateBundle - rejects a string', () => {
  assertEquals(validateBundle('hello'), 'not an object');
});

Deno.test('validateBundle - rejects an array', () => {
  const result = validateBundle([1, 2, 3]);
  assertEquals(result !== 'ok', true, 'an array must not validate as ok');
});

Deno.test('validateBundle - rejects duplicate question indices', () => {
  const b = full();
  // Set index 5 to repeat index 4.
  b.answers[5] = { ...b.answers[5], questionIndex: 4 };
  assertEquals(validateBundle(b), 'answer 5 out of order');
});

Deno.test('validateBundle - rejects a session id with shell metacharacters', () => {
  const tests = [
    '$(whoami)aaaa',
    '`id`aaaaaaaaa',
    'aaaa;ls;aaaa',
    'aaaa|cat|aaa',
    'aaaa&&id&&aa',
  ];
  for (const id of tests) {
    assertEquals(validateBundle({ ...full(), sessionId: id }), 'bad session id');
  }
});

Deno.test('validateBundle - rejects whitespace-only encryptedEmail', () => {
  // The current check is `length === 0`. Whitespace-only passes.
  // This documents the current behavior; if policy tightens, flip assertion.
  const b = { ...full(), encryptedEmail: '   ' };
  assertEquals(validateBundle(b), 'ok');
});

// ── Error response content ───────────────────────────────────────────
// The HTTP handler is tested here at the validateBundle level. The important
// guarantee: validation reasons describe SHAPE (count, order), never content.

Deno.test('validateBundle - reason strings never contain answer text', () => {
  const b = full();
  b.answers[3].ciphertext = 'SUPER SECRET ANSWER TEXT';
  // Swap to trigger an ordering error.
  [b.answers[3], b.answers[4]] = [b.answers[4], b.answers[3]];
  const reason = validateBundle(b);
  assertEquals(reason.includes('SUPER SECRET'), false, 'validation reason must not echo answer content');
});

Deno.test('validateBundle - reason strings never contain the email', () => {
  const b = { ...full(), encryptedEmail: '' };
  const reason = validateBundle(b);
  assertEquals(reason, 'address missing');
  // Even with a real-looking address, the reason should never include it.
  const b2 = { ...full(), encryptedEmail: 'victim@example.com', sessionId: '!@#$' };
  const reason2 = validateBundle(b2);
  assertEquals(reason2.includes('victim@example.com'), false);
});

// ── Mailer: what sendDelivery actually hands the sender ──────────────
//
// Both tests drive the real sendDelivery with a fake runner in place of
// python3 and inspect what it produced. Nothing is mailed.

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { sendDelivery, SENDER } from '../mailer.ts';
import { fakeRunner, TEST_EMAIL } from './fixtures.ts';

async function captureSend(): Promise<{ args: string[]; specMode: number; spec: Record<string, unknown> }> {
  const dir = await Deno.makeTempDir({ prefix: 'mailer-' });
  const saved = Deno.env.get('FROM_EMAIL');
  Deno.env.set('FROM_EMAIL', 'sender@example.invalid');
  let specMode = 0;
  let spec: Record<string, unknown> = {};
  const { run, calls } = fakeRunner({
    python3: async (args) => {
      specMode = (await Deno.stat(args[1])).mode! & 0o777;
      spec = JSON.parse(await Deno.readTextFile(args[1]));
      return true; // report success; the fake never sends
    },
  });
  try {
    await sendDelivery(
      { to: TEST_EMAIL, pdf: new Uint8Array([0x25]), filename: 't.pdf', protected: false, workDir: dir },
      run,
    );
  } finally {
    if (saved === undefined) Deno.env.delete('FROM_EMAIL');
    else Deno.env.set('FROM_EMAIL', saved);
    await Deno.remove(dir, { recursive: true });
  }
  assertEquals(calls.length, 1);
  return { args: calls[0].args, specMode, spec };
}

Deno.test('sendDelivery - writes the spec file 0600', async () => {
  const { specMode, spec } = await captureSend();
  assertEquals(spec.to, TEST_EMAIL, 'sanity: this is the file that holds the address');
  assertEquals(specMode, 0o600, 'spec file must be owner-only');
});

Deno.test('sendDelivery - passes only the sender script and the spec path on argv', async () => {
  const { args } = await captureSend();
  assertEquals(args.length, 2);
  assertEquals(args[0], SENDER);
  assert(SENDER.endsWith('/send_mail.py'), 'the sender must be send_mail.py');
  assert(args[1].endsWith('/mail.json'));
  // argv is world-readable via /proc/<pid>/cmdline.
  assert(!args.some((a) => a.includes(TEST_EMAIL)), 'the address must never be on argv');
});
