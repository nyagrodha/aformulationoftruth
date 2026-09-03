/**
 * What happens to a respondent's work when they ask for a second magic link.
 *
 * An issued resume token is unrecoverable server-side -- session_id IS its HMAC
 * and the token is never stored -- so a fresh link means a fresh session. That
 * is forced. What is NOT forced is abandoning the answers already given, and
 * until now that is what happened: the old session was marked completed, its
 * ciphertext left stranded under an id nothing reads, and the respondent
 * restarted at question zero in a freshly shuffled order. Their earlier answers
 * then arrived in the PDF as blanks, indistinguishable from questions they had
 * chosen to skip.
 *
 * planSupersede is the decision, separated from the transaction so it can be
 * tested without a database -- the same shape as recipientsForSession.
 *
 * Run with: deno task test
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { planSupersede, type PriorSession } from '../lib/questionnaire-session.ts';

const prior = (over: Partial<PriorSession> = {}): PriorSession => ({
  sessionId: 'a'.repeat(64),
  questionOrder: '9,4,17,2,33',
  answeredQuestions: [9, 4],
  currentIndex: 2,
  linkedGateToken: '11111111-2222-3333-4444-555555555555',
  ...over,
});

/** A shuffle that must never run while resuming. */
const never = (): string => {
  throw new Error('shuffle must not be consulted when resuming');
};

Deno.test('planSupersede - a first-time respondent gets a freshly shuffled order', () => {
  assertEquals(planSupersede(null, 'gt', () => '5,1,2').questionOrder, '5,1,2');
});

Deno.test('planSupersede - a first-time respondent starts at zero with nothing answered', () => {
  const plan = planSupersede(null, 'gt', () => '5,1,2');
  assertEquals(plan.currentIndex, 0);
  assertEquals(plan.answeredQuestions, []);
  assertEquals(plan.resuming, false);
});

Deno.test('planSupersede - resuming carries the prior question order verbatim', () => {
  assertEquals(planSupersede(prior(), 'gt2', never).questionOrder, '9,4,17,2,33');
});

Deno.test('planSupersede - resuming never reshuffles', () => {
  // Reshuffling mid-questionnaire re-points current_index at a different
  // question, so the next answer is filed against one the respondent was never
  // shown. `never` throws if the shuffle is consulted at all.
  const plan = planSupersede(prior(), 'gt2', never);
  assertEquals(plan.resuming, true);
});

Deno.test('planSupersede - resuming carries answered_questions forward', () => {
  assertEquals(planSupersede(prior(), 'gt2', never).answeredQuestions, [9, 4]);
});

Deno.test('planSupersede - resuming carries current_index forward', () => {
  assertEquals(planSupersede(prior(), 'gt2', never).currentIndex, 2);
});

Deno.test('planSupersede - resuming names the prior session as the answers source', () => {
  const plan = planSupersede(prior(), 'gt2', never);
  assertEquals(plan.migrateAnswersFrom, 'a'.repeat(64));
  assertEquals(plan.supersededSessionId, 'a'.repeat(64));
});

Deno.test('planSupersede - a first-time respondent moves nothing', () => {
  const plan = planSupersede(null, 'gt', () => '0,1');
  assertEquals(plan.migrateAnswersFrom, null);
  assertEquals(plan.supersededSessionId, null);
});

Deno.test('planSupersede - resuming keeps the ORIGINAL gate row, not the freshly minted one', () => {
  // The carried ciphertext is sealed to the original session_pubkey. Linking
  // the newly minted gate row instead would hand the key box an identity that
  // opens the newest answers and none of the older ones -- turning "answers
  // missing" into "answers present and undecryptable".
  assertEquals(
    planSupersede(prior(), 'gt2', never).gateTokenToLink,
    '11111111-2222-3333-4444-555555555555',
  );
});

Deno.test('planSupersede - a prior session with no gate link falls back to the fresh gate token', () => {
  assertEquals(
    planSupersede(prior({ linkedGateToken: null }), 'gt2', never).gateTokenToLink,
    'gt2',
  );
});

Deno.test('planSupersede - the magic-link path with no gate token links nothing', () => {
  assertEquals(planSupersede(null, undefined, () => '0,1').gateTokenToLink, null);
  assertEquals(
    planSupersede(prior({ linkedGateToken: null }), undefined, never).gateTokenToLink,
    null,
  );
});

Deno.test('planSupersede - a prior session with zero answers still carries its order and link', () => {
  // An empty session is not a new one: its gate row already holds the key
  // generation the respondent's next answers must be sealed to.
  const plan = planSupersede(
    prior({ answeredQuestions: [], currentIndex: 0 }),
    'gt2',
    never,
  );
  assertEquals(plan.questionOrder, '9,4,17,2,33');
  assertEquals(plan.gateTokenToLink, '11111111-2222-3333-4444-555555555555');
});

Deno.test('planSupersede - does not alias the prior session answered array', () => {
  const p = prior();
  const plan = planSupersede(p, 'gt2', never);
  plan.answeredQuestions.push(99);
  assertEquals(p.answeredQuestions, [9, 4]);
  assert(plan.answeredQuestions.length === 3);
});
