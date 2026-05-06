import type { Cell, Ship } from './battleshipPlacement';
import { cellKey } from './battleshipPlacement';

export type ShotType = 'cannon' | 'broadside' | 'depthCharge';
export type TargetingMode = 'hunt' | 'target';

export interface ShotResult {
  type: ShotType;
  center: Cell;
  cells: Cell[];
  hits: Cell[];
  misses: Cell[];
  sunkShipIds: number[];
}

export interface RoundState {
  gridSize: number;
  ships: Ship[];
  shots: ShotResult[];
  shotCells: Set<string>;
  targetingMode: TargetingMode;
  targetQueue: Cell[];
}

function inBounds(c: Cell, gridSize: number): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < gridSize && c.y < gridSize;
}

export function rollShotType(rng: () => number): ShotType {
  const r = rng();
  if (r < 0.7) return 'cannon';
  if (r < 0.9) return 'broadside';
  return 'depthCharge';
}

export function pickShotCenter(state: RoundState, rng: () => number): Cell {
  // Drain stale (already-shot or out-of-bounds) cells from the front of the queue.
  while (state.targetQueue.length > 0) {
    const head = state.targetQueue[0];
    if (state.shotCells.has(cellKey(head)) || !inBounds(head, state.gridSize)) {
      state.targetQueue.shift();
      continue;
    }
    break;
  }

  if (state.targetingMode === 'target' && state.targetQueue.length > 0) {
    return state.targetQueue.shift()!;
  }

  // Hunt mode: uniformly random un-shot cell.
  const total = state.gridSize * state.gridSize;
  const remaining = total - state.shotCells.size;
  if (remaining <= 0) {
    return { x: 0, y: 0 };
  }
  let pickIndex = Math.floor(rng() * remaining);
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      if (state.shotCells.has(`${x},${y}`)) continue;
      if (pickIndex === 0) return { x, y };
      pickIndex -= 1;
    }
  }
  return { x: 0, y: 0 };
}

export function expandShot(
  center: Cell,
  type: ShotType,
  gridSize: number,
  rng: () => number
): Cell[] {
  const cells: Cell[] = [];
  const push = (c: Cell) => {
    if (inBounds(c, gridSize)) cells.push(c);
  };

  if (type === 'cannon') {
    push(center);
  } else if (type === 'broadside') {
    const horizontal = rng() < 0.5;
    if (horizontal) {
      push({ x: center.x - 1, y: center.y });
      push(center);
      push({ x: center.x + 1, y: center.y });
    } else {
      push({ x: center.x, y: center.y - 1 });
      push(center);
      push({ x: center.x, y: center.y + 1 });
    }
  } else {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }

  const seen = new Set<string>();
  return cells.filter((c) => {
    const k = cellKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fourNeighbors(cell: Cell): Cell[] {
  return [
    { x: cell.x - 1, y: cell.y },
    { x: cell.x + 1, y: cell.y },
    { x: cell.x, y: cell.y - 1 },
    { x: cell.x, y: cell.y + 1 },
  ];
}

export function applyShot(
  state: RoundState,
  type: ShotType,
  center: Cell,
  cells: Cell[]
): { result: ShotResult; firstSunkEntryId: number | null } {
  const hits: Cell[] = [];
  const misses: Cell[] = [];
  const newlyHitShipIds = new Set<number>();
  const sunkShips: Ship[] = [];

  for (const cell of cells) {
    const k = cellKey(cell);
    if (state.shotCells.has(k)) continue;
    state.shotCells.add(k);

    const ship = state.ships.find(
      (s) => !s.sunk && s.cells.some((sc) => sc.x === cell.x && sc.y === cell.y)
    );
    if (ship) {
      ship.hits.add(k);
      hits.push(cell);
      newlyHitShipIds.add(ship.id);
      if (ship.cells.every((sc) => ship.hits.has(cellKey(sc)))) {
        ship.sunk = true;
        sunkShips.push(ship);
      }
    } else {
      misses.push(cell);
    }
  }

  // For each fresh hit on a still-alive ship, queue 4-neighbors.
  for (const cell of hits) {
    const ship = state.ships.find((s) =>
      s.cells.some((sc) => sc.x === cell.x && sc.y === cell.y)
    );
    if (!ship || ship.sunk) continue;
    for (const n of fourNeighbors(cell)) {
      if (!inBounds(n, state.gridSize)) continue;
      if (state.shotCells.has(cellKey(n))) continue;
      state.targetQueue.push(n);
    }
  }

  // Drop queued cells whose only nearby hits were on now-sunk ships.
  if (sunkShips.length > 0) {
    state.targetQueue = state.targetQueue.filter((q) => {
      for (const n of fourNeighbors(q)) {
        if (state.ships.some((s) => !s.sunk && s.hits.has(cellKey(n)))) {
          return true;
        }
      }
      return false;
    });
  }

  if (newlyHitShipIds.size > 0) {
    state.targetingMode = 'target';
  }
  if (state.targetQueue.length === 0) {
    state.targetingMode = 'hunt';
  }

  const result: ShotResult = {
    type,
    center,
    cells,
    hits,
    misses,
    sunkShipIds: sunkShips.map((s) => s.id),
  };
  state.shots.push(result);

  let firstSunkEntryId: number | null = null;
  if (sunkShips.length > 0) {
    sunkShips.sort((a, b) => a.entryId - b.entryId);
    firstSunkEntryId = sunkShips[0].entryId;
  }
  return { result, firstSunkEntryId };
}
