import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import {
  LAYOUTS, cellCenter, distancesFrom, generateMaze, layoutFor, neighbors, pickStarts, type MazeLayout,
} from './mazeEngine';
import { RACE, planRace, poseAt } from './mazeRace';

// Same generator as mazeEngine.test.ts. Kept local: importing one test file
// from another would register its tests twice.
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

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);
const SEEDS = [1, 2, 3, 4, 5];

/** The maze a field of `n` would really get, unless a size is forced. */
function setup(n: number, seed: number, layout: MazeLayout = layoutFor(n)) {
  const rand = seeded(seed * 1000 + n);
  const maze = generateMaze(layout, rand);
  const starts = pickStarts(maze, n, rand);
  const chosen = (seed * 3) % n;
  return { maze, layout, starts, chosen, plan: planRace(maze, starts, chosen, rand) };
}

/** 1 at normal pacing, below it when the pace cap has sped the round up. */
const paceOf = (plan: { stepTime: number }, layout: MazeLayout) => plan.stepTime * layout.walkCps;

describe('planRace', () => {
  it('gets the chosen runner out first, by a clear margin (fairness)', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const { plan, chosen, layout } = setup(n, seed);
      expect(plan.runners).toHaveLength(n);
      expect(plan.winnerTime).toBe(plan.runners[chosen].finishTime);
      plan.runners.forEach((r, i) => {
        if (i === chosen) return;
        expect(r.finishTime - plan.winnerTime, `${n}/${seed}/${i}`)
          .toBeGreaterThanOrEqual(RACE.MARGIN_S * paceOf(plan, layout) - 1e-6);
      });
    }
  });

  it('holds in every size of maze, whoever is in it (fairness)', () => {
    for (const layout of LAYOUTS) for (const n of [1, 2, 6, 18, 30]) for (const seed of SEEDS) {
      if (n >= layout.cols * layout.rows) continue;
      const { plan, chosen } = setup(n, seed, layout);
      const tag = `${layout.cols}x${layout.rows}/${n}/${seed}`;
      plan.runners.forEach((r, i) => {
        expect(r.route.indexOf(layout.exitCell), tag).toBe(r.route.length - 1);
        if (i === chosen) return;
        expect(r.finishTime - plan.winnerTime, tag).toBeGreaterThanOrEqual(RACE.MARGIN_S * paceOf(plan, layout) - 1e-6);
      });
      expect(plan.winnerTime, tag).toBeGreaterThanOrEqual(RACE.MIN_ROUND_S - 1e-6);
      expect(plan.winnerTime, tag).toBeLessThanOrEqual(RACE.MAX_ROUND_S + 1e-6);
    }
  });

  it('still beats a runner who started closer to the exit', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { maze, starts, chosen, plan } = setup(12, seed);
      const dist = distancesFrom(maze, maze.layout.exitCell);
      starts.forEach((s, i) => {
        if (i === chosen || dist[s] >= dist[starts[chosen]]) return;
        checked++;
        expect(plan.runners[i].finishTime).toBeGreaterThan(plan.winnerTime);
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never walks anyone through a wall', () => {
    for (const n of [1, 7, 30]) for (const seed of SEEDS) {
      const { maze, starts, plan } = setup(n, seed);
      plan.runners.forEach((r, i) => {
        expect(r.route[0]).toBe(starts[i]);
        expect(r.route[r.route.length - 1]).toBe(maze.layout.exitCell);
        expect(r.pauses).toHaveLength(r.route.length);
        for (let k = 1; k < r.route.length; k++) {
          expect(neighbors(maze, r.route[k - 1]), `${n}/${seed}/${i}/${k}`).toContain(r.route[k]);
        }
        for (const p of r.pauses) expect(p).toBeGreaterThanOrEqual(0);
      });
    }
  });

  // A detour that wandered through the exit and back would let someone other
  // than the pick be seen leaving first, whatever their finishTime says.
  it('never lets anyone touch the exit before their last step (fairness)', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const { plan, layout } = setup(n, seed);
      plan.runners.forEach((r, i) => {
        expect(r.route.indexOf(layout.exitCell), `${n}/${seed}/${i}`).toBe(r.route.length - 1);
      });
    }
  });

  it('walks everyone at the same pace', () => {
    for (const n of [1, 7, 30]) for (const seed of SEEDS) {
      const { plan } = setup(n, seed);
      for (const r of plan.runners) {
        const walked = (r.route.length - 1) * plan.stepTime;
        const waited = r.pauses.reduce((a, b) => a + b, 0);
        expect(r.finishTime).toBeCloseTo(walked + waited, 6);
      }
    }
  });

  it('keeps the round a watchable length', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const { plan, layout } = setup(n, seed);
      expect(plan.winnerTime, `${n}/${seed}`).toBeGreaterThanOrEqual(RACE.MIN_ROUND_S - 1e-6);
      expect(plan.winnerTime, `${n}/${seed}`).toBeLessThanOrEqual(RACE.MAX_ROUND_S + 1e-6);
      expect(plan.stepTime).toBeLessThanOrEqual(1 / layout.walkCps + 1e-9);
    }
  });

  it('never leaves anyone standing still for long', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const { plan, layout } = setup(n, seed);
      // The limit is set at normal pacing; the pace cap scales pauses with it.
      const limit = RACE.MAX_PAUSE_S * paceOf(plan, layout) + 1e-6;
      plan.runners.forEach((r, i) => {
        for (const p of r.pauses) expect(p, `${n}/${seed}/${i}`).toBeLessThanOrEqual(limit);
      });
    }
  });

  it('runs a round for one runner', () => {
    const { plan } = setup(1, 4);
    expect(plan.runners).toHaveLength(1);
    expect(plan.winnerTime).toBe(plan.runners[0].finishTime);
  });

  it('gets the winner lost at least once when there is room to', () => {
    let detoured = 0;
    for (const seed of SEEDS) {
      const { maze, starts, chosen, plan } = setup(8, seed);
      const direct = distancesFrom(maze, maze.layout.exitCell)[starts[chosen]];
      if (plan.runners[chosen].route.length - 1 > direct) detoured++;
    }
    expect(detoured).toBeGreaterThan(0);
  });
});

describe('poseAt', () => {
  it('starts at the start, ends at the exit, and stays put afterward', () => {
    const { plan, starts, layout } = setup(5, 2);
    const exit = cellCenter(layout, layout.exitCell);
    plan.runners.forEach((r, i) => {
      const a = poseAt(layout, r, plan.stepTime, 0);
      expect({ x: a.x, y: a.y }).toEqual(cellCenter(layout, starts[i]));
      expect(a.done).toBe(false);
      const b = poseAt(layout, r, plan.stepTime, r.finishTime);
      expect({ x: b.x, y: b.y }).toEqual(exit);
      expect(b.done).toBe(true);
      const c = poseAt(layout, r, plan.stepTime, r.finishTime + 10);
      expect({ x: c.x, y: c.y }).toEqual(exit);
      expect(poseAt(layout, r, plan.stepTime, -5)).toMatchObject(cellCenter(layout, starts[i]));
    });
  });

  it('never moves more than one cell per step time', () => {
    const { plan, layout } = setup(5, 3);
    const dt = plan.stepTime / 4;
    for (const r of plan.runners) {
      let prev = poseAt(layout, r, plan.stepTime, 0);
      for (let t = dt; t <= r.finishTime; t += dt) {
        const cur = poseAt(layout, r, plan.stepTime, t);
        expect(Math.hypot(cur.x - prev.x, cur.y - prev.y)).toBeLessThanOrEqual(layout.cell / 4 + 1e-6);
        prev = cur;
      }
    }
  });
});
