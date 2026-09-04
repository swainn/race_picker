import type { DuelGraphics, DuelSpeed } from './duelSettingsStore';
import { useDuelSettings, updateDuelSettings } from './duelSettingsStore';

const SPEEDS: { value: DuelSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const GRAPHICS: { value: DuelGraphics; label: string }[] = [
  { value: 'vector', label: 'Vector' },
  { value: 'pixel', label: 'Lo-fi' },
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
        <legend>Graphics</legend>
        {GRAPHICS.map((g) => (
          <label key={g.value}>
            <input
              type="radio"
              name="duel-graphics"
              checked={settings.graphics === g.value}
              onChange={() => updateDuelSettings({ graphics: g.value })}
            />
            <span>{g.label}</span>
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
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateDuelSettings({ music: e.target.checked })}
          />
          <span>8-bit soundtrack</span>
        </label>
      </fieldset>
    </>
  );
}
