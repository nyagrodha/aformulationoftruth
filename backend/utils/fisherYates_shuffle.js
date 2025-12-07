/**
 * Fisher-Yates (Knuth) Shuffle Algorithm
 *
 * Ensures uniform random distribution with O(n) time complexity.
 * This is the modern, unbiased version of the algorithm.
 *
 * @param {Array} array - Array to shuffle
 * @returns {Array} - New shuffled array (original unchanged)
 *
 * @example
 * const questions = [1, 2, 3, 4, 5];
 * const shuffled = fisherYatesShuffle(questions);
 * // shuffled might be: [3, 1, 5, 2, 4]
 * // original questions array remains unchanged
 */
export function fisherYatesShuffle(array) {
  // Create a copy to avoid mutating the original
  const shuffled = [...array];

  // Fisher-Yates algorithm: iterate backwards through array
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Generate random index from 0 to i (inclusive)
    const j = Math.floor(Math.random() * (i + 1));

    // Swap elements at positions i and j
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Create a shuffled array of indices
 * Useful for maintaining reference to original positions
 *
 * @param {number} length - Length of array
 * @returns {Array<number>} - Shuffled array of indices [0, 1, 2, ...]
 *
 * @example
 * const indices = shuffleIndices(5);
 * // indices might be: [2, 4, 0, 3, 1]
 */
export function shuffleIndices(length) {
  const indices = Array.from({ length }, (_, i) => i);
  return fisherYatesShuffle(indices);
}

/**
 * Test function to verify uniform distribution
 * Run this in development to verify shuffle quality
 *
 * @param {number} iterations - Number of shuffles to test
 * @returns {Object} - Statistics about distribution
 */
export function testShuffleUniformity(iterations = 10000) {
  const testArray = [0, 1, 2, 3, 4];
  const positionCounts = Array(5).fill(0).map(() => Array(5).fill(0));

  for (let i = 0; i < iterations; i++) {
    const shuffled = fisherYatesShuffle(testArray);
    shuffled.forEach((value, position) => {
      positionCounts[value][position]++;
    });
  }

  // Each element should appear at each position ~20% of the time
  const expectedFrequency = iterations / 5;
  const tolerance = expectedFrequency * 0.1; // 10% tolerance

  let isUniform = true;
  positionCounts.forEach((counts, element) => {
    counts.forEach((count, position) => {
      const deviation = Math.abs(count - expectedFrequency);
      if (deviation > tolerance) {
        isUniform = false;
      }
    });
  });

  return {
    iterations,
    expectedFrequency,
    tolerance,
    isUniform,
    positionCounts,
  };
}
