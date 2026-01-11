/**
 * Fisher-Yates shuffle algorithm
 * Randomly shuffles an array in place with uniform distribution
 *
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference, modified in place)
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const arr = [...array]; // Create a copy to avoid mutating original

  for (let i = arr.length - 1; i > 0; i--) {
    // Generate random index from 0 to i (inclusive)
    const j = Math.floor(Math.random() * (i + 1));

    // Swap elements at i and j
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

/**
 * Creates a shuffled array of question IDs (0 to count-1)
 * @param count - Total number of questions
 * @returns Shuffled array of question IDs
 */
export function generateShuffledQuestionOrder(count: number): number[] {
  const questionIds = Array.from({ length: count }, (_, i) => i);
  return fisherYatesShuffle(questionIds);
}
