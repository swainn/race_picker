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

  /** Furthest the pouch may be dragged when a player is aiming by hand. */
  MAX_PULL: 110,
  /** Launch speed, in physics-step units, at that full draw. */
  MAX_LAUNCH_SPEED: 27,

  /**
   * Tower footprint, well clear of the slingshot on the left.
   *
   * Widened when the roster cap went to 30: the structure only gets four tiers
   * before it climbs off the top of the canvas, so the extra seats have to come
   * from width rather than height.
   */
  TOWER_L: 420,
  TOWER_R: 800,

  /** One tier = two columns + a beam, with the tier's pigs perched on top. */
  TIER_H: 100,
  COLUMN_W: 18,
  /**
   * Must be TIER_H - BEAM_H, so a tier's columns reach from the beam below to
   * its own beam and the stack rests on itself.
   *
   * It used to be 48, leaving a 38px void under every tier — so each one
   * free-fell onto the one beneath the instant the sim ran, and the structure
   * shook itself apart before a bird was ever thrown. The pigs perch in the
   * headroom beside these columns, not under them (see seatBandFor).
   */
  COLUMN_H: 86,
  BEAM_H: 14,
  PIG_R: 16,
  /** Above this, the tower grows another tier instead of another seat. */
  PIGS_PER_TIER: 8,

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
/** What a block is made of. Changes how it looks, weighs and slides. */
export type BlockMaterial = 'wood' | 'stone' | 'ice';

export interface BlockSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BlockKind;
  material: BlockMaterial;
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
/**
 * What each style is built from, bottom tier first; the last entry repeats for
 * any tier above it.
 *
 * Heavy at the base and light on top is both how you would really build one and
 * what collapses well: a stone footing stays put while an ice top shears off.
 * Material is decided by style and tier rather than at random so a shape reads
 * the same every time you meet it — the variety comes from the shapes.
 */
export const STYLE_MATERIALS: Record<TowerStyle, BlockMaterial[]> = {
  tiers: ['stone', 'wood', 'wood', 'ice'],
  pyramid: ['stone', 'stone', 'wood', 'ice'],
  twin: ['wood', 'wood', 'ice'],
  bunker: ['stone', 'stone', 'wood'],
};

/**
 * How much punishment a block takes before it breaks, in impulse units.
 *
 * Ice goes first, then wood, then stone — the same order as their weight, so
 * the heavy stuff at the base is also the stuff that survives. The numbers are
 * what a bird strike actually delivers: a solid hit is a few units, so ice
 * shatters on one, wood wants a couple, and stone needs the tower to come down
 * on it.
 */
export const MATERIAL_STRENGTH: Record<BlockMaterial, number> = {
  ice: 5,
  wood: 14,
  stone: 34,
};

/** Below this an impact is a nudge, not damage — stops a settle eroding things. */
export const DAMAGE_THRESHOLD = 1.2;

/** What a block on this tier of this style is made of. */
export function materialFor(style: TowerStyle, tier: number): BlockMaterial {
  const list = STYLE_MATERIALS[style];
  return list[Math.min(tier, list.length - 1)];
}

/** The shapes a round's structure can take. Cosmetic: see pickTowerStyle. */
export type TowerStyle = 'tiers' | 'pyramid' | 'twin' | 'bunker';

export const TOWER_STYLES: TowerStyle[] = ['tiers', 'pyramid', 'twin', 'bunker'];

/** Narrowest a pig's seat may be, so perched pigs never start overlapping. */
const MIN_SEAT = AB.PIG_R * 2 + 6;

/**
 * Clear space between a column and the nearest pig.
 *
 * The tier above rests its columns at the same x as this tier's, and they hang
 * only a few px above the perch. Without this gap the outer pig on every tier
 * sits directly under a column and gets landed on the moment the sim starts —
 * the pig was being crushed by the structure rather than by the bird.
 */
const PIG_CLEARANCE = 6;

/**
 * The stretch of a span a pig's centre may occupy.
 *
 * Clear of this tier's own columns, and of the tier above's — a pyramid steps
 * inward, so the columns resting on *this* beam come down inside this span,
 * over the seats near its ends. Only the top tier gets the full width, since
 * nothing lands on it.
 */
function seatBandFor(
  style: TowerStyle,
  tier: number,
  left: number,
  right: number
): [number, number] {
  const inset = AB.COLUMN_W + AB.PIG_R + PIG_CLEARANCE;
  let bandL = left + inset;
  let bandR = right - inset;
  if (tier + 1 < MAX_TIERS) {
    for (const [upperL, upperR] of tierSpans(style, tier + 1)) {
      // Only spans that actually sit over this one. A twin tower's other
      // stack is a tier up but way off to the side; counting it shrank each
      // band to nothing and left every upper tier unable to seat anyone.
      if (upperR <= left || upperL >= right) continue;
      if (upperL > left) bandL = Math.max(bandL, upperL + inset);
      if (upperR < right) bandR = Math.min(bandR, upperR - inset);
    }
  }
  return [bandL, bandR];
}

/** How much each tier of a pyramid steps in on both sides. */
const PYRAMID_INSET = 14;

/** The gap between the two stacks of a twin tower. */
const TWIN_GAP = 30;

/**
 * How much wider a bunker is than the other shapes. It needs the extra width
 * to seat more pigs per tier than a plain stack — without it the seat band
 * caps it at the same five and the two shapes come out identical.
 */
const BUNKER_EXTRA = 40;

/** Tallest a structure may get before it climbs off the top of the canvas. */
const MAX_TIERS = 4;

/** The horizontal extent of one tier, which is what makes the styles differ. */
function tierSpans(style: TowerStyle, tier: number): [number, number][] {
  const L = AB.TOWER_L;
  const R = AB.TOWER_R;
  switch (style) {
    case 'pyramid': {
      const inset = PYRAMID_INSET * tier;
      return [[L + inset, R - inset]];
    }
    case 'twin': {
      const half = (R - L - TWIN_GAP) / 2;
      return [
        [L, L + half],
        [R - half, R],
      ];
    }
    case 'bunker':
      return [[L - BUNKER_EXTRA, R]];
    default:
      return [[L, R]];
  }
}

/**
 * Most pigs one span will take. A bunker packs them tighter so it comes out
 * squat and wide rather than another tall stack — the shield alone would have
 * left the pigs sitting in exactly the same seats as a plain tower.
 */
function seatCapFor(style: TowerStyle): number {
  return style === 'bunker' ? AB.PIGS_PER_TIER + 1 : AB.PIGS_PER_TIER;
}

/** How many pigs a span can seat, clear of its columns and of each other. */
function seatsIn(style: TowerStyle, tier: number, left: number, right: number): number {
  const [bandL, bandR] = seatBandFor(style, tier, left, right);
  const band = bandR - bandL;
  if (band < 0) return 0;
  return Math.min(seatCapFor(style), Math.floor(band / MIN_SEAT) + 1);
}

/** Most pigs a style can seat across all its tiers. */
function capacityOf(style: TowerStyle): number {
  let total = 0;
  for (let tier = 0; tier < MAX_TIERS; tier++) {
    total += tierSpans(style, tier).reduce((n, [l, r]) => n + seatsIn(style, tier, l, r), 0);
  }
  return total;
}

/**
 * Build the structure for `count` pigs, bottom tier first.
 *
 * Seats are handed out tier by tier from the ground up, and each span only
 * takes as many pigs as it can seat without them overlapping — which is what
 * lets the narrower upper tiers of a pyramid, or the two halves of a twin,
 * share the same code as a plain stack. Tier spacing leaves a few px of
 * daylight under the next beam so nothing starts the round interpenetrating;
 * overlapping bodies explode apart on step one.
 */
export function layoutTower(count: number, style: TowerStyle = 'tiers'): TowerLayout {
  if (count <= 0) return { blocks: [], pigs: [] };

  // Narrow shapes cannot seat a big roster once the pigs are kept clear of the
  // columns. Rather than drop a pig — the pick is an index into this list, so a
  // missing one would stall the round — fall back to the plain stack, which is
  // the widest and always fits.
  if (count > capacityOf(style)) style = 'tiers';

  const blocks: BlockSpec[] = [];
  const pigs: PigSpot[] = [];
  let placed = 0;

  for (let tier = 0; tier < MAX_TIERS && placed < count; tier++) {
    const base = AB.GROUND_Y - tier * AB.TIER_H;
    const columnMidY = base - AB.COLUMN_H / 2;
    const beamMidY = base - AB.COLUMN_H - AB.BEAM_H / 2;
    const perchY = base - AB.COLUMN_H - AB.BEAM_H - AB.PIG_R;
    const spans = tierSpans(style, tier);

    // Capacity of the whole tier, so a short last row can be spread evenly.
    const capacity = spans.reduce((n, [l, r]) => n + seatsIn(style, tier, l, r), 0);
    const wanted = Math.min(capacity, count - placed);

    let remaining = wanted;
    for (const [left, right] of spans) {
      const cap = seatsIn(style, tier, left, right);
      // Share what is left across the spans still to come in this tier.
      const seats = Math.min(cap, remaining);
      remaining -= seats;

      const material = materialFor(style, tier);
      blocks.push({
        x: left + AB.COLUMN_W / 2,
        y: columnMidY,
        w: AB.COLUMN_W,
        h: AB.COLUMN_H,
        kind: 'column',
        material,
        tier,
      });
      blocks.push({
        x: right - AB.COLUMN_W / 2,
        y: columnMidY,
        w: AB.COLUMN_W,
        h: AB.COLUMN_H,
        kind: 'column',
        material,
        tier,
      });
      blocks.push({
        x: (left + right) / 2,
        y: beamMidY,
        w: right - left,
        h: AB.BEAM_H,
        kind: 'beam',
        material,
        tier,
      });

      const [bandL, bandR] = seatBandFor(style, tier, left, right);
      if (seats === 1) {
        pigs.push({ x: (bandL + bandR) / 2, y: perchY, r: AB.PIG_R, tier });
      } else {
        const gap = (bandR - bandL) / (seats - 1);
        for (let seat = 0; seat < seats; seat++) {
          pigs.push({ x: bandL + gap * seat, y: perchY, r: AB.PIG_R, tier });
        }
      }
    }
    placed += wanted;
  }

  // A bunker puts a shield across the front, between the slingshot and the
  // pigs, so the bird has to come over the top or break through.
  if (style === 'bunker') {
    const topTier = Math.max(0, Math.ceil(count / AB.PIGS_PER_TIER) - 1);
    const h = Math.max(AB.TIER_H, (topTier + 1) * AB.TIER_H - 30);
    blocks.push({
      x: AB.TOWER_L - BUNKER_EXTRA - AB.COLUMN_W,
      y: AB.GROUND_Y - h / 2,
      w: AB.COLUMN_W,
      h,
      kind: 'column',
      // A shield is only worth having if it is the hard stuff.
      material: 'stone',
      tier: 0,
    });
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

/** Fewest and most volleys a round may take, the telling one included. */
export const VOLLEYS_MIN = 1;
export const VOLLEYS_MAX = 3;

/**
 * How many birds this round throws before one of them finally does for the
 * chosen pig. 1 means the first bird settles it; 3 means two go wide first.
 *
 * Theatre only. The victim is drawn before a single bird flies, so the extra
 * volleys cannot change who goes — they only decide how long it takes. The
 * earlier birds are aimed away from the pick and the pop is held back until
 * the last one, so a near miss is genuinely a near miss.
 */
export function volleysForRound(rand: () => number = Math.random): number {
  return VOLLEYS_MIN + Math.floor(rand() * (VOLLEYS_MAX - VOLLEYS_MIN + 1));
}

/**
 * Which seat in the structure each participant takes, in list order.
 *
 * Deliberately shuffled, and it carries real weight when the pick is resolved
 * by the simulation rather than drawn up front. The physics is nowhere near
 * even-handed about seats: a pig on an outside edge of the top tier is far
 * easier to reach than one walled into the middle of a bunker. Handing seats
 * out in list order would turn that into a standing advantage for wherever you
 * happen to sit in the participant list.
 *
 * Shuffling fixes it exactly, not approximately. The simulation cannot tell
 * participants apart, so if seat k is first to pop with probability p_k, a
 * participant assigned a uniformly random seat is picked with probability
 * sum(p_k)/n = 1/n — whatever the p_k happen to be.
 */
export function seatOrder(count: number, rand?: () => number): number[] {
  const seats = Array.from({ length: count }, (_, i) => i);
  return rand ? shuffleWith(seats, rand) : shuffle(seats);
}

/** Fisher-Yates against an injected source, so the test can be deterministic. */
function shuffleWith<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Impulse a pig must take to pop when the simulation is deciding the round.
 * Above a solid glancing blow, so the first pop reads as a real hit.
 */
export const PIG_POP_IMPULSE = 4.2;

/**
 * Volleys after which pigs start getting easier to dislodge.
 *
 * A round has to end. Rather than reach in and choose a winner — which is the
 * one thing this mode exists to avoid — the pigs simply become more fragile
 * the longer nobody has been hit, so the simulation still decides who goes.
 */
export const PHYSICS_PATIENCE = 4;

/** The pop threshold for a given volley, easing off once patience runs out. */
export function popImpulseForVolley(volley: number): number {
  if (volley < PHYSICS_PATIENCE) return PIG_POP_IMPULSE;
  const eased = PIG_POP_IMPULSE * Math.pow(0.75, volley - PHYSICS_PATIENCE + 1);
  return Math.max(DAMAGE_THRESHOLD, eased);
}

/**
 * Turn a drag of the pouch into a launch.
 *
 * The bird leaves along the reverse of the drag, at a speed proportional to
 * how far it was pulled — so dragging down-left fires up-right, like a real
 * slingshot. The pull is clamped rather than scaled down, so hauling the
 * pointer off the canvas just means full power rather than a wild shot.
 *
 * `flightSteps` is only used to decide how much of the arc to preview; the
 * bird itself flies until it hits something.
 */
export function pullToLaunch(dx: number, dy: number): LaunchSolution {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { vx: 0, vy: 0, flightSteps: 0 };
  const draw = Math.min(dist, AB.MAX_PULL);
  const speed = (draw / AB.MAX_PULL) * AB.MAX_LAUNCH_SPEED;
  return {
    vx: (-dx / dist) * speed,
    vy: (-dy / dist) * speed,
    flightSteps: Math.round(AB.MIN_FLIGHT_STEPS + (draw / AB.MAX_PULL) * AB.MAX_FLIGHT_STEPS),
  };
}

/** Where the pouch sits for a given drag, clamped to the maximum draw. */
export function pouchAtPull(from: Vec, dx: number, dy: number): Vec {
  const dist = Math.hypot(dx, dy);
  if (dist <= AB.MAX_PULL) return { x: from.x + dx, y: from.y + dy };
  return { x: from.x + (dx / dist) * AB.MAX_PULL, y: from.y + (dy / dist) * AB.MAX_PULL };
}
