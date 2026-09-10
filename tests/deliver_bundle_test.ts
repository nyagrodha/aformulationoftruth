/**
 * The delivery bundle: what Iceland hands the key box when someone asks for a
 * copy of their responses.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertNotEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildBundle, CANONICAL_COUNT, consentFrom } from '../routes/api/responses/deliver.ts';
import type { DeliveryBundle } from '../lib/romania-client.ts';

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
      buildBundle(
        'sess-1',
        'key-1',
        [{ question_index: 99, question_text: 'q', ciphertext: 'c', skipped: false }],
        'e',
        null,
      ),
    Error,
    'out of range',
  );
});

// question_index is BIGINT in migration 007, and deno-postgres decodes int8 as
// a JS bigint -- so every row read from the database arrives as 2n, not 2.
// Number.isInteger(2n) is false, which made the range guard reject every real
// answer with "out of range: 2" for an index plainly inside 0..34. Every test
// above builds rows from number literals, so nothing caught it until the walk
// crossed the database boundary.
Deno.test('buildBundle - accepts the bigint the driver actually returns', () => {
  const fromDriver = [
    { question_index: 2n, question_text: 'q2', ciphertext: 'ct2', skipped: false },
    { question_index: 0n, question_text: 'q0', ciphertext: 'ct0', skipped: false },
  ];
  const bundle = buildBundle('sess-1', 'key-1', fromDriver, 'enc-email', null);
  assertEquals(bundle.answers.length, CANONICAL_COUNT);
  assertEquals(bundle.answers[2].ciphertext, 'ct2');
  assertEquals(bundle.answers[2].skipped, false);
  // Normalised on the way out: the bundle is JSON, and bigint does not survive
  // JSON.stringify -- it throws rather than serialising.
  assertEquals(typeof bundle.answers[2].questionIndex, 'number');
  assert(JSON.stringify(bundle).length > 0, 'the bundle must survive serialisation');
});

// A bigint outside the range is still out of range; widening the type must not
// widen what counts as a valid index.
Deno.test('buildBundle - refuses an out-of-range bigint', () => {
  assertThrows(
    () =>
      buildBundle(
        'sess-1',
        'key-1',
        [{ question_index: 99n, question_text: 'q', ciphertext: 'c', skipped: false }],
        'e',
        null,
      ),
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

// ── the endpoint itself: gate token → keyId, session id → sessionId ─────────

/**
 * Every test above hands buildBundle its ids directly. The ENDPOINT is what
 * reads row.gate_token and maps it to keyId before pushBundle, and a regression
 * there -- a fallback to the session id, say -- passes all of the above while
 * reproducing the ENOENT this route exists to fix. So walk the endpoint: seed a
 * session with a linked gate row, POST consent, capture what pushBundle hands
 * the key box, and assert the two ids are the two DIFFERENT strings they must
 * be. Database-backed, so it skips itself without DATABASE_URL, as the rest of
 * the (db) cases do.
 */
Deno.test({
  name: 'deliver (db) - the endpoint files keyId under the gate token, not the session id',
  ignore: !Deno.env.get('DATABASE_URL'),
  async fn() {
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');
    const { withConnection } = await import('../lib/db.ts');
    const { handler } = await import('../routes/api/responses/deliver.ts');

    // The key box is reached through fetch; stand in for it and keep the body.
    const ENV_KEYS = ['KEYBOX_RENDER_URL', 'KEYBOX_RENDER_TOKEN', 'BREAKGLASS_AGE_RECIPIENT'] as const;
    const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, Deno.env.get(k)]));
    Deno.env.set('KEYBOX_RENDER_URL', 'http://keybox.invalid');
    Deno.env.set('KEYBOX_RENDER_TOKEN', 'test-token');
    Deno.env.set('BREAKGLASS_AGE_RECIPIENT', 'age1breakglass');

    const originalFetch = globalThis.fetch;
    const pushed: DeliveryBundle[] = [];
    globalThis.fetch = (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      pushed.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    const emailHash = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const gateToken = crypto.randomUUID();

    try {
      const session = await createQuestionnaireSession(emailHash, async (client) => {
        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token, session_pubkey, encrypted_email)
           VALUES ($1, $2, $3)`,
          [gateToken, 'age1test', 'enc-test'],
        );
        return gateToken;
      });

      const res = await handler.POST!(
        new Request('http://localhost/api/responses/deliver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: 'yes', resume_token: session.opaqueToken }),
        }),
        {} as never,
      );
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(pushed.length, 1, 'exactly one bundle reaches the key box');
      assertEquals(pushed[0].keyId, gateToken, 'opened with the gate token the identity was filed under');
      assertEquals(pushed[0].sessionId, session.sessionId, 'reported against the session');
      assertNotEquals(pushed[0].keyId, pushed[0].sessionId);
    } finally {
      globalThis.fetch = originalFetch;
      for (const k of ENV_KEYS) {
        const v = savedEnv[k];
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
      // Gate row first: its linked_session_id references the session.
      await withConnection(async (client) => {
        await client.queryObject(`DELETE FROM fresh_gate_responses WHERE gate_token = $1`, [gateToken]);
        await client.queryObject(`DELETE FROM fresh_questionnaire_sessions WHERE email_hash = $1`, [emailHash]);
      });
    }
  },
});
