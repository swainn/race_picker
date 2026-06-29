/**
 * Pure canvas-drawing helpers for Kung Fu mode: the shrinking pillar platform,
 * the drawn kung-fu figures (posed per state/move), projectiles, and impact FX.
 *
 * These are pure functions over a passed-in view of the world — no React, no
 * mutable module state — so the live game loop and the slow-mo replay renderer
 * can both call them with either live refs or a recorded frame.
 *
 * Figure style is modeled on WallClimberGame's `drawClimber`: simple primitives,
 * body in the participant color, white limb strokes.
 */
import type { MoveId } from './kungFuMoves';

export type FighterState =
  | 'idle'
  | 'approach'
  | 'attack'
  | 'blocking'
  | 'hitstun'
  | 'knockback'
  | 'falling'
  | 'out';

/** The minimal read-only view of a fighter needed to draw it. Both the live
 *  Fighter and a recorded replay-frame fighter satisfy this shape. */
export interface FighterView {
  x: number;
  y: number;
  facing: 1 | -1;
  state: FighterState;
  color: string;
  currentMove: MoveId | null;
  movePhase: 'windup' | 'active' | 'recover' | null;
  /** 1 while on the platform; lerps 1→0 while falling off (shrink + fade). */
  fallScale: number;
  blocking: boolean;
}

export interface FxView {
  x: number;
  y: number;
  alpha: number;
  radius: number;
  color: string;
  kind: 'hit' | 'block' | 'ringout' | 'star';
  text?: string;
}

/** Draw the background gradient once per frame. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#16213e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw the circular platform as the top of a tall stone pillar. `dangerPulse`
 * (0..1) warms the rim toward red while the platform is actively shrinking.
 */
export function drawPlatform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  dangerPulse: number
): void {
  const sideDrop = r * 0.5;
  const ry = r * 0.34; // vertical squash for the perspective ellipse

  // Pillar side: bottom ellipse + connecting band.
  ctx.fillStyle = '#241f33';
  ctx.beginPath();
  ctx.ellipse(cx, cy + sideDrop, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - r, cy, r * 2, sideDrop);

  // Faint danger ring just outside the rim when shrinking.
  if (dangerPulse > 0.01) {
    ctx.strokeStyle = `rgba(255,80,60,${0.25 * dangerPulse})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r + 6, ry + 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Platform top.
  const top = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  top.addColorStop(0, '#6b6480');
  top.addColorStop(1, '#403a55');
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bright rim (warms toward red while shrinking).
  const rimR = Math.round(120 + 135 * dangerPulse);
  const rimG = Math.round(120 + 40 * (1 - dangerPulse));
  ctx.strokeStyle = `rgba(${rimR},${rimG},130,0.85)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dojo-mat ring.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** Soft contact shadow under a fighter, on the platform plane. */
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14 * scale, 9 * scale, 3.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a kung-fu fighter at its position, posed by state/move. Limb geometry is
 * computed in a local frame (origin at the fighter center, +x = facing forward)
 * and the whole figure is flipped via scale(facing,1). The caller draws name
 * labels separately, OUTSIDE this transform, so text never mirrors.
 */
export function drawFighter(ctx: CanvasRenderingContext2D, f: FighterView, now: number): void {
  if (f.state === 'out') return;

  const fall = f.state === 'falling' ? Math.max(0, f.fallScale) : 1;
  drawShadow(ctx, f.x, f.y, fall);

  ctx.save();
  ctx.translate(f.x, f.y);
  if (f.state === 'falling') {
    ctx.rotate((1 - fall) * 2.4 * f.facing);
    ctx.scale(fall, fall);
    ctx.globalAlpha = fall;
  }
  ctx.scale(f.facing, 1);

  // Cyclic bob / step phase (cosmetic; based on wall-clock so replay matches).
  const moving = f.state === 'approach';
  const cycle = Math.sin(now / 110);
  const bob = moving ? Math.abs(cycle) * 2 : 0;
  const lean =
    f.state === 'knockback' ? -4 :
    f.state === 'hitstun' ? -2 :
    f.currentMove === 'flyingKick' ? 5 : 0;

  const cx = lean;
  const cy = -bob;

  // Legs (white strokes).
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  if (f.currentMove === 'kick' && f.movePhase === 'active') {
    // Extended front kick.
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx + 18, cy + 2);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx - 4, cy + 14);
    ctx.stroke();
  } else if (f.currentMove === 'flyingKick' && (f.movePhase === 'active' || f.movePhase === 'windup')) {
    // Both legs forward, body airborne.
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx + 16, cy + 1);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx + 12, cy + 9);
    ctx.stroke();
  } else {
    const stride = moving ? cycle * 4 : 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx - 4 + stride, cy + 14);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx + 4 + stride * 0.5, cy + 14);
    ctx.stroke();
  }

  // Gi torso in white with a colored belt.
  ctx.fillStyle = '#F2F2F2';
  ctx.beginPath();
  ctx.roundRect(cx - 5, cy - 8, 10, 15, 3);
  ctx.fill();
  // Lapel.
  ctx.fillStyle = '#dfe3ea';
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 8);
  ctx.lineTo(cx, cy - 2);
  ctx.lineTo(cx + 5, cy - 8);
  ctx.closePath();
  ctx.fill();
  // Belt = participant color.
  ctx.fillStyle = f.color;
  ctx.fillRect(cx - 5, cy + 3, 10, 3);

  // Arms.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  if (f.blocking || f.state === 'blocking') {
    // Crossed forearms guard.
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 4);
    ctx.lineTo(cx + 5, cy + 1);
    ctx.moveTo(cx + 4, cy - 4);
    ctx.lineTo(cx - 5, cy + 1);
    ctx.stroke();
  } else if (f.currentMove === 'punch' && f.movePhase === 'active') {
    // Lead punch extended.
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 4);
    ctx.lineTo(cx + 16, cy - 3);
    ctx.moveTo(cx - 3, cy - 4);
    ctx.lineTo(cx - 7, cy + 1);
    ctx.stroke();
    // Fist.
    ctx.fillStyle = '#FFD9B3';
    ctx.beginPath();
    ctx.arc(cx + 17, cy - 3, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.currentMove === 'chiBlast') {
    // Both palms forward; glowing orb during windup.
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy - 4);
    ctx.lineTo(cx + 11, cy - 1);
    ctx.moveTo(cx + 1, cy);
    ctx.lineTo(cx + 11, cy + 2);
    ctx.stroke();
    if (f.movePhase === 'windup') {
      const orb = ctx.createRadialGradient(cx + 14, cy, 0, cx + 14, cy, 7);
      orb.addColorStop(0, 'rgba(160,230,255,0.95)');
      orb.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(cx + 14, cy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Relaxed guard.
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 4);
    ctx.lineTo(cx - 8, cy + 2);
    ctx.moveTo(cx + 4, cy - 4);
    ctx.lineTo(cx + 8, cy + 1);
    ctx.stroke();
  }

  // Head.
  ctx.fillStyle = '#FFD9B3';
  ctx.beginPath();
  ctx.arc(cx, cy - 12, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // Headband in participant color with two trailing tails (the identity cue).
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, cy - 13);
  ctx.lineTo(cx + 4.5, cy - 13);
  ctx.stroke();
  const flick = Math.sin(now / 90) * 2;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 13);
  ctx.quadraticCurveTo(cx - 9, cy - 12 + flick, cx - 11, cy - 9 - flick);
  ctx.moveTo(cx - 4, cy - 12);
  ctx.quadraticCurveTo(cx - 9, cy - 9 + flick, cx - 10, cy - 5 - flick);
  ctx.stroke();

  ctx.restore();
}

/** Draw a chi-blast projectile (glowing orb). */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
  grad.addColorStop(0, '#eafaff');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw an impact / block / ring-out effect. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: FxView): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, fx.alpha));
  if (fx.text) {
    ctx.font = 'bold 18px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(fx.text, fx.x, fx.y);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, fx.x, fx.y);
  } else if (fx.kind === 'star') {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.moveTo(fx.x + Math.cos(a) * fx.radius * 0.4, fx.y + Math.sin(a) * fx.radius * 0.4);
      ctx.lineTo(fx.x + Math.cos(a) * fx.radius, fx.y + Math.sin(a) * fx.radius);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = fx.kind === 'ringout' ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
