import './PokerSettings.css';
import type { PokerPick, PokerSpeed } from './pokerSettingsStore';
import { usePokerSettings, updatePokerSettings } from './pokerSettingsStore';

const SPEEDS: { value: PokerSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const PICKS: { value: PokerPick; label: string; hint: string }[] = [
  { value: 'worst', label: 'Worst hand busts out', hint: 'Last player never busted wins' },
  { value: 'best', label: 'Best hand takes the pot', hint: 'First to win a pot places first' },
];

export function PokerSettings() {
  const settings = usePokerSettings();
  return (
    <>
      <fieldset>
        <legend>The pick is</legend>
        {PICKS.map((p) => (
          <label key={p.value} title={p.hint}>
            <input
              type="radio"
              name="poker-pick"
              checked={settings.pick === p.value}
              onChange={() => updatePokerSettings({ pick: p.value })}
            />
            <span>{p.label}</span>
          </label>
        ))}
        <p className="poker-setting-note">
          {settings.pick === 'worst'
            ? 'Weakest hand at showdown is eliminated; the survivor is champion.'
            : 'Strongest hand at showdown is the pick; the first pot wins outright.'}
          {' '}Switching this mid-session starts a fresh session.
        </p>
      </fieldset>
      <fieldset>
        <legend>Deal speed</legend>
        {SPEEDS.map((s) => (
          <label key={s.value}>
            <input
              type="radio"
              name="poker-speed"
              checked={settings.speed === s.value}
              onChange={() => updatePokerSettings({ speed: s.value })}
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
            onChange={(e) => updatePokerSettings({ sound: e.target.checked })}
          />
          <span>Card and chip sounds</span>
        </label>
      </fieldset>
    </>
  );
}
