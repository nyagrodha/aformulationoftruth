/**
 * buildBundle across TWO session ids: the fix for the blank first two answers.
 *
 * Questions 0 and 1 are written by /api/gate-submit before a questionnaire
 * session exists, so they are filed in gate_encrypted_answers under the
 * gate_token. Everything from question 2 onward is filed under the session id.
 * The delivery query used to select only the latter, found 33 rows, and left
 * buildBundle to synthesise the first two as empty and skipped -- which the key
 * box then printed as two numbered blanks in every PDF ever produced.
 *
 * The query now reads `WHERE session_id = $1 OR session_id = $2`. These tests
 * pin the shape that produces: the rows arrive as one list, indices 0 and 1
 * among them, and buildBundle must carry them through like any other answer.
 *
 * Pure function, no database, no network, no mail.
 *
 * Run with: deno task test tests/deliver_bundle_gate_test.ts
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ANSWER_QUERY, buildBundle, CANONICAL_COUNT } from '../routes/api/responses/deliver.ts';

interface Row {
  question_index: number;
  question_text: string;
  ciphertext: string;
  skipped: boolean;
}

/** The two rows the gate wrote, filed under gate_token rather than the session id. */
const gateRows: Row[] = [
  { question_index: 0, question_text: 'gate q0', ciphertext: 'age-ct-gate-0', skipped: false },
  { question_index: 1, question_text: 'gate q1', ciphertext: 'age-ct-gate-1', skipped: false },
];

/** Questions 2..34, filed under the session id. */
const sessionRows: Row[] = Array.from({ length: CANONICAL_COUNT - 2 }, (_, i) => ({
  question_index: i + 2,
  question_text: `q${i + 2}`,
  ciphertext: `age-ct-${i + 2}`,
  skipped: false,
}));

Deno.test({
  name: 'buildBundle - the two gate answers survive when both session ids are selected',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // The order the widened SELECT returns: ORDER BY question_index, so the
    // gate rows lead even though they live under a different session_id.
    const bundle = buildBundle('sess-1', [...gateRows, ...sessionRows], 'enc-email', null);

    assertEquals(bundle.answers.length, CANONICAL_COUNT);

    const q0 = bundle.answers[0];
    const q1 = bundle.answers[1];
    assertEquals(q0.ciphertext, 'age-ct-gate-0');
    assertEquals(q0.skipped, false, 'question 0 came from the gate row, not from synthesis');
    assertEquals(q0.questionText, 'gate q0');
    assertEquals(q1.ciphertext, 'age-ct-gate-1');
    assertEquals(q1.skipped, false, 'question 1 came from the gate row, not from synthesis');
    assertEquals(q1.questionText, 'gate q1');

    // With all 35 present nothing at all should be synthesised.
    assertEquals(bundle.answers.filter((a) => a.ciphertext === '').length, 0);
    assertEquals(bundle.answers.filter((a) => a.skipped).length, 0);
  },
});

Deno.test({
  name: 'buildBundle - without the gate rows, questions 0 and 1 synthesise blank (what the narrow SELECT produced)',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // This is exactly what the single-id SELECT handed in: 33 rows, indices
    // 2..34. The assertion is the counterfactual for the test above -- it is
    // what every delivered PDF contained before the query was widened.
    const bundle = buildBundle('sess-1', sessionRows, 'enc-email', null);

    assertEquals(bundle.answers.length, CANONICAL_COUNT);
    assertEquals(bundle.answers[0].ciphertext, '');
    assertEquals(bundle.answers[0].skipped, true);
    assertEquals(bundle.answers[1].ciphertext, '');
    assertEquals(bundle.answers[1].skipped, true);
    // The synthesised entries still carry their question text, so the blank was
    // a numbered blank rather than an unexplained gap.
    assert(bundle.answers[0].questionText.length > 0);
    assert(bundle.answers[1].questionText.length > 0);
  },
});

Deno.test({
  name: 'buildBundle - refuses an index that arrives from both session ids at once',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // Widening the SELECT to two ids widened the ways a question index can
    // arrive twice: a gate row and a session row can both claim question 0 if
    // the gate answer was ever rewritten under the session id. That is a real
    // inconsistency in the store and must stop the delivery, not silently pick
    // one ciphertext over the other.
    const collided: Row[] = [
      ...gateRows,
      ...sessionRows,
      { question_index: 0, question_text: 'gate q0', ciphertext: 'age-ct-rewritten', skipped: false },
    ];
    assertThrows(
      () => buildBundle('sess-1', collided, 'enc-email', null),
      Error,
      'duplicate answer for question 0',
    );
  },
});

Deno.test({
  name: 'buildBundle - output is ordered by question index whatever order the rows arrive in',
  sanitizeResources: false,
  sanitizeOps: false,
  fn() {
    // Do not rely on the SELECT's ORDER BY: put the gate rows last and shuffle
    // the rest, which is what a union of two id sets can look like if the
    // ordering is ever dropped or the rows are assembled in two passes.
    const scrambled = [...sessionRows].reverse().concat(gateRows);
    const bundle = buildBundle('sess-1', scrambled, 'enc-email', null);

    assertEquals(
      bundle.answers.map((a) => a.questionIndex),
      Array.from({ length: CANONICAL_COUNT }, (_, i) => i),
    );
    // And the ciphertext travelled with its index rather than its position.
    assertEquals(bundle.answers[0].ciphertext, 'age-ct-gate-0');
    assertEquals(bundle.answers[1].ciphertext, 'age-ct-gate-1');
    assertEquals(bundle.answers[34].ciphertext, 'age-ct-34');
  },
});

/**
 * The three tests above characterise buildBundle, and buildBundle is byte-for-
 * byte unchanged by the fix: it filled gaps before and it fills them now. Feed
 * it 35 rows and it emits 35 answers whichever SELECT produced them, so none of
 * them can tell a widened query from a narrow one. The fix lives in the SQL,
 * now exported as ANSWER_QUERY, so this asserts a value rather than searching
 * formatted source text -- which would fail on a reflow that changes nothing.
 */
Deno.test({
  name: 'deliver - the answer query still spans both the session id and the gate token',
  fn() {
    const flat = ANSWER_QUERY.replace(/\s+/g, ' ');
    assert(
      /WHERE session_id = \$[12] OR session_id = \$[12]/.test(flat),
      'the answer query must select both ids, or questions 0 and 1 go blank again',
    );
  },
});

/**
 * The bind order is not visible in ANSWER_QUERY itself -- $1 and $2 are
 * positional -- so this stays a source check for the call site, which is
 * still unexported. Narrower than the query text: it looks only at how the
 * two ids are bound, not at formatting around them.
 */
Deno.test({
  name: 'deliver - the answer query binds the session id and the gate token, in that order',
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const source = await Deno.readTextFile(new URL('../routes/api/responses/deliver.ts', import.meta.url));
    const flat = source.replace(/\s+/g, ' ');

    assert(
      flat.includes('[session.sessionId, row.gate_token]'),
      'the second bind must be the gate token the gate answers were filed under',
    );
    // The gate token has to be read back before it can be bound.
    assert(
      flat.includes('SELECT gate_token, session_pubkey, encrypted_email'),
      'gate_token must be selected from fresh_gate_responses',
    );
  },
});
