import { WALL_CLIMBER_SUB_MODES, useWallClimberSubMode } from './wallClimberSettingsStore';

export function WallClimberSettings() {
  const [subMode, setSubMode] = useWallClimberSubMode();
  return (
    <fieldset>
      <legend>Climber</legend>
      <div role="radiogroup" aria-label="Wall climber vehicle">
        {WALL_CLIMBER_SUB_MODES.map((m) => (
          <label key={m.value}>
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
    </fieldset>
  );
}
