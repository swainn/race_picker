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
import type { Body as BodyT, Engine as EngineT, IEventCollision } from 'matter-js';
import { AB, type BlockKind, type TowerLayout } from './angryBirdsEngine';

export interface BlockView {
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
  kind: BlockKind;
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
  destroy(): void;
}

const BLOCK_OPTIONS = { density: 0.0014, friction: 0.62, frictionStatic: 0.9, restitution: 0.03 };
const PIG_OPTIONS = { density: 0.0011, friction: 0.5, restitution: 0.22 };
/** The bird carries no air drag, so the solved ballistic arc stays exact. */
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

  const blockBodies = layout.blocks.map((b) => {
    const body = Bodies.rectangle(b.x, b.y, b.w, b.h, { ...BLOCK_OPTIONS, label: 'block' });
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

  let bird: BodyT | null = null;
  let listener: PigHitListener | null = null;
  let destroyed = false;

  const relativeImpulse = (a: BodyT, b: BodyT): number =>
    Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);

  const onCollision = (event: IEventCollision<EngineT>): void => {
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
      }
    },

    launchBird(from, vx, vy) {
      if (destroyed) return;
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
        blocks: blockBodies.map(({ body, spec }) => ({
          x: body.position.x,
          y: body.position.y,
          angle: body.angle,
          w: spec.w,
          h: spec.h,
          kind: spec.kind,
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
      blockBodies.length = 0;
      pigBodies.length = 0;
    },
  };
}
