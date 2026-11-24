import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  CHASE,
  FEINTS,
  MAX_ROUND_S,
  OBSTACLES,
  STEP,
  YARD,
  createChase,
  createIdleYard,
  isClear,
  pickCaught,
  spawnBirds,
  stepYard,
} from './turkeyEngine';

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

describe('the yard', () => {
  it('has obstacles inside the fence and away from the gate', () => {
    expect(OBSTACLES).toHaveLength(5);
    for (const o of OBSTACLES) {
      expect(o.x - o.r).toBeGreaterThan(YARD.L);
      expect(o.x + o.r).toBeLessThan(YARD.R);
      expect(o.y - o.r).toBeGreaterThan(YARD.T);
      expect(o.y + o.r).toBeLessThan(YARD.B);
      expect(Math.hypot(o.x - YARD.GATE_X, o.y - YARD.B)).toBeGreaterThan(60 + o.r);
    }
  });
});

describe('spawnBirds', () => {
  it('finds a clear spot for everyone', () => {
    for (const n of COUNTS) {
      const birds = spawnBirds(n, seeded(n));
      expect(birds, `${n}`).toHaveLength(n);
      for (const b of birds) expect(isClear(b.x, b.y, YARD.BIRD_R), `${n}`).toBe(true);
    }
    expect(spawnBirds(0)).toEqual([]);
    expect(spawnBirds(-2)).toEqual([]);
  });

  it('never stacks two turkeys', () => {
    for (const n of COUNTS) {
      const birds = spawnBirds(n, seeded(n * 31));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        expect(Math.hypot(birds[i].x - birds[j].x, birds[i].y - birds[j].y), `${n}`)
          .toBeGreaterThanOrEqual(YARD.BIRD_R * 2);
      }
    }
  });
});

describe('pickCaught', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('catches every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const c = pickCaught(entries);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      expect(counts.get(e.id) ?? 0, e.name).toBeGreaterThan(expected * 0.9);
      expect(counts.get(e.id) ?? 0, e.name).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where a turkey is in the list (fairness)', () => {
    const trials = 16000;
    const byIndex = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) byIndex[entries.indexOf(pickCaught(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of byIndex.entries()) {
      expect(got, `index ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `index ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

const SEEDS = [1, 2, 3, 4, 5, 6];
const MAX_STEPS = Math.ceil(MAX_ROUND_S / STEP);

function runToCatch(n: number, chosen: number, seed: number) {
  const rand = seeded(seed);
  const state = createChase(n, chosen, rand);
  let steps = 0;
  while (state.phase !== 'caught' && steps < MAX_STEPS + 1) {
    stepYard(state, rand);
    steps++;
  }
  return { state, steps };
}

describe('createChase', () => {
  it('queues decoys that never include the chosen turkey', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const chosen = (seed * 5) % n;
      const state = createChase(n, chosen, seeded(seed));
      expect(state.phase).toBe('release');
      expect(state.caughtIdx).toBe(-1);
      expect(state.feintQueue).toHaveLength(Math.min(FEINTS, n - 1));
      expect(state.feintQueue).not.toContain(chosen);
      expect(new Set(state.feintQueue).size).toBe(state.feintQueue.length);
    }
  });
});

describe('stepYard', () => {
  it('always catches the chosen turkey, and in time (fairness)', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const chosen = (seed * 5) % n;
      const { state, steps } = runToCatch(n, chosen, seed);
      expect(state.phase, `${n}/${seed}`).toBe('caught');
      expect(state.caughtIdx, `${n}/${seed}`).toBe(chosen);
      expect(steps, `${n}/${seed}`).toBeLessThanOrEqual(MAX_STEPS);
    }
  });

  it('dives and misses before the real chase', () => {
    for (const n of [1, 2, 3, 12, 30]) {
      const { state } = runToCatch(n, 0, 7);
      expect(state.lunges, `${n}`).toBe(Math.min(FEINTS, n - 1));
    }
  });

  it('goes straight for a lone turkey', () => {
    const { state } = runToCatch(1, 0, 3);
    expect(state.lunges).toBe(0);
    expect(state.caughtIdx).toBe(0);
  });

  it('keeps everyone inside the fence and off the obstacles', () => {
    for (const n of [1, 8, 30]) for (const seed of SEEDS) {
      const rand = seeded(seed);
      const state = createChase(n, n - 1, rand);
      for (let s = 0; s < MAX_STEPS && state.phase !== 'caught'; s++) {
        stepYard(state, rand);
        for (const b of state.birds) {
          expect(isClear(b.x, b.y, YARD.BIRD_R - 0.01), `${n}/${seed}/${s}`).toBe(true);
        }
        const f = state.farmer;
        if (state.phase !== 'release') {
          expect(f.x).toBeGreaterThanOrEqual(YARD.L);
          expect(f.x).toBeLessThanOrEqual(YARD.R);
          expect(f.y).toBeGreaterThanOrEqual(YARD.T);
          expect(f.y).toBeLessThanOrEqual(YARD.B);
          // He goes round hay bales, not through them.
          expect(isClear(f.x, f.y, YARD.FARMER_R - 0.01), `farmer ${n}/${seed}/${s}`).toBe(true);
        }
      }
    }
  });

  it('freezes once the turkey is caught', () => {
    const { state } = runToCatch(6, 2, 4);
    const before = JSON.stringify(state);
    stepYard(state, seeded(1));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('never catches anyone in the idle yard', () => {
    const rand = seeded(11);
    const state = createIdleYard(12, rand);
    for (let s = 0; s < 600; s++) stepYard(state, rand);
    expect(state.phase).toBe('idle');
    expect(state.caughtIdx).toBe(-1);
    for (const b of state.birds) expect(isClear(b.x, b.y, YARD.BIRD_R - 0.01)).toBe(true);
  });

  it('lets the farmer outrun a tired turkey', () => {
    expect(CHASE.FARMER_SPEED).toBeGreaterThan(CHASE.BIRD_PANIC_SPEED * CHASE.TIRED_FACTOR);
  });
});
