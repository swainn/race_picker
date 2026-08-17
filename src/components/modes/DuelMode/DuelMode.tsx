import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { duelTheme } from '../themes';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { DuelGame, type DuelWinnerDisplay } from './DuelGame';
import { DuelStandingsDialog } from './DuelStandingsDialog';
import './DuelGame.css';

/**
 * Wrapper for Street Duel. Mirrors the other survival modes: owns the local
 * winner-overlay state + the four parent-prop-sync effects, and forwards each
 * duel's loser to the parent as the elimination.
 */
export function DuelMode({
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
  const [winnerDisplay, setWinnerDisplay] = useState<DuelWinnerDisplay | null>(null);
  /** Snapshot of damage totals taken when the standings open (null = closed). */
  const [damageStandings, setDamageStandings] = useState<Map<number, number> | null>(null);
  /** Total damage inflicted per entry across all duels this session. Kept in a
   *  ref (updated at 60fps from the game loop) — read only when standings open. */
  const damageTotalsRef = useRef<Map<number, number>>(new Map());

  const handleDamage = useCallback((attackerId: number, amount: number) => {
    const m = damageTotalsRef.current;
    m.set(attackerId, (m.get(attackerId) ?? 0) + amount);
  }, []);

  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
      setDamageStandings(null);
      damageTotalsRef.current = new Map();
    }
  }, [eliminatedIds.length]);

  useEffect(() => {
    if (isRacing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synced from parent-driven prop transitions
      setWinnerDisplay(null);
    }
  }, [isRacing]);

  // App auto-declares the last survivor (champion) — synthesize its display.
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

  // DuelGame reports the KO'd loser (the pick) and who beat them.
  const handleWinner = (loser: Entry, winnerName: string) => {
    const images = getEntryImages(loser);
    setWinnerDisplay({
      name: loser.name,
      imageDataUrl: getPreferredEntryImage(loser),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      beatenBy: winnerName,
    });
    onWinner(loser);
  };

  return (
    <div className="duel-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🥊 Start Duels ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <DuelGame
        theme={duelTheme}
        entries={entries}
        allEntries={allEntries}
        winOrder={winOrder}
        onWinner={handleWinner}
        onDamage={handleDamage}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={() => setDamageStandings(new Map(damageTotalsRef.current))}
        isRacing={isRacing}
        currentWinner={winnerDisplay}
      />

      {damageStandings && (
        <DuelStandingsDialog
          entries={allEntries}
          damageTotals={damageStandings}
          onClose={() => setDamageStandings(null)}
        />
      )}
    </div>
  );
}
