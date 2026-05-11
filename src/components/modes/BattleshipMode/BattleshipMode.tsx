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
import { BattleshipGrid } from './BattleshipGrid';
import {
  CANNON_CORNERS,
  cannonAnchorPx,
  cellCenterPx,
  pickCannon,
  type CannonCorner,
  type Projectile,
} from './battleshipCannons';
import { useBattleshipSettings } from './battleshipSettingsStore';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { battleshipTheme } from '../themes';
import './BattleshipMode.css';

const SHOT_INTERVAL_MS = 500;
const BANNER_DURATION_MS = 1500;

const CANNON_TRAVEL_MS = 380;
const BROADSIDE_PROJECTILE_GAP_MS = 130;
const DEPTH_CHARGE_TRAVEL_MS = 520;

/** Arc peak height as a fraction of horizontal travel distance.
 *  Cannon and broadside use a low arc (direct-fire feel); depth charge keeps
 *  a high mortar lob. */
const CANNON_PEAK_RATIO = 0.12;
const BROADSIDE_PEAK_RATIO = 0.12;
const DEPTH_CHARGE_PEAK_RATIO = 0.32;

/** How long an impacted projectile stays in the queue so the BattleshipGrid
 *  can render its explosion/splash animation. */
const IMPACT_ANIM_MS = 800;

const MAX_GRID = 640;
const MIN_CELL = 24;
function cellPxFor(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_GRID / gridSize));
}

function buildRound(
  entries: ModeViewProps['entries'],
  settings: { shipSizes: ShipSizesMode }
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
  settings: { shipSizes: ShipSizesMode }
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
  // Active-ship cells need to come back out of shotCells so the AI can fire
  // at them again next round. Water cells (misses) and sunk-ship cells stay
  // in shotCells so they don't get re-targeted.
  const activeShipCells = new Set<string>();
  for (const ship of state.ships) {
    if (!ship.sunk) {
      for (const c of ship.cells) activeShipCells.add(cellKey(c));
    }
  }
  const newShotCells = new Set<string>();
  for (const k of state.shotCells) {
    if (!activeShipCells.has(k)) newShotCells.add(k);
  }
  state.shotCells = newShotCells;
  state.targetingMode = 'hunt';
  state.targetQueue = [];
  // state.shots is left intact so prior rounds' miss splashes keep rendering.
  // The renderer gates hit visuals on committedHitsRef (managed by the
  // caller), so cleared active-ship hits won't draw even though their entries
  // remain in state.shots.
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
    currentWinner,
    onWinner,
    onRaceComplete,
    onStartRace,
    onResetRace,
  } = props;

  const settings = useBattleshipSettings();
  const settingsKey = `${settings.shipSizes}|${settings.visibility}|${settings.persistentLayout}`;
  const lastSettingsKeyRef = useRef(settingsKey);
  const [frameKey, setFrameKey] = useState(0);
  const [banner, setBanner] = useState<
    { kind: 'sunk' | 'final'; name: string } | null
  >(null);
  const [roundSeed, setRoundSeed] = useState(0);
  const [shipsForLegend, setShipsForLegend] = useState<Ship[]>([]);
  /**
   * When non-null, the round is "frozen" — the user has crowned the final
   * winner. The ship belonging to this entryId draws with the gold shining
   * effect, and the round state stays put until Reset Race / participant-list
   * change.
   */
  const [crownedEntryId, setCrownedEntryId] = useState<number | null>(null);
  /** allEntries-id-key at the moment the winner was crowned. Used to detect
   *  participant-list changes that should auto-unfreeze. */
  const crownedAtKeyRef = useRef<string | null>(null);

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
  // entries.length === 1 is the "final round" — we still build (1 ship for the
  // survivor) so the grid can render with the Crown Champion button.
  useEffect(() => {
    // Frozen post-crown: keep the grid untouched until Reset Race or a
    // participant-list change unfreezes us.
    if (crownedEntryId !== null) {
      if (crownedAtKeyRef.current === allEntryIdsKey) {
        return; // stay frozen on the crowned grid
      }
      // Participant list changed — unfreeze and fall through to a fresh build.
      crownedAtKeyRef.current = null;
      setCrownedEntryId(null);
      setBanner(null);
    }

    if (entries.length < 1) {
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
        // Soft reset between rounds: keep ships + prior water-shot history.
        // Mark new eliminations as sunk; clear active-ship hits; restart
        // targeting in hunt. committedMissesRef is intentionally preserved
        // so prior rounds' miss splashes stay on the grid.
        softResetRound(stateRef.current!, eliminatedIds);
        committedHitsRef.current = sunkShipCellKeys(stateRef.current!);
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
    setBanner(null);
    setFrameKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entryIdsKey,
    allEntryIdsKey,
    settings.shipSizes,
    settings.persistentLayout,
    roundSeed,
    crownedEntryId,
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

      // Always drop projectiles whose impact animation has fully decayed,
      // even on frames where nothing new landed.
      const stillNeeded = projectilesRef.current.filter(
        (p) => !p.impacted || now - (p.fireTime + p.travelMs) < IMPACT_ANIM_MS
      );
      if (stillNeeded.length !== projectilesRef.current.length) {
        projectilesRef.current = stillNeeded;
      }

      if (landedAny) {
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
              setBanner({ kind: 'sunk', name: sunkEntry.name });
              bannerTimeoutRef.current = window.setTimeout(() => {
                onWinner(sunkEntry);
                setBanner(null);
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
        peakRatio: number,
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
          arcing: true,
          peakRatio,
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
          CANNON_PEAK_RATIO,
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
            BROADSIDE_PEAK_RATIO,
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
          DEPTH_CHARGE_PEAK_RATIO,
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
      setBanner(null);
      winnerSentRef.current = false;
      pendingWinnerRef.current = null;
      crownedAtKeyRef.current = null;
      setCrownedEntryId(null);
    }
  }, [eliminatedIds.length, isRacing]);

  // Final-round detection: one active participant remains and at least one
  // has been picked. The winner is *not* auto-declared — the user clicks the
  // "Crown Champion" button to record the win + show the gold shining effect.
  const isCrowned = crownedEntryId !== null;
  const isFinalRoundPending =
    !isCrowned && entries.length === 1 && allEntries.length >= 2;
  const survivor = isFinalRoundPending ? entries[0] : null;

  const crownChampion = () => {
    if (!survivor) return;
    crownedAtKeyRef.current = allEntryIdsKey;
    setCrownedEntryId(survivor.id);
    setBanner({ kind: 'final', name: survivor.name });
    setFrameKey((k) => k + 1);
    onWinner(survivor);
  };

  // When settings change (via the global settings modal), reseed the round so
  // the new ship-sizes / visibility take effect on the next layout.
  useEffect(() => {
    if (lastSettingsKeyRef.current !== settingsKey) {
      lastSettingsKeyRef.current = settingsKey;
      setRoundSeed((s) => s + 1);
    }
  }, [settingsKey]);

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
        {isFinalRoundPending && (
          <button onClick={crownChampion} className="crown-champion-button">
            🏆 Crown Champion
          </button>
        )}
        {isCrowned && (
          <button
            onClick={props.onShowFinalStandings}
            className="final-standings-button"
          >
            📊 Show Final Standings
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      {!isCrowned &&
      (entries.length < 1 ||
        (entries.length === 1 && allEntries.length < 2)) ? (
        <div className="mode-placeholder">
          🚢 Add at least 2 participants to start a battle.
        </div>
      ) : (
        <BattleshipGrid
          stateRef={stateRef}
          ships={shipsForLegend}
          gridSize={stateRef.current?.gridSize ?? 10}
          visibility={settings.visibility}
          banner={banner}
          crownedEntryId={crownedEntryId}
          projectilesRef={projectilesRef}
          committedHitsRef={committedHitsRef}
          committedMissesRef={committedMissesRef}
          cannonAnglesRef={cannonAnglesRef}
          frameKey={frameKey}
        />
      )}

      {(() => {
        const winnerEntry = currentWinner
          ? allEntries.find((e) => e.name === currentWinner)
          : null;
        // After the second-to-last ship sinks the WinnerDialog appears with
        // the just-sunk ship; the natural next step is to crown the survivor
        // rather than route through App's auto-pick (which would eliminate
        // the survivor without setting crownedEntryId, and the placeholder
        // would briefly replace the grid).
        const continueCrowns = isFinalRoundPending;
        return (
          <WinnerDialog
            theme={battleshipTheme}
            show={!!currentWinner && !!winnerEntry}
            isFinals={isCrowned && winnerEntry?.id === crownedEntryId}
            winner={{
              name: winnerEntry?.name ?? '',
              imageDataUrl: winnerEntry ? getPreferredEntryImage(winnerEntry) : undefined,
            }}
            headline="🚢 SHIP DOWN 🚢"
            finalsHeadline="🏆 FLEET ADMIRAL 🏆"
            nextLabel={continueCrowns ? '🏆 Crown Champion' : '▶ Continue'}
            onNext={continueCrowns ? crownChampion : onRaceComplete}
            onShowFinalStandings={() => props.onShowFinalStandings?.()}
          />
        );
      })()}
    </div>
  );
}
