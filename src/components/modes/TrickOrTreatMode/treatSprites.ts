import { TOT } from './treatEngine';

/**
 * Canvas drawing for Trick-or-Treat. Everything here is pure painting: the
 * caller decides where things are and what state they are in.
 */

export type Costume = 'ghost' | 'vampire' | 'witch' | 'pumpkin' | 'skeleton' | 'cat' | 'mummy';

export const COSTUMES: Costume[] = [
  'ghost', 'vampire', 'witch', 'pumpkin', 'skeleton', 'cat', 'mummy',
];

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

/** The house, the night behind it and the lit doorway the hand comes from. */
export function drawPorch(ctx: CanvasRenderingContext2D, now: number): void {
  const W = TOT.CANVAS_W;
  const H = TOT.CANVAS_H;

  // Night sky
  const sky = ctx.createLinearGradient(0, 0, 0, TOT.PORCH_Y);
  sky.addColorStop(0, '#0b0a1e');
  sky.addColorStop(0.6, '#1b1335');
  sky.addColorStop(1, '#2d1b3d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, TOT.PORCH_Y);

  // Moon, low and huge behind the house
  ctx.save();
  const glow = ctx.createRadialGradient(92, 86, 8, 92, 86, 90);
  glow.addColorStop(0, 'rgba(255,238,190,0.35)');
  glow.addColorStop(1, 'rgba(255,238,190,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(92, 86, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6edc8';
  ctx.beginPath();
  ctx.arc(92, 86, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.arc(80, 76, 7, 0, Math.PI * 2);
  ctx.arc(100, 97, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The house front
  ctx.fillStyle = '#241a30';
  ctx.fillRect(0, 150, W, TOT.DECK_Y - 150);
  ctx.fillStyle = '#1b1426';
  ctx.beginPath();
  ctx.moveTo(-10, 150);
  ctx.lineTo(W / 2, 54);
  ctx.lineTo(W + 10, 150);
  ctx.closePath();
  ctx.fill();

  // Lit windows either side
  for (const wx of [86, W - 152]) {
    ctx.fillStyle = '#120d1c';
    ctx.fillRect(wx - 7, 199, 80, 66);
    ctx.fillStyle = 'rgba(255,186,74,0.85)';
    ctx.fillRect(wx, 206, 66, 52);
    ctx.strokeStyle = '#120d1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(wx + 33, 206);
    ctx.lineTo(wx + 33, 258);
    ctx.moveTo(wx, 232);
    ctx.lineTo(wx + 66, 232);
    ctx.stroke();
  }

  // The open door, spilling light onto the porch
  const dl = TOT.DOOR_X - TOT.DOOR_W / 2;
  ctx.fillStyle = '#120d1c';
  ctx.fillRect(dl - 8, TOT.DOOR_TOP - 8, TOT.DOOR_W + 16, TOT.DECK_Y - TOT.DOOR_TOP + 8);
  const light = ctx.createLinearGradient(0, TOT.DOOR_TOP, 0, TOT.DECK_Y);
  light.addColorStop(0, '#ffcd73');
  light.addColorStop(1, '#f0a23c');
  ctx.fillStyle = light;
  ctx.fillRect(dl, TOT.DOOR_TOP, TOT.DOOR_W, TOT.DECK_Y - TOT.DOOR_TOP);

  // The pool of light it throws down the porch
  // Porch boards, running in perspective from the door out to the viewer.
  const boards = ctx.createLinearGradient(0, TOT.DECK_Y, 0, H);
  boards.addColorStop(0, '#2a1d33');
  boards.addColorStop(0.45, '#4a3550');
  boards.addColorStop(1, '#39284a');
  ctx.fillStyle = boards;
  ctx.fillRect(0, TOT.DECK_Y, W, H - TOT.DECK_Y);
  // Board seams widen toward the viewer, which is most of the depth cue.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  let seam = TOT.DECK_Y + 14;
  for (let gap = 16; seam < H; gap += 5) {
    ctx.beginPath();
    ctx.moveTo(0, seam);
    ctx.lineTo(W, seam);
    ctx.stroke();
    seam += gap;
  }

  // The light the doorway throws across the deck
  ctx.save();
  const spill = ctx.createLinearGradient(0, TOT.DECK_Y, 0, H);
  spill.addColorStop(0, 'rgba(255,190,90,0.26)');
  spill.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.moveTo(dl, TOT.DECK_Y);
  ctx.lineTo(dl + TOT.DOOR_W, TOT.DECK_Y);
  ctx.lineTo(dl + TOT.DOOR_W + 190, H);
  ctx.lineTo(dl - 190, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // A couple of jack-o'-lanterns flanking the door, flickering
  // Set at the front corners of the deck, where they cannot sit on top of
  // anyone in the line.
  for (const [px, s] of [[40, 1], [W - 40, 0.88]] as const) {
    drawPumpkinLantern(ctx, px, H - 22, s, now);
  }
}

function drawPumpkinLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  now: number
): void {
  const flicker = 0.78 + 0.22 * Math.abs(Math.sin(now / 160 + x));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const glow = ctx.createRadialGradient(0, -16, 4, 0, -16, 60);
  glow.addColorStop(0, `rgba(255,150,40,${0.3 * flicker})`);
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -16, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d2691e';
  ctx.beginPath();
  ctx.ellipse(0, -16, 24, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,58,16,0.6)';
  ctx.lineWidth = 1.4;
  for (const dx of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.ellipse(dx, -16, 5, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3f6128';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(3, -42);
  ctx.stroke();

  // Face
  ctx.fillStyle = `rgba(255,214,120,${flicker})`;
  for (const ex of [-9, 9]) {
    ctx.beginPath();
    ctx.moveTo(ex - 5, -22);
    ctx.lineTo(ex + 5, -22);
    ctx.lineTo(ex, -13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-11, -8);
  ctx.lineTo(11, -8);
  ctx.lineTo(7, -2);
  ctx.lineTo(3, -6);
  ctx.lineTo(-3, -6);
  ctx.lineTo(-7, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface KidOptions {
  costume: Costume;
  color: string;
  initials: string;
  /** Idle bob phase. */
  phase: number;
  /** 0..1 — leans in and lifts the bag as the hand arrives. */
  hopeful: number;
  /** True once the candy is in: jumping, bag glowing. */
  treated: boolean;
  /** Milliseconds since the candy landed, for the celebration. */
  sinceTreat?: number;
  /** Dim the ones already picked in earlier rounds. */
  ghosted?: boolean;
  /** The participant's photo, worn as the face under the costume. */
  avatar?: HTMLImageElement | null;
}

/** One trick-or-treater, drawn from their feet at (x, y). */
export function drawKid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  o: KidOptions
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (o.ghosted) ctx.globalAlpha = 0.25;

  const bob = Math.sin(o.phase) * 1.8;
  // A treated child jumps; everyone else just shifts their weight.
  const hop = o.treated ? -Math.abs(Math.sin((o.sinceTreat ?? 0) / 120)) * 14 : 0;
  ctx.translate(0, bob + hop);

  const lean = o.hopeful * 4;
  const body = o.color;

  // Shadow on the boards
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  drawCostumeBody(ctx, o.costume, body, lean);
  drawFace(ctx, o, body);
  drawBag(ctx, o);

  ctx.restore();
}

function drawCostumeBody(
  ctx: CanvasRenderingContext2D,
  costume: Costume,
  color: string,
  lean: number
): void {
  ctx.save();
  ctx.translate(lean * 0.4, 0);

  // Legs, except for the ones that float or are a pumpkin
  if (costume !== 'ghost' && costume !== 'pumpkin') {
    ctx.strokeStyle = '#201828';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 8, -18);
      ctx.lineTo(side * 10, -2);
      ctx.stroke();
    }
  }

  switch (costume) {
    case 'ghost': {
      ctx.fillStyle = '#eef0f6';
      ctx.beginPath();
      ctx.moveTo(-21, -2);
      ctx.quadraticCurveTo(-24, -58, 0, -58);
      ctx.quadraticCurveTo(24, -58, 21, -2);
      // A scalloped hem
      for (let i = 0; i < 4; i++) {
        const x0 = 21 - i * 10.5;
        ctx.quadraticCurveTo(x0 - 5.25, 6, x0 - 10.5, -2);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'vampire': {
      ctx.fillStyle = '#1b1b24';
      ctx.beginPath();
      ctx.moveTo(-20, -4);
      ctx.lineTo(-13, -46);
      ctx.lineTo(13, -46);
      ctx.lineTo(20, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8f1d2a';
      ctx.beginPath();
      ctx.moveTo(-13, -46);
      ctx.lineTo(13, -46);
      ctx.lineTo(9, -12);
      ctx.lineTo(-9, -12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'witch': {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-22, -2);
      ctx.lineTo(-11, -48);
      ctx.lineTo(11, -48);
      ctx.lineTo(22, -2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'pumpkin': {
      ctx.fillStyle = '#e07b22';
      ctx.beginPath();
      ctx.ellipse(0, -26, 23, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,62,14,0.55)';
      ctx.lineWidth = 1.6;
      for (const dx of [-9, 0, 9]) {
        ctx.beginPath();
        ctx.ellipse(dx, -26, 5, 26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'skeleton': {
      ctx.fillStyle = '#17161d';
      ctx.beginPath();
      ctx.roundRect(-17, -50, 34, 48, 8);
      ctx.fill();
      ctx.strokeStyle = '#e9e9ef';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(0, -12);
      ctx.stroke();
      for (const ry of [-40, -32, -24]) {
        ctx.beginPath();
        ctx.moveTo(-10, ry);
        ctx.lineTo(10, ry);
        ctx.stroke();
      }
      break;
    }
    case 'cat': {
      ctx.fillStyle = '#2a2730';
      ctx.beginPath();
      ctx.roundRect(-18, -50, 36, 48, 10);
      ctx.fill();
      // Tail
      ctx.strokeStyle = '#2a2730';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(16, -12);
      ctx.quadraticCurveTo(34, -18, 28, -38);
      ctx.stroke();
      break;
    }
    case 'mummy': {
      ctx.fillStyle = '#ddd6c2';
      ctx.beginPath();
      ctx.roundRect(-18, -50, 36, 48, 9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,108,82,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const y = -46 + i * 9;
        ctx.beginPath();
        ctx.moveTo(-18, y);
        ctx.lineTo(18, y + (i % 2 ? 4 : -3));
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, o: KidOptions, color: string): void {
  const headY = o.costume === 'pumpkin' ? -34 : -58;
  const r = 15;
  const photo = o.avatar && o.avatar.complete && o.avatar.naturalWidth > 0 ? o.avatar : null;

  // Hat or hood first, so it sits behind the face.
  if (o.costume === 'witch') {
    ctx.fillStyle = '#20162c';
    ctx.beginPath();
    ctx.moveTo(-20, headY - 12);
    ctx.lineTo(2, headY - 48);
    ctx.lineTo(20, headY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-26, headY - 14, 52, 5);
  }
  if (o.costume === 'cat') {
    ctx.fillStyle = '#2a2730';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 5, headY - 12);
      ctx.lineTo(side * 15, headY - 28);
      ctx.lineTo(side * 16, headY - 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (photo) {
    // A black disc behind it: participant pictures are cut-outs, and the porch
    // would otherwise show straight through the face.
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max((r * 2) / photo.naturalWidth, (r * 2) / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, -w / 2, headY - h / 2, w, h);
    ctx.restore();
    ctx.strokeStyle = darken(color, 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (o.costume === 'ghost') {
    // The sheet has eyeholes rather than a face.
    ctx.fillStyle = '#2a2a35';
    for (const ex of [-6, 6]) {
      ctx.beginPath();
      ctx.ellipse(ex, headY, 4, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, headY + 11, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.costume === 'pumpkin') {
    ctx.fillStyle = '#2a1708';
    for (const ex of [-7, 7]) {
      ctx.beginPath();
      ctx.moveTo(ex - 4, headY - 3);
      ctx.lineTo(ex + 4, headY - 3);
      ctx.lineTo(ex, headY + 5);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = o.costume === 'skeleton' || o.costume === 'mummy' ? '#ece7da' : '#f2c9a0';
    ctx.beginPath();
    ctx.arc(0, headY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20202a';
    for (const ex of [-5.5, 5.5]) {
      ctx.beginPath();
      ctx.arc(ex, headY - 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.costume === 'vampire') {
      ctx.fillStyle = '#fff';
      for (const ex of [-4, 4]) {
        ctx.beginPath();
        ctx.moveTo(ex - 2.5, headY + 5);
        ctx.lineTo(ex + 2.5, headY + 5);
        ctx.lineTo(ex, headY + 11);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = '#20202a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, headY + 3, 5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  // Name tag on the costume, so everyone can be told apart.
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(o.initials.slice(0, 3), 0, headY - 24);
  ctx.fillStyle = lighten(color, 0.45);
  ctx.fillText(o.initials.slice(0, 3), 0, headY - 24);
}

function drawBag(ctx: CanvasRenderingContext2D, o: KidOptions): void {
  const y = -TOT.BAG_LIFT - o.hopeful * 6;
  const w = TOT.BAG_W;
  const h = TOT.BAG_H;

  // Arms holding it up
  ctx.strokeStyle = '#201828';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 14, -34);
    ctx.lineTo(side * (w / 2 - 2), y + h / 2);
    ctx.stroke();
  }

  if (o.treated) {
    const t = Math.min(1, (o.sinceTreat ?? 0) / 500);
    const glow = ctx.createRadialGradient(0, y, 2, 0, y, 42);
    glow.addColorStop(0, `rgba(255,206,92,${0.6 * (1 - t * 0.4)})`);
    glow.addColorStop(1, 'rgba(255,206,92,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, y, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f0872a';
  ctx.beginPath();
  ctx.roundRect(-w / 2, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2, y - h / 2, w, 5);
  ctx.fillStyle = '#20202a';
  ctx.beginPath();
  ctx.moveTo(-6, y + 2);
  ctx.lineTo(0, y - 5);
  ctx.lineTo(6, y + 2);
  ctx.closePath();
  ctx.fill();
}

/** The hand reaching out of the doorway, holding a sweet. */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  holding: boolean
): void {
  ctx.save();
  // A sleeve running back to the doorway, so the hand belongs to someone.
  // Drawn as a taper — wide at the shoulder, narrow at the wrist — because a
  // single-width stroke reads as a plank laid across the porch.
  const sx = TOT.DOOR_X;
  const sy = TOT.DOOR_TOP + 86;
  const cx = (sx + x) / 2;
  const cy = y - 60;
  const pt = (t: number) => ({
    x: (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * x,
    y: (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * (y - 8),
  });
  const half = (t: number) => 13 - 7 * t;
  ctx.fillStyle = '#4c3760';
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const p = pt(i / 16);
    ctx.lineTo(p.x - half(i / 16), p.y);
  }
  for (let i = 16; i >= 0; i--) {
    const p = pt(i / 16);
    ctx.lineTo(p.x + half(i / 16), p.y);
  }
  ctx.closePath();
  ctx.fill();
  // A cuff where the sleeve ends and the wrist begins.
  const wrist = pt(0.92);
  ctx.fillStyle = '#2f2240';
  ctx.beginPath();
  ctx.ellipse(wrist.x, wrist.y, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // The hand itself. Outlined, and a shade warmer than the children's faces,
  // so it stays legible where it passes in front of the line.
  ctx.fillStyle = '#f8d2a8';
  ctx.strokeStyle = '#1a1226';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 16, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Fingers curled around whatever is being offered
  ctx.strokeStyle = '#d6a179';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 7, y + 8, 5, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  if (holding) drawCandy(ctx, x, y + 16, 1);
  ctx.restore();
}

/** A wrapped sweet. */
export function drawCandy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  spin = 0
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(spin);
  ctx.fillStyle = '#ff5f7a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-2, -2, 2.6, 1.8, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd1dc';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 7, -1);
    ctx.lineTo(side * 14, -5);
    ctx.lineTo(side * 14, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Sparkles bursting out of a bag that just got something good. */
export function drawSparkles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number
): void {
  if (t > 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = '#ffe27a';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = 10 + t * 34;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d - t * 10;
    ctx.beginPath();
    ctx.arc(px, py, 2.6 * (1 - t) + 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
