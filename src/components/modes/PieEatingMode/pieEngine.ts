import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';

/**
 * Geometry, timings, the pick and the progress curves for the Pie Eating
 * Contest.
 *
 * Fairness: the champion is drawn uniformly *before* the countdown, and
 * `planContest` then writes every eater's progress curve so that exactly that
 * eater clears the plate first. Seats, curve shapes and the rabbit are all
 * assigned after the draw and never feed back into it — the same arrangement
 * as Trick-or-Treat, where the theatre never decides the outcome.
 * pieEngine.test.ts proves the draw is uniform over participants and seats.
 */
export const PIE = {
  CANVAS_W: 720,
  CANVAS_H: 560,
  /** The strip of table the seats may occupy. */
  LINE_L: 50,
  LINE_R: 670,
  /** Table-top line of the front row. */
  FRONT_Y: 500,
  /** Vertical gap between rows. */
  ROW_GAP: 130,
  SEAT_W: 54,
  /** A table this long or shorter fits in one row. */
  MAX_PER_ROW: 10,
} as const;

/** Beats of a round in ms, before the speed multiplier. */
export const PIE_T = { countdown: 1800, contest: 11000, cheer: 1500, done: 1000 } as const;

/** Nobody but the champion may show a clean plate at the bell. */
export const MAX_LOSER_PROGRESS = 0.94;
/** Normalized time at which the rabbit must lead. */
export const RABBIT_AT = 0.6;
/** Minimum lead over the eventual winner at RABBIT_AT. */
export const RABBIT_LEAD = 0.08;

export interface SeatSpot {
  x: number;
  /** The table-top line of this seat's row. */
  y: number;
  row: number;
  /** Back rows sit a little smaller, so the hall reads as having depth. */
  scale: number;
}

/** A point on a progress curve; both in [0, 1]. */
export interface Knot { t: number; p: number }
/** A normalized time window during which an eater makes no progress. */
export interface Stall { from: number; to: number }
export interface EaterPlan { curve: Knot[]; stalls: Stall[] }

/** How many rows of tables a given crowd needs. */
export function rowsFor(count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(count / PIE.MAX_PER_ROW);
}

/**
 * Seat everyone along the tables, front row lowest. Row 0 is the back row.
 * No stagger: every row is its own table, so seats line up behind their pies.
 */
export function layoutSeats(count: number): SeatSpot[] {
  if (count <= 0) return [];
  const rows = rowsFor(count);
  const perRow = Math.ceil(count / rows);
  const span = PIE.LINE_R - PIE.LINE_L;

  const seats: SeatSpot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    // The last row can be short; spread whatever it holds along the table.
    const rowCount = Math.min(perRow, count - row * perRow);
    const step = span / rowCount;
    const fromFront = rows - 1 - row;
    seats.push({
      x: PIE.LINE_L + step * (inRow + 0.5),
      y: PIE.FRONT_Y - fromFront * PIE.ROW_GAP,
      row,
      scale: 1 - fromFront * 0.1,
    });
  }
  return seats;
}

/** The eater who will clear the plate first. Uniform over everyone at the table. */
export function pickChampion(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}

function lerpCurve(curve: Knot[], t: number): number {
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1];
    const b = curve[k];
    if (t <= b.t) return a.p + (b.p - a.p) * ((t - a.t) / (b.t - a.t));
  }
  return curve[curve.length - 1].p;
}

/** Fraction of the pie eaten at normalized time `t` (clamped to [0, 1]). */
export function progressAt(plan: EaterPlan, t: number): number {
  const curve = plan.curve;
  if (curve.length === 0) return 0;
  if (t <= 0) return curve[0].p;
  // Returned exactly, so the finish never depends on interpolation rounding.
  if (t >= 1) return curve[curve.length - 1].p;
  return lerpCurve(curve, t);
}

/** Whether the eater has stopped eating (feeling sick) at normalized time `t`. */
export function isStalled(plan: EaterPlan, t: number): boolean {
  return plan.stalls.some((s) => t >= s.from && t < s.to);
}

/** Index of whoever has eaten the most at `t`; lowest index on ties, -1 if nobody. */
export function leaderAt(plans: EaterPlan[], t: number): number {
  let best = -1;
  let bestP = -Infinity;
  plans.forEach((plan, i) => {
    const p = progressAt(plan, t);
    if (p > bestP) {
      bestP = p;
      best = i;
    }
  });
  return best;
}

/** Width of the winner's optional early wobble. */
const WINNER_STALL_W = 0.06;
/** Keeps a stall clear of the knots either side of it. */
const STALL_MARGIN = 0.015;

/**
 * Flatten `[from, to]` of a curve into a stall, if that window sits strictly
 * inside one rising segment and clear of every existing stall. The values at
 * the existing knots do not change — the eater just catches up afterwards.
 */
function insertStall(plan: EaterPlan, from: number, to: number): boolean {
  if (plan.stalls.some((s) => from < s.to + STALL_MARGIN && to > s.from - STALL_MARGIN)) return false;
  const curve = plan.curve;
  for (let k = 1; k < curve.length; k++) {
    const a = curve[k - 1];
    const b = curve[k];
    if (from > a.t + STALL_MARGIN && to < b.t - STALL_MARGIN) {
      const p = a.p + (b.p - a.p) * ((from - a.t) / (b.t - a.t));
      curve.splice(k, 0, { t: from, p }, { t: to, p });
      plan.stalls.push({ from, to });
      plan.stalls.sort((x, y) => x.from - y.from);
      return true;
    }
  }
  return false;
}

/** The champion: behind at the turn, then a clean run to the empty plate. */
function planWinner(pw: number, rand: () => number): EaterPlan {
  const plan: EaterPlan = {
    curve: [{ t: 0, p: 0 }, { t: RABBIT_AT, p: pw }, { t: 1, p: 1 }],
    stalls: [],
  };
  if (rand() < 0.5) {
    const from = 0.15 + rand() * (0.45 - WINNER_STALL_W - 0.15);
    insertStall(plan, from, from + WINNER_STALL_W);
  }
  return plan;
}

/** The rabbit: out in front at the turn, then too much pie. */
function planRabbit(atTurn: number, rand: () => number): EaterPlan {
  const from = RABBIT_AT + 0.05;
  const to = RABBIT_AT + 0.25;
  const final = 0.88 + rand() * (MAX_LOSER_PROGRESS - 0.88);
  // A couple more bites after the turn before it catches up with them.
  const sickAt = Math.min(final, atTurn + 0.03);
  return {
    curve: [
      { t: 0, p: 0 },
      { t: RABBIT_AT, p: atTurn },
      { t: from, p: sickAt },
      { t: to, p: sickAt },
      { t: 1, p: final },
    ],
    stalls: [{ from, to }],
  };
}

/** Everyone else: a wandering curve that never passes the rabbit at the turn. */
function planOther(turnCap: number, rand: () => number): EaterPlan {
  const final = 0.55 + rand() * (MAX_LOSER_PROGRESS - 0.55);
  const atTurn = Math.min(final * (0.5 + rand() * 0.35), turnCap);

  // Three to five shape knots: start, turn and finish, with an optional bend
  // before and after the turn so no two eaters pace themselves alike.
  const curve: Knot[] = [{ t: 0, p: 0 }];
  if (rand() < 0.6) {
    const t = 0.2 + rand() * 0.2;
    curve.push({ t, p: atTurn * (t / RABBIT_AT) * (0.65 + rand() * 0.5) });
  }
  curve.push({ t: RABBIT_AT, p: atTurn });
  if (rand() < 0.6) {
    const t = 0.75 + rand() * 0.15;
    const along = ((t - RABBIT_AT) / (1 - RABBIT_AT)) * (0.65 + rand() * 0.5);
    curve.push({ t, p: atTurn + (final - atTurn) * Math.min(1, along) });
  }
  curve.push({ t: 1, p: final });
  // The bends are scaled from the knots either side, but clamp anyway so a
  // pie can never grow back.
  for (let k = 1; k < curve.length - 1; k++) {
    curve[k].p = Math.max(curve[k - 1].p, Math.min(curve[k].p, curve[curve.length - 1].p));
    if (curve[k].t <= RABBIT_AT) curve[k].p = Math.min(curve[k].p, atTurn);
  }

  const plan: EaterPlan = { curve, stalls: [] };
  const stalls = Math.floor(rand() * 3);
  for (let s = 0; s < stalls; s++) {
    const width = 0.05 + rand() * 0.07;
    const from = 0.08 + rand() * (0.94 - width - 0.08);
    // A window that straddles a knot is simply skipped: 0 to 2 stalls.
    insertStall(plan, from, from + width);
  }
  return plan;
}

/**
 * Write every eater's progress curve so that `chosenIdx` — and only them —
 * clears the plate, exactly at t = 1. Curves live in normalized time, so the
 * pacing setting can change mid-contest without reordering the finish.
 *
 * `rand` only shapes the theatre; the pick was made before this is called.
 */
export function planContest(
  count: number,
  chosenIdx: number,
  rand: () => number = Math.random
): EaterPlan[] {
  if (count <= 0) return [];

  const pw = 0.5 + rand() * 0.06;
  const winner = planWinner(pw, rand);

  // A lone eater has nobody to chase.
  let rabbitIdx = -1;
  let rabbitAtTurn = 0;
  let rabbit: EaterPlan | null = null;
  if (count >= 2) {
    rabbitIdx = Math.min(count - 2, Math.floor(rand() * (count - 1)));
    if (rabbitIdx >= chosenIdx) rabbitIdx++;
    rabbitAtTurn = pw + RABBIT_LEAD + rand() * 0.06;
    rabbit = planRabbit(rabbitAtTurn, rand);
  }

  const plans: EaterPlan[] = [];
  for (let i = 0; i < count; i++) {
    if (i === chosenIdx) plans.push(winner);
    else if (i === rabbitIdx && rabbit) plans.push(rabbit);
    else plans.push(planOther(rabbitAtTurn - 0.01, rand));
  }
  return plans;
}
