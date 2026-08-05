import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { KungFuGame } from './KungFuGame';

interface KillerInfo {
  name: string;
  weapon: string;
  icon?: string;
  ability?: string;
}

interface WinnerDisplay {
  name: string;
  killerInfo?: KillerInfo;
  isLastPlayer?: boolean;
}

export function KungFuMode(props: ModeViewProps) {
  const {
    entries,
    allEntries,
    eliminatedIds,
    winOrder,
    isRacing,
    currentWinner,
    onWinner,
    onRaceComplete,
    onShowFinalStandings,
    onStartRace,
    onResetRace,
  } = props;

  const [winnerDisplay, setWinnerDisplay] = useState<WinnerDisplay | null>(null);

  /* Reset internal display whenever the parent race resets (eliminatedIds back
     to empty — covers Reset, Clear All, and mode-switch). */
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local state synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [eliminatedIds.length]);

  /* Clear the overlay when a new round starts so the arena isn't frozen on it. */
  useEffect(() => {
    if (isRacing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local state synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [isRacing]);

  /* When App auto-declares the last survivor it bypasses our handleWinner, so
     synthesize a champion display from the parent-provided currentWinner. */
  useEffect(() => {
    if (!currentWinner) return;
    if (winnerDisplay && winnerDisplay.name === currentWinner) return;
    const entry = allEntries.find((e) => e.name === currentWinner);
    if (!entry) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local state synced from parent-driven prop transitions
    setWinnerDisplay({ name: entry.name, isLastPlayer: true });
  }, [currentWinner, winnerDisplay, allEntries]);

  /* Clear local display when the parent clears currentWinner. */
  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- local state synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  // KungFuGame fires this when a fighter is knocked off the platform.
  const handleWinner = (victim: Entry, killerInfo?: KillerInfo) => {
    const isLastPlayer = entries.filter((e) => e.id !== victim.id).length === 0;
    setWinnerDisplay({ name: victim.name, killerInfo, isLastPlayer });
    onWinner(victim, killerInfo ? { killerInfo } : undefined);
  };

  return (
    <div className="kung-fu-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🥋 Start Brawl ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset Brawl
          </button>
        )}
      </div>

      <KungFuGame
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={winnerDisplay?.name ?? null}
        currentWinnerKillerInfo={winnerDisplay?.killerInfo}
        currentWinnerIsLastPlayer={winnerDisplay?.isLastPlayer}
      />
    </div>
  );
}
