# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A gamified random-selection tool ("Aquaveo Picker"). One shared participant list is run through one of several **game modes** (Racing, Battle Bots, Light Cycles, Plinko, Wall Climber, Battleship, Wheel). Each race eliminates the winner from the pool and repeats until everyone is ranked. Pure client-side React app — no backend, all state lives in React state + `localStorage`.

## Commands

```bash
npm run dev      # Vite dev server — see note below
npm run build    # tsc -b (typecheck) then vite build
npm run lint     # eslint . (flat config, TS + react-hooks + react-refresh)
npm run preview  # serve the production build
```

- **Always start the dev server on port 5174**, not Vite's default 5173: `npm run dev -- --port 5174`.
- There is **no test framework** configured. "Verification" means `npm run build` (typecheck) + `npm run lint`, then manual testing in the browser.
- The build runs `tsc -b` first, so a type error fails the build. Strict TypeScript is enforced.

## Architecture

### State orchestration: `src/App.tsx`
`App` owns all cross-mode state and passes it down identically to whichever mode is active:
- `entries` (participants), `eliminatedIds`, `winOrder` (`Map<entryId, finishPosition>`), `winner`, `showRace`, plus saved `groups`.
- All of this is **mode-agnostic** — `App` knows nothing about how any game works.
- Persists `entries`, `gameMode`, and `groups` to `localStorage` via effects.
- `handleWinner` is the funnel every mode calls when a participant wins: records position in `winOrder`, adds to `eliminatedIds`, stops the race.
- The active mode is rendered with `key={`${gameMode}-${resetKey}`}` — changing mode or bumping `resetKey` **fully remounts** the mode component, which is how a race resets. Modes can keep internal canvas/animation state without worrying about stale data across resets.

### The mode contract: `src/components/modes/types.ts` + `registry.ts`
Every mode is a self-contained folder under `src/components/modes/<ModeName>/` and is wired up in one place — `registry.ts` (`MODE_REGISTRY`). A registry entry provides:
- `View` — a `ComponentType<ModeViewProps>` (the playable mode). **Required.**
- `Settings` — optional settings panel component (rendered in the shared `SettingsModal` when present; a 🎛 Settings button appears automatically).
- `theme` — a `WinnerTheme` (see below).
- `label` — dropdown label with emoji.
- `survivalOrder?` — set `true` for elimination modes where the **last survivor wins** (Battle Bots, Light Cycles, Battleship). `winOrder` is recorded in elimination order; `FinalStandingsDialog` reverses the sort so the survivor shows as 1st.

`ModeViewProps` is the full interface between `App` and a mode (entries, eliminatedIds, winOrder, isRacing, currentWinner, and callbacks `onWinner`/`onRaceComplete`/`onShowFinalStandings`/`onStartRace`/`onResetRace`). A mode calls `onWinner(entry, extras?)` to declare a winner; it never mutates shared state directly.

### Shared building blocks (`src/components/shared/`, `src/hooks/`)
- **`WinnerDialog`** + **`themes.ts`** — the winner announcement card, themed per-mode via CSS custom properties driven by `WinnerTheme`. Add a new mode's colors here rather than building a bespoke dialog.
- **`useWinnerLifecycle`** — drives the expanded → auto-minimized → expand lifecycle of the winner dialog.
- **`useReplayRecorder<TFrame>`** — generic ring-buffer replay system for canvas modes. The mode chooses its own `TFrame` snapshot shape, pushes one per tick via `record()`, and swaps `getCurrentFrame(now)` in for live state during playback (used by Battle Bots, etc.).
- **`SettingsModal`** / **`ManagementDialog`** / **`FinalStandingsDialog`** — shared chrome used by all modes.

### Per-mode settings stores
Mode settings that must persist (e.g. `wheelSettingsStore.ts`, `racingSettingsStore.ts`) use a **module-level singleton + `useSyncExternalStore`** pattern: a `current` value, a `Set` of listeners, getter/subscribe functions, and setters that write `localStorage` and notify. This keeps settings outside React tree state so the Settings panel and the live game read the same source. Follow this pattern for new persisted settings rather than lifting state into `App`.

### Entry image model (`src/types/index.ts`, `src/utils/entryImages.ts`)
`Entry.imageDataUrls: string[]` is current; `imageDataUrl` is a **deprecated** single-image field tolerated on read only. `App.normalizeEntry` upgrades legacy entries on load. Always read images through `getEntryImages` / `getPreferredEntryImage` / `pickRandomEntryImage` — never touch the raw fields.

## Adding a new game mode

1. Create `src/components/modes/<NewMode>/<NewMode>Mode.tsx` exporting a component typed `(props: ModeViewProps)`. Render its own start/reset controls and call the callbacks from props.
2. Add a `WinnerTheme` for it in `themes.ts`.
3. (Optional) add a `<NewMode>Settings.tsx` panel and a `useSyncExternalStore` settings store.
4. Register all of the above in `MODE_REGISTRY` in `registry.ts` and add the new value to the `GameMode` union in `types.ts`. The dropdown, settings button, and reset-on-switch behavior come for free.

## Conventions

- Canvas games run their animation loop with `requestAnimationFrame`; keep mutable per-frame state in `useRef`, not React state.
- Shared utilities live in `src/utils/`: `colors.ts` (`PLAYER_COLORS` / `generateColor`), `array.ts` (`shuffle`), `storage.ts` (`loadFromStorage`/`saveToStorage`), `entryImages.ts`.
- `localStorage` access is always wrapped in try/catch (quota/serialization can throw); follow the existing helpers.
- React 19 + new JSX transform — no `import React` needed.
