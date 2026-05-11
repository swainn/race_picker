import { useBattleshipSettings, updateBattleshipSettings } from './battleshipSettingsStore';

export function BattleshipSettings() {
  const settings = useBattleshipSettings();
  return (
    <>
      <fieldset>
        <legend>Ship sizes</legend>
        <label>
          <input
            type="radio"
            name="bs-ship-sizes"
            value="uniform"
            checked={settings.shipSizes === 'uniform'}
            onChange={() => updateBattleshipSettings({ shipSizes: 'uniform' })}
          />
          Uniform (3)
        </label>
        <label>
          <input
            type="radio"
            name="bs-ship-sizes"
            value="random"
            checked={settings.shipSizes === 'random'}
            onChange={() => updateBattleshipSettings({ shipSizes: 'random' })}
          />
          Random (2–5)
        </label>
      </fieldset>

      <fieldset>
        <legend>Ship visibility</legend>
        <label>
          <input
            type="radio"
            name="bs-visibility"
            value="hidden"
            checked={settings.visibility === 'hidden'}
            onChange={() => updateBattleshipSettings({ visibility: 'hidden' })}
          />
          Hidden
        </label>
        <label>
          <input
            type="radio"
            name="bs-visibility"
            value="ghosted"
            checked={settings.visibility === 'ghosted'}
            onChange={() => updateBattleshipSettings({ visibility: 'ghosted' })}
          />
          Ghosted
        </label>
        <label>
          <input
            type="radio"
            name="bs-visibility"
            value="visible"
            checked={settings.visibility === 'visible'}
            onChange={() => updateBattleshipSettings({ visibility: 'visible' })}
          />
          Visible
        </label>
      </fieldset>

      <fieldset>
        <legend>Persistent layout</legend>
        <label>
          <input
            type="radio"
            name="bs-persistent"
            value="off"
            checked={settings.persistentLayout === 'off'}
            onChange={() => updateBattleshipSettings({ persistentLayout: 'off' })}
          />
          Off
        </label>
        <label>
          <input
            type="radio"
            name="bs-persistent"
            value="on"
            checked={settings.persistentLayout === 'on'}
            onChange={() => updateBattleshipSettings({ persistentLayout: 'on' })}
          />
          On
        </label>
      </fieldset>
    </>
  );
}
