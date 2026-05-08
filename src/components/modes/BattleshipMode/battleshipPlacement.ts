import type { Entry } from '../../../types';

export type Cell = { x: number; y: number };

export interface Ship {
  id: number;
  entryId: number;
  entryName: string;
  color: string;
  size: number;
  cells: Cell[];
  hits: Set<string>;
  sunk: boolean;
}

export type ShipSizesMode = 'uniform' | 'random';

const RANDOM_SIZE_POOL: number[] = [2, 3, 3, 4, 5];

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

export function pickShipSizes(
  count: number,
  mode: ShipSizesMode,
  rng: () => number
): number[] {
  if (mode === 'uniform') return Array(count).fill(3);
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    sizes.push(RANDOM_SIZE_POOL[Math.floor(rng() * RANDOM_SIZE_POOL.length)]);
  }
  return sizes;
}

export function computeGridSize(shipSizes: number[]): number {
  const totalShipCells = shipSizes.reduce((a, b) => a + b, 0);
  const ideal = Math.ceil(Math.sqrt(totalShipCells / 0.25));
  return Math.min(16, Math.max(8, ideal));
}

function colorForEntryId(id: number): string {
  const hue = (id * 47) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function neighborsOf(cell: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ x: cell.x + dx, y: cell.y + dy });
    }
  }
  return out;
}

function tryPlaceOne(
  size: number,
  gridSize: number,
  occupied: Set<string>,
  rng: () => number
): Cell[] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const horizontal = rng() < 0.5;
    const maxX = horizontal ? gridSize - size : gridSize - 1;
    const maxY = horizontal ? gridSize - 1 : gridSize - size;
    if (maxX < 0 || maxY < 0) return null;
    const ox = Math.floor(rng() * (maxX + 1));
    const oy = Math.floor(rng() * (maxY + 1));
    const cells: Cell[] = [];
    for (let i = 0; i < size; i++) {
      cells.push({ x: ox + (horizontal ? i : 0), y: oy + (horizontal ? 0 : i) });
    }
    let blocked = false;
    for (const c of cells) {
      if (occupied.has(cellKey(c))) {
        blocked = true;
        break;
      }
      for (const n of neighborsOf(c)) {
        if (occupied.has(cellKey(n))) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
    }
    if (!blocked) return cells;
  }
  return null;
}

export function placeShips(
  entries: Entry[],
  shipSizes: number[],
  gridSize: number,
  rng: () => number
): Ship[] | null {
  if (entries.length !== shipSizes.length) {
    throw new Error('placeShips: entries and shipSizes length mismatch');
  }
  const indexes = entries.map((_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  // Place largest ships first within shuffled order to improve odds.
  indexes.sort((a, b) => shipSizes[b] - shipSizes[a]);

  const occupied = new Set<string>();
  const ships: Ship[] = new Array(entries.length);

  for (const idx of indexes) {
    const cells = tryPlaceOne(shipSizes[idx], gridSize, occupied, rng);
    if (!cells) return null;
    for (const c of cells) occupied.add(cellKey(c));
    ships[idx] = {
      id: idx,
      entryId: entries[idx].id,
      entryName: entries[idx].name,
      color: colorForEntryId(entries[idx].id),
      size: shipSizes[idx],
      cells,
      hits: new Set<string>(),
      sunk: false,
    };
  }

  return ships;
}

export function placeShipsWithRetry(
  entries: Entry[],
  shipSizesMode: ShipSizesMode,
  rng: () => number
): { ships: Ship[]; gridSize: number } {
  const shipSizes = pickShipSizes(entries.length, shipSizesMode, rng);
  let gridSize = computeGridSize(shipSizes);

  while (gridSize <= 20) {
    const ships = placeShips(entries, shipSizes, gridSize, rng);
    if (ships) return { ships, gridSize };
    gridSize += 1;
  }

  // Safety net: allow overlap (should never trigger in practice).
  const fallbackGrid = 20;
  const fallback: Ship[] = entries.map((entry, idx) => {
    const size = shipSizes[idx];
    const cells: Cell[] = [];
    const ox = (idx * 2) % Math.max(1, fallbackGrid - size);
    const oy = idx % fallbackGrid;
    for (let i = 0; i < size; i++) cells.push({ x: ox + i, y: oy });
    return {
      id: idx,
      entryId: entry.id,
      entryName: entry.name,
      color: colorForEntryId(entry.id),
      size,
      cells,
      hits: new Set<string>(),
      sunk: false,
    };
  });
  return { ships: fallback, gridSize: fallbackGrid };
}
