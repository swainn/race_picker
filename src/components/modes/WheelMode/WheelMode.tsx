import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { WheelGame } from './WheelGame';
import { RunnerGame } from './RunnerGame';
import {
  isMuted as audioIsMuted,
  setMuted as audioSetMuted,
  SOUND_OPTIONS,
  type SoundType,
} from './audio';
import './WheelGame.css';

const SOUND_STORAGE_KEY = 'wheel_mode_sound';
const MUTE_STORAGE_KEY = 'wheel_mode_muted';

interface WinnerSnapshot {
  name: string;
  image?: string;
}

function loadSoundType(): SoundType {
  try {
    const v = localStorage.getItem(SOUND_STORAGE_KEY);
    if (!v) return 'classic';
    const known = SOUND_OPTIONS.some((o) => o.value === v);
    return known ? (v as SoundType) : 'classic';
  } catch {
    return 'classic';
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getEntryImage(entry: Entry): string | undefined {
  if (entry.imageDataUrls && entry.imageDataUrls.length > 0) {
    return entry.imageDataUrls[0];
  }
  return entry.imageDataUrl;
}

export function WheelMode(props: ModeViewProps) {
  const {
    entries,
    eliminatedIds,
    isRacing,
    currentWinner,
    onWinner,
    onRaceComplete,
    onStartRace,
    onResetRace,
  } = props;

  const [soundType, setSoundType] = useState<SoundType>(() => loadSoundType());
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [winnerSnapshot, setWinnerSnapshot] = useState<WinnerSnapshot | null>(null);
  const [showRunner, setShowRunner] = useState<boolean>(false);

  // Sync mute pref into the audio module on mount + change.
  useEffect(() => {
    audioSetMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (audioIsMuted() !== muted) audioSetMuted(muted);
  }, [muted]);

  // Persist preferences.
  useEffect(() => {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, soundType);
    } catch {
      // ignore
    }
  }, [soundType]);

  useEffect(() => {
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
    } catch {
      // ignore
    }
  }, [muted]);

  // Clear local winner snapshot when parent resets the race.
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerSnapshot(null);
    }
  }, [eliminatedIds.length]);

  // Clear local winner snapshot when parent clears currentWinner.
  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerSnapshot(null);
    }
  }, [currentWinner]);

  // Easter egg: Ctrl+. opens, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '.') {
        e.preventDefault();
        setShowRunner((prev) => !prev);
      } else if (e.key === 'Escape' && showRunner) {
        setShowRunner(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showRunner]);

  const handleWinner = (winnerEntry: Entry) => {
    setWinnerSnapshot({
      name: winnerEntry.name,
      image: getEntryImage(winnerEntry),
    });
    onWinner(winnerEntry);
  };

  const handleSpinAgain = () => {
    setWinnerSnapshot(null);
    onRaceComplete();
  };

  const handleReset = () => {
    setWinnerSnapshot(null);
    onResetRace();
  };

  const handleSoundChange = (next: SoundType) => {
    setSoundType(next);
  };

  const handleMuteToggle = () => {
    setMutedState((prev) => !prev);
  };

  return (
    <div className="wheel-mode">
      <div className="wheel-controls">
        {!isRacing && entries.length >= 1 && !winnerSnapshot && (
          <button onClick={onStartRace} className="wheel-spin-button">
            🎡 Spin Wheel ({entries.length})
          </button>
        )}
        {!isRacing && eliminatedIds.length > 0 && (
          <button onClick={handleReset} className="wheel-reset-button">
            🔄 Reset
          </button>
        )}
        {!isRacing && (
          <div className="wheel-sound-controls">
            <select
              className="wheel-sound-select"
              value={soundType}
              onChange={(e) => handleSoundChange(e.target.value as SoundType)}
              aria-label="Tick sound type"
            >
              {SOUND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleMuteToggle}
              className={`wheel-mute-button${muted ? ' muted' : ''}`}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
              title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
        )}
      </div>

      {winnerSnapshot && (
        <div className="wheel-winner-overlay">
          {winnerSnapshot.image && (
            <img
              src={winnerSnapshot.image}
              alt={winnerSnapshot.name}
              className="wheel-winner-avatar"
            />
          )}
          <h2>🎉 Winner: {winnerSnapshot.name} 🎉</h2>
          <button onClick={handleSpinAgain} className="wheel-winner-spin-again">
            ▶ Spin Again
          </button>
        </div>
      )}

      <WheelGame
        entries={entries}
        isRacing={isRacing}
        soundType={soundType}
        onWinner={handleWinner}
      />

      <RunnerGame open={showRunner} onClose={() => setShowRunner(false)} />
    </div>
  );
}
