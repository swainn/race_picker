import { describe, expect, it } from 'vitest';
import { FIELD_LEFT, FIELD_RIGHT, slotX, startingSlots } from './abductionField';

describe('slotX', () => {
  it('keeps every mark inside the field', () => {
    for (const count of [1, 2, 7, 20]) {
      for (let slot = 0; slot < count; slot++) {
        const x = slotX(slot, count);
        expect(x).toBeGreaterThanOrEqual(FIELD_LEFT);
        expect(x).toBeLessThanOrEqual(FIELD_RIGHT);
      }
    }
  });

  it('spaces the marks out in order', () => {
    const xs = Array.from({ length: 6 }, (_, i) => slotX(i, 6));
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });
});

describe('startingSlots', () => {
  it('hands out every mark exactly once', () => {
    for (const count of [1, 2, 9, 20]) {
      const slots = startingSlots(count);
      expect(slots).toHaveLength(count);
      expect([...slots].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i)
      );
    }
  });

  // Fairness: the saucer hunts the centre of the field first, so if list order
  // decided who stood there the middle of the list would win most rounds.
  it('gives every participant an equal shot at the centre mark (fairness)', () => {
    const count = 10;
    const trials = 16000;
    const centre = Math.floor(count / 2);
    const centreWins = new Array<number>(count).fill(0);

    for (let t = 0; t < trials; t++) {
      const slots = startingSlots(count);
      for (let participant = 0; participant < count; participant++) {
        if (slots[participant] === centre) centreWins[participant]++;
      }
    }

    const expected = trials / count;
    for (const wins of centreWins) {
      expect(wins).toBeGreaterThan(expected * 0.85);
      expect(wins).toBeLessThan(expected * 1.15);
    }
  });

  it('is uniform across every mark, not just the centre (fairness)', () => {
    const count = 6;
    const trials = 12000;
    const grid = Array.from({ length: count }, () => new Array<number>(count).fill(0));

    for (let t = 0; t < trials; t++) {
      startingSlots(count).forEach((slot, participant) => {
        grid[participant][slot]++;
      });
    }

    const expected = trials / count;
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).toBeGreaterThan(expected * 0.85);
        expect(cell).toBeLessThan(expected * 1.15);
      }
    }
  });
});
