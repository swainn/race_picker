import { describe, expect, it } from 'vitest';
import { shuffle } from './array';

describe('shuffle', () => {
  it('returns a permutation of the input without mutating it', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const copy = [...input];
    const out = shuffle(input);
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
  });

  it('is roughly uniform: each element reaches each position', () => {
    // The first position is what fairness-critical picks read (pickVictim,
    // pickDuelists), so check its distribution over many shuffles.
    const N = 5;
    const trials = 20000;
    const firstCounts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const first = shuffle([0, 1, 2, 3, 4])[0];
      firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    }
    const expected = trials / N;
    for (let v = 0; v < N; v++) {
      const count = firstCounts.get(v) ?? 0;
      // ±10% of expectation is generous: >5 sigma for this sample size.
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});
