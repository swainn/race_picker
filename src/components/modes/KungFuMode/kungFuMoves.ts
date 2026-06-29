/**
 * Move catalog + tuning constants for Kung Fu (platform brawl) mode.
 *
 * Everything tunable lives here as module-level `const`s so the feel of the
 * mode can be adjusted in one place without a settings panel. These are plain
 * data — no React, no mutable state — so they stay deterministic and importable
 * from the game loop, AI, and drawing helpers.
 */

export type MoveId = 'punch' | 'kick' | 'flyingKick' | 'chiBlast';

export interface MoveDef {
  id: MoveId;
  /** Phase timings in ms. */
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  cooldownMs: number;
  /** Distance (px) from the attacker's center to the hitbox center. */
  reach: number;
  /** Radius (px) of the hitbox / projectile. */
  hitRadius: number;
  /** Impulse magnitude (px/s) added to the victim's velocity on hit. */
  knockback: number;
  /** Hitstun applied to the victim, in ms. */
  damageStun: number;
  /** Self impulse on activation (flyingKick lunges forward). */
  selfLungeVx: number;
  selfLungeVy: number;
  /** chiBlast spawns a travelling projectile instead of a melee hitbox. */
  isProjectile: boolean;
  /** Human-readable label used for killerInfo / the WinnerDialog details. */
  weaponLabel: string;
}

export const MOVES: Record<MoveId, MoveDef> = {
  punch: {
    id: 'punch',
    windupMs: 90, activeMs: 70, recoverMs: 140, cooldownMs: 360,
    reach: 26, hitRadius: 12, knockback: 150, damageStun: 180,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: false, weaponLabel: 'a punch',
  },
  kick: {
    id: 'kick',
    windupMs: 150, activeMs: 90, recoverMs: 240, cooldownMs: 620,
    reach: 34, hitRadius: 14, knockback: 320, damageStun: 280,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: false, weaponLabel: 'a roundhouse kick',
  },
  flyingKick: {
    id: 'flyingKick',
    windupMs: 220, activeMs: 160, recoverMs: 360, cooldownMs: 1700,
    reach: 30, hitRadius: 16, knockback: 580, damageStun: 360,
    selfLungeVx: 540, selfLungeVy: 0, isProjectile: false, weaponLabel: 'a flying kick',
  },
  chiBlast: {
    id: 'chiBlast',
    windupMs: 260, activeMs: 0, recoverMs: 320, cooldownMs: 2200,
    reach: 18, hitRadius: 9, knockback: 250, damageStun: 220,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: true, weaponLabel: 'a chi blast',
  },
};

export const MOVE_IDS: MoveId[] = ['punch', 'kick', 'flyingKick', 'chiBlast'];

/** Global tuning constants for the arena, physics, and round pacing. */
export const KF = {
  // Canvas / platform geometry (canvas matches the other modes' 400x600).
  CANVAS_W: 400,
  CANVAS_H: 600,
  PLATFORM_CX: 200,
  PLATFORM_CY: 320,
  PLATFORM_R_START: 165,
  PLATFORM_R_MIN: 46,
  FIGHTER_RADIUS: 13,

  // Physics.
  GROUND_FRICTION: 5.5,
  KNOCKBACK_FRICTION: 2.2,
  SEPARATION_PUSH: 220,
  WALK_SPEED: 95,
  STEER_ACCEL: 9,
  FALL_MS: 850,

  // Projectile (chi blast).
  CHI_SPEED: 230,
  CHI_RANGE: 220,

  // Guard.
  GUARD_KNOCKBACK_MULT: 0.35,
  GUARD_STUN_MULT: 0.4,

  // Round pacing (ms).
  REVEAL_MS: 2600,
  SHRINK_GRACE_MS: 6000,
  SHRINK_DURATION_MS: 26000,
  /** Hard cap: past this the platform collapses rapidly until a ring-out. */
  FORCED_END_MS: 38000,
  FORCED_COLLAPSE_SPEED: 90, // px/s while in forced-collapse

  /** Each elimination tightens the starting platform radius for the next round. */
  ROUND_SHRINK_STEP: 14,
} as const;
