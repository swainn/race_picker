import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { trickOrTreatTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { TrickOrTreatGame, type TreatWinnerDisplay } from './TrickOrTreatGame';
import './TrickOrTreatGame.css';

/**
 * Wrapper for Trick-or-Treat. Each doorbell puts a candy in exactly one bag,
 * and that trick-or-treater is the round's pick — so this orders like Racing,
 * not like the survival modes: the first bag filled places first.
 */
export function TrickOrTreatMode({
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
  const [winnerDisplay, setWinnerDisplay] = useState<TreatWinnerDisplay | null>(null);

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

  // App auto-declares the last trick-or-treater left on the porch.
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

  const handleWinner = (treated: Entry) => {
    const images = getEntryImages(treated);
    setWinnerDisplay({
      name: treated.name,
      imageDataUrl: getPreferredEntryImage(treated),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      // The first bag filled places first, so that one gets the gold.
      isChampion: winOrder.size === 0,
    });
    onWinner(treated);
  };

  return (
    <div className="trick-or-treat-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🔔 Ring the Doorbell ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <TrickOrTreatGame
        theme={trickOrTreatTheme}
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
