# Battleship Cannon Animations — Design

**Date:** 2026-05-06
**Branch:** `swainn/battleship-mode`
**Status:** Approved

## Problem

The Battleship mode currently resolves shots instantly — the splash/explosion appears the same frame the shot loop fires. There's no visual sense of *where* shots come from. Add animated corner cannons that aim, fire, and launch projectiles that travel to their target cells before impact effects render.

## Goals

1. Four cannons drawn at the corners of the grid canvas. They aim toward the target cell before firing.
2. Each shot picks a cannon **uniformly at random**.
3. Three shot-type animations:
   - **Cannon** (single cell): single shell, ~80 ms flat trajectory.
   - **Broadside** (3-cell line): 3 shells fired 35 ms apart from the same cannon, each ~80 ms travel.
   - **Depth Charge** (3×3 area): single arcing mortar shell, ~180 ms travel.
4. Impact effects (splash/explosion/afterglow) fire when the projectile *lands*, not when the shot loop triggers.
5. Sink-banner timing waits for the killing projectile to land before showing.

## Non-Goals

- No sound effects.
- No cannon recoil sub-animation (deferred).
- No per-shot-type cannon barrel variation.
- No replay buffer or pause-on-sink frame.
- Game logic (targeting AI, hunt/target, sink detection) is unchanged.

## Architecture

### Layout
- Canvas dimensions grow by `2 * CANNON_PAD` (60 px each side, 120 px total).
- The grid is offset by `CANNON_PAD` from the canvas origin and remains pixel-identical to today.
- The 4 cannons live in the corner padding zones at fixed pixel coordinates relative to the canvas.

### Animation pipeline (per logical shot)

1. **Loop tick** (every 220 ms in `BattleshipMode`):
   - `pickShotCenter` + `rollShotType` + `expandShot` + `applyShot` run as today, **mutating the round state's logic** (targeting queue, shot cells, sinks).
   - The resulting `ShotResult` is **not** yet drawn as resolved. Instead, one or more `Projectile` records are queued.
2. **Projectile spawn:**
   - **Cannon:** 1 projectile, fireTime = now, travelMs = 80, arcing = false.
   - **Broadside:** 3 projectiles, fireTimes = now, now+35, now+70; each travelMs = 80, arcing = false. All from the same cannon. Each projectile carries the *single* cell it will reveal on impact.
   - **Depth Charge:** 1 projectile, fireTime = now, travelMs = 180, arcing = true. The single projectile carries all 9 cells (or however many were clipped) of the area.
3. **Render loop (rAF):**
   - Active when any projectiles are in flight.
   - Per frame: redraw grid, ships, cannons, in-flight projectiles, and the *resolved* portion of `state.shots` (cells that have already impacted).
4. **Impact:**
   - When `now >= fireTime + travelMs`, mark the projectile as impacted, reveal its hit/miss cells (push into a `committedHits` / `committedMisses` set keyed by cell), remove the projectile from the in-flight list.
   - If the projectile included a sink, the banner timer starts now (not when the loop tick fired the shot).

### Cannon aim

Each cannon has a `currentAngle` that lerps toward its `targetAngle` over the few frames before fire. For simplicity in v1: when a shot is fired, the cannon's barrel angle snaps to point at the target cell on the same frame the projectile spawns. (The 80 ms travel time itself provides plenty of "anticipation"; adding a separate aim phase complicates timing without much visual gain.) If we want a true aim-pre-roll later, we add a 50 ms pre-fire phase. **Locked to snap-aim for v1.**

### Shot-overlap

Cannons and projectiles are independent state. Multiple projectiles can be in flight at once across different cannons. The 220 ms shot interval and the 80–180 ms travel windows mean rapid cannon shots will mostly be sequential per-cannon but can overlap between cannons.

### Decoupling logic from rendering

`battleshipTargeting.ts:applyShot` currently mutates state and pushes to `state.shots`. We keep that — `state.shots` remains the source of truth for *logical* shots resolved.

To decouple visual appearance:
- New mode-internal data: `committedHits: Set<cellKey>` and `committedMisses: Set<cellKey>`. These start empty per round and grow as projectiles impact.
- The grid renderer iterates `state.shots` but, for each cell, only draws the splash/explosion if its key is in `committedHits` or `committedMisses`.
- Sunk ships render their "sunk" overlay only after the killing projectile has impacted (i.e. all of the ship's cells are in `committedHits`).

This isolates the render-side delay to a small set of overlay rules, avoids cloning game state, and means `applyShot` keeps its current shape.

### Sink banner timing

`BattleshipMode` currently sets `bannerName` immediately when `applyShot` returns `firstSunkEntryId`. New behavior: enqueue the sunk-entry id alongside the projectile that delivered the killing blow. When that projectile impacts, set `bannerName` and start the 1500 ms timer that ends the round.

If multiple projectiles in flight could each "sink something" (rare but possible with overlapping shots), we still apply the existing tiebreak: smallest `entryId` wins; we wait for *that* projectile to impact.

### Render-loop lifecycle

- BattleshipGrid switches to a `requestAnimationFrame` loop driven by a `running` flag.
- The grid receives a `projectiles` array prop (live snapshot from the wrapper) plus the existing `frameKey` and `state` ref.
- While `projectiles.length > 0`, the rAF loop runs and redraws every frame.
- When the queue empties, the loop stops; subsequent shot-resolutions still trigger redraws via `frameKey` bumps as today.

## State (mode-internal additions)

```ts
type CannonCorner = 'tl' | 'tr' | 'bl' | 'br';

interface Projectile {
  id: number;
  corner: CannonCorner;
  fromPx: { x: number; y: number };
  toCell: { x: number; y: number };       // grid coordinates
  toPx: { x: number; y: number };          // resolved at spawn for stable visuals
  fireTime: number;                        // performance.now() when projectile starts
  travelMs: number;
  arcing: boolean;
  type: ShotType;
  hitsRevealOnImpact: Cell[];              // single cell for cannon/broadside, up to 9 for depth charge
  missesRevealOnImpact: Cell[];
  /** entryId of the ship sunk by this projectile, if any. */
  sinksEntryId: number | null;
  impacted: boolean;
}
```

Held in a `useRef<Projectile[]>` inside `BattleshipMode`.

## Pure helpers (`battleshipCannons.ts`)

```ts
type CannonCorner = 'tl' | 'tr' | 'bl' | 'br';
const CANNON_CORNERS: CannonCorner[] = ['tl', 'tr', 'bl', 'br'];

function pickCannon(rng: () => number): CannonCorner;
function cannonAnchorPx(corner, canvasWidth, canvasHeight, pad): { x: number; y: number };
function cannonBarrelTipPx(anchor, angle, barrelLen): { x: number; y: number };
function computeAimAngle(from: {x:number;y:number}, to: {x:number;y:number}): number;
function cellCenterPx(cell, pad, cellPx): { x: number; y: number };
function projectilePosition(p: Projectile, now: number): { x: number; y: number };
//   - linear interp from fromPx to toPx for non-arcing
//   - parabolic arc (peak ~30% of travel distance above midpoint) for arcing
```

## Visual style

- Cannon base: dark steel grey circle, ~22 px radius, with darker stroke.
- Cannon barrel: black rectangle ~32 × 8 px, rotates around base center.
- Projectile (non-arc): small black circle ~5 px with a 12 px tail in lighter grey (alpha-fading).
- Projectile (arc / depth charge): larger black circle ~7 px, no tail, rendered against a faint dotted arc that traces its path.
- Muzzle flash on fire: yellow-white radial gradient, ~16 px, decays over 80 ms (its own short timeline tied to the projectile's `fireTime`).
- Impact effects unchanged from today.

## Out of scope (v1)

- Sound effects.
- Cannon recoil / muzzle smoke trail.
- Per-shot-type cannon variations.
- Cell-by-cell sequential reveal of broadside/depth-charge impact (already partially handled — broadside is 3 separate projectiles; depth-charge resolves all 9 simultaneously on landing, which matches the spec).

## Risks

| Risk | Mitigation |
|---|---|
| rAF loop leaks if component unmounts mid-flight | Cancel rAF in cleanup effect; check `running` flag in callback. |
| Many participants → grid is large → cannon-to-far-corner travel time visibly exceeds 80 ms at the visual scale | Acceptable; the shells visibly move slower across larger grids. If it gets weird, scale `travelMs` by distance later. |
| Sink banner delay (waiting for projectile to land) feels laggy | The killing projectile is at most ~180 ms in flight (depth charge). The banner already lingers 1500 ms. Net round time grows by ≤180 ms — imperceptible. |
| Settings changes mid-flight could leave projectiles pointing at stale grid coords | `roundSeed` bump already triggers full state rebuild; clear projectiles + cancel rAF when the round rebuilds. |

## Testing

Manual smoke (no automated tests):
1. Start a Battleship round with 5 participants. Verify cannons appear at all 4 corners.
2. Watch a few shots — confirm projectiles spawn from a cannon's barrel tip, travel toward the target cell, and impact effects only appear on landing.
3. Trigger a broadside (eventually rolls) — verify 3 sequential projectiles from the same cannon, each landing in a 3-cell line.
4. Trigger a depth charge — verify a slower arcing projectile, single landing point at center, all 9 cells light up simultaneously.
5. Round-end: confirm the "X sunk!" banner only appears after the killing projectile lands, not on the firing tick.
6. Reset / mode-switch / settings-change mid-flight: no leaked rAF, no stuck projectiles, fresh round on resume.
