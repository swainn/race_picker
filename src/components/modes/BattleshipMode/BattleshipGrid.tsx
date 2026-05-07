import { useEffect, useRef } from 'react';
import type { Ship } from './battleshipPlacement';
import { cellKey } from './battleshipPlacement';
import type { RoundState, ShotResult } from './battleshipTargeting';
import {
  ARC_PROJECTILE_RADIUS,
  CANNON_BARREL_LEN,
  CANNON_BARREL_WIDTH,
  CANNON_BASE_RADIUS,
  CANNON_CORNERS,
  CANNON_PAD,
  MUZZLE_FLASH_MS,
  MUZZLE_FLASH_RADIUS,
  PROJECTILE_RADIUS,
  cannonAnchorPx,
  cannonBarrelTipPx,
  projectilePosition,
  type CannonCorner,
  type Projectile,
} from './battleshipCannons';
import './BattleshipGrid.css';

export type Visibility = 'hidden' | 'ghosted' | 'visible';

interface Props {
  stateRef: React.MutableRefObject<RoundState | null>;
  /** Snapshot of ships for the legend (avoids reading stateRef during render). */
  ships: Ship[];
  visibility: Visibility;
  banner: { kind: 'sunk' | 'final'; name: string } | null;
  /**
   * If set, the ship belonging to this entry is drawn with a pulsing golden
   * highlight. Used for the final-round survivor reveal.
   */
  highlightEntryId: number | null;
  /** Live array of in-flight projectiles. The component reads it on every rAF tick. */
  projectilesRef: React.MutableRefObject<Projectile[]>;
  /** Cells whose impact effect is allowed to render (projectile already landed). */
  committedHitsRef: React.MutableRefObject<Set<string>>;
  committedMissesRef: React.MutableRefObject<Set<string>>;
  /** Last-aimed angle per cannon (radians). Used to point the barrel between shots. */
  cannonAnglesRef: React.MutableRefObject<Record<CannonCorner, number>>;
  /** Bumped by the wrapper after each shot to trigger a redraw + rAF resume. */
  frameKey: number;
}

const MAX_GRID = 640;
const MIN_CELL = 24;

function cellPx(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_GRID / gridSize));
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  gridSize: number,
  cell: number
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  ctx.fillStyle = '#0a2540';
  ctx.fillRect(ox, oy, gridSize * cell, gridSize * cell);
  ctx.strokeStyle = '#143a66';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + i * cell, oy);
    ctx.lineTo(ox + i * cell, oy + gridSize * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy + i * cell);
    ctx.lineTo(ox + gridSize * cell, oy + i * cell);
    ctx.stroke();
  }
}

function drawShipBody(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  alpha: number,
  fillColor: string
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;
  for (const c of ship.cells) {
    ctx.fillRect(ox + c.x * cell + 2, oy + c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  ctx.strokeStyle = ship.color;
  ctx.lineWidth = 2;
  for (const c of ship.cells) {
    ctx.strokeRect(ox + c.x * cell + 2, oy + c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}

function shipFullyCommitted(ship: Ship, committedHits: Set<string>): boolean {
  return ship.cells.every((c) => committedHits.has(cellKey(c)));
}

function drawShips(
  ctx: CanvasRenderingContext2D,
  ships: Ship[],
  cell: number,
  visibility: Visibility,
  committedHits: Set<string>
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  for (const ship of ships) {
    const sunkVisible = ship.sunk && shipFullyCommitted(ship, committedHits);
    if (sunkVisible) {
      drawShipBody(ctx, ship, cell, 0.85, ship.color);
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      for (const c of ship.cells) {
        ctx.beginPath();
        ctx.moveTo(ox + c.x * cell + 4, oy + c.y * cell + 4);
        ctx.lineTo(ox + (c.x + 1) * cell - 4, oy + (c.y + 1) * cell - 4);
        ctx.moveTo(ox + (c.x + 1) * cell - 4, oy + c.y * cell + 4);
        ctx.lineTo(ox + c.x * cell + 4, oy + (c.y + 1) * cell - 4);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (visibility === 'visible') {
      drawShipBody(ctx, ship, cell, 0.9, ship.color);
    } else if (visibility === 'ghosted') {
      drawShipBody(ctx, ship, cell, 0.25, ship.color);
    }
  }
}

function drawShots(
  ctx: CanvasRenderingContext2D,
  shots: ShotResult[],
  ships: Ship[],
  cell: number,
  visibility: Visibility,
  committedHits: Set<string>,
  committedMisses: Set<string>
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  for (const shot of shots) {
    for (const c of shot.misses) {
      if (!committedMisses.has(cellKey(c))) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(
        ox + c.x * cell + cell / 2,
        oy + c.y * cell + cell / 2,
        cell * 0.18,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
    for (const c of shot.hits) {
      if (!committedHits.has(cellKey(c))) continue;
      if (visibility === 'hidden') {
        const ship = ships.find((s) =>
          s.cells.some((sc) => sc.x === c.x && sc.y === c.y)
        );
        if (ship) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = ship.color;
          ctx.fillRect(
            ox + c.x * cell + 2,
            oy + c.y * cell + 2,
            cell - 4,
            cell - 4
          );
          ctx.restore();
        }
      }
      ctx.save();
      ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.beginPath();
      ctx.arc(
        ox + c.x * cell + cell / 2,
        oy + c.y * cell + cell / 2,
        cell * 0.32,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const cx = ox + c.x * cell + cell / 2;
      const cy = oy + c.y * cell + cell / 2;
      const r = cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawCannons(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  angles: Record<CannonCorner, number>
) {
  for (const corner of CANNON_CORNERS) {
    const anchor = cannonAnchorPx(corner, canvasW, canvasH);
    const angle = angles[corner];
    // Barrel
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, -CANNON_BARREL_WIDTH / 2, CANNON_BARREL_LEN, CANNON_BARREL_WIDTH);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, -CANNON_BARREL_WIDTH / 2, CANNON_BARREL_LEN, CANNON_BARREL_WIDTH);
    ctx.restore();
    // Base
    ctx.save();
    const baseGrad = ctx.createRadialGradient(
      anchor.x,
      anchor.y,
      2,
      anchor.x,
      anchor.y,
      CANNON_BASE_RADIUS
    );
    baseGrad.addColorStop(0, '#5a5a5a');
    baseGrad.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, CANNON_BASE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawHighlightRing(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  now: number
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  // Pulse oscillates between 0..1 every ~1.5s.
  const phase = (now / 1500) * Math.PI * 2;
  const pulse = (Math.sin(phase) + 1) / 2;
  const haloAlpha = 0.45 + pulse * 0.45;
  const glowExtent = 6 + pulse * 6;

  // Outer glow halo around each ship cell.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 220, 90, 0.95)';
  ctx.shadowBlur = 18 + pulse * 12;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255, 215, 80, ${haloAlpha})`;
  for (const c of ship.cells) {
    ctx.strokeRect(
      ox + c.x * cell + 1 - glowExtent / 6,
      oy + c.y * cell + 1 - glowExtent / 6,
      cell - 2 + glowExtent / 3,
      cell - 2 + glowExtent / 3
    );
  }
  ctx.restore();

  // Inner shimmer fill.
  ctx.save();
  ctx.fillStyle = `rgba(255, 235, 150, ${0.15 + pulse * 0.2})`;
  for (const c of ship.cells) {
    ctx.fillRect(ox + c.x * cell + 3, oy + c.y * cell + 3, cell - 6, cell - 6);
  }
  ctx.restore();

  // Bright outline that pulses width.
  ctx.save();
  ctx.strokeStyle = `rgba(255, 245, 200, ${0.7 + pulse * 0.3})`;
  ctx.lineWidth = 2 + pulse * 1.5;
  for (const c of ship.cells) {
    ctx.strokeRect(ox + c.x * cell + 2, oy + c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}

function drawSmokePuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageMs: number,
  lifeMs: number
) {
  const t = Math.min(1, ageMs / lifeMs);
  const radius = 3 + t * 8;
  const alpha = (1 - t) * 0.55;
  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(x, y, 1, x, y, radius);
  grad.addColorStop(0, 'rgba(245, 245, 245, 0.9)');
  grad.addColorStop(0.7, 'rgba(200, 200, 200, 0.4)');
  grad.addColorStop(1, 'rgba(180, 180, 180, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTracerProjectile(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  velocityUnit: { x: number; y: number },
  tailLen: number
) {
  // Tail gradient: hot-yellow at projectile end, fading to transparent.
  ctx.save();
  const tailEnd = {
    x: pos.x - velocityUnit.x * tailLen,
    y: pos.y - velocityUnit.y * tailLen,
  };
  const grad = ctx.createLinearGradient(pos.x, pos.y, tailEnd.x, tailEnd.y);
  grad.addColorStop(0, 'rgba(255, 230, 140, 0.95)');
  grad.addColorStop(0.4, 'rgba(255, 170, 50, 0.7)');
  grad.addColorStop(1, 'rgba(255, 110, 30, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailEnd.x, tailEnd.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.restore();

  // Glow halo around the projectile head.
  ctx.save();
  const halo = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 12);
  halo.addColorStop(0, 'rgba(255, 240, 180, 0.85)');
  halo.addColorStop(1, 'rgba(255, 200, 80, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // White-hot core.
  ctx.save();
  ctx.fillStyle = '#fff8d4';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  canvasW: number,
  canvasH: number,
  now: number
) {
  for (const p of projectiles) {
    if (p.impacted) continue;
    const pos = projectilePosition(p, now);

    // Muzzle flash for the brief window after fire.
    const sinceFire = now - p.fireTime;
    if (sinceFire >= 0 && sinceFire < MUZZLE_FLASH_MS) {
      const anchor = cannonAnchorPx(p.corner, canvasW, canvasH);
      const tip = cannonBarrelTipPx(
        anchor,
        Math.atan2(p.toPx.y - anchor.y, p.toPx.x - anchor.x)
      );
      const flashAlpha = 1 - sinceFire / MUZZLE_FLASH_MS;
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      const grad = ctx.createRadialGradient(
        tip.x,
        tip.y,
        2,
        tip.x,
        tip.y,
        MUZZLE_FLASH_RADIUS
      );
      grad.addColorStop(0, '#fffbe0');
      grad.addColorStop(0.5, '#ffaa33');
      grad.addColorStop(1, 'rgba(255, 170, 51, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, MUZZLE_FLASH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Direction unit vector (chord). For arcing projectiles this is just the
    // chord, used only for tail orientation; we approximate by sampling a
    // recent position along the arc.
    let velocityUnit = { x: 0, y: 0 };
    if (p.arcing) {
      const earlier = projectilePosition(
        p,
        Math.max(p.fireTime, now - 30)
      );
      const dx = pos.x - earlier.x;
      const dy = pos.y - earlier.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) velocityUnit = { x: dx / len, y: dy / len };
    } else {
      const dx = p.toPx.x - p.fromPx.x;
      const dy = p.toPx.y - p.fromPx.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) velocityUnit = { x: dx / len, y: dy / len };
    }

    if (p.arcing) {
      // Smoke puffs along the path: emit one every ~25 ms of flight.
      const PUFF_INTERVAL_MS = 25;
      const PUFF_LIFE_MS = 700;
      const tNow = Math.min(1, (now - p.fireTime) / p.travelMs);
      const flightSoFarMs = tNow * p.travelMs;
      const puffCount = Math.floor(flightSoFarMs / PUFF_INTERVAL_MS);
      for (let i = 0; i <= puffCount; i++) {
        const emitMs = i * PUFF_INTERVAL_MS;
        const ageMs = flightSoFarMs - emitMs;
        if (ageMs > PUFF_LIFE_MS) continue;
        const sample = projectilePosition(p, p.fireTime + emitMs);
        drawSmokePuff(ctx, sample.x, sample.y, ageMs, PUFF_LIFE_MS);
      }
      // Larger glow + cream-white shell for the arcing round.
      ctx.save();
      const halo = ctx.createRadialGradient(
        pos.x,
        pos.y,
        1,
        pos.x,
        pos.y,
        16
      );
      halo.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
      halo.addColorStop(1, 'rgba(255, 200, 80, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#fff4c2';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, ARC_PROJECTILE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cc7a18';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else {
      drawTracerProjectile(ctx, pos, velocityUnit, 32);
    }
  }
}

export function BattleshipGrid({
  stateRef,
  ships,
  visibility,
  banner,
  highlightEntryId,
  projectilesRef,
  committedHitsRef,
  committedMissesRef,
  cannonAnglesRef,
  frameKey,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Single-frame draw helper used by both rAF loop and frameKey effect.
  const drawAll = (now: number) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const cell = cellPx(state.gridSize);
    const dim = state.gridSize * cell + CANNON_PAD * 2;
    if (canvas.width !== dim) canvas.width = dim;
    if (canvas.height !== dim) canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background outside the grid (so cannons sit on a slightly darker frame).
    ctx.fillStyle = '#06192e';
    ctx.fillRect(0, 0, dim, dim);

    drawGrid(ctx, state.gridSize, cell);
    drawShips(ctx, state.ships, cell, visibility, committedHitsRef.current);
    drawShots(
      ctx,
      state.shots,
      state.ships,
      cell,
      visibility,
      committedHitsRef.current,
      committedMissesRef.current
    );
    drawCannons(ctx, dim, dim, cannonAnglesRef.current);
    drawProjectiles(ctx, projectilesRef.current, dim, dim, now);

    // Final-round survivor highlight — draw on top so the glow reads clearly.
    if (highlightEntryId !== null) {
      const highlightShip = state.ships.find(
        (s) => s.entryId === highlightEntryId && !s.sunk
      );
      if (highlightShip) {
        drawHighlightRing(ctx, highlightShip, cell, now);
      }
    }
  };

  // Drive an rAF loop while there are in-flight projectiles. The loop
  // re-schedules itself, doing a fresh draw each frame; once the queue is
  // empty it stops. frameKey bumps re-trigger via the effect below.
  useEffect(() => {
    let cancelled = false;

    const shouldKeepAnimating = () =>
      projectilesRef.current.some((p) => !p.impacted) ||
      highlightEntryId !== null;

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      drawAll(now);
      if (shouldKeepAnimating()) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    drawAll(performance.now());
    if (shouldKeepAnimating()) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, visibility, highlightEntryId]);

  return (
    <div className="battleship-grid-wrap">
      <div className="battleship-canvas-host">
        <canvas ref={canvasRef} className="battleship-canvas" />
        {banner && banner.kind === 'sunk' && (
          <div className="battleship-banner">💥 {banner.name} sunk! 💥</div>
        )}
        {banner && banner.kind === 'final' && (
          <div className="battleship-banner battleship-banner-final">
            🏆 Last ship standing — {banner.name}! 🏆
          </div>
        )}
      </div>
      <div className="battleship-legend">
        {ships.map((s: Ship) => (
          <span
            key={s.id}
            className={`battleship-legend-chip${s.sunk ? ' sunk' : ''}`}
          >
            <span
              className="battleship-legend-swatch"
              style={{ background: s.color }}
            />
            {s.entryName}
          </span>
        ))}
      </div>
    </div>
  );
}
