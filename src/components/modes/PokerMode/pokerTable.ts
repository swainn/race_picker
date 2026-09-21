/**
 * Table geometry for Poker Night, kept pure so the seating can be tested
 * without a canvas.
 *
 * Seats are handed out in entry order and deliberately NOT shuffled. Unlike
 * Alien Abduction — where the saucer hunts the middle of the field, so the
 * starting marks must be shuffled to stay fair — a poker deal is completely
 * independent of where anyone sits. Position carries no advantage here.
 */

export const CANVAS_W = 840;
export const CANVAS_H = 600;

/** Centre of the felt. */
export const TABLE_CX = CANVAS_W / 2;
export const TABLE_CY = CANVAS_H / 2 + 8;

/** Felt oval. */
export const FELT_RX = 322;
export const FELT_RY = 208;

/** Seats ride just outside the rail. */
const SEAT_RX = FELT_RX + 38;
const SEAT_RY = FELT_RY + 34;

export interface Seat {
  x: number;
  y: number;
  /** Radians around the table; 0 points right, PI/2 points down. */
  angle: number;
  /** Which side of the felt this seat sits on, for label placement. */
  side: 'top' | 'bottom' | 'left' | 'right';
}

function ellipsePoint(t: number, rx: number, ry: number) {
  return { x: TABLE_CX + rx * Math.cos(t), y: TABLE_CY + ry * Math.sin(t) };
}

/**
 * Seats spaced evenly by **arc length**, not by angle. The felt is half again
 * as wide as it is tall, so even-angle spacing would bunch seats up at the
 * left and right ends and leave gaps along the long sides.
 */
export function seatPositions(count: number): Seat[] {
  if (count <= 0) return [];

  // Walk the ellipse once, accumulating arc length.
  const STEPS = 2048;
  const cum: number[] = [0];
  let prev = ellipsePoint(0, SEAT_RX, SEAT_RY);
  for (let i = 1; i <= STEPS; i++) {
    const t = (i / STEPS) * Math.PI * 2;
    const p = ellipsePoint(t, SEAT_RX, SEAT_RY);
    cum.push(cum[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const total = cum[STEPS];

  // Seat 0 sits at bottom centre (the "you" chair), then we go clockwise.
  const startArc = cum[Math.round(STEPS * 0.25)];

  const seats: Seat[] = [];
  for (let i = 0; i < count; i++) {
    const target = (startArc + (i / count) * total) % total;
    // cum is monotonic, so a scan is fine and avoids off-by-one in a search.
    let step = 0;
    while (step < STEPS && cum[step + 1] < target) step++;
    const angle = (step / STEPS) * Math.PI * 2;
    const { x, y } = ellipsePoint(angle, SEAT_RX, SEAT_RY);

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const side: Seat['side'] =
      Math.abs(dy) > 0.66 ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left';

    seats.push({ x, y, angle, side });
  }
  return seats;
}

/** Seat tiles shrink as the table fills so twenty still fit shoulder to shoulder. */
export function seatTileWidth(count: number): number {
  if (count <= 6) return 116;
  if (count <= 10) return 104;
  if (count <= 14) return 96;
  return 88;
}

/** Where the five community cards sit, left to right. */
export function communitySlots(cardW: number, gap: number): { x: number; y: number }[] {
  const total = cardW * 5 + gap * 4;
  const left = TABLE_CX - total / 2;
  return Array.from({ length: 5 }, (_, i) => ({
    x: left + i * (cardW + gap),
    y: TABLE_CY - 46,
  }));
}

/** Card face size used for the community board and sudden-death row. */
export const CARD_W = 46;
export const CARD_H = 64;

/** Horizontal room the sudden-death row may use. */
const SUDDEN_AVAIL = 764;

export interface SuddenDeathLayout {
  cardW: number;
  cardH: number;
  gap: number;
  /** x of the leftmost card. */
  left: number;
}

/**
 * Lay out one card per tied player in a single centred row.
 *
 * The entire table can tie — a board straight or flush plays for everyone — so
 * the row shrinks to fit instead of running off the canvas.
 */
export function suddenDeathLayout(count: number): SuddenDeathLayout {
  const natural = count * CARD_W + (count - 1) * 18;
  const scale = natural > SUDDEN_AVAIL ? SUDDEN_AVAIL / natural : 1;
  const cardW = Math.max(20, Math.floor(CARD_W * scale));
  const cardH = Math.round(cardW * (CARD_H / CARD_W));
  const gap = Math.max(4, Math.floor(18 * scale));
  const totalW = count * cardW + (count - 1) * gap;
  return { cardW, cardH, gap, left: TABLE_CX - totalW / 2 };
}
