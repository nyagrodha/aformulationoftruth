import { questionService } from '../../server/services/questionService';

const FIXED_IDS = [1, 2, 3, 18, 34];
const RANDOM_IDS = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32, 33, 35,
];

describe('questionService.generateQuestionOrder', () => {
  it('places fixed anchor questions in required positions', () => {
    const order = questionService.generateQuestionOrder();

    expect(order).toHaveLength(35);
    expect(order.slice(0, 3)).toEqual([1, 2, 3]);
    expect(order[16]).toBe(18);
    expect(order[34]).toBe(34);
  });

  it('includes every questionnaire item exactly once', () => {
    const order = questionService.generateQuestionOrder();
    const uniqueIds = new Set(order);

    expect(order).toHaveLength(uniqueIds.size);
    expect(uniqueIds.size).toBe(35);
    expect(FIXED_IDS.every(id => uniqueIds.has(id))).toBe(true);
    expect(RANDOM_IDS.every(id => uniqueIds.has(id))).toBe(true);
  });

  it('keeps random questions separated into the two randomized segments', () => {
    const order = questionService.generateQuestionOrder();
    const firstRandomSegment = order.slice(3, 16);
    const secondRandomSegment = order.slice(17, 34);

    firstRandomSegment.forEach(id => {
      expect(RANDOM_IDS).toContain(id);
    });
    secondRandomSegment.forEach(id => {
      expect(RANDOM_IDS).toContain(id);
    });

    // Ensure no fixed question leaks into random blocks
    FIXED_IDS.forEach(id => {
      expect(firstRandomSegment).not.toContain(id);
      expect(secondRandomSegment).not.toContain(id);
    });
  });
});
