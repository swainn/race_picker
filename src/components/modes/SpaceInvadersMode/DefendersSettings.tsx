import { useSpaceSettings, updateSpaceSettings } from './spaceSettingsStore';
import { SpeedFieldset } from './SpeedFieldset';

export function DefendersSettings() {
  const settings = useSpaceSettings();
  return (
    <>
      <SpeedFieldset />
      <fieldset>
        <legend>Defense</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.suddenDeath}
            onChange={(e) => updateSpaceSettings({ suddenDeath: e.target.checked })}
          />
          <span>Sudden death (horde dives in fast)</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.defenderShields}
            onChange={(e) => updateSpaceSettings({ defenderShields: e.target.checked })}
          />
          <span>Shield bunkers (cosmetic)</span>
        </label>
      </fieldset>
    </>
  );
}
