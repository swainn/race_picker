import { shuffle } from '../../../utils/array';

/** Field geometry for Alien Abduction, kept pure so the fairness of the
 *  starting layout can be tested without a canvas. */

export const CANVAS_WIDTH = 400;
export const FIELD_LEFT = 16;
export const FIELD_RIGHT = CANVAS_WIDTH - 16;

/** The x of one of `count` evenly spaced starting marks across the field. */
export function slotX(slot: number, count: number): number {
  const span = FIELD_RIGHT - FIELD_LEFT;
  return FIELD_LEFT + ((slot + 0.5) / Math.max(count, 1)) * span;
}

/** Which starting mark each participant takes, in list order.
 *
 *  Deliberately shuffled. The saucer starts centred over the field and locks
 *  onto whoever is nearest, so the middle marks get hunted first — handing out
 *  marks in list order would let participants in the middle of the list win a
 *  third of all rounds. Randomising the assignment is what keeps the pick
 *  uniform, so this must stay shuffled (see abductionField.test.ts). */
export function startingSlots(count: number): number[] {
  return shuffle(Array.from({ length: count }, (_, i) => i));
}

// ---------------------------------------------------------------------------
// Opening prowl
// ---------------------------------------------------------------------------

/** How far the saucer may drift, matching the clamp in the game loop. */
export const SHIP_MIN_X = FIELD_LEFT + 10;
export const SHIP_MAX_X = FIELD_RIGHT - 10;

export const PROWL = {
  /** Strafe speed, px/s, while the beam is still dark. */
  SWEEP_SPEED: 250,
  /** Passes across the field before the beam may fire at all. */
  MIN_SWEEPS: 2,
  /** Per-second chance of igniting once those passes are done. */
  IGNITE_RATE: 2,
  /** Hard cap on the extra wait after the sweeps, in seconds. */
  MAX_EXTRA: 1.5,
} as const;

/**
 * The saucer's opening routine: it cruises side to side with the beam off,
 * then switches on at a random moment mid-field.
 *
 * Without this the beam is live from frame one directly over the centre of
 * the field, so whoever starts on a middle mark gets taken almost every time.
 * The shuffled starting slots keep the pick uniform regardless (see above),
 * but prowling first means the grab happens at an arbitrary spot instead — it
 * both looks better and stops leaning on the shuffle alone.
 */
export interface ProwlState {
  /** Passes still owed before the beam may fire. */
  sweepsLeft: number;
  /** The x the saucer is currently strafing toward. */
  target: number;
  /** Seconds elapsed since the sweeps finished. */
  waited: number;
}

/** Start a prowl, heading for whichever edge is farther away. */
export function newProwl(shipX: number, rand: () => number = Math.random): ProwlState {
  const mid = (SHIP_MIN_X + SHIP_MAX_X) / 2;
  return {
    sweepsLeft: PROWL.MIN_SWEEPS + (rand() < 0.5 ? 0 : 1),
    target: shipX <= mid ? SHIP_MAX_X : SHIP_MIN_X,
    waited: 0,
  };
}

/**
 * Advance one frame of the prowl. Mutates `state` and returns the saucer's new
 * x plus whether the beam ignites this frame.
 */
export function stepProwl(
  state: ProwlState,
  shipX: number,
  dt: number,
  rand: () => number = Math.random
): { x: number; ignite: boolean } {
  const step = PROWL.SWEEP_SPEED * dt;
  let x = shipX;
  const dir = state.target > x ? 1 : -1;
  x += dir * step;

  // Reached the edge: count the pass and turn around.
  if ((dir === 1 && x >= state.target) || (dir === -1 && x <= state.target)) {
    x = state.target;
    if (state.sweepsLeft > 0) state.sweepsLeft -= 1;
    state.target = state.target === SHIP_MAX_X ? SHIP_MIN_X : SHIP_MAX_X;
  }

  let ignite = false;
  if (state.sweepsLeft <= 0) {
    state.waited += dt;
    // Random moment mid-strafe, with a deadline so it can never stall.
    ignite = rand() < PROWL.IGNITE_RATE * dt || state.waited >= PROWL.MAX_EXTRA;
  }
  return { x, ignite };
}
