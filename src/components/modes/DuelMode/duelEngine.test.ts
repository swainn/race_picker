import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import { DL, DUEL_MOVES, pickDuelists } from './duelEngine';

const entries: Entry[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

describe('pickDuelists', () => {
  it('returns two distinct entries from the pool', () => {
    for (let t = 0; t < 500; t++) {
      const [a, b] = pickDuelists(entries);
      expect(a.id).not.toBe(b.id);
      expect(entries).toContain(a);
      expect(entries).toContain(b);
    }
  });

  it('selects each participant uniformly (fairness)', () => {
    const trials = 12000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const [a, b] = pickDuelists(entries);
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
    }
    // Each entry should appear in 2/6 of duels.
    const expected = (trials * 2) / entries.length;
    for (const e of entries) {
      const count = counts.get(e.id) ?? 0;
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});

describe('duel tuning invariants', () => {
  it('a full meter is reachable within one duel from landed hits', () => {
    // Sanity guard on the meter economy: ~4 landed hits should fill it.
    expect(Math.ceil(DL.METER_MAX / DL.METER_ON_HIT)).toBeLessThanOrEqual(4);
  });

  it('every move deals positive damage and has non-negative timings', () => {
    for (const move of Object.values(DUEL_MOVES)) {
      expect(move.dmg).toBeGreaterThan(0);
      expect(move.windupMs).toBeGreaterThanOrEqual(0);
      expect(move.activeMs).toBeGreaterThanOrEqual(0);
      expect(move.recoverMs).toBeGreaterThanOrEqual(0);
      expect(move.cooldownMs).toBeGreaterThanOrEqual(0);
    }
  });
});
