/**
 * The questionnaire text exists in four places. Answers are stored with the
 * copy from answer.ts / gate_encrypt.ts, the landing page labels the copy from
 * gate_encrypt.ts, and the Tamil dataset is what /gate renders. They drifted
 * once already in adjacent files (the bounce codes on the landing form). A
 * mismatch here is worse: the ciphertext is labelled with the wrong question.
 *
 *   deno test --allow-read lib/questions_contract_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { GATE_QUESTIONS } from './gate_encrypt.ts';
import {
  getGateQuestions,
  getQuestionById,
  getShuffleableQuestions,
  QUESTIONS,
  toTamilNumeral,
} from './questions_dakshinaparvanuvadam.ts';

function quotedStringsInArray(source: string, startMarker: string): string[] {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing ${startMarker}`);
  const from = source.indexOf('[', start);
  const to = source.indexOf('];', from);
  assert(from >= 0 && to > from, `could not bound the array after ${startMarker}`);
  return [...source.slice(from, to).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

Deno.test('the dataset is 35 questions, ids 0–34, each once', () => {
  assertEquals(QUESTIONS.length, 35);
  assertEquals(QUESTIONS.map((q) => q.id), Array.from({ length: 35 }, (_, i) => i));
});

Deno.test('exactly questions 0 and 1 are the gate', () => {
  assertEquals(getGateQuestions().map((q) => q.id), [0, 1]);
  assertEquals(getShuffleableQuestions().map((q) => q.id), Array.from({ length: 33 }, (_, i) => i + 2));
  assertEquals(QUESTIONS.filter((q) => q.isGate).map((q) => q.id), [0, 1]);
});

Deno.test('the gate client encrypts the same English the dataset names', () => {
  assertEquals([...GATE_QUESTIONS], [QUESTIONS[0].english, QUESTIONS[1].english]);
});

Deno.test('Q2–Q34 stored through /api/questions/answer carry the dataset English', async () => {
  const source = await Deno.readTextFile(new URL('../routes/api/questions/answer.ts', import.meta.url));
  assertEquals(quotedStringsInArray(source, 'const QUESTIONS ='), QUESTIONS.map((q) => q.english));
});

Deno.test('the /questionnaire page asks the same 35 questions', async () => {
  const source = await Deno.readTextFile(new URL('../routes/questionnaire.tsx', import.meta.url));
  assertEquals(quotedStringsInArray(source, 'const QUESTIONS ='), QUESTIONS.map((q) => q.english));
});

Deno.test('getQuestionById round-trips every index and nothing else', () => {
  for (let i = 0; i < 35; i++) {
    assertEquals(getQuestionById(i)?.id, i);
  }
  assertEquals(getQuestionById(35), undefined);
  assertEquals(getQuestionById(-1), undefined);
});

Deno.test('toTamilNumeral writes digits, and refuses a non-integer', () => {
  assertEquals(toTamilNumeral(0), '௦');
  assertEquals(toTamilNumeral(1), '௧');
  assertEquals(toTamilNumeral(10), '௧௦');
  assertEquals(toTamilNumeral(35), '௩௫');
  assertEquals(QUESTIONS[9].tamilNumeral, toTamilNumeral(10));
});

Deno.test('toTamilNumeral throws on a negative or fractional input', () => {
  let negative = false;
  try {
    toTamilNumeral(-1);
  } catch (e) {
    negative = e instanceof RangeError;
  }
  let fractional = false;
  try {
    toTamilNumeral(1.5);
  } catch (e) {
    fractional = e instanceof RangeError;
  }
  assertEquals(negative, true);
  assertEquals(fractional, true);
});
