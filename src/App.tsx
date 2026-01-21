import { useEffect, useState } from 'react';
import type { Entry } from './types';
import { EntryManager } from './components/EntryManager';
import { RacingGame } from './components/RacingGame';
import './App.css';

const STORAGE_KEY = 'gamified_picker_entries';

function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [showRace, setShowRace] = useState(false);

  // Load entries from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setEntries(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load entries', e);
      }
    }
  }, []);

  // Save entries to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const handleEntriesChange = (newEntries: Entry[]) => {
    setEntries(newEntries);
  };

  const handleWinner = (winnerEntry: Entry) => {
    setWinner(winnerEntry.name);
    // Remove winner from entries for next race
    setEntries((prev) => prev.filter((e) => e.id !== winnerEntry.id));
  };

  const handleRaceComplete = () => {
    setShowRace(false);
  };

  const startRace = () => {
    if (entries.length < 2) {
      alert('Add at least 2 participants to start a race!');
      return;
    }
    setShowRace(true);
    setWinner(null);
  };

  const resetAllEntries = () => {
    if (window.confirm('Reset all participants?')) {
      setEntries([]);
      setWinner(null);
      setShowRace(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏁 Gamified Picker</h1>
        <p>Mario Kart Style Random Selection</p>
      </header>

      <div className="app-container">
        <div className="sidebar">
          <h2>Participants</h2>
          <EntryManager entries={entries} onEntriesChange={handleEntriesChange} />

          {entries.length >= 2 && (
            <button onClick={startRace} className="start-race-button">
              🏁 Start Race ({entries.length})
            </button>
          )}

          {entries.length > 0 && (
            <button onClick={resetAllEntries} className="reset-button">
              Reset All
            </button>
          )}
        </div>

        <div className="main-content">
          {showRace && entries.length >= 2 ? (
            <RacingGame
              entries={entries}
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
              <p>Participants remaining: {entries.length}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
