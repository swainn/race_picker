import { useEffect, useState } from 'react';
import type { Entry } from './types';
import { EntryManager } from './components/EntryManager';
import { RacingGame } from './components/RacingGame';
import './App.css';

const STORAGE_KEY = 'gamified_picker_entries';
const GROUPS_STORAGE_KEY = 'gamified_picker_groups';
type VehicleMode = 'car' | 'boat' | 'plane' | 'balloon' | 'rocket' | 'duck' | 'snail' | 'turtle' | 'cat' | 'dog';
type RacingMode = VehicleMode | 'mixed';

interface Group {
  id: number;
  name: string;
  entries: Entry[];
  timestamp: number;
}

// Load initial state from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to load ${key}`, e);
    return defaultValue;
  }
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(() => loadFromStorage(STORAGE_KEY, []));
  const [eliminatedIds, setEliminatedIds] = useState<number[]>([]);
  const [winOrder, setWinOrder] = useState<Map<number, number>>(new Map());
  const [winner, setWinner] = useState<string | null>(null);
  const [showRace, setShowRace] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showFinalStandings, setShowFinalStandings] = useState(false);
  const [groups, setGroups] = useState<Group[]>(() => loadFromStorage(GROUPS_STORAGE_KEY, []));
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [racingMode, setRacingMode] = useState<RacingMode>('car');

  // Save entries to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const handleEntriesChange = (newEntries: Entry[]) => {
    setEntries(newEntries);
    // Clean up eliminated IDs if entries are removed from the list
    setEliminatedIds((prev) => prev.filter((id) => newEntries.some((e) => e.id === id)));
    // Clean up win order
    setWinOrder((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((_, id) => {
        if (!newEntries.some((e) => e.id === id)) {
          newMap.delete(id);
        }
      });
      return newMap;
    });
    // Reset track view when entries change
    setResetKey((prev) => prev + 1);
  };

  const handleWinner = (winnerEntry: Entry) => {
    setWinner(winnerEntry.name);
    // Add winner to eliminated list and track order
    setEliminatedIds((prev) => [...prev, winnerEntry.id]);
    setWinOrder((prev) => new Map(prev).set(winnerEntry.id, prev.size + 1));
    // Stop the race to show winner dialog
    setShowRace(false);
  };

  const handleRaceComplete = () => {
    // This is called when user clicks "Next Race" button
    setWinner(null);
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    
    // If only 1 racer left, close dialog briefly then declare them winner
    if (activeEntries.length === 1) {
      setTimeout(() => {
        handleWinner(activeEntries[0]);
      }, 300);
      return;
    }
    
    // Automatically start the next race
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
    
    // If only 1 racer left, close any open dialog then declare them winner
    if (activeEntries.length === 1) {
      setWinner(null);
      setTimeout(() => {
        handleWinner(activeEntries[0]);
      }, 300);
      return;
    }
    
    setWinner(null);
    setShowRace(true);
  };

  const resetRace = () => {
    // Reset eliminations, bringing all participants back to race
    setEliminatedIds([]);
    setWinOrder(new Map());
    setWinner(null);
    setShowRace(false);
    setShowFinalStandings(false);
    setResetKey((prev) => prev + 1); // Force track to reset
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
      timestamp: Date.now()
    };
    
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    setGroupNameInput('');
    alert(`Group "${groupName}" saved successfully!`);
  };

  const loadGroup = (groupId: number) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      setEntries(group.entries);
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
      const updatedGroups = groups.filter(g => g.id !== groupId);
      setGroups(updatedGroups);
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    }
  };

  const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));

  const getModeEmoji = (mode: RacingMode) => {
    switch (mode) {
      case 'car':
        return '🏁';
      case 'boat':
        return '⛵';
      case 'plane':
        return '✈️';
      case 'balloon':
        return '🎈';
      case 'rocket':
        return '🚀';
      case 'duck':
        return '🦆';
      case 'snail':
        return '🐌';
      case 'turtle':
        return '🐢';
      case 'cat':
        return '🐱';
      case 'dog':
        return '🐶';
      case 'mixed':
        return '🎲';
      default:
        return '🏁';
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>{getModeEmoji(racingMode)} Aquaveo Race Picker {getModeEmoji(racingMode)}</h1>
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
              <button onClick={() => setShowGroupManager(!showGroupManager)} className="manage-groups-button">
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
          <div className="race-controls">
            {activeEntries.length >= 1 && (
              <button onClick={startRace} className="start-race-button">
                🏁 Start Race ({activeEntries.length})
              </button>
            )}

            {eliminatedIds.length > 0 && (
              <button onClick={resetRace} className="reset-race-button">
                🔄 Reset Race
              </button>
            )}
          </div>

          <RacingGame
            key={resetKey}
            entries={activeEntries}
            allEntries={entries}
            eliminatedIds={eliminatedIds}
            winOrder={winOrder}
            onWinner={handleWinner}
            onRaceComplete={handleRaceComplete}
            onShowFinalStandings={() => setShowFinalStandings(true)}
            isRacing={showRace}
            currentWinner={winner}
            mode={racingMode}
          />

          <div className="mode-toggle" role="radiogroup" aria-label="Racing mode">
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="car"
                checked={racingMode === 'car'}
                onChange={() => setRacingMode('car')}
              />
              <span>🚗 Cars</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="boat"
                checked={racingMode === 'boat'}
                onChange={() => setRacingMode('boat')}
              />
              <span>⛵ Boats</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="plane"
                checked={racingMode === 'plane'}
                onChange={() => setRacingMode('plane')}
              />
              <span>✈️ Planes</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="balloon"
                checked={racingMode === 'balloon'}
                onChange={() => setRacingMode('balloon')}
              />
              <span>🎈 Balloons</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="rocket"
                checked={racingMode === 'rocket'}
                onChange={() => setRacingMode('rocket')}
              />
              <span>🚀 Rockets</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="duck"
                checked={racingMode === 'duck'}
                onChange={() => setRacingMode('duck')}
              />
              <span>🦆 Ducks</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="snail"
                checked={racingMode === 'snail'}
                onChange={() => setRacingMode('snail')}
              />
              <span>🐌 Snails</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="turtle"
                checked={racingMode === 'turtle'}
                onChange={() => setRacingMode('turtle')}
              />
              <span>🐢 Turtles</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="cat"
                checked={racingMode === 'cat'}
                onChange={() => setRacingMode('cat')}
              />
              <span>🐱 Cats</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="dog"
                checked={racingMode === 'dog'}
                onChange={() => setRacingMode('dog')}
              />
              <span>🐶 Dogs</span>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                name="racingMode"
                value="mixed"
                checked={racingMode === 'mixed'}
                onChange={() => setRacingMode('mixed')}
              />
              <span>🎲 Mixed</span>
            </label>
          </div>

          {winner && !showRace && (
            <div className="winner-info">
              <p>Last winner: <strong>{winner}</strong></p>
              <p>Racing: {activeEntries.length} / {entries.length}</p>
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

interface FinalStandingsProps {
  entries: Entry[];
  winOrder: Map<number, number>;
  onClose: () => void;
}

function FinalStandingsDialog({ entries, winOrder, onClose }: FinalStandingsProps) {
  // Sort entries by their win order
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
