/**
 * Move catalog + tuning constants for Kung Fu (platform brawl) mode.
 *
 * Everything tunable lives here as module-level `const`s so the feel of the
 * mode can be adjusted in one place without a settings panel. These are plain
 * data — no React, no mutable state — so they stay deterministic and importable
 * from the game loop, AI, and drawing helpers.
 */

export type MoveId =
  | 'punch'
  | 'kick'
  | 'flyingKick'
  | 'chiBlast'
  // Street Fighter-style signature specials (gated by the super meter):
  | 'hadoken'
  | 'shoryuken'
  | 'hurricane'
  | 'throw'
  | 'getOverHere';

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
  /** chiBlast/hadoken/getOverHere spawn a travelling projectile. */
  isProjectile: boolean;
  /** Human-readable label used for killerInfo / the WinnerDialog details. */
  weaponLabel: string;

  // ---- Signature-special extras (all optional; basic moves omit them) ----
  /** A super-meter signature move: costs a full meter, shows a callout + aura. */
  isSpecial?: boolean;
  /** Callout text shown when unleashed, e.g. "HADOKEN!". */
  callout?: string;
  /** Extra upward velocity added to the victim (negative = up). Shoryuken. */
  launchVy?: number;
  /** Knockback direction is outward from the platform center, not attacker→victim.
   *  Used by the throw to hurl the victim toward the nearest edge. */
  grab?: boolean;
  /** Projectile yanks the victim toward the owner (inward) instead of away, then
   *  chains into a strike. "Get Over Here". */
  pull?: boolean;
  /** HP damage on an unblocked hit (defaults to 9 when omitted). */
  damage?: number;
  /** Projectile speed / range overrides (default to the chi-blast values). */
  projSpeed?: number;
  projRange?: number;
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

  // ---- Signature specials -------------------------------------------------
  hadoken: {
    id: 'hadoken',
    windupMs: 280, activeMs: 0, recoverMs: 380, cooldownMs: 500,
    reach: 20, hitRadius: 13, knockback: 520, damageStun: 380,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: true, weaponLabel: 'a Hadoken',
    isSpecial: true, callout: 'HADOKEN!', damage: 16, projSpeed: 200, projRange: 320,
  },
  shoryuken: {
    id: 'shoryuken',
    windupMs: 160, activeMs: 220, recoverMs: 420, cooldownMs: 500,
    reach: 26, hitRadius: 18, knockback: 360, damageStun: 420,
    selfLungeVx: 60, selfLungeVy: -300, isProjectile: false, weaponLabel: 'a Shoryuken',
    isSpecial: true, callout: 'SHORYUKEN!', launchVy: -470, damage: 18,
  },
  hurricane: {
    id: 'hurricane',
    windupMs: 200, activeMs: 520, recoverMs: 380, cooldownMs: 500,
    reach: 4, hitRadius: 30, knockback: 440, damageStun: 360,
    selfLungeVx: 300, selfLungeVy: 0, isProjectile: false, weaponLabel: 'a Hurricane Kick',
    isSpecial: true, callout: 'HURRICANE KICK!', damage: 12,
  },
  throw: {
    id: 'throw',
    windupMs: 140, activeMs: 140, recoverMs: 420, cooldownMs: 500,
    reach: 30, hitRadius: 16, knockback: 680, damageStun: 520,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: false, weaponLabel: 'a throw',
    isSpecial: true, callout: 'GOTCHA!', grab: true, damage: 12,
  },
  getOverHere: {
    id: 'getOverHere',
    windupMs: 240, activeMs: 0, recoverMs: 520, cooldownMs: 500,
    reach: 18, hitRadius: 11, knockback: 620, damageStun: 520,
    selfLungeVx: 0, selfLungeVy: 0, isProjectile: true, weaponLabel: 'a chain yank',
    isSpecial: true, callout: 'GET OVER HERE!', pull: true, damage: 8,
    projSpeed: 340, projRange: 360,
  },
};

/** Every move id — used to seed each fighter's per-move cooldown record. */
export const MOVE_IDS: MoveId[] = [
  'punch', 'kick', 'flyingKick', 'chiBlast',
  'hadoken', 'shoryuken', 'hurricane', 'throw', 'getOverHere',
];

/** The signature-special pool one is randomly drawn from per fighter per round. */
export const SPECIAL_IDS: MoveId[] = ['hadoken', 'shoryuken', 'hurricane', 'throw', 'getOverHere'];

/** Emoji badge shown next to a fighter's assigned signature. */
export const SIGNATURE_ICON: Partial<Record<MoveId, string>> = {
  hadoken: '🔥',
  shoryuken: '🐉',
  hurricane: '🌪️',
  throw: '🤚',
  getOverHere: '⛓️',
};

/** Global tuning constants for the arena, physics, and round pacing. */
export const KF = {
  // Canvas / platform geometry (canvas matches the other modes' 400x600).
  CANVAS_W: 400,
  CANVAS_H: 600,
  PLATFORM_CX: 200,
  PLATFORM_CY: 320,
  PLATFORM_R_START: 165,
  PLATFORM_R_MIN: 46,
  /** Vertical squash of the platform ellipse (oblique "top of a pillar" look).
   *  Shared by the renderer, fighter placement, and the ring-out test so the
   *  visual oval and the knockout boundary stay aligned. */
  PLATFORM_SQUASH: 0.34,
  FIGHTER_RADIUS: 13,

  // Physics.
  GROUND_FRICTION: 5.5,
  KNOCKBACK_FRICTION: 2.2,
  SEPARATION_PUSH: 220,
  WALK_SPEED: 95,
  STEER_ACCEL: 9,
  FALL_MS: 850,

  // Projectile (chi blast; specials override speed/range per-move).
  CHI_SPEED: 230,
  CHI_RANGE: 220,

  // Super meter (fast-fill: specials fly often).
  CHARGE_MAX: 100,
  CHARGE_ON_HIT: 30, // gained by the attacker per landed hit
  CHARGE_ON_TAKEN: 18, // gained by the victim (comeback factor)
  CHARGE_TRICKLE: 9, // passive gain per second

  // "Get Over Here" chain follow-up: after the yank, a delayed launching strike.
  HOOK_STRIKE_DELAY_MS: 320,
  HOOK_STRIKE_KNOCKBACK: 640,
  HOOK_STRIKE_DAMAGE: 14,

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
