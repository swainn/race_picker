import type { DuelSpeed } from './duelSettingsStore';
import { useDuelSettings, updateDuelSettings } from './duelSettingsStore';

const SPEEDS: { value: DuelSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function DuelSettings() {
  const settings = useDuelSettings();
  return (
    <>
      <fieldset>
        <legend>Fight speed</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="duel-speed"
              checked={settings.speed === s.value}
              onChange={() => updateDuelSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Sound</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateDuelSettings({ sound: e.target.checked })}
          />
          <span>Arcade sound effects</span>
        </label>
      </fieldset>
    </>
  );
}
