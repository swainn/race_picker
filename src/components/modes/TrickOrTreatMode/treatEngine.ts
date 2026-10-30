import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry, timings and the pick for Trick-or-Treat.
 *
 * Fairness: the treated child is drawn uniformly *before* the hand moves, and
 * the hand is then walked to whichever bag they are holding — the same
 * arrangement as The Claw and Whac-a-Mole, where the theatre never decides the
 * outcome. Because the draw happens before the line-up matters to anything,
 * where a child stands on the porch has no bearing on whether they get the
 * candy. treatEngine.test.ts proves that twice: once over participants and
 * once over positions in the line.
 */
export const TOT = {
  CANVAS_W: 720,
  CANVAS_H: 560,

  /** Where the front row's feet rest — the near edge of the porch deck. */
  PORCH_Y: 500,
  /** The far edge of the deck. Every row must stand between here and PORCH_Y. */
  DECK_Y: 362,
  /** The lit doorway the hand reaches out of. */
  DOOR_X: 360,
  DOOR_W: 150,
  DOOR_TOP: 120,

  /** The strip of porch the line-up may occupy. */
  LINE_L: 54,
  LINE_R: 666,
  /** Vertical gap between rows when the crowd needs more than one. */
  ROW_GAP: 60,

  /** A child, measured from their feet. */
  KID_W: 46,
  KID_H: 78,
  /** The bag they hold up, and where its mouth sits above their feet. */
  BAG_W: 26,
  BAG_H: 22,
  /** Held low enough to clear the face — a bag over the head reads as a mask. */
  BAG_LIFT: 24,

  /** Where the hand waits between visits. */
  HAND_REST_Y: 200,

  /** A line this long or shorter fits in one row. */
  MAX_PER_ROW: 10,
} as const;

/**
 * Beats of a round, in ms, before the speed multiplier.
 *
 * The hand pauses over a few bags before it commits, which is the whole
 * suspense of the mode — see FEINTS.
 */
export const TOT_T = {
  /** Doorbell, and the line shuffles into place. */
  gather: 700,
  /** Gliding from one bag to the next. */
  glide: 460,
  /** Hovering over a bag it is not going to choose after all. */
  feint: 420,
  /** Settling over the bag it has picked. */
  settle: 520,
  /** The candy falling in. */
  drop: 420,
  /** Bag glowing, the lucky one jumping. */
  cheer: 1100,
  done: 1000,
} as const;

/** Bags the hand hovers over before it commits to the real one. */
export const FEINTS = 2;

export interface KidSpot {
  x: number;
  /** Where their feet rest. */
  y: number;
  row: number;
  /** Back rows stand a little smaller, so the porch reads as having depth. */
  scale: number;
}

/** How many rows a given crowd needs. */
export function rowsFor(count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / TOT.MAX_PER_ROW);
}

/**
 * Line the children up across the porch, front row lowest.
 *
 * Rows are staggered by half a slot so the crowd reads as a gaggle rather
 * than a parade, and every child stays inside the porch rails.
 */
export function layoutKids(count: number): KidSpot[] {
  if (count <= 0) return [];
  const rows = rowsFor(count);
  const perRow = Math.ceil(count / rows);
  const span = TOT.LINE_R - TOT.LINE_L;

  const spots: KidSpot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    // The last row can be short; spread whatever it holds across the porch.
    const rowCount = Math.min(perRow, count - row * perRow);
    const step = span / rowCount;
    const stagger = row % 2 === 1 ? Math.min(12, step / 4) : 0;
    const x = TOT.LINE_L + step * (inRow + 0.5) + stagger;

    // Row 0 is the back row, so the front row ends up nearest the viewer.
    const fromFront = rows - 1 - row;
    spots.push({
      x: Math.max(TOT.LINE_L + TOT.KID_W / 2, Math.min(TOT.LINE_R - TOT.KID_W / 2, x)),
      y: TOT.PORCH_Y - fromFront * TOT.ROW_GAP,
      row,
      scale: 1 - fromFront * 0.08,
    });
  }
  return spots;
}

/** Where a child's bag mouth sits — the point the hand aims for. */
export function bagMouth(spot: KidSpot): { x: number; y: number } {
  return { x: spot.x, y: spot.y - TOT.BAG_LIFT * spot.scale };
}

/** The child who gets the candy. Uniform over everyone still knocking. */
export function pickTreated(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

/** Ease used by the hand so it drifts and settles rather than snapping. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** Candy falls, so it should accelerate on the way down. */
export function easeInQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c;
}
