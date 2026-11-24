import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  MAX_LOSER_PROGRESS, PIE, PIE_T, RABBIT_AT, RABBIT_LEAD,
  isStalled, layoutSeats, leaderAt, pickChampion, planContest, progressAt, rowsFor,
} from './pieEngine';

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('layoutSeats', () => {
  it('seats everyone, and nobody for an empty table', () => {
    for (const n of COUNTS) expect(layoutSeats(n), `${n}`).toHaveLength(n);
    expect(layoutSeats(0)).toEqual([]);
    expect(layoutSeats(-3)).toEqual([]);
  });

  it('keeps every seat on the table and on the canvas', () => {
    for (const n of COUNTS) for (const s of layoutSeats(n)) {
      expect(s.x - PIE.SEAT_W / 2, `${n}`).toBeGreaterThanOrEqual(PIE.LINE_L - 1e-6);
      expect(s.x + PIE.SEAT_W / 2, `${n}`).toBeLessThanOrEqual(PIE.LINE_R + 1e-6);
      expect(s.y).toBeLessThanOrEqual(PIE.FRONT_Y);
      expect(s.y - 90 * s.scale, `${n}`).toBeGreaterThan(60); // head clears the banner
    }
  });

  it('never seats two eaters on top of each other', () => {
    for (const n of COUNTS) {
      const seats = layoutSeats(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (seats[i].row !== seats[j].row) continue;
        expect(Math.abs(seats[i].x - seats[j].x), `${n}: ${i},${j}`).toBeGreaterThan(PIE.SEAT_W * 0.9);
      }
    }
  });

  it('adds a row only when the table runs out', () => {
    expect(rowsFor(0)).toBe(0);
    expect(rowsFor(PIE.MAX_PER_ROW)).toBe(1);
    expect(rowsFor(PIE.MAX_PER_ROW + 1)).toBe(2);
    expect(rowsFor(MAX_PARTICIPANTS)).toBe(3);
  });
});

describe('pickChampion', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('picks every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const c = pickChampion(entries);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      expect(counts.get(e.id) ?? 0, e.name).toBeGreaterThan(expected * 0.9);
      expect(counts.get(e.id) ?? 0, e.name).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where an eater sits (fairness)', () => {
    const trials = 16000;
    const bySeat = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) bySeat[entries.indexOf(pickChampion(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of bySeat.entries()) {
      expect(got, `seat ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `seat ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

describe('planContest', () => {
  const cases = COUNTS.flatMap((n) => [1, 2, 3, 4, 5].map((seed) => ({ n, seed })));

  it('writes one plan per eater', () => {
    for (const { n, seed } of cases) expect(planContest(n, 0, seeded(seed))).toHaveLength(n);
  });

  it('never lets a pie grow back', () => {
    for (const { n, seed } of cases) {
      for (const plan of planContest(n, (seed * 7) % n, seeded(seed))) {
        expect(plan.curve[0]).toEqual({ t: 0, p: 0 });
        expect(plan.curve[plan.curve.length - 1].t).toBe(1);
        for (let k = 1; k < plan.curve.length; k++) {
          expect(plan.curve[k].t).toBeGreaterThan(plan.curve[k - 1].t);
          expect(plan.curve[k].p).toBeGreaterThanOrEqual(plan.curve[k - 1].p);
        }
      }
    }
  });

  it('has the chosen eater, and only them, clear the plate (fairness)', () => {
    for (const { n, seed } of cases) {
      const chosen = (seed * 7) % n;
      const plans = planContest(n, chosen, seeded(seed));
      expect(progressAt(plans[chosen], 1)).toBe(1);
      expect(progressAt(plans[chosen], 0.999)).toBeLessThan(1);
      plans.forEach((plan, i) => {
        if (i === chosen) return;
        expect(progressAt(plan, 1), `${n}/${seed}/${i}`).toBeLessThanOrEqual(MAX_LOSER_PROGRESS);
      });
      expect(leaderAt(plans, 1)).toBe(chosen);
    }
  });

  it('keeps the winner out of the lead at the turn', () => {
    for (const { n, seed } of cases) {
      if (n < 2) continue;
      const chosen = (seed * 7) % n;
      const plans = planContest(n, chosen, seeded(seed));
      const leader = leaderAt(plans, RABBIT_AT);
      expect(leader, `${n}/${seed}`).not.toBe(chosen);
      expect(progressAt(plans[leader], RABBIT_AT) - progressAt(plans[chosen], RABBIT_AT))
        .toBeGreaterThanOrEqual(RABBIT_LEAD - 1e-9);
    }
  });

  it('reports a stall exactly where progress is flat', () => {
    for (const plan of planContest(12, 3, seeded(9))) {
      for (const s of plan.stalls) {
        expect(s.to).toBeGreaterThan(s.from);
        expect(progressAt(plan, s.to)).toBeCloseTo(progressAt(plan, s.from), 9);
        expect(isStalled(plan, (s.from + s.to) / 2)).toBe(true);
      }
      expect(isStalled(plan, 0)).toBe(false);
    }
  });

  it('clamps time outside the contest', () => {
    const [plan] = planContest(1, 0, seeded(1));
    expect(progressAt(plan, -1)).toBe(0);
    expect(progressAt(plan, 2)).toBe(1);
  });
});

describe('timing', () => {
  it('gives every beat a positive length', () => {
    for (const [name, ms] of Object.entries(PIE_T)) expect(ms, name).toBeGreaterThan(0);
  });
});
