import type { ModeViewProps } from '../types';
import { AlienAbductionGame } from './AlienAbductionGame';
import { useAlienAbductionSettings } from './alienAbductionSettingsStore';
import './AlienAbductionMode.css';

export function AlienAbductionMode(props: ModeViewProps) {
  const { subMode, hazards, sound, music } = useAlienAbductionSettings();
  const {
    entries,
    allEntries,
    isRacing,
    currentWinner,
    eliminatedIds,
    onWinner,
    onRaceComplete,
    onShowFinalStandings,
    onStartRace,
    onResetRace,
  } = props;

  return (
    <div className="alien-abduction-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🛸 Start Abduction ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <AlienAbductionGame
        entries={entries}
        allEntries={allEntries}
        onWinner={(entry) => onWinner(entry)}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        mode={subMode}
        hazards={hazards}
        sound={sound}
        music={music}
      />
    </div>
  );
}
