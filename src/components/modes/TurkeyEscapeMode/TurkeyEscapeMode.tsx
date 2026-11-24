import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { turkeyEscapeTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { TurkeyEscapeGame, type TurkeyWinnerDisplay } from './TurkeyEscapeGame';
import './TurkeyEscapeGame.css';

/**
 * Wrapper for Turkey Escape. Each chase ends with one participant in the
 * farmer's net and *out*, so this orders like Whac-a-Mole rather than Racing:
 * register it with `survivalOrder: true` and the first turkey caught lands in
 * last place, while the one the farmer never catches — the pardoned turkey —
 * finishes first.
 */
export function TurkeyEscapeMode({
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
  const [winnerDisplay, setWinnerDisplay] = useState<TurkeyWinnerDisplay | null>(null);

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

  // App auto-declares the last turkey free — the one that was never caught.
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
      // Survivor, so this card gets the gold.
      isChampion: true,
    });
  }, [currentWinner, winnerDisplay, allEntries]);

  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  const handleWinner = (caught: Entry) => {
    const images = getEntryImages(caught);
    // A chase can start with one turkey left if the roster is edited down
    // mid-round. Nobody else is free, so that turkey is the survivor and gets
    // the pardon, not the caught card.
    const lone = entries.length === 1;
    setWinnerDisplay({
      name: caught.name,
      imageDataUrl: getPreferredEntryImage(caught),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: lone,
      // Otherwise being caught is never a win, so never gold.
      isChampion: lone,
    });
    onWinner(caught);
  };

  return (
    <div className="turkey-escape-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🚪 Open the Gate ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <TurkeyEscapeGame
        theme={turkeyEscapeTheme}
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
