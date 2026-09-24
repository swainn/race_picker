import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry and the pick for The Claw.
 *
 * Fairness: the chosen toy is drawn uniformly *before* the claw moves, and the
 * claw is then choreographed to it — the same arrangement as Space Invaders,
 * where the theatre never decides the outcome. That means where a toy sits in
 * the tank has no bearing on whether it gets taken, so unlike Alien Abduction
 * there is nothing positional to compensate for.
 */
export const CLAW = {
  CANVAS_W: 480,
  CANVAS_H: 600,

  /** Glass tank interior. */
  TANK_L: 34,
  TANK_R: 446,
  TANK_TOP: 66,
  FLOOR_Y: 462,

  /** The gantry the claw hangs from, and how far the claw may travel along it. */
  RAIL_Y: 92,
  /** Where the claw head rides when it is not reaching down. */
  REST_Y: 122,
  RAIL_L: 62,
  RAIL_R: 418,

  /** Prize chute: a hole in the floor at the far left of the tank. */
  CHUTE_X: 66,
  CHUTE_HALF: 26,
  CHUTE_TOP: 448,

  /** Toys keep clear of the chute on the left and the glass on the right. */
  TOY_L: 112,
  TOY_R: 416,
  ROW_GAP: 34,
} as const;

export interface ToySpot {
  x: number;
  y: number;
  /** Back rows sit a little smaller so the pile reads as having depth. */
  scale: number;
  row: number;
}

/** How many rows a given crowd needs. */
export function rowsFor(count: number): number {
  if (count <= 6) return 1;
  if (count <= 12) return 2;
  return 3;
}

/**
 * Lay the toys out on the tank floor, front row lowest.
 *
 * Rows are staggered by half a slot so the crowd reads as a pile rather than
 * a spreadsheet, and every spot stays inside the glass.
 */
export function layoutToys(count: number): ToySpot[] {
  if (count <= 0) return [];
  const rows = rowsFor(count);
  const perRow = Math.ceil(count / rows);
  const left = CLAW.TOY_L;
  const right = CLAW.TOY_R;
  const span = right - left;

  const spots: ToySpot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    // The last row can be short; spread whatever it holds across the width.
    const rowCount = Math.min(perRow, count - row * perRow);
    const step = rowCount > 1 ? span / (rowCount - 1) : 0;
    const stagger = row % 2 === 1 ? Math.min(14, step / 2) : 0;
    const x = rowCount > 1 ? left + inRow * step : (left + right) / 2;

    // Row 0 is the back row, so the front row ends up on the floor.
    const fromFront = rows - 1 - row;
    spots.push({
      x: Math.max(left, Math.min(right, x + stagger)),
      y: CLAW.FLOOR_Y - fromFront * CLAW.ROW_GAP,
      scale: 1 - fromFront * 0.07,
      row,
    });
  }
  return spots;
}

/** The toy the claw will take. Uniform over the remaining participants. */
export function pickChosen(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

/** Ease used by the gantry and the winch so motion starts and stops softly. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}
