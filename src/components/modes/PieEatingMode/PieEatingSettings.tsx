import type { PieSpeed } from './pieEatingSettingsStore';
import { usePieEatingSettings, updatePieEatingSettings } from './pieEatingSettingsStore';

const SPEEDS: { value: PieSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function PieEatingSettings() {
  const settings = usePieEatingSettings();
  return (
    <>
      <fieldset>
        <legend>Pacing</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="pie-eating-speed"
              checked={settings.speed === s.value}
              onChange={() => updatePieEatingSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Contestants</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.useAvatars}
            onChange={(e) => updatePieEatingSettings({ useAvatars: e.target.checked })}
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
            onChange={(e) => updatePieEatingSettings({ sound: e.target.checked })}
          />
          <span>Contest sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updatePieEatingSettings({ music: e.target.checked })}
          />
          <span>Fair music</span>
        </label>
      </fieldset>
    </>
  );
}
