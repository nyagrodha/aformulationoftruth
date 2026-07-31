/**
 * Questionnaire Utilities
 *
 * Fisher-Yates shuffle for question randomization.
 * Questions 0-1 are gate questions (served first, in order).
 * Questions 2-34 are shuffled for each session.
 */

/**
 * Fisher-Yates shuffle algorithm.
 * Cryptographically random using Web Crypto API.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  const randomValues = crypto.getRandomValues(new Uint32Array(result.length));

  for (let i = result.length - 1; i > 0; i--) {
    // Use modulo for fair distribution (slight bias acceptable for our use case)
    const j = randomValues[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Generate question order for a questionnaire session.
 *
 * If gate questions (0, 1) were already answered, they're excluded
 * and only Q2-34 are shuffled. If not, all 35 questions are shuffled
 * together — the user gets Q0,Q1 mixed into the flow naturally.
 *
 * @param hasGateAnswers - true if Q0 and Q1 already answered via /gate
 * @returns Array of question indices in presentation order.
 */
export function generateQuestionOrder(hasGateAnswers = true): number[] {
  if (hasGateAnswers) {
    // Normal flow: gate questions done, shuffle Q2-34
    const shuffleableQuestions = Array.from({ length: 33 }, (_, i) => i + 2);
    return shuffle(shuffleableQuestions);
  }

  // No gate answers: shuffle all 35 questions together
  const allQuestions = Array.from({ length: 35 }, (_, i) => i);
  return shuffle(allQuestions);
}

/**
 * Generate question order as a compact string.
 * Format: comma-separated indices.
 */
export function generateQuestionOrderString(hasGateAnswers = true): string {
  return generateQuestionOrder(hasGateAnswers).join(',');
}

/**
 * Parse question order from string.
 */
export function parseQuestionOrder(orderString: string): number[] {
  return orderString.split(',').map((s) => parseInt(s.trim(), 10));
}

/**
 * Validate a question order.
 * Either 33 questions (Q2-34, gate done) or 35 questions (all, no gate).
 * Each question index must appear exactly once.
 */
export function isValidQuestionOrder(order: number[]): boolean {
  if (order.length !== 33 && order.length !== 35) return false;

  const seen = new Set<number>();
  for (const q of order) {
    if (q < 0 || q > 34 || seen.has(q)) return false;
    // 33-question orders must not contain gate questions
    if (order.length === 33 && q < 2) return false;
    seen.add(q);
  }

  return seen.size === order.length;
}

/**
 * Reorder answers according to canonical order.
 * Takes answers in shuffled order, returns in question number order.
 */
export function canonicalizeAnswers(
  answers: Record<string, unknown>,
  presentationOrder: number[]
): Record<number, unknown> {
  const canonical: Record<number, unknown> = {};

  presentationOrder.forEach((questionNum, _index) => {
    const key = `q${questionNum}`;
    if (key in answers) {
      canonical[questionNum] = answers[key];
    }
  });

  return canonical;
}
