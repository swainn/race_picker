import {
  ALIEN_ABDUCTION_SUB_MODES,
  FINALE_MODES,
  HAZARD_MODES,
  LOCATION_MODES,
  setAlienAbductionFinale,
  setAlienAbductionHazards,
  setAlienAbductionLocation,
  setAlienAbductionMusic,
  setAlienAbductionSound,
  setAlienAbductionSubMode,
  useAlienAbductionSettings,
} from './alienAbductionSettingsStore';

export function AlienAbductionSettings() {
  const { subMode, hazards, location, finale, sound, music } = useAlienAbductionSettings();
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
        <legend>Location</legend>
        <div role="radiogroup" aria-label="Alien abduction location">
          {LOCATION_MODES.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                name="alienAbductionLocation"
                value={m.value}
                checked={location === m.value}
                onChange={() => setAlienAbductionLocation(m.value)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Weather</legend>
        <div role="radiogroup" aria-label="Alien abduction weather">
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

      <fieldset>
        <legend>Ending</legend>
        <div role="radiogroup" aria-label="Alien abduction ending">
          {FINALE_MODES.map((m) => (
            <label key={m.value}>
              <input
                type="radio"
                name="alienAbductionFinale"
                value={m.value}
                checked={finale === m.value}
                onChange={() => setAlienAbductionFinale(m.value)}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Sound</legend>
        <label>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => setAlienAbductionSound(e.target.checked)}
          />
          <span>Saucer sound effects</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={music}
            onChange={(e) => setAlienAbductionMusic(e.target.checked)}
          />
          <span>Night-sky soundtrack</span>
        </label>
      </fieldset>
    </>
  );
}
