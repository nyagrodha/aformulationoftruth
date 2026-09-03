/**
 * The delivery bundle: what Iceland hands the key box when someone asks for a
 * copy of their responses.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildBundle, CANONICAL_COUNT, consentFrom } from '../routes/api/responses/deliver.ts';

const rows = [
  { question_index: 7, question_text: 'q7', ciphertext: 'ct7', skipped: false },
  { question_index: 0, question_text: 'q0', ciphertext: 'ct0', skipped: false },
  { question_index: 3, question_text: 'q3', ciphertext: 'ct3', skipped: true },
];

Deno.test('buildBundle - orders answers canonically, not chronologically', () => {
  const bundle = buildBundle('sess-1', 'key-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.length, CANONICAL_COUNT);
  assertEquals(bundle.answers.map((a) => a.questionIndex), Array.from({ length: CANONICAL_COUNT }, (_, i) => i));
});

Deno.test('buildBundle - preserves skipped markers', () => {
  const bundle = buildBundle('sess-1', 'key-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 3)?.skipped, true);
});

Deno.test('buildBundle - carries the real ciphertext for answered questions', () => {
  const bundle = buildBundle('sess-1', 'key-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 7)?.ciphertext, 'ct7');
});

// A short document would look complete to the respondent, who cannot be
// expected to remember which of 35 questions they were asked.
Deno.test('buildBundle - fills an unreached question rather than shortening the document', () => {
  const bundle = buildBundle('sess-1', 'key-1', rows, 'enc-email', null);
  const missing = bundle.answers.find((a) => a.questionIndex === 20);
  assertEquals(missing?.skipped, true);
  assertEquals(missing?.ciphertext, '');
  assert((missing?.questionText ?? '').length > 0, 'a synthesized entry still needs its question text');
});

Deno.test('buildBundle - refuses duplicate indices', () => {
  const dupes = [...rows, { question_index: 7, question_text: 'q7', ciphertext: 'other', skipped: false }];
  assertThrows(() => buildBundle('sess-1', 'key-1', dupes, 'enc-email', null), Error, 'duplicate answer');
});

// An index outside 0..34 means the row does not belong to this questionnaire.
// Silently dropping it would hide a real inconsistency.
Deno.test('buildBundle - refuses an out-of-range index', () => {
  assertThrows(
    () =>
      buildBundle('sess-1', 'key-1', [{ question_index: 99, question_text: 'q', ciphertext: 'c', skipped: false }], 'e', null),
    Error,
    'out of range',
  );
});

Deno.test('buildBundle - carries the encrypted password through untouched', () => {
  const bundle = buildBundle('sess-1', 'key-1', rows, 'enc-email', 'AGE-ARMORED-PW');
  assertEquals(bundle.encryptedPassword, 'AGE-ARMORED-PW');
});

Deno.test('buildBundle - no password means null, never an empty string', () => {
  // The key box branches on null to decide whether to protect the PDF; '' would
  // be truthy-adjacent and invites a "protect with empty password" bug.
  assertEquals(buildBundle('sess-1', 'key-1', rows, 'enc-email', null).encryptedPassword, null);
});

// ── consent parsing: the form is urlencoded on the no-JS path ───────────────

Deno.test('consentFrom - reads an explicit yes and no', () => {
  assertEquals(consentFrom({ consent: 'yes' }), 'yes');
  assertEquals(consentFrom({ consent: 'no' }), 'no');
});

Deno.test('consentFrom - anything else is treated as no', () => {
  // Fail closed: an unrecognised value must not cause a copy of someone's
  // intimate answers to be mailed on a guess.
  assertEquals(consentFrom({}), 'no');
  assertEquals(consentFrom({ consent: '' }), 'no');
  assertEquals(consentFrom({ consent: 'YES please' }), 'no');
  assertEquals(consentFrom({ consent: ['yes', 'no'] as unknown as string }), 'no');
});

Deno.test('consentFrom - accepts the exact casing the form submits', () => {
  assertEquals(consentFrom({ consent: 'Yes' }), 'no', 'only the literal form value counts');
});

/**
 * The identity is filed on the key box under the GATE TOKEN
 * (`pushIdentity(gateToken, ...)` in gate-submit), but the render service used
 * to load it by `bundle.sessionId` -- the session HMAC. Those are different
 * strings, so `loadIdentity` raised ENOENT on every render and no PDF has ever
 * been produced. The bundle therefore has to carry both: the key id to open it
 * with, and the session id to report delivery against.
 */
Deno.test('buildBundle - carries the key id the identity was filed under', () => {
  const bundle = buildBundle(
    'b'.repeat(64),
    '11111111-2222-3333-4444-555555555555',
    [],
    'encrypted-email',
    null,
  );

  assertEquals(bundle.keyId, '11111111-2222-3333-4444-555555555555');
  assertEquals(bundle.sessionId, 'b'.repeat(64));
});
