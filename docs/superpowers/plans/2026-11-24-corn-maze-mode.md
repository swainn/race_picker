# Corn Maze Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `corn-maze` game mode: every participant is dropped into a freshly generated corn maze, they all wander toward the single exit with wrong turns and hesitations, and the first one out is the round's pick.

**Architecture:** A self-contained folder under `src/components/modes/CornMazeMode/`, laid out like `TrickOrTreatMode`. The winner is drawn uniformly before the maze appears. One pure module generates the maze and answers path questions; a second pure module writes every runner's full route and timing so that exactly the chosen runner reaches the exit first. The canvas component only plays those routes back.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Canvas 2D, Vitest. No new dependencies.

**Spec:** None. The Design section below is the design. It is a proposal and has not been approved yet, so read it first and correct anything before Task 1.

## Design

- **What you see:** a top-down corn maze, 19 by 13 cells, with a pumpkin patch outside the single exit at the bottom. Participants are round tokens (photo or initials) that start scattered through the maze. They all walk at the same pace. They take wrong turns into dead ends and come back, and they stop at junctions to look around. One reaches the exit; a horn sounds and everyone else stops where they are.
- **Who wins:** first out. That runner is the round's pick and **places first**, so standings order like Racing (no `survivalOrder`). A new maze is generated every round.
- **Fairness:** `pickFirstOut` draws uniformly before the maze is generated. Start cells, routes and timings are all assigned after the draw. Everyone walks at the same speed; a runner who is not the pick loses time only through extra dead-end detours and junction pauses.
- **Round length:** the winner's time is held between 8 and 16 seconds at normal pacing, whatever maze comes up.
- **Settings:** pacing (slow / normal / fast), use participant photos as tokens, sound effects, music.
- **Not included:** fog of war, breadcrumb trails, player steering, maze size settings, replay.

## Global Constraints

- The pick is `shuffle(entries)[0]` from `src/utils/array.ts`, taken before the maze is generated. Nothing generated or animated may change it.
- The maze must start `MAX_PARTICIPANTS` (30, from `src/constants.ts`) runners in distinct cells and must work for 1.
- No new runtime dependencies.
- Animation runs in one `requestAnimationFrame` loop mounted once; per-frame state lives in `useRef`, and the loop reads props through a `propsRef`.
- Read images only through `getEntryImages` / `getPreferredEntryImage`.
- Settings persist through a module singleton + `useSyncExternalStore`, with `localStorage` wrapped in try/catch. Storage key: `gamified_picker_corn_maze_settings`.
- `onWinner` is called at the **end** of the celebration beat, because the winner card covers the canvas.
- The maze walls are painted once per maze to an offscreen canvas and blitted each frame.
- The visible canvas backing store matches its displayed size in device pixels. At the top of every frame:

```ts
const dpr = window.devicePixelRatio || 1;
const w = Math.max(MAZE.CANVAS_W, Math.round(canvas.clientWidth * dpr));
const h = Math.round(w * (MAZE.CANVAS_H / MAZE.CANVAS_W));
if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
const scale = canvas.width / MAZE.CANVAS_W;
ctx.setTransform(scale, 0, 0, scale, 0, 0);
```

  The offscreen wall canvas is rebuilt at the same `scale` whenever `scale` or the maze changes. Multiply any `shadowBlur` by `scale`; it ignores the transform.
- Verification for every task: `npm run build`, `npm run lint`, `npm run test -- --run`. Dev server for manual checks: `npm run dev -- --port 5174`.
- Work on a branch `feat/corn-maze-mode` cut from an up-to-date `main`.

## Review Focus

1. **One runner.** The round must run and finish with nobody to beat. Test in Task 2.
2. **Thirty runners.** Thirty distinct start cells, none on the exit cell. Test in Task 1.
3. **A runner who starts closer than the pick.** They must still arrive later, by losing time to detours and pauses rather than walking slower. Test in Task 2.
4. **An unlucky maze.** A long winding path must not produce a 50-second round; the pace cap holds the winner to `MAX_ROUND_S`. Test in Task 2.
5. **A walk through a wall.** Every step of every route, including detours, must cross an open passage. Test in Task 2.

## File Structure

```
src/components/modes/CornMazeMode/
  mazeEngine.ts                pure: constants, maze generation, BFS, start cells, the pick
  mazeEngine.test.ts
  mazeRace.ts                  pure: routes, detours, pauses, timing, position lookup
  mazeRace.test.ts
  mazeSprites.ts               pure painting: field, corn walls, exit patch, runner token
  mazeAudio.ts                 synth sound on utils/synth
  cornMazeSettingsStore.ts     persisted settings
  CornMazeSettings.tsx         settings panel
  CornMazeGame.tsx             canvas + loop + WinnerDialog
  CornMazeGame.css
  CornMazeMode.tsx             ModeViewProps wrapper + start/reset buttons

src/components/modes/types.ts      MODIFY: add 'corn-maze' to GameMode
src/components/modes/themes.ts     MODIFY: add cornMazeTheme
src/components/modes/registry.ts   MODIFY: lazy import + registry entry
README.md, CLAUDE.md               MODIFY: mode lists
```

---

### Task 1: Engine — maze generation, paths, starts and pick

**Files:**
- Create: `src/components/modes/CornMazeMode/mazeEngine.ts`
- Test: `src/components/modes/CornMazeMode/mazeEngine.test.ts`

**Interfaces:**
- Consumes: `shuffle` from `src/utils/array.ts`, `Entry` from `src/types`, `MAX_PARTICIPANTS` from `src/constants`.
- Produces:

```ts
export const MAZE = {
  CANVAS_W: 720, CANVAS_H: 560,
  COLS: 19, ROWS: 13, CELL: 36,
  ORIGIN_X: 18, ORIGIN_Y: 56,     // top-left corner of cell (0, 0)
  EXIT_COL: 9,                    // the exit opens downward from the bottom row
  RUNNER_R: 11,
  MIN_START_DIST: 14,             // cells from the exit, by path
  MAX_START_DIST: 44,
} as const;

/** Passage bits per cell. A set bit means you can walk that way. */
export const DIR = { N: 1, E: 2, S: 4, W: 8 } as const;

export interface Maze { cols: number; rows: number; open: Uint8Array } // cell = row * cols + col

export const EXIT_CELL: number; // (ROWS - 1) * COLS + EXIT_COL

export function generateMaze(cols: number, rows: number, rand?: () => number): Maze;
/** Cells reachable in one step through an open passage. */
export function neighbors(maze: Maze, cell: number): number[];
/** Path length in steps from `from` to every cell. */
export function distancesFrom(maze: Maze, from: number): Int16Array;
/** Cells from `from` to `to` inclusive. */
export function shortestPath(maze: Maze, from: number, to: number): number[];
/** `count` distinct start cells, never the exit cell. */
export function pickStarts(maze: Maze, exitCell: number, count: number, rand?: () => number): number[];
/** Canvas-pixel centre of a cell. */
export function cellCenter(cell: number): { x: number; y: number };
export function pickFirstOut(entries: Entry[]): Entry;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  DIR, EXIT_CELL, MAZE, cellCenter, distancesFrom, generateMaze, neighbors,
  pickFirstOut, pickStarts, shortestPath,
} from './mazeEngine';

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const CELLS = MAZE.COLS * MAZE.ROWS;

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

const make = (seed: number) => generateMaze(MAZE.COLS, MAZE.ROWS, seeded(seed));

describe('generateMaze', () => {
  it('connects every cell to every other with exactly one route', () => {
    for (const seed of SEEDS) {
      const maze = make(seed);
      // Reachable from the exit...
      const dist = distancesFrom(maze, EXIT_CELL);
      for (let c = 0; c < CELLS; c++) expect(dist[c], `${seed}/${c}`).toBeGreaterThanOrEqual(0);
      // ...and a tree: cells - 1 passages, each counted from both sides.
      let bits = 0;
      for (let c = 0; c < CELLS; c++) for (const d of [DIR.N, DIR.E, DIR.S, DIR.W]) if (maze.open[c] & d) bits++;
      expect(bits / 2, `${seed}`).toBe(CELLS - 1);
    }
  });

  it('opens every passage from both sides and never through the border', () => {
    const maze = make(3);
    for (let c = 0; c < CELLS; c++) {
      const col = c % MAZE.COLS;
      const row = Math.floor(c / MAZE.COLS);
      if (row === 0) expect(maze.open[c] & DIR.N).toBe(0);
      if (row === MAZE.ROWS - 1) expect(maze.open[c] & DIR.S).toBe(0);
      if (col === 0) expect(maze.open[c] & DIR.W).toBe(0);
      if (col === MAZE.COLS - 1) expect(maze.open[c] & DIR.E).toBe(0);
      for (const n of neighbors(maze, c)) expect(neighbors(maze, n)).toContain(c);
    }
  });

  it('builds a different maze from a different seed', () => {
    expect(Array.from(make(1).open)).not.toEqual(Array.from(make(2).open));
  });
});

describe('shortestPath', () => {
  it('walks only through open passages, end to end', () => {
    const maze = make(5);
    const dist = distancesFrom(maze, EXIT_CELL);
    for (const from of [0, MAZE.COLS - 1, CELLS - 1, 100]) {
      const path = shortestPath(maze, from, EXIT_CELL);
      expect(path[0]).toBe(from);
      expect(path[path.length - 1]).toBe(EXIT_CELL);
      expect(path.length - 1).toBe(dist[from]);
      for (let i = 1; i < path.length; i++) expect(neighbors(maze, path[i - 1])).toContain(path[i]);
    }
    expect(shortestPath(maze, EXIT_CELL, EXIT_CELL)).toEqual([EXIT_CELL]);
  });
});

describe('pickStarts', () => {
  it('gives everyone their own cell, never the exit', () => {
    for (const n of COUNTS) for (const seed of [1, 2, 3]) {
      const maze = make(seed);
      const starts = pickStarts(maze, EXIT_CELL, n, seeded(seed + 50));
      expect(starts, `${n}/${seed}`).toHaveLength(n);
      expect(new Set(starts).size, `${n}/${seed}`).toBe(n);
      expect(starts).not.toContain(EXIT_CELL);
    }
    expect(pickStarts(make(1), EXIT_CELL, 0)).toEqual([]);
  });

  it('prefers cells a fair walk from the exit', () => {
    for (const seed of SEEDS) {
      const maze = make(seed);
      const dist = distancesFrom(maze, EXIT_CELL);
      let inBand = 0;
      for (let c = 0; c < CELLS; c++) {
        if (dist[c] >= MAZE.MIN_START_DIST && dist[c] <= MAZE.MAX_START_DIST) inBand++;
      }
      const n = Math.min(MAX_PARTICIPANTS, inBand);
      for (const s of pickStarts(maze, EXIT_CELL, n, seeded(seed))) {
        expect(dist[s], `${seed}`).toBeGreaterThanOrEqual(MAZE.MIN_START_DIST);
        expect(dist[s], `${seed}`).toBeLessThanOrEqual(MAZE.MAX_START_DIST);
      }
    }
  });
});

describe('cellCenter', () => {
  it('keeps every cell on the canvas above the exit patch', () => {
    for (let c = 0; c < CELLS; c++) {
      const p = cellCenter(c);
      expect(p.x - MAZE.CELL / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + MAZE.CELL / 2).toBeLessThanOrEqual(MAZE.CANVAS_W);
      expect(p.y - MAZE.CELL / 2).toBeGreaterThanOrEqual(MAZE.ORIGIN_Y - 1e-6);
      expect(p.y + MAZE.CELL / 2).toBeLessThanOrEqual(MAZE.CANVAS_H - 30);
    }
  });
});

describe('pickFirstOut', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('picks every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const c = pickFirstOut(entries);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      expect(counts.get(e.id) ?? 0, e.name).toBeGreaterThan(expected * 0.9);
      expect(counts.get(e.id) ?? 0, e.name).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where a runner is in the list (fairness)', () => {
    const trials = 16000;
    const byIndex = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) byIndex[entries.indexOf(pickFirstOut(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of byIndex.entries()) {
      expect(got, `index ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `index ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/components/modes/CornMazeMode/mazeEngine.test.ts`
Expected: FAIL, cannot resolve `./mazeEngine`.

- [ ] **Step 3: Implement `mazeEngine.ts`**

`generateMaze` is an iterative depth-first backtracker (explicit stack, no recursion) starting from a random cell, choosing an unvisited neighbour with `rand`. `distancesFrom` is a breadth-first search; `shortestPath` walks down the distance field from `from`. `pickStarts` shuffles the cells whose distance is inside `[MIN_START_DIST, MAX_START_DIST]` with `rand` and takes `count`; if the band holds fewer than `count`, it fills the remainder from the other non-exit cells ordered by how far outside the band they are, nearest first.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- --run src/components/modes/CornMazeMode/mazeEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modes/CornMazeMode/mazeEngine.ts src/components/modes/CornMazeMode/mazeEngine.test.ts
git commit -m "feat(corn-maze): add maze generation, pathing, starts and uniform pick"
```

---

### Task 2: Engine — race planning

**Files:**
- Create: `src/components/modes/CornMazeMode/mazeRace.ts`
- Test: `src/components/modes/CornMazeMode/mazeRace.test.ts`

**Interfaces:**
- Consumes: `Maze`, `MAZE`, `neighbors`, `shortestPath`, `cellCenter` from Task 1.
- Produces:

```ts
/** Times in seconds at normal pacing. */
export const RACE = {
  WALK_CPS: 4.5,             // cells per second before the pace cap
  MARGIN_S: 0.7,             // the pick beats everyone by at least this
  SPREAD_S: 4,               // extra random lateness for the rest
  MIN_ROUND_S: 8,
  MAX_ROUND_S: 16,
  WINNER_DETOUR_FRAC: 0.25,  // the pick gets lost too
  MAX_DETOUR_DEPTH: 4,       // cells into a dead-end branch before turning back
} as const;

export interface RunnerPlan {
  route: number[];     // cells visited in order, start first, exit cell last
  pauses: number[];    // seconds waited on arrival at route[i]; same length as route
  finishTime: number;  // seconds from the start until arrival at the exit cell
}

export interface RacePlan {
  runners: RunnerPlan[];
  stepTime: number;    // seconds to walk one cell, the same for every runner
  winnerTime: number;  // runners[chosenIdx].finishTime
}

export function planRace(
  maze: Maze, starts: number[], exitCell: number, chosenIdx: number, rand?: () => number,
): RacePlan;

export interface RunnerPose { x: number; y: number; heading: number; moving: boolean; done: boolean }
/** Where a runner is `t` seconds into the race, in canvas pixels. */
export function poseAt(runner: RunnerPlan, stepTime: number, t: number): RunnerPose;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import { EXIT_CELL, MAZE, cellCenter, distancesFrom, generateMaze, neighbors, pickStarts } from './mazeEngine';
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

function setup(n: number, seed: number) {
  const rand = seeded(seed * 1000 + n);
  const maze = generateMaze(MAZE.COLS, MAZE.ROWS, rand);
  const starts = pickStarts(maze, EXIT_CELL, n, rand);
  const chosen = (seed * 3) % n;
  return { maze, starts, chosen, plan: planRace(maze, starts, EXIT_CELL, chosen, rand) };
}

describe('planRace', () => {
  it('gets the chosen runner out first, by a clear margin (fairness)', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const { plan, chosen } = setup(n, seed);
      expect(plan.runners).toHaveLength(n);
      expect(plan.winnerTime).toBe(plan.runners[chosen].finishTime);
      plan.runners.forEach((r, i) => {
        if (i === chosen) return;
        expect(r.finishTime - plan.winnerTime, `${n}/${seed}/${i}`)
          .toBeGreaterThanOrEqual(RACE.MARGIN_S * (plan.stepTime * RACE.WALK_CPS) - 1e-6);
      });
    }
  });

  it('still beats a runner who started closer to the exit', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { maze, starts, chosen, plan } = setup(12, seed);
      const dist = distancesFrom(maze, EXIT_CELL);
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
        expect(r.route[r.route.length - 1]).toBe(EXIT_CELL);
        expect(r.pauses).toHaveLength(r.route.length);
        for (let k = 1; k < r.route.length; k++) {
          expect(neighbors(maze, r.route[k - 1]), `${n}/${seed}/${i}/${k}`).toContain(r.route[k]);
        }
        for (const p of r.pauses) expect(p).toBeGreaterThanOrEqual(0);
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
      const { plan } = setup(n, seed);
      expect(plan.winnerTime, `${n}/${seed}`).toBeGreaterThanOrEqual(RACE.MIN_ROUND_S - 1e-6);
      expect(plan.winnerTime, `${n}/${seed}`).toBeLessThanOrEqual(RACE.MAX_ROUND_S + 1e-6);
      expect(plan.stepTime).toBeLessThanOrEqual(1 / RACE.WALK_CPS + 1e-9);
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
      const direct = distancesFrom(maze, EXIT_CELL)[starts[chosen]];
      if (plan.runners[chosen].route.length - 1 > direct) detoured++;
    }
    expect(detoured).toBeGreaterThan(0);
  });
});

describe('poseAt', () => {
  it('starts at the start, ends at the exit, and stays put afterward', () => {
    const { plan, starts } = setup(5, 2);
    plan.runners.forEach((r, i) => {
      const a = poseAt(r, plan.stepTime, 0);
      expect({ x: a.x, y: a.y }).toEqual(cellCenter(starts[i]));
      expect(a.done).toBe(false);
      const b = poseAt(r, plan.stepTime, r.finishTime);
      expect({ x: b.x, y: b.y }).toEqual(cellCenter(EXIT_CELL));
      expect(b.done).toBe(true);
      const c = poseAt(r, plan.stepTime, r.finishTime + 10);
      expect({ x: c.x, y: c.y }).toEqual(cellCenter(EXIT_CELL));
      expect(poseAt(r, plan.stepTime, -5)).toMatchObject(cellCenter(starts[i]));
    });
  });

  it('never moves more than one cell per step time', () => {
    const { plan } = setup(5, 3);
    const dt = plan.stepTime / 4;
    for (const r of plan.runners) {
      let prev = poseAt(r, plan.stepTime, 0);
      for (let t = dt; t <= r.finishTime; t += dt) {
        const cur = poseAt(r, plan.stepTime, t);
        expect(Math.hypot(cur.x - prev.x, cur.y - prev.y)).toBeLessThanOrEqual(MAZE.CELL / 4 + 1e-6);
        prev = cur;
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/components/modes/CornMazeMode/mazeRace.test.ts`
Expected: FAIL, cannot resolve `./mazeRace`.

- [ ] **Step 3: Implement `mazeRace.ts`**

`planRace` is the algorithm the signatures do not determine. Work in "base seconds" at `1 / WALK_CPS` per cell, then apply the pace cap once at the end.

```
direct_i = shortestPath(start_i -> exit);  walk_i = (direct_i.length - 1) / WALK_CPS

winner
  extra  = max(WINNER_DETOUR_FRAC * walk_w, MIN_ROUND_S - walk_w)
  route  = addDetours(direct_w, floor(extra * WALK_CPS) steps)
  Tw     = (route.length - 1) / WALK_CPS, plus pauses for whatever of `extra`
           the detours could not spend

everyone else
  Ti     = max(walk_i, Tw + MARGIN_S) + rand() * SPREAD_S
  slack  = Ti - walk_i
  route  = addDetours(direct_i, floor(slack * WALK_CPS) steps)
  the rest of the slack becomes pauses

addDetours(route, budgetSteps)
  visit the junctions on the route (cells with a neighbour that is not the
  previous or next route cell) in random order. at each, walk into that side
  branch up to MAX_DETOUR_DEPTH cells or until a dead end, then walk back the
  same way. a detour of depth d costs 2d steps and is taken only if it fits
  the remaining budget. splice the out-and-back cells into the route.

pauses
  spread over the junction cells of the final route in random shares; if the
  route has no junction, the whole pause goes on the start cell.

pace cap
  k = min(1, MAX_ROUND_S / Tw). multiply every pause and every finishTime by k;
  stepTime = k / WALK_CPS; winnerTime = Tw * k.
```

`poseAt` walks the route accumulating `stepTime` per move and `pauses[i]` per arrival, interpolates linearly between cell centres, clamps `t` below 0 to the start and above `finishTime` to the exit cell, and reports `moving: false` during a pause.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- --run src/components/modes/CornMazeMode/mazeRace.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modes/CornMazeMode/mazeRace.ts src/components/modes/CornMazeMode/mazeRace.test.ts
git commit -m "feat(corn-maze): plan routes and timing so the pick exits first"
```

---

### Task 3: Sprites and audio

**Files:**
- Create: `src/components/modes/CornMazeMode/mazeSprites.ts`
- Create: `src/components/modes/CornMazeMode/mazeAudio.ts`

**Interfaces:**
- Consumes: `MAZE`, `DIR`, `Maze`, `cellCenter`, `EXIT_CELL` from Task 1; `tone`, `noise`, `createBus`, `getAudioContext`, `resumeAudio` from `src/utils/synth.ts`; `isGlobalMuted` from `src/utils/globalAudioStore.ts`.
- Produces:

```ts
// mazeSprites.ts — pure painting; the caller decides positions and state.
/** Field, title strip and the pumpkin patch outside the exit. Logical 720x560. */
export function drawField(ctx: CanvasRenderingContext2D, now: number): void;
/** Every corn wall of the maze, with the exit gap open. Paint once per maze. */
export function drawWalls(ctx: CanvasRenderingContext2D, maze: Maze): void;
export interface RunnerOptions {
  color: string; initials: string; avatar: HTMLImageElement | null;
  heading: number; moving: boolean;
  puzzled: boolean;      // paused at a junction: show a "?"
  winner: boolean;
  now: number;
}
export function drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, o: RunnerOptions): void;
export function drawExitBurst(ctx: CanvasRenderingContext2D, t: number): void;

// mazeAudio.ts
export function resumeMazeAudio(): void;
export function setMazeMuted(m: boolean): void;
export function setMazeMusicMuted(m: boolean): void;
export function playStart(): void;
export function playRustle(): void;
export function playPuzzled(): void;
export function playHorn(): void;
export function playCheer(): void;
export function startTrack(): void;
export function stopTrack(): void;
```

- [ ] **Step 1: Implement `mazeSprites.ts`**

Field: packed-earth paths in a warm tan, a "CORN MAZE" title strip in the top 56 px, and a strip of pumpkins and a scarecrow below the maze with the exit gap at `EXIT_COL`. Walls: for each cell draw its closed N and W sides, plus the closed S side on the bottom row and E side on the last column, as 10 px-thick rows of corn (dark green base, lighter leaf strokes, gold tassel dots). Leave the S side of `EXIT_CELL` open. A runner is a disc of radius `MAZE.RUNNER_R` with a `color` ring: the avatar clipped to a circle on a **black** disc when present, `initials` otherwise; a small notch on the ring shows `heading`; `puzzled` draws a "?" above; `winner` adds a gold ring.

- [ ] **Step 2: Implement `mazeAudio.ts`**

Follow `TrickOrTreatMode/treatAudio.ts` exactly for the mute flags, the `isGlobalMuted()` checks and the `setInterval` track with `stopTrack`. The rustle is a short high-passed-sounding `noise` burst. The track is a slow, slightly mysterious plucked pattern at about 360 ms per step.

- [ ] **Step 3: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/modes/CornMazeMode/mazeSprites.ts src/components/modes/CornMazeMode/mazeAudio.ts
git commit -m "feat(corn-maze): add sprites and synth audio"
```

---

### Task 4: Settings store and panel

**Files:**
- Create: `src/components/modes/CornMazeMode/cornMazeSettingsStore.ts`
- Create: `src/components/modes/CornMazeMode/CornMazeSettings.tsx`

**Interfaces:**
- Produces:

```ts
export type MazeSpeed = 'slow' | 'normal' | 'fast';
export interface CornMazeSettings { speed: MazeSpeed; useAvatars: boolean; sound: boolean; music: boolean }
export function useCornMazeSettings(): CornMazeSettings;
export function updateCornMazeSettings(next: Partial<CornMazeSettings>): void;
/** How fast race time runs against real time: slow 0.75, normal 1, fast 1.45. */
export function mazeTimeScale(speed: MazeSpeed): number;
export function CornMazeSettings(): JSX.Element; // from CornMazeSettings.tsx
```

- [ ] **Step 1: Implement both files**

Copy the structure of `trickOrTreatSettingsStore.ts` and `TrickOrTreatSettings.tsx`. Defaults: `speed: 'normal'`, the three booleans `true`. Storage key `gamified_picker_corn_maze_settings`. Fieldset legends: "Pacing", "Runners" ("Use participant photos as tokens"), "Sound" ("Maze sound effects", "Maze music"). Radio group name `corn-maze-speed`.

Note this factor is a time scale (bigger is faster), the inverse of Trick-or-Treat's duration multiplier.

- [ ] **Step 2: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/modes/CornMazeMode/cornMazeSettingsStore.ts src/components/modes/CornMazeMode/CornMazeSettings.tsx
git commit -m "feat(corn-maze): add persisted settings and panel"
```

---

### Task 5: Game component, mode wrapper and registration

**Files:**
- Create: `src/components/modes/CornMazeMode/CornMazeGame.tsx`
- Create: `src/components/modes/CornMazeMode/CornMazeGame.css`
- Create: `src/components/modes/CornMazeMode/CornMazeMode.tsx`
- Modify: `src/components/modes/types.ts` (add `| 'corn-maze'` to `GameMode`)
- Modify: `src/components/modes/themes.ts` (add `cornMazeTheme`)
- Modify: `src/components/modes/registry.ts` (lazy import, settings import, registry entry)

**Interfaces:**
- Consumes: everything produced by Tasks 1–4; `WinnerDialog`, `ModeViewProps`, `WinnerTheme`.
- Produces: `export function CornMazeMode(props: ModeViewProps)`, `export function CornMazeGame(props)`, and

```ts
export interface MazeWinnerDisplay {
  name: string; imageDataUrl?: string; allImages?: string[];
  isLastPlayer?: boolean; isChampion?: boolean;
}
```

- [ ] **Step 1: Add the theme, the union member and the registry entry**

```ts
// themes.ts
/** Corn Maze — tassel gold on a deep stalk green. */
export const cornMazeTheme: WinnerTheme = {
  accent: '#E8B923',
  accentSoft: 'rgba(232, 185, 35, 0.45)',
  bgGradient: 'linear-gradient(145deg, #3d4a17, #1a2109)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#FFE27A',
  fontFamily: '"Arial Black", system-ui, sans-serif',
  letterSpacing: '1px',
  buttonStyle: 'solid',
};

// registry.ts
// First out of the maze is the pick, so this orders like Racing: first out places first.
'corn-maze': { View: CornMazeMode, Settings: CornMazeSettings, theme: cornMazeTheme, label: '🌽 Corn Maze' },
```

- [ ] **Step 2: Implement `CornMazeGame.tsx` and its CSS**

Model the shell on `TrickOrTreatGame.tsx`: same `Props` shape (with `MazeWinnerDisplay`), `propsRef`, settings refs, image cache, initials helper, and the `WinnerDialog` block. CSS is `TrickOrTreatGame.css` with class names `corn-maze-game` / `corn-maze-canvas-host`, border colour `#3d4a17`, background `#c9a66b`.

State held in refs: the `Maze`, the offscreen wall canvas and the scale it was built at, the `RacePlan`, per-runner cosmetics (`entry`, `color`, `initials`, `avatar`), race time `t` in seconds, the last frame time, and the phase.

Phases: `'ready' | 'reveal' | 'race' | 'out' | 'done'`.

- Lobby: generate one maze on mount and place the roster on `pickStarts` cells, standing still; rebuild the placement when the roster signature changes.
- On `isRacing` going true: `chosen = pickFirstOut(entries)`, then a **new** `generateMaze`, `pickStarts`, and `planRace(maze, starts, EXIT_CELL, chosenIdx)`. Rebuild the wall canvas. Play the start sound, enter `reveal` for 700 ms real time with the runners fading in at their starts.
- `race`: `t += min(0.1, (now - last) / 1000) * mazeTimeScale(speed)`. Draw each runner at `poseAt(runner, plan.stepTime, t)`. A runner is `puzzled` when `moving` is false and `t > 0`. Play `playRustle` on a 220 ms throttle and `playPuzzled` when a runner enters a pause, at most once per 600 ms.
- When `t >= plan.winnerTime`: clamp `t` there so everyone else stops, play the horn and the cheer, enter `out` for 1400 ms real time. During `out` the winner token slides from the exit cell 40 px down into the pumpkin patch with `drawExitBurst`.
- At the end of `out`: call `onWinner(chosen entry)` once, enter `done`.
- Draw order: field, wall canvas, runners sorted by `y`, exit burst, caption. Runners sharing a cell are offset by `((index % 3) - 1) * 6` px on x and `((index % 2) * 2 - 1) * 4` px on y so tokens do not hide each other completely.

Captions in the bottom strip: `ready` → "ENTER THE MAZE" (or "THE MAZE IS EMPTY"), `reveal` → "A NEW MAZE!", `race` → "WHO FINDS THE WAY OUT…?", `out`/`done` → "OUT!".

`WinnerDialog` copy: `headline` is `'🏆 FIRST OUT OF THE MAZE 🏆'` when `isChampion`, otherwise `'🌽 FOUND THE WAY OUT'`; `finalsHeadline` is `'🌾 LAST ONE IN THE CORN'` when `isLastPlayer`, otherwise `'🏆 FIRST OUT OF THE MAZE 🏆'`; `nextLabel` is `'🌽 Next Maze'`; `goldTreatment={cw?.isChampion ?? false}`; `autoMinimize={false}`.

- [ ] **Step 3: Implement `CornMazeMode.tsx`**

Copy `TrickOrTreatMode.tsx`, including its four prop-sync effects and `isChampion: winOrder.size === 0`. Wrapper class `corn-maze-mode`. Start button text: `🌽 Enter the Maze ({entries.length})`.

- [ ] **Step 4: Verify**

Run: `npm run build`, `npm run lint`, `npm run test -- --run`
Expected: all exit 0; `registry.test.ts` still passes with the new entry.

- [ ] **Step 5: Manual check in the browser**

Run: `npm run dev -- --port 5174`, select "🌽 Corn Maze".
Expected, each confirmed by eye:
- 1, 2, 12 and 30 runners all play through to an exit.
- Each round shows a different maze.
- Nobody crosses a corn wall; runners walk into dead ends and come back.
- Everyone walks at the same pace; the winner card names the runner who left the maze.
- With 30 runners, tokens sharing a cell remain distinguishable.
- Switching to another tab for 30 seconds mid-race and back does not skip the finish.
- Reset mid-race stops the music and no winner card appears afterward.
- Walls and tokens are sharp on a Retina display, and stay sharp after resizing the window.

- [ ] **Step 6: Commit**

```bash
git add src/components/modes/CornMazeMode src/components/modes/types.ts src/components/modes/themes.ts src/components/modes/registry.ts
git commit -m "feat(corn-maze): add playable Corn Maze mode"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md` (mode list, and the list of modes with a Settings button)
- Modify: `CLAUDE.md` (mode list in "What this is")

- [ ] **Step 1: Add the mode to both lists**

README entry in the same style as its neighbours: what you see, that first out places first, that the pick is drawn uniformly before the maze is generated and the routes are written to produce it, that everyone walks at the same pace and loses time only to wrong turns and hesitation, and the settings.

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: describe Corn Maze mode"
```
