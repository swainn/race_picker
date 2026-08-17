import type { Speed } from './invadersEngine';
import { useSpaceSettings, updateSpaceSettings } from './spaceSettingsStore';

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

/** Shared Slow/Normal/Fast radio group for both Space modes. */
export function SpeedFieldset() {
  const settings = useSpaceSettings();
  return (
    <fieldset>
      <legend>Game speed</legend>
      {SPEEDS.map((s) => (
        <label key={s.value}>
          <input
            type="radio"
            name="space-speed"
            checked={settings.speed === s.value}
            onChange={() => updateSpaceSettings({ speed: s.value })}
          />
          <span>{s.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
