import type { ModeViewProps } from '../types';
import { WallClimberGame } from './WallClimberGame';
import { useWallClimberSubMode } from './wallClimberSettingsStore';
import './WallClimberMode.css';

export function WallClimberMode(props: ModeViewProps) {
  const [subMode] = useWallClimberSubMode();
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
    <div className="wall-climber-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🧗 Start Climb ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <WallClimberGame
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={(entry) => onWinner(entry)}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        mode={subMode}
      />
    </div>
  );
}
