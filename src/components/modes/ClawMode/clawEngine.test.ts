import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import { CLAW, easeInOut, layoutToys, pickChosen, rowsFor } from './clawEngine';

const COUNTS = [1, 2, 5, 6, 7, 12, 13, 20];

describe('layoutToys', () => {
  it('gives every participant exactly one spot', () => {
    for (const count of COUNTS) expect(layoutToys(count)).toHaveLength(count);
    expect(layoutToys(0)).toEqual([]);
  });

  it('keeps every toy inside the glass', () => {
    for (const count of COUNTS) {
      for (const spot of layoutToys(count)) {
        expect(spot.x).toBeGreaterThanOrEqual(CLAW.TOY_L);
        expect(spot.x).toBeLessThanOrEqual(CLAW.TOY_R);
        expect(spot.y).toBeGreaterThan(CLAW.TANK_TOP);
        expect(spot.y).toBeLessThanOrEqual(CLAW.FLOOR_Y);
      }
    }
  });

  it('keeps every toy within reach of the claw rail', () => {
    // A toy the gantry cannot travel to could never be taken.
    for (const count of COUNTS) {
      for (const spot of layoutToys(count)) {
        expect(spot.x).toBeGreaterThanOrEqual(CLAW.RAIL_L);
        expect(spot.x).toBeLessThanOrEqual(CLAW.RAIL_R);
      }
    }
  });

  it('keeps every toy clear of the prize chute', () => {
    // A toy sitting over the hole would be drawn behind the chute mouth.
    for (const count of COUNTS) {
      for (const spot of layoutToys(count)) {
        expect(spot.x).toBeGreaterThan(CLAW.CHUTE_X + CLAW.CHUTE_HALF);
      }
    }
  });

  it('lets the claw reach the chute as well as every toy', () => {
    expect(CLAW.RAIL_L).toBeLessThanOrEqual(CLAW.CHUTE_X);
    expect(CLAW.RAIL_R).toBeGreaterThanOrEqual(CLAW.TOY_R);
  });

  it('adds rows only as the crowd grows', () => {
    expect(rowsFor(6)).toBe(1);
    expect(rowsFor(7)).toBe(2);
    expect(rowsFor(12)).toBe(2);
    expect(rowsFor(13)).toBe(3);
    expect(rowsFor(20)).toBe(3);
  });

  it('puts the front row on the floor and sizes back rows smaller', () => {
    const spots = layoutToys(20);
    const front = spots.filter((s) => s.y === CLAW.FLOOR_Y);
    expect(front.length).toBeGreaterThan(0);
    for (const s of front) expect(s.scale).toBe(1);
    for (const s of spots) {
      expect(s.scale).toBeGreaterThan(0.8);
      expect(s.scale).toBeLessThanOrEqual(1);
    }
  });

  it('never stacks two toys on the same spot', () => {
    for (const count of COUNTS) {
      const spots = layoutToys(count);
      const keys = spots.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`);
      expect(new Set(keys).size).toBe(count);
    }
  });
});

describe('pickChosen', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('always picks somebody still in the tank', () => {
    for (let t = 0; t < 500; t++) expect(entries).toContain(pickChosen(entries));
  });

  it('picks every participant equally often (fairness)', () => {
    // The claw is choreographed to whoever this returns, so this is the only
    // thing standing between the mode and a biased pick.
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const chosen = pickChosen(entries);
      counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      const got = counts.get(e.id) ?? 0;
      expect(got, `${e.name} picked ${got} times, expected ~${expected}`)
        .toBeGreaterThan(expected * 0.9);
      expect(got).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where a toy sits in the tank (fairness)', () => {
    // Position must not correlate with being taken: lay out the crowd, pick
    // many times, and check every seat index wins its share.
    const trials = 16000;
    const bySpot = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) {
      const chosen = pickChosen(entries);
      bySpot[entries.indexOf(chosen)]++;
    }
    const expected = trials / entries.length;
    for (const [i, got] of bySpot.entries()) {
      expect(got, `spot ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `spot ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

describe('easeInOut', () => {
  it('runs from 0 to 1 and clamps outside that range', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-2)).toBe(0);
    expect(easeInOut(9)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('never goes backwards', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOut(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
