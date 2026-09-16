import {
  ALIEN_ABDUCTION_SUB_MODES,
  HAZARD_MODES,
  setAlienAbductionHazards,
  setAlienAbductionSubMode,
  useAlienAbductionSettings,
} from './alienAbductionSettingsStore';

export function AlienAbductionSettings() {
  const { subMode, hazards } = useAlienAbductionSettings();
  return (
    <>
      <fieldset>
        <legend>Abductees</legend>
        <div role="radiogroup" aria-label="Alien abduction abductee">
          {ALIEN_ABDUCTION_SUB_MODES.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                name="alienAbductionSubMode"
                value={m.value}
                checked={subMode === m.value}
                onChange={() => setAlienAbductionSubMode(m.value)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Weather</legend>
        <div role="radiogroup" aria-label="Alien abduction wind">
          {HAZARD_MODES.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                name="alienAbductionHazards"
                value={m.value}
                checked={hazards === m.value}
                onChange={() => setAlienAbductionHazards(m.value)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
