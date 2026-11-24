import { PIE } from './pieEngine';

/**
 * Canvas drawing for the Pie Eating Contest. Everything here is pure painting:
 * the caller decides where things are and what state they are in.
 *
 * Nothing here uses `shadowBlur`, which ignores the canvas transform and would
 * need the device-pixel scale passed in.
 */

/** Height of the banner strip across the top of the hall. */
const BANNER_H = 60;
/** Where the barn wall meets the plank floor. */
const FLOOR_Y = 214;

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** The harvest-fair hall: barn-wood wall, banner, bunting and a plank floor. */
export function drawHall(ctx: CanvasRenderingContext2D, now: number): void {
  const W = PIE.CANVAS_W;
  const H = PIE.CANVAS_H;

  // Barn-wood wall
  const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  wall.addColorStop(0, '#5a2f14');
  wall.addColorStop(1, '#7a4421');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, FLOOR_Y);
  ctx.strokeStyle = 'rgba(30,12,4,0.35)';
  ctx.lineWidth = 2;
  for (let x = 36; x < W; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, BANNER_H);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
  }
  // A rail where the wall meets the floor
  ctx.fillStyle = '#3d1d0c';
  ctx.fillRect(0, FLOOR_Y - 8, W, 8);

  // Lanterns either side, flickering
  for (const lx of [70, W - 70]) {
    const flicker = 0.8 + 0.2 * Math.abs(Math.sin(now / 190 + lx));
    const glow = ctx.createRadialGradient(lx, 128, 4, lx, 128, 70);
    glow.addColorStop(0, `rgba(255,196,96,${0.4 * flicker})`);
    glow.addColorStop(1, 'rgba(255,196,96,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, 128, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b120a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, BANNER_H);
    ctx.lineTo(lx, 112);
    ctx.stroke();
    ctx.fillStyle = '#2b120a';
    ctx.fillRect(lx - 9, 110, 18, 5);
    ctx.fillRect(lx - 9, 141, 18, 5);
    ctx.fillStyle = `rgba(255,214,120,${flicker})`;
    ctx.fillRect(lx - 7, 115, 14, 26);
  }

  // Plank floor. Seams widen toward the viewer, which is most of the depth cue.
  const floor = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
  floor.addColorStop(0, '#6e4a2a');
  floor.addColorStop(1, '#93673c');
  ctx.fillStyle = floor;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.strokeStyle = 'rgba(40,20,8,0.3)';
  ctx.lineWidth = 2;
  let seam = FLOOR_Y + 12;
  for (let gap = 14; seam < H; gap += 5) {
    ctx.beginPath();
    ctx.moveTo(0, seam);
    ctx.lineTo(W, seam);
    ctx.stroke();
    seam += gap;
  }

  // Banner across the top
  ctx.fillStyle = '#2b120a';
  ctx.fillRect(0, 0, W, BANNER_H);
  ctx.fillStyle = '#f6e7c4';
  ctx.beginPath();
  ctx.roundRect(110, 9, W - 220, BANNER_H - 20, 6);
  ctx.fill();
  ctx.strokeStyle = '#b3401e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(115, 14, W - 230, BANNER_H - 30, 4);
  ctx.stroke();
  ctx.fillStyle = '#b3401e';
  ctx.font = 'bold 24px "Arial Black", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PIE EATING CONTEST', W / 2, BANNER_H / 2);

  // Bunting strung under the banner, swaying a little
  const FLAGS = ['#E2711D', '#f6e7c4', '#b3401e', '#e8b33a', '#6b8f3a'];
  const flagW = 30;
  const count = Math.ceil(W / flagW);
  ctx.strokeStyle = '#2b120a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const x = i * flagW;
    const y = BANNER_H + 4 + Math.sin((x / W) * Math.PI) * 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < count; i++) {
    const x = i * flagW;
    const y0 = BANNER_H + 4 + Math.sin((x / W) * Math.PI) * 10;
    const y1 = BANNER_H + 4 + Math.sin(((x + flagW) / W) * Math.PI) * 10;
    const sway = Math.sin(now / 520 + i * 0.9) * 2.5;
    ctx.fillStyle = FLAGS[i % FLAGS.length];
    ctx.beginPath();
    ctx.moveTo(x + 3, y0);
    ctx.lineTo(x + flagW - 3, y1);
    ctx.lineTo(x + flagW / 2 + sway, (y0 + y1) / 2 + 20);
    ctx.closePath();
    ctx.fill();
  }
}

/** One row's table: a red-and-white checkered cloth, top line at `y`. */
export function drawTable(ctx: CanvasRenderingContext2D, y: number, scale: number): void {
  const left = PIE.LINE_L - 18;
  const width = PIE.LINE_R - PIE.LINE_L + 36;
  const topH = 20 * scale;
  const dropH = 24 * scale;
  const top = y - topH / 2;
  const check = 12 * scale;

  ctx.save();
  // Shadow the table throws on the floor
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(left + 6, top + topH + dropH, width - 12, 5 * scale);

  ctx.beginPath();
  ctx.rect(left, top, width, topH + dropH);
  ctx.clip();
  ctx.fillStyle = '#fbf4e6';
  ctx.fillRect(left, top, width, topH + dropH);
  ctx.fillStyle = '#c8322b';
  const cols = Math.ceil(width / check);
  const rows = Math.ceil((topH + dropH) / check);
  for (let r = 0; r < rows; r++) {
    for (let c = (r % 2); c < cols; c += 2) {
      ctx.fillRect(left + c * check, top + r * check, check, check);
    }
  }
  // The cloth hanging over the front edge sits in shade
  ctx.fillStyle = 'rgba(60,10,6,0.28)';
  ctx.fillRect(left, top + topH, width, dropH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(left, top, width, 2 * scale);
  ctx.restore();
}

export interface EaterOptions {
  color: string;
  initials: string;
  avatar: HTMLImageElement | null;
  /** 0..1 of the pie eaten. */
  progress: number;
  /** 0..1 head-bob phase: one full dip toward the pie and back. */
  chomp: number;
  /** Too much pie: feeling sick, not eating. */
  stalled: boolean;
  /** Clock in milliseconds, for the dizzy swirl. */
  now: number;
  /** Clean plate, arms up. */
  finished: boolean;
  /** Milliseconds since the plate was cleared. */
  sinceFinish: number;
}

/** A spinning swirl over the head: the cartoon sign for dizzy. */
function drawDizzySwirl(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now / 260);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const TURNS = 2;
  const STEPS = 28;
  for (const [colour, width] of [['#1d3a12', 4.5], ['#dcff9a', 2]] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      const a = f * TURNS * Math.PI * 2;
      const px = Math.cos(a) * r * f;
      const py = Math.sin(a) * r * f;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * One contestant, head and shoulders, seated behind the table whose top line
 * is at `y`. Draw the table and the pie afterwards so they sit in front.
 */
export function drawEater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  o: EaterOptions
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const jump = o.finished ? -Math.abs(Math.sin(o.sinceFinish / 130)) * 6 : 0;
  ctx.translate(0, jump);

  // Shoulders, disappearing behind the table
  ctx.fillStyle = o.color;
  ctx.beginPath();
  ctx.moveTo(-23, 6);
  ctx.lineTo(-23, -22);
  ctx.quadraticCurveTo(-22, -36, -8, -37);
  ctx.lineTo(8, -37);
  ctx.quadraticCurveTo(22, -36, 23, -22);
  ctx.lineTo(23, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = darken(o.color, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();

  if (o.finished) {
    // Both arms up
    const wave = Math.sin(o.sinceFinish / 110) * 3;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.strokeStyle = darken(o.color, 0.4);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(side * 19, -28);
      ctx.lineTo(side * (25 + wave * side), -72);
      ctx.stroke();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#f2c9a0';
      ctx.beginPath();
      ctx.arc(side * (25 + wave * side), -76, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Blue ribbon
    ctx.fillStyle = '#1f5fbf';
    ctx.beginPath();
    ctx.moveTo(8, -18);
    ctx.lineTo(5, -4);
    ctx.lineTo(11, -8);
    ctx.lineTo(17, -4);
    ctx.lineTo(14, -18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11, -21, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd95a';
    ctx.beginPath();
    ctx.arc(11, -21, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // The head dips toward the pie with each chomp.
  const dip = o.finished ? 0 : Math.sin(Math.max(0, Math.min(1, o.chomp)) * Math.PI) * 13;
  const headY = -55 + dip;
  const r = 17;
  const photo = o.avatar && o.avatar.complete && o.avatar.naturalWidth > 0 ? o.avatar : null;

  if (photo) {
    // A black disc behind it: participant pictures are cut-outs, and the hall
    // would otherwise show straight through the face.
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.clip();
    const fit = Math.max((r * 2) / photo.naturalWidth, (r * 2) / photo.naturalHeight);
    const w = photo.naturalWidth * fit;
    const h = photo.naturalHeight * fit;
    ctx.drawImage(photo, -w / 2, headY - h / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = lighten(o.color, 0.6);
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = darken(o.color, 0.65);
    ctx.fillText(o.initials.slice(0, 3), 0, headY + 1);
  }

  if (o.stalled) {
    // Feeling sick: the whole face goes green.
    ctx.fillStyle = 'rgba(95,185,55,0.55)';
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = o.stalled ? '#3f9a2a' : darken(o.color, 0.4);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, headY, r, 0, Math.PI * 2);
  ctx.stroke();

  if (o.stalled) drawDizzySwirl(ctx, 0, headY - r - 10, 8, o.now);

  ctx.restore();
}

/**
 * A pumpkin pie on the table, seen from a little above. `remaining` (0..1) is
 * the fraction still uneaten, drawn as a sector starting at 12 o'clock; the
 * tin stays put so a clean plate still reads as a plate.
 */
export function drawPie(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  remaining: number
): void {
  const left = Math.max(0, Math.min(1, remaining));
  const R = 20;

  ctx.save();
  ctx.translate(x, y);
  // Squash a circle into the ellipse a round tin makes on a table top.
  ctx.scale(scale, scale * 0.46);

  // Tin
  ctx.fillStyle = '#7d8790';
  ctx.beginPath();
  ctx.arc(0, 3, R + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9d1d8';
  ctx.beginPath();
  ctx.arc(0, 0, R + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9aa4ad';
  ctx.beginPath();
  ctx.arc(0, 0, R - 3, 0, Math.PI * 2);
  ctx.fill();

  if (left > 0.001) {
    const from = -Math.PI / 2;
    const to = from + left * Math.PI * 2;
    const sector = (radius: number) => {
      ctx.beginPath();
      if (left >= 0.999) {
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
      } else {
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, from, to);
        ctx.closePath();
      }
    };
    // Crust rim, then the filling inside it
    ctx.fillStyle = '#c98a3f';
    sector(R);
    ctx.fill();
    ctx.fillStyle = '#E2711D';
    sector(R - 4);
    ctx.fill();
    // Slice cuts, so the pie visibly goes a slice at a time
    ctx.save();
    sector(R - 4);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,50,8,0.45)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const a = from + (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();
    // A dollop of cream while there is a middle left to hold it
    if (left > 0.5) {
      ctx.fillStyle = '#fff8ea';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Crumbs flying off a pie at (x, y). `t` is a looping 0..1 phase. */
export function drawCrumbs(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const COUNT = 6;
  ctx.save();
  for (let i = 0; i < COUNT; i++) {
    const local = (((t + i / COUNT) % 1) + 1) % 1;
    // Fixed fan of directions, so the spray is steady rather than noisy.
    const a = -Math.PI / 2 + (i - (COUNT - 1) / 2) * 0.42;
    const d = 5 + local * 20;
    const px = x + Math.cos(a) * d;
    const py = y - 4 + Math.sin(a) * d + local * local * 12;
    ctx.globalAlpha = 1 - local;
    ctx.fillStyle = i % 2 === 0 ? '#c98a3f' : '#E2711D';
    ctx.fillRect(px - 1.3, py - 1.3, 2.6, 2.6);
  }
  ctx.restore();
}

/** A big "3 / 2 / 1 / EAT!" over the hall. `t` is 0..1 through this label. */
export function drawCountdown(ctx: CanvasRenderingContext2D, label: string, t: number): void {
  const c = Math.max(0, Math.min(1, t));
  // Pops in oversized, settles, then fades toward the next one.
  const pop = 1 + Math.max(0, 1 - c * 4) * 0.5;
  ctx.save();
  ctx.translate(PIE.CANVAS_W / 2, PIE.CANVAS_H / 2 - 40);
  ctx.scale(pop, pop);
  ctx.globalAlpha = Math.min(1, (1 - c) * 2.5);
  ctx.font = `bold ${label.length > 1 ? 84 : 120}px "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2b120a';
  ctx.lineWidth = 12;
  ctx.strokeText(label, 0, 0);
  ctx.fillStyle = '#FFD9A0';
  ctx.fillText(label, 0, 0);
  ctx.restore();
}
