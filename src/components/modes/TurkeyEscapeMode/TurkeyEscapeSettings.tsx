import type { TurkeySpeed } from './turkeyEscapeSettingsStore';
import { useTurkeyEscapeSettings, updateTurkeyEscapeSettings } from './turkeyEscapeSettingsStore';

const SPEEDS: { value: TurkeySpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function TurkeyEscapeSettings() {
  const settings = useTurkeyEscapeSettings();
  return (
    <>
      <fieldset>
        <legend>Pacing</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="turkey-escape-speed"
              checked={settings.speed === s.value}
              onChange={() => updateTurkeyEscapeSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Turkeys</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.useAvatars}
            onChange={(e) => updateTurkeyEscapeSettings({ useAvatars: e.target.checked })}
          />
          <span>Use participant photos as faces</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>Sound</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateTurkeyEscapeSettings({ sound: e.target.checked })}
          />
          <span>Farmyard sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateTurkeyEscapeSettings({ music: e.target.checked })}
          />
          <span>Banjo music</span>
        </label>
      </fieldset>
    </>
  );
}
