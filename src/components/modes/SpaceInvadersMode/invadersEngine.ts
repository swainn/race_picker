import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { shuffle } from '../../../utils/array';

/** Which role the participants play. */
export type Variant = 'invaders' | 'defenders';

export type Speed = 'slow' | 'normal' | 'fast';

/** Layout + physics constants for the Space Invaders family (shared by both
 *  variants). Canvas is a fixed 480×600 portrait; CSS scales it responsively. */
export const SI = {
  CANVAS_W: 480,
  CANVAS_H: 600,
  REVEAL_MS: 2000,
  /** Hard backstop: after this long the victim is force-destroyed so a round
   *  can never stall (mirrors Kung Fu's forced collapse). */
  FORCED_END_MS: 9000,
  /** Wall-clock the explosion animates before the winner dialog fires. */
  DEATH_MS: 750,
  MARGIN: 34,
  CELL_W: 62,
  CELL_H: 54,
  SPRITE: 40,
  /** Invaders: participant formation top row y. */
  TOP_Y: 104,
  /** Defenders: participant (cannon) bottom row baseline y. */
  BOTTOM_Y: 512,
  /** Invaders: the AI cannon's fixed y. */
  CANNON_Y: 556,
  /** Defenders: generic alien horde grid top y. */
  HORDE_TOP_Y: 78,
  HORDE_COLS: 6,
  HORDE_ROWS: 3,
  MARCH_VX: 46, // px/s, before speed factor
  MARCH_STEP: 15, // step-down per edge bounce
  DESCENT_VY: 7, // continuous descent under sudden death
  SHOT_SPEED: 320, // cannon laser (up)
  BOMB_SPEED: 200, // alien bomb (down)
  CANNON_SPEED: 240, // how fast the cannon tracks its target
  FIRE_INTERVAL_MS: 850,
  HIT_TOL_X: 22,
  /** Target-lock drumroll before the fatal shot (scaled by speed). */
  LOCK_MS: 2200,
  RETICLE_HOP_MS: 230,
  /** Bonus mystery UFO. */
  UFO_Y: 52,
  UFO_SPEED: 150,
  STAR_SCROLL_SPEED: 14, // px/s parallax drift
  POWER_CHANCE: 0.55, // odds an invader gets a power when power-ups are on
} as const;

export function speedFactor(speed: Speed): number {
  return speed === 'slow' ? 0.7 : speed === 'fast' ? 1.5 : 1;
}

/**
 * March/fire tempo that escalates *within* a round (elapsed) and is faster the
 * *fewer* invaders remain — the classic accelerating-heartbeat feel. Multiplies
 * the base speed factor.
 */
export function marchTempo(count: number, elapsedMs: number, sudden: boolean): number {
  const fewness = clampNum(1 + (12 - count) * 0.07, 1, 2.0);
  const ramp = 1 + Math.min(elapsedMs / 6000, 1) * 1.1;
  return fewness * ramp * (sudden ? 1.6 : 1);
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Theatrical powers/protections. They never change WHO is eliminated (the
 *  victim is a fair uniform draw) — only how dramatic a round looks. */
export type Power = 'none' | 'shield' | 'blink' | 'rapid' | 'cloak';

const POWER_POOL: Power[] = ['shield', 'blink', 'rapid', 'cloak'];

export const POWER_LABEL: Record<Power, string> = {
  none: '',
  shield: '🛡️',
  blink: '✨',
  rapid: '🔥',
  cloak: '👻',
};

export interface Combatant {
  id: number;
  entry: Entry;
  color: string;
  /** Grid home before any march offset is applied. */
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  alive: boolean;
  power: Power;
  /** Shield protection still intact (absorbs one fatal hit before breaking). */
  shieldUp: boolean;
  /** Blink dodge already spent this round. */
  blinked: boolean;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  kind: 'laser' | 'bomb';
  /** true for the threat's aimed fatal projectile; false for cosmetic ones. */
  live: boolean;
}

export interface Fx {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  growth: number;
  color: string;
}

export interface HordeCell {
  baseX: number;
  baseY: number;
}

/** A replay/paint snapshot. The live loop and the replay share one painter, so
 *  this doubles as the "world" the painter consumes. */
export interface FrameCombatant {
  id: number;
  name: string;
  x: number;
  y: number;
  color: string;
  alive: boolean;
  hasImage: boolean;
  power: Power;
  shielded: boolean;
  alpha: number;
}

export interface SpaceFrame {
  combatants: FrameCombatant[];
  shots: { x: number; y: number; color: string; kind: 'laser' | 'bomb' }[];
  fx: Fx[];
  cannonX: number;
  horde: { x: number; y: number }[];
  /** Parallax star drift offset. */
  starScroll: number;
  /** 0/1 marching-leg animation frame. */
  animFrame: number;
  /** Bonus UFO position, or null when none is on screen. */
  ufo: { x: number; y: number } | null;
  /** Targeting reticle during the lock-on drumroll, or null. */
  reticle: { x: number; y: number; locked: boolean } | null;
}

/** Column count for the participant grid — a roughly-square block, capped at 6
 *  wide so it never overflows the canvas. */
function gridCols(n: number): number {
  return Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.3))));
}

/**
 * Position the participant grid. For `invaders` the block sits at the top and
 * rows grow downward; for `defenders` it hugs the bottom and rows stack upward.
 */
export function layoutCombatants(
  variant: Variant,
  entries: Entry[],
  allEntries: Entry[]
): Combatant[] {
  const n = entries.length;
  const cols = gridCols(n);
  const gridWidth = (cols - 1) * SI.CELL_W;
  const startX = (SI.CANVAS_W - gridWidth) / 2;
  return entries.map((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const baseX = startX + col * SI.CELL_W;
    const baseY =
      variant === 'invaders'
        ? SI.TOP_Y + row * SI.CELL_H
        : SI.BOTTOM_Y - row * SI.CELL_H;
    const colorIdx = allEntries.findIndex((e) => e.id === entry.id);
    return {
      id: entry.id,
      entry,
      color: generateColor(colorIdx < 0 ? i : colorIdx),
      baseX,
      baseY,
      x: baseX,
      y: baseY,
      alive: true,
      power: 'none' as Power,
      shieldUp: false,
      blinked: false,
    };
  });
}

/**
 * Randomly grant theatrical powers to combatants. Each rolls independently;
 * this is flair only — it never touches who the (already-chosen) victim is.
 */
export function assignPowers(combatants: Combatant[], enabled: boolean): void {
  for (const c of combatants) {
    if (enabled && Math.random() < SI.POWER_CHANCE) {
      c.power = POWER_POOL[Math.floor(Math.random() * POWER_POOL.length)];
      c.shieldUp = c.power === 'shield';
    } else {
      c.power = 'none';
      c.shieldUp = false;
    }
    c.blinked = false;
  }
}

/** The generic (non-participant) enemy horde used by the Defenders variant. */
export function layoutHorde(): HordeCell[] {
  const gridWidth = (SI.HORDE_COLS - 1) * SI.CELL_W;
  const startX = (SI.CANVAS_W - gridWidth) / 2;
  const cells: HordeCell[] = [];
  for (let row = 0; row < SI.HORDE_ROWS; row++) {
    for (let col = 0; col < SI.HORDE_COLS; col++) {
      cells.push({
        baseX: startX + col * SI.CELL_W,
        baseY: SI.HORDE_TOP_Y + row * SI.CELL_H,
      });
    }
  }
  return cells;
}

/** Horizontal extent (min/max base x) of a set of cells, for march bouncing. */
export function baseExtent(xs: number[]): { min: number; max: number } {
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

/** Fair uniform-random pick of who gets eliminated this round. */
export function pickVictim(entries: Entry[]): Entry {
  return shuffle(entries)[0];
}
