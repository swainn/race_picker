import { describe, expect, it } from 'vitest';
import { DUEL_CHARACTERS } from './duelCharacters';
import { DUEL_MOVE_IDS, type DuelMoveId, type DuelState } from './duelEngine';
import {
  BODY_SPRITES,
  CAPE_SPRITE,
  HEADGEAR_SPRITES,
  PALETTE_CHARS,
  poseFor,
  resolvePalette,
  type PoseInput,
  type SpriteGrid,
} from './duelPixelArt';

const CHAR_SET = new Set<string>(PALETTE_CHARS);

function checkGrid(name: string, grid: SpriteGrid): void {
  expect(grid.rows.length, `${name}: empty grid`).toBeGreaterThan(0);
  const width = grid.rows[0].length;
  for (const [r, row] of grid.rows.entries()) {
    expect(row.length, `${name} row ${r}: ragged width (${row.length} vs ${width})`).toBe(width);
    for (const ch of row) {
      expect(CHAR_SET.has(ch), `${name} row ${r}: unknown palette char '${ch}'`).toBe(true);
    }
  }
  expect(grid.anchorX, `${name}: anchorX out of bounds`).toBeGreaterThanOrEqual(0);
  expect(grid.anchorX, `${name}: anchorX out of bounds`).toBeLessThan(width);
  for (const anchor of [grid.head, grid.hand]) {
    if (!anchor) continue;
    const [ar, ac] = anchor;
    expect(ar, `${name}: anchor row out of bounds`).toBeGreaterThanOrEqual(0);
    expect(ar, `${name}: anchor row out of bounds`).toBeLessThan(grid.rows.length);
    expect(ac, `${name}: anchor col out of bounds`).toBeGreaterThanOrEqual(0);
    expect(ac, `${name}: anchor col out of bounds`).toBeLessThan(width);
  }
  // A sprite must have visible cells.
  expect(
    grid.rows.some((row) => [...row].some((ch) => ch !== '.')),
    `${name}: no visible cells`
  ).toBe(true);
}

describe('sprite grid integrity', () => {
  it('every body pose grid is well-formed', () => {
    for (const [kind, poses] of Object.entries(BODY_SPRITES)) {
      for (const [pose, grid] of Object.entries(poses)) {
        checkGrid(`${kind}/${pose}`, grid);
      }
    }
  });

  it('body grids (except ko) carry a head anchor for overlays', () => {
    for (const [kind, poses] of Object.entries(BODY_SPRITES)) {
      for (const [pose, grid] of Object.entries(poses)) {
        if (pose === 'ko') continue;
        expect(grid.head, `${kind}/${pose}: missing head anchor`).toBeDefined();
      }
    }
  });

  it('every headgear overlay and the cape are well-formed with anchors', () => {
    for (const [name, grid] of Object.entries(HEADGEAR_SPRITES)) {
      checkGrid(`headgear/${name}`, grid);
      expect(grid.head, `headgear/${name}: missing anchor`).toBeDefined();
    }
    checkGrid('cape', CAPE_SPRITE);
    expect(CAPE_SPRITE.head).toBeDefined();
  });
});

describe('resolvePalette', () => {
  it('maps every non-transparent char to a color for all roster characters', () => {
    for (const c of DUEL_CHARACTERS) {
      const palette = resolvePalette(c.visual);
      for (const ch of PALETTE_CHARS) {
        if (ch === '.') {
          expect(palette[ch]).toBeNull();
        } else {
          expect(palette[ch], `${c.id}: char '${ch}' unmapped`).toMatch(/^#|^rgb/);
        }
      }
    }
  });
});

describe('poseFor', () => {
  const STATES: DuelState[] = ['idle', 'walk', 'attack', 'block', 'jump', 'hurt', 'ko', 'win'];
  const MOVES: (DuelMoveId | null)[] = [null, ...DUEL_MOVE_IDS];
  const PHASES: PoseInput['movePhase'][] = [null, 'windup', 'active', 'recover'];

  it('always returns a defined pose for every reachable combination', () => {
    for (const character of DUEL_CHARACTERS) {
      for (const state of STATES) {
        for (const currentMove of MOVES) {
          for (const movePhase of PHASES) {
            for (const air of [0, 30]) {
              for (const now of [0, 100, 1000]) {
                const { pose, rotate90 } = poseFor(
                  { state, air, currentMove, movePhase, character },
                  now
                );
                expect(BODY_SPRITES.standard[pose]).toBeDefined();
                expect(BODY_SPRITES.heavy[pose]).toBeDefined();
                if (rotate90) {
                  expect(character.superKind).toBe('drill');
                  expect(currentMove).toBe('superCombo');
                  expect(movePhase).toBe('active');
                }
              }
            }
          }
        }
      }
    }
  });

  it('KO always wins over any move', () => {
    const c = DUEL_CHARACTERS[0];
    const { pose } = poseFor(
      { state: 'ko', air: 0, currentMove: 'superCombo', movePhase: 'active', character: c },
      0
    );
    expect(pose).toBe('ko');
  });

  it('drill super rotates, other supers do not', () => {
    const drill = DUEL_CHARACTERS.find((c) => c.superKind === 'drill')!;
    const flurry = DUEL_CHARACTERS.find((c) => c.superKind === 'flurry')!;
    const base: Omit<PoseInput, 'character'> = {
      state: 'attack',
      air: 0,
      currentMove: 'superCombo',
      movePhase: 'active',
    };
    expect(poseFor({ ...base, character: drill }, 0).rotate90).toBe(true);
    expect(poseFor({ ...base, character: flurry }, 0).rotate90).toBe(false);
  });
});
