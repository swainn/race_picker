# Pie Eating Contest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `pie-eating` game mode: every participant sits at a long table with a pumpkin pie, they all eat at once with stalls and bursts, and the first clean plate is the round's pick.

**Architecture:** A self-contained folder under `src/components/modes/PieEatingMode/`, laid out like `TrickOrTreatMode`. The winner is drawn uniformly before the countdown; a pure engine then writes every eater's progress curve so that exactly that eater finishes first. The canvas component only plays those curves back.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Canvas 2D, Vitest. No new dependencies.

**Spec:** None. The Design section below is the design. It is a proposal and has not been approved yet, so read it first and correct anything before Task 1.

## Design

- **What you see:** a harvest-fair hall, a banner, and one to three rows of checkered tables. Each participant is a head and shoulders behind a pie. After a 3-2-1 countdown everyone dives in. Pies shrink slice by slice, crumbs fly, and now and then someone freezes with a blue "brain freeze" face while the others pull ahead.
- **Who wins:** first clean plate. That eater is the round's pick and **places first**, so standings order like Racing and Trick-or-Treat (no `survivalOrder`).
- **Suspense:** the eventual winner is deliberately *not* in the lead at 60% of the contest. One rival (the "rabbit") is ahead at that point, then gets brain freeze and is overtaken.
- **Fairness:** `pickChampion` draws uniformly before anything moves. Seat position, curve shape and the rabbit are all assigned after the draw and never feed back into it.
- **Settings:** pacing (slow / normal / fast), use participant photos as faces, sound effects, music.
- **Not included:** player input, per-participant eating styles, replay.

## Global Constraints

- The pick is `shuffle(entries)[0]` from `src/utils/array.ts`, taken before the animation starts. Nothing drawn or simulated may change it.
- Layouts must seat `MAX_PARTICIPANTS` (30, from `src/constants.ts`) and must work for 1.
- No new runtime dependencies.
- Animation runs in one `requestAnimationFrame` loop mounted once; per-frame state lives in `useRef`, and the loop reads props through a `propsRef`.
- Read images only through `getEntryImages` / `getPreferredEntryImage`.
- Settings persist through a module singleton + `useSyncExternalStore`, with `localStorage` wrapped in try/catch. Storage key: `gamified_picker_pie_eating_settings`.
- `onWinner` is called at the **end** of the cheer beat, because the winner card covers the canvas.
- The canvas backing store matches its displayed size in device pixels. At the top of every frame:

```ts
const dpr = window.devicePixelRatio || 1;
const w = Math.max(PIE.CANVAS_W, Math.round(canvas.clientWidth * dpr));
const h = Math.round(w * (PIE.CANVAS_H / PIE.CANVAS_W));
if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
const scale = canvas.width / PIE.CANVAS_W;
ctx.setTransform(scale, 0, 0, scale, 0, 0);
```

  Multiply any `shadowBlur` by `scale`; it ignores the transform.
- Verification for every task: `npm run build`, `npm run lint`, `npm run test -- --run`. Dev server for manual checks: `npm run dev -- --port 5174`.
- Work on a branch `feat/pie-eating-mode` cut from an up-to-date `main`.

## Review Focus

1. **One participant.** The start button shows at one entry; the contest must run with no rabbit and finish normally. Test in Task 1.
2. **Thirty participants.** Three rows must fit inside the canvas with no two seats overlapping in a row. Test in Task 1.
3. **A loser reaching a clean plate.** No other eater may show an empty pie at the finish; their progress is capped at `MAX_LOSER_PROGRESS`. Test in Task 1.
4. **Reset or mode switch mid-contest.** The mode remounts; audio must stop and no `onWinner` may fire afterward. Manual check in Task 4.
5. **Settings changed mid-contest.** A pacing change must not reorder the finish, because curves are in normalized time. Manual check in Task 4.

## File Structure

```
src/components/modes/PieEatingMode/
  pieEngine.ts                 pure: constants, seat layout, the pick, progress curves
  pieEngine.test.ts
  pieSprites.ts                pure painting: hall, table, eater, pie, crumbs, brain freeze
  pieAudio.ts                  synth sound on utils/synth
  pieEatingSettingsStore.ts    persisted settings
  PieEatingSettings.tsx        settings panel
  PieEatingGame.tsx            canvas + loop + WinnerDialog
  PieEatingGame.css
  PieEatingMode.tsx            ModeViewProps wrapper + start/reset buttons

src/components/modes/types.ts      MODIFY: add 'pie-eating' to GameMode
src/components/modes/themes.ts     MODIFY: add pieEatingTheme
src/components/modes/registry.ts   MODIFY: lazy import + registry entry
README.md, CLAUDE.md               MODIFY: mode lists
```

---

### Task 1: Engine — layout, pick and progress curves

**Files:**
- Create: `src/components/modes/PieEatingMode/pieEngine.ts`
- Test: `src/components/modes/PieEatingMode/pieEngine.test.ts`

**Interfaces:**
- Consumes: `shuffle` from `src/utils/array.ts`, `Entry` from `src/types`, `MAX_PARTICIPANTS` from `src/constants`.
- Produces:

```ts
export const PIE = {
  CANVAS_W: 720, CANVAS_H: 560,
  LINE_L: 50, LINE_R: 670,      // strip of table the seats may occupy
  FRONT_Y: 500,                 // table-top line of the front row
  ROW_GAP: 130,                 // vertical gap between rows
  SEAT_W: 54,
  MAX_PER_ROW: 10,
} as const;

/** Beats of a round in ms, before the speed multiplier. */
export const PIE_T = { countdown: 1800, contest: 11000, cheer: 1500, done: 1000 } as const;

export const MAX_LOSER_PROGRESS = 0.94;
export const RABBIT_AT = 0.6;     // normalized time at which the rabbit must lead
export const RABBIT_LEAD = 0.08;  // minimum lead over the eventual winner at RABBIT_AT

export interface SeatSpot { x: number; y: number; row: number; scale: number }
export interface Knot { t: number; p: number }            // both in [0, 1]
export interface Stall { from: number; to: number }       // normalized time window
export interface EaterPlan { curve: Knot[]; stalls: Stall[] }

export function rowsFor(count: number): number;
export function layoutSeats(count: number): SeatSpot[];
export function pickChampion(entries: Entry[]): Entry;
export function planContest(count: number, chosenIdx: number, rand?: () => number): EaterPlan[];
export function progressAt(plan: EaterPlan, t: number): number;
export function isStalled(plan: EaterPlan, t: number): boolean;
export function leaderAt(plans: EaterPlan[], t: number): number;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  MAX_LOSER_PROGRESS, PIE, PIE_T, RABBIT_AT, RABBIT_LEAD,
  isStalled, layoutSeats, leaderAt, pickChampion, planContest, progressAt, rowsFor,
} from './pieEngine';

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

describe('layoutSeats', () => {
  it('seats everyone, and nobody for an empty table', () => {
    for (const n of COUNTS) expect(layoutSeats(n), `${n}`).toHaveLength(n);
    expect(layoutSeats(0)).toEqual([]);
    expect(layoutSeats(-3)).toEqual([]);
  });

  it('keeps every seat on the table and on the canvas', () => {
    for (const n of COUNTS) for (const s of layoutSeats(n)) {
      expect(s.x - PIE.SEAT_W / 2, `${n}`).toBeGreaterThanOrEqual(PIE.LINE_L - 1e-6);
      expect(s.x + PIE.SEAT_W / 2, `${n}`).toBeLessThanOrEqual(PIE.LINE_R + 1e-6);
      expect(s.y).toBeLessThanOrEqual(PIE.FRONT_Y);
      expect(s.y - 90 * s.scale, `${n}`).toBeGreaterThan(60); // head clears the banner
    }
  });

  it('never seats two eaters on top of each other', () => {
    for (const n of COUNTS) {
      const seats = layoutSeats(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (seats[i].row !== seats[j].row) continue;
        expect(Math.abs(seats[i].x - seats[j].x), `${n}: ${i},${j}`).toBeGreaterThan(PIE.SEAT_W * 0.9);
      }
    }
  });

  it('adds a row only when the table runs out', () => {
    expect(rowsFor(0)).toBe(0);
    expect(rowsFor(PIE.MAX_PER_ROW)).toBe(1);
    expect(rowsFor(PIE.MAX_PER_ROW + 1)).toBe(2);
    expect(rowsFor(MAX_PARTICIPANTS)).toBe(3);
  });
});

describe('pickChampion', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('picks every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const c = pickChampion(entries);
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      expect(counts.get(e.id) ?? 0, e.name).toBeGreaterThan(expected * 0.9);
      expect(counts.get(e.id) ?? 0, e.name).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where an eater sits (fairness)', () => {
    const trials = 16000;
    const bySeat = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) bySeat[entries.indexOf(pickChampion(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of bySeat.entries()) {
      expect(got, `seat ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `seat ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

describe('planContest', () => {
  const cases = COUNTS.flatMap((n) => [1, 2, 3, 4, 5].map((seed) => ({ n, seed })));

  it('writes one plan per eater', () => {
    for (const { n, seed } of cases) expect(planContest(n, 0, seeded(seed))).toHaveLength(n);
  });

  it('never lets a pie grow back', () => {
    for (const { n, seed } of cases) {
      for (const plan of planContest(n, (seed * 7) % n, seeded(seed))) {
        expect(plan.curve[0]).toEqual({ t: 0, p: 0 });
        expect(plan.curve[plan.curve.length - 1].t).toBe(1);
        for (let k = 1; k < plan.curve.length; k++) {
          expect(plan.curve[k].t).toBeGreaterThan(plan.curve[k - 1].t);
          expect(plan.curve[k].p).toBeGreaterThanOrEqual(plan.curve[k - 1].p);
        }
      }
    }
  });

  it('has the chosen eater, and only them, clear the plate (fairness)', () => {
    for (const { n, seed } of cases) {
      const chosen = (seed * 7) % n;
      const plans = planContest(n, chosen, seeded(seed));
      expect(progressAt(plans[chosen], 1)).toBe(1);
      expect(progressAt(plans[chosen], 0.999)).toBeLessThan(1);
      plans.forEach((plan, i) => {
        if (i === chosen) return;
        expect(progressAt(plan, 1), `${n}/${seed}/${i}`).toBeLessThanOrEqual(MAX_LOSER_PROGRESS);
      });
      expect(leaderAt(plans, 1)).toBe(chosen);
    }
  });

  it('keeps the winner out of the lead at the turn', () => {
    for (const { n, seed } of cases) {
      if (n < 2) continue;
      const chosen = (seed * 7) % n;
      const plans = planContest(n, chosen, seeded(seed));
      const leader = leaderAt(plans, RABBIT_AT);
      expect(leader, `${n}/${seed}`).not.toBe(chosen);
      expect(progressAt(plans[leader], RABBIT_AT) - progressAt(plans[chosen], RABBIT_AT))
        .toBeGreaterThanOrEqual(RABBIT_LEAD - 1e-9);
    }
  });

  it('reports a stall exactly where progress is flat', () => {
    for (const plan of planContest(12, 3, seeded(9))) {
      for (const s of plan.stalls) {
        expect(s.to).toBeGreaterThan(s.from);
        expect(progressAt(plan, s.to)).toBeCloseTo(progressAt(plan, s.from), 9);
        expect(isStalled(plan, (s.from + s.to) / 2)).toBe(true);
      }
      expect(isStalled(plan, 0)).toBe(false);
    }
  });

  it('clamps time outside the contest', () => {
    const [plan] = planContest(1, 0, seeded(1));
    expect(progressAt(plan, -1)).toBe(0);
    expect(progressAt(plan, 2)).toBe(1);
  });
});

describe('timing', () => {
  it('gives every beat a positive length', () => {
    for (const [name, ms] of Object.entries(PIE_T)) expect(ms, name).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- --run src/components/modes/PieEatingMode/pieEngine.test.ts`
Expected: FAIL, cannot resolve `./pieEngine`.

- [ ] **Step 3: Implement `pieEngine.ts`**

`layoutSeats` follows `layoutKids` in `TrickOrTreatMode/treatEngine.ts`: rows of at most `MAX_PER_ROW`, row 0 at the back, front row at `FRONT_Y`, back rows scaled `1 - fromFront * 0.1`, no stagger. `progressAt` is linear interpolation between knots with `t` clamped to `[0, 1]`. `leaderAt` returns the index with the highest progress, lowest index on ties.

`planContest` is the one algorithm the signatures do not determine:

```
winner:  (0,0) -> (RABBIT_AT, pw) -> (1,1)        pw = 0.50 + rand()*0.06
         optionally one stall of width 0.06 somewhere in [0.15, 0.45]
rabbit:  only when count >= 2; a non-chosen index drawn with rand
         (0,0) -> (RABBIT_AT, pw + RABBIT_LEAD + rand()*0.06)
         stall from RABBIT_AT + 0.05 to RABBIT_AT + 0.25 (brain freeze)
         -> (1, f)   f = 0.88 + rand()*(MAX_LOSER_PROGRESS - 0.88)
others:  final f = 0.55 + rand()*(MAX_LOSER_PROGRESS - 0.55)
         progress at RABBIT_AT capped at the rabbit's value minus 0.01
         3 to 5 knots, 0 to 2 stalls of width 0.05 to 0.12
every curve: knots strictly increasing in t, non-decreasing in p,
             a stall is two knots with equal p and is also listed in `stalls`
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test -- --run src/components/modes/PieEatingMode/pieEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modes/PieEatingMode/pieEngine.ts src/components/modes/PieEatingMode/pieEngine.test.ts
git commit -m "feat(pie-eating): add contest engine with layout, pick and progress curves"
```

---

### Task 2: Sprites and audio

**Files:**
- Create: `src/components/modes/PieEatingMode/pieSprites.ts`
- Create: `src/components/modes/PieEatingMode/pieAudio.ts`

**Interfaces:**
- Consumes: `PIE`, `SeatSpot` from Task 1; `tone`, `noise`, `createBus`, `getAudioContext`, `resumeAudio` from `src/utils/synth.ts`; `isGlobalMuted` from `src/utils/globalAudioStore.ts`.
- Produces:

```ts
// pieSprites.ts — pure painting; the caller decides positions and state.
export function drawHall(ctx: CanvasRenderingContext2D, now: number): void;
export function drawTable(ctx: CanvasRenderingContext2D, y: number, scale: number): void;
export interface EaterOptions {
  color: string; initials: string; avatar: HTMLImageElement | null;
  progress: number;      // 0..1 of the pie eaten
  chomp: number;         // 0..1 head-bob phase
  stalled: boolean;      // brain freeze
  finished: boolean;     // clean plate, arms up
  sinceFinish: number;   // ms
}
export function drawEater(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, o: EaterOptions): void;
export function drawPie(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, remaining: number): void;
export function drawCrumbs(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void;
export function drawCountdown(ctx: CanvasRenderingContext2D, label: string, t: number): void;

// pieAudio.ts
export function resumePieAudio(): void;
export function setPieMuted(m: boolean): void;
export function setPieMusicMuted(m: boolean): void;
export function playCountBeep(final: boolean): void;
export function playMunch(): void;
export function playBrainFreeze(): void;
export function playBell(): void;
export function playCheer(): void;
export function startTrack(): void;
export function stopTrack(): void;
```

- [ ] **Step 1: Implement `pieSprites.ts`**

Hall: warm barn-wood wall, a "PIE EATING CONTEST" banner across the top 60 px, bunting, and a plank floor. Tables are a red-and-white checkered cloth strip per row. The pie is a pumpkin-orange disc with a crust rim; `remaining` is drawn as a filled sector of that fraction, starting at 12 o'clock, on a pie tin that stays visible. The eater is a head and shoulders above the table in `color`, with the avatar clipped to a circle on a **black** disc as the face when present and `initials` otherwise; the head dips toward the pie with `chomp`. A stalled eater gets a blue face tint and a snowflake above the head. A finished eater raises both arms and gets a blue ribbon.

- [ ] **Step 2: Implement `pieAudio.ts`**

Follow `TrickOrTreatMode/treatAudio.ts` exactly for the mute flags, the `isGlobalMuted()` checks and the `setInterval` track with `stopTrack`. The track is a bright major-key fiddle-style vamp at about 300 ms per step.

- [ ] **Step 3: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/modes/PieEatingMode/pieSprites.ts src/components/modes/PieEatingMode/pieAudio.ts
git commit -m "feat(pie-eating): add sprites and synth audio"
```

---

### Task 3: Settings store and panel

**Files:**
- Create: `src/components/modes/PieEatingMode/pieEatingSettingsStore.ts`
- Create: `src/components/modes/PieEatingMode/PieEatingSettings.tsx`

**Interfaces:**
- Produces:

```ts
export type PieSpeed = 'slow' | 'normal' | 'fast';
export interface PieEatingSettings { speed: PieSpeed; useAvatars: boolean; sound: boolean; music: boolean }
export function usePieEatingSettings(): PieEatingSettings;
export function updatePieEatingSettings(next: Partial<PieEatingSettings>): void;
/** Multiplier on every PIE_T duration: slow 1.4, normal 1, fast 0.62. */
export function pieSpeedFactor(speed: PieSpeed): number;
export function PieEatingSettings(): JSX.Element; // from PieEatingSettings.tsx
```

- [ ] **Step 1: Implement both files**

Copy the structure of `trickOrTreatSettingsStore.ts` and `TrickOrTreatSettings.tsx`. Defaults: `speed: 'normal'`, the three booleans `true`. Storage key `gamified_picker_pie_eating_settings`. Fieldset legends: "Pacing", "Contestants" ("Use participant photos as faces"), "Sound" ("Contest sound effects", "Fair music"). Radio group name `pie-eating-speed`.

- [ ] **Step 2: Verify**

Run: `npm run build` then `npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/modes/PieEatingMode/pieEatingSettingsStore.ts src/components/modes/PieEatingMode/PieEatingSettings.tsx
git commit -m "feat(pie-eating): add persisted settings and panel"
```

---

### Task 4: Game component, mode wrapper and registration

**Files:**
- Create: `src/components/modes/PieEatingMode/PieEatingGame.tsx`
- Create: `src/components/modes/PieEatingMode/PieEatingGame.css`
- Create: `src/components/modes/PieEatingMode/PieEatingMode.tsx`
- Modify: `src/components/modes/types.ts` (add `| 'pie-eating'` to `GameMode`)
- Modify: `src/components/modes/themes.ts` (add `pieEatingTheme`)
- Modify: `src/components/modes/registry.ts` (lazy import, settings import, registry entry)

**Interfaces:**
- Consumes: everything produced by Tasks 1–3; `WinnerDialog`, `ModeViewProps`, `WinnerTheme`.
- Produces: `export function PieEatingMode(props: ModeViewProps)`, `export function PieEatingGame(props)`, and

```ts
export interface PieWinnerDisplay {
  name: string; imageDataUrl?: string; allImages?: string[];
  isLastPlayer?: boolean; isChampion?: boolean;
}
```

- [ ] **Step 1: Add the theme, the union member and the registry entry**

```ts
// themes.ts
/** Pie Eating Contest — pumpkin filling on a barn-wood brown. */
export const pieEatingTheme: WinnerTheme = {
  accent: '#E2711D',
  accentSoft: 'rgba(226, 113, 29, 0.45)',
  bgGradient: 'linear-gradient(145deg, #6b2d1a, #2b120a)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#FFD9A0',
  fontFamily: '"Arial Black", system-ui, sans-serif',
  letterSpacing: '1px',
  buttonStyle: 'solid',
};

// registry.ts
// First clean plate is the pick, so this orders like Racing: first finished places first.
'pie-eating': { View: PieEatingMode, Settings: PieEatingSettings, theme: pieEatingTheme, label: '🥧 Pie Eating Contest' },
```

- [ ] **Step 2: Implement `PieEatingGame.tsx` and its CSS**

Model it on `TrickOrTreatGame.tsx`: same `Props` shape (with `PieWinnerDisplay`), the same `propsRef` / settings refs, the same lobby reseeding by roster signature, and the same `WinnerDialog` block. CSS is `TrickOrTreatGame.css` with the class names `pie-eating-game` / `pie-eating-canvas-host` and border colour `#5a2f14`, background `#2b120a`.

Phases: `'ready' | 'countdown' | 'contest' | 'cheer' | 'done'`.

- On `isRacing` going true: seed eaters into `layoutSeats`, `chosen = pickChampion(entries)`, `plans = planContest(count, chosenIdx)`, play the first beep, enter `countdown`.
- `countdown` shows "3", "2", "1", "EAT!" in equal quarters of `PIE_T.countdown`, with a beep on each change.
- `contest` computes `t = elapsed / (PIE_T.contest * pieSpeedFactor(speed))`, recomputed from the current setting every frame against a stored normalized `t` so a pacing change mid-contest continues from the same point. Each eater draws at `progressAt(plan, t)` with `stalled: isStalled(plan, t)`. Play `playMunch` on a 140 ms throttle and `playBrainFreeze` when any eater enters a stall.
- At `t >= 1`: bell and cheer, mark the chosen eater finished, enter `cheer`.
- At the end of `cheer`: call `onWinner(chosen)` once, enter `done`.

Captions along the bottom: `ready` → "RING THE DINNER BELL" (or "THE TABLE IS EMPTY"), `countdown` → "FORKS DOWN, FACES IN", `contest` → "WHO CLEARS THE PLATE…?", `cheer`/`done` → "CLEAN PLATE!".

`WinnerDialog` copy: `headline` is `'🏆 PIE CHAMPION 🏆'` when `isChampion`, otherwise `'🥧 CLEAN PLATE!'`; `finalsHeadline` is `'🍂 LAST ONE AT THE TABLE'` when `isLastPlayer`, otherwise `'🏆 PIE CHAMPION 🏆'`; `nextLabel` is `'🥧 Next Pie'`; `goldTreatment={cw?.isChampion ?? false}`; `autoMinimize={false}`.

- [ ] **Step 3: Implement `PieEatingMode.tsx`**

Copy `TrickOrTreatMode.tsx`, including its four prop-sync effects and `isChampion: winOrder.size === 0`. Wrapper class `pie-eating-mode`. Start button text: `🔔 Ring the Dinner Bell ({entries.length})`.

- [ ] **Step 4: Verify**

Run: `npm run build`, `npm run lint`, `npm run test -- --run`
Expected: all exit 0; `registry.test.ts` still passes with the new entry.

- [ ] **Step 5: Manual check in the browser**

Run: `npm run dev -- --port 5174`, select "🥧 Pie Eating Contest".
Expected, each confirmed by eye:
- 1, 2, 10, 11 and 30 participants all seat cleanly and the contest finishes.
- Exactly one pie is empty at the bell; the winner card names that eater.
- The eventual winner is visibly behind someone at the midpoint.
- Reset mid-contest stops the music and no winner card appears afterward.
- Changing pacing mid-contest changes speed without a jump in any pie.
- The canvas is sharp on a Retina display.

- [ ] **Step 6: Commit**

```bash
git add src/components/modes/PieEatingMode src/components/modes/types.ts src/components/modes/themes.ts src/components/modes/registry.ts
git commit -m "feat(pie-eating): add playable Pie Eating Contest mode"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` (mode list, and the list of modes with a Settings button)
- Modify: `CLAUDE.md` (mode list in "What this is")

- [ ] **Step 1: Add the mode to both lists**

README entry, after Trick-or-Treat, in the same style as its neighbours: what you see, that the first clean plate places first, that the winner is drawn uniformly before the countdown and the curves are written to produce it, the rabbit, and the settings.

- [ ] **Step 2: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: describe Pie Eating Contest mode"
```
