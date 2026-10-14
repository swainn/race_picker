import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import {
  AB,
  aimAtPig,
  aimForRank,
  easeInOut,
  flightStepsFor,
  layoutTower,
  pickVictim,
  rankShots,
  solveLaunch,
  tiersFor,
  trajectoryPoint,
  type BlockSpec,
  type PigSpot,
} from './angryBirdsEngine';

const COUNTS = Array.from({ length: 20 }, (_, i) => i + 1);

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const blockBox = (b: BlockSpec): Box => ({
  l: b.x - b.w / 2,
  r: b.x + b.w / 2,
  t: b.y - b.h / 2,
  b: b.y + b.h / 2,
});

const pigBox = (p: PigSpot): Box => ({ l: p.x - p.r, r: p.x + p.r, t: p.y - p.r, b: p.y + p.r });

/** Strict overlap: bodies that merely touch are fine, bodies that interpenetrate are not. */
function overlaps(a: Box, b: Box): boolean {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

describe('layoutTower', () => {
  it('seats every participant exactly once', () => {
    for (const count of COUNTS) expect(layoutTower(count).pigs).toHaveLength(count);
    expect(layoutTower(0)).toEqual({ blocks: [], pigs: [] });
  });

  it('builds three blocks per tier', () => {
    for (const count of COUNTS) {
      expect(layoutTower(count).blocks).toHaveLength(tiersFor(count) * 3);
    }
  });

  it('keeps the whole tower inside the canvas', () => {
    for (const count of COUNTS) {
      const { blocks, pigs } = layoutTower(count);
      for (const box of [...blocks.map(blockBox), ...pigs.map(pigBox)]) {
        expect(box.l).toBeGreaterThanOrEqual(0);
        expect(box.r).toBeLessThanOrEqual(AB.CANVAS_W);
        expect(box.t).toBeGreaterThanOrEqual(0);
        expect(box.b).toBeLessThanOrEqual(AB.CANVAS_H);
      }
    }
  });

  it('keeps the tower clear of the slingshot', () => {
    for (const count of COUNTS) {
      for (const box of layoutTower(count).blocks.map(blockBox)) {
        expect(box.l).toBeGreaterThan(AB.SLING_X + 100);
      }
    }
  });

  it('rests the bottom tier on the ground', () => {
    const { blocks } = layoutTower(7);
    const bottom = blocks.filter((b) => b.tier === 0 && b.kind === 'column');
    expect(bottom).toHaveLength(2);
    for (const b of bottom) expect(blockBox(b).b).toBe(AB.GROUND_Y);
  });

  it('never starts two bodies interpenetrating', () => {
    // Overlapping bodies blow apart on the first physics step, which would
    // wreck the tower before the bird is even launched.
    for (const count of COUNTS) {
      const { blocks, pigs } = layoutTower(count);
      const boxes = [...blocks.map(blockBox), ...pigs.map(pigBox)];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i], boxes[j]), `bodies ${i} and ${j} overlap at count ${count}`)
            .toBe(false);
        }
      }
    }
  });

  it('adds tiers only as the crowd grows', () => {
    expect(tiersFor(5)).toBe(1);
    expect(tiersFor(6)).toBe(2);
    expect(tiersFor(10)).toBe(2);
    expect(tiersFor(11)).toBe(3);
    expect(tiersFor(20)).toBe(4);
  });
});

describe('pickVictim', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('always picks somebody still in the round', () => {
    for (let t = 0; t < 500; t++) expect(entries).toContain(pickVictim(entries));
  });

  it('picks every participant equally often (fairness)', () => {
    // The launch is solved to reach whoever this returns, so this is the only
    // thing standing between the mode and a biased pick.
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const chosen = pickVictim(entries);
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

  it('does not care where a pig perches (fairness)', () => {
    // Position must not correlate with being popped: pick many times and check
    // every seat index wins its share.
    const trials = 16000;
    const bySeat = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) bySeat[entries.indexOf(pickVictim(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of bySeat.entries()) {
      expect(got, `seat ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `seat ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

describe('solveLaunch', () => {
  const from = { x: AB.SLING_X, y: AB.SLING_Y };

  /** Closest the solved arc ever comes to the target, sampled finely. */
  function closestApproach(target: { x: number; y: number }): number {
    const sol = solveLaunch(from, target);
    let best = Infinity;
    for (let t = 0; t <= sol.flightSteps + 1; t += 0.25) {
      const p = trajectoryPoint(from, sol, t);
      best = Math.min(best, Math.hypot(p.x - target.x, p.y - target.y));
    }
    return best;
  }

  it('reaches every perch in a full tower', () => {
    for (const spot of layoutTower(20).pigs) {
      expect(closestApproach(aimAtPig(spot))).toBeLessThan(2);
    }
  });

  it('reaches targets spread across the whole field', () => {
    for (let x = AB.TOWER_L - 120; x <= AB.TOWER_R; x += 40) {
      for (let y = 140; y <= AB.GROUND_Y; y += 40) {
        expect(closestApproach({ x, y }), `target ${x},${y}`).toBeLessThan(2);
      }
    }
  });

  it('arcs upward out of the sling and never leaves the canvas', () => {
    for (const spot of layoutTower(20).pigs) {
      const target = aimAtPig(spot);
      const sol = solveLaunch(from, target);
      expect(sol.vy).toBeLessThan(0); // rises before it falls
      expect(sol.vx).toBeGreaterThan(0); // always flies right, toward the tower
      for (let t = 0; t <= sol.flightSteps; t += 0.5) {
        const p = trajectoryPoint(from, sol, t);
        expect(p.y).toBeGreaterThan(0);
        expect(p.x).toBeLessThanOrEqual(AB.CANVAS_W);
      }
    }
  });

  it('keeps hang time inside its bounds', () => {
    for (const spot of layoutTower(20).pigs) {
      const steps = flightStepsFor(from, aimAtPig(spot));
      expect(steps).toBeGreaterThanOrEqual(AB.MIN_FLIGHT_STEPS);
      expect(steps).toBeLessThanOrEqual(AB.MAX_FLIGHT_STEPS);
    }
  });
});

describe('aimForRank', () => {
  const layout = layoutTower(6);

  it('sends the pre-picked winner into the base of the stack', () => {
    const best = aimForRank(0, layout);
    expect(best.y).toBeGreaterThan(AB.GROUND_Y - AB.COLUMN_H);
    expect(best.x).toBeGreaterThanOrEqual(AB.TOWER_L);
  });

  it('scatters the rest off that point, further out the worse they placed', () => {
    const best = aimForRank(0, layout);
    let prev = 0;
    for (let rank = 1; rank < 12; rank++) {
      const aim = aimForRank(rank, layout);
      const away = Math.hypot(aim.x - best.x, aim.y - best.y);
      expect(away).toBeGreaterThan(0);
      if (rank > 1 && rank < 9) expect(away).toBeGreaterThan(prev * 0.5);
      prev = away;
    }
  });
});

describe('rankShots', () => {
  const entries: Entry[] = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('puts the pre-picked winner first on the board, every time', () => {
    // The displayed scoreboard is generated from the pick, so it can never
    // disagree with it. Run it hard: a flaky board here means a rigged-looking
    // round in front of the room.
    for (let t = 0; t < 3000; t++) {
      const winner = pickVictim(entries);
      const board = rankShots(entries, winner.id);
      expect(board).toHaveLength(entries.length);
      expect(board[0].entryId).toBe(winner.id);
      expect(board[0].rank).toBe(0);
      const best = Math.max(...board.map((r) => r.score));
      expect(board[0].score).toBe(best);
    }
  });

  it('is strictly ordered with no ties', () => {
    for (let t = 0; t < 1000; t++) {
      const board = rankShots(entries, pickVictim(entries).id);
      for (let i = 1; i < board.length; i++) {
        expect(board[i].score).toBeLessThan(board[i - 1].score);
        expect(board[i].rank).toBe(i);
      }
      expect(new Set(board.map((r) => r.entryId)).size).toBe(entries.length);
    }
  });

  it('works for a two-bird finish and a one-bird board', () => {
    const two = entries.slice(0, 2);
    for (let t = 0; t < 500; t++) {
      const winner = pickVictim(two);
      expect(rankShots(two, winner.id)[0].entryId).toBe(winner.id);
    }
    const solo = entries.slice(0, 1);
    expect(rankShots(solo, solo[0].id)).toHaveLength(1);
  });

  it('refuses a winner who is not in the round', () => {
    expect(() => rankShots(entries, 999)).toThrow();
  });
});

describe('easeInOut', () => {
  it('runs from 0 to 1 and clamps outside that range', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(4)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });
});
