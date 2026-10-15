import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry, timings and the pick for Whac-a-Mole.
 *
 * Fairness: the victim is drawn uniformly *before* a single frame animates,
 * and the mallet is then choreographed onto the hole that mole happens to be
 * sitting in — the same arrangement as The Claw, where the theatre never
 * decides the outcome. The drift and the two fake swings that precede the
 * lock are deliberately aimed at holes the pick already passed over, so they
 * cannot nudge it either.
 *
 * The consequence worth spelling out: because the draw happens before the
 * layout matters to anything, **where a mole sits in the grid has no bearing
 * on whether it gets whacked**. Corner holes, the middle, the short bottom
 * row — all identical odds. moleEngine.test.ts proves this twice: once over
 * participants and once over hole indices.
 *
 * Note this mode is survival-ordered: the mole that gets whacked is *out*,
 * and the one the mallet never comes for is the champion.
 */
export const WHAC = {
  CANVAS_W: 640,
  CANVAS_H: 560,

  /** The playfield the holes are cut into. */
  BOARD_L: 40,
  BOARD_R: 600,
  BOARD_TOP: 120,
  BOARD_BOTTOM: 490,

  /** Hole mouth, drawn as an ellipse (the board is seen at a slight angle). */
  HOLE_RX: 44,
  HOLE_RY: 17,

  /**
   * How far a mole travels between "hidden" and "fully up". Tuned so that at
   * pop = 0 the whole sprite sits below the rim the mole is clipped to.
   */
  MOLE_RISE: 78,

  /** Where the mallet head hovers above a hole when it is not swinging. */
  HOVER_DY: 108,
  /** How far below the hover line the head reaches at the moment of impact. */
  IMPACT_DY: 70,

  /** A wide grid reads better than a tall one, so cap the columns. */
  MAX_COLS: 5,
} as const;

/**
 * Phase lengths in ms, before the speed multiplier is applied.
 *
 * Paced like someone actually trying to catch a mole that keeps dodging:
 * the hunt is quick and a little frantic, and only the payoff after a
 * connecting hit is allowed to breathe.
 */
export const MOLE_T = {
  /** One drift across the board to the next hole the mallet will tease. */
  drift: 360,
  /** A swing that stops short — pure theatre at an empty hole. */
  fake: 290,
  /** Easing the mallet onto the victim's hole once it commits. */
  lock: 300,
  /** Cock back and slam. */
  swing: 250,
  /** Mole flattened, stars spinning, before the knockout is declared. */
  whack: 760,
  done: 1000,
} as const;

/** Fewest and most swings a round may take, the connecting one included. */
export const SWINGS_MIN = 1;
export const SWINGS_MAX = 6;

/**
 * How many swings this round takes before the mallet connects, counting the
 * hit itself — so 1 means it lands first time and 6 means five misses first.
 *
 * Rolled fresh each round. A fixed count made the mode predictable: with two
 * fakes every time you could see the hit coming on the third swing. This is
 * theatre only — the victim was already drawn uniformly before any of it, so
 * the number of swings cannot change who gets hit, only how long they sweat.
 */
export function swingsForRound(rand: () => number = Math.random): number {
  return SWINGS_MIN + Math.floor(rand() * (SWINGS_MAX - SWINGS_MIN + 1));
}

export interface HoleSpot {
  x: number;
  y: number;
  row: number;
  col: number;
}

/** How wide the grid should be for a given crowd. */
export function colsFor(count: number): number {
  if (count <= 0) return 0;
  if (count <= 3) return count;
  if (count <= 8) return 4;
  return WHAC.MAX_COLS;
}

/**
 * Cut `count` holes into the board.
 *
 * Holes sit at the centre of an even grid cell, which is what keeps them from
 * overlapping: the cell is always wider than a hole and taller than one. A
 * short final row is centred across the board rather than left-aligned, so the
 * grid reads as deliberate instead of truncated.
 */
export function layoutHoles(count: number): HoleSpot[] {
  if (count <= 0) return [];
  const cols = colsFor(count);
  const rows = Math.ceil(count / cols);
  const width = WHAC.BOARD_R - WHAC.BOARD_L;
  const height = WHAC.BOARD_BOTTOM - WHAC.BOARD_TOP;
  const cellW = width / cols;
  const cellH = height / rows;

  const spots: HoleSpot[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(cols, count - row * cols);
    // Centre the row: a 2-wide last row under a 5-wide grid sits in the middle.
    const rowLeft = WHAC.BOARD_L + (width - inRow * cellW) / 2;
    for (let col = 0; col < inRow; col++) {
      spots.push({
        x: rowLeft + cellW * (col + 0.5),
        y: WHAC.BOARD_TOP + cellH * (row + 0.5),
        row,
        col,
      });
    }
  }
  return spots;
}

/** The mole the mallet will hit. Uniform over the remaining participants. */
export function pickVictim(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

/** Ease used by the drift and the lock so the mallet starts and stops softly. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** Ease used by the downstroke: slow off the top, fastest at the moment of impact. */
export function easeInCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * c;
}
