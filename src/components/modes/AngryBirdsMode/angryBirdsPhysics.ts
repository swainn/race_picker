/**
 * The rigid-body sim for Angry Birds — the ONLY file in this mode that touches
 * matter-js. Everything else (layout, the pick, the ballistics, the scoreboard)
 * stays pure in angryBirdsEngine.ts so it can be unit-tested, and keeping the
 * import in one place also keeps the dependency inside this mode's chunk.
 *
 * The sim is pure theatre: it decides how the tower falls, never who gets
 * picked. The chosen pig is popped by the component (on a hit, or by the
 * FORCED_END_MS backstop), and no other participant pig is ever removed here.
 */
import { Bodies, Body, Composite, Engine, Events } from 'matter-js';
import type {
  Body as BodyT,
  Engine as EngineT,
  IChamferableBodyDefinition,
  IEventCollision,
} from 'matter-js';
import {
  AB,
  DAMAGE_THRESHOLD,
  MATERIAL_STRENGTH,
  type BlockKind,
  type BlockMaterial,
  type TowerLayout,
} from './angryBirdsEngine';

export interface BlockView {
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
  kind: BlockKind;
  material: BlockMaterial;
  /** 0 = pristine, 1 = about to give. Drives how cracked it looks. */
  damage: number;
}

export interface PigView {
  /** Index into the layout's pig list — also the seat a participant holds. */
  id: number;
  x: number;
  y: number;
  r: number;
  angle: number;
}

export interface BirdView {
  x: number;
  y: number;
  r: number;
  angle: number;
}

export interface WorldSnapshot {
  blocks: BlockView[];
  pigs: PigView[];
  bird: BirdView | null;
}

export type PigHitListener = (pigId: number, impulse: number) => void;

/** Told when a block finally gives, so the mode can make a noise about it. */
export type BlockBreakListener = (material: BlockMaterial, x: number, y: number) => void;

export interface AngryBirdsWorld {
  /** One fixed timestep. Never a variable dt — rigid bodies jitter on those. */
  step(): void;
  launchBird(from: { x: number; y: number }, vx: number, vy: number): void;
  /** True once the bird has left the field (off screen or below ground). */
  birdIsGone(): boolean;
  /** Remove a pig. The only way a participant pig ever leaves the tower. */
  popPig(pigId: number): boolean;
  /** Pig ids still standing. */
  standingPigs(): number[];
  /** True when nothing is meaningfully moving any more. */
  isSettled(): boolean;
  snapshot(): WorldSnapshot;
  setPigHitListener(listener: PigHitListener | null): void;
  setBlockBreakListener(listener: BlockBreakListener | null): void;
  destroy(): void;
}

/**
 * Per-material body properties. Stone is heavy and grippy so a base course
 * stays where it is put; ice is light and slippery so a top course shears off
 * and slides. Wood sits between them and is the old single setting.
 */
const MATERIAL_OPTIONS: Record<BlockMaterial, IChamferableBodyDefinition> = {
  wood: { density: 0.0014, friction: 0.62, frictionStatic: 0.9, restitution: 0.03 },
  stone: { density: 0.0032, friction: 0.74, frictionStatic: 1, restitution: 0.015 },
  ice: { density: 0.0007, friction: 0.12, frictionStatic: 0.18, restitution: 0.1 },
};
const PIG_OPTIONS = { density: 0.0011, friction: 0.5, restitution: 0.22 };
/** The bird carries no air drag, so the solved ballistic arc stays exact. */
/** Below this speed the bird counts as stopped. */
const BIRD_REST_SPEED = 0.4;
/** How many consecutive still steps before it is cleared away (~0.4s). */
const BIRD_REST_STEPS = 24;

const BIRD_OPTIONS = { density: 0.0045, friction: 0.4, frictionAir: 0, restitution: 0.32 };

/** Below this speed (px/step) everything is treated as having come to rest. */
const SETTLE_SPEED = 0.26;

export function createWorld(layout: TowerLayout): AngryBirdsWorld {
  const engine = Engine.create();
  // Gravity in the same units the pure solver assumes (see AB.G_STEP).
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;

  const world = engine.world;

  const ground = Bodies.rectangle(
    AB.CANVAS_W / 2,
    AB.GROUND_Y + 40,
    AB.CANVAS_W * 3,
    80,
    { isStatic: true, friction: 0.85, label: 'ground' }
  );
  Composite.add(world, ground);

  // An invisible wall just past the right edge, so a bird that overshoots and
  // blocks knocked loose stop at the boundary instead of rolling out of sight.
  // Its inner face sits exactly on the canvas edge, and it is never added to
  // the snapshot, so nothing draws it.
  const rightWall = Bodies.rectangle(
    AB.CANVAS_W + 40,
    AB.GROUND_Y - AB.CANVAS_H,
    80,
    AB.CANVAS_H * 3,
    { isStatic: true, friction: 0.4, restitution: 0.1, label: 'wall' }
  );
  Composite.add(world, rightWall);

  /** Damage taken so far, keyed by body id. */
  const blockDamage = new Map<number, number>();
  const blockBodies = layout.blocks.map((b) => {
    const body = Bodies.rectangle(b.x, b.y, b.w, b.h, {
      ...MATERIAL_OPTIONS[b.material],
      label: 'block',
    });
    return { body, spec: b };
  });
  Composite.add(world, blockBodies.map((b) => b.body));

  const pigBodies = layout.pigs.map((p, id) => {
    const body = Bodies.circle(p.x, p.y, p.r, { ...PIG_OPTIONS, label: 'pig' });
    return { id, body, r: p.r, live: true };
  });
  Composite.add(world, pigBodies.map((p) => p.body));

  /** body.id -> pig id, so a collision pair can be resolved in O(1). */
  const pigByBodyId = new Map<number, number>();
  for (const p of pigBodies) pigByBodyId.set(p.body.id, p.id);
  const blockByBodyId = new Map<number, (typeof blockBodies)[number]>();
  for (const b of blockBodies) blockByBodyId.set(b.body.id, b);

  let bird: BodyT | null = null;
  /** Consecutive steps the bird has been essentially still. */
  let birdStillSteps = 0;
  /** Blocks only wear once a bird is in play; see onCollision. */
  let armed = false;
  const brokenBodies = new Set<number>();
  let breakListener: BlockBreakListener | null = null;
  let listener: PigHitListener | null = null;
  let destroyed = false;

  const relativeImpulse = (a: BodyT, b: BodyT): number =>
    Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);

  /** Wear a block down, and take it out of the world once it gives. */
  const damageBlock = (body: BodyT, spec: { material: BlockMaterial }, impulse: number): void => {
    if (impulse < DAMAGE_THRESHOLD) return;
    const taken = (blockDamage.get(body.id) ?? 0) + impulse;
    blockDamage.set(body.id, taken);
    if (taken < MATERIAL_STRENGTH[spec.material]) return;
    Composite.remove(world, body);
    brokenBodies.add(body.id);
    breakListener?.(spec.material, body.position.x, body.position.y);
  };

  const onCollision = (event: IEventCollision<EngineT>): void => {
    // Blocks only start taking damage once a bird is away. Standing the tower
    // up is a series of collisions too, and without this the structure would
    // wear itself out before the round began.
    if (armed) {
      for (const pair of event.pairs) {
        const impulse = relativeImpulse(pair.bodyA, pair.bodyB);
        for (const body of [pair.bodyA, pair.bodyB]) {
          const entry = blockByBodyId.get(body.id);
          if (entry) damageBlock(entry.body, entry.spec, impulse);
        }
      }
    }
    if (!listener) return;
    for (const pair of event.pairs) {
      const pigA = pigByBodyId.get(pair.bodyA.id);
      const pigB = pigByBodyId.get(pair.bodyB.id);
      if (pigA === undefined && pigB === undefined) continue;
      const impulse = relativeImpulse(pair.bodyA, pair.bodyB);
      // Both ends can be pigs (a toppling neighbour); report each once.
      if (pigA !== undefined) listener(pigA, impulse);
      if (pigB !== undefined) listener(pigB, impulse);
    }
  };
  Events.on(engine, 'collisionStart', onCollision);

  const removeBird = (): void => {
    if (!bird) return;
    Composite.remove(world, bird);
    bird = null;
    birdStillSteps = 0;
  };

  return {
    step() {
      if (destroyed) return;
      // Fixed timestep: reproducible, and rigid stacks stay stable.
      Engine.update(engine, 1000 / 60);
      if (
        bird &&
        (bird.position.x > AB.CANVAS_W + 120 ||
          bird.position.x < -120 ||
          bird.position.y > AB.CANVAS_H + 200)
      ) {
        removeBird();
      } else if (bird) {
        // The wall means a bird can no longer leave the field, so "gone" has
        // to include "come to rest" — otherwise every flight would run to its
        // full time cap waiting for an exit that cannot happen.
        birdStillSteps = bird.speed < BIRD_REST_SPEED ? birdStillSteps + 1 : 0;
        if (birdStillSteps >= BIRD_REST_STEPS) removeBird();
      }
    },

    launchBird(from, vx, vy) {
      if (destroyed) return;
      armed = true;
      removeBird();
      bird = Bodies.circle(from.x, from.y, AB.BIRD_R, { ...BIRD_OPTIONS, label: 'bird' });
      Composite.add(world, bird);
      // Velocity is already in px/step, the units the solver works in.
      Body.setVelocity(bird, { x: vx, y: vy });
      Body.setAngularVelocity(bird, 0.16);
    },

    birdIsGone() {
      return bird === null;
    },

    popPig(pigId) {
      if (destroyed) return false;
      const pig = pigBodies[pigId];
      if (!pig || !pig.live) return false;
      pig.live = false;
      pigByBodyId.delete(pig.body.id);
      Composite.remove(world, pig.body);
      return true;
    },

    standingPigs() {
      return pigBodies.filter((p) => p.live).map((p) => p.id);
    },

    isSettled() {
      if (destroyed) return true;
      if (bird) return false;
      for (const { body } of blockBodies) {
        if (Math.hypot(body.velocity.x, body.velocity.y) > SETTLE_SPEED) return false;
      }
      for (const p of pigBodies) {
        if (!p.live) continue;
        if (Math.hypot(p.body.velocity.x, p.body.velocity.y) > SETTLE_SPEED) return false;
      }
      return true;
    },

    snapshot() {
      if (destroyed) return { blocks: [], pigs: [], bird: null };
      return {
        blocks: blockBodies
          .filter(({ body }) => !brokenBodies.has(body.id))
          .map(({ body, spec }) => ({
            x: body.position.x,
            y: body.position.y,
            angle: body.angle,
            w: spec.w,
            h: spec.h,
            kind: spec.kind,
            material: spec.material,
            damage: Math.min(
              1,
              (blockDamage.get(body.id) ?? 0) / MATERIAL_STRENGTH[spec.material]
            ),
          })),
        pigs: pigBodies
          .filter((p) => p.live)
          .map((p) => ({
            id: p.id,
            x: p.body.position.x,
            y: p.body.position.y,
            r: p.r,
            angle: p.body.angle,
          })),
        bird: bird
          ? { x: bird.position.x, y: bird.position.y, r: AB.BIRD_R, angle: bird.angle }
          : null,
      };
    },

    setBlockBreakListener(next) {
      breakListener = next;
    },

    setPigHitListener(next) {
      listener = next;
    },

    /**
     * The whole mode is remounted on every reset (App keys it on the mode and
     * a reset counter), so a world that leaked here would leak once per round.
     */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listener = null;
      Events.off(engine, 'collisionStart', onCollision);
      removeBird();
      Composite.clear(world, false);
      Engine.clear(engine);
      pigByBodyId.clear();
      blockByBodyId.clear();
      blockDamage.clear();
      brokenBodies.clear();
      breakListener = null;
      blockBodies.length = 0;
      pigBodies.length = 0;
    },
  };
}
