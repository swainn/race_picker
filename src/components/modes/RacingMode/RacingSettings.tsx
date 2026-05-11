import { RACING_SUB_MODES, useRacingSubMode } from './racingSettingsStore';

export function RacingSettings() {
  const [subMode, setSubMode] = useRacingSubMode();
  return (
    <fieldset>
      <legend>Vehicle</legend>
      <div role="radiogroup" aria-label="Racing vehicle">
        {RACING_SUB_MODES.map((m) => (
          <label key={m.value}>
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
    </fieldset>
  );
}
