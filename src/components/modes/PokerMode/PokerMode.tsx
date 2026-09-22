import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { pokerTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { PokerGame, type PokerRoundResult, type PokerWinnerDisplay } from './PokerGame';
import { usePokerSettings } from './pokerSettingsStore';
import { PokerStandingsDialog } from './PokerStandingsDialog';
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
  winOrder,
  isRacing,
  currentWinner,
  onWinner,
  onRaceComplete,
  onStartRace,
  onResetRace,
}: ModeViewProps) {
  const [winnerDisplay, setWinnerDisplay] = useState<PokerWinnerDisplay | null>(null);
  /** Snapshot of pots won, taken when the standings open (null = closed). */
  const [standings, setStandings] = useState<Map<number, number> | null>(null);
  /** Pots won per entry across the session. Updated from the game loop, so it
   *  lives in a ref and is only read when the standings are opened. */
  const potsRef = useRef<Map<number, number>>(new Map());
  const { pick } = usePokerSettings();

  const handlePotWon = useCallback((entryIds: number[]) => {
    const m = potsRef.current;
    for (const id of entryIds) m.set(id, (m.get(id) ?? 0) + 1);
  }, []);

  // The two pick rules read `winOrder` in opposite directions — first picked
  // finishes last under 'worst', first under 'best' — so results recorded
  // under one rule would be mis-ranked by the other. Switching mid-session
  // therefore starts a clean session rather than silently re-ranking.
  const lastPickRef = useRef(pick);
  useEffect(() => {
    if (lastPickRef.current === pick) return;
    lastPickRef.current = pick;
    if (eliminatedIds.length > 0) onResetRace();
  }, [pick, eliminatedIds.length, onResetRace]);

  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
      setStandings(null);
      potsRef.current = new Map();
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

  // PokerGame reports whichever player the active rule singled out, plus both
  // ends of the showdown so the dialog can contrast them.
  const handleWinner = (picked: Entry, result: PokerRoundResult) => {
    const images = getEntryImages(picked);
    setWinnerDisplay({
      name: picked.name,
      imageDataUrl: getPreferredEntryImage(picked),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      // Under the best-hand rule the first pot taken is the overall win.
      isChampion: pick === 'best' && winOrder.size === 0,
      picked: result.picked,
      other: result.other,
    });
    onWinner(picked);
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
        onPotWon={handlePotWon}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={() => setStandings(new Map(potsRef.current))}
        isRacing={isRacing}
        currentWinner={winnerDisplay}
      />

      {standings && (
        <PokerStandingsDialog
          entries={allEntries}
          wins={standings}
          winOrder={winOrder}
          survivalOrder={pick === 'worst'}
          onClose={() => setStandings(null)}
        />
      )}
    </div>
  );
}
