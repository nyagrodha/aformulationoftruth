/**
 * Delivery consent: what a respondent asks for, and the bundle the key box
 * receives. These contracts lived in tests/deliver_bundle_test.ts, which CI
 * cannot run (that directory's type errors fail before any test executes).
 *
 * Hermetic: the POST cases below return before any database touch.
 *
 *   deno test --allow-env --allow-read routes/api/responses/deliver_test.ts
 */

import { assert, assertEquals, assertThrows } from '$std/assert/mod.ts';
import { buildBundle, CANONICAL_COUNT, consentFrom, handler } from './deliver.ts';

const rows = [
  { question_index: 7, question_text: 'q7', ciphertext: 'ct7', skipped: false },
  { question_index: 0, question_text: 'q0', ciphertext: 'ct0', skipped: false },
  { question_index: 3, question_text: 'q3', ciphertext: 'ct3', skipped: true },
];

Deno.test('buildBundle - orders answers canonically, not chronologically', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.length, CANONICAL_COUNT);
  assertEquals(
    bundle.answers.map((a) => a.questionIndex),
    Array.from({ length: CANONICAL_COUNT }, (_, i) => i),
  );
});

Deno.test('buildBundle - preserves skipped markers', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 3)?.skipped, true);
});

Deno.test('buildBundle - carries the real ciphertext for answered questions', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  assertEquals(bundle.answers.find((a) => a.questionIndex === 7)?.ciphertext, 'ct7');
});

// A short document would look complete to the respondent, who cannot be
// expected to remember which of 35 questions they were asked.
Deno.test('buildBundle - fills an unreached question rather than shortening the document', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', null);
  const missing = bundle.answers.find((a) => a.questionIndex === 20);
  assertEquals(missing?.skipped, true);
  assertEquals(missing?.ciphertext, '');
  assert((missing?.questionText ?? '').length > 0, 'a synthesized entry still needs its question text');
});

Deno.test('buildBundle - refuses duplicate indices', () => {
  const dupes = [...rows, { question_index: 7, question_text: 'q7', ciphertext: 'other', skipped: false }];
  assertThrows(() => buildBundle('sess-1', dupes, 'enc-email', null), Error, 'duplicate answer');
});

// An index outside 0..34 means the row does not belong to this questionnaire.
// Silently dropping it would hide a real inconsistency.
Deno.test('buildBundle - refuses an out-of-range index', () => {
  assertThrows(
    () =>
      buildBundle('sess-1', [{ question_index: 99, question_text: 'q', ciphertext: 'c', skipped: false }], 'e', null),
    Error,
    'out of range',
  );
});

Deno.test('buildBundle - carries the encrypted password through untouched', () => {
  const bundle = buildBundle('sess-1', rows, 'enc-email', 'AGE-ARMORED-PW');
  assertEquals(bundle.encryptedPassword, 'AGE-ARMORED-PW');
});

Deno.test('buildBundle - no password means null, never an empty string', () => {
  // The key box branches on null to decide whether to protect the PDF; '' would
  // be truthy-adjacent and invites a "protect with empty password" bug.
  assertEquals(buildBundle('sess-1', rows, 'enc-email', null).encryptedPassword, null);
});

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

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/responses/deliver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function formPost(fields: Record<string, string>): Request {
  const form = new URLSearchParams(fields);
  return new Request('http://localhost/api/responses/deliver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

Deno.test('deliver POST - a declined copy never looks up a session', async () => {
  const post = handler.POST!;
  const response = await post(jsonPost({ consent: 'no', resume_token: 'anything' }), {} as never);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).message, 'No copy will be sent.');
});

Deno.test('deliver POST - the no-JS form path declines with a redirect, not a mailed copy', async () => {
  const post = handler.POST!;
  const response = await post(formPost({ consent: 'no' }), {} as never);
  await response.body?.cancel();
  assertEquals(response.status, 303);
  assertEquals(response.headers.get('Location'), '/completion?copy=declined');
});

Deno.test('deliver POST - yes without a session is a 400, not a silent send', async () => {
  const post = handler.POST!;
  const response = await post(jsonPost({ consent: 'yes' }), {} as never);
  assertEquals(response.status, 400);
  assertEquals((await response.json()).message, 'Missing session');
});

Deno.test('deliver POST - an unparseable body is rejected', async () => {
  const post = handler.POST!;
  const req = new Request('http://localhost/api/responses/deliver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json{',
  });
  const response = await post(req, {} as never);
  assertEquals(response.status, 400);
  await response.body?.cancel();
});
