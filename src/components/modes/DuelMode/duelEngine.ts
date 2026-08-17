import type { Entry } from '../../../types';
import { shuffle } from '../../../utils/array';
import type { DuelCharacter } from './duelCharacters';

/** Layout + tuning for the side-view Street Duel. Portrait canvas (480×600):
 *  health bars up top, a side-view stage in the middle, a spectator crowd below. */
export const DL = {
  CANVAS_W: 480,
  CANVAS_H: 600,
  GROUND_Y: 402, // fighters' feet rest here
  STAGE_L: 60, // left bound of a fighter's center
  STAGE_R: 420, // right bound of a fighter's center
  P1_START: 172,
  P2_START: 308,
  FIGHTER_HALF_W: 15,
  WALK_SPEED: 96,
  JUMP_VY: 360, // initial jump velocity (px/s up)
  GRAVITY: 1150,
  MAX_HP: 66,

  // Super meter (fills to full ~once or twice per duel).
  METER_MAX: 70,
  METER_ON_HIT: 22, // gained by the attacker per landed hit
  METER_ON_TAKEN: 15, // gained by the victim (comeback factor)
  METER_ON_BLOCK: 6,

  // Phase timings (ms).
  INTRO_MS: 1700, // "ALICE vs BOB" splash
  ANNOUNCE_MS: 950, // "ROUND 1 / FIGHT!"
  KO_MS: 2100, // KO slow-mo + winner pose before the dialog
  HITSTUN_MS: 320,
  BLOCKSTUN_MS: 200,
  ROUND_TIME_S: 20, // backstop; low-HP fighter loses at time-up

  HADOKEN_SPEED: 250,
  HADOKEN_RANGE: 460,
} as const;

/** Cycling arena backdrops, each with its own 8-bit track. */
export type StageId = 'city' | 'jungle' | 'space' | 'desert';
export const STAGE_IDS: StageId[] = ['city', 'jungle', 'space', 'desert'];

export type DuelMoveId =
  | 'punch'
  | 'kick'
  | 'hadoken'
  | 'shoryuken'
  | 'superCombo'
  | 'superFireball';

export interface DuelMove {
  id: DuelMoveId;
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  cooldownMs: number;
  reach: number;
  dmg: number;
  /** Horizontal knockback on hit. */
  knockback: number;
  isProjectile?: boolean;
  /** Launches the victim upward (anti-air uppercut). */
  launch?: boolean;
  callout?: string;
  /** Chip damage dealt even when blocked. */
  chip?: number;
}

export const DUEL_MOVES: Record<DuelMoveId, DuelMove> = {
  punch: {
    id: 'punch', windupMs: 80, activeMs: 80, recoverMs: 130, cooldownMs: 200,
    reach: 40, dmg: 10, knockback: 40,
  },
  kick: {
    id: 'kick', windupMs: 140, activeMs: 100, recoverMs: 220, cooldownMs: 420,
    reach: 52, dmg: 16, knockback: 90,
  },
  hadoken: {
    id: 'hadoken', windupMs: 220, activeMs: 0, recoverMs: 320, cooldownMs: 1300,
    reach: 30, dmg: 14, knockback: 70, isProjectile: true, callout: 'HADOKEN!', chip: 4,
  },
  shoryuken: {
    id: 'shoryuken', windupMs: 120, activeMs: 220, recoverMs: 380, cooldownMs: 1700,
    reach: 46, dmg: 20, knockback: 120, launch: true, callout: 'SHORYUKEN!',
  },
  // ---- Supers (spent from a full meter) ----
  superCombo: {
    id: 'superCombo', windupMs: 240, activeMs: 640, recoverMs: 520, cooldownMs: 0,
    reach: 56, dmg: 6, knockback: 24, callout: 'SUPER COMBO!',
  },
  superFireball: {
    id: 'superFireball', windupMs: 300, activeMs: 0, recoverMs: 560, cooldownMs: 0,
    reach: 30, dmg: 30, knockback: 170, isProjectile: true, callout: 'SUPER FIREBALL!', chip: 10,
  },
};

export const DUEL_MOVE_IDS: DuelMoveId[] = [
  'punch', 'kick', 'hadoken', 'shoryuken', 'superCombo', 'superFireball',
];

export type DuelState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'block'
  | 'jump'
  | 'hurt'
  | 'ko'
  | 'win';

export interface DuelFighter {
  entry: Entry;
  color: string;
  side: 1 | -1; // 1 = left fighter (faces right), -1 = right fighter (faces left)
  facing: 1 | -1;
  x: number;
  /** Height above the ground (0 = standing). */
  air: number;
  vy: number;
  hp: number;
  state: DuelState;
  stateUntil: number;
  currentMove: DuelMoveId | null;
  movePhase: 'windup' | 'active' | 'recover' | null;
  movePhaseUntil: number;
  cooldowns: Record<DuelMoveId, number>;
  nextDecisionAt: number;
  blockUntil: number;
  hitReg: boolean; // whether the current active move has already connected
  /** Super meter fill 0..METER_MAX. The super itself comes from the character. */
  meter: number;
  /** The randomly-assigned roster character (look + signature super). */
  character: DuelCharacter;
  /** Next flurry-hit timestamp (multi-hit supers). */
  comboHitAt: number;
  /** Crusher/dash-super horizontal velocity while traveling. */
  superVx: number;
}

export interface DuelProjectile {
  x: number;
  y: number;
  vx: number;
  ownerSide: 1 | -1;
  color: string;
  traveled: number;
  radius: number;
  dmg: number;
  chip: number;
  /** true for a Super Fireball (bigger, flashier). */
  big?: boolean;
}

export interface DuelFx {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  growth: number;
  color: string;
  kind: 'spark' | 'block' | 'ring';
  text?: string;
}

/** Fair uniform pick of the two duelists from the active pool. */
export function pickDuelists(entries: Entry[]): [Entry, Entry] {
  const s = shuffle(entries);
  return [s[0], s[1]];
}
