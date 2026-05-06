import { useState } from 'react';
import type { ModeViewProps } from '../types';
import { WallClimberGame } from './WallClimberGame';
import './WallClimberMode.css';

type ClimberMode =
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'rocket'
  | 'duck'
  | 'snail'
  | 'cat'
  | 'dog';
type WallClimberSubMode = ClimberMode | 'mixed';

const SUB_MODES: { value: WallClimberSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

export function WallClimberMode(props: ModeViewProps) {
  const [subMode, setSubMode] = useState<WallClimberSubMode>('car');
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

      <div className="mode-toggle" role="radiogroup" aria-label="Wall-climber sub-mode">
        {SUB_MODES.map((m) => (
          <label key={m.value} className="mode-option">
            <input
              type="radio"
              name="wallClimberSubMode"
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
