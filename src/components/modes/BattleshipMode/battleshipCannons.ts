import type { Cell } from './battleshipPlacement';
import type { ShotType } from './battleshipTargeting';

export type CannonCorner = 'tl' | 'tr' | 'bl' | 'br';

export const CANNON_CORNERS: readonly CannonCorner[] = [
  'tl',
  'tr',
  'bl',
  'br',
] as const;

/** Pixel padding around the grid where cannons live. */
export const CANNON_PAD = 60;
export const CANNON_BASE_RADIUS = 18;
export const CANNON_BARREL_LEN = 28;
export const CANNON_BARREL_WIDTH = 8;
export const PROJECTILE_RADIUS = 5;
export const ARC_PROJECTILE_RADIUS = 7;
export const MUZZLE_FLASH_RADIUS = 16;
export const MUZZLE_FLASH_MS = 80;

export interface PixelPoint {
  x: number;
  y: number;
}

export interface Projectile {
  id: number;
  corner: CannonCorner;
  fromPx: PixelPoint;
  toPx: PixelPoint;
  toCell: Cell;
  fireTime: number;
  travelMs: number;
  arcing: boolean;
  type: ShotType;
  hitsRevealOnImpact: Cell[];
  missesRevealOnImpact: Cell[];
  /** Set when this projectile is the one that delivers the killing blow. */
  sinksEntryId: number | null;
  impacted: boolean;
}

export function pickCannon(rng: () => number): CannonCorner {
  return CANNON_CORNERS[Math.floor(rng() * CANNON_CORNERS.length)];
}

/**
 * Returns the canvas pixel position of a cannon's base for the given corner,
 * given a grid that has been padded by CANNON_PAD on each side.
 */
export function cannonAnchorPx(
  corner: CannonCorner,
  canvasWidth: number,
  canvasHeight: number
): PixelPoint {
  const inset = CANNON_PAD / 2;
  switch (corner) {
    case 'tl':
      return { x: inset, y: inset };
    case 'tr':
      return { x: canvasWidth - inset, y: inset };
    case 'bl':
      return { x: inset, y: canvasHeight - inset };
    case 'br':
      return { x: canvasWidth - inset, y: canvasHeight - inset };
  }
}

export function computeAimAngle(from: PixelPoint, to: PixelPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function cannonBarrelTipPx(
  anchor: PixelPoint,
  angle: number
): PixelPoint {
  return {
    x: anchor.x + Math.cos(angle) * CANNON_BARREL_LEN,
    y: anchor.y + Math.sin(angle) * CANNON_BARREL_LEN,
  };
}

export function cellCenterPx(
  cell: Cell,
  cellPx: number
): PixelPoint {
  return {
    x: CANNON_PAD + cell.x * cellPx + cellPx / 2,
    y: CANNON_PAD + cell.y * cellPx + cellPx / 2,
  };
}

/**
 * Returns the current pixel position of a projectile at time `now`.
 * For non-arcing projectiles, linear interp from from→to.
 * For arcing projectiles, parabolic arc with peak ~30% of travel distance
 * above the midpoint.
 */
export function projectilePosition(
  p: Projectile,
  now: number
): PixelPoint {
  const t = Math.max(0, Math.min(1, (now - p.fireTime) / p.travelMs));
  const x = p.fromPx.x + (p.toPx.x - p.fromPx.x) * t;
  const y = p.fromPx.y + (p.toPx.y - p.fromPx.y) * t;

  if (!p.arcing) {
    return { x, y };
  }

  // Parabolic lift: peak height ~30% of horizontal travel distance.
  const dx = p.toPx.x - p.fromPx.x;
  const dy = p.toPx.y - p.fromPx.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const peak = dist * 0.3;
  const lift = -4 * peak * t * (1 - t); // 0 at endpoints, -peak at t=0.5
  return { x, y: y + lift };
}

/** True if `now` is past the projectile's impact time. */
export function isImpacted(p: Projectile, now: number): boolean {
  return now >= p.fireTime + p.travelMs;
}

/** Cell key helper duplicate (avoids cross-module import for callers that already have one). */
export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}
