import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { whacAMoleTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { WhacAMoleGame, type WhacAMoleWinnerDisplay } from './WhacAMoleGame';
import './WhacAMoleGame.css';

/**
 * Wrapper for Whac-a-Mole. Each swing knocks one participant *out*, so this
 * orders like Battle Bots rather than Racing: register it with
 * `survivalOrder: true` and the first mole whacked lands in last place, while
 * the one the mallet never came for finishes first.
 */
export function WhacAMoleMode({
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
}: ModeViewProps) {
  const [winnerDisplay, setWinnerDisplay] = useState<WhacAMoleWinnerDisplay | null>(null);

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

  // App auto-declares the last mole standing — the one that was never whacked.
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
      // Survivor, so this is the only card in the mode that gets the gold.
      isChampion: true,
    });
  }, [currentWinner, winnerDisplay, allEntries]);

  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  const handleWinner = (whacked: Entry) => {
    const images = getEntryImages(whacked);
    setWinnerDisplay({
      name: whacked.name,
      imageDataUrl: getPreferredEntryImage(whacked),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      // A knockout is never a win, so never gold.
      isChampion: false,
    });
    onWinner(whacked);
  };

  return (
    <div className="whac-a-mole-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🔨 Swing the Mallet ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <WhacAMoleGame
        theme={whacAMoleTheme}
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
