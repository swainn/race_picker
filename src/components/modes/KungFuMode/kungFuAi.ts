/**
 * Lightweight fighter AI for Kung Fu mode. Pure functions over a minimal view
 * of the world — the game loop calls `decideIntent` on a jittered interval and
 * applies the returned intent (steering + an optional move/block) each tick.
 *
 * Priorities: (1) don't fall off — steer back toward center near the edge;
 * (2) pick the opponent that's nearest AND closest to the edge; (3) approach
 * from the center side so a landed hit shoves them outward; (4) attack in range;
 * (5) block occasionally or reactively.
 */
import { KF, MOVES, type MoveId } from './kungFuMoves';
import type { FighterState } from './kungFuFighter';

export interface AiFighter {
  id: number;
  x: number;
  y: number;
  facing: 1 | -1;
  state: FighterState;
  currentMove: MoveId | null;
  movePhase: 'windup' | 'active' | 'recover' | null;
  cooldowns: Record<MoveId, number>;
  /** Super-meter fill and the fighter's assigned signature special. */
  charge: number;
  signature: MoveId | null;
  /** Timestamp before which no new defensive maneuver may start. */
  defenseCdUntil: number;
}

export type Defense = 'none' | 'shield' | 'jump' | 'dodge';

export interface AiContext {
  self: AiFighter;
  /** Active opponents only (not falling/out). */
  others: AiFighter[];
  platformCx: number;
  platformCy: number;
  platformR: number;
  /** Vertical squash of the platform ellipse (matches the rendered pad). */
  squash: number;
  now: number;
}

export interface AiIntent {
  targetId: number | null;
  /** Desired velocity vector (px/s); the loop steers current velocity toward it. */
  desiredVx: number;
  desiredVy: number;
  /** A move to begin this decision, or null. */
  move: MoveId | null;
  /** A defensive maneuver to start this decision, or 'none'. */
  defense: Defense;
}

const IDLE: AiIntent = { targetId: null, desiredVx: 0, desiredVy: 0, move: null, defense: 'none' };

function ready(self: AiFighter, move: MoveId, now: number): boolean {
  return self.cooldowns[move] <= now;
}

export function decideIntent(ctx: AiContext): AiIntent {
  const { self, others, platformCx, platformCy, platformR, squash, now } = ctx;

  if (others.length === 0) return IDLE;

  // Normalized distance from center on the platform ellipse: 1 = at the rim.
  const ry = platformR * squash;
  const normDist = (px: number, py: number) =>
    Math.hypot((px - platformCx) / platformR, (py - platformCy) / ry);

  const sdx = self.x - platformCx;
  const sdy = self.y - platformCy;
  const selfNd = normDist(self.x, self.y);

  // (1) Self-preservation overrides aggression near the rim.
  if (selfNd > 0.8) {
    const len = Math.hypot(sdx, sdy) || 1;
    return {
      targetId: null,
      desiredVx: (-sdx / len) * KF.WALK_SPEED,
      desiredVy: (-sdy / len) * KF.WALK_SPEED,
      move: null,
      defense: 'none',
    };
  }

  // (2) Target = maximize closeness AND how near the edge they are.
  let target = others[0];
  let bestScore = -Infinity;
  for (const o of others) {
    const dist = Math.hypot(o.x - self.x, o.y - self.y) || 1;
    const edge = normDist(o.x, o.y);
    const score = 90 / dist + edge * 1.6;
    if (score > bestScore) {
      bestScore = score;
      target = o;
    }
  }

  const tdx = target.x - self.x;
  const tdy = target.y - self.y;
  const distToTarget = Math.hypot(tdx, tdy) || 1;

  // (3) Approach the center-side of the target so hits push them outward.
  const tCx = target.x - platformCx;
  const tCy = target.y - platformCy;
  const tCenterDist = Math.hypot(tCx, tCy) || 1;
  const offset = MOVES.punch.reach + KF.FIGHTER_RADIUS;
  const approachX = target.x - (tCx / tCenterDist) * offset;
  const approachY = target.y - (tCy / tCenterDist) * offset;
  const adx = approachX - self.x;
  const ady = approachY - self.y;
  const adist = Math.hypot(adx, ady) || 1;
  const desiredVx = (adx / adist) * KF.WALK_SPEED;
  const desiredVy = (ady / adist) * KF.WALK_SPEED;

  // (5) Reactive defense: shield / dodge / jump when an opponent winds up a move
  // while facing us (or, rarely, pre-emptively). Projectile-evasion jumps are
  // triggered by the game loop, which can see incoming projectiles.
  let defense: Defense = 'none';
  const canDefend =
    self.defenseCdUntil <= now && (self.state === 'idle' || self.state === 'approach');
  if (canDefend) {
    let threatened = false;
    for (const o of others) {
      const od = Math.hypot(o.x - self.x, o.y - self.y);
      const facingUs = Math.sign(self.x - o.x) === o.facing || od < 22;
      if (od < 46 && o.movePhase === 'windup' && facingUs) {
        threatened = true;
        break;
      }
    }
    if (threatened) {
      const r = Math.random();
      defense = r < 0.4 ? 'shield' : r < 0.8 ? 'dodge' : 'jump';
    } else if (Math.random() < 0.05) {
      defense = Math.random() < 0.6 ? 'shield' : 'dodge';
    }
  }

  const canAct = self.currentMove === null && (self.state === 'idle' || self.state === 'approach');

  // (4a) Signature special: unleash it when the meter is full and the target is
  // in the right range for that move. Otherwise keep approaching (fall through).
  if (canAct && defense === 'none' && self.charge >= KF.CHARGE_MAX && self.signature && ready(self, self.signature, now)) {
    const sig = self.signature;
    const def = MOVES[sig];
    const projRange = def.projRange ?? KF.CHI_RANGE;
    const inRange =
      sig === 'throw' ? distToTarget <= def.reach + KF.FIGHTER_RADIUS + 6 :
      sig === 'shoryuken' ? distToTarget <= def.reach + KF.FIGHTER_RADIUS * 2 :
      sig === 'hurricane' ? distToTarget <= 72 :
      sig === 'hadoken' ? distToTarget <= projRange && Math.abs(tdy) < 34 :
      sig === 'getOverHere' ? distToTarget >= 50 && distToTarget <= projRange :
      false;
    if (inRange) {
      return { targetId: target.id, desiredVx, desiredVy, move: sig, defense: 'none' };
    }
  }

  // (4b) Basic attack selection when something is in range and we're free to act.
  let move: MoveId | null = null;
  if (canAct && defense === 'none') {
    const targetNearEdge = normDist(target.x, target.y) > 0.62;
    if (distToTarget >= 40 && distToTarget <= 90 && targetNearEdge && ready(self, 'flyingKick', now)) {
      move = 'flyingKick';
    } else if (distToTarget <= MOVES.kick.reach + KF.FIGHTER_RADIUS * 2) {
      if (targetNearEdge && ready(self, 'kick', now)) move = 'kick';
      else if (ready(self, 'punch', now)) move = 'punch';
      else if (ready(self, 'kick', now)) move = 'kick';
    } else if (
      distToTarget <= KF.CHI_RANGE &&
      Math.abs(tdy) < 26 &&
      ready(self, 'chiBlast', now)
    ) {
      move = 'chiBlast';
    }
  }

  return { targetId: target.id, desiredVx, desiredVy, move, defense };
}
