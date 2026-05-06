# Battleship Mode — Design

**Date:** 2026-05-06
**Branch:** `swainn/battleship-mode`
**Status:** Approved

## Problem

The picker currently has five game modes (Racing, Battle Bots, Light Cycles, Plinko, Wall Climber). Add a sixth: a Battleship-themed mode where each participant is a ship on a grid and the first ship sunk is the pick.

## Goals

1. New `'battleship'` `GameMode` selectable from the existing top-level dropdown.
2. Each participant gets a ship placed on an auto-sized grid.
3. Random shots are fired with rapid-fire pacing; first ship to be fully sunk = the pick.
4. Three shot types (cannon / broadside / depth charge) with fixed 70/20/10 distribution.
5. Hunt+Target AI: random until first hit, then cluster around hits until that ship is sunk, then back to random.
6. Ship sizes and ship visibility are user-configurable in the mode UI.
7. Reset for next pick uses survivors only — same elimination flow as the other modes.

## Non-Goals

- No manual ship placement.
- No user-controlled shot firing.
- No configurable shot-type frequencies (locked to 70/20/10 for v1).
- No sound effects.
- No new mechanics outside the new mode folder beyond a 3-line `App.tsx` change to register the mode.

## Architecture

### File layout

```
src/components/modes/BattleshipMode/
  BattleshipMode.tsx         (wrapper: settings UI + game state + ModeViewProps)
  BattleshipMode.css         (mode-level layout)
  BattleshipGrid.tsx         (canvas: draws grid, ships, shots, animations)
  BattleshipGrid.css         (canvas styling)
  battleshipPlacement.ts     (pure functions: grid sizing + ship placement)
  battleshipTargeting.ts     (pure functions: hunt/target shot selection)
```

`App.tsx` changes (3 lines):
1. `import { BattleshipMode } from './components/modes/BattleshipMode/BattleshipMode';`
2. Add `{ value: 'battleship', label: '🚢 Battleship' }` to the `MODES` array.
3. Add `case 'battleship': return <BattleshipMode {...modeProps} />;` to the mode router.

`src/components/modes/types.ts` change (1 line):
- Extend the `GameMode` union with `| 'battleship'`.

No other files outside the new folder are modified.

### Game model

#### Setup (per round)

- **Grid size:** `gridSize = clamp(ceil(sqrt(totalShipCells / 0.25)), 8, 16)` where `totalShipCells = sum of ship sizes`. Targets ~25% ship coverage.
- **Ship sizes** (per the configuration radio):
  - **Uniform (default):** every ship is 3 cells.
  - **Random:** each ship's size is sampled uniformly from `{2, 3, 3, 4, 5}` (3 weighted double).
- **Ship placement:** for each participant in shuffled order:
  - Pick a random orientation (horizontal/vertical) and a random valid origin.
  - Reject if any ship cell overlaps an existing ship cell, or if any ship cell touches an existing ship cell on its 8-neighborhood (breathing room).
  - Retry up to 200 attempts. If all attempts fail, increment `gridSize` by 1 and restart placement from scratch. If `gridSize > 20`, give up and fall back to overlap-allowed placement (this is a safety net; in practice it should never trigger because the 25% coverage target leaves plenty of room).
- **Color:** each ship gets a stable color derived from its `entry.id` (same hashing scheme used elsewhere).

#### Round (rapid-fire)

- **Pacing:** one shot every 220 ms (≈4.5 shots/second).
- **Targeting state machine:**
  - `targetingMode = 'hunt'` initially.
  - **Hunt:** pick a uniformly random un-shot cell as the *center cell*.
  - **Target:** if `targetQueue` is non-empty, dequeue a cell as the center cell. Otherwise fall back to hunt.
- **Shot type roll:** independently per shot, using a single uniform random:
  - `r < 0.70` → **Cannon** (single cell — the center cell).
  - `r < 0.90` → **Broadside** (3 cells: center plus one on each side along a randomly chosen axis H/V; clipped to grid).
  - else → **Depth Charge** (3×3: center plus 8 surrounding; clipped to grid).
- **Resolution:** every cell affected by the shot is checked. For each cell that overlaps a ship, record a hit on that ship; otherwise mark the cell as a miss. Re-hits on already-hit cells produce no effect (still drawn as miss/empty water in the splash visual but don't re-damage).
- **Target queue maintenance:** every newly hit cell that belongs to a *not-yet-sunk* ship pushes its 4-neighborhood (up/down/left/right) onto `targetQueue`, deduplicated against cells already shot. When a ship sinks, remove all queued cells that belonged exclusively to that ship's neighborhood (to avoid wasted shots), and if the queue becomes empty, return to hunt mode.
- **Win condition:** the *first* ship to have all its cells hit (i.e. `ship.cells.every(c => ship.hits.has(key(c)))`) is declared sunk and becomes the pick. If a single multi-cell shot sinks more than one ship simultaneously, pick deterministically by smallest `entry.id` (rare edge case).

#### Resolution → parent

When a ship is sunk:
1. Pause the shot loop.
2. Show a "💥 [Name] sunk!" banner over the grid for 1500 ms.
3. Reveal all ships at full opacity for the duration of the banner.
4. Call `props.onWinner(sunkEntry)`.

The parent's existing flow handles elimination + remount via `key=` change. Mode-internal state is rebuilt from scratch on remount.

### Configuration UI

Two compact controls, rendered in a row above the grid:

1. **Ship sizes:** `Uniform (3)` | `Random (2–5)` — radio. Default `Uniform`.
2. **Ship visibility:** `Hidden` | `Ghosted` | `Visible` — radio. Default `Ghosted`.

Persisted as a single object to `localStorage['gamified_picker_battleship_settings']`. Loaded once on mount; saved on each change. Changing settings while a round is in progress: re-roll the round (regenerate placements, clear shots) so the new setting takes effect immediately.

### Visuals

- **Canvas-based** (consistent with all other modes).
- **Palette:**
  - Water: deep blue `#0a2540` background, lighter blue `#143a66` grid lines.
  - Cannon miss: white splash circle, fades over 400 ms.
  - Cannon hit: red cross + small explosion, persists.
  - Broadside: cells light in rapid 40 ms sequence with a yellow tracer line.
  - Depth charge: expanding ring animation (0 → ~1.5 cells radius over 300 ms) over the 3×3 area.
- **Ship rendering** depends on the visibility setting:
  - `Hidden`: ships invisible until a cell is hit; on-hit cells draw the ship segment.
  - `Ghosted` (default): ship outlines drawn at ~25% opacity with the participant's color tint; hit cells go full opacity red.
  - `Visible`: ships drawn at full opacity from the start.
- **On sink:** ship goes full opacity, marked with a sunk overlay (X mark across the hull), and the banner fires.
- **Legend:** below the grid, a horizontal row of `[colored swatch] [participant name]` chips so the audience always knows who is in play, regardless of the visibility setting.

### State (mode-internal, not in App)

```ts
type Cell = { x: number; y: number };
type ShotType = 'cannon' | 'broadside' | 'depthCharge';
type ShotResult = { cells: Cell[]; hits: Cell[]; misses: Cell[]; type: ShotType };

interface Ship {
  id: number;
  entryId: number;
  entryName: string;
  color: string;
  size: number;
  cells: Cell[];
  hits: Set<string>;     // "x,y" keys
  sunk: boolean;
}

interface RoundState {
  gridSize: number;
  ships: Ship[];
  shots: ShotResult[];
  shotCells: Set<string>;
  targetingMode: 'hunt' | 'target';
  targetQueue: Cell[];
  bannerEntry: { name: string } | null;
  paused: boolean;
}
```

`useRef` holds the live `RoundState`; React state holds only what the canvas/UI re-renders on (frame counter, banner). The shot loop runs via `setInterval`; cleared on unmount and on `props.isRacing` going false.

### Pure helpers

`battleshipPlacement.ts`:
- `computeGridSize(shipSizes: number[]): number`
- `placeShips(entries: Entry[], shipSizes: number[], gridSize: number, rng: () => number): Ship[] | null`
- `placeShipsWithRetry(entries: Entry[], settings: Settings, rng?: () => number): { ships: Ship[]; gridSize: number }` — handles the retry-and-grow loop.

`battleshipTargeting.ts`:
- `pickShotCenter(state: RoundState, rng: () => number): Cell` — pure: hunt or target.
- `rollShotType(rng: () => number): ShotType`
- `expandShot(center: Cell, type: ShotType, gridSize: number, rng: () => number): Cell[]`
- `applyShot(state: RoundState, type: ShotType, cells: Cell[]): { newSinks: Ship[]; firstSinkEntryId: number | null }`
- `updateTargetQueue(state: RoundState, hitCells: Cell[]): void`

These are pure functions taking explicit RNG so they're easy to reason about (and trivially testable if/when we add tests later).

## Storage keys

| Key | Purpose |
|---|---|
| `gamified_picker_battleship_settings` | User settings: `{ shipSizes: 'uniform' \| 'random'; visibility: 'hidden' \| 'ghosted' \| 'visible' }` |

No other storage; race state is ephemeral per the existing parent-managed pattern.

## Risks

| Risk | Mitigation |
|---|---|
| Many participants → grid grows too large to render legibly | `gridSize` clamped to 16. With 16×16 = 256 cells and 25% coverage, that's 64 ship cells — comfortable for ~12–20 participants depending on size mix. |
| Edge case: 1 participant left | Parent App already short-circuits this — the mode is never asked to run a 1-participant round. |
| Ship placement infeasible at requested grid size | Auto-grow gridSize up to 20, then fall back to overlap-allowed (safety net only; should not trigger in practice). |
| Multi-cell shot sinks two ships in the same tick | Deterministic tiebreak by smallest `entry.id`. |
| Settings change mid-round causes confusion | Round is re-rolled when settings change; visual state resets cleanly. |
| Hunt+Target lock-on bias (one ship usually loses if hit first) | Acknowledged as intended behavior — the user accepted Hunt+Target after seeing this trade-off. |

## Testing

Manual smoke tests, consistent with other modes (no automated test infrastructure in repo):

1. With 5 participants, default settings: round completes in <15s, exactly one participant is picked.
2. Run 5 picks in a row → all participants get picked, no crashes, no duplicate picks.
3. Switch ship-sizes radio mid-round → round re-rolls, new sizes visible.
4. Switch visibility radio mid-round → round re-rolls (or live-updates — implementation choice; spec accepts either, but re-roll is simpler).
5. With 2 participants on small grid → game still works; first sunk wins.
6. With 12 participants → grid auto-sizes, all ships placed, round completes.
7. Switch from Battleship to another mode mid-round → existing confirmation flow triggers; switching back regenerates fresh.
8. Reload page while in Battleship mode → mode and settings restored from localStorage.

## Out of Scope (v1)

- Manual ship placement.
- Configurable shot-type frequencies.
- Power-ups or escalation pacing.
- Sound effects.
- Battleship-flavored Final Standings dialog.
