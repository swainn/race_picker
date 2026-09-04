import { Suspense, useEffect, useState } from 'react';
import type { Entry } from './types';
import { FinalStandingsDialog } from './components/FinalStandingsDialog';
import { ManagementDialog } from './components/ManagementDialog';
import { SettingsModal } from './components/shared/SettingsModal/SettingsModal';
import { MODE_LIST, MODE_REGISTRY } from './components/modes/registry';
import type { GameMode, ModeWinnerExtras } from './components/modes/types';
import { loadFromStorage } from './utils/storage';
import { useGlobalMuted, setGlobalMuted } from './utils/globalAudioStore';
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
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const globalMuted = useGlobalMuted();
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

  const pickRandomMode = () => {
    const others = MODE_LIST.filter((m) => m.value !== gameMode);
    if (others.length === 0) return;
    const next = others[Math.floor(Math.random() * others.length)].value;
    handleModeChange(next);
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

  const activeModeEntry = MODE_REGISTRY[gameMode];
  const ActiveMode = activeModeEntry.View;
  const ActiveSettings = activeModeEntry.Settings;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>🎮 Aquaveo Picker</h1>
          </div>
          <div className="header-controls">
            <div className="mode-select">
              <label htmlFor="game-mode-select">Mode:</label>
              <select
                id="game-mode-select"
                value={gameMode}
                onChange={(e) => handleModeChange(e.target.value as GameMode)}
              >
                {MODE_LIST.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={pickRandomMode}
                className="mode-random-button"
                aria-label="Pick a random mode"
                title="Pick a random mode"
              >
                🎲
              </button>
            </div>
            <div className="header-menu">
              <button
                type="button"
                onClick={() => setShowHeaderMenu((v) => !v)}
                className="header-menu-button"
                aria-label="Menu"
                aria-expanded={showHeaderMenu}
                aria-haspopup="true"
              >
                ☰
              </button>
              {showHeaderMenu && (
                <>
                  <div
                    className="header-menu-backdrop"
                    onClick={() => setShowHeaderMenu(false)}
                  />
                  <div className="header-menu-dropdown" role="menu">
                    {ActiveSettings && (
                      <button
                        type="button"
                        role="menuitem"
                        className="header-menu-item"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowSettingsModal(true);
                        }}
                      >
                        🎛 Settings
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="header-menu-item"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowManagementModal(true);
                      }}
                    >
                      ⚙️ Participants ({entries.length})
                    </button>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={!globalMuted}
                      className="header-menu-item"
                      onClick={() => setGlobalMuted(!globalMuted)}
                    >
                      {globalMuted ? '🔇 Sound: Off' : '🔊 Sound: On'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="app-container">
        <div className="main-content">
          <div key={`${gameMode}-${resetKey}`} style={{ width: '100%' }}>
            <Suspense fallback={<div className="mode-loading">Loading…</div>}>
              <ActiveMode {...modeProps} />
            </Suspense>
          </div>

          {showFinalStandings && (
            <FinalStandingsDialog
              entries={entries}
              winOrder={winOrder}
              reverseOrder={activeModeEntry.survivalOrder}
              onClose={() => setShowFinalStandings(false)}
            />
          )}
        </div>
      </div>

      {ActiveSettings && (
        <SettingsModal
          show={showSettingsModal}
          title={`${activeModeEntry.label} Settings`}
          onClose={() => setShowSettingsModal(false)}
        >
          <ActiveSettings />
        </SettingsModal>
      )}

      {showManagementModal && (
        <ManagementDialog
          entries={entries}
          onEntriesChange={handleEntriesChange}
          eliminatedIds={eliminatedIds}
          winOrder={winOrder}
          onResetAll={resetAllEntries}
          groupNameInput={groupNameInput}
          onGroupNameInputChange={setGroupNameInput}
          onSaveGroup={saveGroup}
          groups={groups}
          onLoadGroup={loadGroup}
          onDeleteGroup={deleteGroup}
          onClose={() => setShowManagementModal(false)}
        />
      )}
    </div>
  );
}

export default App;
