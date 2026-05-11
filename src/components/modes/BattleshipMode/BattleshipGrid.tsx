import { useEffect, useRef } from 'react';
import type { Ship } from './battleshipPlacement';
import { cellKey } from './battleshipPlacement';
import type { RoundState, ShotResult, ShotType } from './battleshipTargeting';
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
  /** Grid size of the current round. Used by the label overlay. */
  gridSize: number;
  visibility: Visibility;
  banner: { kind: 'sunk' | 'final'; name: string } | null;
  /**
   * If set, the ship belonging to this entry is drawn with the gold-shining
   * "crowned champion" effect. Used after the user clicks Crown Champion.
   */
  crownedEntryId: number | null;
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

const IMPACT_ANIM_MS = 800;
const SPLASH_ANIM_MS = 600;
const ANNOTATION_ANIM_MS = 1000;

function cellPxFor(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_GRID / gridSize));
}

interface ShipBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  isHorizontal: boolean;
}

function shipBounds(ship: Ship, cell: number): ShipBounds {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of ship.cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const x0 = ox + minX * cell + 3;
  const y0 = oy + minY * cell + 3;
  const x1 = ox + (maxX + 1) * cell - 3;
  const y1 = oy + (maxY + 1) * cell - 3;
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    x0,
    y0,
    x1,
    y1,
    w,
    h,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    isHorizontal: w >= h,
  };
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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawShipOutline(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  fillAlpha: number
) {
  const b = shipBounds(ship, cell);
  const radius = Math.min(b.w, b.h) * 0.35;
  ctx.save();
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = ship.color;
  roundedRectPath(ctx, b.x0, b.y0, b.w, b.h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = ship.color;
  ctx.lineWidth = 2;
  roundedRectPath(ctx, b.x0, b.y0, b.w, b.h, radius);
  ctx.stroke();
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
    const fullySunk = ship.sunk && shipFullyCommitted(ship, committedHits);
    if (fullySunk) {
      // Sunken footprint: dim colored outline + X marks on each cell.
      drawShipOutline(ctx, ship, cell, 0.45);
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      for (const c of ship.cells) {
        ctx.beginPath();
        ctx.moveTo(ox + c.x * cell + 6, oy + c.y * cell + 6);
        ctx.lineTo(ox + (c.x + 1) * cell - 6, oy + (c.y + 1) * cell - 6);
        ctx.moveTo(ox + (c.x + 1) * cell - 6, oy + c.y * cell + 6);
        ctx.lineTo(ox + c.x * cell + 6, oy + (c.y + 1) * cell - 6);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (visibility === 'visible') {
      drawShipOutline(ctx, ship, cell, 0.55);
    } else if (visibility === 'ghosted') {
      drawShipOutline(ctx, ship, cell, 0.18);
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
  committedMisses: Set<string>,
  freshHitCells: Set<string>,
  freshMissCells: Set<string>
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  for (const shot of shots) {
    for (const c of shot.misses) {
      const k = cellKey(c);
      if (!committedMisses.has(k)) continue;
      if (freshMissCells.has(k)) continue; // fresh ones are drawn by impact effect
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
      const k = cellKey(c);
      if (!committedHits.has(k)) continue;
      if (freshHitCells.has(k)) continue; // fresh ones are drawn by impact effect
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

function drawCrownedShip(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  now: number
) {
  const b = shipBounds(ship, cell);
  const { x0, y0, x1, y1, w, h, isHorizontal } = b;
  const pulse = (Math.sin((now / 1400) * Math.PI * 2) + 1) / 2;

  ctx.save();
  const bodyGrad = ctx.createLinearGradient(x0, y0, x0, y1);
  bodyGrad.addColorStop(0, '#ffe27a');
  bodyGrad.addColorStop(0.5, '#fff4b8');
  bodyGrad.addColorStop(1, '#d99b00');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x0, y0, w, h);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = `rgba(255, 215, 60, ${0.85 + pulse * 0.15})`;
  ctx.shadowBlur = 28 + pulse * 18;
  ctx.lineWidth = 3 + pulse * 1.5;
  ctx.strokeStyle = `rgba(255, 235, 120, ${0.85 + pulse * 0.15})`;
  ctx.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  const longAxis = isHorizontal ? w : h;
  const shimmerLen = Math.max(longAxis * 0.35, 24);
  const phase = (now / 1600) % 1;
  const start = -shimmerLen + phase * (longAxis + shimmerLen * 2);
  if (isHorizontal) {
    const grad = ctx.createLinearGradient(x0 + start, 0, x0 + start + shimmerLen, 0);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x0 + start, y0, shimmerLen, h);
  } else {
    const grad = ctx.createLinearGradient(0, y0 + start, 0, y0 + start + shimmerLen);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0 + start, w, shimmerLen);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = `rgba(255, 215, 50, ${0.85 + pulse * 0.15})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, w, h);
  ctx.restore();

  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ];
  for (let i = 0; i < corners.length; i++) {
    const [cx, cy] = corners[i];
    const sparklePhase = ((now / 800) + i * 0.25) % 1;
    const sparkleAlpha = Math.sin(sparklePhase * Math.PI);
    if (sparkleAlpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = sparkleAlpha;
    const sparkleGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 8);
    sparkleGrad.addColorStop(0, 'rgba(255, 255, 240, 1)');
    sparkleGrad.addColorStop(0.4, 'rgba(255, 220, 100, 0.7)');
    sparkleGrad.addColorStop(1, 'rgba(255, 200, 60, 0)');
    ctx.fillStyle = sparkleGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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

  ctx.save();
  const halo = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 12);
  halo.addColorStop(0, 'rgba(255, 240, 180, 0.85)');
  halo.addColorStop(1, 'rgba(255, 200, 80, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

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

    // Velocity unit (chord-sampled along the arc so the tail trails correctly).
    let velocityUnit = { x: 0, y: 0 };
    const earlier = projectilePosition(p, Math.max(p.fireTime, now - 30));
    const dx = pos.x - earlier.x;
    const dy = pos.y - earlier.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) velocityUnit = { x: dx / len, y: dy / len };

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

    if (p.type === 'depthCharge') {
      ctx.save();
      const halo = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 16);
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

function drawHitExplosion(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ageMs: number,
  cell: number
) {
  const t = Math.min(1, ageMs / IMPACT_ANIM_MS);
  const baseRadius = cell * 0.32;

  // Shockwave ring (fast expand, fade out)
  const ringRadius = baseRadius + t * cell * 1.4;
  const ringAlpha = (1 - t) * 0.65;
  ctx.save();
  ctx.globalAlpha = ringAlpha;
  ctx.strokeStyle = 'rgba(255, 200, 100, 1)';
  ctx.lineWidth = 3 * (1 - t) + 1;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Fireball (peaks early, then fades)
  const fireballT = Math.min(1, ageMs / 350);
  const fireballRadius = baseRadius * (0.6 + fireballT * 0.9);
  const fireballAlpha = Math.max(0, 1 - t * 1.2);
  ctx.save();
  ctx.globalAlpha = fireballAlpha;
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, fireballRadius);
  grad.addColorStop(0, 'rgba(255, 255, 220, 1)');
  grad.addColorStop(0.35, 'rgba(255, 180, 60, 0.95)');
  grad.addColorStop(0.7, 'rgba(220, 70, 30, 0.7)');
  grad.addColorStop(1, 'rgba(120, 30, 10, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, fireballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Debris flecks (8 directions, fly outward)
  const debrisLen = baseRadius + t * cell * 0.9;
  const debrisAlpha = Math.max(0, 1 - t * 1.5);
  ctx.save();
  ctx.globalAlpha = debrisAlpha;
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = cx + Math.cos(a) * debrisLen;
    const y = cy + Math.sin(a) * debrisLen;
    const x0 = cx + Math.cos(a) * (debrisLen - 4);
    const y0 = cy + Math.sin(a) * (debrisLen - 4);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();

  // Rising smoke plume (kicks in later)
  if (ageMs > 200) {
    const smokeT = (ageMs - 200) / (IMPACT_ANIM_MS - 200);
    const smokeY = cy - smokeT * cell * 0.6;
    const smokeAlpha = (1 - smokeT) * 0.5;
    ctx.save();
    ctx.globalAlpha = smokeAlpha;
    const sg = ctx.createRadialGradient(cx, smokeY, 1, cx, smokeY, cell * 0.35);
    sg.addColorStop(0, 'rgba(80, 80, 80, 0.9)');
    sg.addColorStop(1, 'rgba(60, 60, 60, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, smokeY, cell * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWaterSplash(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ageMs: number,
  cell: number
) {
  const t = Math.min(1, ageMs / SPLASH_ANIM_MS);

  // Central column (peaks at t=0.3, fades)
  const columnT = Math.min(1, ageMs / 180);
  const columnHeight = cell * 0.55 * columnT * (1 - t * 0.5);
  const columnAlpha = (1 - t) * 0.8;
  ctx.save();
  ctx.globalAlpha = columnAlpha;
  const colGrad = ctx.createLinearGradient(cx, cy, cx, cy - columnHeight);
  colGrad.addColorStop(0, 'rgba(220, 240, 255, 0.9)');
  colGrad.addColorStop(1, 'rgba(220, 240, 255, 0)');
  ctx.fillStyle = colGrad;
  ctx.fillRect(cx - cell * 0.06, cy - columnHeight, cell * 0.12, columnHeight);
  ctx.restore();

  // Outward droplet burst (8 droplets)
  const dropletDist = cell * 0.15 + t * cell * 0.55;
  const dropletAlpha = (1 - t) * 0.85;
  ctx.save();
  ctx.globalAlpha = dropletAlpha;
  ctx.fillStyle = 'rgba(230, 245, 255, 1)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a) * dropletDist;
    const dy = Math.sin(a) * dropletDist - t * cell * 0.2;
    const r = 2.5 * (1 - t * 0.4);
    if (r <= 0) continue;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Expanding ripple ring at water level
  const ringRadius = cell * 0.15 + t * cell * 0.6;
  const ringAlpha = (1 - t) * 0.7;
  ctx.save();
  ctx.globalAlpha = ringAlpha;
  ctx.strokeStyle = 'rgba(220, 240, 255, 1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Inner foam patch
  const foamAlpha = (1 - t) * 0.4;
  ctx.save();
  ctx.globalAlpha = foamAlpha;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.16 * (1 - t * 0.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const SHOT_TYPE_LABEL: Record<ShotType, string> = {
  cannon: '🎯 Cannon',
  broadside: '⚓ Broadside',
  depthCharge: '💣 Depth Charge',
};

function drawShotAnnotation(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ageMs: number,
  text: string
) {
  const t = Math.min(1, ageMs / ANNOTATION_ANIM_MS);
  if (t >= 1) return;
  // Rise upward then settle, fade out
  const riseT = Math.min(1, ageMs / 250);
  const offsetY = -16 - riseT * 18;
  const alpha = 1 - t;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const padX = 8;
  const padY = 4;
  const w = metrics.width + padX * 2;
  const h = 18;
  const x = cx - w / 2;
  const y = cy + offsetY - h / 2;
  // Pill background
  roundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(15, 25, 45, 0.88)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Text
  ctx.fillStyle = '#ffe27a';
  ctx.fillText(text, cx, cy + offsetY);
  ctx.restore();
  // Restore default text alignment
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  void padY;
}

function drawImpactEffects(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  cell: number,
  now: number,
  freshHitCells: Set<string>,
  freshMissCells: Set<string>
) {
  const ox = CANNON_PAD;
  const oy = CANNON_PAD;
  for (const p of projectiles) {
    if (!p.impacted) continue;
    const ageMs = now - (p.fireTime + p.travelMs);
    if (ageMs < 0) continue;

    // Per-cell hit/miss effects
    for (const h of p.hitsRevealOnImpact) {
      if (ageMs > IMPACT_ANIM_MS) continue;
      const cx = ox + h.x * cell + cell / 2;
      const cy = oy + h.y * cell + cell / 2;
      drawHitExplosion(ctx, cx, cy, ageMs, cell);
      freshHitCells.add(cellKey(h));
    }
    for (const m of p.missesRevealOnImpact) {
      if (ageMs > SPLASH_ANIM_MS) continue;
      const cx = ox + m.x * cell + cell / 2;
      const cy = oy + m.y * cell + cell / 2;
      drawWaterSplash(ctx, cx, cy, ageMs, cell);
      freshMissCells.add(cellKey(m));
    }

    // Shot-type annotation, one per projectile, above the target cell
    if (ageMs < ANNOTATION_ANIM_MS) {
      const cx = ox + p.toCell.x * cell + cell / 2;
      const cy = oy + p.toCell.y * cell + cell / 2;
      drawShotAnnotation(ctx, cx, cy, ageMs, SHOT_TYPE_LABEL[p.type]);
    }
  }
}

export function BattleshipGrid({
  stateRef,
  ships,
  gridSize,
  visibility,
  banner,
  crownedEntryId,
  projectilesRef,
  committedHitsRef,
  committedMissesRef,
  cannonAnglesRef,
  frameKey,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const cell = cellPxFor(gridSize);
  const dim = gridSize * cell + CANNON_PAD * 2;

  const drawAll = (now: number) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const cellLocal = cellPxFor(state.gridSize);
    const dimLocal = state.gridSize * cellLocal + CANNON_PAD * 2;
    if (canvas.width !== dimLocal) canvas.width = dimLocal;
    if (canvas.height !== dimLocal) canvas.height = dimLocal;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#06192e';
    ctx.fillRect(0, 0, dimLocal, dimLocal);

    drawGrid(ctx, state.gridSize, cellLocal);
    drawShips(ctx, state.ships, cellLocal, visibility, committedHitsRef.current);

    // Track which cells are currently mid-impact-animation so drawShots can
    // skip drawing their static markers (the impact effect owns the visuals
    // for its duration).
    const freshHitCells = new Set<string>();
    const freshMissCells = new Set<string>();
    drawImpactEffects(
      ctx,
      projectilesRef.current,
      cellLocal,
      now,
      freshHitCells,
      freshMissCells
    );

    drawShots(
      ctx,
      state.shots,
      state.ships,
      cellLocal,
      visibility,
      committedHitsRef.current,
      committedMissesRef.current,
      freshHitCells,
      freshMissCells
    );
    drawCannons(ctx, dimLocal, dimLocal, cannonAnglesRef.current);
    drawProjectiles(ctx, projectilesRef.current, dimLocal, dimLocal, now);

    if (crownedEntryId !== null) {
      const crownedShip = state.ships.find(
        (s) => s.entryId === crownedEntryId
      );
      if (crownedShip) {
        drawCrownedShip(ctx, crownedShip, cellLocal, now);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const shouldKeepAnimating = () => {
      const now = performance.now();
      if (crownedEntryId !== null) return true;
      for (const p of projectilesRef.current) {
        if (!p.impacted) return true;
        if (now - (p.fireTime + p.travelMs) < IMPACT_ANIM_MS) return true;
      }
      return false;
    };

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
  }, [frameKey, visibility, crownedEntryId]);

  // Ship labels — HTML overlay; stay visible even after the ship is sunk so
  // the grid keeps showing which participant occupied which position.
  const labelShips = ships;

  return (
    <div className="battleship-grid-wrap">
      <div className="battleship-canvas-host">
        <canvas ref={canvasRef} className="battleship-canvas" />
        <div className="battleship-labels-overlay">
          {labelShips.map((ship) => {
            const b = shipBounds(ship, cell);
            const leftPct = (b.cx / dim) * 100;
            const topPct = ((b.y0 - 6) / dim) * 100;
            return (
              <div
                key={ship.id}
                className="battleship-ship-label"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              >
                <span
                  className="battleship-ship-label-swatch"
                  style={{ background: ship.color }}
                />
                <span className="battleship-ship-label-name">{ship.entryName}</span>
              </div>
            );
          })}
        </div>
        {banner && banner.kind === 'sunk' && (
          <div className="battleship-banner">💥 {banner.name} sunk! 💥</div>
        )}
        {banner && banner.kind === 'final' && (
          <div className="battleship-banner battleship-banner-final">
            🏆 {banner.name} — Champion! 🏆
          </div>
        )}
      </div>
    </div>
  );
}
