import { useKungFuSettings, updateKungFuSettings } from './kungFuSettingsStore';

export function KungFuSettings() {
  const settings = useKungFuSettings();
  return (
    <fieldset>
      <legend>Platform</legend>
      <label>
        <input
          type="checkbox"
          checked={settings.shrinkPlatform}
          onChange={(e) => updateKungFuSettings({ shrinkPlatform: e.target.checked })}
        />
        <span>Shrink the platform over time (sudden death)</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.specialMoves}
          onChange={(e) => updateKungFuSettings({ specialMoves: e.target.checked })}
        />
        <span>Street Fighter specials (super meter)</span>
      </label>
    </fieldset>
  );
}
