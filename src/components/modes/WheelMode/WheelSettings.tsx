import { SOUND_OPTIONS, type SoundType } from './audio';
import { useWheelSettings, setWheelSoundType, setWheelMuted } from './wheelSettingsStore';

export function WheelSettings() {
  const { soundType, muted } = useWheelSettings();
  return (
    <fieldset>
      <legend>Sound</legend>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        <span>Tick sound</span>
        <select
          value={soundType}
          onChange={(e) => setWheelSoundType(e.target.value as SoundType)}
        >
          {SOUND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={muted}
          onChange={(e) => setWheelMuted(e.target.checked)}
        />
        <span>{muted ? '🔇 Muted' : '🔊 Unmuted'}</span>
      </label>
    </fieldset>
  );
}
