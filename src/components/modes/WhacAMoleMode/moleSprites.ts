/**
 * Art for Whac-a-Mole: the fairground board, the holes cut into it, the moles
 * that bob out of them and the mallet that comes down.
 *
 * Everything is drawn in board space (the same coordinates `layoutHoles`
 * returns), so the caller only has to say where and how far up.
 */
import { WHAC } from './moleEngine';

function lighten(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount);
  };
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

function darken(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

/** The cabinet, the grass playfield and the marquee behind everything. */
export function drawBoard(ctx: CanvasRenderingContext2D, now: number): void {
  // Sky behind the booth
  const sky = ctx.createLinearGradient(0, 0, 0, WHAC.CANVAS_H);
  sky.addColorStop(0, '#1b3b2a');
  sky.addColorStop(1, '#0d2017');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WHAC.CANVAS_W, WHAC.CANVAS_H);

  // Cabinet shell
  ctx.fillStyle = '#7a3b22';
  ctx.beginPath();
  ctx.roundRect(16, 16, WHAC.CANVAS_W - 32, WHAC.CANVAS_H - 32, 18);
  ctx.fill();
  ctx.fillStyle = '#5d2c19';
  ctx.beginPath();
  ctx.roundRect(16, WHAC.CANVAS_H - 76, WHAC.CANVAS_W - 32, 60, 18);
  ctx.fill();

  // Marquee
  ctx.fillStyle = '#1f1208';
  ctx.beginPath();
  ctx.roundRect(60, 28, WHAC.CANVAS_W - 120, 38, 9);
  ctx.fill();
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 23px "Arial Black", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WHAC-A-MOLE', WHAC.CANVAS_W / 2, 48);
  // Chase lights, same trick as the other cabinets.
  for (let i = 0; i < 18; i++) {
    const lit = (i + Math.floor(now / 180)) % 3 !== 0;
    ctx.fillStyle = lit ? '#ffe98a' : 'rgba(255,233,138,0.22)';
    ctx.beginPath();
    ctx.arc(64 + i * ((WHAC.CANVAS_W - 128) / 17), 24, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grass playfield the holes are cut into
  const pad = 22;
  const grass = ctx.createLinearGradient(0, WHAC.BOARD_TOP - pad, 0, WHAC.BOARD_BOTTOM + pad);
  grass.addColorStop(0, '#3f8f45');
  grass.addColorStop(1, '#27622f');
  ctx.fillStyle = grass;
  ctx.beginPath();
  ctx.roundRect(
    WHAC.BOARD_L - pad,
    WHAC.BOARD_TOP - pad,
    WHAC.BOARD_R - WHAC.BOARD_L + pad * 2,
    WHAC.BOARD_BOTTOM - WHAC.BOARD_TOP + pad * 2,
    14
  );
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Tufts of grass, laid out deterministically so they do not shimmer.
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const gx = WHAC.BOARD_L - pad + ((i * 97) % (WHAC.BOARD_R - WHAC.BOARD_L + pad * 2));
    const gy = WHAC.BOARD_TOP - pad + ((i * 53) % (WHAC.BOARD_BOTTOM - WHAC.BOARD_TOP + pad * 2));
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + 2, gy - 6);
    ctx.stroke();
  }
}

/** The dirt mound and the dark mouth of one hole. Drawn before its mole. */
export function drawHole(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  // Mound of loose dirt around the rim
  ctx.fillStyle = '#6b4a2c';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, WHAC.HOLE_RX + 9, WHAC.HOLE_RY + 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // The hole itself
  ctx.fillStyle = '#17110a';
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX, WHAC.HOLE_RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The front lip of the hole, drawn *after* the mole so the mole reads as
 * coming out of the ground rather than standing on it.
 */
export function drawHoleRim(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = '#8a6239';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX, WHAC.HOLE_RY, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

export interface MoleOptions {
  /** 0 = hidden in the hole, 1 = fully up. */
  pop: number;
  /** Idle wobble phase. */
  phase: number;
  /** 0..1 alarm — eyes widen and the mole cringes as the mallet looms. */
  alarm: number;
  /** True from the moment of impact: flattened, X eyes, stars. */
  hit: boolean;
  /** Dim the moles that have already been knocked out. */
  ghost?: boolean;
  /** Milliseconds since impact, for the stars and the squash recovery. */
  sinceHit?: number;
}

/**
 * One mole, with the hole's centre at local (0, 0). The caller is expected to
 * have clipped to the hole mouth, so the lower half simply disappears.
 */
export function drawMole(
  ctx: CanvasRenderingContext2D,
  color: string,
  initials: string,
  o: MoleOptions
): void {
  const fur = color;
  const belly = lighten(color, 0.5);
  const shade = darken(color, 0.42);

  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.2;

  // How far down in the hole the mole is sitting, plus a little idle wobble.
  const sink = (1 - o.pop) * WHAC.MOLE_RISE;
  const wobble = o.hit ? 0 : Math.sin(o.phase) * 1.6 * o.pop;
  ctx.translate(wobble, sink);

  // A whacked mole is driven down into the hole and squashed flat.
  if (o.hit) {
    const t = Math.min(1, (o.sinceHit ?? 0) / 320);
    ctx.translate(0, 12 * (1 - t) + 10 * t);
    ctx.scale(1 + 0.22 * (1 - t), 0.62 + 0.18 * t);
  } else if (o.alarm > 0) {
    // Cringe: pull the head down into the shoulders a touch.
    ctx.translate(0, o.alarm * 3);
  }

  // Ears
  ctx.fillStyle = shade;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 17, -42, 5.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body/head — one rounded blob, which is how the arcade ones look.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -24, 24, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Paws gripping the rim
  ctx.fillStyle = shade;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 21, -2, 7.5, 5, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Muzzle, with the participant's initials on it like a name badge.
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, -15, 15, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(color, 0.65);
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials.slice(0, 3), 0, -13);

  // Nose
  ctx.fillStyle = '#e8718b';
  ctx.beginPath();
  ctx.ellipse(0, -24, 4, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes — round and widening with alarm, crossed out once hit.
  const eyeR = 4.2 + o.alarm * 1.4;
  for (const ex of [-9, 9]) {
    if (o.hit) {
      ctx.strokeStyle = '#20222a';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4, -38);
      ctx.lineTo(ex + 4, -30);
      ctx.moveTo(ex + 4, -38);
      ctx.lineTo(ex - 4, -30);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f8f8f4';
      ctx.beginPath();
      ctx.arc(ex, -34, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20222a';
      ctx.beginPath();
      ctx.arc(ex, -34 + o.alarm * 0.8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.1;
  for (const side of [-1, 1]) {
    for (const dy of [-18, -14]) {
      ctx.beginPath();
      ctx.moveTo(side * 12, dy);
      ctx.lineTo(side * 24, dy - 3);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Stars spinning over a mole that just took the hit. */
export function drawStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sinceHit: number
): void {
  const t = Math.min(1, sinceHit / 900);
  if (t >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = '#ffe66d';
  for (let i = 0; i < 3; i++) {
    const a = (sinceHit / 220) + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 24;
    const sy = y - 54 - t * 12 + Math.sin(a) * 8;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? 6 : 2.6;
      const pa = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const px = sx + Math.cos(pa) * r;
      const py = sy + Math.sin(pa) * r;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The mallet. `(x, y)` is the centre of the head; `tilt` is the cock-back
 * angle in radians (0 = straight down on the hole, negative = wound up).
 */
export function drawMallet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilt: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Handle, running up and back from the head
  ctx.strokeStyle = '#a86b36';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(26, -96);
  ctx.stroke();
  // Grip wrap
  ctx.strokeStyle = '#4a2e18';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(18, -70);
  ctx.lineTo(26, -96);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#d63a34';
  ctx.beginPath();
  ctx.roundRect(-34, -22, 68, 34, 11);
  ctx.fill();
  // Striking face, lighter so the business end is obvious
  ctx.fillStyle = '#f0564d';
  ctx.beginPath();
  ctx.roundRect(-34, -22, 68, 13, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.roundRect(-34, 4, 68, 8, 6);
  ctx.fill();

  ctx.restore();
}

/** A ring of dust kicked up where the mallet landed. */
export function drawImpactDust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sinceHit: number
): void {
  const t = Math.min(1, sinceHit / 420);
  if (t >= 1) return;
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.55;
  ctx.strokeStyle = '#d8c6a4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX + 10 + t * 34, WHAC.HOLE_RY + 6 + t * 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
