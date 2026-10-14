import type { WhacDensity, WhacSpeed } from './whacAMoleSettingsStore';
import { useWhacAMoleSettings, updateWhacAMoleSettings } from './whacAMoleSettingsStore';

const SPEEDS: { value: WhacSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const DENSITIES: { value: WhacDensity; label: string }[] = [
  { value: 'sparse', label: 'Sparse' },
  { value: 'normal', label: 'Normal' },
  { value: 'busy', label: 'Busy' },
];

export function WhacAMoleSettings() {
  const settings = useWhacAMoleSettings();
  return (
    <>
      <fieldset>
        <legend>Mallet speed</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="whac-a-mole-speed"
              checked={settings.speed === s.value}
              onChange={() => updateWhacAMoleSettings({ speed: s.value })}
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Decoy moles</legend>
        {DENSITIES.map((d) => (
          <label key={d.value}>
            <input
              type="radio"
              name="whac-a-mole-density"
              checked={settings.density === d.value}
              onChange={() => updateWhacAMoleSettings({ density: d.value })}
            />
            <span>{d.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Sound</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateWhacAMoleSettings({ sound: e.target.checked })}
          />
          <span>Fairground sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => updateWhacAMoleSettings({ music: e.target.checked })}
          />
          <span>Carnival tune</span>
        </label>
      </fieldset>
    </>
  );
}
