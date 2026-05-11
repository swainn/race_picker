import type { ModeViewProps } from '../types';
import { RacingGame } from './RacingGame';
import { useRacingSubMode } from './racingSettingsStore';
import './RacingMode.css';

export function RacingMode(props: ModeViewProps) {
  const [subMode] = useRacingSubMode();
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

  return (
    <div className="racing-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🏁 Start Race ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset Race
          </button>
        )}
      </div>

      <RacingGame
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={onWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        mode={subMode}
      />
    </div>
  );
}
