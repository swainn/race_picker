import { useEffect, useState } from 'react';
import type { Entry } from './types';
import { EntryManager } from './components/EntryManager';
import { RacingGame } from './components/RacingGame';
import './App.css';

const STORAGE_KEY = 'gamified_picker_entries';
const ELIMINATED_KEY = 'gamified_picker_eliminated';

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
  const [eliminatedIds, setEliminatedIds] = useState<number[]>(() => loadFromStorage(ELIMINATED_KEY, []));
  const [winner, setWinner] = useState<string | null>(null);
  const [showRace, setShowRace] = useState(false);

  // Save entries to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  // Save eliminated IDs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(ELIMINATED_KEY, JSON.stringify(eliminatedIds));
  }, [eliminatedIds]);

  const handleEntriesChange = (newEntries: Entry[]) => {
    setEntries(newEntries);
    // Clean up eliminated IDs if entries are removed from the list
    setEliminatedIds((prev) => prev.filter((id) => newEntries.some((e) => e.id === id)));
  };

  const handleWinner = (winnerEntry: Entry) => {
    setWinner(winnerEntry.name);
    // Add winner to eliminated list (don't remove from entries)
    setEliminatedIds((prev) => [...prev, winnerEntry.id]);
  };

  const handleRaceComplete = () => {
    setShowRace(false);
  };

  const startRace = () => {
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    if (activeEntries.length < 2) {
      alert('Add at least 2 participants to start a race!');
      return;
    }
    setShowRace(true);
    setWinner(null);
  };

  const resetRace = () => {
    // Reset eliminations, bringing all participants back to race
    setEliminatedIds([]);
    setWinner(null);
    setShowRace(false);
  };

  const resetAllEntries = () => {
    if (window.confirm('Clear all participants from the list?')) {
      setEntries([]);
      setEliminatedIds([]);
      setWinner(null);
      setShowRace(false);
    }
  };

  const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏁 Gamified Picker</h1>
        <p>Mario Kart Style Random Selection</p>
      </header>

      <div className="app-container">
        <div className="sidebar">
          <h2>Participants</h2>
          <EntryManager 
            entries={entries} 
            onEntriesChange={handleEntriesChange}
            eliminatedIds={eliminatedIds}
          />

          {activeEntries.length >= 2 && (
            <button onClick={startRace} className="start-race-button">
              🏁 Start Race ({activeEntries.length})
            </button>
          )}

          {eliminatedIds.length > 0 && (
            <button onClick={resetRace} className="reset-race-button">
              🔄 Reset Race
            </button>
          )}

          {entries.length > 0 && (
            <button onClick={resetAllEntries} className="reset-button">
              Clear All
            </button>
          )}
        </div>

        <div className="main-content">
          {showRace && activeEntries.length >= 2 ? (
            <RacingGame
              entries={activeEntries}
              onWinner={handleWinner}
              onRaceComplete={handleRaceComplete}
            />
          ) : (
            <div className="welcome-screen">
              <div className="welcome-content">
                <h2>Welcome to Gamified Picker!</h2>
                <p>Add participants on the left, then watch them race!</p>
                <div className="features">
                  <div className="feature">
                    <span className="feature-icon">🚗</span>
                    <span>Exciting racing animations</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🎲</span>
                    <span>Randomized race outcomes</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">💾</span>
                    <span>Auto-saves your list</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🏆</span>
                    <span>Winner elimination rounds</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {winner && (
            <div className="winner-info">
              <p>Last winner: <strong>{winner}</strong></p>
              <p>Racing: {activeEntries.length} / {entries.length}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
