/**
 * Question-order invariants.
 *
 * Every session stores a permutation of the questionnaire. If gate questions
 * leak into a post-gate order, the respondent is asked Q0/Q1 again; if an
 * index is dropped, canonicalizeAnswers silently omits an answer and the
 * PDF looks complete. These are the checks the magic-link "doc" tests
 * described but never ran.
 *
 *   deno test lib/questionnaire_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import {
  canonicalizeAnswers,
  generateQuestionOrder,
  generateQuestionOrderString,
  isValidQuestionOrder,
  parseQuestionOrder,
} from './questionnaire.ts';

Deno.test('generateQuestionOrder(true) is Q2–Q34, each once, never a gate question', () => {
  const order = generateQuestionOrder(true);
  assertEquals(order.length, 33);
  assert(isValidQuestionOrder(order));
  assertEquals([...order].sort((a, b) => a - b), Array.from({ length: 33 }, (_, i) => i + 2));
  assertEquals(order.includes(0), false);
  assertEquals(order.includes(1), false);
});

Deno.test('generateQuestionOrder(false) is all 35 indices, each once', () => {
  const order = generateQuestionOrder(false);
  assertEquals(order.length, 35);
  assert(isValidQuestionOrder(order));
  assertEquals([...order].sort((a, b) => a - b), Array.from({ length: 35 }, (_, i) => i));
});

Deno.test('two sessions get different shuffles (almost surely)', () => {
  const a = generateQuestionOrderString(true);
  const b = generateQuestionOrderString(true);
  // 33! is large enough that a collision here is a broken RNG, not flakiness.
  assert(a !== b, 'Fisher–Yates with Web Crypto must not emit a fixed order');
});

Deno.test('parseQuestionOrder round-trips the compact string', () => {
  const order = generateQuestionOrder(true);
  assertEquals(parseQuestionOrder(order.join(',')), order);
});

Deno.test('isValidQuestionOrder rejects duplicates, holes, and gate questions in a 33-length order', () => {
  assertEquals(isValidQuestionOrder([2, 3, 3, ...Array.from({ length: 30 }, (_, i) => i + 4)]), false);
  assertEquals(isValidQuestionOrder(Array.from({ length: 32 }, (_, i) => i + 2)), false);
  assertEquals(isValidQuestionOrder([0, 1, ...Array.from({ length: 31 }, (_, i) => i + 2)]), false);
  assertEquals(isValidQuestionOrder([-1, ...Array.from({ length: 32 }, (_, i) => i + 2)]), false);
});

Deno.test('canonicalizeAnswers reorders by question number, not presentation', () => {
  const presentation = [7, 2, 34];
  const answers = { q7: 'seven', q2: 'two', q34: 'last' };
  assertEquals(canonicalizeAnswers(answers, presentation), {
    7: 'seven',
    2: 'two',
    34: 'last',
  });
});
