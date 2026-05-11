# Unified Game Mode UX — Design Spec

**Date:** 2026-05-08
**Branch:** `swainn/dry-refactor-review`
**Builds on:** Phase 1 DRY refactor (`src/utils/{colors,entryImages,array,storage}.ts`) on the same branch.

## Goal

Unify three cross-mode UX surfaces — the **winner dialog**, **leaderboard / final standings**, and **instant replay** — across all seven game modes, using the LightCycles flow as the reference. Standardize where mode-specific settings live by moving them into a single shared **settings modal** opened by a global toolbar button.

The flow and structure are unified; each mode keeps a distinct visual theme (color palette, accent, optional font) via theme tokens.

## Scope

In scope:

- A shared `<WinnerDialog>` component that owns the expanded → minimized-pill → finals state machine and the auto-minimize timing.
- A `WinnerTheme` token type and per-mode theme constants in `themes.ts`.
- A shared `useWinnerLifecycle` hook for phase + timer state.
- A generic `useReplayRecorder<TFrame>` hook for canvas-based modes (Racing, WallClimber, Plinko, BattleBots, LightCycles).
- A `useShotReplay` hook for Battleship's turn-based replay.
- A shared `<SettingsModal>` with neutral chrome (matches `ManagementDialog`).
- A mode registry (`src/components/modes/registry.ts`) mapping each `GameMode` to `{ View, Settings?, theme }`.
- New per-mode settings panels: `RacingSettings`, `WallClimberSettings`, `WheelSettings`, `BattleshipSettings` — pure relocation of existing inline controls into the modal.
- Wiring Wheel into `FinalStandingsDialog` (it currently has no leaderboard).
- A standardized "▶ FINALS" gold button + gold banner state when the current winner is the last player standing.

Out of scope:

- Adding replay to Wheel (single-shot mechanic; nothing meaningful to replay).
- Restructuring `FinalStandingsDialog` itself (already shared and adequate).
- Changing the visual identity (colors / fonts) of any mode beyond the theme-token extraction. Modes look the same as today, just rendered through shared components.
- Adding new settings to modes that don't currently have any (LightCycles, Plinko, BattleBots) — those modes simply hide the settings button.
- Replay UI controls beyond auto-play-once + a single "↻" restart button.

## Architecture

### New folders / files

```
src/
  components/
    shared/
      WinnerDialog/
        WinnerDialog.tsx
        WinnerDialog.css
        types.ts
      SettingsModal/
        SettingsModal.tsx
        SettingsModal.css
    modes/
      registry.ts
      themes.ts
      RacingMode/RacingSettings.tsx           (new)
      WallClimberMode/WallClimberSettings.tsx (new)
      BattleshipMode/BattleshipSettings.tsx   (new)
      WheelMode/WheelSettings.tsx             (new)
  hooks/
    useWinnerLifecycle.ts
    useReplayRecorder.ts
    useShotReplay.ts
```

### Mode registry

`src/components/modes/registry.ts` is the single dispatch table that App.tsx reads to (a) render the active mode, (b) decide whether to show the gear button, (c) render the active mode's settings panel inside the shared modal:

```ts
import type { ComponentType } from 'react';
import type { GameMode } from './types';
import type { ModeViewProps } from './types';
import type { WinnerTheme } from './themes';

interface ModeEntry {
  View: ComponentType<ModeViewProps>;
  Settings?: ComponentType;
  theme: WinnerTheme;
  label: string;
}

export const MODE_REGISTRY: Record<GameMode, ModeEntry> = {
  racing:         { View: RacingMode,      Settings: RacingSettings,      theme: racingTheme,       label: '🏁 Racing' },
  'battle-bots':  { View: BattleBotsMode,  Settings: undefined,           theme: battleBotsTheme,   label: '⚔️ Battle Bots' },
  'light-cycles': { View: LightCyclesMode, Settings: undefined,           theme: lightCyclesTheme,  label: '🏍️ Light Cycles' },
  plinko:         { View: PlinkoMode,      Settings: undefined,           theme: plinkoTheme,       label: '🎯 Plinko' },
  'wall-climber': { View: WallClimberMode, Settings: WallClimberSettings, theme: wallClimberTheme,  label: '🧗 Wall Climber' },
  battleship:     { View: BattleshipMode,  Settings: BattleshipSettings,  theme: battleshipTheme,   label: '🚢 Battleship' },
  wheel:          { View: WheelMode,       Settings: WheelSettings,       theme: wheelTheme,        label: '🎡 Wheel' },
};
```

This replaces the current per-mode `if/else` switching block in `App.tsx` and the parallel `MODES` label array.

### Data flow at a glance

1. App reads `MODE_REGISTRY[gameMode]`, renders `<entry.View />` and conditionally a `<button>⚙ Settings</button>` when `entry.Settings` is defined.
2. Each mode's existing winner state (e.g., `winnerDisplay`) gets passed into `<WinnerDialog theme={entry.theme} ...>` instead of being rendered manually.
3. Replay-capable modes use `useReplayRecorder` (or `useShotReplay` for Battleship) internally; on minimize, `WinnerDialog` calls `onReplayStart()` if the mode provided it.
4. The settings modal renders `<entry.Settings />` if defined; the panel owns its own state via `useState` + `localStorage` (unchanged from today, just relocated).

## Components

### `<WinnerDialog>`

Props:

```ts
interface WinnerInfo {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
}

interface KillerInfo {
  name: string;
  weapon: string;
}

interface WinnerEffects {
  fire: boolean;
  ice: boolean;
  green: boolean;
  lightning: boolean;
}

interface WinnerDialogProps {
  theme: WinnerTheme;
  show: boolean;
  isFinals: boolean;
  winner: WinnerInfo;
  killerInfo?: KillerInfo;
  effects?: WinnerEffects;
  onNext: () => void;
  onShowFinalStandings?: () => void;
  onReplayStart?: () => void;
  autoMinimizeMs?: number; // default 3000
}
```

Phases (managed by `useWinnerLifecycle`):

- `hidden` — `show=false`.
- `expanded` — full banner: 88px circular avatar with accent border + glow, name (theme font), optional killer-info row (13px, 75% opacity), optional effect rings (when `effects` provided), minimize button (−) top-right, primary action button.
- `minimized` — bottom-center pill: small avatar (40px), name, primary action, optional "↻" replay restart.

Transitions:

- `hidden → expanded` when `show` becomes `true`.
- `expanded → minimized` after `autoMinimizeMs` elapses, OR when user clicks (−).
- Entering `minimized` calls `onReplayStart()` if provided. The mode renders the replay underneath.
- `* → hidden` when `show` becomes `false`.

Primary action label/color:

- `isFinals=false` → "▶ Next" using `--accent`.
- `isFinals=true` → "▶ FINALS" using `--finals-accent`. Calls `onShowFinalStandings()`. The whole banner uses the gold finals theme.

The component sets all theme tokens as inline CSS custom properties on its root element. The shared CSS reads them and never hard-codes colors:

```css
.winner-dialog {
  background: var(--bg-gradient);
  border: 2px solid var(--accent);
  box-shadow: 0 0 16px var(--accent-soft);
  font-family: var(--font-family, inherit);
  letter-spacing: var(--letter-spacing, normal);
}
.winner-dialog[data-finals="true"] {
  background: var(--finals-bg-gradient);
  border-color: var(--finals-accent);
}
```

### `WinnerTheme` and `themes.ts`

```ts
// src/components/modes/themes.ts
export interface WinnerTheme {
  accent: string;
  accentSoft: string;       // rgba glow
  bgGradient: string;       // CSS gradient string
  finalsAccent: string;     // gold-equivalent
  finalsBgGradient: string;
  fontFamily?: string;
  letterSpacing?: string;
}

export const lightCyclesTheme: WinnerTheme = {
  accent: '#00E5FF',
  accentSoft: 'rgba(0,229,255,0.55)',
  bgGradient: 'linear-gradient(135deg,#03182a 0%,#061026 100%)',
  finalsAccent: '#FFE600',
  finalsBgGradient: 'linear-gradient(135deg,#2a1d03 0%,#1a1003 100%)',
  fontFamily: '"Courier New", monospace',
  letterSpacing: '1px',
};

export const racingTheme: WinnerTheme = {
  accent: '#236192',
  accentSoft: 'rgba(35,97,146,0.55)',
  bgGradient: 'linear-gradient(135deg,#236192 0%,#1a4d7a 100%)',
  finalsAccent: '#FFE600',
  finalsBgGradient: 'linear-gradient(135deg,#2a1d03 0%,#1a1003 100%)',
};

// Plus battleBotsTheme, plinkoTheme, wallClimberTheme, battleshipTheme, wheelTheme.
// All seven derived from current per-mode CSS to preserve today's look.
```

### `<SettingsModal>`

Props:

```ts
interface SettingsModalProps {
  show: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}
```

Chrome:

- Backdrop scrim (matches `ManagementDialog`).
- Centered card, fixed `min-width: 360px`, `max-width: 560px`.
- Header: title text on the left, close (×) button on the right.
- Body: `children` (the active mode's settings panel).
- No save/cancel — settings auto-persist on change.

### Per-mode settings panels

Each is a pure relocation of existing controls; state shape and `localStorage` keys are unchanged.

- **`RacingSettings`** — radio group for vehicle mode (currently `RacingMode.tsx:77–91`). State lives in a small `useRacingSettingsStore.ts` hook within the mode folder so the canvas and the panel both read it. Not currently persisted; we keep it that way unless persistence becomes desirable later.
- **`WallClimberSettings`** — mirror of Racing.
- **`WheelSettings`** — sound dropdown + mute toggle (currently `WheelMode.tsx:154–177`). Continues to persist to `wheel_mode_sound` and `wheel_mode_muted`. The `Ctrl+.` Runner-game easter egg stays in `WheelMode.tsx` (not moved into the panel).
- **`BattleshipSettings`** — three fieldsets (ship sizes, visibility, persistent layout) currently `BattleshipMode.tsx:660–742`. Continues to persist to `gamified_picker_battleship_settings`.

## Hooks

### `useWinnerLifecycle`

Internal to `<WinnerDialog>`. Owns:

```ts
function useWinnerLifecycle(args: {
  show: boolean;
  autoMinimizeMs: number;
  onMinimize?: () => void;
}): {
  phase: 'hidden' | 'expanded' | 'minimized';
  minimize: () => void;
};
```

- When `show` flips false → true: phase = `expanded`, start auto-minimize timer.
- When timer fires OR `minimize()` called: phase = `minimized`, call `onMinimize()` once.
- When `show` flips back to false: phase = `hidden`, clear timers.

### `useReplayRecorder<TFrame>`

```ts
interface ReplayHandle<TFrame> {
  record: (frame: TFrame) => void;
  clear: () => void;
  start: () => void;
  stop: () => void;
  isReplaying: boolean;
  currentFrame: TFrame | null;
}

function useReplayRecorder<TFrame>(opts?: {
  maxFrames?: number; // default 600 (~10s @ 60fps)
}): ReplayHandle<TFrame>;
```

Behavior:

- `record(frame)` appends to a ring buffer of up to `maxFrames`. After buffer fills, oldest frame drops.
- `clear()` empties the buffer (call on race start).
- `start()` begins playback at frame 0; on each animation tick the hook advances `currentFrame`. When the last frame is reached, `currentFrame` stays pinned to it (no loop, no auto-clear).
- `stop()` halts playback and pins `currentFrame` to its current value.
- `isReplaying` is true while playback is active.

The mode reads `replay.isReplaying ? replay.currentFrame : liveState` inside its `requestAnimationFrame` render function and feeds the appropriate state into the canvas draw calls.

### `useShotReplay` (Battleship-only)

```ts
interface ShotEvent {
  cell: { x: number; y: number };
  cannon: CannonCorner;
  result: ShotResult;
  timestamp: number;
}

function useShotReplay(): {
  recordShot: (shot: ShotEvent) => void;
  clear: () => void;
  start: () => void;
  isReplaying: boolean;
  currentShotIndex: number;
};
```

Records the per-round shot sequence. `start()` re-emits the projectile rendering at 2× speed without re-running targeting logic. Lives at `src/hooks/useShotReplay.ts`.

## Standardized "FINALS" trigger

A winner is "finals" when they are the *last* winner of the round — the one that closes out the bracket. The exact rule depends on the mode:

- **Survival modes** (BattleBots, LightCycles, Battleship) — the last survivor is the finals winner; everyone else is already in `winOrder`.
- **Sequential-pick modes** (Racing, WallClimber, Plinko, Wheel) — the winner of the round in which only one entry remained is the finals winner.

Each mode is responsible for computing its own `isFinals` boolean from its existing eliminated/winOrder state and passing it into `<WinnerDialog>`. A typical computation (works for both flavors):

```ts
const isFinals = winOrder.size + 1 === allEntries.length;
```

When `isFinals` is true, `<WinnerDialog>` renders the gold treatment and the primary button becomes "▶ FINALS" calling `onShowFinalStandings()`. Today this state is implemented inconsistently across modes; it gets unified through this prop.

## Replay coverage

| Mode | Strategy | Notes |
|---|---|---|
| LightCycles | canvas frames | Existing replay refactored to use `useReplayRecorder`. |
| Racing | canvas frames | Records racer positions per tick. |
| WallClimber | canvas frames | Mirror of Racing. |
| Plinko | canvas frames | Records ball positions + finished state. |
| BattleBots | canvas frames | Records bot positions, healths, projectiles. |
| Battleship | shot timeline | `useShotReplay`; replays shots at 2×. |
| Wheel | none | Single-spin mechanic; no replay. |

`<WinnerDialog>` accepts `onReplayStart`. Wheel doesn't pass this prop, so the minimize transition is silent for that mode.

## Settings: where things move from

| Mode | Today | After |
|---|---|---|
| Racing | inline radio row in `RacingMode.tsx:77–91` | inside `<SettingsModal>` via `RacingSettings` |
| WallClimber | inline radio row in `WallClimberMode.tsx:75–89` | `WallClimberSettings` panel |
| Wheel | sound + mute controls in `WheelMode.tsx:154–177` | `WheelSettings` panel |
| Battleship | three fieldsets in `BattleshipMode.tsx:660–742` | `BattleshipSettings` panel |
| LightCycles, Plinko, BattleBots | none | none — gear button hidden |

The `Ctrl+.` Runner easter egg in WheelMode stays where it is.

## Migration plan

Each step is independently buildable, type-checks, and is visually smoke-testable on the dev server (port 5174). Detailed sequencing lives in the implementation plan; this is the high-level order.

1. **Foundation.** Create `WinnerTheme`, `themes.ts`, `<WinnerDialog>`, `useWinnerLifecycle`. Verify it visually matches the current LightCycles banner in isolation.
2. **Replay foundation.** Create `useReplayRecorder`. Refactor LightCycles to use it; verify replay still works exactly as today.
3. **Settings shell.** Create `<SettingsModal>`, the mode registry, and the toolbar gear button in App.tsx. Wire LightCycles/Plinko/BattleBots first (no settings → button hidden).
4. **Migrate Racing.** Wire `<WinnerDialog>` + new `RacingSettings` panel + `useReplayRecorder` for canvas replay.
5. **Migrate WallClimber.** Mirror of step 4.
6. **Migrate Plinko.** `<WinnerDialog>` (uses the `effects` slot) + `useReplayRecorder`.
7. **Migrate BattleBots.** `<WinnerDialog>` (uses the `killerInfo` slot) + `useReplayRecorder`.
8. **Migrate Battleship.** `<WinnerDialog>` for the *final* winner only (per-ship "sunk" banners stay) + `BattleshipSettings` panel + `useShotReplay`.
9. **Migrate Wheel.** `<WinnerDialog>` (no replay) + `WheelSettings` panel. Final Standings access is gained automatically from the dialog's gold "▶ FINALS" button on the last spin — no separate toolbar wiring needed.
10. **Cleanup.** Delete superseded per-mode winner JSX/CSS, dead theme constants in mode-local CSS, and the inline settings markup that's been relocated.

After each step: `npm run build` + dev-server smoke test.

## Risks and mitigations

- **Theme drift.** Designing all winner banners through one component risks losing per-mode personality. Mitigated by making the theme prop expressive enough (gradient, accent, accent-soft, finals pair, font, letter-spacing) and verifying visually after each migration.
- **Replay buffer memory.** 600 frames × N modes simultaneously open could be heavy. Mitigated by: only one mode is active at a time; buffer is cleared on race start; default cap (`maxFrames=600`) is configurable per mode.
- **Settings state lifting.** Racing/WallClimber currently keep vehicle-mode state in the mode component. Splitting it into a panel risks prop-drilling. Mitigated by introducing a tiny per-mode store hook (`useRacingSettingsStore`) read by both the panel and the canvas, scoped to the mode's folder.
- **Battleship's "sunk" banners.** They are *not* the winner dialog and must stay as-is — only the final-winner overlay is unified. This boundary will be called out explicitly in the Battleship migration step.

## Testing

No automated tests in this repo today; consistent with that, validation is manual:

- After each migration step: visual diff against the pre-refactor screenshots in `screenshots/` for the relevant mode.
- For each mode after migration: race to completion, verify (a) winner banner appears with correct theme, (b) auto-minimizes after 3s, (c) replay (where applicable) starts, (d) finals transitions to gold and opens FinalStandingsDialog, (e) settings modal opens and changes persist where they did before.

## Open questions

None at design time — all flow/scope decisions resolved during brainstorming. Implementation-time questions (e.g., exact timing of replay-start animation, whether the pill shows the killer info in a tooltip) will be resolved in the implementation plan.
