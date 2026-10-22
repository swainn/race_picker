import { describe, expect, it } from 'vitest';
import { AB, layoutTower } from './angryBirdsEngine';
import { createWorld } from './angryBirdsPhysics';

/**
 * The physics module needs no canvas and no DOM — it is matter-js and the pure
 * layout — so the one guarantee that cannot be eyeballed reliably is checked
 * here instead: a structure must never damage itself before the bird is away.
 */
describe('block damage arming', () => {
  const settle = (world: ReturnType<typeof createWorld>, steps: number) => {
    for (let i = 0; i < steps; i++) world.step();
  };

  it('takes no damage at all while the tower is just standing there', () => {
    const world = createWorld(layoutTower(16, 'tiers'));
    const before = world.snapshot().blocks.length;
    // Far longer than a round ever spends settling before a launch.
    settle(world, 900);
    const after = world.snapshot().blocks;
    expect(after).toHaveLength(before);
    for (const b of after) {
      expect(b.damage, `${b.kind} on tier ${b.material}`).toBe(0);
    }
    world.destroy();
  });

  it('stays intact across every style while unlaunched', () => {
    for (const style of ['tiers', 'pyramid', 'twin', 'bunker'] as const) {
      const world = createWorld(layoutTower(20, style));
      const before = world.snapshot().blocks.length;
      settle(world, 600);
      const after = world.snapshot().blocks;
      expect(after.length, style).toBe(before);
      expect(after.every((b) => b.damage === 0), style).toBe(true);
      world.destroy();
    }
  });

  it('starts taking damage once a bird is launched', () => {
    const world = createWorld(layoutTower(12, 'tiers'));
    settle(world, 200);
    expect(world.snapshot().blocks.every((b) => b.damage === 0)).toBe(true);

    // Straight into the structure, hard enough to matter.
    world.launchBird({ x: AB.SLING_X, y: AB.SLING_Y }, 22, -4);
    settle(world, 400);

    const after = world.snapshot().blocks;
    const damaged = after.filter((b) => b.damage > 0).length;
    const broken = layoutTower(12, 'tiers').blocks.length - after.length;
    expect(damaged + broken, 'a direct hit should mark or break something').toBeGreaterThan(0);
    world.destroy();
  });

  it('reports a break through the listener', () => {
    const world = createWorld(layoutTower(12, 'tiers'));
    const breaks: string[] = [];
    world.setBlockBreakListener((material) => breaks.push(material));
    settle(world, 200);
    expect(breaks, 'nothing may break before launch').toHaveLength(0);
    world.launchBird({ x: AB.SLING_X, y: AB.SLING_Y }, 26, -6);
    settle(world, 600);
    // Not asserting that something broke — the bird may miss — only that if
    // anything did, it was after the launch and came through the listener.
    for (const m of breaks) expect(['wood', 'stone', 'ice']).toContain(m);
    world.destroy();
  });
});

/**
 * A structure has to hold itself up. Anything it does to itself before the
 * bird arrives is damage the player did not cause and cannot see coming.
 */
describe('structures stand on their own', () => {
  const PRESETTLE = 160;
  const PRESETTLE_MIN = 40;

  const presettle = (world: ReturnType<typeof createWorld>) => {
    for (let i = 0; i < PRESETTLE; i++) {
      world.step();
      if (i >= PRESETTLE_MIN && world.isSettled()) break;
    }
  };

  // The bug this guards: tiers were 100px apart but a column plus beam was
  // only 62px, so every tier free-fell 38px onto the one below and the whole
  // thing shook itself apart before a bird was thrown.
  it('leaves no void for a tier to fall through', () => {
    expect(AB.COLUMN_H + AB.BEAM_H).toBe(AB.TIER_H);
  });

  it('barely moves while settling, in every style', () => {
    for (const style of ['tiers', 'pyramid', 'twin', 'bunker'] as const) {
      const layout = layoutTower(16, style);
      const world = createWorld(layout);
      presettle(world);
      const after = world.snapshot();

      const drift = Math.max(
        ...after.blocks.map((b, i) =>
          Math.hypot(b.x - layout.blocks[i].x, b.y - layout.blocks[i].y)
        )
      );
      const tilt = Math.max(...after.blocks.map((b) => Math.abs(b.angle)));
      expect(drift, `${style} block drift`).toBeLessThan(20);
      expect(tilt, `${style} block tilt`).toBeLessThan(0.25);
      world.destroy();
    }
  });

  it('keeps every pig on its perch while settling', () => {
    for (const style of ['tiers', 'pyramid', 'twin', 'bunker'] as const) {
      const layout = layoutTower(20, style);
      const world = createWorld(layout);
      presettle(world);
      const after = world.snapshot();
      expect(after.pigs, `${style} lost a pig`).toHaveLength(layout.pigs.length);
      const drift = Math.max(
        ...after.pigs.map((p, i) => Math.hypot(p.x - layout.pigs[i].x, p.y - layout.pigs[i].y))
      );
      expect(drift, `${style} pig drift`).toBeLessThan(20);
      world.destroy();
    }
  });

  it('is actually at rest by the time the pre-settle ends', () => {
    for (const style of ['tiers', 'pyramid', 'twin', 'bunker'] as const) {
      const world = createWorld(layoutTower(16, style));
      presettle(world);
      expect(world.isSettled(), style).toBe(true);
      world.destroy();
    }
  });
});
