import { FIELD_LEFT, FIELD_RIGHT } from './abductionField';

/**
 * How the last participant standing gets sent off.
 *
 * The pick is already over by the time any of this runs — the survivor has won
 * either way — so which ending plays is pure theatre and may be chosen however
 * we like. Keeping the beats and the layout here means they can be tested
 * without a canvas, the same way the field geometry is.
 */

export type FinaleId = 'disguise' | 'hero';

export const FINALE_IDS: FinaleId[] = ['disguise', 'hero'];

export const FINALE_LABELS: Record<FinaleId, string> = {
  disguise: '👽 Alien in disguise',
  hero: '🪂 Hero of the herd',
};

/** The closing caption, reused as the winner dialog's headline. */
export const FINALE_CAPTIONS: Record<FinaleId, string> = {
  disguise: '👽 ALIEN IN DISGUISE 👽',
  hero: '🪂 HERO OF THE HERD 🪂',
};

/** Beats of the "one of us" ending, in seconds from the finale starting. */
export const DISGUISE = {
  SHAKE: 1.0,   // the costume starts twitching
  MORPH: 2.1,   // flash — the disguise drops
  DESCEND: 2.3, // the saucer stoops to collect its own
  BEAM: 3.8,    // beam on, a slow wave goodbye
  RISE: 4.6,    // stepping aboard, no struggle this time
  DEPART: 8.0,  // ship climbs back to its hover
} as const;

/**
 * Beats of the "hero" ending: the survivor is taken, and whatever they do up
 * there brings the saucer down — everyone it ever took floats home by
 * parachute.
 */
export const HERO = {
  DESCEND: 0.5,  // the saucer drops for its last catch
  BEAM: 1.4,     // beam on
  RISE: 2.3,     // lifted off the ground
  ABOARD: 3.4,   // swallowed by the ship
  RUMBLE: 3.9,   // something is going badly wrong up there
  BOOM: 5.6,     // the saucer comes apart
  CAPTION: 7.2,  // the hero gets their title
  /** Seconds the whole ending lasts before the dust settles. */
  END: 11.0,
} as const;

/** Where one parachutist comes down and when their canopy opens. */
export interface ChutePlan {
  /** Where they drift down to. */
  x: number;
  /** Seconds after the explosion before this one appears. */
  delay: number;
  /** Descent speed, px/s. */
  speed: number;
  /** How wide they swing under the canopy, in px. */
  sway: number;
  /** Phase offset so they do not all swing in unison. */
  phase: number;
}

/**
 * Lay out everyone bailing out of the exploding saucer.
 *
 * They are spread evenly across the field rather than dropped where the ship
 * blew up, so a full roster lands as a row of survivors instead of a pile —
 * and the staggered delays keep the sky from filling all at once.
 */
export function parachutePlan(count: number, rand: () => number = Math.random): ChutePlan[] {
  if (count <= 0) return [];
  const span = FIELD_RIGHT - FIELD_LEFT;
  return Array.from({ length: count }, (_, i) => {
    // Jitter within the slot, never past its edges, so nobody lands off-field.
    const slot = span / count;
    const centre = FIELD_LEFT + (i + 0.5) * slot;
    const wiggle = (rand() - 0.5) * slot * 0.5;
    return {
      x: centre + wiggle,
      delay: (i % 5) * 0.14 + rand() * 0.25,
      // Fast enough that a full roster is on the ground before the ending
      // runs out; they fall most of the canvas height.
      speed: 96 + rand() * 54,
      sway: 7 + rand() * 11,
      phase: rand() * Math.PI * 2,
    };
  });
}
