import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  DIR, LAYOUTS, MAZE, cellCenter, distancesFrom, generateMaze, layoutFor, neighbors,
  pickFirstOut, pickStarts, shortestPath, type MazeLayout,
} from './mazeEngine';

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

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

const cellsOf = (layout: MazeLayout) => layout.cols * layout.rows;
const make = (layout: MazeLayout, seed: number) => generateMaze(layout, seeded(seed));

describe('layoutFor', () => {
  it('starts simple and gets simpler as the field thins', () => {
    let prev = Infinity;
    for (let n = MAX_PARTICIPANTS; n >= 1; n--) {
      const cells = cellsOf(layoutFor(n));
      expect(cells, `${n}`).toBeLessThanOrEqual(prev);
      prev = cells;
    }
    expect(cellsOf(layoutFor(1))).toBeLessThan(cellsOf(layoutFor(MAX_PARTICIPANTS)));
    // A full house still gets a much smaller maze than the biggest there is.
    expect(cellsOf(layoutFor(MAX_PARTICIPANTS))).toBeLessThanOrEqual(13 * 9);
  });

  it('always has room for everyone, a centred exit and a start band that fits', () => {
    for (const n of COUNTS) expect(cellsOf(layoutFor(n)) - 1, `${n}`).toBeGreaterThanOrEqual(n * 2);
    for (const layout of LAYOUTS) {
      expect(layout.cols % 2).toBe(1);
      expect(layout.exitCell).toBe((layout.rows - 1) * layout.cols + (layout.cols - 1) / 2);
      expect(layout.minStartDist).toBeLessThan(layout.maxStartDist);
      expect(layout.cell * layout.rows).toBeCloseTo(MAZE.FIELD_H, 6);
      expect(layout.cell * layout.cols).toBeLessThanOrEqual(MAZE.FIELD_W + 1e-6);
    }
  });
});

describe('generateMaze', () => {
  it('connects every cell to every other with exactly one route', () => {
    for (const layout of LAYOUTS) for (const seed of SEEDS) {
      const maze = make(layout, seed);
      const cells = cellsOf(layout);
      // Reachable from the exit...
      const dist = distancesFrom(maze, layout.exitCell);
      for (let c = 0; c < cells; c++) expect(dist[c], `${seed}/${c}`).toBeGreaterThanOrEqual(0);
      // ...and a tree: cells - 1 passages, each counted from both sides.
      let bits = 0;
      for (let c = 0; c < cells; c++) for (const d of [DIR.N, DIR.E, DIR.S, DIR.W]) if (maze.open[c] & d) bits++;
      expect(bits / 2, `${seed}`).toBe(cells - 1);
    }
  });

  it('opens every passage from both sides and never through the border', () => {
    for (const layout of LAYOUTS) {
      const maze = make(layout, 3);
      for (let c = 0; c < cellsOf(layout); c++) {
        const col = c % layout.cols;
        const row = Math.floor(c / layout.cols);
        if (row === 0) expect(maze.open[c] & DIR.N).toBe(0);
        if (row === layout.rows - 1) expect(maze.open[c] & DIR.S).toBe(0);
        if (col === 0) expect(maze.open[c] & DIR.W).toBe(0);
        if (col === layout.cols - 1) expect(maze.open[c] & DIR.E).toBe(0);
        for (const n of neighbors(maze, c)) expect(neighbors(maze, n)).toContain(c);
      }
    }
  });

  it('builds a different maze from a different seed', () => {
    for (const layout of LAYOUTS) {
      expect(Array.from(make(layout, 1).open)).not.toEqual(Array.from(make(layout, 2).open));
    }
  });
});

describe('shortestPath', () => {
  it('walks only through open passages, end to end', () => {
    for (const layout of LAYOUTS) {
      const maze = make(layout, 5);
      const exit = layout.exitCell;
      const dist = distancesFrom(maze, exit);
      for (const from of [0, layout.cols - 1, cellsOf(layout) - 1, layout.cols + 1]) {
        const path = shortestPath(maze, from, exit);
        expect(path[0]).toBe(from);
        expect(path[path.length - 1]).toBe(exit);
        expect(path.length - 1).toBe(dist[from]);
        for (let i = 1; i < path.length; i++) expect(neighbors(maze, path[i - 1])).toContain(path[i]);
      }
      expect(shortestPath(maze, exit, exit)).toEqual([exit]);
    }
  });
});

describe('pickStarts', () => {
  it('gives everyone their own cell, never the exit', () => {
    for (const n of COUNTS) for (const seed of [1, 2, 3]) {
      const maze = make(layoutFor(n), seed);
      const starts = pickStarts(maze, n, seeded(seed + 50));
      expect(starts, `${n}/${seed}`).toHaveLength(n);
      expect(new Set(starts).size, `${n}/${seed}`).toBe(n);
      expect(starts).not.toContain(maze.layout.exitCell);
    }
    expect(pickStarts(make(layoutFor(1), 1), 0)).toEqual([]);
  });

  it('prefers cells a fair walk from the exit', () => {
    for (const layout of LAYOUTS) for (const seed of SEEDS) {
      const maze = make(layout, seed);
      const dist = distancesFrom(maze, layout.exitCell);
      let inBand = 0;
      for (let c = 0; c < cellsOf(layout); c++) {
        if (dist[c] >= layout.minStartDist && dist[c] <= layout.maxStartDist) inBand++;
      }
      const n = Math.min(MAX_PARTICIPANTS, inBand);
      for (const s of pickStarts(maze, n, seeded(seed))) {
        expect(dist[s], `${seed}`).toBeGreaterThanOrEqual(layout.minStartDist);
        expect(dist[s], `${seed}`).toBeLessThanOrEqual(layout.maxStartDist);
      }
    }
  });
});

describe('cellCenter', () => {
  it('keeps every cell on the canvas above the exit patch', () => {
    for (const layout of LAYOUTS) for (let c = 0; c < cellsOf(layout); c++) {
      const p = cellCenter(layout, c);
      expect(p.x - layout.cell / 2).toBeGreaterThanOrEqual(MAZE.FIELD_X - 1e-6);
      expect(p.x + layout.cell / 2).toBeLessThanOrEqual(MAZE.FIELD_X + MAZE.FIELD_W + 1e-6);
      expect(p.y - layout.cell / 2).toBeGreaterThanOrEqual(MAZE.ORIGIN_Y - 1e-6);
      expect(p.y + layout.cell / 2).toBeLessThanOrEqual(MAZE.CANVAS_H - 30);
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
