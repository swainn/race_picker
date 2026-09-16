import { describe, expect, it } from 'vitest';
import {
  FIELD_LEFT,
  FIELD_RIGHT,
  PROWL,
  SHIP_MAX_X,
  SHIP_MIN_X,
  newProwl,
  slotX,
  startingSlots,
  stepProwl,
} from './abductionField';

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

describe('opening prowl', () => {
  const DT = 1 / 60;

  /** Run the prowl to ignition; returns where and when the beam lit. */
  function runToIgnition(rand: () => number, startX = (SHIP_MIN_X + SHIP_MAX_X) / 2) {
    const state = newProwl(startX, rand);
    const sweepsOwed = state.sweepsLeft;
    let x = startX;
    let t = 0;
    let crossings = 0;
    for (let i = 0; i < 6000; i++) {
      const before = state.sweepsLeft;
      const out = stepProwl(state, x, DT, rand);
      x = out.x;
      t += DT;
      if (state.sweepsLeft < before) crossings++;
      if (out.ignite) return { x, t, crossings, sweepsOwed };
    }
    throw new Error('prowl never ignited');
  }

  it('keeps the saucer inside the field the whole time', () => {
    const { x } = runToIgnition(Math.random);
    expect(x).toBeGreaterThanOrEqual(SHIP_MIN_X);
    expect(x).toBeLessThanOrEqual(SHIP_MAX_X);
  });

  it('always completes its sweeps before the beam can fire', () => {
    for (let trial = 0; trial < 200; trial++) {
      const { crossings, sweepsOwed } = runToIgnition(Math.random);
      expect(crossings).toBeGreaterThanOrEqual(sweepsOwed);
      expect(sweepsOwed).toBeGreaterThanOrEqual(PROWL.MIN_SWEEPS);
    }
  });

  it('never ignites on the very first frame', () => {
    for (let trial = 0; trial < 200; trial++) {
      const state = newProwl((SHIP_MIN_X + SHIP_MAX_X) / 2);
      expect(stepProwl(state, (SHIP_MIN_X + SHIP_MAX_X) / 2, DT).ignite).toBe(false);
    }
  });

  it('ignites even when the random roll never fires (deadline)', () => {
    const { t } = runToIgnition(() => 0.999);
    expect(t).toBeLessThan(12);
  });

  it('lights the beam at a spread of positions, not one fixed spot', () => {
    // The whole point: the grab must not always start over the same place.
    const spots = new Set<number>();
    for (let trial = 0; trial < 300; trial++) {
      spots.add(Math.round(runToIgnition(Math.random).x / 20));
    }
    expect(spots.size).toBeGreaterThan(3);
  });

  it('does not park over the centre mark when it lights up', () => {
    const centre = (SHIP_MIN_X + SHIP_MAX_X) / 2;
    let nearCentre = 0;
    const trials = 300;
    for (let trial = 0; trial < trials; trial++) {
      if (Math.abs(runToIgnition(Math.random).x - centre) < 25) nearCentre++;
    }
    // A centre band that narrow is ~14% of the field; anything near "always"
    // would mean we reintroduced the bias this change exists to remove.
    expect(nearCentre / trials).toBeLessThan(0.4);
  });
});

describe('startingSlots (still uniform with the prowl in place)', () => {
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
