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
  assertEquals(planSupersede(null, true, () => '5,1,2').questionOrder, '5,1,2');
});

Deno.test('planSupersede - a first-time respondent starts at zero with nothing answered', () => {
  const plan = planSupersede(null, true, () => '5,1,2');
  assertEquals(plan.currentIndex, 0);
  assertEquals(plan.answeredQuestions, []);
  assertEquals(plan.resuming, false);
});

Deno.test('planSupersede - resuming carries the prior question order verbatim', () => {
  assertEquals(planSupersede(prior(), true, never).questionOrder, '9,4,17,2,33');
});

Deno.test('planSupersede - resuming never reshuffles', () => {
  // Reshuffling mid-questionnaire re-points current_index at a different
  // question, so the next answer is filed against one the respondent was never
  // shown. `never` throws if the shuffle is consulted at all.
  const plan = planSupersede(prior(), true, never);
  assertEquals(plan.resuming, true);
});

Deno.test('planSupersede - resuming carries answered_questions forward', () => {
  assertEquals(planSupersede(prior(), true, never).answeredQuestions, [9, 4]);
});

Deno.test('planSupersede - resuming carries current_index forward', () => {
  assertEquals(planSupersede(prior(), true, never).currentIndex, 2);
});

Deno.test('planSupersede - resuming names the prior session as the answers source', () => {
  const plan = planSupersede(prior(), true, never);
  assertEquals(plan.migrateAnswersFrom, 'a'.repeat(64));
  assertEquals(plan.supersededSessionId, 'a'.repeat(64));
});

Deno.test('planSupersede - a first-time respondent moves nothing', () => {
  const plan = planSupersede(null, true, () => '0,1');
  assertEquals(plan.migrateAnswersFrom, null);
  assertEquals(plan.supersededSessionId, null);
});

Deno.test('planSupersede - a first-time respondent with a gate submission needs a fresh gate', () => {
  assertEquals(planSupersede(null, true, () => '0,1').needsFreshGate, true);
});

Deno.test('planSupersede - resuming with a linked gate row provisions NOTHING', () => {
  // The carried ciphertext is sealed to the original session_pubkey, and
  // getSessionPubkey resolves exactly one pubkey per session -- a second
  // keypair could never open anything this session will deliver. Under the
  // eager scheme that keypair was minted anyway and orphaned: its identity
  // sat on the key box for the 30-day shred window, and its gate row and
  // Q0-Q1 ciphertext (undeletable by the runtime role, migration 007) sat
  // in Postgres forever. Deciding "no fresh gate" here, before any key
  // material exists, is the fix: nothing is minted, so nothing can leak.
  assertEquals(planSupersede(prior(), true, never).needsFreshGate, false);
});

Deno.test('planSupersede - a prior session with no gate link accepts a fresh one', () => {
  // The magic-link-only prior: its answers were sealed to the gate default,
  // so a fresh per-session keypair is still worth provisioning and linking.
  assertEquals(
    planSupersede(prior({ linkedGateToken: null }), true, never).needsFreshGate,
    true,
  );
});

Deno.test('planSupersede - the magic-link path with no gate on offer provisions nothing', () => {
  assertEquals(planSupersede(null, false, () => '0,1').needsFreshGate, false);
  assertEquals(
    planSupersede(prior({ linkedGateToken: null }), false, never).needsFreshGate,
    false,
  );
});

Deno.test('planSupersede - a prior session with zero answers still resumes without a fresh gate', () => {
  // An empty session is not a new one: its gate row already holds the key
  // generation the respondent's next answers must be sealed to.
  const plan = planSupersede(
    prior({ answeredQuestions: [], currentIndex: 0 }),
    true,
    never,
  );
  assertEquals(plan.questionOrder, '9,4,17,2,33');
  assertEquals(plan.needsFreshGate, false);
});

Deno.test('planSupersede - does not alias the prior session answered array', () => {
  const p = prior();
  const plan = planSupersede(p, true, never);
  plan.answeredQuestions.push(99);
  assertEquals(p.answeredQuestions, [9, 4]);
  assert(plan.answeredQuestions.length === 3);
});
