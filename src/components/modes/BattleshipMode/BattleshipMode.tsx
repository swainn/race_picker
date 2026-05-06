import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../types';
import {
  placeShipsWithRetry,
  type Ship,
  type ShipSizesMode,
} from './battleshipPlacement';
import {
  applyShot,
  expandShot,
  pickShotCenter,
  rollShotType,
  type RoundState,
} from './battleshipTargeting';
import { BattleshipGrid, type Visibility } from './BattleshipGrid';
import './BattleshipMode.css';

const SETTINGS_KEY = 'gamified_picker_battleship_settings';
const SHOT_INTERVAL_MS = 220;
const BANNER_DURATION_MS = 1500;

interface Settings {
  shipSizes: ShipSizesMode;
  visibility: Visibility;
}

const DEFAULT_SETTINGS: Settings = {
  shipSizes: 'uniform',
  visibility: 'ghosted',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      shipSizes: parsed.shipSizes === 'random' ? 'random' : 'uniform',
      visibility:
        parsed.visibility === 'hidden' || parsed.visibility === 'visible'
          ? parsed.visibility
          : 'ghosted',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

function buildRound(
  entries: ModeViewProps['entries'],
  settings: Settings
): RoundState {
  const { ships, gridSize } = placeShipsWithRetry(
    entries,
    settings.shipSizes,
    Math.random
  );
  return {
    gridSize,
    ships,
    shots: [],
    shotCells: new Set<string>(),
    targetingMode: 'hunt',
    targetQueue: [],
  };
}

export function BattleshipMode(props: ModeViewProps) {
  const {
    entries,
    eliminatedIds,
    isRacing,
    onWinner,
    onStartRace,
    onResetRace,
  } = props;

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [frameKey, setFrameKey] = useState(0);
  const [bannerName, setBannerName] = useState<string | null>(null);
  const [roundSeed, setRoundSeed] = useState(0);
  const [shipsForLegend, setShipsForLegend] = useState<Ship[]>([]);

  const stateRef = useRef<RoundState | null>(null);
  const intervalRef = useRef<number | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const winnerSentRef = useRef<boolean>(false);

  const entryIdsKey = useMemo(
    () => entries.map((e) => e.id).join(','),
    [entries]
  );

  // (Re)build round whenever entries change, ship-sizes setting changes, or roundSeed bumps.
  useEffect(() => {
    if (entries.length < 2) {
      stateRef.current = null;
      setShipsForLegend([]);
      setFrameKey((k) => k + 1);
      return;
    }
    const round = buildRound(entries, settings);
    stateRef.current = round;
    setShipsForLegend(round.ships);
    winnerSentRef.current = false;
    setBannerName(null);
    setFrameKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIdsKey, settings.shipSizes, roundSeed]);

  // Drive the shot loop while isRacing is true.
  useEffect(() => {
    if (!isRacing) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (!stateRef.current) return;
    if (winnerSentRef.current) return;

    intervalRef.current = window.setInterval(() => {
      const state = stateRef.current;
      if (!state) return;
      if (winnerSentRef.current) return;

      const center = pickShotCenter(state, Math.random);
      const type = rollShotType(Math.random);
      const cells = expandShot(center, type, state.gridSize, Math.random);
      const { firstSunkEntryId, result } = applyShot(state, type, center, cells);

      setFrameKey((k) => k + 1);
      // If any ship sunk this tick, refresh the legend (the only place the
      // legend's `sunk` flag matters). Avoids ref-read-during-render.
      if (result.sunkShipIds.length > 0) {
        setShipsForLegend([...state.ships]);
      }

      if (firstSunkEntryId !== null) {
        winnerSentRef.current = true;
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const sunkEntry = entries.find((e) => e.id === firstSunkEntryId);
        if (sunkEntry) {
          setBannerName(sunkEntry.name);
          bannerTimeoutRef.current = window.setTimeout(() => {
            onWinner(sunkEntry);
            setBannerName(null);
          }, BANNER_DURATION_MS);
        }
      }
    }, SHOT_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRacing, entryIdsKey, roundSeed]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (bannerTimeoutRef.current !== null) clearTimeout(bannerTimeoutRef.current);
    };
  }, []);

  // Reset banner / winner-sent flag when the parent clears the race.
  useEffect(() => {
    if (eliminatedIds.length === 0 && !isRacing) {
      setBannerName(null);
      winnerSentRef.current = false;
    }
  }, [eliminatedIds.length, isRacing]);

  const updateSettings = (next: Partial<Settings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      saveSettings(merged);
      return merged;
    });
    setRoundSeed((s) => s + 1);
  };

  return (
    <div className="battleship-mode">
      <div className="race-controls">
        {entries.length >= 2 && !isRacing && (
          <button onClick={onStartRace} className="start-race-button">
            🚢 Open Fire ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <div className="battleship-settings">
        <fieldset>
          <legend>Ship sizes:</legend>
          <label>
            <input
              type="radio"
              name="bs-ship-sizes"
              value="uniform"
              checked={settings.shipSizes === 'uniform'}
              onChange={() => updateSettings({ shipSizes: 'uniform' })}
            />
            Uniform (3)
          </label>
          <label>
            <input
              type="radio"
              name="bs-ship-sizes"
              value="random"
              checked={settings.shipSizes === 'random'}
              onChange={() => updateSettings({ shipSizes: 'random' })}
            />
            Random (2–5)
          </label>
        </fieldset>

        <fieldset>
          <legend>Ship visibility:</legend>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="hidden"
              checked={settings.visibility === 'hidden'}
              onChange={() => updateSettings({ visibility: 'hidden' })}
            />
            Hidden
          </label>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="ghosted"
              checked={settings.visibility === 'ghosted'}
              onChange={() => updateSettings({ visibility: 'ghosted' })}
            />
            Ghosted
          </label>
          <label>
            <input
              type="radio"
              name="bs-visibility"
              value="visible"
              checked={settings.visibility === 'visible'}
              onChange={() => updateSettings({ visibility: 'visible' })}
            />
            Visible
          </label>
        </fieldset>
      </div>

      {entries.length < 2 ? (
        <div className="mode-placeholder">
          🚢 Add at least 2 participants to start a battle.
        </div>
      ) : (
        <BattleshipGrid
          stateRef={stateRef}
          ships={shipsForLegend}
          visibility={settings.visibility}
          bannerName={bannerName}
          frameKey={frameKey}
        />
      )}
    </div>
  );
}
