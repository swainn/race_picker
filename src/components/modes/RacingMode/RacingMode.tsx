import { useState } from 'react';
import type { ModeViewProps } from '../types';
import { RacingGame } from './RacingGame';
import './RacingMode.css';

type VehicleMode =
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'rocket'
  | 'duck'
  | 'snail'
  | 'turtle'
  | 'cat'
  | 'dog';
type RacingSubMode = VehicleMode | 'mixed';

const SUB_MODES: { value: RacingSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'turtle', label: '🐢 Turtles' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

export function RacingMode(props: ModeViewProps) {
  const [subMode, setSubMode] = useState<RacingSubMode>('car');
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

      <div className="mode-toggle" role="radiogroup" aria-label="Racing sub-mode">
        {SUB_MODES.map((m) => (
          <label key={m.value} className="mode-option">
            <input
              type="radio"
              name="racingSubMode"
              value={m.value}
              checked={subMode === m.value}
              onChange={() => setSubMode(m.value)}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
