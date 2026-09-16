import type { AbducteeKind } from './alienAbductionSettingsStore';

/** Drawing helpers for the little folks running around the field.
 *  Every sprite is drawn in a local space where (0, 0) is the feet on the
 *  ground and the creature faces +x. The caller handles position/flip. */

export interface SpriteOptions {
  /** Run-cycle phase in radians. */
  phase: number;
  /** True while the tractor beam has them off the ground (legs dangle, arms flail). */
  lifted: boolean;
}

function legStroke(ctx: CanvasRenderingContext2D, color: string, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
}

/** Two legs swinging out of phase from a hip point. */
function runLegs(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  length: number,
  swing: number,
  spread: number,
  color: string,
  width = 2
) {
  legStroke(ctx, color, width);
  ctx.beginPath();
  ctx.moveTo(hipX - spread, hipY);
  ctx.lineTo(hipX - spread + Math.sin(swing) * length * 0.5, hipY + length);
  ctx.moveTo(hipX + spread, hipY);
  ctx.lineTo(hipX + spread - Math.sin(swing) * length * 0.5, hipY + length);
  ctx.stroke();
}

function darken(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

function drawHuman(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2) * 0.35 : Math.sin(o.phase) * 0.9;

  // Legs
  runLegs(ctx, 0, -11, 11, swing, 1.5, darken(color, 0.5), 2.5);

  // Torso
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-4.5, -22, 9, 12, 3);
  ctx.fill();

  // Arms — straight up and waving while beamed, pumping while running
  legStroke(ctx, '#FFD9B3', 2.5);
  ctx.beginPath();
  if (o.lifted) {
    ctx.moveTo(-3.5, -20);
    ctx.lineTo(-7 + Math.sin(o.phase * 3) * 2, -30);
    ctx.moveTo(3.5, -20);
    ctx.lineTo(7 + Math.sin(o.phase * 3 + 1) * 2, -30);
  } else {
    ctx.moveTo(-3.5, -20);
    ctx.lineTo(-6 - Math.sin(swing) * 4, -13);
    ctx.moveTo(3.5, -20);
    ctx.lineTo(6 + Math.sin(swing) * 4, -13);
  }
  ctx.stroke();

  // Head
  ctx.fillStyle = '#FFD9B3';
  ctx.beginPath();
  ctx.arc(1, -27, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Panicked eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(3, -28, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawCow(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2) * 0.3 : Math.sin(o.phase) * 0.8;

  // Legs (front pair leads the back pair)
  runLegs(ctx, -5, -12, 12, swing, 1.5, '#3b3b3b', 2.2);
  runLegs(ctx, 7, -12, 12, -swing, 1.5, '#3b3b3b', 2.2);

  // Body
  ctx.fillStyle = '#f5f2ec';
  ctx.beginPath();
  ctx.ellipse(0, -18, 12, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Patches in the racer color
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-5, -19, 4, 3.2, 0.3, 0, Math.PI * 2);
  ctx.ellipse(4, -15, 3, 2.4, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -18, 12, 7.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Tail
  legStroke(ctx, '#f5f2ec', 1.5);
  ctx.beginPath();
  ctx.moveTo(-11, -21);
  ctx.quadraticCurveTo(-16, -20, -15, -13 + (o.lifted ? -4 : 0));
  ctx.stroke();

  // Head
  ctx.fillStyle = '#f5f2ec';
  ctx.beginPath();
  ctx.ellipse(13, -22, 5.5, 4.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillStyle = '#f3b0b8';
  ctx.beginPath();
  ctx.ellipse(17, -20, 2.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Horns + ear
  legStroke(ctx, '#e3d9c6', 1.6);
  ctx.beginPath();
  ctx.moveTo(11, -26);
  ctx.lineTo(9, -30);
  ctx.moveTo(15, -26);
  ctx.lineTo(16, -30);
  ctx.stroke();

  // Eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(14, -23.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawChicken(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 3) * 0.5 : Math.sin(o.phase * 1.6) * 1.1;

  // Skinny legs
  runLegs(ctx, 0, -9, 9, swing, 1.2, '#f0a020', 1.8);

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -15, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wing — flapping hard while airborne
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const flap = o.lifted ? Math.sin(o.phase * 6) * 4 : Math.sin(o.phase * 2) * 1.5;
  ctx.ellipse(-1, -15 - flap * 0.4, 4.5, 3, flap * 0.15, 0, Math.PI * 2);
  ctx.stroke();

  // Tail feathers
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-7, -17);
  ctx.lineTo(-14, -23);
  ctx.lineTo(-13, -16);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(6, -22, 4, 0, Math.PI * 2);
  ctx.fill();

  // Comb + wattle
  ctx.fillStyle = '#e63b2e';
  ctx.beginPath();
  ctx.arc(5, -26, 1.6, 0, Math.PI * 2);
  ctx.arc(7.5, -26.5, 1.4, 0, Math.PI * 2);
  ctx.arc(7, -18.5, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#f0a020';
  ctx.beginPath();
  ctx.moveTo(9.5, -22.5);
  ctx.lineTo(14, -21);
  ctx.lineTo(9.5, -20);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(7, -23.5, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawSheep(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2) * 0.3 : Math.sin(o.phase) * 0.85;

  runLegs(ctx, -4, -12, 12, swing, 1.4, '#37343a', 2.2);
  runLegs(ctx, 5, -12, 12, -swing, 1.4, '#37343a', 2.2);

  // Fluffy wool — overlapping puffs
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.arc(i * 4.2, -19 + (i % 2 === 0 ? 0 : -2), 5.5, 0, Math.PI * 2);
  }
  ctx.fill();

  // Collar in racer color
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(9, -23, 3.5, -0.4, 1.6);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#37343a';
  ctx.beginPath();
  ctx.ellipse(12, -25, 4.2, 3.4, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Ear
  ctx.beginPath();
  ctx.ellipse(9.5, -27.5, 2.4, 1.3, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(13.5, -26, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawPig(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2) * 0.3 : Math.sin(o.phase) * 0.8;

  runLegs(ctx, -4, -11, 11, swing, 1.4, darken(color, 0.45), 2.4);
  runLegs(ctx, 5, -11, 11, -swing, 1.4, darken(color, 0.45), 2.4);

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -17, 11, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -17, 11, 7.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Curly tail
  ctx.strokeStyle = darken(color, 0.25);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(-12, -21, 3, Math.PI * 0.2, Math.PI * 1.8);
  ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(11, -20, 5.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ear
  ctx.fillStyle = darken(color, 0.2);
  ctx.beginPath();
  ctx.moveTo(8, -25);
  ctx.lineTo(11, -28);
  ctx.lineTo(12, -23);
  ctx.closePath();
  ctx.fill();

  // Snout
  ctx.fillStyle = '#ffd7e0';
  ctx.beginPath();
  ctx.ellipse(16, -19, 3, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98b9b';
  ctx.beginPath();
  ctx.arc(16.8, -19.6, 0.6, 0, Math.PI * 2);
  ctx.arc(16.8, -18.2, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(12, -21.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawCat(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2.5) * 0.35 : Math.sin(o.phase) * 0.9;

  runLegs(ctx, -4, -11, 11, swing, 1.2, darken(color, 0.4), 2);
  runLegs(ctx, 5, -11, 11, -swing, 1.2, darken(color, 0.4), 2);

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -16, 9.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail — bottle-brushed straight up when panicking
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-9, -17);
  if (o.lifted) {
    ctx.quadraticCurveTo(-14, -22, -13, -29);
  } else {
    ctx.quadraticCurveTo(-15, -18, -13, -25);
  }
  ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(10, -20, 5, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.beginPath();
  ctx.moveTo(6.5, -23.5);
  ctx.lineTo(7, -28);
  ctx.lineTo(10, -24.5);
  ctx.closePath();
  ctx.moveTo(11, -24.5);
  ctx.lineTo(14, -28);
  ctx.lineTo(14, -23.5);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(9, -21, 1, 0, Math.PI * 2);
  ctx.arc(12.5, -21, 1, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(13, -18.5);
  ctx.lineTo(18, -19.5);
  ctx.moveTo(13, -17.5);
  ctx.lineTo(18, -16.5);
  ctx.stroke();
}

function drawDog(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 2.5) * 0.35 : Math.sin(o.phase) * 0.95;

  runLegs(ctx, -4, -11, 11, swing, 1.3, darken(color, 0.4), 2.2);
  runLegs(ctx, 6, -11, 11, -swing, 1.3, darken(color, 0.4), 2.2);

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -16, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wagging/streaming tail
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-9.5, -17);
  ctx.quadraticCurveTo(-15, -20 - Math.sin(o.phase * 3) * 3, -13, -26);
  ctx.stroke();

  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(11, -20, 5, 0, Math.PI * 2);
  ctx.fill();

  // Floppy ear
  ctx.fillStyle = darken(color, 0.3);
  ctx.beginPath();
  ctx.ellipse(8.5, -21 - (o.lifted ? 3 : 0), 2.6, 4.2, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Snout + nose
  ctx.fillStyle = '#f7f3ec';
  ctx.beginPath();
  ctx.ellipse(15.5, -18.5, 3.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(18, -19, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(12, -21.5, 1, 0, Math.PI * 2);
  ctx.fill();

  // Tongue while running
  if (!o.lifted) {
    ctx.fillStyle = '#ff7b8a';
    ctx.beginPath();
    ctx.ellipse(16, -15.5, 1.4, 2.4, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRobot(ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) {
  const swing = o.lifted ? Math.sin(o.phase * 3) * 0.3 : Math.sin(o.phase) * 0.7;

  // Piston legs
  legStroke(ctx, '#9aa3ad', 3);
  ctx.beginPath();
  ctx.moveTo(-3, -12);
  ctx.lineTo(-3 + Math.sin(swing) * 5, 0);
  ctx.moveTo(3, -12);
  ctx.lineTo(3 - Math.sin(swing) * 5, 0);
  ctx.stroke();

  // Chassis
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-6, -24, 12, 13, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-6, -24, 12, 13, 3);
  ctx.stroke();

  // Arms
  legStroke(ctx, '#9aa3ad', 2.4);
  ctx.beginPath();
  if (o.lifted) {
    ctx.moveTo(-5, -22);
    ctx.lineTo(-9, -31);
    ctx.moveTo(5, -22);
    ctx.lineTo(9, -31);
  } else {
    ctx.moveTo(-5, -22);
    ctx.lineTo(-8 - Math.sin(swing) * 3, -14);
    ctx.moveTo(5, -22);
    ctx.lineTo(8 + Math.sin(swing) * 3, -14);
  }
  ctx.stroke();

  // Head
  ctx.fillStyle = '#c9d1d9';
  ctx.beginPath();
  ctx.roundRect(-5, -34, 10, 9, 2.5);
  ctx.fill();

  // Visor eye
  ctx.fillStyle = o.lifted ? '#ff5252' : '#4fd1ff';
  ctx.beginPath();
  ctx.roundRect(-3.5, -31.5, 7, 3, 1.5);
  ctx.fill();

  // Antenna
  legStroke(ctx, '#9aa3ad', 1.4);
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(0, -39);
  ctx.stroke();
  ctx.fillStyle = '#ff5252';
  ctx.beginPath();
  ctx.arc(0, -40, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

const SPRITES: Record<
  AbducteeKind,
  (ctx: CanvasRenderingContext2D, color: string, o: SpriteOptions) => void
> = {
  human: drawHuman,
  cow: drawCow,
  chicken: drawChicken,
  sheep: drawSheep,
  pig: drawPig,
  cat: drawCat,
  dog: drawDog,
  robot: drawRobot,
};

export const ABDUCTEE_KINDS = Object.keys(SPRITES) as AbducteeKind[];

export interface AlienOptions {
  /** Gentle idle/float bob in radians. */
  phase: number;
  /** Raises one arm in a slow wave. */
  waving: boolean;
}

/** The reveal: a classic grey, drawn facing the viewer (feet at (0, 0)).
 *  Not one of the selectable kinds — only the last survivor turns out to be one. */
export function drawAlien(
  ctx: CanvasRenderingContext2D,
  color: string,
  o: AlienOptions
): void {
  const skin = '#a9d9b6';
  const skinDark = '#78ae8c';
  const bob = Math.sin(o.phase) * 0.8;

  ctx.save();
  ctx.translate(0, bob);

  // Spindly legs
  legStroke(ctx, skin, 3);
  ctx.beginPath();
  ctx.moveTo(-2.5, -13);
  ctx.lineTo(-4, 0);
  ctx.moveTo(2.5, -13);
  ctx.lineTo(4, 0);
  ctx.stroke();

  // Jumpsuit torso in the racer's color
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-6, -14);
  ctx.quadraticCurveTo(-8, -26, -5, -31);
  ctx.lineTo(5, -31);
  ctx.quadraticCurveTo(8, -26, 6, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Long arms — one raised in a slow wave once the disguise is off
  legStroke(ctx, skin, 2.6);
  const waveLift = o.waving ? 1 : 0;
  ctx.beginPath();
  ctx.moveTo(-5.5, -29);
  if (waveLift) {
    ctx.quadraticCurveTo(-13, -34, -14 + Math.sin(o.phase * 2) * 3, -44);
  } else {
    ctx.quadraticCurveTo(-10, -24, -9, -14);
  }
  ctx.moveTo(5.5, -29);
  ctx.quadraticCurveTo(10, -24, 9, -14);
  ctx.stroke();

  // Three-fingered hands
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(9, -13, 2.2, 0, Math.PI * 2);
  if (waveLift) {
    ctx.arc(-14 + Math.sin(o.phase * 2) * 3, -45, 2.4, 0, Math.PI * 2);
  } else {
    ctx.arc(-9, -13, 2.2, 0, Math.PI * 2);
  }
  ctx.fill();

  // Neck
  legStroke(ctx, skinDark, 3);
  ctx.beginPath();
  ctx.moveTo(0, -31);
  ctx.lineTo(0, -35);
  ctx.stroke();

  // The big teardrop head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(0, -33);
  ctx.bezierCurveTo(-11, -36, -14, -46, -9, -53);
  ctx.bezierCurveTo(-4, -59, 4, -59, 9, -53);
  ctx.bezierCurveTo(14, -46, 11, -36, 0, -33);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Huge black almond eyes
  ctx.fillStyle = '#0a0f12';
  ctx.beginPath();
  ctx.ellipse(-5, -48, 3.6, 5.4, 0.45, 0, Math.PI * 2);
  ctx.ellipse(5, -48, 3.6, 5.4, -0.45, 0, Math.PI * 2);
  ctx.fill();

  // Eye glints
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-6, -50.5, 0.9, 0, Math.PI * 2);
  ctx.arc(4, -50.5, 0.9, 0, Math.PI * 2);
  ctx.fill();

  // Tiny mouth + nostrils
  ctx.strokeStyle = skinDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, -38.5);
  ctx.lineTo(2, -38.5);
  ctx.stroke();
  ctx.fillStyle = skinDark;
  ctx.beginPath();
  ctx.arc(-1.2, -42, 0.5, 0, Math.PI * 2);
  ctx.arc(1.2, -42, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** The shed disguise, crumpled on the grass. */
export function drawDisguise(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -3, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(3, -4, 5, 2.4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, -3);
  ctx.quadraticCurveTo(-3, -7, 2, -3);
  ctx.stroke();
  ctx.restore();
}

/** Draw an abductee with its feet at (0, 0), facing +x. */
export function drawAbductee(
  ctx: CanvasRenderingContext2D,
  kind: AbducteeKind,
  color: string,
  options: SpriteOptions
): void {
  SPRITES[kind](ctx, color, options);
}
