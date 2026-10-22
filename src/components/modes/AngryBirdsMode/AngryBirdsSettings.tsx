import {
  ANGRY_BIRDS_FACES,
  ANGRY_BIRDS_RESOLVES,
  ANGRY_BIRDS_SPEEDS,
  ANGRY_BIRDS_SUB_MODES,
  updateAngryBirdsSettings,
  useAngryBirdsSettings,
} from './angryBirdsSettingsStore';

export function AngryBirdsSettings() {
  const settings = useAngryBirdsSettings();
  return (
    <>
      <fieldset>
        <legend>Who plays</legend>
        {ANGRY_BIRDS_SUB_MODES.map((m) => (
          <label key={m.value}>
            <input
              type="radio"
              name="angry-birds-sub-mode"
              checked={settings.subMode === m.value}
              onChange={() => updateAngryBirdsSettings({ subMode: m.value })}
            />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>How the pick is decided</legend>
        {ANGRY_BIRDS_RESOLVES.map((r) => (
          <label key={r.value}>
            <input
              type="radio"
              name="angry-birds-resolve"
              checked={settings.resolve === r.value}
              onChange={() => updateAngryBirdsSettings({ resolve: r.value })}
            />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Pig faces</legend>
        {ANGRY_BIRDS_FACES.map((f) => (
          <label key={f.value}>
            <input
              type="radio"
              name="angry-birds-face"
              checked={settings.face === f.value}
              onChange={() => updateAngryBirdsSettings({ face: f.value })}
            />
            <span>{f.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Pace</legend>
        {ANGRY_BIRDS_SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="angry-birds-speed"
              checked={settings.speed === s.value}
              onChange={() => updateAngryBirdsSettings({ speed: s.value })}
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
            onChange={(e) => updateAngryBirdsSettings({ sound: e.target.checked })}
          />
          <span>Slingshot and splinter effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateAngryBirdsSettings({ music: e.target.checked })}
          />
          <span>Marching theme</span>
        </label>
      </fieldset>
    </>
  );
}
