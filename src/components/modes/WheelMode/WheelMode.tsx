import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { wheelTheme } from '../themes';
import { WheelGame } from './WheelGame';
import { RunnerGame } from './RunnerGame';
import { useWheelSettings } from './wheelSettingsStore';
import './WheelGame.css';

interface WinnerSnapshot {
  name: string;
  image?: string;
}

export function WheelMode(props: ModeViewProps) {
  const {
    entries,
    allEntries,
    eliminatedIds,
    isRacing,
    currentWinner,
    onWinner,
    onRaceComplete,
    onShowFinalStandings,
    onStartRace,
    onResetRace,
  } = props;

  const { soundType } = useWheelSettings();
  const [winnerSnapshot, setWinnerSnapshot] = useState<WinnerSnapshot | null>(null);
  const [showRunner, setShowRunner] = useState<boolean>(false);

  useEffect(() => {
    if (eliminatedIds.length === 0) {
      setWinnerSnapshot(null);
    }
  }, [eliminatedIds.length]);

  useEffect(() => {
    if (currentWinner === null) {
      setWinnerSnapshot(null);
    }
  }, [currentWinner]);

  // When only one entry remains, App auto-declares them the winner without
  // routing through this mode's handleWinner — so seed the snapshot from
  // currentWinner so the (finals) dialog and standings button still appear.
  useEffect(() => {
    if (currentWinner && !winnerSnapshot) {
      const found = allEntries.find((e) => e.name === currentWinner);
      if (found) {
        setWinnerSnapshot({
          name: found.name,
          image: getPreferredEntryImage(found),
        });
      }
    }
  }, [currentWinner, winnerSnapshot, allEntries]);

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
      image: getPreferredEntryImage(winnerEntry),
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
      </div>

      <WheelGame
        entries={entries}
        isRacing={isRacing}
        soundType={soundType}
        onWinner={handleWinner}
      />

      <WinnerDialog
        theme={wheelTheme}
        show={!!winnerSnapshot}
        isFinals={entries.length === 0}
        goldTreatment={false}
        winner={{
          name: winnerSnapshot?.name ?? '',
          imageDataUrl: winnerSnapshot?.image,
        }}
        headline="🎉 WINNER 🎉"
        finalsHeadline="🎉 WINNER 🎉"
        nextLabel="▶ Spin Again"
        onNext={handleSpinAgain}
        onShowFinalStandings={() => onShowFinalStandings?.()}
      />

      <RunnerGame open={showRunner} onClose={() => setShowRunner(false)} />
    </div>
  );
}
