# Wheel Mode — Design Spec

**Date:** 2026-05-07
**Branch:** `swainn/wheel-mode`
**Source:** [swainn/price_wheel_site](https://github.com/swainn/price_wheel_site) — vanilla JS/HTML/CSS Canvas wheel-spinner

## Goal

Add a sixth game mode, **🎡 Wheel**, that ports the side-on stripe-wheel picker from `price_wheel_site` into the existing `gamified_picker` app, conforming to the established `ModeViewProps` contract used by the other five modes.

## Scope

In scope:

- Side-on (vertical-stripe) canvas wheel with 4-second spin, cubic ease-out, 3 rotations.
- Procedural Web Audio tick sounds (8 types + random + cycle), with selector and mute, persisted to localStorage.
- Per-spin manual flow (one spin → one winner → "Spin Again"), matching `PlinkoMode`.
- Avatar + name on segments when an entry has an uploaded image; text-only fallback.
- Simple winner overlay (name + avatar + "Spin Again" button) — no elemental effects.
- Easter-egg side-scrolling runner game, triggered via `Ctrl+.`.

Out of scope:

- Pie-wedge wheel variant.
- Auto-spin cascade.
- Sub-modes (visual variants).
- Reusing Plinko's elemental effects.
- Wheel-themed celebration FX (confetti, segment flashes).
- Wheel-specific theme (dark/light/auto) — wheel uses its own fixed palette; app theme is unchanged.
- Automated tests (consistent with existing modes).

## Architecture

### File layout

```
src/components/modes/WheelMode/
  WheelMode.tsx       // ModeViewProps adapter, sound/mute UI, winner overlay, easter-egg trigger
  WheelGame.tsx       // canvas, spin physics, tick triggering, avatar pre-loading
  WheelGame.css       // segment palette, overlay, sound-selector styles
  RunnerGame.tsx      // hidden side-scrolling runner game (easter egg)
  audio.ts            // 8 procedural Web Audio tick sounds + mute helper
```

Mirrors `PlinkoMode/` structure (`PlinkoMode.tsx` + `PlinkoGame.tsx` + `PlinkoGame.css`).

### Host integration points

- `src/components/modes/types.ts` — extend `GameMode` union: add `'wheel'`.
- `src/App.tsx`:
  - Import `WheelMode` from `./components/modes/WheelMode/WheelMode`.
  - Add `{ value: 'wheel', label: '🎡 Wheel' }` to `MODES`.
  - Add `case 'wheel': return <WheelMode {...modeProps} />;` to the `renderMode` switch.

No other host changes — the existing `resetKey` / mode-switch / entry-change plumbing handles wheel state lifecycle for free.

## Components

### `WheelMode.tsx`

Adapter between the host's `ModeViewProps` and the wheel game.

Local state:

```ts
const [winnerSnapshot, setWinnerSnapshot] = useState<{ name: string; image?: string } | null>(null);
const [soundType, setSoundType] = useState<SoundType>(loadFromStorage('wheel_mode_sound', 'classic'));
const [muted, setMuted] = useState<boolean>(loadFromStorage('wheel_mode_muted', false));
const [showRunner, setShowRunner] = useState<boolean>(false);
```

Behavior:

- Clear `winnerSnapshot` when `eliminatedIds.length === 0` (parent reset signal). Same pattern as `PlinkoMode`.
- Persist `soundType` and `muted` to localStorage on change.
- `keydown` listener on `document` (mount-scoped) toggles `showRunner` on `Ctrl+.` and closes it on `Escape`.
- Renders, in order:
  1. **Race controls** — `🎡 Spin Wheel (N)` button (visible when `entries.length >= 1` and `!isRacing`); `🔄 Reset` button (visible when `eliminatedIds.length > 0`); sound `<select>` and mute toggle (hidden during `isRacing`).
  2. **Winner overlay** (when `currentWinner` is set) — name + avatar + "Spin Again" button calling `onRaceComplete()`.
  3. **`<WheelGame …>`** — receives entries, isRacing, soundType, muted, and `onWinner`.
  4. **`<RunnerGame open={showRunner} onClose={…} />`** — overlay; only mounts when open.

### `WheelGame.tsx`

Canvas, drawing, spin physics, tick triggering.

Props:

```ts
interface WheelGameProps {
  entries: Entry[];
  allEntries: Entry[];
  isRacing: boolean;
  soundType: SoundType;
  muted: boolean;
  currentWinner: string | null;
  onWinner: (entry: Entry) => void;
}
```

Internal:

- `canvasRef` — ~650×550 canvas.
- `imagesRef: Map<entryId, HTMLImageElement>` — pre-loads `entry.imageDataUrls[0]` whenever `entries` changes; pruned on entry removal.
- `offsetRef: number` — current rotation offset (mutable, advanced by RAF).
- `rafRef: number | null` — current animation handle.
- `lastCenterIdxRef: number | null` — for tick edge detection.

Drawing:

- `drawWheelWithOffset(ctx, offset, entries)`:
  - Stripe height = `canvas.height / entries.length` (capped/floored for readability).
  - Each stripe: rectangle filled with palette color (`palette[i % palette.length]`), divider line top/bottom, stripe text.
  - Stripe text: if `imagesRef[entry.id]` exists, draw image as a left-aligned circle (~radius `min(stripeHeight, 40) / 2`), then `ctx.fillText(entry.name)` shifted right by image diameter + padding. Otherwise text only.
  - Center horizontal indicator line (selection point) drawn over the stripes.
  - Top/bottom thickness rectangles for the disc-edge effect.
- Colors: 8-color palette defined in `WheelGame.css` as CSS custom properties on `.wheel-game-root`, read via `getComputedStyle(root).getPropertyValue('--wheel-color-N')`. Independent of host app theme.

Spin lifecycle:

- `useEffect` on `isRacing`:
  - On `false → true`: pick `winnerIndex = Math.floor(Math.random() * entries.length)`, compute target offset that centers `winnerIndex`'s stripe on the indicator after 3 full rotations, then start RAF loop. Each frame:
    - `progress = elapsed / 4000`, clamped to 1.
    - `eased = 1 - Math.pow(1 - progress, 3)`.
    - `offsetRef = startOffset + (target - startOffset) * eased` (mod total wheel length).
    - Compute `centerIdx = getIndexAtCentre(offsetRef)`. If `centerIdx !== lastCenterIdxRef`, call `playTick(soundType)` (skipped if `muted`); update `lastCenterIdxRef`.
    - Redraw.
    - When `progress >= 1`: `cancelAnimationFrame`, call `onWinner(entries[winnerIndex])`.
  - On `true → false`: `cancelAnimationFrame`, leave wheel in current position (parent will re-mount on reset via `resetKey`).
- Cleanup on unmount cancels RAF.

Winner determinism: `winnerIndex` is chosen up-front; `getIndexAtCentre` only drives sounds, not the result.

### `audio.ts`

```ts
export type SoundType =
  | 'classic' | 'beep' | 'click' | 'pop' | 'blip' | 'thud' | 'bass' | 'drum'
  | 'random' | 'cycle';

export function playTick(type: SoundType): void;
export function setMuted(muted: boolean): void;
export function isMuted(): boolean;
```

- Singleton `AudioContext`, lazily created on first `playTick` call (must originate from a user gesture, so first call comes from the spin button click).
- Each of the 8 named sounds is a small function building an `OscillatorNode` + `GainNode` envelope; oscillator stops and disconnects in `oscillator.onended`.
- `'random'` picks a uniform random sound each call. `'cycle'` advances a module-local counter through the 8 sounds.
- `playTick` is a no-op when muted.
- Mute state cached in module scope so `WheelGame`'s draw loop doesn't have to re-read localStorage.

### `RunnerGame.tsx`

Self-contained side-scroller. Direct port of source's runner.

Props: `{ open: boolean; onClose: () => void }`. Renders nothing when `open` is false.

When open: absolutely-positioned overlay over the wheel area (z-index above canvas), with its own ~600×200 canvas, score readout, jump button, and "Exit" button. Spacebar/click jumps; obstacles spawn at increasing rate; collision ends the run; high score persisted as `wheel_runner_high_score` in localStorage. RAF loop is internal; cancelled on close/unmount.

No interaction with wheel state — wheel keeps running underneath, harmlessly.

## Data flow

```
[ App.tsx state: entries, eliminatedIds, isRacing, currentWinner ]
        |
        v  (props)
[ WheelMode.tsx ]  -- local: winnerSnapshot, soundType, muted, showRunner
        |
        v  (props)
[ WheelGame.tsx ]  -- internal: canvas, RAF, imagesRef, offsetRef
        |
        | onWinner(entry)
        v
[ App.tsx handleWinner ]  -- updates eliminatedIds, winOrder, currentWinner
```

`onRaceComplete` is called from the winner overlay's "Spin Again" button (parent then advances or auto-promotes the last entry).

## Persistence

New localStorage keys (wheel-scoped):

- `wheel_mode_sound` — `SoundType` string.
- `wheel_mode_muted` — boolean.
- `wheel_runner_high_score` — number.

Existing keys (`gamified_picker_entries`, `gamified_picker_groups`, `gamified_picker_mode`) are unchanged.

## Error handling

- Web Audio init failure (older browsers, blocked autoplay): `playTick` swallows the error and becomes a no-op for the session. Logged via `console.warn` once.
- Image decode failure on avatars: pre-loader catches `onerror` and removes the entry from `imagesRef`; segment falls back to text-only.
- `entries.length === 0` during render: draw an empty wheel (just the disc + indicator) and disable the Spin button. Guarded by the existing `entries.length >= 1` condition.
- Animation cancellation on unmount or mode switch: cleanup function in `useEffect` always cancels `rafRef`.

## Manual verification checklist

1. Mode dropdown shows "🎡 Wheel"; selecting it switches to the new mode.
2. Wheel renders with N entries (1, 2, 5, 20). Single entry: Spin button still appears; clicking auto-promotes via parent.
3. Spin animates ~4 s, decelerates smoothly, lands on a stripe centered on the indicator. Winner matches the centered stripe.
4. `onWinner` fires with the correct entry; parent's `eliminatedIds` and `winOrder` update.
5. Avatars render on segments when present; text-only fallback when absent.
6. Tick sounds fire on segment crossings; mute silences them; sound `<select>` changes the type; both prefs persist across reload.
7. Mode switch mid-race prompts confirmation, then resets cleanly. Sound + mute prefs are NOT cleared on mode switch.
8. Reset button clears the wheel, cancels animation, and re-enables Spin.
9. Final standings dialog shows correct order after the last spin.
10. `Ctrl+.` opens the runner game over the wheel; `Esc` closes it; wheel remains usable after; high score persists.
11. No console errors during normal operation; Web Audio init runs only on first user gesture.

## Risks and notes

- **Browser autoplay policy** — addressed by lazy `AudioContext` creation tied to the spin click.
- **Avatar timing** — first draw before image decode falls back to text; subsequent frames pick up the cached image. Acceptable.
- **Adjacent palette colors** — palette has 8 colors; with the existing 20-entry cap there will be repeats but stripes are separated by dividers, so readability holds.
- **No tests** — matches existing convention. If a test suite is later added (Vitest), the `audio.ts` and the winner-pick logic in `WheelGame` are the obvious unit-test targets.

## Open / deferred

- None at design time. All clarifying questions resolved during brainstorming.
