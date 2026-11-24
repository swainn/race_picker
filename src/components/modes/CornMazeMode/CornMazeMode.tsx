import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { cornMazeTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { CornMazeGame, type MazeWinnerDisplay } from './CornMazeGame';
import './CornMazeGame.css';

/**
 * Wrapper for Corn Maze. Each round sends everyone into a fresh maze and the
 * first one out is the round's pick — so this orders like Racing, not like
 * the survival modes: the first out of the maze places first.
 */
export function CornMazeMode({
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
}: ModeViewProps) {
  const [winnerDisplay, setWinnerDisplay] = useState<MazeWinnerDisplay | null>(null);

  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [eliminatedIds.length]);

  useEffect(() => {
    if (isRacing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [isRacing]);

  // App auto-declares the last runner left in the corn.
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

  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  const handleWinner = (firstOut: Entry) => {
    const images = getEntryImages(firstOut);
    setWinnerDisplay({
      name: firstOut.name,
      imageDataUrl: getPreferredEntryImage(firstOut),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      // The first one out of the first maze places first, so that one gets the gold.
      isChampion: winOrder.size === 0,
    });
    onWinner(firstOut);
  };

  return (
    <div className="corn-maze-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🌽 Enter the Maze ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <CornMazeGame
        theme={cornMazeTheme}
        entries={entries}
        allEntries={allEntries}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={winnerDisplay}
      />
    </div>
  );
}
