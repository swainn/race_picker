/**
 * Art for Angry Birds. Pure canvas drawing — no physics, no React. Bodies are
 * drawn around their centre (which is what the sim reports) so the caller only
 * has to hand over a snapshot position and an angle.
 */
import type { BlockKind } from './angryBirdsEngine';

function darken(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

function lighten(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount);
  };
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

/** Initials sit on the belly so a participant is identifiable mid-flight. */
function drawInitials(ctx: CanvasRenderingContext2D, text: string, r: number): void {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.font = `bold ${Math.max(8, Math.round(r * 0.72))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, r * 0.08);
  ctx.restore();
}

export interface PigOptions {
  /** Participant tint. Generic (non-participant) pigs use the classic green. */
  color?: string;
  initials?: string;
  angle?: number;
  /** Dim the ones already out. */
  ghost?: boolean;
}

/** One pig, centred on (x, y). */
export function drawPig(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  opts: PigOptions = {}
): void {
  const base = opts.color ?? '#5FBF3A';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opts.angle ?? 0);
  if (opts.ghost) ctx.globalAlpha = 0.3;

  // Ears
  ctx.fillStyle = darken(base, 0.18);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.52, -r * 0.72);
    ctx.lineTo(side * r * 0.92, -r * 1.12);
    ctx.lineTo(side * r * 0.86, -r * 0.48);
    ctx.closePath();
    ctx.fill();
  }

  // Head
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
  body.addColorStop(0, lighten(base, 0.3));
  body.addColorStop(1, base);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(base, 0.4);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#ffffff';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.34, -r * 0.26, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#16181f';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.34 - r * 0.07, -r * 0.26, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Snout
  ctx.fillStyle = lighten(base, 0.42);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.3, r * 0.42, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(base, 0.5);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.16, r * 0.3, r * 0.07, r * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (opts.initials) {
    ctx.save();
    ctx.translate(x, y + r * 1.55);
    drawInitials(ctx, opts.initials, r);
    ctx.restore();
  }
}

export interface BirdOptions {
  color?: string;
  initials?: string;
  angle?: number;
  /** Squashed and cross-eyed while it is being drawn back. */
  loaded?: boolean;
}

/** One bird, centred on (x, y). */
export function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  opts: BirdOptions = {}
): void {
  const base = opts.color ?? '#E8453C';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opts.angle ?? 0);

  // Tail feathers
  ctx.fillStyle = darken(base, 0.45);
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.2);
  ctx.lineTo(-r * 1.6, -r * 0.7);
  ctx.lineTo(-r * 1.5, r * 0.25);
  ctx.closePath();
  ctx.fill();

  // Body
  const body = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.2, 0, 0, r);
  body.addColorStop(0, lighten(base, 0.32));
  body.addColorStop(1, base);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(base, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Angry brows
  ctx.strokeStyle = '#2a1410';
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.02, -r * 0.62);
  ctx.lineTo(r * 0.5, -r * 0.42);
  ctx.moveTo(r * 0.02, -r * 0.5);
  ctx.lineTo(-r * 0.3, -r * 0.62);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#ffffff';
  for (const side of [0.44, 0.12]) {
    ctx.beginPath();
    ctx.arc(r * side, -r * 0.18, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#16181f';
  for (const side of [0.48, 0.16]) {
    ctx.beginPath();
    ctx.arc(r * side, -r * 0.18, r * (opts.loaded ? 0.07 : 0.1), 0, Math.PI * 2);
    ctx.fill();
  }

  // Beak
  ctx.fillStyle = '#F4A423';
  ctx.beginPath();
  ctx.moveTo(r * 0.72, r * 0.02);
  ctx.lineTo(r * 1.42, r * 0.2);
  ctx.lineTo(r * 0.7, r * 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  if (opts.initials) {
    ctx.save();
    ctx.translate(x, y + r * 1.7);
    drawInitials(ctx, opts.initials, r);
    ctx.restore();
  }
}

/** One wooden block, centred on (x, y) and rotated to the body's angle. */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  kind: BlockKind
): void {
  const base = kind === 'beam' ? '#C98A43' : '#B4762F';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = darken(base, 0.4);
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Grain, along the long axis
  ctx.strokeStyle = darken(base, 0.22);
  ctx.lineWidth = 1;
  const along = w >= h;
  const lines = Math.max(1, Math.round((along ? h : w) / 7));
  for (let i = 1; i < lines; i++) {
    const t = -0.5 + i / lines;
    ctx.beginPath();
    if (along) {
      ctx.moveTo(-w / 2 + 3, h * t);
      ctx.lineTo(w / 2 - 3, h * t);
    } else {
      ctx.moveTo(w * t, -h / 2 + 3);
      ctx.lineTo(w * t, h / 2 - 3);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The slingshot, standing on (x, groundY). `pull` is 0..1 of a full draw and
 * `pouch` is where the pouch currently sits, so the band can be drawn stretched
 * back around a loaded bird.
 */
export function drawSlingshot(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  forkY: number,
  pouch: { x: number; y: number } | null
): void {
  const forkHalf = 15;
  ctx.save();
  ctx.strokeStyle = '#6B4423';
  ctx.lineCap = 'round';

  // Band behind the fork
  if (pouch) {
    ctx.strokeStyle = '#3B2317';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - forkHalf, forkY);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.stroke();
  }

  // Post and fork
  ctx.strokeStyle = '#6B4423';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, forkY + 24);
  ctx.stroke();
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(x, forkY + 26);
  ctx.lineTo(x - forkHalf, forkY - 6);
  ctx.moveTo(x, forkY + 26);
  ctx.lineTo(x + forkHalf, forkY - 6);
  ctx.stroke();

  // Band in front
  if (pouch) {
    ctx.strokeStyle = '#4A2C1A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + forkHalf, forkY);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Puff of smoke where a pig was. `t` runs 0..1. */
export function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const p = Math.max(0, Math.min(1, t));
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const d = 8 + p * 44;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 11 * (1 - p * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
