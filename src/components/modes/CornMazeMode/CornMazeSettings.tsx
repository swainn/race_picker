import type { MazeSpeed } from './cornMazeSettingsStore';
import { useCornMazeSettings, updateCornMazeSettings } from './cornMazeSettingsStore';

const SPEEDS: { value: MazeSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export function CornMazeSettings() {
  const settings = useCornMazeSettings();
  return (
    <>
      <fieldset>
        <legend>Pacing</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="corn-maze-speed"
              checked={settings.speed === s.value}
              onChange={() => updateCornMazeSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Runners</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.useAvatars}
            onChange={(e) => updateCornMazeSettings({ useAvatars: e.target.checked })}
          />
          <span>Use participant photos as tokens</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>Sound</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateCornMazeSettings({ sound: e.target.checked })}
          />
          <span>Maze sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateCornMazeSettings({ music: e.target.checked })}
          />
          <span>Maze music</span>
        </label>
      </fieldset>
    </>
  );
}
