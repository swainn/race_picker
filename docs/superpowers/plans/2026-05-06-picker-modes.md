# Multi-Mode Picker Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all five picker games (Racing, Battle Bots, Light Cycles, Plinko, Wall Climber — currently on separate branches) into a single branch with a top-of-page dropdown that switches between them.

**Architecture:** Each game becomes a self-contained `<ModeView>` component under `src/components/modes/<Name>/`. The new top-level `App.tsx` owns only shared state (participant list, groups, current mode, basic race state) and renders one mode at a time. Tasks 2–6 are independent and can run in parallel after Task 1 establishes the scaffolding.

**Tech Stack:** React + TypeScript + Vite. No automated tests in this repo (per spec); verification is via `tsc --noEmit` + `npm run lint` + manual dev-server smoke tests.

**Source spec:** `docs/superpowers/specs/2026-05-06-picker-modes-design.md`

**Source branches** (no `git merge` — pull files via `git checkout <branch> -- <path>`):
- `main` → Racing
- `battle-bots` → Battle Bots
- `light-cycles` → Light Cycles
- `plinko` → Plinko
- `wall-climber` → Wall Climber

---

## File Structure

After implementation:

```
src/
  App.tsx                              ← rewritten: dropdown + shared state + mode router
  App.css                              ← merged: header/sidebar/main-content + .mode-select
  index.css                            ← unchanged
  main.tsx                             ← unchanged
  types/
    index.ts                           ← Entry shape unified to imageDataUrls?: string[]
  components/
    EntryManager.tsx / .css            ← replaced with richer image-supporting version
                                         (from battle-bots/light-cycles/plinko — identical there)
    FinalStandingsDialog.tsx / .css    ← extracted from current App.tsx
    modes/
      types.ts                         ← shared ModeViewProps, ModeWinnerExtras, GameMode
      RacingMode/
        RacingMode.tsx                 ← wrapper: vehicle radios + RacingGame
        RacingMode.css
        RacingGame.tsx                 ← from main:src/components/RacingGame.tsx
        RacingGame.css                 ← from main:src/components/RacingGame.css
      BattleBotsMode/
        BattleBotsMode.tsx             ← wrapper: extracts battle-bots App.tsx logic
        BattleArena.tsx                ← from battle-bots:src/components/BattleArena.tsx
        BattleArena.css                ← from battle-bots:src/components/BattleArena.css
      LightCyclesMode/
        LightCyclesMode.tsx            ← wrapper: extracts light-cycles App.tsx logic
        LightCycles.tsx                ← from light-cycles:src/components/LightCycles.tsx
        LightCycles.css                ← from light-cycles:src/components/LightCycles.css
      PlinkoMode/
        PlinkoMode.tsx                 ← wrapper: extracts plinko App.tsx logic
        PlinkoGame.tsx                 ← from plinko:src/components/RacingGame.tsx (renamed)
        PlinkoGame.css                 ← from plinko:src/components/RacingGame.css (renamed)
      WallClimberMode/
        WallClimberMode.tsx            ← wrapper: vehicle radios + WallClimberGame
        WallClimberMode.css
        WallClimberGame.tsx            ← from wall-climber:src/components/RacingGame.tsx (renamed)
        WallClimberGame.css            ← from wall-climber:src/components/RacingGame.css (renamed)
docs/
  superpowers/specs/2026-05-06-picker-modes-design.md  ← already committed
  superpowers/plans/2026-05-06-picker-modes.md         ← this file
```

---

## Parallelization Note

**Tasks 2–6 are fully independent** once Task 1 lands on the branch. Each mode task touches only files under its own `src/components/modes/<Name>/` folder. Dispatch them as parallel subagents.

**Task 1 (foundation) MUST complete first.** It defines the `ModeViewProps` interface that Tasks 2–6 implement.

**Task 7 (smoke test) MUST come last.** It depends on all 5 modes being integrated.

---

## Task 1: Foundation — App shell, types, shared components, mode placeholders

**Goal:** Land a working app on `swainn/picker-modes` with the new top-level structure, mode dropdown, and 5 placeholder ModeViews. The app compiles and runs; selecting any non-Racing mode shows a "coming soon" placeholder.

**Files:**
- Modify: `src/types/index.ts`
- Replace: `src/components/EntryManager.tsx`, `src/components/EntryManager.css` (use battle-bots' richer version)
- Create: `src/components/FinalStandingsDialog.tsx`, `src/components/FinalStandingsDialog.css`
- Create: `src/components/modes/types.ts`
- Create: `src/components/modes/RacingMode/RacingMode.tsx`, `src/components/modes/RacingMode/RacingMode.css` (placeholder)
- Create: `src/components/modes/BattleBotsMode/BattleBotsMode.tsx` (placeholder)
- Create: `src/components/modes/LightCyclesMode/LightCyclesMode.tsx` (placeholder)
- Create: `src/components/modes/PlinkoMode/PlinkoMode.tsx` (placeholder)
- Create: `src/components/modes/WallClimberMode/WallClimberMode.tsx` (placeholder)
- Replace: `src/App.tsx`
- Modify: `src/App.css` (add `.mode-select` styles; everything else unchanged)

### Steps

- [ ] **Step 1.1: Pull the richer EntryManager from battle-bots**

```bash
git checkout battle-bots -- src/components/EntryManager.tsx src/components/EntryManager.css
```

- [ ] **Step 1.2: Update `src/types/index.ts` to the unified Entry shape**

Replace the file contents with:

```typescript
export interface Entry {
  id: number;
  name: string;
  imageDataUrls?: string[];
  /** @deprecated Legacy single-image field. Tolerated on read; never written. */
  imageDataUrl?: string;
}
```

- [ ] **Step 1.3: Create the shared mode types file `src/components/modes/types.ts`**

```typescript
import type { Entry } from '../../types';

export type GameMode =
  | 'racing'
  | 'battle-bots'
  | 'light-cycles'
  | 'plinko'
  | 'wall-climber';

/** Per-mode metadata that gets stashed on a winner record. */
export interface ModeWinnerExtras {
  killerInfo?: { name: string; weapon: string };
  effects?: { fire: boolean; ice: boolean; green: boolean; lightning: boolean };
}

export interface ModeViewProps {
  /** Active (non-eliminated) entries, in display order. */
  entries: Entry[];
  /** Full list including eliminated, used for replay/standings. */
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  isRacing: boolean;
  currentWinner: string | null;
  onWinner: (entry: Entry, extras?: ModeWinnerExtras) => void;
  onRaceComplete: () => void;
  onShowFinalStandings: () => void;
  onStartRace: () => void;
  onResetRace: () => void;
}
```

- [ ] **Step 1.4: Create `src/components/FinalStandingsDialog.tsx`**

Extract the `FinalStandingsDialog` component currently at the bottom of `src/App.tsx` (lines 439–487). The CSS for `.standings-dialog`, `.standings-header`, `.standings-body`, `.standings-list`, `.standing-entry`, `.standing-rank`, `.standing-name`, `.standings-close-x`, `.close-standings-button`, `.dialog-overlay` is already in `src/App.css` — copy those rules into a new `src/components/FinalStandingsDialog.css` and import it from the component. (Leaving them in `App.css` would also work, but extracting keeps the dialog self-contained.)

```typescript
import type { Entry } from '../types';
import './FinalStandingsDialog.css';

interface Props {
  entries: Entry[];
  winOrder: Map<number, number>;
  onClose: () => void;
}

export function FinalStandingsDialog({ entries, winOrder, onClose }: Props) {
  const standings = entries
    .filter((e) => winOrder.has(e.id))
    .sort((a, b) => (winOrder.get(a.id) || 0) - (winOrder.get(b.id) || 0));

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="standings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="standings-header">
          <h2>🏆 Final Standings 🏆</h2>
          <button
            type="button"
            className="standings-close-x"
            aria-label="Close final standings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="standings-body">
          <div className="standings-list">
            {standings.map((entry, idx) => (
              <div key={entry.id} className="standing-entry">
                <span className="standing-rank">{getOrdinal(idx + 1)}</span>
                <span className="standing-name">{entry.name}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="close-standings-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

After creating the file, copy the relevant CSS rules from `src/App.css` into `src/components/FinalStandingsDialog.css` and remove them from `src/App.css`.

- [ ] **Step 1.5: Create placeholder ModeView for each of the 5 modes**

Each placeholder is a stub that satisfies the `ModeViewProps` contract but renders a "coming soon" message. They will be replaced in Tasks 2–6.

Create `src/components/modes/RacingMode/RacingMode.tsx`:

```typescript
import type { ModeViewProps } from '../types';

export function RacingMode(_props: ModeViewProps) {
  return (
    <div className="mode-placeholder">
      🏁 Racing mode — integration pending (Task 2)
    </div>
  );
}
```

Create `src/components/modes/RacingMode/RacingMode.css`:

```css
.mode-placeholder {
  padding: 40px;
  text-align: center;
  font-size: 1.4rem;
  opacity: 0.7;
}
```

Repeat the placeholder pattern for the other four modes (`BattleBotsMode`, `LightCyclesMode`, `PlinkoMode`, `WallClimberMode`) — same code, different emoji and task number, all under `src/components/modes/<Name>/<Name>Mode.tsx`. Only `RacingMode` needs the CSS file; the others import the same class via the existing `App.css`.

Add the `.mode-placeholder` style block to `src/App.css` so all modes can share it (then remove it from `RacingMode.css` if you want — your call):

```css
.mode-placeholder {
  padding: 40px;
  text-align: center;
  font-size: 1.4rem;
  opacity: 0.7;
}
```

- [ ] **Step 1.6: Rewrite `src/App.tsx`**

Replace the entire file with:

```typescript
import { useEffect, useState } from 'react';
import type { Entry } from './types';
import { EntryManager } from './components/EntryManager';
import { FinalStandingsDialog } from './components/FinalStandingsDialog';
import { RacingMode } from './components/modes/RacingMode/RacingMode';
import { BattleBotsMode } from './components/modes/BattleBotsMode/BattleBotsMode';
import { LightCyclesMode } from './components/modes/LightCyclesMode/LightCyclesMode';
import { PlinkoMode } from './components/modes/PlinkoMode/PlinkoMode';
import { WallClimberMode } from './components/modes/WallClimberMode/WallClimberMode';
import type { GameMode, ModeWinnerExtras } from './components/modes/types';
import './App.css';

const STORAGE_KEY = 'gamified_picker_entries';
const GROUPS_STORAGE_KEY = 'gamified_picker_groups';
const MODE_STORAGE_KEY = 'gamified_picker_mode';

interface Group {
  id: number;
  name: string;
  entries: Entry[];
  timestamp: number;
}

const MODES: { value: GameMode; label: string }[] = [
  { value: 'racing', label: '🏁 Racing' },
  { value: 'battle-bots', label: '⚔️ Battle Bots' },
  { value: 'light-cycles', label: '🏍️ Light Cycles' },
  { value: 'plinko', label: '🎯 Plinko' },
  { value: 'wall-climber', label: '🧗 Wall Climber' },
];

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to load ${key}`, e);
    return defaultValue;
  }
}

function normalizeEntry(entry: Entry): Entry {
  if (Array.isArray(entry.imageDataUrls) && entry.imageDataUrls.length > 0) {
    return { id: entry.id, name: entry.name, imageDataUrls: entry.imageDataUrls };
  }
  if (typeof entry.imageDataUrl === 'string' && entry.imageDataUrl.length > 0) {
    return { id: entry.id, name: entry.name, imageDataUrls: [entry.imageDataUrl] };
  }
  return { id: entry.id, name: entry.name, imageDataUrls: [] };
}

function normalizeEntries(entries: Entry[]): Entry[] {
  return entries.map(normalizeEntry);
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(() =>
    normalizeEntries(loadFromStorage<Entry[]>(STORAGE_KEY, []))
  );
  const [eliminatedIds, setEliminatedIds] = useState<number[]>([]);
  const [winOrder, setWinOrder] = useState<Map<number, number>>(new Map());
  const [winner, setWinner] = useState<string | null>(null);
  const [showRace, setShowRace] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showFinalStandings, setShowFinalStandings] = useState(false);
  const [groups, setGroups] = useState<Group[]>(() =>
    loadFromStorage<Group[]>(GROUPS_STORAGE_KEY, []).map((g) => ({
      ...g,
      entries: normalizeEntries(g.entries),
    }))
  );
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>(() =>
    loadFromStorage<GameMode>(MODE_STORAGE_KEY, 'racing')
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(gameMode));
  }, [gameMode]);

  const handleEntriesChange = (newEntries: Entry[]) => {
    const normalized = normalizeEntries(newEntries);
    setEntries(normalized);
    setEliminatedIds((prev) => prev.filter((id) => normalized.some((e) => e.id === id)));
    setWinOrder((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((_, id) => {
        if (!normalized.some((e) => e.id === id)) {
          newMap.delete(id);
        }
      });
      return newMap;
    });
    setResetKey((prev) => prev + 1);
  };

  const handleWinner = (winnerEntry: Entry, _extras?: ModeWinnerExtras) => {
    setWinner(winnerEntry.name);
    setEliminatedIds((prev) => [...prev, winnerEntry.id]);
    setWinOrder((prev) => new Map(prev).set(winnerEntry.id, prev.size + 1));
    setShowRace(false);
  };

  const handleRaceComplete = () => {
    setWinner(null);
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    if (activeEntries.length === 1) {
      setTimeout(() => handleWinner(activeEntries[0]), 300);
      return;
    }
    if (activeEntries.length >= 2) {
      setShowRace(true);
    }
  };

  const startRace = () => {
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    if (activeEntries.length < 1) {
      alert('Add at least 1 participant to start a race!');
      return;
    }
    if (activeEntries.length === 1) {
      setWinner(null);
      setTimeout(() => handleWinner(activeEntries[0]), 300);
      return;
    }
    setWinner(null);
    setShowRace(true);
  };

  const resetRace = () => {
    setEliminatedIds([]);
    setWinOrder(new Map());
    setWinner(null);
    setShowRace(false);
    setShowFinalStandings(false);
    setResetKey((prev) => prev + 1);
  };

  const resetAllEntries = () => {
    if (window.confirm('Clear all participants from the list?')) {
      setEntries([]);
      setEliminatedIds([]);
      setWinOrder(new Map());
      setWinner(null);
      setShowRace(false);
      setShowFinalStandings(false);
    }
  };

  const isRaceInProgress = () => showRace || eliminatedIds.length > 0;

  const handleModeChange = (next: GameMode) => {
    if (next === gameMode) return;
    if (isRaceInProgress()) {
      const ok = window.confirm('Switching modes will reset the current race. Continue?');
      if (!ok) return;
    }
    setEliminatedIds([]);
    setWinOrder(new Map());
    setWinner(null);
    setShowRace(false);
    setShowFinalStandings(false);
    setResetKey((prev) => prev + 1);
    setGameMode(next);
  };

  const saveGroup = () => {
    if (entries.length === 0) {
      alert('Cannot save an empty group!');
      return;
    }
    const groupName = groupNameInput.trim() || `Group ${new Date().toLocaleDateString()}`;
    const newGroup: Group = {
      id: Date.now(),
      name: groupName,
      entries: [...entries],
      timestamp: Date.now(),
    };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    setGroupNameInput('');
    alert(`Group "${groupName}" saved successfully!`);
  };

  const loadGroup = (groupId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setEntries(normalizeEntries(group.entries));
      setEliminatedIds([]);
      setWinOrder(new Map());
      setWinner(null);
      setShowRace(false);
      setShowFinalStandings(false);
      setShowGroupManager(false);
    }
  };

  const deleteGroup = (groupId: number) => {
    if (window.confirm('Delete this group?')) {
      const updatedGroups = groups.filter((g) => g.id !== groupId);
      setGroups(updatedGroups);
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    }
  };

  const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));

  const modeProps = {
    entries: activeEntries,
    allEntries: entries,
    eliminatedIds,
    winOrder,
    isRacing: showRace,
    currentWinner: winner,
    onWinner: handleWinner,
    onRaceComplete: handleRaceComplete,
    onShowFinalStandings: () => setShowFinalStandings(true),
    onStartRace: startRace,
    onResetRace: resetRace,
  };

  const renderMode = () => {
    switch (gameMode) {
      case 'racing':
        return <RacingMode {...modeProps} />;
      case 'battle-bots':
        return <BattleBotsMode {...modeProps} />;
      case 'light-cycles':
        return <LightCyclesMode {...modeProps} />;
      case 'plinko':
        return <PlinkoMode {...modeProps} />;
      case 'wall-climber':
        return <WallClimberMode {...modeProps} />;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎮 Aquaveo Picker 🎮</h1>
        <div className="mode-select">
          <label htmlFor="game-mode-select">Mode:</label>
          <select
            id="game-mode-select"
            value={gameMode}
            onChange={(e) => handleModeChange(e.target.value as GameMode)}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <p>The Random Selection Tool for Winners!</p>
      </header>

      <div className="app-container">
        <div className="sidebar">
          <h2>Participants</h2>
          <EntryManager
            entries={entries}
            onEntriesChange={handleEntriesChange}
            eliminatedIds={eliminatedIds}
            winOrder={winOrder}
          />

          {entries.length > 0 && (
            <button onClick={resetAllEntries} className="reset-button">
              Clear All
            </button>
          )}

          <div className="group-controls">
            <h3>💾 Groups</h3>
            <input
              type="text"
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              placeholder="Group name..."
              className="group-name-input"
              onKeyPress={(e) => e.key === 'Enter' && saveGroup()}
            />
            <button onClick={saveGroup} className="save-group-button">
              Save Current Group
            </button>

            {groups.length > 0 && (
              <button
                onClick={() => setShowGroupManager(!showGroupManager)}
                className="manage-groups-button"
              >
                {showGroupManager ? 'Hide Groups' : 'View Groups'} ({groups.length})
              </button>
            )}

            {showGroupManager && (
              <div className="groups-list">
                {groups.map((group) => (
                  <div key={group.id} className="group-item">
                    <div className="group-info">
                      <p className="group-name">{group.name}</p>
                      <p className="group-count">{group.entries.length} participants</p>
                    </div>
                    <div className="group-buttons">
                      <button onClick={() => loadGroup(group.id)} className="load-group-button">
                        Load
                      </button>
                      <button onClick={() => deleteGroup(group.id)} className="delete-group-button">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="main-content">
          <div key={`${gameMode}-${resetKey}`}>{renderMode()}</div>

          {winner && !showRace && (
            <div className="winner-info">
              <p>
                Last winner: <strong>{winner}</strong>
              </p>
              <p>
                Racing: {activeEntries.length} / {entries.length}
              </p>
            </div>
          )}

          {showFinalStandings && (
            <FinalStandingsDialog
              entries={entries}
              winOrder={winOrder}
              onClose={() => setShowFinalStandings(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 1.7: Add `.mode-select` styles to `src/App.css`**

Append to the end of `src/App.css`:

```css
.mode-select {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  margin: 8px 0;
}

.mode-select label {
  font-weight: 600;
}

.mode-select select {
  padding: 6px 10px;
  font-size: 1rem;
  border-radius: 6px;
  border: 1px solid #888;
  background: #fff;
}

.mode-placeholder {
  padding: 40px;
  text-align: center;
  font-size: 1.4rem;
  opacity: 0.7;
}
```

- [ ] **Step 1.8: Verify the app compiles and runs**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both succeed with no errors.

```bash
npm run dev
```

Open the dev URL. Verify:
- Header shows "🎮 Aquaveo Picker 🎮" and a Mode dropdown with 5 entries.
- Default mode is "🏁 Racing" (or whatever was previously persisted).
- Selecting any mode shows its placeholder text.
- Adding a participant via EntryManager works and persists across reload.

Stop the dev server (Ctrl-C) before proceeding.

- [ ] **Step 1.9: Commit**

```bash
git add -A
git commit -m "Scaffold multi-mode picker shell with placeholder ModeViews

- Unify Entry type to use imageDataUrls?: string[]
- Adopt richer EntryManager from battle-bots
- Extract FinalStandingsDialog into its own component
- Add ModeViewProps contract and 5 placeholder ModeViews
- Rewrite App.tsx with mode dropdown, mid-race confirm, and mode router

Foundation for parallel mode integrations (Tasks 2-6 of the plan)."
```

---

## Task 2: RacingMode integration (parallel-safe after Task 1)

**Goal:** Replace the `RacingMode` placeholder with a full integration of `main`'s racing game (11 vehicle sub-modes). Touches only files under `src/components/modes/RacingMode/`.

**Files:**
- Create: `src/components/modes/RacingMode/RacingGame.tsx` (from `main:src/components/RacingGame.tsx`)
- Create: `src/components/modes/RacingMode/RacingGame.css` (from `main:src/components/RacingGame.css`)
- Replace: `src/components/modes/RacingMode/RacingMode.tsx`
- Modify: `src/components/modes/RacingMode/RacingMode.css`

### Steps

- [ ] **Step 2.1: Pull RacingGame from `main` into the mode folder**

```bash
git show main:src/components/RacingGame.tsx > src/components/modes/RacingMode/RacingGame.tsx
git show main:src/components/RacingGame.css > src/components/modes/RacingMode/RacingGame.css
```

- [ ] **Step 2.2: Fix the import path in `RacingGame.tsx`**

The pulled file imports `import type { Entry } from '../types';`. The new path is `../../../types`:

```bash
# Edit src/components/modes/RacingMode/RacingGame.tsx
# Change: import type { Entry } from '../types';
# To:     import type { Entry } from '../../../types';
```

- [ ] **Step 2.3: Write `src/components/modes/RacingMode/RacingMode.tsx`**

This wrapper owns the vehicle sub-mode radio state (cars/boats/planes/balloons/rockets/ducks/snails/turtles/cats/dogs/mixed) and renders the inner `RacingGame` plus a Start button and the radio group. The Start button should call `props.onStartRace()`. Reset is handled by `props.onResetRace`.

```typescript
import { useState } from 'react';
import type { ModeViewProps } from '../types';
import { RacingGame } from './RacingGame';
import './RacingMode.css';

type VehicleMode =
  | 'car' | 'boat' | 'plane' | 'balloon' | 'rocket'
  | 'duck' | 'snail' | 'turtle' | 'cat' | 'dog';
type RacingSubMode = VehicleMode | 'mixed';

const SUB_MODES: { value: RacingSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'turtle', label: '🐢 Turtles' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

export function RacingMode(props: ModeViewProps) {
  const [subMode, setSubMode] = useState<RacingSubMode>('car');
  const {
    entries, allEntries, eliminatedIds, winOrder, isRacing, currentWinner,
    onWinner, onRaceComplete, onShowFinalStandings, onStartRace, onResetRace,
  } = props;

  return (
    <div className="racing-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🏁 Start Race ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset Race
          </button>
        )}
      </div>

      <RacingGame
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={onWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        mode={subMode}
      />

      <div className="mode-toggle" role="radiogroup" aria-label="Racing sub-mode">
        {SUB_MODES.map((m) => (
          <label key={m.value} className="mode-option">
            <input
              type="radio"
              name="racingSubMode"
              value={m.value}
              checked={subMode === m.value}
              onChange={() => setSubMode(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: Update `RacingMode.css`**

Replace the placeholder CSS with rules pulled from `main`'s `App.css` for `.race-controls`, `.start-race-button`, `.reset-race-button`, `.mode-toggle`, `.mode-option`. (Open `git show main:src/App.css` and copy those blocks.) If they're already in the current `App.css` (they are — `swainn/picker-modes` is based on `main`), no copy is needed and you can leave `RacingMode.css` empty or delete the import.

- [ ] **Step 2.5: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

In the browser, with Mode=Racing:
- Start race with 2+ participants. Verify a winner is picked.
- Switch between vehicle sub-modes (cars / boats / mixed) and verify the visuals change.
- Reset race button works.
- Clicking a different top-level mode (e.g. Battle Bots) prompts confirm if a race is active.

Stop the dev server.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/modes/RacingMode/
git commit -m "Integrate RacingMode (Task 2)

Pulls RacingGame from main and wraps it with the ModeView interface.
RacingMode owns the vehicle-sub-mode state internally."
```

---

## Task 3: BattleBotsMode integration (parallel-safe after Task 1)

**Goal:** Replace the `BattleBotsMode` placeholder with a full integration of the battle-bots branch (combat arena, weapons, hazards, replays, takedown tracking, weapon-reveal phase, freeze-frame replay, multi-image winner gallery).

**Files:**
- Create: `src/components/modes/BattleBotsMode/BattleArena.tsx` (from `battle-bots:src/components/BattleArena.tsx`)
- Create: `src/components/modes/BattleBotsMode/BattleArena.css` (from `battle-bots:src/components/BattleArena.css`)
- Replace: `src/components/modes/BattleBotsMode/BattleBotsMode.tsx`
- Create (if needed): `src/components/modes/BattleBotsMode/BattleBotsMode.css`

### Steps

- [ ] **Step 3.1: Pull BattleArena into the mode folder**

```bash
git show battle-bots:src/components/BattleArena.tsx > src/components/modes/BattleBotsMode/BattleArena.tsx
git show battle-bots:src/components/BattleArena.css > src/components/modes/BattleBotsMode/BattleArena.css
```

- [ ] **Step 3.2: Fix import paths inside the pulled file**

In `BattleArena.tsx`, change `from '../types'` → `from '../../../types'`. There may be no other relative imports; verify by reading the top of the file.

- [ ] **Step 3.3: Write `src/components/modes/BattleBotsMode/BattleBotsMode.tsx`**

This wrapper extracts the App-level battle-bots logic from `git show battle-bots:src/App.tsx` into the `<ModeView>` shape. Specifically:

- Render the `BattleArena` component, passing the entries, eliminatedIds, winOrder, isRacing, currentWinner.
- Internal mode state: takedown counts (`Map<number, number>`), per-eliminated standing image (`Map<number, string>`), killer info on last eliminated, weapon-reveal phase flag, replay snapshot.
- A "Start Battle" button → `props.onStartRace()`.
- A "Reset" button → `props.onResetRace()` AND clears the internal takedowns/standingImages/killerInfo state.
- When the inner `BattleArena` reports a winner with `(entry, killerInfo, takedowns, …)`, invoke `props.onWinner(entry, { killerInfo })` and store takedowns/standing image internally for the gallery.
- When `BattleArena` calls `onRaceComplete`, forward to `props.onRaceComplete()`.

**Reading reference:**
- `git show battle-bots:src/App.tsx` (665 lines) — copy the App-level state and handlers wholesale and adapt them: replace `setEntries`, `setGroups`, etc. with the props provided. Anything App.tsx managed that's now in the parent `App.tsx` (entries, eliminatedIds, winOrder, winner, showRace, groups) gets removed from this wrapper. Anything battle-bots-specific (takedowns, killerInfo, replay snapshots, freeze-frame, winner gallery) stays.

Skeleton (the engineer should fill in based on the source `App.tsx`):

```typescript
import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { BattleArena } from './BattleArena';

interface KillerInfo { name: string; weapon: string; }

interface RaceSnapshot {
  // copy from battle-bots:src/App.tsx
}

export function BattleBotsMode(props: ModeViewProps) {
  // Mode-internal state from battle-bots App.tsx, minus what's in props:
  const [takedowns, setTakedowns] = useState<Map<number, number>>(new Map());
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());
  const [lastKillerInfo, setLastKillerInfo] = useState<KillerInfo | null>(null);
  // ... copy other battle-bots-specific state from its App.tsx

  // Adapt the inner BattleArena's onWinner -> props.onWinner with extras:
  const handleWinner = (winnerEntry: Entry, killerInfo?: KillerInfo, takedownsForEntry?: number) => {
    if (typeof takedownsForEntry === 'number') {
      setTakedowns((prev) => new Map(prev).set(winnerEntry.id, takedownsForEntry));
    }
    if (killerInfo) setLastKillerInfo(killerInfo);
    props.onWinner(winnerEntry, killerInfo ? { killerInfo } : undefined);
  };

  // Reset mode-internal state when props.eliminatedIds resets to empty
  useEffect(() => {
    if (props.eliminatedIds.length === 0) {
      setTakedowns(new Map());
      setStandingImages(new Map());
      setLastKillerInfo(null);
    }
  }, [props.eliminatedIds.length]);

  return (
    <div className="battle-bots-mode">
      <div className="race-controls">
        {props.entries.length >= 1 && (
          <button onClick={props.onStartRace} className="start-race-button">
            ⚔️ Start Battle ({props.entries.length})
          </button>
        )}
        {props.eliminatedIds.length > 0 && (
          <button onClick={props.onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <BattleArena
        // pass through props + mode-internal state to the inner component
        entries={props.entries}
        allEntries={props.allEntries}
        eliminatedIds={props.eliminatedIds}
        winOrder={props.winOrder}
        isRacing={props.isRacing}
        currentWinner={props.currentWinner}
        onWinner={handleWinner}
        onRaceComplete={props.onRaceComplete}
        onShowFinalStandings={props.onShowFinalStandings}
        // ... whatever else the source BattleArena prop interface needs
      />
    </div>
  );
}
```

**Important:** The exact prop interface of `BattleArena` is dictated by the file you pulled. Read its `interface Props` block at the top of `BattleArena.tsx` and pass exactly what it expects. If any required prop wasn't covered by `ModeViewProps`, declare it as mode-internal state (e.g. `standingImages`, `takedowns`, `replaySnapshot`) and pipe it through.

- [ ] **Step 3.4: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

In the browser, with Mode=Battle Bots:
- Start a battle with 3+ participants (ideally with images attached).
- A winner is declared; takedown count and killer info appear if applicable.
- Replay (if the source supports it) plays back.
- Reset clears mode-internal state.

Stop the dev server.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/modes/BattleBotsMode/
git commit -m "Integrate BattleBotsMode (Task 3)

Pulls BattleArena from battle-bots branch and wraps it. Mode-internal
state (takedowns, killer info, replay buffer, standings images) lives
inside BattleBotsMode.tsx; shared race state stays in App.tsx."
```

---

## Task 4: LightCyclesMode integration (parallel-safe after Task 1)

**Goal:** Replace the `LightCyclesMode` placeholder with a full integration of the light-cycles branch (Tron-style cycles, AI personalities, power-ups, replay buffer, freeze-frame pause, killer info).

**Files:**
- Create: `src/components/modes/LightCyclesMode/LightCycles.tsx` (from `light-cycles:src/components/LightCycles.tsx`)
- Create: `src/components/modes/LightCyclesMode/LightCycles.css` (from `light-cycles:src/components/LightCycles.css`)
- Replace: `src/components/modes/LightCyclesMode/LightCyclesMode.tsx`

### Steps

- [ ] **Step 4.1: Pull LightCycles into the mode folder**

```bash
git show light-cycles:src/components/LightCycles.tsx > src/components/modes/LightCyclesMode/LightCycles.tsx
git show light-cycles:src/components/LightCycles.css > src/components/modes/LightCyclesMode/LightCycles.css
```

- [ ] **Step 4.2: Fix import paths**

In `LightCycles.tsx`, change `from '../types'` → `from '../../../types'`.

- [ ] **Step 4.3: Write `src/components/modes/LightCyclesMode/LightCyclesMode.tsx`**

Same pattern as Task 3, source: `git show light-cycles:src/App.tsx`. Mode-internal state for light-cycles includes: standing images per eliminated entry, takedown counts, last killer info, replay snapshot, freeze-frame flag. The inner component `LightCycles` is invoked with whatever props its `interface Props` declares.

```typescript
import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { LightCycles } from './LightCycles';

interface KillerInfo { name: string; weapon: string; }

export function LightCyclesMode(props: ModeViewProps) {
  const [takedowns, setTakedowns] = useState<Map<number, number>>(new Map());
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());
  const [lastKillerInfo, setLastKillerInfo] = useState<KillerInfo | null>(null);
  // ... copy other light-cycles-specific state from its App.tsx

  const handleWinner = (winnerEntry: Entry, killerInfo?: KillerInfo, takedownsForEntry?: number) => {
    if (typeof takedownsForEntry === 'number') {
      setTakedowns((prev) => new Map(prev).set(winnerEntry.id, takedownsForEntry));
    }
    if (killerInfo) setLastKillerInfo(killerInfo);
    props.onWinner(winnerEntry, killerInfo ? { killerInfo } : undefined);
  };

  useEffect(() => {
    if (props.eliminatedIds.length === 0) {
      setTakedowns(new Map());
      setStandingImages(new Map());
      setLastKillerInfo(null);
    }
  }, [props.eliminatedIds.length]);

  return (
    <div className="light-cycles-mode">
      <div className="race-controls">
        {props.entries.length >= 1 && (
          <button onClick={props.onStartRace} className="start-race-button">
            🏍️ Start Match ({props.entries.length})
          </button>
        )}
        {props.eliminatedIds.length > 0 && (
          <button onClick={props.onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <LightCycles
        entries={props.entries}
        allEntries={props.allEntries}
        eliminatedIds={props.eliminatedIds}
        winOrder={props.winOrder}
        isRacing={props.isRacing}
        currentWinner={props.currentWinner}
        onWinner={handleWinner}
        onRaceComplete={props.onRaceComplete}
        onShowFinalStandings={props.onShowFinalStandings}
        // ... other props per LightCycles.tsx interface
      />
    </div>
  );
}
```

Read the inner `LightCycles` component's `interface Props` and adjust the prop list to match exactly.

- [ ] **Step 4.4: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

Mode=Light Cycles → start match with 3+ participants → winner is picked → killer info appears if last-eliminated logic is intact → reset clears state.

Stop the dev server.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/modes/LightCyclesMode/
git commit -m "Integrate LightCyclesMode (Task 4)

Pulls LightCycles from light-cycles branch. Mode-internal state
(takedowns, killer info, replay buffer) lives inside the wrapper."
```

---

## Task 5: PlinkoMode integration (parallel-safe after Task 1)

**Goal:** Replace the `PlinkoMode` placeholder with a full integration of the plinko branch (Plinko ball drop, elemental effects on winners — fire/ice/green/lightning).

**Files:**
- Create: `src/components/modes/PlinkoMode/PlinkoGame.tsx` (from `plinko:src/components/RacingGame.tsx`, renamed)
- Create: `src/components/modes/PlinkoMode/PlinkoGame.css` (from `plinko:src/components/RacingGame.css`)
- Replace: `src/components/modes/PlinkoMode/PlinkoMode.tsx`

### Steps

- [ ] **Step 5.1: Pull plinko's RacingGame into the mode folder, renaming as we go**

```bash
git show plinko:src/components/RacingGame.tsx > src/components/modes/PlinkoMode/PlinkoGame.tsx
git show plinko:src/components/RacingGame.css > src/components/modes/PlinkoMode/PlinkoGame.css
```

Then rename the exported symbol inside the file: change `export const RacingGame:` to `export const PlinkoGame:` (and any internal references). Also fix the import path: `from '../types'` → `from '../../../types'`. If the file imports its own CSS, change `import './RacingGame.css'` → `import './PlinkoGame.css'`.

- [ ] **Step 5.2: Write `src/components/modes/PlinkoMode/PlinkoMode.tsx`**

Source for App-level glue: `git show plinko:src/App.tsx`. Plinko-specific mode-internal state: per-winner elemental effects, lightning effect status. Pattern is the same as Task 3/4.

```typescript
import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { PlinkoGame } from './PlinkoGame';

interface WinnerEffects {
  fire: boolean;
  ice: boolean;
  green: boolean;
  lightning: boolean;
}

export function PlinkoMode(props: ModeViewProps) {
  const [standingEffects, setStandingEffects] = useState<Map<number, WinnerEffects>>(new Map());
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());

  const handleWinner = (
    winnerEntry: Entry,
    effects?: WinnerEffects,
    selectedImageDataUrl?: string
  ) => {
    if (effects) setStandingEffects((prev) => new Map(prev).set(winnerEntry.id, effects));
    if (selectedImageDataUrl) {
      setStandingImages((prev) => new Map(prev).set(winnerEntry.id, selectedImageDataUrl));
    }
    props.onWinner(winnerEntry, effects ? { effects } : undefined);
  };

  useEffect(() => {
    if (props.eliminatedIds.length === 0) {
      setStandingEffects(new Map());
      setStandingImages(new Map());
    }
  }, [props.eliminatedIds.length]);

  return (
    <div className="plinko-mode">
      <div className="race-controls">
        {props.entries.length >= 1 && (
          <button onClick={props.onStartRace} className="start-race-button">
            🎯 Drop Ball ({props.entries.length})
          </button>
        )}
        {props.eliminatedIds.length > 0 && (
          <button onClick={props.onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <PlinkoGame
        entries={props.entries}
        allEntries={props.allEntries}
        eliminatedIds={props.eliminatedIds}
        winOrder={props.winOrder}
        isRacing={props.isRacing}
        currentWinner={props.currentWinner}
        onWinner={handleWinner}
        onRaceComplete={props.onRaceComplete}
        onShowFinalStandings={props.onShowFinalStandings}
        // ... other props per PlinkoGame.tsx
      />
    </div>
  );
}
```

Adjust the prop list to match `PlinkoGame`'s interface exactly.

- [ ] **Step 5.3: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

Mode=Plinko → drop a ball with 3+ participants → winner gets one of the elemental effects → reset clears state.

Stop the dev server.

- [ ] **Step 5.4: Commit**

```bash
git add src/components/modes/PlinkoMode/
git commit -m "Integrate PlinkoMode (Task 5)

Pulls plinko's RacingGame as PlinkoGame. Mode-internal state
(elemental effects per winner, standing images) lives inside the wrapper."
```

---

## Task 6: WallClimberMode integration (parallel-safe after Task 1)

**Goal:** Replace the `WallClimberMode` placeholder with a full integration of the wall-climber branch (vertical wall-climbing race with 9 climber sub-modes: cars/boats/planes/balloons/rockets/ducks/snails/cats/dogs + mixed — note: no turtles).

**Files:**
- Create: `src/components/modes/WallClimberMode/WallClimberGame.tsx` (from `wall-climber:src/components/RacingGame.tsx`, renamed)
- Create: `src/components/modes/WallClimberMode/WallClimberGame.css` (from `wall-climber:src/components/RacingGame.css`)
- Replace: `src/components/modes/WallClimberMode/WallClimberMode.tsx`
- Create: `src/components/modes/WallClimberMode/WallClimberMode.css`

### Steps

- [ ] **Step 6.1: Pull wall-climber's RacingGame into the mode folder, renaming as we go**

```bash
git show wall-climber:src/components/RacingGame.tsx > src/components/modes/WallClimberMode/WallClimberGame.tsx
git show wall-climber:src/components/RacingGame.css > src/components/modes/WallClimberMode/WallClimberGame.css
```

Then rename the exported symbol: `export const RacingGame:` → `export const WallClimberGame:`. Fix the import path: `from '../types'` → `from '../../../types'`. Update the CSS import inside the file from `./RacingGame.css` to `./WallClimberGame.css`.

- [ ] **Step 6.2: Write `src/components/modes/WallClimberMode/WallClimberMode.tsx`**

Wall-climber's App.tsx is short and most of its state is in the shared shape. The wrapper mainly needs to own the climber-sub-mode state.

```typescript
import { useState } from 'react';
import type { ModeViewProps } from '../types';
import { WallClimberGame } from './WallClimberGame';
import './WallClimberMode.css';

type ClimberMode =
  | 'car' | 'boat' | 'plane' | 'balloon' | 'rocket'
  | 'duck' | 'snail' | 'cat' | 'dog';
type WallClimberSubMode = ClimberMode | 'mixed';

const SUB_MODES: { value: WallClimberSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

export function WallClimberMode(props: ModeViewProps) {
  const [subMode, setSubMode] = useState<WallClimberSubMode>('car');

  return (
    <div className="wall-climber-mode">
      <div className="race-controls">
        {props.entries.length >= 1 && (
          <button onClick={props.onStartRace} className="start-race-button">
            🧗 Start Climb ({props.entries.length})
          </button>
        )}
        {props.eliminatedIds.length > 0 && (
          <button onClick={props.onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <WallClimberGame
        entries={props.entries}
        allEntries={props.allEntries}
        eliminatedIds={props.eliminatedIds}
        winOrder={props.winOrder}
        onWinner={(entry: typeof props.entries[number]) => props.onWinner(entry)}
        onRaceComplete={props.onRaceComplete}
        onShowFinalStandings={props.onShowFinalStandings}
        isRacing={props.isRacing}
        currentWinner={props.currentWinner}
        mode={subMode}
      />

      <div className="mode-toggle" role="radiogroup" aria-label="Wall-climber sub-mode">
        {SUB_MODES.map((m) => (
          <label key={m.value} className="mode-option">
            <input
              type="radio"
              name="wallClimberSubMode"
              value={m.value}
              checked={subMode === m.value}
              onChange={() => setSubMode(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

Read `WallClimberGame`'s `interface Props` and align exactly.

- [ ] **Step 6.3: Add CSS to `WallClimberMode.css`**

If the existing `App.css` already provides `.race-controls`, `.mode-toggle`, etc. (it does), this file can stay empty or contain only `.wall-climber-mode { /* layout */ }` rules. Create the file but leave it empty if no overrides are needed.

- [ ] **Step 6.4: Verify**

```bash
npx tsc --noEmit
npm run lint
npm run dev
```

Mode=Wall Climber → start a climb with 3+ participants → winner is picked → switching climber sub-modes changes visuals → reset clears state.

Stop the dev server.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/modes/WallClimberMode/
git commit -m "Integrate WallClimberMode (Task 6)

Pulls wall-climber's RacingGame as WallClimberGame. Wrapper owns
the 9 climber-sub-mode toggle (no turtles — fork point predates them)."
```

---

## Task 7: Final smoke test and README update

**Goal:** Verify the full system end-to-end across all 5 modes; update the README to mention the new dropdown.

**Files:**
- Modify: `README.md`

### Steps

- [ ] **Step 7.1: Run full type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Both must pass with no errors.

- [ ] **Step 7.2: Manual smoke test all 5 modes**

```bash
npm run dev
```

For each of the 5 modes:
1. Switch to it via the dropdown.
2. Verify no JS console errors.
3. Add 4 participants (use names like "Alice", "Bob", "Carol", "Dave").
4. Start a race/battle/etc.
5. Verify a winner is declared and added to the win order.
6. Run the race down to a final winner (4 → 3 → 2 → 1).
7. Open Final Standings — verify all 4 names appear in elimination order (1st = last eliminated).
8. Click Reset Race — verify state clears.

Then test mid-race switch:
1. In Racing mode, start a race and let one elimination happen.
2. Try to change the dropdown to Battle Bots → confirm dialog appears → Cancel → verify still in Racing with state intact.
3. Try again → OK → verify switched to Battle Bots and state is clean.

Then test persistence:
1. Select Plinko mode.
2. Reload the page.
3. Verify Plinko is still active.

Stop the dev server. Note any failures and fix before continuing.

- [ ] **Step 7.3: Update `README.md`**

Add a "Modes" section near the top (placement at reviewer's discretion):

```markdown
## Modes

The picker supports five game modes, switchable via the dropdown at the top of the page:

- **🏁 Racing** — Vehicle race with 11 sub-modes (cars, boats, planes, balloons, rockets, ducks, snails, turtles, cats, dogs, mixed)
- **⚔️ Battle Bots** — Combat arena elimination with weapons, hazards, takedowns, and instant replays
- **🏍️ Light Cycles** — Tron-inspired light-cycle elimination with AI personalities and power-ups
- **🎯 Plinko** — Plinko ball drop with elemental effects on winners
- **🧗 Wall Climber** — Vertical wall-climbing race with 9 climber sub-modes

All modes share the same participant list and saved groups. Switching modes mid-race prompts a confirmation and resets the current race.
```

- [ ] **Step 7.4: Final commit**

```bash
git add README.md
git commit -m "Document multi-mode picker and complete integration

Adds a Modes section to the README listing all five game modes
and the shared participant-list/groups behavior. Closes the
multi-mode integration work tracked in:
docs/superpowers/specs/2026-05-06-picker-modes-design.md
docs/superpowers/plans/2026-05-06-picker-modes.md"
```

---

## Self-review (writer's notes — already addressed)

- **Spec coverage:** All 5 mode integrations have tasks. Confirm-on-mid-race switch is in Task 1. Type unification is in Task 1. Shared FinalStandingsDialog is in Task 1. Storage key persistence (`gamified_picker_mode`) is in Task 1. README mention is in Task 7.
- **Type consistency:** `ModeViewProps` defined in Task 1 step 1.3 is referenced consistently in Tasks 2–6. `ModeWinnerExtras` likewise. `GameMode` enum used in Task 1 step 1.6.
- **Placeholder scan:** None. Where the wrapper code legitimately must be filled in by reading the source branch's App.tsx (Tasks 3, 4, 5), each step explicitly names the source file and the kinds of state to migrate. The skeleton code is enough to compile against; the engineer extends it from the source.
- **Parallelization safety:** Tasks 2–6 each touch only files under `src/components/modes/<Name>/`. No shared file is modified after Task 1.

---

## Out of scope (deferred from spec)

- Battle-bots' richer FinalStandings dialog (with takedown counts and killer info per row).
- Per-mode persistent leaderboards or cross-session stats.
- New game modes beyond the five branches.
