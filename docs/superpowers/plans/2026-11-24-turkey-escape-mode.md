# Turkey Escape Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `turkey-escape` game mode: every participant is a turkey loose in a farmyard, a farmer chases them, dives at a couple and misses, then catches one. The last turkey still free is the champion.

**Architecture:** A self-contained folder under `src/components/modes/TurkeyEscapeMode/`, laid out like `TrickOrTreatMode`. The caught turkey is drawn uniformly before the gate opens. A pure, fixed-timestep steering simulation then runs the chase; it can only ever catch that one turkey, and a speed ramp guarantees it does. The canvas component steps the simulation and paints it.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Canvas 2D, Vitest. No new dependencies (no `matter-js`).

**Spec:** None. The Design section below is the design. It is a proposal and has not been approved yet, so read it first and correct anything before Task 1.

## Design

- **What you see:** a top-down farmyard with a fence, a barn, hay bales and pumpkins. Turkeys mill about. The gate opens, the farmer runs in with a net, and turkeys scatter away from him. He closes on one, dives, misses and faceplants; does it again; then runs one down and nets it.
- **Who wins:** the caught turkey is **out** for that round. This is an elimination mode like Whac-a-Mole: the first caught finishes last, and the last turkey free is the champion (the "pardoned" turkey). Registry flag `survivalOrder: true`.
- **This is the one decision to confirm.** The alternative is "the caught turkey is the pick and places first". Switching is small: drop `survivalOrder`, and swap the headlines and gold treatment in Task 5.
- **Fairness:** `pickCaught` draws uniformly before the farmer enters. The simulation takes the chosen index as an input. Only that turkey can be caught, and only in the final `commit` phase; the missed dives are aimed at other turkeys chosen after the draw.
- **Guaranteed ending:** in `commit` the chosen turkey tires (70% speed) and the farmer's speed ramps up without limit, so the catch always happens.
- **Settings:** pacing (slow / normal / fast), use participant photos as faces, sound effects, music.
- **Not included:** player control of the farmer, multiple catches per round, replay.

## Global Constraints

- The pick is `shuffle(entries)[0]` from `src/utils/array.ts`, taken before the animation starts. Nothing simulated may change it.
- The yard must hold `MAX_PARTICIPANTS` (30, from `src/constants.ts`) and must work for 1.
- No new runtime dependencies.
- The simulation advances only in fixed steps of `STEP` (1/60 s), driven by an accumulator, never by a variable frame delta.
- Animation runs in one `requestAnimationFrame` loop mounted once; per-frame state lives in `useRef`, and the loop reads props through a `propsRef`.
- Read images only through `getEntryImages` / `getPreferredEntryImage`.
- Settings persist through a module singleton + `useSyncExternalStore`, with `localStorage` wrapped in try/catch. Storage key: `gamified_picker_turkey_escape_settings`.
- `onWinner` is called at the **end** of the caught beat, because the winner card covers the canvas.
- The canvas backing store matches its displayed size in device pixels. At the top of every frame:

```ts
const dpr = window.devicePixelRatio || 1;
const w = Math.max(YARD.CANVAS_W, Math.round(canvas.clientWidth * dpr));
const h = Math.round(w * (YARD.CANVAS_H / YARD.CANVAS_W));
if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
const scale = canvas.width / YARD.CANVAS_W;
ctx.setTransform(scale, 0, 0, scale, 0, 0);
```

  Multiply any `shadowBlur` by `scale`; it ignores the transform.
- Verification for every task: `npm run build`, `npm run lint`, `npm run test -- --run`. Dev server for manual checks: `npm run dev -- --port 5174`.
- Work on a branch `feat/turkey-escape-mode` cut from an up-to-date `main`.

## Review Focus

1. **One turkey.** No one to dive at; the farmer must go straight to `commit` and catch it. Test in Task 2.
2. **A chase that never ends.** A turkey circling a hay bale or pinned in a corner must still be caught inside `MAX_ROUND_S`. Test in Task 2 across every count and several seeds.
3. **The wrong turkey caught.** The farmer running through a crowd must never net a bystander. Test in Task 2.
4. **Anything leaving the yard.** Thirty turkeys pushing on each other must stay inside the fence and out of the obstacles. Test in Task 2.
5. **A background tab.** A long pause must not produce one huge step or a burst of thousands; cap the accumulator. Manual check in Task 5.

## File Structure

```
src/components/modes/TurkeyEscapeMode/
  turkeyEngine.ts                 pure: constants, spawn, the pick, the chase simulation
  turkeyEngine.test.ts
  turkeySprites.ts                pure painting: yard, turkey, farmer, dust, feathers
  turkeyAudio.ts                  synth sound on utils/synth
  turkeyEscapeSettingsStore.ts    persisted settings
  TurkeyEscapeSettings.tsx        settings panel
  TurkeyEscapeGame.tsx            canvas + loop + WinnerDialog
  TurkeyEscapeGame.css
  TurkeyEscapeMode.tsx            ModeViewProps wrapper + start/reset buttons

src/components/modes/types.ts      MODIFY: add 'turkey-escape' to GameMode
src/components/modes/themes.ts     MODIFY: add turkeyEscapeTheme
src/components/modes/registry.ts   MODIFY: lazy import + registry entry
README.md, CLAUDE.md               MODIFY: mode lists
```

---

### Task 1: Engine — yard, spawn and pick

**Files:**
- Create: `src/components/modes/TurkeyEscapeMode/turkeyEngine.ts`
- Test: `src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`

**Interfaces:**
- Consumes: `shuffle` from `src/utils/array.ts`, `Entry` from `src/types`, `MAX_PARTICIPANTS` from `src/constants`.
- Produces:

```ts
export const YARD = {
  CANVAS_W: 720, CANVAS_H: 560,
  L: 44, T: 84, R: 676, B: 512,     // inside of the fence
  GATE_X: 360,                       // the farmer enters at (GATE_X, B)
  BIRD_R: 13, FARMER_R: 16,
  CATCH_DIST: 26,
} as const;

export interface Obstacle { x: number; y: number; r: number }
/** Hay bales and pumpkins. Five circles, none within 60 px of the gate. */
export const OBSTACLES: readonly Obstacle[];

export interface Bird { x: number; y: number; vx: number; vy: number; heading: number }

export function pickCaught(entries: Entry[]): Entry;
/** Distinct spots inside the fence, clear of every obstacle and of each other. */
export function spawnBirds(count: number, rand?: () => number): Bird[];
/** True when a circle of radius r at (x, y) is inside the fence and off every obstacle. */
export function isClear(x: number, y: number, r: number): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import { OBSTACLES, YARD, isClear, pickCaught, spawnBirds } from './turkeyEngine';

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);

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

describe('the yard', () => {
  it('has obstacles inside the fence and away from the gate', () => {
    expect(OBSTACLES).toHaveLength(5);
    for (const o of OBSTACLES) {
      expect(o.x - o.r).toBeGreaterThan(YARD.L);
      expect(o.x + o.r).toBeLessThan(YARD.R);
      expect(o.y - o.r).toBeGreaterThan(YARD.T);
      expect(o.y + o.r).toBeLessThan(YARD.B);
      expect(Math.hypot(o.x - YARD.GATE_X, o.y - YARD.B)).toBeGreaterThan(60 + o.r);
    }
  });
});

describe('spawnBirds', () => {
  it('finds a clear spot for everyone', () => {
    for (const n of COUNTS) {
      const birds = spawnBirds(n, seeded(n));
      expect(birds, `${n}`).toHaveLength(n);
      for (const b of birds) expect(isClear(b.x, b.y, YARD.BIRD_R), `${n}`).toBe(true);
    }
    expect(spawnBirds(0)).toEqual([]);
    expect(spawnBirds(-2)).toEqual([]);
  });

  it('never stacks two turkeys', () => {
    for (const n of COUNTS) {
      const birds = spawnBirds(n, seeded(n * 31));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        expect(Math.hypot(birds[i].x - birds[j].x, birds[i].y - birds[j].y), `${n}`)
          .toBeGreaterThanOrEqual(YARD.BIRD_R * 2);
      }
    }
  });
});

describe('pickCaught', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('catches every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const c = pickCaught(entries);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      expect(counts.get(e.id) ?? 0, e.name).toBeGreaterThan(expected * 0.9);
      expect(counts.get(e.id) ?? 0, e.name).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where a turkey is in the list (fairness)', () => {
    const trials = 16000;
    const byIndex = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) byIndex[entries.indexOf(pickCaught(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of byIndex.entries()) {
      expect(got, `index ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `index ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`
Expected: FAIL, cannot resolve `./turkeyEngine`.

- [ ] **Step 3: Implement the yard, `isClear`, `spawnBirds` and `pickCaught`**

`spawnBirds` uses rejection sampling with `rand` (default `Math.random`), up to 400 tries per bird; if a bird still has no spot, fall back to the first clear point on an 8 px grid scan so the function always returns `count` birds.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- --run src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modes/TurkeyEscapeMode/turkeyEngine.ts src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts
git commit -m "feat(turkey-escape): add yard geometry, spawn and uniform pick"
```

---

### Task 2: Engine — the chase simulation

**Files:**
- Modify: `src/components/modes/TurkeyEscapeMode/turkeyEngine.ts`
- Modify: `src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`

**Interfaces:**
- Consumes: `YARD`, `OBSTACLES`, `Bird`, `spawnBirds`, `isClear` from Task 1.
- Produces:

```ts
export const STEP = 1 / 60;        // seconds per simulation step
export const FEINTS = 2;           // missed dives before the real chase
export const MAX_ROUND_S = 20;     // hard ceiling on simulated time until the catch

/** Speeds in px/s, ranges in px, times in s. */
export const CHASE = {
  BIRD_SPEED: 95, BIRD_PANIC_SPEED: 175, DODGE_SPEED: 300,
  FARMER_SPEED: 185, LUNGE_SPEED: 330,
  TIRED_FACTOR: 0.7, COMMIT_RAMP: 0.3,
  FLEE_RADIUS: 150, LUNGE_RANGE: 58, SEPARATION: 30,
  RELEASE_S: 0.9, CHASE_TIMEOUT_S: 2.6, LUNGE_S: 0.34, STUMBLE_S: 0.75,
} as const;

export type ChasePhase = 'idle' | 'release' | 'chase' | 'lunge' | 'stumble' | 'commit' | 'caught';

export interface Farmer { x: number; y: number; vx: number; vy: number; heading: number }

export interface YardState {
  birds: Bird[];
  farmer: Farmer;
  phase: ChasePhase;
  phaseTime: number;       // seconds spent in the current phase
  elapsed: number;         // seconds since the gate opened
  chosenIdx: number;       // -1 in the idle yard
  targetIdx: number;       // who the farmer is running at right now, -1 if none
  feintQueue: number[];    // remaining decoy targets, never containing chosenIdx
  lunges: number;          // missed dives so far
  caughtIdx: number;       // -1 until the catch
}

/** A yard with nobody chasing: turkeys stroll, the farmer waits outside the gate. */
export function createIdleYard(count: number, rand?: () => number): YardState;
/** A yard about to be chased. chosenIdx must be in [0, count). */
export function createChase(count: number, chosenIdx: number, rand?: () => number): YardState;
/** Advance by exactly STEP seconds. Mutates state. */
export function stepYard(state: YardState, rand?: () => number): void;
```

- [ ] **Step 1: Write the failing tests** (append to `turkeyEngine.test.ts`)

```ts
import { CHASE, FEINTS, MAX_ROUND_S, STEP, createChase, createIdleYard, stepYard } from './turkeyEngine';

const SEEDS = [1, 2, 3, 4, 5, 6];
const MAX_STEPS = Math.ceil(MAX_ROUND_S / STEP);

function runToCatch(n: number, chosen: number, seed: number) {
  const rand = seeded(seed);
  const state = createChase(n, chosen, rand);
  let steps = 0;
  while (state.phase !== 'caught' && steps < MAX_STEPS + 1) {
    stepYard(state, rand);
    steps++;
  }
  return { state, steps };
}

describe('createChase', () => {
  it('queues decoys that never include the chosen turkey', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const chosen = (seed * 5) % n;
      const state = createChase(n, chosen, seeded(seed));
      expect(state.phase).toBe('release');
      expect(state.caughtIdx).toBe(-1);
      expect(state.feintQueue).toHaveLength(Math.min(FEINTS, n - 1));
      expect(state.feintQueue).not.toContain(chosen);
      expect(new Set(state.feintQueue).size).toBe(state.feintQueue.length);
    }
  });
});

describe('stepYard', () => {
  it('always catches the chosen turkey, and in time (fairness)', () => {
    for (const n of COUNTS) for (const seed of SEEDS) {
      const chosen = (seed * 5) % n;
      const { state, steps } = runToCatch(n, chosen, seed);
      expect(state.phase, `${n}/${seed}`).toBe('caught');
      expect(state.caughtIdx, `${n}/${seed}`).toBe(chosen);
      expect(steps, `${n}/${seed}`).toBeLessThanOrEqual(MAX_STEPS);
    }
  });

  it('dives and misses before the real chase', () => {
    for (const n of [1, 2, 3, 12, 30]) {
      const { state } = runToCatch(n, 0, 7);
      expect(state.lunges, `${n}`).toBe(Math.min(FEINTS, n - 1));
    }
  });

  it('goes straight for a lone turkey', () => {
    const { state } = runToCatch(1, 0, 3);
    expect(state.lunges).toBe(0);
    expect(state.caughtIdx).toBe(0);
  });

  it('keeps everyone inside the fence and off the obstacles', () => {
    for (const n of [1, 8, 30]) for (const seed of SEEDS) {
      const rand = seeded(seed);
      const state = createChase(n, n - 1, rand);
      for (let s = 0; s < MAX_STEPS && state.phase !== 'caught'; s++) {
        stepYard(state, rand);
        for (const b of state.birds) {
          expect(isClear(b.x, b.y, YARD.BIRD_R - 0.01), `${n}/${seed}/${s}`).toBe(true);
        }
        const f = state.farmer;
        if (state.phase !== 'release') {
          expect(f.x).toBeGreaterThanOrEqual(YARD.L);
          expect(f.x).toBeLessThanOrEqual(YARD.R);
          expect(f.y).toBeGreaterThanOrEqual(YARD.T);
          expect(f.y).toBeLessThanOrEqual(YARD.B);
        }
      }
    }
  });

  it('freezes once the turkey is caught', () => {
    const { state } = runToCatch(6, 2, 4);
    const before = JSON.stringify(state);
    stepYard(state, seeded(1));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('never catches anyone in the idle yard', () => {
    const rand = seeded(11);
    const state = createIdleYard(12, rand);
    for (let s = 0; s < 600; s++) stepYard(state, rand);
    expect(state.phase).toBe('idle');
    expect(state.caughtIdx).toBe(-1);
    for (const b of state.birds) expect(isClear(b.x, b.y, YARD.BIRD_R - 0.01)).toBe(true);
  });

  it('lets the farmer outrun a tired turkey', () => {
    expect(CHASE.FARMER_SPEED).toBeGreaterThan(CHASE.BIRD_PANIC_SPEED * CHASE.TIRED_FACTOR);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`
Expected: FAIL, `createChase` is not exported.

- [ ] **Step 3: Implement `createIdleYard`, `createChase` and `stepYard`**

The phase machine is the algorithm the signatures do not determine:

```
release  farmer walks in from (GATE_X, B + 30) to (GATE_X, B - 30) over RELEASE_S.
         then: target = feintQueue.shift() if any -> 'chase', else chosenIdx -> 'commit'.
chase    farmer seeks targetIdx at FARMER_SPEED.
         when within LUNGE_RANGE, or after CHASE_TIMEOUT_S -> 'lunge'
         (record the dive direction; lunges += 1).
lunge    farmer travels the recorded direction at LUNGE_SPEED for LUNGE_S.
         the target moves perpendicular to that direction at DODGE_SPEED.
         nobody can be caught. then -> 'stumble'.
stumble  farmer stands still for STUMBLE_S.
         then: next decoy -> 'chase', or none left -> targetIdx = chosenIdx, 'commit'.
commit   farmer seeks chosenIdx at FARMER_SPEED * (1 + COMMIT_RAMP * phaseTime).
         the chosen turkey's speed cap is BIRD_PANIC_SPEED * TIRED_FACTOR.
         when distance <= CATCH_DIST -> caughtIdx = chosenIdx, 'caught'.
caught   stepYard returns immediately without changing anything.
idle     no farmer movement; turkeys stroll.

every step, each turkey's velocity is the sum of:
  wander      a slow random heading drift at BIRD_SPEED (uses rand)
  flee        away from the farmer when within FLEE_RADIUS, scaled by closeness,
              up to BIRD_PANIC_SPEED; the current target always flees at full strength
  separation  away from any turkey closer than SEPARATION
then positions are integrated, clamped inside the fence by the body radius,
and pushed out of every obstacle along the centre-to-centre line.
the farmer is clamped and pushed out the same way, which makes him slide
around hay bales rather than stop against them.
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- --run src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts`
Expected: PASS. If the in-time test fails for some count or seed, raise `COMMIT_RAMP`; do not raise `MAX_ROUND_S`.

- [ ] **Step 5: Commit**

```bash
git add src/components/modes/TurkeyEscapeMode/turkeyEngine.ts src/components/modes/TurkeyEscapeMode/turkeyEngine.test.ts
git commit -m "feat(turkey-escape): add fixed-step chase simulation"
```

---

### Task 3: Sprites and audio

**Files:**
- Create: `src/components/modes/TurkeyEscapeMode/turkeySprites.ts`
- Create: `src/components/modes/TurkeyEscapeMode/turkeyAudio.ts`

**Interfaces:**
- Consumes: `YARD`, `OBSTACLES` from Task 1; `tone`, `noise`, `createBus`, `getAudioContext`, `resumeAudio` from `src/utils/synth.ts`; `isGlobalMuted` from `src/utils/globalAudioStore.ts`.
- Produces:

```ts
// turkeySprites.ts — pure painting; the caller decides positions and state.
export function drawYard(ctx: CanvasRenderingContext2D, now: number, gateOpen: number): void; // gateOpen 0..1
export function drawObstacles(ctx: CanvasRenderingContext2D): void;
export interface TurkeyOptions {
  color: string; initials: string; avatar: HTMLImageElement | null;
  heading: number;       // radians
  speed: number;         // px/s, drives the leg and wing flap rate
  panic: number;         // 0..1
  caught: boolean;
  now: number;
}
export function drawTurkey(ctx: CanvasRenderingContext2D, x: number, y: number, o: TurkeyOptions): void;
export interface FarmerOptions { heading: number; speed: number; pose: 'run' | 'dive' | 'down' | 'cheer'; now: number }
export function drawFarmer(ctx: CanvasRenderingContext2D, x: number, y: number, o: FarmerOptions): void;
export function drawDust(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;
export function drawFeathers(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;
export function drawNet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;

// turkeyAudio.ts
export function resumeTurkeyAudio(): void;
export function setTurkeyMuted(m: boolean): void;
export function setTurkeyMusicMuted(m: boolean): void;
export function playGate(): void;
export function playGobble(): void;
export function playWhoosh(): void;
export function playThud(): void;
export function playCatch(): void;
export function startTrack(): void;
export function stopTrack(): void;
```

- [ ] **Step 1: Implement `turkeySprites.ts`**

Top-down view. Yard: autumn grass with scattered leaves, a rail fence on the `YARD` rectangle, a red barn across the top 84 px, and a gate at the bottom centre that swings by `gateOpen`. Obstacles alternate hay bale and pumpkin by index. A turkey is a brown body in a `color` ring, a fanned tail behind it relative to `heading`, a red wattle, and a face disc at the front: the avatar clipped to a circle on a **black** disc when present, `initials` otherwise. The farmer is a straw hat and blue overalls seen from above, carrying a net; `dive` stretches him along `heading`, `down` lays him flat with stars.

- [ ] **Step 2: Implement `turkeyAudio.ts`**

Follow `TrickOrTreatMode/treatAudio.ts` exactly for the mute flags, the `isGlobalMuted()` checks and the `setInterval` track with `stopTrack`. The gobble is three fast descending `sawtooth` tones. The track is a quick banjo-style pluck pattern at about 190 ms per step.

- [ ] **Step 3: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/modes/TurkeyEscapeMode/turkeySprites.ts src/components/modes/TurkeyEscapeMode/turkeyAudio.ts
git commit -m "feat(turkey-escape): add sprites and synth audio"
```

---

### Task 4: Settings store and panel

**Files:**
- Create: `src/components/modes/TurkeyEscapeMode/turkeyEscapeSettingsStore.ts`
- Create: `src/components/modes/TurkeyEscapeMode/TurkeyEscapeSettings.tsx`

**Interfaces:**
- Produces:

```ts
export type TurkeySpeed = 'slow' | 'normal' | 'fast';
export interface TurkeyEscapeSettings { speed: TurkeySpeed; useAvatars: boolean; sound: boolean; music: boolean }
export function useTurkeyEscapeSettings(): TurkeyEscapeSettings;
export function updateTurkeyEscapeSettings(next: Partial<TurkeyEscapeSettings>): void;
/** How fast simulated time runs against real time: slow 0.75, normal 1, fast 1.45. */
export function turkeyTimeScale(speed: TurkeySpeed): number;
export function TurkeyEscapeSettings(): JSX.Element; // from TurkeyEscapeSettings.tsx
```

- [ ] **Step 1: Implement both files**

Copy the structure of `trickOrTreatSettingsStore.ts` and `TrickOrTreatSettings.tsx`. Defaults: `speed: 'normal'`, the three booleans `true`. Storage key `gamified_picker_turkey_escape_settings`. Fieldset legends: "Pacing", "Turkeys" ("Use participant photos as faces"), "Sound" ("Farmyard sound effects", "Banjo music"). Radio group name `turkey-escape-speed`.

Note this factor is a time scale (bigger is faster), the inverse of Trick-or-Treat's duration multiplier.

- [ ] **Step 2: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/modes/TurkeyEscapeMode/turkeyEscapeSettingsStore.ts src/components/modes/TurkeyEscapeMode/TurkeyEscapeSettings.tsx
git commit -m "feat(turkey-escape): add persisted settings and panel"
```

---

### Task 5: Game component, mode wrapper and registration

**Files:**
- Create: `src/components/modes/TurkeyEscapeMode/TurkeyEscapeGame.tsx`
- Create: `src/components/modes/TurkeyEscapeMode/TurkeyEscapeGame.css`
- Create: `src/components/modes/TurkeyEscapeMode/TurkeyEscapeMode.tsx`
- Modify: `src/components/modes/types.ts` (add `| 'turkey-escape'` to `GameMode`)
- Modify: `src/components/modes/themes.ts` (add `turkeyEscapeTheme`)
- Modify: `src/components/modes/registry.ts` (lazy import, settings import, registry entry)

**Interfaces:**
- Consumes: everything produced by Tasks 1–4; `WinnerDialog`, `ModeViewProps`, `WinnerTheme`.
- Produces: `export function TurkeyEscapeMode(props: ModeViewProps)`, `export function TurkeyEscapeGame(props)`, and

```ts
export interface TurkeyWinnerDisplay {
  name: string; imageDataUrl?: string; allImages?: string[];
  isLastPlayer?: boolean; isChampion?: boolean;
}
```

- [ ] **Step 1: Add the theme, the union member and the registry entry**

```ts
// themes.ts
/** Turkey Escape — roast-brown and harvest orange. */
export const turkeyEscapeTheme: WinnerTheme = {
  accent: '#D9772B',
  accentSoft: 'rgba(217, 119, 43, 0.45)',
  bgGradient: 'linear-gradient(145deg, #5a2f14, #2a1608)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#FFD08A',
  fontFamily: '"Arial Black", system-ui, sans-serif',
  letterSpacing: '1px',
  buttonStyle: 'solid',
};

// registry.ts
// The farmer catches one turkey a round, so the one he never catches is champion.
'turkey-escape': { View: TurkeyEscapeMode, Settings: TurkeyEscapeSettings, theme: turkeyEscapeTheme, label: '🦃 Turkey Escape', survivalOrder: true },
```

- [ ] **Step 2: Implement `TurkeyEscapeGame.tsx` and its CSS**

Model the shell on `TrickOrTreatGame.tsx`: same `Props` shape (with `TurkeyWinnerDisplay`), `propsRef`, settings refs, image cache, initials helper, and the `WinnerDialog` block. CSS is `TrickOrTreatGame.css` with class names `turkey-escape-game` / `turkey-escape-canvas-host`, border colour `#5a3a1a`, background `#3f5a22`.

State held in refs: a `YardState`, a parallel array of per-turkey cosmetics (`entry`, `color`, `initials`, `avatar`), an accumulator in seconds, the last frame time, and a `caughtAt` timestamp.

- Lobby (not racing, no chase running): keep a `createIdleYard` for the current roster, rebuilt when the roster signature changes, and step it so the turkeys stroll.
- On `isRacing` going true: `chosen = pickCaught(entries)`, `state = createChase(count, chosenIdx)`, play the gate sound, start the track.
- Each frame: `acc += min(0.1, (now - last) / 1000) * turkeyTimeScale(speed)`; while `acc >= STEP`, call `stepYard(state)` and subtract. The 0.1 s cap is what keeps a background tab from producing a burst.
- Sound cues come from phase changes observed between frames: entering `lunge` → `playWhoosh`, entering `stumble` → `playThud`, entering `caught` → `playCatch`. `playGobble` fires on a 500 ms throttle while any turkey is within `CHASE.FLEE_RADIUS` of the farmer.
- On first seeing `caught`: record `caughtAt`. After 1500 ms, call `onWinner(chosen entry)` once.
- Draw order: yard, obstacles, then turkeys and farmer together sorted by `y`, then dust and feathers, then the caption. Farmer pose: `dive` in `lunge`, `down` in `stumble`, `cheer` in `caught`, otherwise `run`. The caught turkey draws under the net.

Captions along the bottom: idle → "OPEN THE GATE" (or "THE YARD IS EMPTY"), `release` → "HERE COMES THE FARMER!", `chase`/`lunge` → "RUN!", `stumble` → "MISSED!", `commit` → "HE'S GAINING…", `caught` → "GOTCHA!".

`WinnerDialog` copy, following Whac-a-Mole: `headline` is `'🏆 PARDONED 🏆'` when `isChampion`, otherwise `'🍗 CAUGHT!'`; `finalsHeadline` is `'🏆 PARDONED — LAST TURKEY FREE 🏆'` when `isLastPlayer`, otherwise `'🍗 CAUGHT!'`; `nextLabel` is `'🦃 Next Chase'`; `goldTreatment={cw?.isChampion ?? false}`; `autoMinimize={false}`.

- [ ] **Step 3: Implement `TurkeyEscapeMode.tsx`**

Copy `WhacAMoleMode.tsx` (the survival-order wrapper): a catch sets `isChampion: false`; the auto-declared last turkey sets `isLastPlayer: true, isChampion: true`. Wrapper class `turkey-escape-mode`. Start button text: `🚪 Open the Gate ({entries.length})`.

- [ ] **Step 4: Verify**

Run: `npm run build`, `npm run lint`, `npm run test -- --run`
Expected: all exit 0; `registry.test.ts` still passes with the new entry.

- [ ] **Step 5: Manual check in the browser**

Run: `npm run dev -- --port 5174`, select "🦃 Turkey Escape".
Expected, each confirmed by eye:
- 1, 2, 3, 12 and 30 turkeys all play through to a catch.
- The farmer dives and misses twice (once with 2 turkeys, never with 1) before the catch.
- Nothing crosses the fence or walks through a hay bale.
- The winner card names the netted turkey; after the last round the survivor gets the gold "PARDONED" card, and final standings list the survivor first.
- Switching to another tab for 30 seconds mid-chase and back does not fast-forward the chase.
- Reset mid-chase stops the music and no winner card appears afterward.
- The canvas is sharp on a Retina display.

- [ ] **Step 6: Commit**

```bash
git add src/components/modes/TurkeyEscapeMode src/components/modes/types.ts src/components/modes/themes.ts src/components/modes/registry.ts
git commit -m "feat(turkey-escape): add playable Turkey Escape mode"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md` (mode list, and the list of modes with a Settings button)
- Modify: `CLAUDE.md` (mode list in "What this is"; add Turkey Escape to the `survivalOrder` examples in "The mode contract")

- [ ] **Step 1: Add the mode to both files**

README entry in the same style as its neighbours: what you see, that this is an elimination mode where the last turkey free is champion, that the caught turkey is drawn uniformly before the gate opens and the simulation can only catch that one, and the settings.

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: describe Turkey Escape mode"
```
