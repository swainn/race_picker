import {
  cellCenter, distancesFrom, neighbors, randIndex, shortestPath, shuffled,
  type Maze, type MazeLayout,
} from './mazeEngine';

/**
 * Race planning for Corn Maze: every runner's whole route and timing, written
 * up front so that exactly the pre-chosen runner reaches the exit first.
 *
 * Fairness: `chosenIdx` comes from the uniform draw in mazeEngine and is only
 * ever read here, never changed. Everyone walks at the same `stepTime`; a
 * runner who is not the pick is held back solely by extra wrong turns, with
 * short pauses mopping up whatever time is left over, and arrives at least `MARGIN_S` (scaled by the
 * pace cap) behind. mazeRace.test.ts checks that for every roster size.
 */

/** Times in seconds at normal pacing. */
export const RACE = {
  /** The pick beats everyone by at least this. */
  MARGIN_S: 0.7,
  /** Extra random lateness for the rest. */
  SPREAD_S: 4,
  MIN_ROUND_S: 5,
  MAX_ROUND_S: 10,
  /** The pick gets lost too. */
  WINNER_DETOUR_FRAC: 0.25,
  /** Cells into a dead-end branch before turning back. */
  MAX_DETOUR_DEPTH: 4,
  /** Longest anyone stands still in one go, wherever the route can spread it. */
  MAX_PAUSE_S: 1.5,
} as const;

/** Roughly how long one look around a junction lasts, when sharing out a pause. */
const PAUSE_CHUNK_S = 0.8;

export interface RunnerPlan {
  /** Cells visited in order, start first, exit cell last. */
  route: number[];
  /** Seconds waited on arrival at route[i]; same length as route. */
  pauses: number[];
  /** Seconds from the start until arrival at the exit cell. */
  finishTime: number;
}

export interface RacePlan {
  runners: RunnerPlan[];
  /** Seconds to walk one cell, the same for every runner. */
  stepTime: number;
  /** runners[chosenIdx].finishTime */
  winnerTime: number;
}

/** Ways out of route[i] that are neither where the runner came from nor where they go next. */
function sideBranches(maze: Maze, route: number[], i: number): number[] {
  return neighbors(maze, route[i]).filter((n) => n !== route[i - 1] && n !== route[i + 1]);
}

/**
 * Route indices where a runner could plausibly stop and wonder. The last cell
 * is never one: arriving at the exit ends the run.
 */
function junctionIndices(maze: Maze, route: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    if (sideBranches(maze, route, i).length > 0) out.push(i);
  }
  return out;
}

/**
 * Wrong turns available at route[i]: every way on that leads *away* from the
 * exit. The maze is a tree, so exactly one neighbour of a cell is nearer the
 * exit and everything behind any other neighbour is further still — a detour
 * that starts down one of these can never reach the exit and end the run
 * early, however the route has already been spliced.
 *
 * `fresh` keeps to turnings the runner is not already taking (not the cell
 * they came from, nor the one they go to next). Without it they may also
 * double back or walk into the same branch again, which is how the last of a
 * large budget gets spent when the route has run out of new turnings.
 */
function wrongTurns(maze: Maze, toExit: Int16Array, route: number[], i: number, fresh: boolean): number[] {
  const here = route[i];
  return neighbors(maze, here).filter(
    (n) => toExit[n] > toExit[here] && (!fresh || (n !== route[i - 1] && n !== route[i + 1])),
  );
}

/**
 * One pass over the route: at junctions in random order, walk into a wrong
 * turn and straight back out again. A detour of depth d costs 2d steps; one
 * that would overrun what is left of the budget turns back early instead.
 */
function detourPass(
  maze: Maze,
  toExit: Int16Array,
  route: number[],
  budgetSteps: number,
  fresh: boolean,
  rand: () => number,
): { route: number[]; spent: number } {
  let budget = budgetSteps;
  const splices = new Map<number, number[]>();
  // Never the last index: arriving at the exit ends the run.
  const indices = shuffled(route.slice(0, -1).map((_, i) => i), rand);

  for (const i of indices) {
    if (budget < 2) break;
    const turns = wrongTurns(maze, toExit, route, i, fresh);
    if (turns.length === 0) continue;
    const depth = Math.min(RACE.MAX_DETOUR_DEPTH, Math.floor(budget / 2));
    const branch = [turns[randIndex(turns.length, rand)]];
    let prev = route[i];
    while (branch.length < depth) {
      const cur = branch[branch.length - 1];
      const onward = neighbors(maze, cur).filter((n) => n !== prev);
      if (onward.length === 0) break; // dead end
      prev = cur;
      branch.push(onward[randIndex(onward.length, rand)]);
    }
    budget -= branch.length * 2;
    // Out to the tip, back the same way, and onto the junction again.
    splices.set(i, [...branch, ...branch.slice(0, -1).reverse(), route[i]]);
  }

  if (splices.size === 0) return { route, spent: 0 };
  const out: number[] = [];
  route.forEach((cell, i) => {
    out.push(cell);
    const extra = splices.get(i);
    if (extra) out.push(...extra);
  });
  return { route: out, spent: budgetSteps - budget };
}

/**
 * Send the runner up wrong turns until the step budget cannot fit another.
 *
 * Slack is spent walking wherever possible — a runner frozen at a junction
 * for seconds looks broken — so this keeps making passes over the route,
 * detour legs included, for as long as a detour still fits. Fresh turnings
 * are used up first; after that runners double back and re-enter branches
 * they have already tried.
 */
function addDetours(
  maze: Maze,
  toExit: Int16Array,
  route: number[],
  budgetSteps: number,
  rand: () => number,
): number[] {
  let current = route;
  let budget = budgetSteps;
  let fresh = true;
  while (budget >= 2) {
    const pass = detourPass(maze, toExit, current, budget, fresh, rand);
    if (pass.spent === 0) {
      if (!fresh) break; // nowhere on the route to turn off at all
      fresh = false;
      continue;
    }
    current = pass.route;
    budget -= pass.spent;
  }
  return current;
}

/**
 * Share `total` seconds of standing about along a finished route, in random
 * shares, none longer than MAX_PAUSE_S while the route has the cells to
 * allow it. Junctions are where a runner stops to wonder, so they are used
 * first; ordinary cells join in only when the junctions cannot hold it all.
 * Nobody ever waits on the exit cell: arriving there ends the run.
 */
function spreadPauses(maze: Maze, route: number[], total: number, rand: () => number): number[] {
  const pauses = new Array<number>(route.length).fill(0);
  const stoppable = route.length - 1;
  if (total <= 0 || stoppable <= 0) return pauses;

  const cap = RACE.MAX_PAUSE_S;
  const needed = Math.ceil(total / cap - 1e-9);
  if (needed > stoppable) {
    // The whole route cannot hold it under the limit: share it out evenly.
    for (let i = 0; i < stoppable; i++) pauses[i] = total / stoppable;
    return pauses;
  }

  const junctions = shuffled(junctionIndices(maze, route), rand);
  let chosen: number[];
  if (junctions.length >= needed) {
    // A few proper stops read better than a stutter at every corner.
    const stops = Math.max(needed, Math.min(junctions.length, Math.ceil(total / PAUSE_CHUNK_S)));
    chosen = junctions.slice(0, stops);
  } else {
    const taken = new Set(junctions);
    const ordinary: number[] = [];
    for (let i = 0; i < stoppable; i++) if (!taken.has(i)) ordinary.push(i);
    chosen = [...junctions, ...shuffled(ordinary, rand).slice(0, needed - junctions.length)];
  }

  // Random shares; any share over the limit is clipped to it and its excess
  // handed to the stops still under, until every stop fits.
  const weights = chosen.map(() => 0.35 + rand());
  const open = chosen.map((_, k) => k);
  let left = total;
  for (;;) {
    const sum = open.reduce((a, k) => a + weights[k], 0);
    const over = open.filter((k) => (left * weights[k]) / sum > cap);
    if (over.length === 0 || over.length === open.length) {
      for (const k of open) pauses[chosen[k]] = Math.min(cap, (left * weights[k]) / sum);
      break;
    }
    for (const k of over) {
      pauses[chosen[k]] = cap;
      left -= cap;
      open.splice(open.indexOf(k), 1);
    }
  }
  return pauses;
}

/**
 * Plan the whole race. Worked in "base seconds" at 1 / layout.walkCps per cell; the
 * pace cap is applied once at the end, to walking and waiting alike.
 */
export function planRace(
  maze: Maze,
  starts: number[],
  chosenIdx: number,
  rand: () => number = Math.random,
): RacePlan {
  const cps = maze.layout.walkCps;
  const exitCell = maze.layout.exitCell;
  const toExit = distancesFrom(maze, exitCell);
  const direct = starts.map((s) => shortestPath(maze, s, exitCell));
  const walkOf = (route: number[]) => (route.length - 1) / cps;

  interface Draft { route: number[]; pauses: number[] }
  const drafts: Draft[] = new Array<Draft>(starts.length);

  // The winner first: everyone else is timed against them.
  let winnerBase = 0;
  if (chosenIdx >= 0 && chosenIdx < starts.length) {
    const walk = walkOf(direct[chosenIdx]);
    const extra = Math.max(RACE.WINNER_DETOUR_FRAC * walk, RACE.MIN_ROUND_S - walk);
    const route = addDetours(maze, toExit, direct[chosenIdx], Math.floor(extra * cps), rand);
    winnerBase = walk + extra;
    const pauses = spreadPauses(maze, route, Math.max(0, winnerBase - walkOf(route)), rand);
    drafts[chosenIdx] = { route, pauses };
  }

  starts.forEach((_, i) => {
    if (i === chosenIdx) return;
    const walk = walkOf(direct[i]);
    const target = Math.max(walk, winnerBase + RACE.MARGIN_S) + rand() * RACE.SPREAD_S;
    const route = addDetours(maze, toExit, direct[i], Math.floor((target - walk) * cps), rand);
    const pauses = spreadPauses(maze, route, Math.max(0, target - walkOf(route)), rand);
    drafts[i] = { route, pauses };
  });

  // Pace cap: an unlucky, winding maze must not become a very long round.
  const k = winnerBase > 0 ? Math.min(1, RACE.MAX_ROUND_S / winnerBase) : 1;
  const stepTime = k / cps;
  const runners: RunnerPlan[] = drafts.map((d) => {
    const pauses = d.pauses.map((p) => p * k);
    // Summed the way poseAt walks it, so the two can never disagree.
    const finishTime = (d.route.length - 1) * stepTime + pauses.reduce((a, b) => a + b, 0);
    return { route: d.route, pauses, finishTime };
  });

  return { runners, stepTime, winnerTime: runners[chosenIdx]?.finishTime ?? 0 };
}

export interface RunnerPose { x: number; y: number; heading: number; moving: boolean; done: boolean }

/** Facing down the field, toward the exit side, when there is nowhere to head. */
const REST_HEADING = Math.PI / 2;

function headingBetween(layout: MazeLayout, from: number, to: number): number {
  const a = cellCenter(layout, from);
  const b = cellCenter(layout, to);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Where a runner is `t` seconds into the race, in canvas pixels. */
export function poseAt(layout: MazeLayout, runner: RunnerPlan, stepTime: number, t: number): RunnerPose {
  const { route, pauses } = runner;
  const last = route.length - 1;
  if (last < 0) return { x: 0, y: 0, heading: REST_HEADING, moving: false, done: true };

  if (last === 0 || t >= runner.finishTime) {
    const heading = last > 0 ? headingBetween(layout, route[last - 1], route[last]) : REST_HEADING;
    return { ...cellCenter(layout, route[last]), heading, moving: false, done: true };
  }
  if (t <= 0) {
    return { ...cellCenter(layout, route[0]), heading: headingBetween(layout, route[0], route[1]), moving: false, done: false };
  }

  let clock = 0;
  for (let i = 0; i < last; i++) {
    const heading = headingBetween(layout, route[i], route[i + 1]);
    // Standing at route[i], looking the way they are about to go.
    clock += pauses[i] ?? 0;
    if (t < clock) return { ...cellCenter(layout, route[i]), heading, moving: false, done: false };
    if (t < clock + stepTime) {
      const f = stepTime > 0 ? (t - clock) / stepTime : 1;
      const a = cellCenter(layout, route[i]);
      const b = cellCenter(layout, route[i + 1]);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, heading, moving: true, done: false };
    }
    clock += stepTime;
  }
  // Only reachable through rounding at the very end of the walk.
  return { ...cellCenter(layout, route[last]), heading: headingBetween(layout, route[last - 1], route[last]), moving: false, done: true };
}
