import type { TreatSpeed } from './trickOrTreatSettingsStore';
import { useTrickOrTreatSettings, updateTrickOrTreatSettings } from './trickOrTreatSettingsStore';

const SPEEDS: { value: TreatSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function TrickOrTreatSettings() {
  const settings = useTrickOrTreatSettings();
  return (
    <>
      <fieldset>
        <legend>Pacing</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="trick-or-treat-speed"
              checked={settings.speed === s.value}
              onChange={() => updateTrickOrTreatSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Trick-or-treaters</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.useAvatars}
            onChange={(e) => updateTrickOrTreatSettings({ useAvatars: e.target.checked })}
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
            onChange={(e) => updateTrickOrTreatSettings({ sound: e.target.checked })}
          />
          <span>Doorstep sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateTrickOrTreatSettings({ music: e.target.checked })}
          />
          <span>Spooky vamp</span>
        </label>
      </fieldset>
    </>
  );
}
