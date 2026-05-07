import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModeViewProps } from '../types';
import {
  cellKey,
  placeShipsWithRetry,
  type Cell,
  type Ship,
  type ShipSizesMode,
} from './battleshipPlacement';
import {
  applyShot,
  expandShot,
  pickShotCenter,
  rollShotType,
  type RoundState,
  type ShotResult,
} from './battleshipTargeting';
import { BattleshipGrid, type Visibility } from './BattleshipGrid';
import {
  CANNON_CORNERS,
  cannonAnchorPx,
  cellCenterPx,
  pickCannon,
  type CannonCorner,
  type Projectile,
} from './battleshipCannons';
import './BattleshipMode.css';

const SETTINGS_KEY = 'gamified_picker_battleship_settings';
const SHOT_INTERVAL_MS = 500;
const BANNER_DURATION_MS = 1500;

const CANNON_TRAVEL_MS = 220;
const BROADSIDE_PROJECTILE_GAP_MS = 100;
const DEPTH_CHARGE_TRAVEL_MS = 450;

const MAX_GRID = 640;
const MIN_CELL = 24;
function cellPxFor(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_GRID / gridSize));
}

type PersistentLayout = 'off' | 'on';

interface Settings {
  shipSizes: ShipSizesMode;
  visibility: Visibility;
  persistentLayout: PersistentLayout;
}

const DEFAULT_SETTINGS: Settings = {
  shipSizes: 'uniform',
  visibility: 'ghosted',
  persistentLayout: 'off',
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
      persistentLayout: parsed.persistentLayout === 'on' ? 'on' : 'off',
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

/**
 * Builds a round with one ship per entry in `allEntries`. Ships whose entryId
 * is in `eliminatedIds` are pre-marked as sunk with all cells in
 * `shotCells`/`shots`. Used for persistent-layout mode.
 */
function buildPersistentRound(
  allEntries: ModeViewProps['allEntries'],
  eliminatedIds: number[],
  settings: Settings
): RoundState {
  const { ships, gridSize } = placeShipsWithRetry(
    allEntries,
    settings.shipSizes,
    Math.random
  );
  const eliminatedSet = new Set(eliminatedIds);
  const shotCells = new Set<string>();
  const sunkCells: Cell[] = [];
  for (const ship of ships) {
    if (eliminatedSet.has(ship.entryId)) {
      ship.sunk = true;
      for (const c of ship.cells) {
        const k = cellKey(c);
        ship.hits.add(k);
        shotCells.add(k);
        sunkCells.push(c);
      }
    }
  }
  const shots: ShotResult[] = [];
  if (sunkCells.length > 0) {
    shots.push({
      type: 'cannon',
      center: { x: 0, y: 0 },
      cells: sunkCells,
      hits: sunkCells,
      misses: [],
      sunkShipIds: ships.filter((s) => s.sunk).map((s) => s.id),
    });
  }
  return {
    gridSize,
    ships,
    shots,
    shotCells,
    targetingMode: 'hunt',
    targetQueue: [],
  };
}

/**
 * Mutates `state` in place to start a fresh round on the same ship layout.
 * Marks any newly-eliminated ships as sunk, clears non-sunk hits, rebuilds
 * shotCells/shots to contain only sunk ships' cells, and resets targeting.
 * Used for persistent-layout mode between rounds.
 */
function softResetRound(state: RoundState, eliminatedIds: number[]): void {
  const eliminatedSet = new Set(eliminatedIds);
  for (const ship of state.ships) {
    if (eliminatedSet.has(ship.entryId)) {
      ship.sunk = true;
      ship.hits = new Set<string>();
      for (const c of ship.cells) ship.hits.add(cellKey(c));
    } else {
      // Active ship: clear any hits accumulated this round so the new round
      // starts visually clean (no leftover red crosses).
      ship.hits = new Set<string>();
      ship.sunk = false;
    }
  }
  const shotCells = new Set<string>();
  const sunkCells: Cell[] = [];
  for (const s of state.ships) {
    if (s.sunk) {
      for (const c of s.cells) {
        shotCells.add(cellKey(c));
        sunkCells.push(c);
      }
    }
  }
  state.shots = sunkCells.length
    ? [
        {
          type: 'cannon',
          center: { x: 0, y: 0 },
          cells: sunkCells,
          hits: sunkCells,
          misses: [],
          sunkShipIds: state.ships.filter((s) => s.sunk).map((s) => s.id),
        },
      ]
    : [];
  state.shotCells = shotCells;
  state.targetingMode = 'hunt';
  state.targetQueue = [];
}

function sunkShipCellKeys(state: RoundState): Set<string> {
  const out = new Set<string>();
  for (const s of state.ships) {
    if (s.sunk) for (const c of s.cells) out.add(cellKey(c));
  }
  return out;
}

function defaultCannonAngles(): Record<CannonCorner, number> {
  // Point each barrel toward the center of the canvas at startup.
  return {
    tl: Math.PI / 4,
    tr: (Math.PI * 3) / 4,
    bl: -Math.PI / 4,
    br: -(Math.PI * 3) / 4,
  };
}

let projectileIdSeq = 1;

export function BattleshipMode(props: ModeViewProps) {
  const {
    entries,
    allEntries,
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
  const sweepRafRef = useRef<number | null>(null);

  const projectilesRef = useRef<Projectile[]>([]);
  const committedHitsRef = useRef<Set<string>>(new Set());
  const committedMissesRef = useRef<Set<string>>(new Set());
  const cannonAnglesRef = useRef<Record<CannonCorner, number>>(
    defaultCannonAngles()
  );
  const pendingWinnerRef = useRef<{
    entryId: number;
    name: string;
  } | null>(null);
  /** allEntries-id-key at the time persistent placements were last built. */
  const lastPersistentBuildKeyRef = useRef<string | null>(null);

  const entryIdsKey = useMemo(
    () => entries.map((e) => e.id).join(','),
    [entries]
  );
  const allEntryIdsKey = useMemo(
    () => allEntries.map((e) => e.id).join(','),
    [allEntries]
  );

  // Build / rebuild round. Branches on persistentLayout setting.
  useEffect(() => {
    if (entries.length < 2) {
      stateRef.current = null;
      lastPersistentBuildKeyRef.current = null;
      setShipsForLegend([]);
      projectilesRef.current = [];
      committedHitsRef.current = new Set();
      committedMissesRef.current = new Set();
      cannonAnglesRef.current = defaultCannonAngles();
      pendingWinnerRef.current = null;
      setFrameKey((k) => k + 1);
      return;
    }

    if (settings.persistentLayout === 'on') {
      const haveBuiltForThisGame =
        stateRef.current !== null &&
        lastPersistentBuildKeyRef.current === allEntryIdsKey;
      if (haveBuiltForThisGame) {
        // Soft reset between rounds: keep ships, mark new eliminations as
        // sunk, clear non-sunk hit/miss state, restart targeting in hunt.
        softResetRound(stateRef.current!, eliminatedIds);
        committedHitsRef.current = sunkShipCellKeys(stateRef.current!);
        committedMissesRef.current = new Set();
      } else {
        // Full rebuild for the current allEntries set.
        const round = buildPersistentRound(allEntries, eliminatedIds, settings);
        stateRef.current = round;
        lastPersistentBuildKeyRef.current = allEntryIdsKey;
        committedHitsRef.current = sunkShipCellKeys(round);
        committedMissesRef.current = new Set();
      }
    } else {
      // Non-persistent: rebuild ships every round from active entries.
      const round = buildRound(entries, settings);
      stateRef.current = round;
      lastPersistentBuildKeyRef.current = null;
      committedHitsRef.current = new Set();
      committedMissesRef.current = new Set();
    }

    setShipsForLegend(stateRef.current?.ships ?? []);
    projectilesRef.current = [];
    cannonAnglesRef.current = defaultCannonAngles();
    pendingWinnerRef.current = null;
    winnerSentRef.current = false;
    setBannerName(null);
    setFrameKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entryIdsKey,
    allEntryIdsKey,
    settings.shipSizes,
    settings.persistentLayout,
    roundSeed,
  ]);

  // Sweep loop: drives a rAF that watches in-flight projectiles and commits
  // their impact effects when each lands. Runs only while projectiles exist.
  useEffect(() => {
    let cancelled = false;

    const sweep = () => {
      if (cancelled) return;
      const now = performance.now();
      let landedAny = false;
      let landedSinkEntryId: number | null = null;

      for (const p of projectilesRef.current) {
        if (p.impacted) continue;
        if (now >= p.fireTime + p.travelMs) {
          p.impacted = true;
          for (const h of p.hitsRevealOnImpact) {
            committedHitsRef.current.add(cellKey(h));
          }
          for (const m of p.missesRevealOnImpact) {
            committedMissesRef.current.add(cellKey(m));
          }
          if (p.sinksEntryId !== null) {
            landedSinkEntryId = p.sinksEntryId;
          }
          landedAny = true;
        }
      }

      if (landedAny) {
        // Drop fully-impacted projectiles whose tail has decayed (after a
        // short grace period the visuals are no longer needed).
        const stillNeeded = projectilesRef.current.filter(
          (p) => !p.impacted || now - (p.fireTime + p.travelMs) < 50
        );
        if (stillNeeded.length !== projectilesRef.current.length) {
          projectilesRef.current = stillNeeded;
        }
        // If a ship was sunk this frame, refresh the legend & start banner.
        if (landedSinkEntryId !== null) {
          const state = stateRef.current;
          if (state) setShipsForLegend([...state.ships]);
          const pending = pendingWinnerRef.current;
          if (
            pending &&
            pending.entryId === landedSinkEntryId &&
            !winnerSentRef.current
          ) {
            winnerSentRef.current = true;
            const sunkEntry = entries.find((e) => e.id === pending.entryId);
            if (sunkEntry) {
              setBannerName(sunkEntry.name);
              bannerTimeoutRef.current = window.setTimeout(() => {
                onWinner(sunkEntry);
                setBannerName(null);
              }, BANNER_DURATION_MS);
            }
          }
        }
        setFrameKey((k) => k + 1);
      }

      if (projectilesRef.current.length > 0) {
        sweepRafRef.current = requestAnimationFrame(sweep);
      } else {
        sweepRafRef.current = null;
      }
    };

    if (projectilesRef.current.length > 0) {
      sweepRafRef.current = requestAnimationFrame(sweep);
    }

    return () => {
      cancelled = true;
      if (sweepRafRef.current !== null) {
        cancelAnimationFrame(sweepRafRef.current);
        sweepRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, entryIdsKey, roundSeed]);

  // Shot loop: ticks every SHOT_INTERVAL_MS while isRacing. Spawns projectiles
  // (does NOT directly commit impact effects — the sweep loop does that on
  // landing).
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
      // Stop firing once a winner has been queued (waiting for landing).
      if (pendingWinnerRef.current !== null) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const center = pickShotCenter(state, Math.random);
      const type = rollShotType(Math.random);
      const cells = expandShot(center, type, state.gridSize, Math.random);
      const { firstSunkEntryId } = applyShot(state, type, center, cells);

      // Compute per-cell hit/miss split *as it actually was applied*. applyShot
      // ignored cells that were already in shotCells; we mirror that here.
      const newlyResolved = state.shots[state.shots.length - 1];
      const hits = newlyResolved?.hits ?? [];
      const misses = newlyResolved?.misses ?? [];

      // Pick the firing cannon (uniformly random across the 4 corners).
      const corner = pickCannon(Math.random);
      const cell = cellPxFor(state.gridSize);
      const canvasDim = state.gridSize * cell + 60 * 2; // CANNON_PAD * 2
      const anchor = cannonAnchorPx(corner, canvasDim, canvasDim);

      // Aim the firing cannon at the target cell (snap-aim for v1).
      const centerPx = cellCenterPx(center, cell);
      const targetAngle = Math.atan2(
        centerPx.y - anchor.y,
        centerPx.x - anchor.x
      );
      cannonAnglesRef.current = {
        ...cannonAnglesRef.current,
        [corner]: targetAngle,
      };

      const now = performance.now();

      const spawnProjectile = (
        targetCell: Cell,
        offsetMs: number,
        travelMs: number,
        arcing: boolean,
        cellHits: Cell[],
        cellMisses: Cell[],
        sinksEntryId: number | null
      ) => {
        const toPx = cellCenterPx(targetCell, cell);
        const p: Projectile = {
          id: projectileIdSeq++,
          corner,
          fromPx: anchor,
          toPx,
          toCell: targetCell,
          fireTime: now + offsetMs,
          travelMs,
          arcing,
          type,
          hitsRevealOnImpact: cellHits,
          missesRevealOnImpact: cellMisses,
          sinksEntryId,
          impacted: false,
        };
        projectilesRef.current = [...projectilesRef.current, p];
      };

      if (type === 'cannon') {
        // Single projectile — center cell is the only cell.
        spawnProjectile(
          center,
          0,
          CANNON_TRAVEL_MS,
          false,
          hits,
          misses,
          firstSunkEntryId
        );
      } else if (type === 'broadside') {
        // 3 projectiles, one per cell in the line, fired sequentially. Each
        // projectile reveals only its own cell's hit/miss when it lands. The
        // sink (if any) attaches to the last projectile.
        const orderedCells = newlyResolved?.cells ?? [];
        const cellsToReveal = orderedCells;
        for (let i = 0; i < cellsToReveal.length; i++) {
          const c = cellsToReveal[i];
          const cellHits = hits.filter((h) => h.x === c.x && h.y === c.y);
          const cellMisses = misses.filter((m) => m.x === c.x && m.y === c.y);
          const isLast = i === cellsToReveal.length - 1;
          spawnProjectile(
            c,
            i * BROADSIDE_PROJECTILE_GAP_MS,
            CANNON_TRAVEL_MS,
            false,
            cellHits,
            cellMisses,
            isLast ? firstSunkEntryId : null
          );
        }
      } else {
        // Depth charge: single arcing projectile that resolves all cells when
        // it lands.
        spawnProjectile(
          center,
          0,
          DEPTH_CHARGE_TRAVEL_MS,
          true,
          hits,
          misses,
          firstSunkEntryId
        );
      }

      // Queue the pending winner so the banner waits for landing.
      if (firstSunkEntryId !== null) {
        const sunkEntry = entries.find((e) => e.id === firstSunkEntryId);
        if (sunkEntry) {
          pendingWinnerRef.current = {
            entryId: sunkEntry.id,
            name: sunkEntry.name,
          };
        }
      }

      setFrameKey((k) => k + 1);
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
      if (bannerTimeoutRef.current !== null)
        clearTimeout(bannerTimeoutRef.current);
      if (sweepRafRef.current !== null) cancelAnimationFrame(sweepRafRef.current);
    };
  }, []);

  // Reset banner / winner-sent flag when the parent clears the race.
  useEffect(() => {
    if (eliminatedIds.length === 0 && !isRacing) {
      setBannerName(null);
      winnerSentRef.current = false;
      pendingWinnerRef.current = null;
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

  // Reference unused helpers/types so the compiler doesn't complain about
  // imports that exist solely for the rendering path inside the grid.
  void CANNON_CORNERS;

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

        <fieldset>
          <legend>Persistent layout:</legend>
          <label>
            <input
              type="radio"
              name="bs-persistent"
              value="off"
              checked={settings.persistentLayout === 'off'}
              onChange={() => updateSettings({ persistentLayout: 'off' })}
            />
            Off
          </label>
          <label>
            <input
              type="radio"
              name="bs-persistent"
              value="on"
              checked={settings.persistentLayout === 'on'}
              onChange={() => updateSettings({ persistentLayout: 'on' })}
            />
            On
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
          projectilesRef={projectilesRef}
          committedHitsRef={committedHitsRef}
          committedMissesRef={committedMissesRef}
          cannonAnglesRef={cannonAnglesRef}
          frameKey={frameKey}
        />
      )}
    </div>
  );
}
