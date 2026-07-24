import { useSpaceSettings, updateSpaceSettings } from './spaceSettingsStore';
import { SpeedFieldset } from './SpeedFieldset';

export function InvadersSettings() {
  const settings = useSpaceSettings();
  return (
    <>
      <SpeedFieldset />
      <fieldset>
        <legend>Invasion</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.suddenDeath}
            onChange={(e) => updateSpaceSettings({ suddenDeath: e.target.checked })}
          />
          <span>Sudden death (formation dives in fast)</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.invadersShootBack}
            onChange={(e) => updateSpaceSettings({ invadersShootBack: e.target.checked })}
          />
          <span>Invaders shoot back (cosmetic)</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.powerUps}
            onChange={(e) => updateSpaceSettings({ powerUps: e.target.checked })}
          />
          <span>Random powers &amp; protections (theatrical — the pick stays fair)</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateSpaceSettings({ sound: e.target.checked })}
          />
          <span>Arcade sound effects</span>
        </label>
      </fieldset>
    </>
  );
}
