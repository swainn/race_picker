import type { PokerSpeed } from './pokerSettingsStore';
import { usePokerSettings, updatePokerSettings } from './pokerSettingsStore';

const SPEEDS: { value: PokerSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function PokerSettings() {
  const settings = usePokerSettings();
  return (
    <>
      <fieldset>
        <legend>Deal speed</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="poker-speed"
              checked={settings.speed === s.value}
              onChange={() => updatePokerSettings({ speed: s.value })}
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
            onChange={(e) => updatePokerSettings({ sound: e.target.checked })}
          />
          <span>Card and chip sounds</span>
        </label>
      </fieldset>
    </>
  );
}
