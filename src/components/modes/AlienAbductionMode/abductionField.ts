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
