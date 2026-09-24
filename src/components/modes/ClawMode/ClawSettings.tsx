import type { ClawSpeed } from './clawSettingsStore';
import { useClawSettings, updateClawSettings } from './clawSettingsStore';

const SPEEDS: { value: ClawSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function ClawSettings() {
  const settings = useClawSettings();
  return (
    <>
      <fieldset>
        <legend>Claw speed</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="claw-speed"
              checked={settings.speed === s.value}
              onChange={() => updateClawSettings({ speed: s.value })}
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
            onChange={(e) => updateClawSettings({ sound: e.target.checked })}
          />
          <span>Cabinet sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateClawSettings({ music: e.target.checked })}
          />
          <span>Arcade jingle</span>
        </label>
      </fieldset>
    </>
  );
}
