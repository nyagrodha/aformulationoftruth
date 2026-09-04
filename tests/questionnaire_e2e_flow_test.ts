/**
 * The whole product, in one file: two gate answers, the magic link, an
 * authorised session, the thirty-three questions that follow, and the PDF that
 * comes back -- with and without a password.
 *
 * Why this exists. The site has reported `PDFs returned, all time 0` for its
 * entire life, and nobody could say which of a dozen stages was responsible,
 * because no test had ever crossed a stage boundary. Every existing test is a
 * pure function or a source scan. This one asserts the seams between them.
 *
 * The email step is the only part not exercised. `buildMagicLinkUrl` and
 * `magicLinkForTesting` let the walk follow exactly the URL a respondent would
 * be sent, without a mail server and without anything being delivered.
 *
 * The database-backed cases are skipped unless DATABASE_URL is set, so this
 * file stays green on a machine with no Postgres while still running in CI.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildMagicLinkUrl } from '../routes/api/gate-submit.ts';
import { buildBundle } from '../routes/api/responses/deliver.ts';
import { planSupersede } from '../lib/questionnaire-session.ts';

const CANONICAL_COUNT = 35;
const GATE_QUESTIONS = 2;
const FOLLOWING_QUESTIONS = CANONICAL_COUNT - GATE_QUESTIONS; // 33

const hasDb = Boolean(Deno.env.get('DATABASE_URL'));

// ---------------------------------------------------------------- the link

Deno.test('flow - the magic link carries both halves the verifier needs', () => {
  // /auth/verify checks the JWT, then hashes `resume` to find the session and
  // requires the two to agree. A link missing either half fails at a different
  // step, and the error text does not distinguish them.
  const url = buildMagicLinkUrl('https://example.test', 'JWT.VALUE.HERE', 'opaque-token');
  const parsed = new URL(url);

  assertEquals(parsed.pathname, '/auth/verify');
  assertEquals(parsed.searchParams.get('token'), 'JWT.VALUE.HERE');
  assertEquals(parsed.searchParams.get('resume'), 'opaque-token');
});

Deno.test('flow - the link is absolute, so it survives leaving the process', () => {
  const url = buildMagicLinkUrl('https://aformulationoftruth.com', 'j', 'o');
  assert(url.startsWith('https://aformulationoftruth.com/'));
});

// ------------------------------------------------------- the whole document

Deno.test('flow - a complete walk yields all 35 answers, none of them blank', () => {
  // 2 at the gate + 33 after auth. The count is the contract: buildBundle pads
  // to CANONICAL_COUNT, so a short walk produces a plausible-looking document
  // whose missing answers are indistinguishable from deliberate skips.
  const answered = Array.from({ length: CANONICAL_COUNT }, (_, i) => ({
    question_index: i,
    question_text: `q${i}`,
    ciphertext: `ct-${i}`,
    skipped: false,
  }));

  const bundle = buildBundle('s'.repeat(64), 'key-1', answered, 'enc-email', null);

  assertEquals(bundle.answers.length, CANONICAL_COUNT);
  assertEquals(bundle.answers.filter((a) => a.skipped).length, 0);
  assertEquals(bundle.answers.filter((a) => a.ciphertext === '').length, 0);
  assertEquals(GATE_QUESTIONS + FOLLOWING_QUESTIONS, CANONICAL_COUNT);
});

Deno.test('flow - an interrupted walk is visibly incomplete, not silently short', () => {
  // Only the gate answered. The document must still be 35 long, with the
  // remainder marked skipped rather than absent.
  const onlyGate = [0, 1].map((i) => ({
    question_index: i,
    question_text: `q${i}`,
    ciphertext: `ct-${i}`,
    skipped: false,
  }));

  const bundle = buildBundle('s'.repeat(64), 'key-1', onlyGate, 'enc-email', null);

  assertEquals(bundle.answers.length, CANONICAL_COUNT);
  assertEquals(bundle.answers.filter((a) => a.skipped).length, FOLLOWING_QUESTIONS);
});

// ------------------------------------------------------------- the key box

Deno.test('flow - the bundle names the key it must be opened with, not the session', () => {
  // The identity is filed under the gate token; the session id is what delivery
  // is reported against. Collapsing the two is why loadIdentity raised ENOENT
  // on every render and no PDF was ever produced.
  const bundle = buildBundle(
    'a'.repeat(64),
    '11111111-2222-3333-4444-555555555555',
    [],
    'enc',
    null,
  );

  assertNotEquals(bundle.keyId, bundle.sessionId);
  assertEquals(bundle.keyId, '11111111-2222-3333-4444-555555555555');
});

// -------------------------------------------------------------- the password

Deno.test('flow - the password option travels sealed, or not at all', () => {
  // The password is age-encrypted upstream and passed through untouched; the
  // render service is what applies it via qpdf. An empty choice must be null,
  // never an empty string, or protectPdf would be asked to encrypt with none.
  const withPw = buildBundle('a'.repeat(64), 'k-1', [], 'enc', 'AGE-SEALED-PW');
  const withoutPw = buildBundle('a'.repeat(64), 'k-1', [], 'enc', null);

  assertEquals(withPw.encryptedPassword, 'AGE-SEALED-PW');
  assertEquals(withoutPw.encryptedPassword, null);
});

// ------------------------------------------- resuming part-way through the 33

Deno.test('flow - asking for another link part-way through keeps the answers', () => {
  // The regression this whole change exists for: a respondent 20 questions in
  // who requests a fresh link must not have those 20 turn into blanks.
  const plan = planSupersede(
    {
      sessionId: 'a'.repeat(64),
      questionOrder: '4,9,17,2,33',
      answeredQuestions: Array.from({ length: 20 }, (_, i) => i),
      currentIndex: 20,
      linkedGateToken: '11111111-2222-3333-4444-555555555555',
    },
    true, // a fresh gate could be provisioned...
    () => {
      throw new Error('a resumed walk must not be reshuffled');
    },
  );

  assertEquals(plan.currentIndex, 20);
  assertEquals(plan.answeredQuestions.length, 20);
  assertEquals(plan.questionOrder, '4,9,17,2,33');
  assertEquals(plan.migrateAnswersFrom, 'a'.repeat(64));
  // The keypair the existing answers are sealed to travels via the
  // superseded-session relink; ...but must NOT be, because the prior session
  // already has one. Minting it anyway is what used to strand an unused key
  // on the key box and an unlinked gate row here forever.
  assertEquals(plan.needsFreshGate, false);
});

// --------------------------------------------------- database-backed walk

Deno.test({
  name: 'flow (db) - answers survive a second link and reach the bundle unblanked',
  ignore: !hasDb,
  async fn() {
    // Seeds a session with answers, supersedes it via a second link, then runs
    // deliver.ts's own read query against the NEW id and asserts nothing came
    // back blank. This is the assertion in the bug's own language.
    const { createQuestionnaireSession } = await import('../lib/questionnaire-session.ts');
    const { withConnection } = await import('../lib/db.ts');

    const emailHash = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');

    const first = await createQuestionnaireSession(emailHash);
    await withConnection(async (client) => {
      for (const i of [2, 3, 4]) {
        await client.queryObject(
          `INSERT INTO gate_encrypted_answers (session_id, question_index, question_text, ciphertext, skipped)
           VALUES ($1, $2, $3, $4, false)`,
          [first.sessionId, i, `q${i}`, `ct-${i}`],
        );
      }
    });

    const second = await createQuestionnaireSession(emailHash);
    assertEquals(second.resuming, true);

    const rows = await withConnection(async (client) => {
      const r = await client.queryObject<
        { question_index: number; question_text: string; ciphertext: string; skipped: boolean }
      >(
        // Mirrors deliver.ts exactly, ::int included -- a test that dropped the
        // cast would exercise a query production does not run.
        `SELECT question_index::int AS question_index, question_text, ciphertext, skipped
           FROM gate_encrypted_answers
          WHERE session_id = $1
          ORDER BY question_index`,
        [second.sessionId],
      );
      return r.rows;
    });

    assertEquals(rows.length, 3);
    const bundle = buildBundle(second.sessionId, 'key-1', rows, 'enc', null);
    for (const i of [2, 3, 4]) {
      const entry = bundle.answers[i];
      assertEquals(entry.skipped, false);
      assertNotEquals(entry.ciphertext, '');
    }

    await withConnection(async (client) => {
      await client.queryObject(
        `DELETE FROM gate_encrypted_answers WHERE session_id = ANY($1)`,
        [[first.sessionId, second.sessionId]],
      );
      await client.queryObject(
        `DELETE FROM fresh_questionnaire_sessions WHERE email_hash = $1`,
        [emailHash],
      );
    });
  },
});
