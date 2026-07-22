import { SI, type Fx, type SpaceFrame, type Variant } from './invadersEngine';

/* A stable starfield — generated once with a tiny LCG so it never twinkles
   (Math.random per frame would jitter it). */
interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}
const STARS: Star[] = (() => {
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const out: Star[] = [];
  for (let i = 0; i < 70; i++) {
    out.push({
      x: rnd() * SI.CANVAS_W,
      y: rnd() * SI.CANVAS_H,
      r: 0.5 + rnd() * 1.3,
      a: 0.25 + rnd() * 0.6,
    });
  }
  return out;
})();

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function drawBackground(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, SI.CANVAS_H);
  g.addColorStop(0, '#0a0e28');
  g.addColorStop(1, '#04050f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SI.CANVAS_W, SI.CANVAS_H);
  for (const s of STARS) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#cdd6ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Classic 11×8 invader silhouette drawn as filled blocks. */
const INVADER_ROWS = [
  '00100000100',
  '00010001000',
  '00111111100',
  '01101110110',
  '11111111111',
  '10111111101',
  '10100000101',
  '00011011000',
];

function drawPixelSprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const cols = rows[0].length;
  const unit = size / cols;
  const w = cols * unit;
  const h = rows.length * unit;
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (rows[r][c] === '1') {
        ctx.fillRect(ox + c * unit, oy + r * unit, unit + 0.5, unit + 0.5);
      }
    }
  }
}

export function drawPixelAlien(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  drawPixelSprite(ctx, INVADER_ROWS, cx, cy, size, color);
}

/** A neutral, menacing enemy alien (Defenders horde). Tinted, not a participant. */
export function drawHordeAlien(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): void {
  drawPixelSprite(ctx, INVADER_ROWS, cx, cy, size * 0.9, '#b06bff');
}

/** A defender laser cannon / base, tinted by the participant color. */
export function drawCannon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const w = size;
  const h = size * 0.6;
  ctx.fillStyle = color;
  // base
  roundRectPath(ctx, cx - w / 2, cy - h / 2 + h * 0.35, w, h * 0.65, 4);
  ctx.fill();
  // dome
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, cy - h / 2 + h * 0.35);
  ctx.quadraticCurveTo(cx, cy - h / 2 - h * 0.15, cx + w * 0.28, cy - h / 2 + h * 0.35);
  ctx.closePath();
  ctx.fill();
  // barrel
  ctx.fillStyle = '#e8ecff';
  ctx.fillRect(cx - 2.5, cy - h / 2 - h * 0.15, 5, h * 0.4);
}

/** Draw a participant: photo clipped into a rounded cell (colored frame) or a
 *  procedural sprite fallback, plus a name label. */
export function drawParticipant(
  ctx: CanvasRenderingContext2D,
  variant: Variant,
  cx: number,
  cy: number,
  size: number,
  color: string,
  img: HTMLImageElement | null,
  name: string
): void {
  if (img && img.complete && img.naturalWidth > 0) {
    const s = size;
    ctx.save();
    roundRectPath(ctx, cx - s / 2, cy - s / 2, s, s, 7);
    ctx.clip();
    const scale = Math.max(s / img.naturalWidth, s / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, cx - s / 2, cy - s / 2, s, s, 7);
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  } else if (variant === 'invaders') {
    drawPixelAlien(ctx, cx, cy, size, color);
  } else {
    drawCannon(ctx, cx, cy, size, color);
  }

  // Name label.
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  const label = name.length > 9 ? name.slice(0, 8) + '…' : name;
  const ly = cy + size / 2 + 9;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(label, cx, ly);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, cx, ly);
  ctx.restore();
}

export function drawShot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  kind: 'laser' | 'bomb'
): void {
  if (kind === 'laser') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(x - 1.5, y - 9, 3, 18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 0.7, y - 9, 1.4, 18);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Static shield bunkers (Defenders cosmetic setting). */
export function drawShields(ctx: CanvasRenderingContext2D): void {
  const y = SI.BOTTOM_Y - SI.CELL_H * 0.6 - 4;
  const count = 4;
  const gap = SI.CANVAS_W / (count + 1);
  ctx.fillStyle = '#3ad17a';
  for (let i = 1; i <= count; i++) {
    const x = gap * i;
    roundRectPath(ctx, x - 22, y, 44, 16, 6);
    ctx.fill();
    // notch
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y + 18, 9, Math.PI, 0);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3ad17a';
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, fx: Fx): void {
  const alpha = Math.max(0, fx.life / fx.maxLife);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = fx.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
  ctx.stroke();
  // flash core
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = '#fff2c2';
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, Math.max(0, fx.radius * 0.35), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * One painter for both the live loop and the replay. Consumes a plain frame
 * plus an image cache (keyed by combatant id) so photos render in replay too.
 */
export function paintWorld(
  ctx: CanvasRenderingContext2D,
  frame: SpaceFrame,
  variant: Variant,
  imgCache: Map<number, HTMLImageElement>,
  shields: boolean
): void {
  drawBackground(ctx);
  if (variant === 'defenders' && shields) drawShields(ctx);

  if (variant === 'defenders') {
    for (const h of frame.horde) drawHordeAlien(ctx, h.x, h.y, SI.SPRITE);
  } else {
    // Invaders variant: the AI cannon at the bottom.
    drawCannon(ctx, frame.cannonX, SI.CANNON_Y, SI.SPRITE, '#39ff85');
  }

  for (const c of frame.combatants) {
    if (!c.alive) continue;
    const img = c.hasImage ? imgCache.get(c.id) ?? null : null;
    drawParticipant(ctx, variant, c.x, c.y, SI.SPRITE, c.color, img, c.name);
  }

  for (const s of frame.shots) drawShot(ctx, s.x, s.y, s.color, s.kind);
  for (const fx of frame.fx) drawFx(ctx, fx);
}
