import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry, maze generation, path questions and the pick for Corn Maze.
 *
 * Fairness: the runner who gets out first is drawn uniformly *before* the maze
 * exists (`pickFirstOut`). The maze, the start cells and every route are
 * generated afterwards and written around that draw — see mazeRace.ts — so
 * where a runner happens to be dropped has no bearing on whether they win.
 * mazeEngine.test.ts proves the draw is uniform over participants and over
 * list positions.
 */
export const MAZE = {
  CANVAS_W: 720,
  CANVAS_H: 560,
  /** The rectangle every maze is fitted into. */
  FIELD_X: 18,
  FIELD_W: 684,
  FIELD_H: 468,
  /** Top edge of every maze; the bottom edge is always ORIGIN_Y + FIELD_H. */
  ORIGIN_Y: 56,
  RUNNER_R: 11,
} as const;

/**
 * One size of maze. The field is the same on screen whatever the grid, so a
 * smaller grid means wider paths and far fewer turnings — a simpler maze.
 */
export interface MazeLayout {
  cols: number;
  rows: number;
  /** Side of one cell, in canvas pixels. */
  cell: number;
  /** Left edge of column 0; the grid is centred in the field. */
  originX: number;
  /** Middle of the bottom row; the exit opens downward from it. */
  exitCell: number;
  /** Preferred start band: cells from the exit, by path. */
  minStartDist: number;
  maxStartDist: number;
  /** Walking pace in cells per second, slower where the cells are bigger. */
  walkCps: number;
}

function makeLayout(cols: number, rows: number, minStartDist: number, maxStartDist: number, walkCps: number): MazeLayout {
  const cell = MAZE.FIELD_H / rows;
  return {
    cols,
    rows,
    cell,
    originX: MAZE.FIELD_X + (MAZE.FIELD_W - cols * cell) / 2,
    exitCell: (rows - 1) * cols + (cols - 1) / 2,
    minStartDist,
    maxStartDist,
    walkCps,
  };
}

/**
 * Smallest first. Columns are odd so the exit sits in the middle. `upTo` is
 * the largest field of runners the size is used for: the maze starts simple
 * and gets simpler still as runners get out and the field thins.
 */
const SIZES: readonly { upTo: number; layout: MazeLayout }[] = [
  { upTo: 6, layout: makeLayout(7, 5, 4, 12, 2.6) },
  { upTo: 18, layout: makeLayout(9, 7, 6, 18, 3) },
  { upTo: 40, layout: makeLayout(13, 9, 8, 26, 3.6) },
  { upTo: Infinity, layout: makeLayout(19, 13, 14, 44, 4.5) },
];

export const LAYOUTS: readonly MazeLayout[] = SIZES.map((s) => s.layout);

/** The maze size for a field of `count` runners. Always the same object for the same size. */
export function layoutFor(count: number): MazeLayout {
  return (SIZES.find((s) => count <= s.upTo) ?? SIZES[SIZES.length - 1]).layout;
}

/** Passage bits per cell. A set bit means you can walk that way. */
export const DIR = { N: 1, E: 2, S: 4, W: 8 } as const;

/** cell = row * cols + col */
export interface Maze {
  cols: number;
  rows: number;
  open: Uint8Array;
  layout: MazeLayout;
}

interface Step { bit: number; opposite: number; dc: number; dr: number }

const STEPS: readonly Step[] = [
  { bit: DIR.N, opposite: DIR.S, dc: 0, dr: -1 },
  { bit: DIR.E, opposite: DIR.W, dc: 1, dr: 0 },
  { bit: DIR.S, opposite: DIR.N, dc: 0, dr: 1 },
  { bit: DIR.W, opposite: DIR.E, dc: -1, dr: 0 },
];

/** A random index below `n` that can never land on `n` itself. */
export function randIndex(n: number, rand: () => number): number {
  return Math.min(n - 1, Math.floor(rand() * n));
}

export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randIndex(i + 1, rand);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * A perfect maze (a spanning tree of the grid): every cell reaches every
 * other by exactly one route. Iterative depth-first backtracker, so a large
 * grid cannot blow the call stack.
 */
export function generateMaze(layout: MazeLayout, rand: () => number = Math.random): Maze {
  const { cols, rows } = layout;
  const count = cols * rows;
  const open = new Uint8Array(count);
  if (count === 0) return { cols, rows, open, layout };

  const visited = new Uint8Array(count);
  const stack: number[] = [randIndex(count, rand)];
  visited[stack[0]] = 1;

  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const col = cell % cols;
    const row = Math.floor(cell / cols);

    const options: { step: Step; next: number }[] = [];
    for (const step of STEPS) {
      const c = col + step.dc;
      const r = row + step.dr;
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const next = r * cols + c;
      if (!visited[next]) options.push({ step, next });
    }

    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const { step, next } = options[randIndex(options.length, rand)];
    open[cell] |= step.bit;
    open[next] |= step.opposite;
    visited[next] = 1;
    stack.push(next);
  }

  return { cols, rows, open, layout };
}

/** Cells reachable in one step through an open passage. */
export function neighbors(maze: Maze, cell: number): number[] {
  const out: number[] = [];
  const col = cell % maze.cols;
  const row = Math.floor(cell / maze.cols);
  for (const step of STEPS) {
    if (!(maze.open[cell] & step.bit)) continue;
    const c = col + step.dc;
    const r = row + step.dr;
    if (c < 0 || c >= maze.cols || r < 0 || r >= maze.rows) continue;
    out.push(r * maze.cols + c);
  }
  return out;
}

/** Path length in steps from `from` to every cell (-1 where unreachable). */
export function distancesFrom(maze: Maze, from: number): Int16Array {
  const dist = new Int16Array(maze.cols * maze.rows).fill(-1);
  dist[from] = 0;
  const queue: number[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const n of neighbors(maze, cell)) {
      if (dist[n] >= 0) continue;
      dist[n] = dist[cell] + 1;
      queue.push(n);
    }
  }
  return dist;
}

/** Cells from `from` to `to` inclusive. Empty when there is no way through. */
export function shortestPath(maze: Maze, from: number, to: number): number[] {
  const dist = distancesFrom(maze, to);
  if (dist[from] < 0) return [];
  const path = [from];
  let cell = from;
  while (cell !== to) {
    const next = neighbors(maze, cell).find((n) => dist[n] === dist[cell] - 1);
    if (next === undefined) return [];
    path.push(next);
    cell = next;
  }
  return path;
}

/**
 * `count` distinct start cells, never the exit cell.
 *
 * Cells a fair walk from the exit are preferred; only when that band cannot
 * hold everyone does the rest of the maze fill in, nearest the band first.
 */
export function pickStarts(
  maze: Maze,
  count: number,
  rand: () => number = Math.random,
): number[] {
  if (count <= 0) return [];
  const { exitCell, minStartDist, maxStartDist } = maze.layout;
  const dist = distancesFrom(maze, exitCell);
  const inBand: number[] = [];
  const outside: { cell: number; gap: number }[] = [];
  for (let cell = 0; cell < dist.length; cell++) {
    if (cell === exitCell || dist[cell] < 0) continue;
    const d = dist[cell];
    if (d >= minStartDist && d <= maxStartDist) inBand.push(cell);
    else outside.push({ cell, gap: d < minStartDist ? minStartDist - d : d - maxStartDist });
  }

  const starts = shuffled(inBand, rand).slice(0, count);
  if (starts.length < count) {
    // Shuffle first so cells the same distance outside the band tie randomly.
    const filler = shuffled(outside, rand).sort((a, b) => a.gap - b.gap);
    for (const f of filler) {
      if (starts.length >= count) break;
      starts.push(f.cell);
    }
  }
  return starts;
}

/** Canvas-pixel centre of a cell. */
export function cellCenter(layout: MazeLayout, cell: number): { x: number; y: number } {
  const col = cell % layout.cols;
  const row = Math.floor(cell / layout.cols);
  return {
    x: layout.originX + (col + 0.5) * layout.cell,
    y: MAZE.ORIGIN_Y + (row + 0.5) * layout.cell,
  };
}

/** The runner who finds the way out. Uniform over everyone still in the corn. */
export function pickFirstOut(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}
