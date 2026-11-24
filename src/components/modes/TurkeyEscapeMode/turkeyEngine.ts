import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * The farmyard, the pick and the chase for Turkey Escape.
 *
 * Fairness: the caught turkey is drawn uniformly *before* the gate opens, and
 * the chase takes that turkey's index as an input. The simulation can only
 * ever catch that one — the catch test exists in the `commit` phase alone and
 * measures the distance to `chosenIdx` and nobody else — so where a turkey
 * happens to be standing, how it runs and who the farmer dives at first have
 * no bearing on who is caught. turkeyEngine.test.ts proves the draw is uniform
 * over participants and over list positions, and that the chase always ends
 * on the chosen turkey.
 */
export const YARD = {
  CANVAS_W: 720,
  CANVAS_H: 560,
  /** The inside of the fence. */
  L: 44,
  T: 84,
  R: 676,
  B: 512,
  /** The farmer enters at (GATE_X, B). */
  GATE_X: 360,
  BIRD_R: 13,
  FARMER_R: 16,
  CATCH_DIST: 26,
} as const;

export interface Obstacle { x: number; y: number; r: number }

/**
 * Hay bales and pumpkins. Five circles, none within 60 px of the gate.
 *
 * Every gap — obstacle to fence and obstacle to obstacle — is wider than the
 * farmer, so pushing a body out of one circle can never push it through the
 * fence or into another circle, and nothing can be walled in.
 */
export const OBSTACLES: readonly Obstacle[] = [
  { x: 172, y: 196, r: 26 },
  { x: 540, y: 204, r: 20 },
  { x: 356, y: 292, r: 28 },
  { x: 196, y: 404, r: 20 },
  { x: 548, y: 392, r: 26 },
];

export interface Bird { x: number; y: number; vx: number; vy: number; heading: number }

/** The turkey the farmer will catch. Uniform over everyone still loose. */
export function pickCaught(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

/** True when a circle of radius r at (x, y) is inside the fence and off every obstacle. */
export function isClear(x: number, y: number, r: number): boolean {
  if (x - r < YARD.L || x + r > YARD.R || y - r < YARD.T || y + r > YARD.B) return false;
  for (const o of OBSTACLES) {
    if (Math.hypot(x - o.x, y - o.y) < o.r + r) return false;
  }
  return true;
}

/** Tries per turkey before giving up on chance and scanning the yard instead. */
const SPAWN_TRIES = 400;
/** A little air between turkeys at spawn, beyond merely not overlapping. */
const SPAWN_GAP = YARD.BIRD_R * 2 + 4;

/** Distinct spots inside the fence, clear of every obstacle and of each other. */
export function spawnBirds(count: number, rand: () => number = Math.random): Bird[] {
  const birds: Bird[] = [];
  if (count <= 0) return birds;

  const r = YARD.BIRD_R;
  const apart = (x: number, y: number, gap: number) =>
    birds.every((b) => Math.hypot(b.x - x, b.y - y) >= gap);
  const place = (x: number, y: number) => {
    birds.push({ x, y, vx: 0, vy: 0, heading: rand() * Math.PI * 2 });
  };

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let t = 0; t < SPAWN_TRIES && !placed; t++) {
      const x = YARD.L + r + rand() * (YARD.R - YARD.L - 2 * r);
      const y = YARD.T + r + rand() * (YARD.B - YARD.T - 2 * r);
      if (isClear(x, y, r) && apart(x, y, SPAWN_GAP)) {
        place(x, y);
        placed = true;
      }
    }
    // Chance failed: take the first free point on a coarse grid, so the
    // function always seats everyone it was asked to.
    for (let y = YARD.T + r; y <= YARD.B - r && !placed; y += 8) {
      for (let x = YARD.L + r; x <= YARD.R - r && !placed; x += 8) {
        if (isClear(x, y, r) && apart(x, y, r * 2)) {
          place(x, y);
          placed = true;
        }
      }
    }
    if (!placed) {
      // Unreachable at MAX_PARTICIPANTS (the yard seats hundreds), but the
      // contract is `count` birds, so a full yard still gets a legal spot.
      place(YARD.L + r, YARD.T + r);
    }
  }
  return birds;
}

// ---------------------------------------------------------------------------
// The chase
// ---------------------------------------------------------------------------

/** Seconds per simulation step. The yard only ever advances by exactly this. */
export const STEP = 1 / 60;
/** Missed dives before the real chase. */
export const FEINTS = 2;
/** Hard ceiling on simulated time until the catch. */
export const MAX_ROUND_S = 20;

/** Speeds in px/s, ranges in px, times in s. */
export const CHASE = {
  BIRD_SPEED: 95,
  BIRD_PANIC_SPEED: 175,
  DODGE_SPEED: 300,
  FARMER_SPEED: 185,
  LUNGE_SPEED: 330,
  /** The chosen turkey tires in the final chase. */
  TIRED_FACTOR: 0.7,
  /** The farmer's speed grows by this fraction per second of `commit`, without limit. */
  COMMIT_RAMP: 0.3,
  FLEE_RADIUS: 150,
  LUNGE_RANGE: 58,
  SEPARATION: 30,
  RELEASE_S: 0.9,
  CHASE_TIMEOUT_S: 2.6,
  LUNGE_S: 0.34,
  STUMBLE_S: 0.75,
} as const;

export type ChasePhase = 'idle' | 'release' | 'chase' | 'lunge' | 'stumble' | 'commit' | 'caught';

export interface Farmer { x: number; y: number; vx: number; vy: number; heading: number }

export interface YardState {
  birds: Bird[];
  farmer: Farmer;
  phase: ChasePhase;
  /** Seconds spent in the current phase. */
  phaseTime: number;
  /** Seconds since the gate opened. */
  elapsed: number;
  /** -1 in the idle yard. */
  chosenIdx: number;
  /** Who the farmer is running at right now, -1 if none. */
  targetIdx: number;
  /** Remaining decoy targets, never containing chosenIdx. */
  feintQueue: number[];
  /** Missed dives so far. */
  lunges: number;
  /** -1 until the catch. */
  caughtIdx: number;
}

/** How far outside the gate the farmer waits, and how far inside he walks to. */
const GATE_WALK = 30;
/** With nobody chasing, turkeys amble at this fraction of BIRD_SPEED. */
const STROLL_FACTOR = 0.4;
/** Largest heading change per step while wandering, in radians. */
const WANDER_JITTER = 0.4;
/** How quickly a turkey's velocity follows what it wants, per step. */
const BIRD_AGILITY = 0.22;
/** Sliding round a bale, the farmer keeps at least this share of his stride. */
const SLIDE_SHARE = 0.6;

const YARD_CX = (YARD.L + YARD.R) / 2;
const YARD_CY = (YARD.T + YARD.B) / 2;

function waitingFarmer(): Farmer {
  return { x: YARD.GATE_X, y: YARD.B + GATE_WALK, vx: 0, vy: 0, heading: -Math.PI / 2 };
}

/** A yard with nobody chasing: turkeys stroll, the farmer waits outside the gate. */
export function createIdleYard(count: number, rand: () => number = Math.random): YardState {
  return {
    birds: spawnBirds(count, rand),
    farmer: waitingFarmer(),
    phase: 'idle',
    phaseTime: 0,
    elapsed: 0,
    chosenIdx: -1,
    targetIdx: -1,
    feintQueue: [],
    lunges: 0,
    caughtIdx: -1,
  };
}

/** A yard about to be chased. chosenIdx must be in [0, count). */
export function createChase(
  count: number,
  chosenIdx: number,
  rand: () => number = Math.random
): YardState {
  if (!Number.isInteger(chosenIdx) || chosenIdx < 0 || chosenIdx >= count) {
    throw new RangeError(`chosenIdx ${chosenIdx} is not a turkey in a yard of ${count}`);
  }
  const state = createIdleYard(count, rand);

  // Decoys are drawn from everyone *except* the chosen turkey, and only after
  // the pick has been made, so they cannot feed back into it.
  const others: number[] = [];
  for (let i = 0; i < count; i++) if (i !== chosenIdx) others.push(i);
  const decoys = Math.min(FEINTS, others.length);
  for (let i = 0; i < decoys; i++) {
    const j = i + Math.min(others.length - 1 - i, Math.floor(rand() * (others.length - i)));
    [others[i], others[j]] = [others[j], others[i]];
  }

  state.phase = 'release';
  state.chosenIdx = chosenIdx;
  state.feintQueue = others.slice(0, decoys);
  return state;
}

interface Contact { wall: boolean; obstacle: Obstacle | null }

/**
 * Keep a body inside the fence and out of the obstacles: clamp to the fence
 * by its radius, then push it out of any obstacle along the centre-to-centre
 * line. Because every gap in the yard is wider than a body, the push can
 * never undo the clamp.
 */
function confine(body: { x: number; y: number }, r: number): Contact {
  const cx = Math.min(YARD.R - r, Math.max(YARD.L + r, body.x));
  const cy = Math.min(YARD.B - r, Math.max(YARD.T + r, body.y));
  const wall = cx !== body.x || cy !== body.y;
  body.x = cx;
  body.y = cy;

  let obstacle: Obstacle | null = null;
  for (const o of OBSTACLES) {
    let dx = body.x - o.x;
    let dy = body.y - o.y;
    let d = Math.hypot(dx, dy);
    const min = o.r + r;
    if (d >= min) continue;
    if (d < 1e-6) {
      // Dead centre: any way out is as good as another.
      dx = 1;
      dy = 0;
      d = 1;
    }
    body.x = o.x + (dx / d) * min;
    body.y = o.y + (dy / d) * min;
    obstacle = o;
  }
  return { wall, obstacle };
}

/** Send the farmer after the next decoy, or after the chosen turkey when none are left. */
function nextTarget(state: YardState): void {
  const decoy = state.feintQueue.shift();
  if (decoy === undefined) {
    state.targetIdx = state.chosenIdx;
    state.phase = 'commit';
  } else {
    state.targetIdx = decoy;
    state.phase = 'chase';
  }
  state.phaseTime = 0;
}

/**
 * Run the farmer toward a point. He never overshoots it, and when a hay bale
 * is in the way he slides round it rather than stopping against it — even
 * when he is running dead at its centre, where the push-out alone would leave
 * him marking time.
 */
function seek(f: Farmer, tx: number, ty: number, speed: number): void {
  const dx = tx - f.x;
  const dy = ty - f.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    f.vx = 0;
    f.vy = 0;
    return;
  }
  const ux = dx / d;
  const uy = dy / d;
  const stride = Math.min(speed * STEP, d);
  f.x += ux * stride;
  f.y += uy * stride;
  f.vx = ux * speed;
  f.vy = uy * speed;
  f.heading = Math.atan2(uy, ux);

  const hit = confine(f, YARD.FARMER_R).obstacle;
  if (!hit) return;
  // Tangent to the bale where he is touching it.
  const nd = Math.hypot(f.x - hit.x, f.y - hit.y) || 1;
  const tanX = -(f.y - hit.y) / nd;
  const tanY = (f.x - hit.x) / nd;
  const along = ux * tanX + uy * tanY;
  const short = SLIDE_SHARE - Math.abs(along);
  if (short <= 0) return;
  // Strictly by sign, with no dead zone: a dead zone would let him dither
  // either side of the line through the bale's centre.
  const side = along >= 0 ? 1 : -1;
  f.x += tanX * side * short * stride;
  f.y += tanY * side * short * stride;
  f.heading = Math.atan2(tanY * side, tanX * side);
  confine(f, YARD.FARMER_R);
}

function stepFarmer(state: YardState): void {
  const f = state.farmer;
  const target = state.targetIdx >= 0 ? state.birds[state.targetIdx] : undefined;

  switch (state.phase) {
    case 'release': {
      const t = Math.min(1, state.phaseTime / CHASE.RELEASE_S);
      f.x = YARD.GATE_X;
      f.y = YARD.B + GATE_WALK - 2 * GATE_WALK * t;
      f.vx = 0;
      f.vy = -(2 * GATE_WALK) / CHASE.RELEASE_S;
      f.heading = -Math.PI / 2;
      if (t >= 1) nextTarget(state);
      break;
    }
    case 'chase': {
      if (!target) {
        nextTarget(state);
        break;
      }
      seek(f, target.x, target.y, CHASE.FARMER_SPEED);
      const dx = target.x - f.x;
      const dy = target.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d <= CHASE.LUNGE_RANGE || state.phaseTime >= CHASE.CHASE_TIMEOUT_S) {
        // The dive is committed to where the turkey is *now*; it will not be
        // there when he lands. The direction lives in the farmer's velocity.
        const ux = d < 1e-6 ? Math.cos(f.heading) : dx / d;
        const uy = d < 1e-6 ? Math.sin(f.heading) : dy / d;
        f.vx = ux * CHASE.LUNGE_SPEED;
        f.vy = uy * CHASE.LUNGE_SPEED;
        f.heading = Math.atan2(uy, ux);
        state.lunges += 1;
        state.phase = 'lunge';
        state.phaseTime = 0;
      }
      break;
    }
    case 'lunge': {
      f.x += f.vx * STEP;
      f.y += f.vy * STEP;
      confine(f, YARD.FARMER_R);
      if (state.phaseTime >= CHASE.LUNGE_S) {
        f.vx = 0;
        f.vy = 0;
        state.phase = 'stumble';
        state.phaseTime = 0;
      }
      break;
    }
    case 'stumble': {
      f.vx = 0;
      f.vy = 0;
      if (state.phaseTime >= CHASE.STUMBLE_S) nextTarget(state);
      break;
    }
    case 'commit': {
      if (!target) break;
      // No ceiling on this: however the turkey runs, the farmer ends up faster.
      const speed = CHASE.FARMER_SPEED * (1 + CHASE.COMMIT_RAMP * state.phaseTime);
      seek(f, target.x, target.y, speed);
      break;
    }
    default:
      break;
  }
}

function stepBirds(state: YardState, rand: () => number): void {
  const { birds, farmer, phase } = state;
  const idle = phase === 'idle';
  const hunting = phase === 'chase' || phase === 'lunge' || phase === 'commit';
  const n = birds.length;
  const fleeing = new Array<boolean>(n).fill(false);

  // Decide every velocity from the same snapshot of positions, then move.
  for (let i = 0; i < n; i++) {
    const b = birds[i];

    if (phase === 'lunge' && i === state.targetIdx) {
      // Sidestep the dive: straight out of its line, to whichever side the
      // turkey is already on — or toward open yard when it is dead ahead or
      // that side is fence.
      const sp = Math.hypot(farmer.vx, farmer.vy) || 1;
      const px = -farmer.vy / sp;
      const py = farmer.vx / sp;
      const off = (b.x - farmer.x) * px + (b.y - farmer.y) * py;
      let side = off > 1 ? 1 : off < -1 ? -1 : (YARD_CX - b.x) * px + (YARD_CY - b.y) * py >= 0 ? 1 : -1;
      const ahead = YARD.BIRD_R + 20;
      const ax = b.x + px * side * ahead;
      const ay = b.y + py * side * ahead;
      if (ax < YARD.L || ax > YARD.R || ay < YARD.T || ay > YARD.B) side = -side;
      b.vx = px * side * CHASE.DODGE_SPEED;
      b.vy = py * side * CHASE.DODGE_SPEED;
      b.heading = Math.atan2(b.vy, b.vx);
      fleeing[i] = true;
      continue;
    }

    // Wander: a slow random drift of the heading.
    b.heading += (rand() - 0.5) * WANDER_JITTER;
    const amble = CHASE.BIRD_SPEED * (idle ? STROLL_FACTOR : 1);
    let wx = Math.cos(b.heading) * amble;
    let wy = Math.sin(b.heading) * amble;

    // Flee: away from the farmer, harder the closer he is.
    if (!idle) {
      const dx = b.x - farmer.x;
      const dy = b.y - farmer.y;
      const d = Math.hypot(dx, dy);
      const hunted = hunting && i === state.targetIdx;
      const closeness = hunted ? 1 : Math.max(0, 1 - d / CHASE.FLEE_RADIUS);
      if (closeness > 0) {
        const ux = d < 1e-6 ? Math.cos(b.heading) : dx / d;
        const uy = d < 1e-6 ? Math.sin(b.heading) : dy / d;
        wx += ux * CHASE.BIRD_PANIC_SPEED * closeness;
        wy += uy * CHASE.BIRD_PANIC_SPEED * closeness;
        fleeing[i] = closeness > 0.05;
      }
    }

    // Separation: away from any turkey that is too close.
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = birds[j];
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= CHASE.SEPARATION) continue;
      const push = CHASE.BIRD_SPEED * 1.5 * (1 - d / CHASE.SEPARATION);
      if (d < 1e-6) {
        // Exactly stacked: part them by list position, which is arbitrary but
        // deterministic and opposite for the two of them.
        wx += (i < j ? -1 : 1) * push;
      } else {
        wx += (dx / d) * push;
        wy += (dy / d) * push;
      }
    }

    // The chosen turkey tires once the farmer commits to it.
    const cap = CHASE.BIRD_PANIC_SPEED
      * (phase === 'commit' && i === state.chosenIdx ? CHASE.TIRED_FACTOR : 1);
    const want = Math.hypot(wx, wy);
    if (want > cap) {
      wx *= cap / want;
      wy *= cap / want;
    }
    b.vx += (wx - b.vx) * BIRD_AGILITY;
    b.vy += (wy - b.vy) * BIRD_AGILITY;
    const got = Math.hypot(b.vx, b.vy);
    if (got > cap) {
      b.vx *= cap / got;
      b.vy *= cap / got;
    }
    if (fleeing[i] && got > 1) b.heading = Math.atan2(b.vy, b.vx);
  }

  for (let i = 0; i < n; i++) {
    const b = birds[i];
    b.x += b.vx * STEP;
    b.y += b.vy * STEP;
    const contact = confine(b, YARD.BIRD_R);
    if ((contact.wall || contact.obstacle) && !fleeing[i]) {
      // A strolling turkey that walks into something turns back toward the yard.
      b.heading = Math.atan2(YARD_CY - b.y, YARD_CX - b.x) + (rand() - 0.5) * 1.6;
    }
  }
}

/** Advance by exactly STEP seconds. Mutates state. */
export function stepYard(state: YardState, rand: () => number = Math.random): void {
  if (state.phase === 'caught') return;

  state.phaseTime += STEP;
  if (state.phase !== 'idle') state.elapsed += STEP;

  stepFarmer(state);
  stepBirds(state, rand);

  // The only catch test in the simulation: in `commit`, against the chosen
  // turkey. A bystander the farmer runs straight through is never measured.
  if (state.phase === 'commit') {
    const chosen = state.birds[state.chosenIdx];
    const f = state.farmer;
    if (chosen && Math.hypot(chosen.x - f.x, chosen.y - f.y) <= YARD.CATCH_DIST) {
      state.caughtIdx = state.chosenIdx;
      state.phase = 'caught';
      state.phaseTime = 0;
    }
  }
}
