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
 * Structure:
 * - Questions 0, 1: Gate questions (always first, in order)
 * - Questions 2-34: Shuffled using Fisher-Yates
 *
 * Returns array of question indices in presentation order.
 */
export function generateQuestionOrder(): number[] {
  // Gate questions first
  const gateQuestions = [0, 1];

  // Questions 2-34 to be shuffled
  const shuffleableQuestions = Array.from({ length: 33 }, (_, i) => i + 2);

  // Shuffle the remaining questions
  const shuffled = shuffle(shuffleableQuestions);

  return [...gateQuestions, ...shuffled];
}

/**
 * Generate question order as a compact string.
 * Format: comma-separated indices.
 */
export function generateQuestionOrderString(): string {
  return generateQuestionOrder().join(',');
}

/**
 * Parse question order from string.
 */
export function parseQuestionOrder(orderString: string): number[] {
  return orderString.split(',').map((s) => parseInt(s.trim(), 10));
}

/**
 * Validate a question order.
 * Ensures all questions 0-34 are present exactly once.
 */
export function isValidQuestionOrder(order: number[]): boolean {
  if (order.length !== 35) return false;

  const seen = new Set<number>();
  for (const q of order) {
    if (q < 0 || q > 34 || seen.has(q)) return false;
    seen.add(q);
  }

  return true;
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
