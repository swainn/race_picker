import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { pokerTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { PokerGame, type PokerWinnerDisplay } from './PokerGame';
import './PokerGame.css';

/**
 * Wrapper for Poker Night. Like the other survival modes it owns the local
 * winner-overlay state and the parent-prop-sync effects, and forwards each
 * hand's busted player to the parent as the elimination.
 */
export function PokerMode({
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
  const [winnerDisplay, setWinnerDisplay] = useState<PokerWinnerDisplay | null>(null);

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

  // App auto-declares the last player never busted — synthesize their display.
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

  // PokerGame reports the player with the worst hand (the pick) and what they held.
  const handleWinner = (busted: Entry, handName: string) => {
    const images = getEntryImages(busted);
    setWinnerDisplay({
      name: busted.name,
      imageDataUrl: getPreferredEntryImage(busted),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      bustedWith: handName,
    });
    onWinner(busted);
  };

  return (
    <div className="poker-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🃏 Deal Hand ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <PokerGame
        theme={pokerTheme}
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
