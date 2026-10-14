import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry, the pick, and the ballistics for Angry Birds.
 *
 * Fairness: the round's result is drawn uniformly *before* anything moves, and
 * the launch is then solved to produce it — the same arrangement as The Claw
 * and Space Invaders, where the theatre never decides the outcome. The rigid
 * body sim is only there to make the collapse look real; it is never consulted
 * about who got picked. Where a pig sits in the tower therefore has no bearing
 * on whether it gets popped, so there is nothing positional to compensate for.
 *
 * This file stays pure (no matter-js, no canvas) so all of it is unit-testable;
 * matter-js lives behind angryBirdsPhysics.ts and nothing else imports it.
 */
export const AB = {
  CANVAS_W: 840,
  CANVAS_H: 600,

  /** Top of the grass. Everything rests on this line. */
  GROUND_Y: 520,

  /** The slingshot's fork — where a bird leaves the pouch. */
  SLING_X: 120,
  SLING_Y: 420,
  /** How far back the pouch is drawn at full draw. */
  SLING_PULL: 46,

  /** Tower footprint, well clear of the slingshot on the left. */
  TOWER_L: 520,
  TOWER_R: 800,

  /** One tier = two columns + a beam, with the tier's pigs perched on top. */
  TIER_H: 100,
  COLUMN_W: 18,
  COLUMN_H: 48,
  BEAM_H: 14,
  PIG_R: 16,
  /** Above this, the tower grows another tier instead of another seat. */
  PIGS_PER_TIER: 5,

  BIRD_R: 13,

  /**
   * Gravity in *physics-step* units: px per step^2 at a fixed 1000/60 ms step.
   * matter-js integrates per step, not per second, so the solver below works in
   * the same units and its velocities drop straight into Body.setVelocity.
   * Matches engine.gravity.y = 1 with the default scale of 0.001.
   */
  G_STEP: 1 * 0.001 * (1000 / 60) * (1000 / 60),

  /** Flight time bounds, in steps (~0.75s .. 1.5s). */
  MIN_FLIGHT_STEPS: 45,
  MAX_FLIGHT_STEPS: 90,
  /** The arc must stay on screen: no apex above this line. */
  APEX_CEILING_Y: 40,

  /**
   * Backstop: if the sim has not popped the chosen pig this long after launch,
   * the round pops it anyway. A round can never stall on physics that wandered
   * off — same guarantee Space Invaders gets from its FORCED_END_MS.
   */
  FORCED_END_MS: 7000,
} as const;

export type BlockKind = 'column' | 'beam';

/** An axis-aligned wooden block, positioned by its centre. */
export interface BlockSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BlockKind;
  tier: number;
}

/** A perch for one pig, positioned by its centre. */
export interface PigSpot {
  x: number;
  y: number;
  r: number;
  tier: number;
}

export interface TowerLayout {
  blocks: BlockSpec[];
  pigs: PigSpot[];
}

/** How many tiers a given crowd needs. */
export function tiersFor(count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / AB.PIGS_PER_TIER);
}

/**
 * Build the tower for `count` pigs, bottom tier first.
 *
 * Every tier is the same width so the thing stacks squarely; only the number of
 * pigs perched on it changes. Tier spacing leaves a few px of daylight between
 * a tier's pigs and the underside of the tier above, so nothing starts the
 * round already intersecting — overlapping bodies explode apart on step one.
 */
export function layoutTower(count: number): TowerLayout {
  if (count <= 0) return { blocks: [], pigs: [] };

  const tiers = tiersFor(count);
  const perTier = Math.ceil(count / tiers);
  const span = AB.TOWER_R - AB.TOWER_L;

  const blocks: BlockSpec[] = [];
  const pigs: PigSpot[] = [];

  for (let tier = 0; tier < tiers; tier++) {
    const base = AB.GROUND_Y - tier * AB.TIER_H;
    const columnMidY = base - AB.COLUMN_H / 2;
    const beamMidY = base - AB.COLUMN_H - AB.BEAM_H / 2;

    blocks.push({
      x: AB.TOWER_L + AB.COLUMN_W / 2,
      y: columnMidY,
      w: AB.COLUMN_W,
      h: AB.COLUMN_H,
      kind: 'column',
      tier,
    });
    blocks.push({
      x: AB.TOWER_R - AB.COLUMN_W / 2,
      y: columnMidY,
      w: AB.COLUMN_W,
      h: AB.COLUMN_H,
      kind: 'column',
      tier,
    });
    blocks.push({
      x: (AB.TOWER_L + AB.TOWER_R) / 2,
      y: beamMidY,
      w: span,
      h: AB.BEAM_H,
      kind: 'beam',
      tier,
    });

    // The last tier can be short; spread whatever it holds across the beam.
    const seats = Math.min(perTier, count - tier * perTier);
    const step = span / seats;
    const perchY = base - AB.COLUMN_H - AB.BEAM_H - AB.PIG_R;
    for (let seat = 0; seat < seats; seat++) {
      pigs.push({ x: AB.TOWER_L + step * (seat + 0.5), y: perchY, r: AB.PIG_R, tier });
    }
  }

  return { blocks, pigs };
}

/**
 * The round's result. Uniform over the remaining participants.
 *
 * In sub-mode `pigs` this is the pig that gets popped; in sub-mode `birds` it
 * is the bird whose shot will be scored best. Either way the launch is solved
 * afterwards to match, so this is the only thing standing between the mode and
 * a biased pick. Never a shuffle bag — those are for cosmetic variety.
 */
export function pickVictim(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

export interface Vec {
  x: number;
  y: number;
}

export interface LaunchSolution {
  /** Velocity in px per physics step, ready for Body.setVelocity. */
  vx: number;
  vy: number;
  /** Steps until the trajectory reaches the target. */
  flightSteps: number;
}

/**
 * Steps of hang time for a shot of this length — longer shot, lazier arc.
 *
 * Hang time and arc height are the same knob: the longer the bird is in the
 * air, the harder it had to be thrown upward. Past a point that puts the apex
 * off the top of the canvas and the shot disappears mid-flight, so the time is
 * walked back until the arc fits on screen.
 */
export function flightStepsFor(from: Vec, target: Vec): number {
  const dist = Math.hypot(target.x - from.x, target.y - from.y);
  let steps = Math.max(AB.MIN_FLIGHT_STEPS, Math.min(AB.MAX_FLIGHT_STEPS, dist / 8));
  const headroom = from.y - AB.APEX_CEILING_Y;
  while (steps > AB.MIN_FLIGHT_STEPS) {
    // Apex height above the launch point for this hang time: vy^2 / 2g.
    const vy = (target.y - from.y) / steps - (AB.G_STEP * steps) / 2;
    if ((vy * vy) / (2 * AB.G_STEP) <= headroom) break;
    steps -= 1;
  }
  return steps;
}

/**
 * Solve the launch that puts the bird on `target` after `flightSteps`.
 *
 * Plain projectile kinematics under constant gravity, inverted for velocity:
 *   x(t) = x0 + vx*t                 ->  vx = dx / T
 *   y(t) = y0 + vy*t + g*t^2/2       ->  vy = dy/T - g*T/2
 * (canvas y grows downward, so gravity is positive). Because this is exact,
 * the bird arrives wherever the pick said it should; the only way it misses is
 * hitting something on the way, which is what the FORCED_END_MS backstop and
 * the general collapse are for.
 */
export function solveLaunch(from: Vec, target: Vec, flightSteps?: number): LaunchSolution {
  const T = flightSteps ?? flightStepsFor(from, target);
  return {
    vx: (target.x - from.x) / T,
    vy: (target.y - from.y) / T - (AB.G_STEP * T) / 2,
    flightSteps: T,
  };
}

/** Sample the solved arc — used for the aim guide and by the tests. */
export function trajectoryPoint(from: Vec, sol: LaunchSolution, t: number): Vec {
  return {
    x: from.x + sol.vx * t,
    y: from.y + sol.vy * t + (AB.G_STEP * t * t) / 2,
  };
}

/** The whole arc, sampled every `stepSize` steps up to `steps`. */
export function sampleTrajectory(
  from: Vec,
  sol: LaunchSolution,
  steps: number,
  stepSize = 1
): Vec[] {
  const out: Vec[] = [];
  for (let t = 0; t <= steps; t += stepSize) out.push(trajectoryPoint(from, sol, t));
  return out;
}

/** Where a bird aims to take out this pig: dead on it. */
export function aimAtPig(spot: PigSpot): Vec {
  return { x: spot.x, y: spot.y };
}

/**
 * Sub-mode `birds`: where the bird ranked `rank` aims at a tower of generic
 * pigs. Rank 0 (the pre-picked winner) is sent into the base of the stack,
 * which is what actually brings a tower down; everyone else is scattered off
 * that point by an amount that grows with their rank, so the picture on screen
 * agrees with the scoreboard.
 */
export function aimForRank(rank: number, layout: TowerLayout): Vec {
  const sweetSpot: Vec = {
    x: AB.TOWER_L + AB.COLUMN_W,
    y: AB.GROUND_Y - AB.COLUMN_H / 2,
  };
  if (rank <= 0) return sweetSpot;
  // Alternate the miss side so a volley does not drift all one way.
  const side = rank % 2 === 0 ? 1 : -1;
  const drift = Math.min(90, 16 + rank * 11);
  const lift = Math.min(170, rank * 17);
  const top = layout.pigs.length > 0 ? Math.min(...layout.pigs.map((p) => p.y)) : sweetSpot.y;
  return {
    x: Math.max(AB.TOWER_L - 40, Math.min(AB.TOWER_R + 20, sweetSpot.x + side * drift)),
    y: Math.max(top - 60, sweetSpot.y - lift),
  };
}

export interface ShotScore {
  entryId: number;
  name: string;
  score: number;
  /** 0 is the best shot of the round. */
  rank: number;
}

/** Score bands: the winner's band sits strictly above everyone else's. */
const SCORE_FLOOR = 1200;
const SCORE_CEILING = 8000;
const WINNER_MARGIN = 500;

/**
 * Sub-mode `birds`: build the round's scoreboard around the pre-picked winner.
 *
 * The scoreboard is generated *from* the pick rather than measured off the
 * physics, so the board can never disagree with who was chosen — the one thing
 * that would quietly turn a fair pick into a rigged-looking one. Everyone else
 * gets a random score below the winner's, forced strictly decreasing so there
 * are no ties to break on screen.
 */
export function rankShots(entries: Entry[], winnerId: number): ShotScore[] {
  const winner = entries.find((e) => e.id === winnerId);
  if (!winner) throw new Error(`rankShots: winner ${winnerId} is not among the entries`);

  const others = entries.filter((e) => e.id !== winnerId);
  const scored = others
    .map((entry) => ({
      entry,
      score: Math.round((SCORE_FLOOR + Math.random() * (SCORE_CEILING - SCORE_FLOOR)) / 10) * 10,
    }))
    .sort((a, b) => b.score - a.score);

  // Force strictly decreasing so no two birds ever show the same number.
  for (let i = 1; i < scored.length; i++) {
    if (scored[i].score >= scored[i - 1].score) scored[i].score = scored[i - 1].score - 10;
  }

  const best = scored.length > 0 ? scored[0].score : SCORE_FLOOR;
  const winnerScore = best + WINNER_MARGIN + Math.round(Math.random() * 50) * 10;

  return [
    { entryId: winner.id, name: winner.name, score: winnerScore, rank: 0 },
    ...scored.map((s, i) => ({
      entryId: s.entry.id,
      name: s.entry.name,
      score: Math.max(100, s.score),
      rank: i + 1,
    })),
  ];
}

/** Ease used by the slingshot draw and the camera so motion settles softly. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}
