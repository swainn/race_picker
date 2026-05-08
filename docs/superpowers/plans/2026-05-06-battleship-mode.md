# Battleship Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6th game mode (`battleship`) to the picker: each participant gets a ship on an auto-sized grid; rapid-fire shots with three types (cannon/broadside/depth charge) hunt+target ships; first ship sunk is the pick.

**Architecture:** Standard self-contained mode under `src/components/modes/BattleshipMode/`. Two pure helper modules (placement + targeting) keep canvas-free logic isolated. Canvas grid component + mode wrapper compose them into the `ModeViewProps` contract.

**Tech Stack:** React + TypeScript + Vite. Verification via `npx tsc --noEmit` + Vite dev server transform check (no automated tests in this repo).

**Source spec:** `docs/superpowers/specs/2026-05-06-battleship-mode-design.md`

---

## Parallelization note

The 5 implementation tasks are **mostly sequential** because each consumes types/components from the previous one (helpers → canvas → wrapper → wiring). The work is tightly coupled and small (~600 LoC); attempting to parallelize would burn more time on coordination than it would save.

## File Structure

```
src/components/modes/BattleshipMode/
  battleshipPlacement.ts          ← pure: grid sizing + ship placement
  battleshipTargeting.ts          ← pure: shot center selection + shot expansion + apply
  BattleshipGrid.tsx              ← canvas: draws grid, ships, shots, banner
  BattleshipGrid.css
  BattleshipMode.tsx              ← wrapper: settings UI + game loop + ModeViewProps
  BattleshipMode.css

src/components/modes/types.ts     ← MODIFY: extend GameMode union
src/App.tsx                       ← MODIFY: import + MODES entry + router case
```

---

## Task 1: Wire up the GameMode + placeholder

**Goal:** Land a working `battleship` entry in the dropdown that renders a placeholder. Lets us verify the wiring before any real code lands.

**Files:**
- Modify: `src/components/modes/types.ts`
- Modify: `src/App.tsx`
- Create: `src/components/modes/BattleshipMode/BattleshipMode.tsx` (placeholder)

### Steps

- [ ] **Step 1.1: Extend `GameMode` union**

Edit `src/components/modes/types.ts`. Change:

```typescript
export type GameMode =
  | 'racing'
  | 'battle-bots'
  | 'light-cycles'
  | 'plinko'
  | 'wall-climber';
```

To:

```typescript
export type GameMode =
  | 'racing'
  | 'battle-bots'
  | 'light-cycles'
  | 'plinko'
  | 'wall-climber'
  | 'battleship';
```

- [ ] **Step 1.2: Create the placeholder `BattleshipMode` component**

Create `src/components/modes/BattleshipMode/BattleshipMode.tsx`:

```typescript
import type { ModeViewProps } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BattleshipMode(_props: ModeViewProps) {
  return (
    <div className="mode-placeholder">
      🚢 Battleship mode — under construction
    </div>
  );
}
```

- [ ] **Step 1.3: Wire into `App.tsx`**

In `src/App.tsx`:

1. Add the import alongside the other mode imports:

```typescript
import { BattleshipMode } from './components/modes/BattleshipMode/BattleshipMode';
```

2. Append to the `MODES` array (after `wall-climber`):

```typescript
{ value: 'battleship', label: '🚢 Battleship' },
```

3. Add the case to the `renderMode` switch (after `wall-climber`):

```typescript
case 'battleship':
  return <BattleshipMode {...modeProps} />;
```

- [ ] **Step 1.4: Verify**

```bash
npx tsc --noEmit
```

Expected: clean.

```bash
npm run dev
```

Open the dev URL. Switch the mode dropdown to "🚢 Battleship". Verify the placeholder renders. Stop the dev server.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/modes/types.ts src/App.tsx src/components/modes/BattleshipMode/
git commit -m "Wire up Battleship mode placeholder

Adds 'battleship' to GameMode union, dropdown options, and App router.
Placeholder ModeView lands so subsequent tasks can replace it without
touching App.tsx again."
```

---

## Task 2: Pure helpers — placement

**Goal:** Pure functions that compute grid size and place ships, with deterministic RNG injection.

**Files:**
- Create: `src/components/modes/BattleshipMode/battleshipPlacement.ts`

### Steps

- [ ] **Step 2.1: Write `battleshipPlacement.ts`**

Create `src/components/modes/BattleshipMode/battleshipPlacement.ts`:

```typescript
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
  // Target ~25% coverage. ceil(sqrt(total / 0.25)).
  const ideal = Math.ceil(Math.sqrt(totalShipCells / 0.25));
  return Math.min(16, Math.max(8, ideal));
}

function colorForEntryId(id: number): string {
  // Stable HSL hue per id, fixed sat/lightness.
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
    const ox = Math.floor(rng() * (maxX + 1));
    const oy = Math.floor(rng() * (maxY + 1));
    const cells: Cell[] = [];
    for (let i = 0; i < size; i++) {
      cells.push({ x: ox + (horizontal ? i : 0), y: oy + (horizontal ? 0 : i) });
    }
    // Reject if any cell or 8-neighbor touches an existing ship.
    let blocked = false;
    for (const c of cells) {
      if (occupied.has(cellKey(c))) { blocked = true; break; }
      for (const n of neighborsOf(c)) {
        if (occupied.has(cellKey(n))) { blocked = true; break; }
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
  // Shuffle order so first-placed (typically biggest) ships don't always go first.
  const indexes = entries.map((_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  // Place largest first within shuffled order to improve odds.
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
  const fallback: Ship[] = entries.map((entry, idx) => {
    const size = shipSizes[idx];
    const cells: Cell[] = [];
    const ox = (idx * 2) % Math.max(1, 20 - size);
    const oy = idx % 20;
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
  return { ships: fallback, gridSize: 20 };
}
```

- [ ] **Step 2.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2.3: Commit**

```bash
git add src/components/modes/BattleshipMode/battleshipPlacement.ts
git commit -m "Add Battleship placement helpers

Pure functions for grid sizing, size selection, and ship placement
with breathing-room (8-neighbor) constraint. RNG is injected so the
caller can swap in a deterministic source for testing/replays."
```

---

## Task 3: Pure helpers — targeting

**Goal:** Pure functions that pick a shot center cell (hunt or target), roll a shot type, expand the affected cells, and apply the result to a round state.

**Files:**
- Create: `src/components/modes/BattleshipMode/battleshipTargeting.ts`

### Steps

- [ ] **Step 3.1: Write `battleshipTargeting.ts`**

Create `src/components/modes/BattleshipMode/battleshipTargeting.ts`:

```typescript
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
  // Drain stale (already-shot) cells from the front of the queue.
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

  // Hunt: uniformly random un-shot cell.
  const total = state.gridSize * state.gridSize;
  const remaining = total - state.shotCells.size;
  if (remaining <= 0) {
    // Should not happen during a normal round; pick (0,0) as a defensive fallback.
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
  const push = (c: Cell) => { if (inBounds(c, gridSize)) cells.push(c); };

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
    // 3x3 area.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }
  // Deduplicate (clip can leave duplicates only if center went out of bounds — guard anyway).
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

/**
 * Apply a shot to the round state. Mutates `state` in place. Returns the
 * ShotResult (so callers can render it) and the entryId of the FIRST ship
 * sunk by this shot, if any. If multiple ships sink in the same shot,
 * the smallest entryId wins (deterministic tiebreak).
 */
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

  // Update target queue: every hit on a not-yet-sunk ship pushes its
  // 4-neighbors; remove neighbors of newly-sunk ships.
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
  // Drop queued cells that were neighbors only of newly-sunk ships' cells.
  if (sunkShips.length > 0) {
    const sunkCellKeys = new Set<string>();
    for (const s of sunkShips) for (const c of s.cells) sunkCellKeys.add(cellKey(c));
    state.targetQueue = state.targetQueue.filter((q) => {
      // Keep a queued cell if any of its 4-neighbors is a hit on a still-alive ship.
      for (const n of fourNeighbors(q)) {
        if (state.ships.some(
          (s) => !s.sunk && s.hits.has(cellKey(n))
        )) {
          return true;
        }
      }
      return false;
    });
  }

  // Update targeting mode.
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
```

- [ ] **Step 3.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/modes/BattleshipMode/battleshipTargeting.ts
git commit -m "Add Battleship targeting helpers

Pure functions for shot center selection (hunt/target state machine),
shot type rolling at 70/20/10 distribution, multi-cell shot expansion
(cannon/broadside/depth charge with grid clipping), and applying a
shot to round state with deterministic sink tiebreaking."
```

---

## Task 4: Canvas grid component

**Goal:** Render the grid, ships, shots, and sink banner on a canvas. Re-renders each frame from the live `RoundState` ref provided by the wrapper.

**Files:**
- Create: `src/components/modes/BattleshipMode/BattleshipGrid.tsx`
- Create: `src/components/modes/BattleshipMode/BattleshipGrid.css`

### Steps

- [ ] **Step 4.1: Write `BattleshipGrid.css`**

Create `src/components/modes/BattleshipMode/BattleshipGrid.css`:

```css
.battleship-grid-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.battleship-canvas {
  background: #0a2540;
  border-radius: 12px;
  border: 2px solid #143a66;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  max-width: 100%;
  height: auto;
}

.battleship-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(10, 37, 64, 0.92);
  border: 3px solid #ff6b6b;
  border-radius: 12px;
  padding: 24px 40px;
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 12px rgba(255, 107, 107, 0.8);
  pointer-events: none;
  z-index: 5;
}

.battleship-canvas-host {
  position: relative;
  display: inline-block;
}

.battleship-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: center;
  max-width: 100%;
  padding: 8px;
}

.battleship-legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #1a3a5a;
  border: 1px solid #2c4d70;
  border-radius: 999px;
  font-size: 13px;
  color: #f0eee9;
}

.battleship-legend-chip.sunk {
  opacity: 0.45;
  text-decoration: line-through;
}

.battleship-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
```

- [ ] **Step 4.2: Write `BattleshipGrid.tsx`**

Create `src/components/modes/BattleshipMode/BattleshipGrid.tsx`:

```typescript
import { useEffect, useRef } from 'react';
import type { Cell, Ship } from './battleshipPlacement';
import { cellKey } from './battleshipPlacement';
import type { RoundState, ShotResult } from './battleshipTargeting';
import './BattleshipGrid.css';

export type Visibility = 'hidden' | 'ghosted' | 'visible';

interface Props {
  stateRef: React.MutableRefObject<RoundState | null>;
  visibility: Visibility;
  bannerName: string | null;
  /** Bumped by the wrapper after each shot to trigger a redraw. */
  frameKey: number;
}

const MAX_CANVAS = 640; // px on the longer side
const MIN_CELL = 24;

function cellPx(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_CANVAS / gridSize));
}

function drawGrid(ctx: CanvasRenderingContext2D, gridSize: number, cell: number) {
  ctx.fillStyle = '#0a2540';
  ctx.fillRect(0, 0, gridSize * cell, gridSize * cell);
  ctx.strokeStyle = '#143a66';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, gridSize * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(gridSize * cell, i * cell);
    ctx.stroke();
  }
}

function drawShipBody(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  alpha: number,
  fillColor: string
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;
  for (const c of ship.cells) {
    ctx.fillRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
  }
  // Outline.
  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  ctx.strokeStyle = ship.color;
  ctx.lineWidth = 2;
  for (const c of ship.cells) {
    ctx.strokeRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}

function drawShips(
  ctx: CanvasRenderingContext2D,
  ships: Ship[],
  cell: number,
  visibility: Visibility
) {
  for (const ship of ships) {
    if (ship.sunk) {
      drawShipBody(ctx, ship, cell, 0.85, ship.color);
      // X mark across hull.
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      for (const c of ship.cells) {
        ctx.beginPath();
        ctx.moveTo(c.x * cell + 4, c.y * cell + 4);
        ctx.lineTo((c.x + 1) * cell - 4, (c.y + 1) * cell - 4);
        ctx.moveTo((c.x + 1) * cell - 4, c.y * cell + 4);
        ctx.lineTo(c.x * cell + 4, (c.y + 1) * cell - 4);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (visibility === 'visible') {
      drawShipBody(ctx, ship, cell, 0.9, ship.color);
    } else if (visibility === 'ghosted') {
      drawShipBody(ctx, ship, cell, 0.25, ship.color);
    }
    // For 'hidden', only draw on-hit cells (handled in drawShots).
  }
}

function drawShots(
  ctx: CanvasRenderingContext2D,
  shots: ShotResult[],
  ships: Ship[],
  cell: number,
  visibility: Visibility
) {
  for (const shot of shots) {
    for (const c of shot.misses) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, cell * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const c of shot.hits) {
      // If hidden, reveal the segment as the ship's color first.
      if (visibility === 'hidden') {
        const ship = ships.find((s) =>
          s.cells.some((sc) => sc.x === c.x && sc.y === c.y)
        );
        if (ship) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = ship.color;
          ctx.fillRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
          ctx.restore();
        }
      }
      // Red explosion overlay.
      ctx.save();
      ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.beginPath();
      ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const cx = c.x * cell + cell / 2;
      const cy = c.y * cell + cell / 2;
      const r = cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Most-recent broadside / depth-charge afterglow on top.
  if (shots.length > 0) {
    const last = shots[shots.length - 1];
    if (last.type !== 'cannon') {
      ctx.save();
      ctx.strokeStyle = last.type === 'broadside' ? '#ffd166' : '#ff6b6b';
      ctx.lineWidth = 2;
      for (const c of last.cells) {
        ctx.strokeRect(c.x * cell + 1, c.y * cell + 1, cell - 2, cell - 2);
      }
      ctx.restore();
    }
  }
}

export function BattleshipGrid({ stateRef, visibility, bannerName, frameKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const cell = cellPx(state.gridSize);
    const dim = state.gridSize * cell;
    if (canvas.width !== dim) canvas.width = dim;
    if (canvas.height !== dim) canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGrid(ctx, state.gridSize, cell);
    drawShips(ctx, state.ships, cell, visibility);
    drawShots(ctx, state.shots, state.ships, cell, visibility);
  }, [frameKey, visibility, stateRef]);

  const ships = stateRef.current?.ships ?? [];

  return (
    <div className="battleship-grid-wrap">
      <div className="battleship-canvas-host">
        <canvas ref={canvasRef} className="battleship-canvas" />
        {bannerName && (
          <div className="battleship-banner">💥 {bannerName} sunk! 💥</div>
        )}
      </div>
      <div className="battleship-legend">
        {ships.map((s: Ship) => (
          <span
            key={s.id}
            className={`battleship-legend-chip${s.sunk ? ' sunk' : ''}`}
          >
            <span
              className="battleship-legend-swatch"
              style={{ background: s.color }}
            />
            {s.entryName}
          </span>
        ))}
      </div>
    </div>
  );
}

// Re-export cellKey so wrappers don't have to import from two modules.
export { cellKey };
```

- [ ] **Step 4.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/modes/BattleshipMode/BattleshipGrid.tsx src/components/modes/BattleshipMode/BattleshipGrid.css
git commit -m "Add BattleshipGrid canvas component

Renders the grid, ships (per visibility setting), shots (cannon
splashes, hit explosions, broadside/depth-charge afterglow), and a
sink banner. Driven by a frameKey bump from the wrapper after each
shot resolution. Includes a participant legend below the canvas."
```

---

## Task 5: Mode wrapper + game loop + settings UI

**Goal:** Replace the placeholder with the real `BattleshipMode`. Owns the round state, game loop, settings persistence, and forwarding to `props.onWinner`.

**Files:**
- Modify: `src/components/modes/BattleshipMode/BattleshipMode.tsx`
- Create: `src/components/modes/BattleshipMode/BattleshipMode.css`

### Steps

- [ ] **Step 5.1: Write `BattleshipMode.css`**

Create `src/components/modes/BattleshipMode/BattleshipMode.css`:

```css
.battleship-mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.battleship-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  background: #1a3a5a;
  border: 1px solid #2c4d70;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 13px;
  color: #f0eee9;
}

.battleship-settings fieldset {
  border: none;
  margin: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.battleship-settings legend {
  font-weight: 600;
  color: #aac9e8;
  margin-right: 4px;
}

.battleship-settings label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.battleship-settings input[type="radio"] {
  cursor: pointer;
}
```

- [ ] **Step 5.2: Replace `BattleshipMode.tsx` with the real implementation**

Replace `src/components/modes/BattleshipMode/BattleshipMode.tsx` with:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../types';
import {
  placeShipsWithRetry,
  type Ship,
  type ShipSizesMode,
} from './battleshipPlacement';
import {
  applyShot,
  expandShot,
  pickShotCenter,
  rollShotType,
  type RoundState,
} from './battleshipTargeting';
import { BattleshipGrid, type Visibility } from './BattleshipGrid';
import './BattleshipMode.css';

const SETTINGS_KEY = 'gamified_picker_battleship_settings';
const SHOT_INTERVAL_MS = 220;
const BANNER_DURATION_MS = 1500;

interface Settings {
  shipSizes: ShipSizesMode;
  visibility: Visibility;
}

const DEFAULT_SETTINGS: Settings = {
  shipSizes: 'uniform',
  visibility: 'ghosted',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      shipSizes:
        parsed.shipSizes === 'random' ? 'random' : 'uniform',
      visibility:
        parsed.visibility === 'hidden' || parsed.visibility === 'visible'
          ? parsed.visibility
          : 'ghosted',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function buildRound(entries: ModeViewProps['entries'], settings: Settings): RoundState {
  const { ships, gridSize } = placeShipsWithRetry(entries, settings.shipSizes, Math.random);
  return {
    gridSize,
    ships,
    shots: [],
    shotCells: new Set<string>(),
    targetingMode: 'hunt',
    targetQueue: [],
  };
}

export function BattleshipMode(props: ModeViewProps) {
  const {
    entries,
    eliminatedIds,
    isRacing,
    onWinner,
    onStartRace,
    onResetRace,
  } = props;

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [frameKey, setFrameKey] = useState(0);
  const [bannerName, setBannerName] = useState<string | null>(null);
  const [roundSeed, setRoundSeed] = useState(0);

  const stateRef = useRef<RoundState | null>(null);
  const intervalRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const winnerSentRef = useRef<boolean>(false);

  // (Re)build round whenever entries change, settings change, or roundSeed bumps.
  // We key on entry ids so swapping the list reorders.
  const entryIdsKey = useMemo(
    () => entries.map((e) => e.id).join(','),
    [entries]
  );

  useEffect(() => {
    if (entries.length < 2) {
      stateRef.current = null;
      setFrameKey((k) => k + 1);
      return;
    }
    stateRef.current = buildRound(entries, settings);
    winnerSentRef.current = false;
    setBannerName(null);
    setFrameKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIdsKey, settings.shipSizes, roundSeed]);

  // Stop the loop when the parent says we're not racing, or on unmount.
  useEffect(() => {
    if (!isRacing) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (!stateRef.current) return;
    if (winnerSentRef.current) return;

    intervalRef.current = window.setInterval(() => {
      const state = stateRef.current;
      if (!state) return;
      if (winnerSentRef.current) return;

      const center = pickShotCenter(state, Math.random);
      const type = rollShotType(Math.random);
      const cells = expandShot(center, type, state.gridSize, Math.random);
      const { firstSunkEntryId } = applyShot(state, type, center, cells);

      setFrameKey((k) => k + 1);

      if (firstSunkEntryId !== null) {
        winnerSentRef.current = true;
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const sunkEntry = entries.find((e) => e.id === firstSunkEntryId);
        if (sunkEntry) {
          setBannerName(sunkEntry.name);
          bannerTimeoutRef.current = window.setTimeout(() => {
            onWinner(sunkEntry);
            setBannerName(null);
          }, BANNER_DURATION_MS);
        }
      }
    }, SHOT_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRacing, entryIdsKey, roundSeed]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (bannerTimeoutRef.current !== null) clearTimeout(bannerTimeoutRef.current);
    };
  }, []);

  // Reset mode-internal state if the parent clears the race.
  useEffect(() => {
    if (eliminatedIds.length === 0 && !isRacing) {
      setBannerName(null);
      winnerSentRef.current = false;
      setRoundSeed((s) => s + 1);
    }
  }, [eliminatedIds.length, isRacing]);

  const updateSettings = (next: Partial<Settings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveSettings(merged);
      return merged;
    });
    // Re-roll the round so the new setting takes effect immediately.
    setRoundSeed((s) => s + 1);
  };

  const aliveShips: Ship[] = stateRef.current?.ships.filter((s) => !s.sunk) ?? [];

  return (
    <div className="battleship-mode">
      <div className="race-controls">
        {entries.length >= 2 && !isRacing && (
          <button onClick={onStartRace} className="start-race-button">
            🚢 Open Fire ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <div className="battleship-settings">
        <fieldset>
          <legend>Ship sizes:</legend>
          <label>
            <input
              type="radio"
              name="bs-ship-sizes"
              value="uniform"
              checked={settings.shipSizes === 'uniform'}
              onChange={() => updateSettings({ shipSizes: 'uniform' })}
            />
            Uniform (3)
          </label>
          <label>
            <input
              type="radio"
              name="bs-ship-sizes"
              value="random"
              checked={settings.shipSizes === 'random'}
              onChange={() => updateSettings({ shipSizes: 'random' })}
            />
            Random (2–5)
          </label>
        </fieldset>

        <fieldset>
          <legend>Ship visibility:</legend>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="hidden"
              checked={settings.visibility === 'hidden'}
              onChange={() => updateSettings({ visibility: 'hidden' })}
            />
            Hidden
          </label>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="ghosted"
              checked={settings.visibility === 'ghosted'}
              onChange={() => updateSettings({ visibility: 'ghosted' })}
            />
            Ghosted
          </label>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="visible"
              checked={settings.visibility === 'visible'}
              onChange={() => updateSettings({ visibility: 'visible' })}
            />
            Visible
          </label>
        </fieldset>
      </div>

      {entries.length < 2 ? (
        <div className="mode-placeholder">
          🚢 Add at least 2 participants to start a battle.
        </div>
      ) : (
        <BattleshipGrid
          stateRef={stateRef}
          visibility={settings.visibility}
          bannerName={bannerName}
          frameKey={frameKey}
        />
      )}

      {/* Suppress unused-warning for shape-only metadata used by the grid. */}
      {void aliveShips}
    </div>
  );
}
```

- [ ] **Step 5.3: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint -- src/components/modes/BattleshipMode
```

Expected: type-check clean. Lint should be clean for files in `BattleshipMode/`. Pre-existing lint errors elsewhere are out of scope.

- [ ] **Step 5.4: Commit**

```bash
git add src/components/modes/BattleshipMode/BattleshipMode.tsx src/components/modes/BattleshipMode/BattleshipMode.css
git commit -m "Implement BattleshipMode wrapper with game loop + settings

Replaces the placeholder with the real mode: builds a round on
mount/entry-change, runs a 220ms shot loop while isRacing, applies
each shot via the targeting helpers, shows a 1.5s 'X sunk!' banner
when the first ship goes down, then forwards the sunk entry to
props.onWinner. Settings (ship sizes, visibility) persist to
localStorage and re-roll the round when changed."
```

---

## Task 6: Smoke test + README

**Goal:** Verify the new mode end-to-end and document it.

**Files:**
- Modify: `README.md`

### Steps

- [ ] **Step 6.1: Type-check and full lint**

```bash
npx tsc --noEmit
npm run lint 2>&1 | tail -10
```

Type-check must be clean. Lint may report pre-existing errors in *other* modes' inner game files (RacingGame, BattleArena, etc.) — ignore those. Battleship files must report 0 errors.

- [ ] **Step 6.2: Manual smoke test**

```bash
npm run dev
```

In the browser:
1. Switch the mode dropdown to "🚢 Battleship".
2. Add 5 participants. Verify:
   - Grid renders with ghosted ship outlines.
   - Legend below the grid shows all 5 names with colored swatches.
3. Click "🚢 Open Fire". Verify:
   - Shots fire ~4/second.
   - White splashes for misses, red explosions for hits.
   - Occasional 3-cell tracer (broadside) and 3×3 ripple-area (depth charge).
   - Eventually a "💥 [Name] sunk! 💥" banner appears, then the parent app's winner-info shows the winner.
4. Click "Open Fire" again. Verify the round resets with the survivors and a new random board.
5. Switch the "Ship sizes" radio to "Random (2–5)". Verify the round re-rolls with mixed-size ships.
6. Switch the "Ship visibility" radio to "Hidden". Verify ships disappear, only revealed cells show on hit.
7. Switch the "Ship visibility" radio to "Visible". Verify ships are fully drawn.
8. Mid-round, switch the top-level mode dropdown to "🏁 Racing" — verify the confirm dialog appears.
9. Reload the page while in Battleship mode. Verify the mode is restored.
10. Run a full pick-down to a single winner; open Final Standings; verify all participants appear in elimination order.

Stop the dev server. Note any failures and fix before committing.

- [ ] **Step 6.3: Update `README.md`**

Add `🚢 Battleship` to the Game Modes section. Find the bullet list under "## Game Modes" and add this entry (preserve the existing entries):

```markdown
- **🚢 Battleship** — Each participant gets a ship on an auto-sized grid; rapid-fire cannon, broadside, and depth-charge shots hunt and target ships until the first one is sunk
```

Update the architecture section to add `BattleshipMode/` to the modes list:

```markdown
  - `BattleshipMode/` — grid-based battleship picker (cannon/broadside/depth-charge shots)
```

- [ ] **Step 6.4: Final commit**

```bash
git add README.md
git commit -m "Document Battleship mode in README

Adds the 🚢 Battleship entry to Game Modes and updates the
architecture summary."
```

---

## Self-review (writer's notes — already addressed)

- **Spec coverage:**
  - Grid sizing → Task 2 (`computeGridSize`).
  - Ship size config (uniform/random) → Task 2 (`pickShipSizes`) + Task 5 (settings UI).
  - Ship placement with breathing-room → Task 2 (`placeShips`).
  - Hunt+Target AI → Task 3 (`pickShotCenter`).
  - Shot type 70/20/10 → Task 3 (`rollShotType`).
  - Cannon/broadside/depth-charge geometry → Task 3 (`expandShot`).
  - Multi-ship-sink tiebreak by smallest entryId → Task 3 (`applyShot`).
  - Visibility config (hidden/ghosted/visible) → Task 4 (`drawShips`) + Task 5 (settings UI).
  - 1500 ms sink banner before `onWinner` → Task 5 (BANNER_DURATION_MS).
  - Settings persist to `gamified_picker_battleship_settings` → Task 5 (load/save).
  - Re-roll round on settings change → Task 5 (`updateSettings` bumps `roundSeed`).
  - Top-level dropdown integration → Task 1.
  - Final standings reuse → no work needed; parent App already supplies `FinalStandingsDialog`.

- **Placeholder scan:** None. All `// ignore` comments are intentional (loadSettings catch block).

- **Type consistency:**
  - `Cell`, `Ship`, `cellKey` defined in Task 2; consumed by Tasks 3, 4, 5.
  - `RoundState`, `ShotResult`, `ShotType`, `TargetingMode`, `pickShotCenter`, `rollShotType`, `expandShot`, `applyShot` defined in Task 3; consumed by Tasks 4, 5.
  - `Visibility` defined in Task 4; imported as a type in Task 5.
  - `ShipSizesMode` defined in Task 2; imported as a type in Task 5.
  - `Settings` (the mode's persisted shape) defined in Task 5; not exported.

- **Parallelization safety:** Tasks 2 and 3 could run in parallel (Task 3 imports types from Task 2, but those types are simple and the Task 2 code lands first in any sane ordering). Tasks 4 and 5 are sequential (5 imports from 4). Task 1 is fully isolated and lands first to verify wiring. Task 6 is sequential at the end.

---

## Out of scope (deferred from spec)

- Manual ship placement.
- Configurable shot-type frequencies.
- Battleship-flavored Final Standings dialog (showing damage taken, etc.).
- Sound effects.
