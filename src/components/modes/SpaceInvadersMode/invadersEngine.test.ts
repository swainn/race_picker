import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import { marchTempo, pickVictim } from './invadersEngine';

describe('marchTempo', () => {
  it('speeds up as combatants are eliminated', () => {
    expect(marchTempo(2, 0, false)).toBeGreaterThan(marchTempo(12, 0, false));
  });

  it('ramps up over elapsed time', () => {
    expect(marchTempo(8, 6000, false)).toBeGreaterThan(marchTempo(8, 0, false));
  });

  it('sudden death multiplies the tempo', () => {
    expect(marchTempo(8, 3000, true)).toBeCloseTo(marchTempo(8, 3000, false) * 1.6, 6);
  });
});

describe('pickVictim', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('always picks from the given pool', () => {
    for (let t = 0; t < 200; t++) {
      expect(entries).toContain(pickVictim(entries));
    }
  });

  it('is uniform across the pool (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const v = pickVictim(entries);
      counts.set(v.id, (counts.get(v.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      const count = counts.get(e.id) ?? 0;
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});
