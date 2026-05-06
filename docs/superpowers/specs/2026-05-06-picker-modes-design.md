# Gamified Picker — Multi-Mode Integration Design

**Date:** 2026-05-06
**Branch:** `swainn/picker-modes`
**Status:** Approved (pending spec review)

## Problem

Five branches (`main`, `battle-bots`, `light-cycles`, `plinko`, `wall-climber`) each contain a separate picker game. The branches share file paths (`src/App.tsx`, `src/components/RacingGame.tsx`, `src/types/index.ts`) but have divergent state models — battle-bots tracks takedowns and replay snapshots, plinko tracks elemental effects, light-cycles tracks Tron-style replay buffers, etc. A straight `git merge` across them is not viable.

The user wants a single branch where all five games are selectable from a top-level dropdown, sharing one participant list.

## Goals

1. Single branch (`swainn/picker-modes`, based on `main`) containing all five games.
2. Top-of-page dropdown that switches between Racing / Battle Bots / Light Cycles / Plinko / Wall Climber.
3. Shared participant list and shared saved-groups across modes.
4. Mid-race mode switch shows a confirmation; on confirm, race state resets.
5. Each game's internal complexity stays sealed inside its own folder.

## Non-Goals

- No attempt to *merge* the games' visual/gameplay logic.
- No "plugin" or registry abstraction. Five hard-coded modes is fine.
- No backend changes; everything stays in localStorage.
- No new game modes invented as part of this work.

## Architecture

### Top-level `App.tsx`

Owns only cross-mode state:

| State | Type | Notes |
|---|---|---|
| `entries` | `Entry[]` | Shared participant list (normalized — see Type Unification). |
| `groups` | `Group[]` | Saved groups, unchanged from current `main`. |
| `gameMode` | `'racing' \| 'battle-bots' \| 'light-cycles' \| 'plinko' \| 'wall-climber'` | Persisted to a new localStorage key `gamified_picker_mode`. |
| `eliminatedIds` | `number[]` | Cleared on mode switch. |
| `winOrder` | `Map<number, number>` | Cleared on mode switch. |
| `winner` | `string \| null` | Cleared on mode switch. |
| `showRace` | `boolean` | False on mode switch. |
| `resetKey` | `number` | Bumped on mode switch to force remount of the active mode view. |

`App.tsx` renders, in order: header (with mode dropdown), `EntryManager` (sidebar), groups UI, then *one* `<ModeView>` keyed by `gameMode + resetKey`.

### Mode dropdown

A `<select>` lives in the header. Options use the same emoji conventions already present in the branches:

- 🏁 Racing
- ⚔️ Battle Bots
- 🏍️ Light Cycles
- 🎯 Plinko
- 🧗 Wall Climber

`onChange`:
1. If `eliminatedIds.length > 0` or `showRace`, call `window.confirm("Switching modes will reset the current race. Continue?")`.
2. If declined, the dropdown reverts to the previous selection.
3. If accepted (or no race in progress), clear `eliminatedIds`, `winOrder`, `winner`, `showRace`, bump `resetKey`, set the new `gameMode`, persist to localStorage.

### File layout

```
src/
  App.tsx                              (mode dropdown + shared state + mode router)
  App.css
  types/
    index.ts                           (unified Entry shape — see below)
  components/
    EntryManager.tsx / .css            (shared, unchanged)
    FinalStandingsDialog.tsx / .css    (extracted from current App.tsx — shared across modes)
    modes/
      RacingMode/
        RacingMode.tsx                 (wraps RacingGame + vehicle radios)
        RacingGame.tsx / .css          (from main)
      BattleBotsMode/
        BattleBotsMode.tsx
        BattleArena.tsx / .css         (from battle-bots)
      LightCyclesMode/
        LightCyclesMode.tsx
        LightCycles.tsx / .css         (from light-cycles)
      PlinkoMode/
        PlinkoMode.tsx
        PlinkoGame.tsx / .css          (from plinko's RacingGame, renamed)
      WallClimberMode/
        WallClimberMode.tsx            (wraps WallClimberGame + vehicle radios)
        WallClimberGame.tsx / .css     (from wall-climber's RacingGame, renamed)
```

### `<ModeView>` prop contract

Every mode view exports a default React component with this signature:

```ts
interface ModeViewProps {
  entries: Entry[];                      // active (non-eliminated) entries, in display order
  allEntries: Entry[];                   // full list including eliminated
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  isRacing: boolean;                     // App tells the mode to start
  currentWinner: string | null;
  onWinner: (entry: Entry, extra?: ModeWinnerExtras) => void;
  onRaceComplete: () => void;
  onShowFinalStandings: () => void;
  onStartRace: () => void;               // mode renders its own "start" button if it wants
  onResetRace: () => void;
}

// Optional per-mode metadata that gets stashed on the winner record.
// Modes ignore the fields they don't care about; App stores only what it gets.
interface ModeWinnerExtras {
  killerInfo?: { name: string; weapon: string };  // battle-bots, light-cycles
  effects?: { fire: boolean; ice: boolean; green: boolean; lightning: boolean }; // plinko
  // future modes can add fields here
}
```

Each mode owns the rest of its state internally — replay buffers, takedown counts, elemental effects, vehicle sub-mode selection, race animation state. None of that leaks into `App.tsx`.

### Type unification

The current `Entry` shape on `main` is `{ id, name, imageDataUrl?: string }`. The other branches use `{ id, name, imageDataUrls?: string[], imageDataUrl?: string }` (with a normalizer). We adopt the richer shape:

```ts
export interface Entry {
  id: number;
  name: string;
  imageDataUrls?: string[];
  // Legacy field tolerated on read; never written. Normalizer in App.tsx
  // upgrades old { imageDataUrl } records into { imageDataUrls: [...] }.
  imageDataUrl?: string;
}
```

`App.tsx` runs a normalize step on load and on every entry list change. Modes that originally consumed `imageDataUrl` (Racing, Wall Climber) read `imageDataUrls?.[0]` at the boundary inside their `<ModeView>` wrapper.

### Final-standings dialog

`main`'s `FinalStandingsDialog` is the most general. We extract it to `src/components/FinalStandingsDialog.tsx` and reuse it across modes. Modes that have richer per-entry metadata (battle-bots takedowns, plinko effects) extend the dialog only inside their own ModeView if they want a richer view; otherwise the shared one is used.

Decision: ship with the shared dialog only in v1. Battle-bots' richer dialog (takedown counts, killer info) is preserved as a follow-up if the user wants it back.

### Mode-specific behaviors retained

Each ModeView keeps everything that branch had:

- **RacingMode**: 11 vehicle sub-modes via radio buttons (cars, boats, planes, balloons, rockets, ducks, snails, turtles, cats, dogs, mixed).
- **BattleBotsMode**: weapons, hazards, replays, takedown tracking, weapon-reveal phase, winner gallery, freeze-frame replay.
- **LightCyclesMode**: AI personalities, power-ups, replay buffer, freeze-frame pause.
- **PlinkoMode**: Plinko ball drop, elemental effects on winners, lightning effects.
- **WallClimberMode**: Wall-climbing race with the 9 climber sub-modes (cars/boats/planes/balloons/rockets/ducks/snails/cats/dogs + mixed) — kept as-is from the wall-climber branch. (Note: wall-climber's branch was forked before turtles were added on `main`; turtles will not be a wall-climber sub-mode in v1.)

### Storage keys

| Key | Owner | Purpose |
|---|---|---|
| `gamified_picker_entries` | App | Participant list (existing). |
| `gamified_picker_groups` | App | Saved groups (existing). |
| `gamified_picker_mode` | App | New — last-selected `gameMode`. |
| `gamified_picker_image_cache` | App | Image cache (used by battle-bots/light-cycles/plinko). Carry over so legacy data still loads. |
| (mode-specific keys) | each ModeView | Each mode may add its own keys; not enumerated here. |

## Merge mechanics

Since branches share file paths, a `git merge` would conflict on every file. Instead:

1. Stay on `swainn/picker-modes` (current branch, based on `main`).
2. For each mode:
   - `git checkout <branch> -- src/components/<file>` to pull only the mode-specific component files.
   - Move them into `src/components/modes/<ModeName>/` and rename as required.
   - Hand-write the `<ModeName>Mode.tsx` wrapper that adapts the branch's App-level logic into the new `ModeViewProps` contract.
3. One commit per mode (5 mode-integration commits + the App refactor commit + a final wiring commit).

This keeps history readable and lets us bisect if any mode regresses.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mode-specific CSS class names collide globally. | Each ModeView's CSS lives in its own folder; if collisions appear, prefix selectors with the mode name (e.g. `.battle-arena__…`). |
| Modes assume different entry image conventions. | Normalize once at App level; each ModeView wrapper reads the shape its inner component wants. |
| `IMAGE_CACHE_KEY` storage on `main` doesn't exist; legacy data from non-main branches won't load. | Tolerate both shapes via normalizer. Drop the cache key on `main`-only fresh installs. |
| Battle-bots/Light-cycles replay state is large; switching mid-replay could leak. | Mode views own their own state; remount on `gameMode` change via `key={gameMode + resetKey}` discards everything. |
| Wall-climber's vehicle list lags `main`'s by one entry (no turtles). | Documented as a known v1 limitation. |

## Testing

- Manual smoke test per mode: load a participant list with 5 entries, run a full pick-down to a single winner, view final standings, reset.
- Manual mode-switch test: start a race in mode A, attempt to switch to mode B mid-race, verify confirmation appears, verify cancel keeps mode A, verify confirm resets and shows mode B fresh.
- Manual storage test: select Plinko, reload the page — Plinko should still be the active mode.
- Manual data-shape test: run with a localStorage entry list that uses the legacy `imageDataUrl` field; verify all five modes render images correctly.

There are no existing automated tests in the repo; this work does not add any.

## Out of scope (v1)

- Battle-bots-specific final standings (takedown counts, killer info per row).
- Per-mode leaderboards or persistent stats.
- New games beyond the five branches.
- Visual redesign of the mode dropdown beyond a plain `<select>`.
