import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { angryBirdsTheme } from '../themes';
import { useAngryBirdsSettings } from './angryBirdsSettingsStore';
import { FinalStandingsDialog } from '../../FinalStandingsDialog';
import { AngryBirdsGame, type AngryBirdsWinnerDisplay } from './AngryBirdsGame';
import './AngryBirdsGame.css';

/**
 * Wrapper for Angry Birds. The sub-mode decides who the participants are, and
 * with it which way the standings run:
 *
 *  - `pigs`  : participants perch in the tower and one is popped per round, so
 *              the pick is an *elimination* — first pig out finishes last and
 *              the pig never hit is the champion (survival ordering).
 *  - `birds` : participants shoot in turn and the best shot of the round is the
 *              pick, so the first bird picked places first (Racing ordering).
 *
 * Either way this calls onWinner(entry) once per round with the participant the
 * engine pre-picked; the ordering itself is the standings dialog's problem.
 */
export function AngryBirdsMode({
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
  const { subMode } = useAngryBirdsSettings();
  const pigsMode = subMode === 'pigs';
  const [winnerDisplay, setWinnerDisplay] = useState<AngryBirdsWinnerDisplay | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  /**
   * Bumping this throws the round in progress away and deals a new one. It is
   * an escape hatch for a launch that fails to resolve — and because it draws a
   * NEW participant rather than re-throwing at the same one, repeated use would
   * stop the pick being uniform. The label says so.
   */
  const [rerunKey, setRerunKey] = useState(0);

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

  // App auto-declares the last participant left.
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

  const handleWinner = (picked: Entry, score?: number) => {
    const images = getEntryImages(picked);
    setWinnerDisplay({
      name: picked.name,
      imageDataUrl: getPreferredEntryImage(picked),
      allImages: images.length > 0 ? images : undefined,
      isLastPlayer: false,
      // Only `birds` crowns its first pick: in `pigs` the first one popped is
      // the one who finished *last*, so nothing gold about it.
      isChampion: !pigsMode && winOrder.size === 0,
      score,
    });
    onWinner(picked);
  };

  return (
    <div className="angry-birds-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            {pigsMode ? `🐦 Launch the Bird (${entries.length} pigs)` : `🎯 Fire the Volley (${entries.length} birds)`}
          </button>
        )}
        {isRacing && (
          <button
            onClick={() => setRerunKey((k) => k + 1)}
            className="rerun-race-button"
            title="Abandon this round and draw a new one (re-draws who gets picked)"
          >
            🔁 Re-run (re-draws)
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <AngryBirdsGame
        theme={angryBirdsTheme}
        entries={entries}
        allEntries={allEntries}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        // This mode shows its OWN standings rather than the app's. The two
        // sub-modes sort opposite ways — pigs eliminate (last one perched
        // wins), birds place as they are picked — and the registry's
        // `survivalOrder` is a static flag that cannot follow a setting. So
        // App's onShowFinalStandings is deliberately never called: leaving it
        // unfired keeps App's own dialog shut, and the one below opens instead
        // with the sort the current sub-mode needs. Mirrors PokerMode, which
        // does the same for its two pick rules.
        onShowFinalStandings={() => setShowStandings(true)}
        isRacing={isRacing}
        currentWinner={winnerDisplay}
        rerunKey={rerunKey}
      />

      {showStandings && (
        <FinalStandingsDialog
          entries={allEntries}
          winOrder={winOrder}
          reverseOrder={pigsMode}
          onClose={() => setShowStandings(false)}
        />
      )}
    </div>
  );
}
