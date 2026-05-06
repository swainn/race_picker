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
    return {
      id: entry.id,
      name: entry.name,
      imageDataUrls: entry.imageDataUrls.filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      ),
    };
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        <p>The Random Selection Tool for Winners!</p>
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
          <div key={`${gameMode}-${resetKey}`} style={{ width: '100%' }}>
            {renderMode()}
          </div>

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
