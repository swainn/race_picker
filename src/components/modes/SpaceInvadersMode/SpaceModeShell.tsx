import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import type { WinnerTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import type { Variant } from './invadersEngine';
import { SpaceGame } from './SpaceGame';
import './SpaceGame.css';

interface WinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  isLastPlayer?: boolean;
}

interface ShellProps extends ModeViewProps {
  variant: Variant;
  theme: WinnerTheme;
  startLabel: string;
  resetLabel: string;
  headline: string;
  finalsHeadline: string;
  nextLabel: string;
}

/**
 * Shared wrapper for the Space Invaders family. Mirrors BattleBotsMode/KungFuMode:
 * owns the local winner-overlay state + the four parent-prop-sync effects, and
 * forwards eliminations to the parent. The two registry modes are thin shells
 * that only differ by `variant`, theme, and dialog labels.
 */
export function SpaceModeShell({
  variant,
  theme,
  startLabel,
  resetLabel,
  headline,
  finalsHeadline,
  nextLabel,
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
}: ShellProps) {
  const [winnerDisplay, setWinnerDisplay] = useState<WinnerDisplay | null>(null);

  /* Reset the overlay whenever the parent race resets (eliminatedIds back to
     empty — covers Reset, Clear All, and mode-switch). */
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [eliminatedIds.length]);

  /* Clear the overlay when a new round starts so the arena isn't frozen on it. */
  useEffect(() => {
    if (isRacing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
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
    const images = getEntryImages(entry);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
    setWinnerDisplay({
      name: entry.name,
      imageDataUrl: getPreferredEntryImage(entry),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: true,
    });
  }, [currentWinner, winnerDisplay, allEntries]);

  /* Clear local display when the parent clears currentWinner. */
  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  // SpaceGame fires this when the round's victim is destroyed.
  const handleWinner = (victim: Entry) => {
    const images = getEntryImages(victim);
    const isLastPlayer = entries.filter((e) => e.id !== victim.id).length === 0;
    setWinnerDisplay({
      name: victim.name,
      imageDataUrl: getPreferredEntryImage(victim),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer,
    });
    onWinner(victim);
  };

  return (
    <div className="space-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            {startLabel} ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            {resetLabel}
          </button>
        )}
      </div>

      <SpaceGame
        variant={variant}
        theme={theme}
        headline={headline}
        finalsHeadline={finalsHeadline}
        nextLabel={nextLabel}
        entries={entries}
        allEntries={allEntries}
        eliminatedCount={eliminatedIds.length}
        winOrder={winOrder}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={winnerDisplay}
      />
    </div>
  );
}
