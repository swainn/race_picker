/**
 * Pixel-art renderer for Street Duel fighters — the "Pixel art" graphics
 * setting. Hand-authored sprite grids (string rows of palette chars) extend
 * the technique from SpaceInvadersMode/invadersDraw.ts with multi-color
 * palettes, so ONE authored set recolors for the whole roster via each
 * character's CharacterVisual.
 *
 * Sprites draw in world coordinates with 3×3-px cells snapped to the 3px
 * grid; under DuelGame's low-res pass (LOWRES_FACTOR) every cell lands on
 * exact integer offscreen pixels — PIXEL_SCALE is a multiple of
 * LOWRES_FACTOR — keeping sprite edges crisp.
 *
 * Palette chars:
 *   `.` transparent   `S` skin      `B` body     `T` trim     `H` hair
 *   `W` white         `K` outline   `L` legs (skin when bare-legged/wide)
 *   `G` fist (glove red when gloves)   `Y` heavy belly (skin when wide)
 */
import { DL, type DuelFighter, type DuelMoveId, type DuelState } from './duelEngine';
import type { CharacterVisual, DuelCharacter, Headgear } from './duelCharacters';

export const PIXEL_SCALE = 3; // world px per sprite cell
/** Downscale factor of the whole-frame low-res pass (scene, HUD, text).
 *  Finer than the sprite cells: the scenery pixelates at half the fighter
 *  chunkiness. Must divide PIXEL_SCALE and the canvas dimensions evenly. */
export const LOWRES_FACTOR = 1.5;

export type PoseId =
  | 'idle'
  | 'walkA'
  | 'walkB'
  | 'jump'
  | 'block'
  | 'hurt'
  | 'ko'
  | 'punch'
  | 'punchAlt'
  | 'kick'
  | 'kickAlt'
  | 'shoryuken'
  | 'hadoken';

export interface SpriteGrid {
  /** Palette-indexed rows, top to bottom; the bottom row rests on the feet. */
  rows: string[];
  /** Cell column of the feet-center origin. */
  anchorX: number;
  /** Body grids: [row, col] of the head-top center (headgear/cape attach here).
   *  Overlay grids: [row, col] of the overlay cell that sits ON that point. */
  head?: [number, number];
  /** [row, col] of the lead hand — claw slash / hadoken orb anchor. */
  hand?: [number, number];
}

export type BodyKind = 'standard' | 'heavy';

export function bodyKindFor(build: CharacterVisual['build']): BodyKind {
  return build === 'wide' || build === 'huge' ? 'heavy' : 'standard';
}

export const PALETTE_CHARS = ['.', 'S', 'B', 'T', 'H', 'W', 'K', 'L', 'G', 'Y', 'E', 'M'] as const;

/** Resolve the palette chars to concrete colors for one character. */
export function resolvePalette(v: CharacterVisual): Record<string, string | null> {
  return {
    '.': null,
    S: v.skin,
    B: v.body,
    T: v.trim,
    H: v.hair,
    W: '#f2f2f6',
    K: '#1a1a24',
    L: v.build === 'wide' ? v.skin : '#3a2f4a',
    G: v.gloves ? '#c9302c' : v.skin,
    Y: v.build === 'wide' ? v.skin : v.body,
    E: v.weaponColor ?? '#f2f2f6', // weapon energy (blade / bolt)
    M: '#8a8f9c', // weapon metal (hilt / barrel)
  };
}

// ---------------------------------------------------------------------------
// Body sprites — authored facing right (+x forward), feet on the bottom row.
// ---------------------------------------------------------------------------

const STD_HEAD = [
  '....HHHHH.....',
  '...HHHHHHH....',
  '...HHSSSSS....',
  '...HSSKSSK....',
  '...HSSSSSS....',
  '....SSSSS.....',
  '.....SSS......',
];

const STD_TORSO = [
  '...BBBBBBB....',
  '..SBBBBBBBS...',
  '..SBBBBBBBS...',
  '..SBBBBBBBS...',
  '..GBBBBBBBG...',
  '...BBBBBBB....',
  '...BBBBBBB....',
  '...TTTTTTT....',
  '...BBBBBBB....',
];

const STD_LEGS_IDLE = [
  '...LL...LL....',
  '...LL...LL....',
  '...LL...LL....',
  '...LL...LL....',
  '...LL...LL....',
  '..KKK...KKK...',
];

const pad = (rows: string[], width: number): string[] =>
  rows.map((r) => r + '.'.repeat(width - r.length));

const STANDARD: Record<PoseId, SpriteGrid> = {
  idle: {
    rows: [...STD_HEAD, ...STD_TORSO, ...STD_LEGS_IDLE],
    anchorX: 6,
    head: [0, 6],
    hand: [11, 10],
  },
  walkA: {
    rows: [
      ...STD_HEAD,
      ...STD_TORSO,
      '...LL...LL....',
      '...LL...LL....',
      '..LL.....LL...',
      '..LL.....LL...',
      '.LL.......LL..',
      '.KK.......KKK.',
    ],
    anchorX: 6,
    head: [0, 6],
  },
  walkB: {
    rows: [
      ...STD_HEAD,
      ...STD_TORSO,
      '....LL..LL....',
      '....LL..LL....',
      '....LL..LL....',
      '....LL..LL....',
      '....LL..LL....',
      '...KKK..KKK...',
    ],
    anchorX: 6,
    head: [0, 6],
  },
  jump: {
    rows: [
      ...STD_HEAD,
      ...STD_TORSO,
      '...LLL..LLL...',
      '..KKL...LKK...',
    ],
    anchorX: 6,
    head: [0, 6],
  },
  block: {
    rows: [
      ...STD_HEAD.slice(0, 6),
      '.....SSS.GG...',
      '...BBBBBBBSS..',
      '..SBBBBBBBSS..',
      '..SBBBBBBBS...',
      '..SBBBBBBB....',
      '..GBBBBBBB....',
      '...BBBBBBB....',
      '...BBBBBBB....',
      '...TTTTTTT....',
      '...BBBBBBB....',
      ...STD_LEGS_IDLE,
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [6, 10],
  },
  hurt: {
    rows: [
      '..HHHHH.......',
      '.HHHHHHH......',
      '.HHSSSSS......',
      '.HSSKSSK......',
      '.HSSSSSS......',
      '..SSSSS....G..',
      '....SSS....S..',
      '..BBBBBBB.SS..',
      '.SBBBBBBBSS...',
      '.SBBBBBBB.....',
      '.GBBBBBBB.....',
      '..BBBBBBB.....',
      '..BBBBBBB.....',
      '...TTTTTTT....',
      '...BBBBBBB....',
      ...STD_LEGS_IDLE,
    ],
    anchorX: 6,
    head: [0, 4],
  },
  ko: {
    rows: [
      '..HHHH................',
      '.HHSSSK.BBBBBBBBB.....',
      '.HHSSSS.BBBBBBBBBLLLLK',
      '..SS....BBBBBBBBBLLLLK',
    ],
    anchorX: 11,
  },
  punch: {
    rows: [
      ...pad(STD_HEAD, 20),
      '...BBBBBBB..........',
      '..SBBBBBBBSSSSSSSGG.',
      '..SBBBBBBB..........',
      '..SBBBBBBB..........',
      '..GBBBBBBB..........',
      '...BBBBBBB..........',
      '...BBBBBBB..........',
      '...TTTTTTT..........',
      '...BBBBBBB..........',
      ...pad(STD_LEGS_IDLE, 20),
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [8, 17],
  },
  punchAlt: {
    rows: [
      ...pad(STD_HEAD, 20),
      '...BBBBBBB..........',
      '..SBBBBBBBS.........',
      '..SBBBBBBB..........',
      '..SBBBBBBBSSSSSSSGG.',
      '..GBBBBBBB..........',
      '...BBBBBBB..........',
      '...BBBBBBB..........',
      '...TTTTTTT..........',
      '...BBBBBBB..........',
      ...pad(STD_LEGS_IDLE, 20),
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [10, 17],
  },
  kick: {
    rows: [
      ...pad(STD_HEAD, 20),
      ...pad(STD_TORSO.slice(0, 7), 20),
      '...TTTTTTT..........',
      '...BBBBBBBLLLLLLLKK.',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '..KKK...............',
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [11, 10],
  },
  kickAlt: {
    rows: [
      ...pad(STD_HEAD, 20),
      '...BBBBBBB..........',
      '..SBBBBBBBS.........',
      '..SBBBBBBB..........',
      '..SBBBBBBB..........',
      '..GBBBBBBBLLLLLLLKK.',
      '...BBBBBBB..........',
      '...BBBBBBB..........',
      '...TTTTTTT..........',
      '...BBBBBBB..........',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '...LL...............',
      '..KKK...............',
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [9, 10],
  },
  shoryuken: {
    rows: [
      '.........G....',
      '.........S....',
      ...STD_HEAD,
      '...BBBBBBB....',
      '..SBBBBBBB....',
      '..SBBBBBBB....',
      '..GBBBBBBB....',
      '...BBBBBBB....',
      '...BBBBBBB....',
      '...TTTTTTT....',
      '...BBBBBBB....',
      '...LL...LL....',
      '...LL...LL....',
      '...LL...LL....',
      '....LL..LL....',
      '...KKK..KKK...',
    ],
    anchorX: 6,
    head: [2, 6],
    hand: [0, 9],
  },
  hadoken: {
    rows: [
      ...pad(STD_HEAD, 18),
      '...BBBBBBB........',
      '..SBBBBBBBSSSS....',
      '..SBBBBBBBSSSSS...',
      '...BBBBBBBSSSS....',
      '...BBBBBBB........',
      '...BBBBBBB........',
      '...TTTTTTT........',
      '...BBBBBBB........',
      ...pad(STD_LEGS_IDLE, 18),
    ],
    anchorX: 6,
    head: [0, 6],
    hand: [9, 14],
  },
};

const HVY_HEAD = [
  '.....HHHHH........',
  '....HHHHHHH.......',
  '....HHSSSSS.......',
  '....HSSKSSK.......',
  '....HSSSSSS.......',
  '.....SSSSS........',
];

const HVY_TORSO = [
  '...BBBBBBBBBBB....',
  '..SBBBBBBBBBBBS...',
  '..SBBBBBBBBBBBS...',
  '..SBYYYYYYYYYBS...',
  '..GBYYYYYYYYYBG...',
  '...BYYYYYYYYYB....',
  '...BYYYYYYYYYB....',
  '...TTTTTTTTTTT....',
  '...BBBBBBBBBBB....',
];

const HVY_LEGS_IDLE = [
  '...LLL....LLL.....',
  '...LLL....LLL.....',
  '...LLL....LLL.....',
  '...LLL....LLL.....',
  '...LLL....LLL.....',
  '..KKKK....KKKK....',
];

const HEAVY: Record<PoseId, SpriteGrid> = {
  idle: {
    rows: [...HVY_HEAD, ...HVY_TORSO, ...HVY_LEGS_IDLE],
    anchorX: 8,
    head: [0, 7],
    hand: [10, 14],
  },
  walkA: {
    rows: [
      ...HVY_HEAD,
      ...HVY_TORSO,
      '...LLL....LLL.....',
      '..LLL......LLL....',
      '..LLL......LLL....',
      '.LLL........LLL...',
      '.LLL........LLL...',
      '.KKK........KKKK..',
    ],
    anchorX: 8,
    head: [0, 7],
  },
  walkB: {
    rows: [
      ...HVY_HEAD,
      ...HVY_TORSO,
      '....LLL...LLL.....',
      '....LLL...LLL.....',
      '....LLL...LLL.....',
      '....LLL...LLL.....',
      '....LLL...LLL.....',
      '...KKKK...KKKK....',
    ],
    anchorX: 8,
    head: [0, 7],
  },
  jump: {
    rows: [
      ...HVY_HEAD,
      ...HVY_TORSO,
      '...LLLL...LLLL....',
      '..KKLL....LLKK....',
    ],
    anchorX: 8,
    head: [0, 7],
  },
  block: {
    rows: [
      ...HVY_HEAD.slice(0, 5),
      '.....SSSSS.GG.....',
      '...BBBBBBBBBBBSS..',
      '..SBBBBBBBBBBBSS..',
      '..SBBBBBBBBBBBS...',
      '..SBYYYYYYYYYB....',
      '..GBYYYYYYYYYB....',
      '...BYYYYYYYYYB....',
      '...BYYYYYYYYYB....',
      '...TTTTTTTTTTT....',
      '...BBBBBBBBBBB....',
      ...HVY_LEGS_IDLE,
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [5, 12],
  },
  hurt: {
    rows: [
      '...HHHHH..........',
      '..HHHHHHH.........',
      '..HHSSSSS.........',
      '..HSSKSSK.........',
      '..HSSSSSS.........',
      '...SSSSS.......G..',
      '..BBBBBBBBBBB..S..',
      '.SBBBBBBBBBBBSS...',
      '.SBBBBBBBBBBB.....',
      '.GBYYYYYYYYYB.....',
      '..BYYYYYYYYYB.....',
      '..BYYYYYYYYYB.....',
      '...BYYYYYYYYYB....',
      '...TTTTTTTTTTT....',
      '...BBBBBBBBBBB....',
      ...HVY_LEGS_IDLE,
    ],
    anchorX: 8,
    head: [0, 5],
  },
  ko: {
    rows: [
      '..HHHH..................',
      '.HHSSSK.BBBBBBBBBBB.....',
      '.HHSSSS.BYYYYYYYYYBLLLLK',
      '..SS....BBBBBBBBBBBLLLLK',
    ],
    anchorX: 12,
  },
  punch: {
    rows: [
      ...pad(HVY_HEAD, 24),
      '...BBBBBBBBBBB..........',
      '..SBBBBBBBBBBBSSSSSSGG..',
      '..SBBBBBBBBBBBS.........',
      '..SBYYYYYYYYYBS.........',
      '..GBYYYYYYYYYBG.........',
      '...BYYYYYYYYYB..........',
      '...BYYYYYYYYYB..........',
      '...TTTTTTTTTTT..........',
      '...BBBBBBBBBBB..........',
      ...pad(HVY_LEGS_IDLE, 24),
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [7, 21],
  },
  punchAlt: {
    rows: [
      ...pad(HVY_HEAD, 24),
      '...BBBBBBBBBBB..........',
      '..SBBBBBBBBBBBS.........',
      '..SBBBBBBBBBBBS.........',
      '..SBYYYYYYYYYBSSSSSSGG..',
      '..GBYYYYYYYYYB..........',
      '...BYYYYYYYYYB..........',
      '...BYYYYYYYYYB..........',
      '...TTTTTTTTTTT..........',
      '...BBBBBBBBBBB..........',
      ...pad(HVY_LEGS_IDLE, 24),
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [9, 21],
  },
  kick: {
    rows: [
      ...pad(HVY_HEAD, 24),
      ...pad(HVY_TORSO.slice(0, 7), 24),
      '...TTTTTTTTTTT..........',
      '...BBBBBBBBBBBLLLLLLLKK.',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '..KKKK..................',
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [10, 14],
  },
  kickAlt: {
    rows: [
      ...pad(HVY_HEAD, 24),
      '...BBBBBBBBBBB..........',
      '..SBBBBBBBBBBBS.........',
      '..SBBBBBBBBBBBS.........',
      '..SBYYYYYYYYYBLLLLLLLKK.',
      '..GBYYYYYYYYYB..........',
      '...BYYYYYYYYYB..........',
      '...BYYYYYYYYYB..........',
      '...TTTTTTTTTTT..........',
      '...BBBBBBBBBBB..........',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '...LLL..................',
      '..KKKK..................',
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [8, 14],
  },
  shoryuken: {
    rows: [
      '............G.....',
      '............S.....',
      ...HVY_HEAD,
      ...HVY_TORSO,
      '...LLL....LLL.....',
      '...LLL....LLL.....',
      '...LLL....LLL.....',
      '....LLL...LLL.....',
      '...KKKK...KKKK....',
    ],
    anchorX: 8,
    head: [2, 7],
    hand: [0, 12],
  },
  hadoken: {
    rows: [
      ...pad(HVY_HEAD, 22),
      '...BBBBBBBBBBB........',
      '..SBBBBBBBBBBBSSSS....',
      '..SBBBBBBBBBBBSSSSS...',
      '..SBYYYYYYYYYBSSSS....',
      '..GBYYYYYYYYYB........',
      '...BYYYYYYYYYB........',
      '...BYYYYYYYYYB........',
      '...TTTTTTTTTTT........',
      '...BBBBBBBBBBB........',
      ...pad(HVY_LEGS_IDLE, 22),
    ],
    anchorX: 8,
    head: [0, 7],
    hand: [8, 18],
  },
};

export const BODY_SPRITES: Record<BodyKind, Record<PoseId, SpriteGrid>> = {
  standard: STANDARD,
  heavy: HEAVY,
};

// ---------------------------------------------------------------------------
// Headgear overlays — `head` is the overlay cell that sits ON the body's
// head-top-center anchor.
// ---------------------------------------------------------------------------

export const HEADGEAR_SPRITES: Record<Headgear, SpriteGrid> = {
  turban: {
    rows: [
      '.TTTTT.',
      'TTTTTTT',
      'TTWTTTT',
      'TTTTTTT',
    ],
    anchorX: 3,
    head: [2, 3],
  },
  topknot: {
    rows: [
      '..HH.',
      '.HHHH',
    ],
    anchorX: 2,
    head: [1, 2],
  },
  mane: {
    rows: [
      '..HHHHH..',
      '.HHHHHHH.',
      'HHHHHHHHH',
      'HH.....HH',
      'HH.....HH',
      '.H......H',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  mohawk: {
    rows: [
      '...H...',
      '..HHH..',
      '..HHH..',
    ],
    anchorX: 3,
    head: [2, 3],
  },
  cap: {
    rows: [
      '.BBBBB..',
      'BTTTTTB.',
      '...BBBBB',
    ],
    anchorX: 3,
    head: [1, 3],
  },
  mask: {
    rows: [
      '.WWWWW.',
      'WWWWWWW',
      'WWWWWWW',
      'WWWWWWW',
      'WWWKWWK',
    ],
    anchorX: 3,
    head: [1, 3],
  },
  band: {
    rows: ['TTTTTTT'],
    anchorX: 3,
    head: [0, 3],
  },
  buns: {
    rows: [
      'HH.....HH',
      'HTH...HTH',
      '.H.HHH.H.',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  beret: {
    rows: [
      '.TTTTT..',
      'TTTTTTT.',
      'HH......',
    ],
    anchorX: 3,
    head: [1, 3],
  },
  ponytail: {
    rows: [
      '....HHHH..',
      '.H.TTTTTT.',
      'HH........',
      '.HH.......',
      'HH........',
    ],
    anchorX: 5,
    head: [0, 5],
  },
  pigtails: {
    rows: [
      '.....HHH...',
      'HH.HHHHH.HH',
      'HH.......HH',
      '.H.......H.',
    ],
    anchorX: 5,
    head: [1, 5],
  },
  // ---- Galaxy roster ----
  jediHair: {
    rows: [
      '.HHHHH.',
      'HHHHHHH',
      'HH...HH',
    ],
    anchorX: 3,
    head: [1, 3],
  },
  vaderMask: {
    rows: [
      '..KKKKK..',
      '.KKKKKKK.',
      'KKKKKKKKK',
      'KKKMMMKKK',
      'KKKKKKKKK',
      '.KKKKKKK.',
      '..KK.KK..',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  hood: {
    rows: [
      '..BBBBB..',
      '.BBBBBBB.',
      'BBBKKKBBB',
      'BBKKKKKBB',
      'BBKKKKKBB',
      'BB.KKK.BB',
      'BB.....BB',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  horns: {
    rows: [
      'K.K.K.K.K',
      'K.K.K.K.K',
      '.KKHHHKK.',
      '.HHHHHHH.',
    ],
    anchorX: 4,
    head: [3, 4],
  },
  bigEars: {
    rows: [
      '..H...H..',
      'S.HHHHH.S',
      'SSHHHHHSS',
      'SS.....SS',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  fettHelmet: {
    rows: [
      'T........',
      'T.BBBBB..',
      'TBBBBBBB.',
      '.BBKKKKB.',
      '.BBKKKKB.',
      '.BBBBBBB.',
    ],
    anchorX: 4,
    head: [2, 4],
  },
  trooperHelmet: {
    rows: [
      '..WWWWW..',
      '.WWWWWWW.',
      'WWWWWWWWW',
      'WKKKKKKKW',
      'WKWWWWWKW',
      'WWWKKKWWW',
      '.WWWWWWW.',
    ],
    anchorX: 4,
    head: [2, 4],
  },
};

/** Cape (General) — drawn behind the body, hanging down the back (left). */
export const CAPE_SPRITE: SpriteGrid = {
  rows: [
    '..BBBB',
    '.BBBBB',
    'BBBBB.',
    'BBBBB.',
    'BBBB..',
    'BBBB..',
    'BBBB..',
    '.BBB..',
    '.BBB..',
    '.BBB..',
    'BBBB..',
    'BBBB..',
  ],
  anchorX: 4,
  head: [1, 4],
};

// ---------------------------------------------------------------------------
// Pose selection — mirrors drawFighter's branch order (duelFighter.ts).
// ---------------------------------------------------------------------------

export interface PoseInput {
  state: DuelState;
  air: number;
  currentMove: DuelMoveId | null;
  movePhase: 'windup' | 'active' | 'recover' | null;
  character: Pick<DuelCharacter, 'superKind' | 'flurryStyle'>;
}

export function poseFor(f: PoseInput, now: number): { pose: PoseId; rotate90: boolean } {
  if (f.state === 'ko') return { pose: 'ko', rotate90: false };

  const move = f.currentMove;
  const active = f.movePhase === 'active';

  if (move === 'superCombo') {
    if (active) {
      if (f.character.superKind === 'drill') return { pose: 'kick', rotate90: true };
      if (f.character.flurryStyle === 'kick') {
        return { pose: Math.sin(now / 40) > 0 ? 'kick' : 'kickAlt', rotate90: false };
      }
      return { pose: Math.sin(now / 45) > 0 ? 'punch' : 'punchAlt', rotate90: false };
    }
    return { pose: 'idle', rotate90: false };
  }
  if (move === 'shoryuken') return { pose: 'shoryuken', rotate90: false };
  if (move === 'hadoken' || move === 'superFireball') return { pose: 'hadoken', rotate90: false };
  if (move === 'punch') return { pose: active ? 'punch' : 'idle', rotate90: false };
  if (move === 'kick') return { pose: active ? 'kick' : 'idle', rotate90: false };

  if (f.air > 2) return { pose: 'jump', rotate90: false };
  if (f.state === 'block') return { pose: 'block', rotate90: false };
  if (f.state === 'hurt') return { pose: 'hurt', rotate90: false };
  if (f.state === 'walk') {
    return { pose: Math.sin(now / 90) > 0 ? 'walkA' : 'walkB', rotate90: false };
  }
  return { pose: 'idle', rotate90: false }; // idle, win, attack windups
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const CELL = PIXEL_SCALE;

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: SpriteGrid,
  palette: Record<string, string | null>,
  offX: number,
  offY: number
): void {
  const h = grid.rows.length;
  for (let r = 0; r < h; r++) {
    const row = grid.rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(offX + (c - grid.anchorX) * CELL, offY + (r - h) * CELL, CELL, CELL);
    }
  }
}

/** Draw an overlay grid so its `head` cell lands on the body's `head` cell. */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  body: SpriteGrid,
  overlay: SpriteGrid,
  palette: Record<string, string | null>
): void {
  if (!body.head || !overlay.head) return;
  const bh = body.rows.length;
  const [hr, hc] = body.head;
  const [oar, oac] = overlay.head;
  for (let r = 0; r < overlay.rows.length; r++) {
    const row = overlay.rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(
        (hc + c - oac - body.anchorX) * CELL,
        (hr + r - oar - bh) * CELL,
        CELL,
        CELL
      );
    }
  }
}

/** Which way a held weapon points in each pose: [dx, dy] in cells. */
const WEAPON_DIR: Record<PoseId, [number, number]> = {
  idle: [1, -1],
  walkA: [1, -1],
  walkB: [1, -1],
  jump: [1, -1],
  block: [0, -1],
  hurt: [1, 1],
  ko: [1, 0],
  punch: [1, 0],
  punchAlt: [1, 0],
  kick: [1, 0],
  kickAlt: [1, 0],
  shoryuken: [0, -1],
  hadoken: [1, 0],
};

/**
 * Draw the held weapon as sprite cells from the body grid's `hand` anchor.
 * Blades and barrels are straight lines of cells, so they're generated rather
 * than authored — the same trick the `claw` trait already uses.
 */
function drawPixelWeapon(
  ctx: CanvasRenderingContext2D,
  grid: SpriteGrid,
  pose: PoseId,
  v: CharacterVisual,
  palette: Record<string, string | null>
): void {
  const weapon = v.weapon;
  if (!weapon || !grid.hand) return;
  const [hr, hc] = grid.hand;
  const [dx, dy] = WEAPON_DIR[pose];
  const h = grid.rows.length;
  const energy = palette.E ?? '#f2f2f6';
  const metal = palette.M ?? '#8a8f9c';

  const cell = (k: number, color: string, side = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      (hc + dx * k * side - grid.anchorX) * CELL,
      (hr + dy * k * side - h) * CELL,
      CELL,
      CELL
    );
  };

  switch (weapon) {
    case 'saber':
      cell(0, metal);
      for (let k = 1; k <= 10; k++) cell(k, energy);
      break;
    case 'saberDouble':
      cell(0, metal);
      for (let k = 1; k <= 7; k++) {
        cell(k, energy);
        cell(k, energy, -1);
      }
      break;
    case 'blaster':
      cell(0, metal);
      cell(1, metal);
      cell(2, energy);
      break;
    case 'bowcaster':
      cell(0, metal);
      cell(1, metal);
      cell(2, metal);
      cell(3, energy);
      break;
    case 'prod':
      cell(0, metal);
      cell(1, metal);
      cell(2, energy);
      break;
  }
}

/** Pixel-art counterpart of drawFighter — same origin/facing conventions. */
export function drawPixelFighter(
  ctx: CanvasRenderingContext2D,
  f: DuelFighter,
  now: number
): void {
  const v = f.character.visual;
  const palette = resolvePalette(v);
  const kind = bodyKindFor(v.build);

  // Shadow (same as vector — pixelates through the low-res pass).
  ctx.save();
  ctx.globalAlpha = 0.28 * (1 - Math.min(0.6, f.air / 120));
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(f.x, DL.GROUND_Y + 2, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Snap to the 3px world grid so cells align with the low-res pass.
  const px = Math.round(f.x / CELL) * CELL;
  const feetY = DL.GROUND_Y - Math.round(f.air / CELL) * CELL;

  ctx.save();
  ctx.translate(px, feetY);

  if (f.state === 'ko') {
    // Dedicated lying sprite — no rotation (it would shred the grid).
    ctx.translate(0, -CELL);
    ctx.globalAlpha = 0.9;
    ctx.scale(f.facing, 1);
  } else {
    ctx.scale(f.facing, 1);
  }

  // Idle bounce quantized to a whole-cell 2-frame bob.
  const grounded = f.air <= 0.5 && f.state !== 'ko';
  const bouncing =
    grounded &&
    (f.state === 'idle' || f.state === 'walk' || f.state === 'block' || f.state === 'win');
  const bounce = bouncing ? Math.abs(Math.sin(now / 165 + f.x * 0.06)) * 2.6 : 0;
  if (bounce >= 1.3) ctx.translate(0, -CELL);

  const move = f.currentMove;
  const isSuper = move === 'superCombo' || move === 'superFireball';
  if (isSuper && f.movePhase !== null) {
    // Super aura (same as vector; chunky through the pass).
    const aura = ctx.createRadialGradient(0, -26, 3, 0, -26, 32);
    aura.addColorStop(0, f.character.superColor);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -26, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const { pose, rotate90 } = poseFor(f, now);
  if (rotate90) {
    // Drill: exact quarter turn keeps cells on the grid.
    ctx.translate(0, -15);
    ctx.rotate(Math.PI / 2);
  }

  const grid = BODY_SPRITES[kind][pose];

  if (v.cape && pose !== 'ko' && grid.head) {
    drawOverlay(ctx, grid, CAPE_SPRITE, palette);
  }

  drawGrid(ctx, grid, palette, 0, 0);

  if (grid.head) {
    drawOverlay(ctx, grid, HEADGEAR_SPRITES[v.headgear], palette);
  }

  // Held weapon (galaxy roster), drawn from the grid's hand anchor.
  if (pose !== 'ko') drawPixelWeapon(ctx, grid, pose, v, palette);

  // Claw slash cells on the lead hand during punches.
  if (v.claw && grid.hand && (pose === 'punch' || pose === 'punchAlt')) {
    const [hr, hc] = grid.hand;
    ctx.fillStyle = '#f2f2f6';
    for (let k = 1; k <= 3; k++) {
      ctx.fillRect((hc - grid.anchorX + k) * CELL, (hr - grid.rows.length) * CELL, CELL, CELL);
    }
  }

  // Fireball charge orb at the palms (chunky gradient-free circle).
  if (pose === 'hadoken' && f.movePhase === 'windup' && grid.hand) {
    const [hr, hc] = grid.hand;
    const big = move === 'superFireball';
    ctx.fillStyle = big ? f.character.superColor : 'rgba(150,220,255,0.95)';
    ctx.beginPath();
    ctx.arc(
      (hc - grid.anchorX + 2) * CELL,
      (hr - grid.rows.length) * CELL,
      big ? 15 : 9,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  ctx.restore();
}
