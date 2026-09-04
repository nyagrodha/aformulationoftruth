/**
 * Structural validation of an incoming bundle, before anything is decrypted.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateBundle } from '../render-service.ts';

const full = (n = 35) => ({
  sessionId: 'a'.repeat(64),
  // The identity is filed under the gate token, so the bundle carries it
  // separately from the session id it reports delivery against.
  keyId: '11111111-2222-3333-4444-555555555555',
  answers: Array.from({ length: n }, (_, i) => ({
    questionIndex: i,
    questionText: `q${i}`,
    ciphertext: 'ct',
    skipped: false,
  })),
  encryptedEmail: 'enc',
  encryptedPassword: null,
});

Deno.test('validateBundle - accepts a complete, ordered bundle', () => {
  assertEquals(validateBundle(full()), 'ok');
});

// A short bundle would render as a plausible-looking but incomplete document,
// and the respondent has no way to notice which question is missing.
Deno.test('validateBundle - rejects a short bundle', () => {
  assertEquals(validateBundle(full(34)), 'expected 35 answers');
});

Deno.test('validateBundle - rejects answers out of canonical order', () => {
  const b = full();
  [b.answers[3], b.answers[9]] = [b.answers[9], b.answers[3]];
  assertEquals(validateBundle(b), 'answer 3 out of order');
});

Deno.test('validateBundle - rejects a traversal-shaped session id', () => {
  assertEquals(validateBundle({ ...full(), sessionId: '../../etc/passwd' }), 'bad session id');
});

Deno.test('validateBundle - rejects a missing address', () => {
  assertEquals(validateBundle({ ...full(), encryptedEmail: '' }), 'address missing');
});

Deno.test('validateBundle - rejects nonsense', () => {
  assertEquals(validateBundle(null), 'not an object');
  assertEquals(validateBundle({ sessionId: 'x' }), 'bad session id');
});

// The key id names a file the service will open. A traversal-shaped one must be
// refused for the same reason the session id is, and it is now the field that
// actually reaches loadIdentity.
Deno.test('validateBundle - rejects a traversal-shaped key id', () => {
  assertEquals(validateBundle({ ...full(), keyId: '../../etc/passwd' }), 'bad key id');
});

Deno.test('validateBundle - rejects a bundle with no key id at all', () => {
  const b = full() as Record<string, unknown>;
  delete b.keyId;
  assertEquals(validateBundle(b), 'bad key id');
});
