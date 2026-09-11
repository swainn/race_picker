import type { DuelGraphics, DuelSpeed } from './duelSettingsStore';
import { useDuelSettings, updateDuelSettings } from './duelSettingsStore';
import { DUEL_THEMES, DUEL_THEME_IDS } from './duelThemes';

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
        <legend>Roster</legend>
        {DUEL_THEME_IDS.map((id) => (
          <label key={id}>
            <input
              type="radio"
              name="duel-theme"
              checked={settings.theme === id}
              onChange={() => updateDuelSettings({ theme: id })}
            />
            <span>{DUEL_THEMES[id].label}</span>
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
