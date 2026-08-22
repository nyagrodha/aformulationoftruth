/**
 * Question order presentation.
 *
 * Regression cover for the `.slice(2)` in routes/questionnaire.tsx, which
 * dropped two questions from every gate-answered session for the whole life of
 * the feature. Nothing surfaced it: the questionnaire simply ended two
 * questions early and no count anywhere was checked against 35.
 *
 * Run with: deno task test
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  generateQuestionOrderString,
  isValidQuestionOrder,
  presentationOrder,
} from '../lib/questionnaire.ts';

Deno.test('presentationOrder - a gate-answered order is presented whole', () => {
  const stored = generateQuestionOrderString(true);
  const { order, answeredAtGate, total } = presentationOrder(stored);

  assertEquals(order.length, 33, 'all 33 post-gate questions must be presented');
  assertEquals(answeredAtGate, 2);
  assertEquals(total, 35, 'the respondent is promised 35 questions');
});

Deno.test('presentationOrder - no question is dropped from a gate-answered order', () => {
  const stored = generateQuestionOrderString(true);
  const { order } = presentationOrder(stored);

  // The exact failure the slice caused: two questions never asked.
  assertEquals(new Set(order).size, 33);
  for (let q = 2; q <= 34; q++) {
    assertEquals(order.includes(q), true, `question ${q} must be presented`);
  }
});

Deno.test('presentationOrder - a gate-skipped order keeps its gate questions', () => {
  const stored = generateQuestionOrderString(false);
  const { order, answeredAtGate, total } = presentationOrder(stored);

  assertEquals(order.length, 35);
  assertEquals(answeredAtGate, 0, 'nothing was answered at the gate');
  assertEquals(total, 35);
  // Q0 and Q1 are shuffled INTO this order rather than sitting at the front,
  // which is why slicing the first two was wrong here too.
  assertEquals(order.includes(0), true);
  assertEquals(order.includes(1), true);
});

Deno.test('presentationOrder - both shapes the generator emits are valid orders', () => {
  for (const hasGate of [true, false]) {
    const { order } = presentationOrder(generateQuestionOrderString(hasGate));
    assertEquals(isValidQuestionOrder(order), true);
  }
});
