import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getEntryImages, pickRandomEntryImage } from '../../../utils/entryImages';
import { shuffle } from '../../../utils/array';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { battleBotsTheme } from '../themes';
import './BattleArena.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type AttackType = 'fireball' | 'buzzsaw' | 'hammer' | 'machinegun' | 'flamethrower' | 'yoyo' | 'stickyhand' | 'inflatableclub';

interface AttackDef {
  type: AttackType;
  range: 'melee' | 'ranged';
  damage: [number, number]; // [min, max]
  cooldownMs: number;
  speedMultiplier: number; // Movement speed modifier
  attackRange: number; // Distance to begin attacking
  color: string;
  label: string;
}

interface Bot {
  entry: Entry;
  selectedImageDataUrl?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  color: string;
  attack: AttackDef;
  targetId: number | null;
  state: 'idle' | 'moving' | 'attacking' | 'dead';
  attackCooldownUntil: number;
  facing: number;
  deathTime: number | null;
  lastHitByName: string | null;
  lastHitByWeapon: AttackType | null;
  // Navigation
  path: Array<{ x: number; y: number }>; // waypoints from A*
  pathIndex: number;                       // current waypoint index
  pathTargetId: number | null;             // which target this path was computed for
  pathTargetX: number;                     // target position when path was computed
  pathTargetY: number;
  gooSlowed: boolean;                       // permanently halved speed from goo
  targetAcquiredAt: number;                 // timestamp when current target was selected
}

interface Projectile {
  id: number;
  sourceId: number;
  targetId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: string;
  life: number;
  type: AttackType;
}

interface Effect {
  x: number;
  y: number;
  type: 'explosion' | 'slash' | 'spark' | 'hit' | 'dmgNumber';
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
  text?: string;
}

interface FrameSnapshot {
  time: number;
  bots: Array<{ x: number; y: number; hp: number; maxHp: number; color: string; state: string; facing: number; deathTime: number | null; attack: AttackDef; entry: Entry; selectedImageDataUrl?: string; vx: number; vy: number; gooSlowed: boolean }>;
  projectiles: Array<{ x: number; y: number; vx: number; vy: number; radius: number; color: string; type: AttackType; life: number }>;
  effects: Array<Effect>;
  obstacles: Array<Obstacle>;
}

type HazardType = 'lava' | 'spike' | 'goo';

interface Obstacle {
  x: number;      // center x
  y: number;      // center y
  w: number;      // half-width
  h: number;      // half-height
  color: string;
  type: 'wall' | 'pillar' | 'crate' | 'hazard';
  hazardType?: HazardType;
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry, selectedImageDataUrl?: string, killerInfo?: { name: string; weapon: string }) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  onAllDestroyed?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  currentWinnerImage?: string;
  currentWinnerImages?: string[];
  currentWinnerKillerInfo?: { name: string; weapon: string };
  currentWinnerIsLastPlayer?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const BOT_RADIUS = 12;
const BASE_SPEED = 160; // pixels per second
const MAX_HP = 100;
const ARENA_MARGIN = 50;
const RAGE_TIMER_MS = 10000;
const KNOCKBACK_SPEED: Partial<Record<AttackType, number>> = {
  hammer: 400,
  fireball: 280,
  buzzsaw: 180,
  flamethrower: 120,
  yoyo: 100,
  stickyhand: -500, // negative = pulls target toward attacker
  inflatableclub: 500,
};
const WALL_COLLISION_DAMAGE = 8;
const HAZARD_DPS: Record<HazardType, number> = {
  lava: 9999,   // instant kill
  spike: 35,    // sustained damage
  goo: 5,       // light damage
};
const GOO_SLOW_FACTOR = 0.5; // permanent half speed after goo contact
const HAZARD_COLORS: Record<HazardType, string> = {
  lava: '#CC3300',
  spike: '#7A7A8A',
  goo: '#44AA22',
};

// ─── Pathfinding Grid ───────────────────────────────────────────────────────

const GRID_CELL = 16; // pixels per grid cell
const GRID_COLS = Math.ceil(CANVAS_WIDTH / GRID_CELL);
const GRID_ROWS = Math.ceil(CANVAS_HEIGHT / GRID_CELL);

// Build a blocked-cell grid from obstacles. Cells overlapping any obstacle
// (with padding for bot radius) are marked blocked.
function buildNavGrid(obstacles: Obstacle[]): boolean[][] {
  const grid: boolean[][] = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(false),
  );
  const pad = BOT_RADIUS + 2; // inflate obstacles so bots don't clip
  for (const o of obstacles.filter(o => o.hazardType !== 'goo')) {
    const minC = Math.max(0, Math.floor((o.x - o.w - pad) / GRID_CELL));
    const maxC = Math.min(GRID_COLS - 1, Math.floor((o.x + o.w + pad) / GRID_CELL));
    const minR = Math.max(0, Math.floor((o.y - o.h - pad) / GRID_CELL));
    const maxR = Math.min(GRID_ROWS - 1, Math.floor((o.y + o.h + pad) / GRID_CELL));
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        grid[r][c] = true;
      }
    }
  }
  return grid;
}

function worldToGrid(wx: number, wy: number): { col: number; row: number } {
  return {
    col: clamp(Math.floor(wx / GRID_CELL), 0, GRID_COLS - 1),
    row: clamp(Math.floor(wy / GRID_CELL), 0, GRID_ROWS - 1),
  };
}

function gridToWorld(col: number, row: number): { x: number; y: number } {
  return { x: col * GRID_CELL + GRID_CELL / 2, y: row * GRID_CELL + GRID_CELL / 2 };
}

// A* pathfinding on the nav grid. Returns world-coordinate waypoints.
function findPath(
  grid: boolean[][],
  startX: number, startY: number,
  goalX: number, goalY: number,
): Array<{ x: number; y: number }> {
  const start = worldToGrid(startX, startY);
  const goal = worldToGrid(goalX, goalY);

  // If start or goal is inside a blocked cell, snap to nearest open cell
  const snapToOpen = (c: number, r: number): { col: number; row: number } => {
    if (!grid[r]?.[c]) return { col: c, row: r };
    // BFS for nearest open cell
    const visited = new Set<string>();
    const queue: Array<{ col: number; row: number }> = [{ col: c, row: r }];
    visited.add(`${c},${r}`);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (!grid[nr][nc]) return { col: nc, row: nr };
        queue.push({ col: nc, row: nr });
      }
    }
    return { col: c, row: r }; // fallback
  };

  const s = snapToOpen(start.col, start.row);
  const g = snapToOpen(goal.col, goal.row);

  if (s.col === g.col && s.row === g.row) {
    return [gridToWorld(g.col, g.row)];
  }

  // A* with 8-directional movement
  const key = (c: number, r: number) => r * GRID_COLS + c;
  const heuristic = (c: number, r: number) =>
    Math.abs(c - g.col) + Math.abs(r - g.row); // Manhattan

  const openSet = new Map<number, { col: number; row: number; g: number; f: number }>();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();

  const startKey = key(s.col, s.row);
  const goalKey = key(g.col, g.row);
  gScore.set(startKey, 0);
  openSet.set(startKey, { col: s.col, row: s.row, g: 0, f: heuristic(s.col, s.row) });

  const dirs = [
    [0, -1, 1], [0, 1, 1], [-1, 0, 1], [1, 0, 1],
    [-1, -1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [1, 1, 1.414],
  ];

  let iterations = 0;
  const maxIterations = GRID_COLS * GRID_ROWS * 2;

  while (openSet.size > 0 && iterations++ < maxIterations) {
    // Find node with lowest f in open set
    let bestKey = -1;
    let bestF = Infinity;
    for (const [k, node] of openSet) {
      if (node.f < bestF) { bestF = node.f; bestKey = k; }
    }
    if (bestKey === -1) break;

    const current = openSet.get(bestKey)!;
    openSet.delete(bestKey);

    if (bestKey === goalKey) {
      // Reconstruct path
      const pathKeys: number[] = [goalKey];
      let cur = goalKey;
      while (cameFrom.has(cur)) {
        cur = cameFrom.get(cur)!;
        pathKeys.push(cur);
      }
      pathKeys.reverse();

      // Convert to world coords and simplify: skip waypoints with direct LOS
      const worldPath = pathKeys.map(k => {
        const r = Math.floor(k / GRID_COLS);
        const c = k % GRID_COLS;
        return gridToWorld(c, r);
      });

      return simplifyPath(worldPath, grid);
    }

    for (const [dc, dr, cost] of dirs) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      if (grid[nr][nc]) continue;

      // For diagonal moves, also check the two adjacent cardinal cells
      // to prevent corner-cutting through obstacles
      if (dc !== 0 && dr !== 0) {
        if (grid[current.row + dr]?.[current.col] || grid[current.row]?.[current.col + dc]) continue;
      }

      const nKey = key(nc, nr);
      const tentG = current.g + cost;
      const prevG = gScore.get(nKey);

      if (prevG === undefined || tentG < prevG) {
        gScore.set(nKey, tentG);
        cameFrom.set(nKey, bestKey);
        openSet.set(nKey, { col: nc, row: nr, g: tentG, f: tentG + heuristic(nc, nr) });
      }
    }
  }

  // No path found — just return goal directly (fallback)
  return [{ x: goalX, y: goalY }];
}

// Remove redundant waypoints: if you can go directly from waypoint i to i+2
// without hitting a blocked cell, skip i+1.
function simplifyPath(
  path: Array<{ x: number; y: number }>,
  grid: boolean[][],
): Array<{ x: number; y: number }> {
  if (path.length <= 2) return path;
  const result = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let furthest = i + 1;
    for (let j = i + 2; j < path.length; j++) {
      if (gridLineOfSight(path[i], path[j], grid)) {
        furthest = j;
      }
    }
    result.push(path[furthest]);
    i = furthest;
  }
  return result;
}

// Check line-of-sight on the grid using Bresenham-like stepping
function gridLineOfSight(
  a: { x: number; y: number },
  b: { x: number; y: number },
  grid: boolean[][],
): boolean {
  const d = dist(a.x, a.y, b.x, b.y);
  const steps = Math.ceil(d / (GRID_CELL * 0.5));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const wx = a.x + (b.x - a.x) * t;
    const wy = a.y + (b.y - a.y) * t;
    const { col, row } = worldToGrid(wx, wy);
    if (grid[row]?.[col]) return false;
  }
  return true;
}



// ─── Attack Definitions ─────────────────────────────────────────────────────

const ATTACKS: AttackDef[] = [
  {
    type: 'fireball',
    range: 'ranged',
    damage: [15, 22],
    cooldownMs: 800,
    speedMultiplier: 1.0,
    attackRange: 150,
    color: '#3AA3FF',
    label: '💦',
  },
  {
    type: 'buzzsaw',
    range: 'melee',
    damage: [25, 32],
    cooldownMs: 500,
    speedMultiplier: 1.5,
    attackRange: 28,
    color: '#FF66CC',
    label: '🌀',
  },
  {
    type: 'hammer',
    range: 'melee',
    damage: [35, 42],
    cooldownMs: 1000,
    speedMultiplier: 0.7,
    attackRange: 32,
    color: '#FFD54F',
    label: '🗡️',
  },
  {
    type: 'machinegun',
    range: 'ranged',
    damage: [5, 9],
    cooldownMs: 200,
    speedMultiplier: 1.0,
    attackRange: 120,
    color: '#66E0FF',
    label: '💧',
  },
  {
    type: 'flamethrower',
    range: 'ranged',
    damage: [3, 6],
    cooldownMs: 80,
    speedMultiplier: 0.9,
    attackRange: 65,
    color: '#BBEEFF',
    label: '🫧',
  },
  {
    type: 'yoyo',
    range: 'melee',
    damage: [10, 16],
    cooldownMs: 400,
    speedMultiplier: 1.3,
    attackRange: 42,
    color: '#FF5252',
    label: '🪀',
  },
  {
    type: 'stickyhand',
    range: 'melee',
    damage: [18, 28],
    cooldownMs: 700,
    speedMultiplier: 1.0,
    attackRange: 90,
    color: '#E91E63',
    label: '🖐️',
  },
  {
    type: 'inflatableclub',
    range: 'melee',
    damage: [30, 42],
    cooldownMs: 1300,
    speedMultiplier: 0.65,
    attackRange: 36,
    color: '#FF9800',
    label: '🥒',
  },
];

const WEAPON_LABELS: Record<AttackType, string> = {
  fireball: '💦 Water Balloon',
  buzzsaw: '🌀 Pinwheel',
  hammer: '🗡️ Boffer Sword',
  machinegun: '💧 Squirt Gun',
  flamethrower: '🫧 Bubble Blower',
  yoyo: '🪀 Yo-Yo',
  stickyhand: '🖐️ Sticky Hand',
  inflatableclub: '🥒 Inflatable Club',
};

// ─── Utility Functions ──────────────────────────────────────────────────────

function rollDamage(attack: AttackDef): number {
  const [min, max] = attack.damage;
  return min + Math.random() * (max - min);
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Place bots at even intervals along the rectangular perimeter of the arena
function perimeterPosition(index: number, total: number): { x: number; y: number } {
  const left = ARENA_MARGIN;
  const right = CANVAS_WIDTH - ARENA_MARGIN;
  const top = ARENA_MARGIN;
  const bottom = CANVAS_HEIGHT - ARENA_MARGIN;
  const w = right - left;
  const h = bottom - top;
  const perimeter = 2 * w + 2 * h;
  const step = perimeter / total;
  let d = step * index;

  // Walk the perimeter: top → right → bottom → left
  if (d < w) {
    return { x: left + d, y: top };
  }
  d -= w;
  if (d < h) {
    return { x: right, y: top + d };
  }
  d -= h;
  if (d < w) {
    return { x: right - d, y: bottom };
  }
  d -= w;
  return { x: left, y: bottom - d };
}

// ─── Obstacle Logic ─────────────────────────────────────────────────────────

const WALL_COLOR = '#555568';
const WALL_THICKNESS = 6; // half-thickness of maze walls

function generateObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];

  // Define a grid that divides the playable area into cells
  // We'll place walls on grid lines with random gaps to form a maze
  const left = ARENA_MARGIN + 20;
  const right = CANVAS_WIDTH - ARENA_MARGIN - 20;
  const top = ARENA_MARGIN + 20;
  const bottom = CANVAS_HEIGHT - ARENA_MARGIN - 20;
  const playW = right - left;
  const playH = bottom - top;

  const cols = 3; // 3 columns → 2 interior vertical lines
  const rows = 4; // 4 rows → 3 interior horizontal lines
  const cellW = playW / cols;
  const cellH = playH / rows;
  const gapSize = 28; // passage width in each wall segment

  // Pick one of several maze layout strategies at random
  const strategy = Math.floor(Math.random() * 3);

  if (strategy === 0) {
    // Strategy: grid walls with random gaps
    // Horizontal interior walls
    for (let r = 1; r < rows; r++) {
      const wy = top + r * cellH;
      // Choose 1-2 random gap positions along this row
      const gapCols = new Set<number>();
      gapCols.add(Math.floor(Math.random() * cols));
      if (Math.random() > 0.4) gapCols.add(Math.floor(Math.random() * cols));

      for (let c = 0; c < cols; c++) {
        if (gapCols.has(c)) continue; // leave a gap here
        const wx = left + c * cellW + cellW / 2;
        const halfLen = (cellW - gapSize * 0.3) / 2;
        obstacles.push({ x: wx, y: wy, w: halfLen, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
      }
    }

    // Vertical interior walls
    for (let c = 1; c < cols; c++) {
      const wx = left + c * cellW;
      const gapRows = new Set<number>();
      gapRows.add(Math.floor(Math.random() * rows));
      if (Math.random() > 0.4) gapRows.add(Math.floor(Math.random() * rows));

      for (let r = 0; r < rows; r++) {
        if (gapRows.has(r)) continue;
        const wy = top + r * cellH + cellH / 2;
        const halfLen = (cellH - gapSize * 0.3) / 2;
        obstacles.push({ x: wx, y: wy, w: WALL_THICKNESS, h: halfLen, color: WALL_COLOR, type: 'wall' });
      }
    }
  } else if (strategy === 1) {
    // Strategy: concentric barriers with openings
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;

    // Outer ring — 4 wall segments with gaps at random sides
    const outerW = playW * 0.4;
    const outerH = playH * 0.38;
    const openSides = new Set<number>();
    const firstOpen = Math.floor(Math.random() * 4);
    openSides.add(firstOpen);
    openSides.add((firstOpen + 2) % 4); // opposite side too

    if (!openSides.has(0)) // top
      obstacles.push({ x: centerX, y: centerY - outerH, w: outerW, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
    if (!openSides.has(1)) // right
      obstacles.push({ x: centerX + outerW, y: centerY, w: WALL_THICKNESS, h: outerH, color: WALL_COLOR, type: 'wall' });
    if (!openSides.has(2)) // bottom
      obstacles.push({ x: centerX, y: centerY + outerH, w: outerW, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
    if (!openSides.has(3)) // left
      obstacles.push({ x: centerX - outerW, y: centerY, w: WALL_THICKNESS, h: outerH, color: WALL_COLOR, type: 'wall' });

    // Inner cross — short walls radiating from near center
    const armLen = playW * 0.15;
    const armOffset = 25;
    // Pick 2-3 random arms
    const arms = shuffle([0, 1, 2, 3]).slice(0, 2 + Math.floor(Math.random() * 2));
    for (const arm of arms) {
      if (arm === 0) obstacles.push({ x: centerX, y: centerY - armOffset - armLen / 2, w: WALL_THICKNESS, h: armLen / 2, color: WALL_COLOR, type: 'wall' });
      if (arm === 1) obstacles.push({ x: centerX + armOffset + armLen / 2, y: centerY, w: armLen / 2, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
      if (arm === 2) obstacles.push({ x: centerX, y: centerY + armOffset + armLen / 2, w: WALL_THICKNESS, h: armLen / 2, color: WALL_COLOR, type: 'wall' });
      if (arm === 3) obstacles.push({ x: centerX - armOffset - armLen / 2, y: centerY, w: armLen / 2, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
    }
  } else {
    // Strategy: staggered horizontal walls (like a baffle/chicane)
    const wallCount = 3 + Math.floor(Math.random() * 2); // 3-4 horizontal baffles
    const spacing = playH / (wallCount + 1);

    for (let i = 1; i <= wallCount; i++) {
      const wy = top + i * spacing;
      const wallLen = playW * (0.45 + Math.random() * 0.2);
      // Alternate sides: even rows from left, odd rows from right
      if (i % 2 === 1) {
        const wx = left + wallLen / 2;
        obstacles.push({ x: wx, y: wy, w: wallLen / 2, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
      } else {
        const wx = right - wallLen / 2;
        obstacles.push({ x: wx, y: wy, w: wallLen / 2, h: WALL_THICKNESS, color: WALL_COLOR, type: 'wall' });
      }
    }

    // Add a couple of short vertical connectors between baffles
    for (let i = 0; i < 2; i++) {
      const vx = left + playW * (0.3 + Math.random() * 0.4);
      const vy = top + playH * (0.2 + Math.random() * 0.6);
      obstacles.push({ x: vx, y: vy, w: WALL_THICKNESS, h: cellH * 0.4, color: WALL_COLOR, type: 'wall' });
    }
  }

  // Add 1-2 pillars in random spots for flavor
  const pillarCount = 1 + Math.floor(Math.random() * 2);
  const PILLAR_R = 10; // pillar half-size
  const PILLAR_PAD = 10;
  for (let i = 0; i < pillarCount; i++) {
    let px = 0, py = 0, placed = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      px = left + PILLAR_R + PILLAR_PAD + Math.random() * (playW - 2 * (PILLAR_R + PILLAR_PAD));
      py = top + PILLAR_R + PILLAR_PAD + Math.random() * (playH - 2 * (PILLAR_R + PILLAR_PAD));
      const overlaps = obstacles.some(o => {
        const gapX = Math.abs(px - o.x) - (PILLAR_R + o.w + PILLAR_PAD);
        const gapY = Math.abs(py - o.y) - (PILLAR_R + o.h + PILLAR_PAD);
        return gapX < 0 && gapY < 0;
      });
      if (!overlaps) { placed = true; break; }
    }
    if (placed) {
      obstacles.push({ x: px, y: py, w: PILLAR_R, h: PILLAR_R, color: '#6a6a7a', type: 'pillar' });
    }
  }

  // Add 2-4 hazard zones (lava, goo — spikes spawn dynamically during battle)
  const hazardTypes: HazardType[] = ['lava', 'goo'];
  const hazardCount = 2 + Math.floor(Math.random() * 3);
  const HAZARD_PAD = 10; // minimum gap between hazard edge and any obstacle edge
  for (let i = 0; i < hazardCount; i++) {
    const hw = 14 + Math.random() * 10;
    const hh = 14 + Math.random() * 10;
    let hx = 0, hy = 0, placed = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      hx = left + hw + HAZARD_PAD + Math.random() * (playW - 2 * (hw + HAZARD_PAD));
      hy = top + hh + HAZARD_PAD + Math.random() * (playH - 2 * (hh + HAZARD_PAD));
      const overlaps = obstacles.some(o => {
        const gapX = Math.abs(hx - o.x) - (hw + o.w + HAZARD_PAD);
        const gapY = Math.abs(hy - o.y) - (hh + o.h + HAZARD_PAD);
        return gapX < 0 && gapY < 0;
      });
      if (!overlaps) { placed = true; break; }
    }
    if (placed) {
      const ht = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
      obstacles.push({ x: hx, y: hy, w: hw, h: hh, color: HAZARD_COLORS[ht], type: 'hazard', hazardType: ht });
    }
  }

  return obstacles;
}

// Check if a circle (bot or projectile) collides with an obstacle's AABB
function circleRectCollision(
  cx: number, cy: number, cr: number,
  ox: number, oy: number, ow: number, oh: number,
): { hit: boolean; nx: number; ny: number; overlap: number } {
  const closestX = clamp(cx, ox - ow, ox + ow);
  const closestY = clamp(cy, oy - oh, oy + oh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < cr && d > 0) {
    return { hit: true, nx: dx / d, ny: dy / d, overlap: cr - d };
  }
  // Handle case where center is inside the rect
  if (d === 0 && cx >= ox - ow && cx <= ox + ow && cy >= oy - oh && cy <= oy + oh) {
    return { hit: true, nx: 0, ny: -1, overlap: cr };
  }
  return { hit: false, nx: 0, ny: 0, overlap: 0 };
}

// Check if a line segment from (x1,y1) to (x2,y2) intersects an obstacle AABB
function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  ox: number, oy: number, ow: number, oh: number,
): boolean {
  const left = ox - ow;
  const right = ox + ow;
  const top = oy - oh;
  const bottom = oy + oh;

  // Cohen-Sutherland-style: check if line segment crosses the rect
  // Quick reject: both endpoints on the same side
  if ((x1 < left && x2 < left) || (x1 > right && x2 > right)) return false;
  if ((y1 < top && y2 < top) || (y1 > bottom && y2 > bottom)) return false;

  // Check if either endpoint is inside
  if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true;
  if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true;

  // Check intersections with each edge
  const dx = x2 - x1;
  const dy = y2 - y1;

  const edges = [
    { ex: left, ey1: top, ey2: bottom, isVertical: true },
    { ex: right, ey1: top, ey2: bottom, isVertical: true },
    { ex: top, ey1: left, ey2: right, isVertical: false },
    { ex: bottom, ey1: left, ey2: right, isVertical: false },
  ];

  for (const edge of edges) {
    if (edge.isVertical) {
      if (dx === 0) continue;
      const t = (edge.ex - x1) / dx;
      if (t >= 0 && t <= 1) {
        const iy = y1 + t * dy;
        if (iy >= edge.ey1 && iy <= edge.ey2) return true;
      }
    } else {
      if (dy === 0) continue;
      const t = (edge.ex - y1) / dy;
      if (t >= 0 && t <= 1) {
        const ix = x1 + t * dx;
        if (ix >= edge.ey1 && ix <= edge.ey2) return true;
      }
    }
  }

  return false;
}

// Check line of sight between two points (not blocked by any obstacle)
function hasLineOfSight(x1: number, y1: number, x2: number, y2: number, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) {
    if (lineIntersectsRect(x1, y1, x2, y2, o.x, o.y, o.w, o.h)) {
      return false;
    }
  }
  return true;
}

// Draws the melee weapon visual for a bot, centered at the origin (caller has already translated).
// `facing` is the direction to the target; `t` is a time-based animation seed.
function drawMeleeVisual(ctx: CanvasRenderingContext2D, attackType: AttackType, facing: number, t: number): void {
  if (attackType === 'buzzsaw') {
    // Pinwheel: 6 colorful triangular petals spinning around the bot
    const petalColors = ['#FF66CC', '#66E0FF', '#FFEB3B', '#8BC34A', '#FF9800', '#AB47BC'];
    const petalR = BOT_RADIUS + 8;
    for (let i = 0; i < 6; i++) {
      const baseAng = t + (i * Math.PI * 2 / 6);
      ctx.fillStyle = petalColors[i];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(baseAng) * petalR, Math.sin(baseAng) * petalR);
      ctx.lineTo(Math.cos(baseAng + 0.5) * petalR * 0.6, Math.sin(baseAng + 0.5) * petalR * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (attackType === 'hammer') {
    // Boffer sword: foam blade with colored grip and pommel
    const swingAngle = facing + Math.sin(t * 3) * 0.8;
    const bladeLen = BOT_RADIUS + 16;
    const cx = Math.cos(swingAngle);
    const sy = Math.sin(swingAngle);
    ctx.strokeStyle = '#FFEE99';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx * BOT_RADIUS * 0.5, sy * BOT_RADIUS * 0.5);
    ctx.lineTo(cx * bladeLen, sy * bladeLen);
    ctx.stroke();
    ctx.strokeStyle = '#FF6B9E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx * BOT_RADIUS * 0.5, sy * BOT_RADIUS * 0.5);
    ctx.lineTo(cx * bladeLen, sy * bladeLen);
    ctx.stroke();
    const perpX = -sy;
    const perpY = cx;
    ctx.strokeStyle = '#FF4081';
    ctx.lineWidth = 3;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cx * BOT_RADIUS * 0.6 + perpX * 4, sy * BOT_RADIUS * 0.6 + perpY * 4);
    ctx.lineTo(cx * BOT_RADIUS * 0.6 - perpX * 4, sy * BOT_RADIUS * 0.6 - perpY * 4);
    ctx.stroke();
    ctx.fillStyle = '#FFC107';
    ctx.beginPath();
    ctx.arc(cx * bladeLen, sy * bladeLen, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (attackType === 'yoyo') {
    // Yo-yo: a red disc shoots out along the target direction and retracts on a string
    const extend = (Math.sin(t * 4) + 1) * 0.5; // 0..1 ping-pong
    const maxReach = BOT_RADIUS + 30;
    const cx = Math.cos(facing);
    const sy = Math.sin(facing);
    const tipX = cx * (BOT_RADIUS + extend * 30);
    const tipY = sy * (BOT_RADIUS + extend * 30);
    // String
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Yo-yo disc body (spinning)
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(t * 2);
    ctx.fillStyle = '#FF5252';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Disc axle stripes
    ctx.strokeStyle = '#FFEB3B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.restore();
    void maxReach;
  } else if (attackType === 'stickyhand') {
    // Sticky hand: a stretchy pink hand that extends toward the target
    const extend = (Math.sin(t * 3) + 1) * 0.5; // 0..1 ping-pong
    const reach = BOT_RADIUS + 6 + extend * 65;
    const cx = Math.cos(facing);
    const sy = Math.sin(facing);
    const tipX = cx * reach;
    const tipY = sy * reach;
    // Sticky stretch line (gets thinner as it extends)
    ctx.strokeStyle = '#E91E63';
    ctx.lineWidth = Math.max(1.5, 4 - extend * 2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx * BOT_RADIUS * 0.5, sy * BOT_RADIUS * 0.5);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    // Hand shape (small oval palm) at tip
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(facing);
    ctx.fillStyle = '#F06292';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Three tiny fingers
    ctx.fillStyle = '#E91E63';
    for (let f = -1; f <= 1; f++) {
      ctx.beginPath();
      ctx.ellipse(2.5, f * 2.2, 2.5, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (attackType === 'inflatableclub') {
    // Inflatable club: big bulbous orange club with a wide slow swing
    const swingAngle = facing + Math.sin(t * 1.6) * 1.0; // slower, wider swing
    const cx = Math.cos(swingAngle);
    const sy = Math.sin(swingAngle);
    const shaftStart = BOT_RADIUS * 0.5;
    const shaftEnd = BOT_RADIUS + 10;
    const bulbDist = BOT_RADIUS + 18;
    // Shaft
    ctx.strokeStyle = '#FFB74D';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx * shaftStart, sy * shaftStart);
    ctx.lineTo(cx * shaftEnd, sy * shaftEnd);
    ctx.stroke();
    // Bulb (big inflatable head)
    const bulbX = cx * bulbDist;
    const bulbY = sy * bulbDist;
    ctx.save();
    ctx.translate(bulbX, bulbY);
    ctx.rotate(swingAngle);
    ctx.fillStyle = '#FF9800';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E65100';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-2, -2, 3, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── AI Logic ───────────────────────────────────────────────────────────────

function pickTarget(bot: Bot, allBots: Bot[]): number | null {
  const alive = allBots.filter(b => b.state !== 'dead' && b.entry.id !== bot.entry.id);
  if (alive.length === 0) return null;
  return alive[Math.floor(Math.random() * alive.length)].entry.id;
}

function updateBotAI(
  bot: Bot,
  allBots: Bot[],
  projectiles: Projectile[],
  effects: Effect[],
  obstacles: Obstacle[],
  navGrid: boolean[][],
  _dt: number,
  now: number,
  rageMode: boolean,
  nextProjectileId: { current: number },
): void {
  if (bot.state === 'dead') return;

  // Pick a target if we don't have one, target is stale (3s timeout), or target is dead
  const TARGET_TIMEOUT_MS = 3000;
  if (bot.targetId === null || (now - bot.targetAcquiredAt > TARGET_TIMEOUT_MS && bot.state !== 'attacking')) {
    bot.targetId = pickTarget(bot, allBots);
    bot.targetAcquiredAt = now;
    bot.path = [];
    bot.state = bot.targetId !== null ? 'moving' : 'idle';
  }

  const target = allBots.find(b => b.entry.id === bot.targetId);
  if (!target || target.state === 'dead') {
    bot.targetId = null;
    bot.state = 'idle';
    bot.path = [];
    return;
  }

  const d = dist(bot.x, bot.y, target.x, target.y);
  bot.facing = angleBetween(bot.x, bot.y, target.x, target.y);

  const inRange = d <= bot.attack.attackRange;
  // Ranged attacks require line of sight
  const canSee = bot.attack.range === 'melee' || hasLineOfSight(bot.x, bot.y, target.x, target.y, obstacles);
  const canAttack = inRange && canSee;

  if (canAttack) {
    bot.state = 'attacking';

    if (now >= bot.attackCooldownUntil) {
      const dmg = rollDamage(bot.attack) * (rageMode ? 2 : 1);

      if (bot.attack.range === 'melee') {
        // Direct damage
        target.hp -= dmg;
        target.lastHitByName = bot.entry.name;
        target.lastHitByWeapon = bot.attack.type;
        bot.attackCooldownUntil = now + bot.attack.cooldownMs;

        // Knockback
        const kbSpeed = KNOCKBACK_SPEED[bot.attack.type] ?? 0;
        if (kbSpeed !== 0) {
          // Positive kbSpeed pushes target away; negative pulls toward attacker
          const kbAngle = angleBetween(bot.x, bot.y, target.x, target.y);
          target.vx += Math.cos(kbAngle) * kbSpeed;
          target.vy += Math.sin(kbAngle) * kbSpeed;
        }

        // Floating damage number
        effects.push({
          x: target.x + (Math.random() - 0.5) * 10,
          y: target.y - BOT_RADIUS,
          type: 'dmgNumber',
          life: 800, maxLife: 800,
          radius: 0, color: '#FFFFFF',
          vx: (Math.random() - 0.5) * 20, vy: -40,
          text: Math.round(dmg).toString(),
        });

        // Spawn hit effect at target
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 80;
          effects.push({
            x: target.x,
            y: target.y,
            type: 'hit',
            life: 300,
            maxLife: 300,
            radius: 3 + Math.random() * 3,
            color: bot.attack.color,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
      } else if (bot.attack.type === 'flamethrower') {
        // Spawn a burst of flame particles with spread
        const baseAngle = angleBetween(bot.x, bot.y, target.x, target.y);
        const particleCount = 3;
        for (let i = 0; i < particleCount; i++) {
          const spread = (Math.random() - 0.5) * 0.6; // ~±17° cone
          const angle = baseAngle + spread;
          const projSpeed = 180 + Math.random() * 60;
          projectiles.push({
            id: nextProjectileId.current++,
            sourceId: bot.entry.id,
            targetId: target.entry.id,
            x: bot.x + Math.cos(angle) * (BOT_RADIUS + 4),
            y: bot.y + Math.sin(angle) * (BOT_RADIUS + 4),
            vx: Math.cos(angle) * projSpeed,
            vy: Math.sin(angle) * projSpeed,
            damage: dmg / particleCount,
            radius: 2 + Math.random() * 3,
            color: ['#BBEEFF', '#DDF4FF', '#88DDFF', '#AADDFF'][Math.floor(Math.random() * 4)],
            life: 400 + Math.random() * 200,
            type: 'flamethrower',
          });
        }
        bot.attackCooldownUntil = now + bot.attack.cooldownMs;
      } else {
        // Spawn projectile
        const angle = angleBetween(bot.x, bot.y, target.x, target.y);
        const projSpeed = 400;
        projectiles.push({
          id: nextProjectileId.current++,
          sourceId: bot.entry.id,
          targetId: target.entry.id,
          x: bot.x + Math.cos(angle) * (BOT_RADIUS + 4),
          y: bot.y + Math.sin(angle) * (BOT_RADIUS + 4),
          vx: Math.cos(angle) * projSpeed,
          vy: Math.sin(angle) * projSpeed,
          damage: dmg,
          radius: bot.attack.type === 'machinegun' ? 3 : 6,
          color: bot.attack.color,
          life: 2000,
          type: bot.attack.type,
        });
        bot.attackCooldownUntil = now + bot.attack.cooldownMs;
      }
    }
  } else {
    bot.state = 'moving';
    const speed = BASE_SPEED * bot.attack.speedMultiplier * (bot.gooSlowed ? GOO_SLOW_FACTOR : 1);

    // Recompute path if target changed or target moved significantly
    const targetMoved = dist(target.x, target.y, bot.pathTargetX, bot.pathTargetY) > 40;
    const needsPath = bot.pathTargetId !== target.entry.id || targetMoved || bot.path.length === 0;

    if (needsPath) {
      bot.path = findPath(navGrid, bot.x, bot.y, target.x, target.y);
      bot.pathIndex = 0;
      bot.pathTargetId = target.entry.id;
      bot.pathTargetX = target.x;
      bot.pathTargetY = target.y;
    }

    // Follow waypoints
    if (bot.pathIndex < bot.path.length) {
      const wp = bot.path[bot.pathIndex];
      const wpDist = dist(bot.x, bot.y, wp.x, wp.y);

      if (wpDist < GRID_CELL) {
        // Reached this waypoint, advance
        bot.pathIndex++;
      }

      if (bot.pathIndex < bot.path.length) {
        const nextWp = bot.path[bot.pathIndex];
        const moveAngle = angleBetween(bot.x, bot.y, nextWp.x, nextWp.y);
        bot.facing = moveAngle;
        bot.vx = Math.cos(moveAngle) * speed;
        bot.vy = Math.sin(moveAngle) * speed;
      } else {
        // Path exhausted, move directly to target
        bot.vx = Math.cos(bot.facing) * speed;
        bot.vy = Math.sin(bot.facing) * speed;
      }
    } else {
      // No path, move directly
      bot.vx = Math.cos(bot.facing) * speed;
      bot.vy = Math.sin(bot.facing) * speed;
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export const BattleArena: React.FC<Props> = ({
  entries,
  onWinner,
  onRaceComplete,
  onShowFinalStandings,
  onAllDestroyed,
  isRacing,
  currentWinner,
  currentWinnerImage,
  currentWinnerImages,
  currentWinnerKillerInfo,
  currentWinnerIsLastPlayer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [raceState, setRaceState] = useState<'ready' | 'reveal' | 'racing' | 'finished'>('ready');
  const [replayActive, setReplayActive] = useState(false);
  const botsRef = useRef<Bot[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const effectsRef = useRef<Effect[]>([]);
  const animationRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number>(0);
  const battleStartTimeRef = useRef<number>(0);
  const playerImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingWinnerRef = useRef<Bot | null>(null);
  const nextProjectileIdRef = useRef<number>(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const navGridRef = useRef<boolean[][]>([]);
  const fightTextRef = useRef<{ opacity: number; scale: number }>({ opacity: 0, scale: 0 });
  const revealStartRef = useRef<number>(0);
  const frameHistoryRef = useRef<FrameSnapshot[]>([]);
  const replayDataRef = useRef<{ frames: FrameSnapshot[]; targetX: number; targetY: number; winnerBot: Bot | null; killerInfo?: { name: string; weapon: string } } | null>(null);
  // Reset replay flag whenever a new winner appears; <WinnerDialog> triggers
  // setReplayActive(true) via onReplayStart when it auto-minimizes.
  const prevWinnerRef = useRef(currentWinner);
  if (currentWinner !== prevWinnerRef.current) {
    prevWinnerRef.current = currentWinner;
    if (currentWinner) {
      setReplayActive(false);
    }
  }
  const spikeEventsRef = useRef<Array<{ closeAt: number; obstacle: Obstacle }>>([]);
  const nextSpikeAtRef = useRef<number>(0);

  // Preload images
  useEffect(() => {
    const nextImageUrls = new Set(entries.flatMap((entry) => getEntryImages(entry)));

    playerImagesRef.current.forEach((_, imageUrl) => {
      if (!nextImageUrls.has(imageUrl)) {
        playerImagesRef.current.delete(imageUrl);
      }
    });

    for (const imageUrl of nextImageUrls) {
      if (playerImagesRef.current.has(imageUrl)) continue;
      const image = new Image();
      image.src = imageUrl;
      playerImagesRef.current.set(imageUrl, image);
    }
  }, [entries]);

  // Initialize bots when entries change (and not racing)
  useEffect(() => {
    if (raceState === 'finished' || raceState === 'racing' || raceState === 'reveal') return;

    const shuffled = shuffle(entries);
    const n = shuffled.length;

    const newBots: Bot[] = shuffled.map((entry, index) => {
      const pos = perimeterPosition(index, n);
      const originalIndex = entries.findIndex(e => e.id === entry.id);
      return {
        entry,
        selectedImageDataUrl: pickRandomEntryImage(entry),
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        hp: MAX_HP,
        maxHp: MAX_HP,
        color: generateColor(originalIndex),
        attack: ATTACKS[Math.floor(Math.random() * ATTACKS.length)],
        targetId: null,
        state: 'idle' as const,
        attackCooldownUntil: 0,
        facing: 0,
        deathTime: null,
        lastHitByName: null,
        lastHitByWeapon: null,
        path: [],
        pathIndex: 0,
        pathTargetId: null,
        pathTargetX: 0,
        pathTargetY: 0,
        gooSlowed: false,
        targetAcquiredAt: 0,
      };
    });

    botsRef.current = newBots;
    projectilesRef.current = [];
    effectsRef.current = [];
    obstaclesRef.current = generateObstacles();
    navGridRef.current = buildNavGrid(obstaclesRef.current);
  }, [entries, raceState]);

  // Start battle when isRacing becomes true
  useEffect(() => {
    if (!isRacing || entries.length === 0) return;

    // Re-shuffle and re-assign attacks
    const shuffled = shuffle(entries);
    const n = shuffled.length;

    const newBots: Bot[] = shuffled.map((entry, index) => {
      const pos = perimeterPosition(index, n);
      const originalIndex = entries.findIndex(e => e.id === entry.id);
      return {
        entry,
        selectedImageDataUrl: pickRandomEntryImage(entry),
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        hp: MAX_HP,
        maxHp: MAX_HP,
        color: generateColor(originalIndex),
        attack: ATTACKS[Math.floor(Math.random() * ATTACKS.length)],
        targetId: null,
        state: 'idle' as const,
        attackCooldownUntil: 0,
        facing: 0,
        deathTime: null,
        lastHitByName: null,
        lastHitByWeapon: null,
        path: [],
        pathIndex: 0,
        pathTargetId: null,
        pathTargetX: 0,
        pathTargetY: 0,
        gooSlowed: false,
        targetAcquiredAt: 0,
      };
    });

    botsRef.current = newBots;
    projectilesRef.current = [];
    effectsRef.current = [];
    obstaclesRef.current = generateObstacles();
    navGridRef.current = buildNavGrid(obstaclesRef.current);
    nextProjectileIdRef.current = 0;
    pendingWinnerRef.current = null;
    frameHistoryRef.current = [];
    replayDataRef.current = null;

    revealStartRef.current = Date.now();
    setRaceState('reveal');
  }, [isRacing, entries]);

  // Weapon reveal phase — show bots with weapons + countdown, then start fighting
  const REVEAL_DURATION = 3000;
  useEffect(() => {
    if (raceState !== 'reveal') return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let revealAnim: number;
    const drawReveal = () => {
      const elapsed = Date.now() - revealStartRef.current;
      if (elapsed >= REVEAL_DURATION) {
        // Transition to fighting
        const now = Date.now();
        battleStartTimeRef.current = now;
        lastFrameTimeRef.current = now;
        fightTextRef.current = { opacity: 1.0, scale: 2.0 };
        spikeEventsRef.current = [];
        nextSpikeAtRef.current = now + 400;
        setRaceState('racing');
        return;
      }

      const bots = botsRef.current;
      const obstacles = obstaclesRef.current;

      // Clear
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw obstacles
      for (const o of obstacles) {
        ctx.save();
        ctx.fillStyle = o.color;
        if (o.type === 'wall' || o.type === 'crate') {
          ctx.fillRect(o.x - o.w, o.y - o.h, o.w * 2, o.h * 2);
        } else if (o.type === 'pillar') {
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.w, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === 'hazard') {
          ctx.globalAlpha = 0.5;
          ctx.fillRect(o.x - o.w, o.y - o.h, o.w * 2, o.h * 2);
        }
        ctx.restore();
      }

      // Draw each bot with weapon reveal
      for (let i = 0; i < bots.length; i++) {
        const bot = bots[i];
        // Staggered fade-in: each bot appears 80ms after the previous
        const botDelay = i * 80;
        const botElapsed = elapsed - botDelay;
        if (botElapsed < 0) continue;
        const fadeIn = Math.min(1, botElapsed / 200);

        ctx.save();
        ctx.globalAlpha = fadeIn;
        ctx.translate(bot.x, bot.y);

        // Weapon glow ring
        ctx.shadowColor = bot.attack.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = bot.attack.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, BOT_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Bot body
        const cachedImage = bot.selectedImageDataUrl
          ? playerImagesRef.current.get(bot.selectedImageDataUrl)
          : undefined;

        if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
          const sourceSize = Math.min(cachedImage.naturalWidth, cachedImage.naturalHeight);
          const imgSx = (cachedImage.naturalWidth - sourceSize) / 2;
          const imgSy = (cachedImage.naturalHeight - sourceSize) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(cachedImage, imgSx, imgSy, sourceSize, sourceSize, -BOT_RADIUS, -BOT_RADIUS, BOT_RADIUS * 2, BOT_RADIUS * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = bot.color;
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bot.entry.name.charAt(0).toUpperCase(), 0, 0);
        }

        // Weapon label above bot
        const weaponText = WEAPON_LABELS[bot.attack.type];
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeText(weaponText, 0, -BOT_RADIUS - 4);
        ctx.fillStyle = bot.attack.color;
        ctx.fillText(weaponText, 0, -BOT_RADIUS - 4);

        // Name below bot (same position as during battle)
        ctx.font = '9px Arial';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(bot.entry.name, 0, BOT_RADIUS + 4);

        ctx.restore();
      }

      // Countdown: 3, 2, 1
      const countNum = 3 - Math.floor(elapsed / 1000); // 3, 2, 1
      const countFrac = (elapsed % 1000) / 1000; // 0..1 within each second
      if (countNum >= 1) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Scale: starts big, shrinks slightly during the second
        const scale = 1.3 - countFrac * 0.3;
        const alpha = 1 - countFrac * 0.3;
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(120 * scale)}px Arial`;
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.strokeText(countNum.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.fillText(countNum.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.restore();
      }

      revealAnim = requestAnimationFrame(drawReveal);
    };

    revealAnim = requestAnimationFrame(drawReveal);
    return () => cancelAnimationFrame(revealAnim);
  }, [raceState]);

  // Instant replay — plays back last 3 seconds zoomed on eliminated player
  const REPLAY_SPEED = 0.4; // slow-mo factor
  useEffect(() => {
    if (!replayActive) return;
    const replay = replayDataRef.current;
    if (!replay || replay.frames.length === 0) {
      setReplayActive(false);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const frames = replay.frames;
    const replayDuration = (frames[frames.length - 1].time - frames[0].time) / REPLAY_SPEED;
    const startTime = Date.now();
    let replayAnim: number;

    const drawReplay = () => {
      const wallElapsed = Date.now() - startTime;
      const replayElapsed = wallElapsed * REPLAY_SPEED; // slow-mo time
      const replayTime = frames[0].time + replayElapsed;

      // Find the closest frame
      let frame = frames[0];
      for (const f of frames) {
        if (f.time <= replayTime) frame = f;
        else break;
      }

      // Camera: track the eliminated player's position from the current frame
      const targetBot = frame.bots.find(b => b.entry.id === replay.winnerBot?.entry.id);
      const trackX = targetBot?.x ?? replay.targetX;
      const trackY = targetBot?.y ?? replay.targetY;

      const zoomProgress = Math.min(1, wallElapsed / (replayDuration * 0.6));
      const ease = zoomProgress * zoomProgress * (3 - 2 * zoomProgress); // smoothstep
      const zoom = 1 + ease * 1.5; // 1x → 2.5x
      const camX = CANVAS_WIDTH / 2 + ease * (trackX - CANVAS_WIDTH / 2);
      const camY = CANVAS_HEIGHT / 2 + ease * (trackY - CANVAS_HEIGHT / 2);

      // Clear
      ctx.save();
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply camera transform
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // Draw obstacles
      for (const o of frame.obstacles) {
        ctx.save();
        ctx.fillStyle = o.color;
        ctx.globalAlpha = o.type === 'hazard' ? 0.5 : 1;
        if (o.type === 'pillar') {
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.w, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(o.x - o.w, o.y - o.h, o.w * 2, o.h * 2);
        }
        ctx.restore();
      }

      // Draw effects
      for (const e of frame.effects) {
        const alpha = e.life / e.maxLife;
        ctx.globalAlpha = alpha;
        if (e.type === 'dmgNumber' && e.text) {
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = e.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 2;
          ctx.textAlign = 'center';
          ctx.strokeText(e.text, e.x, e.y);
          ctx.fillText(e.text, e.x, e.y);
        } else {
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Draw projectiles
      for (const p of frame.projectiles) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw bots
      for (const bot of frame.bots) {
        if (bot.state === 'dead') {
          if (bot.deathTime) {
            const fadeAlpha = Math.max(0, 1 - (frame.time - bot.deathTime) / 500);
            if (fadeAlpha <= 0) continue;
            ctx.globalAlpha = fadeAlpha * 0.5;
          }
        }

        ctx.save();
        ctx.translate(bot.x, bot.y);

        // Glow ring
        ctx.shadowColor = bot.attack.color;
        ctx.shadowBlur = bot.state === 'attacking' ? 15 : 6;
        ctx.strokeStyle = bot.attack.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, BOT_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Body
        const cachedImage = bot.selectedImageDataUrl
          ? playerImagesRef.current.get(bot.selectedImageDataUrl)
          : undefined;

        if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
          const sourceSize = Math.min(cachedImage.naturalWidth, cachedImage.naturalHeight);
          const imgSx = (cachedImage.naturalWidth - sourceSize) / 2;
          const imgSy = (cachedImage.naturalHeight - sourceSize) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(cachedImage, imgSx, imgSy, sourceSize, sourceSize, -BOT_RADIUS, -BOT_RADIUS, BOT_RADIUS * 2, BOT_RADIUS * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = bot.color;
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bot.entry.name.charAt(0).toUpperCase(), 0, 0);
        }

        // Melee attack visual
        if (bot.state === 'attacking' && bot.attack.range === 'melee') {
          drawMeleeVisual(ctx, bot.attack.type, bot.facing, Date.now() / 100);
        }

        // HP bar
        if (bot.state !== 'dead') {
          const barWidth = BOT_RADIUS * 2;
          const barHeight = 3;
          const barX = -BOT_RADIUS;
          const barY = -BOT_RADIUS - 6;
          const hpFrac = Math.max(0, bot.hp / bot.maxHp);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          ctx.fillStyle = hpFrac > 0.5 ? '#4CAF50' : hpFrac > 0.25 ? '#FFC107' : '#F44336';
          ctx.fillRect(barX, barY, barWidth * hpFrac, barHeight);
        }

        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Restore camera transform
      ctx.restore();

      // "INSTANT REPLAY" overlay
      const overlayAlpha = 0.7 + Math.sin(Date.now() / 300) * 0.3;
      ctx.save();
      ctx.globalAlpha = overlayAlpha;
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeText('INSTANT REPLAY', CANVAS_WIDTH / 2, 10);
      ctx.fillText('INSTANT REPLAY', CANVAS_WIDTH / 2, 10);
      ctx.restore();

      // Vignette border for cinematic feel
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4);
      ctx.restore();

      if (wallElapsed < replayDuration + 500) { // +500ms hold on last frame
        replayAnim = requestAnimationFrame(drawReplay);
      } else {
        // Replay finished — clear flag; winner dialog is still shown (minimized)
        setReplayActive(false);
      }
    };

    replayAnim = requestAnimationFrame(drawReplay);
    return () => cancelAnimationFrame(replayAnim);
  }, [replayActive]);

  // Game loop
  useEffect(() => {
    if (raceState !== 'racing') return;

    const animate = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;

      const bots = botsRef.current;
      const projectiles = projectilesRef.current;
      const effects = effectsRef.current;
      const obstacles = obstaclesRef.current;
      const rageMode = (now - battleStartTimeRef.current) >= RAGE_TIMER_MS;

      // Dynamic spike pits — spawn one every 250ms, each lasts ~200ms
      let navGridDirty = false;
      // Spawn new spike
      if (now >= nextSpikeAtRef.current) {
        nextSpikeAtRef.current = now + 400;
        const sLeft = ARENA_MARGIN + 40;
        const sTop = ARENA_MARGIN + 40;
        const sPlayW = CANVAS_WIDTH - 2 * (ARENA_MARGIN + 40);
        const sPlayH = CANVAS_HEIGHT - 2 * (ARENA_MARGIN + 40);
        const sw = 16 + Math.random() * 10;
        const sh = 16 + Math.random() * 10;
        const spikePad = 10;
        let sx = 0, sy = 0, placed = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          sx = sLeft + sw + spikePad + Math.random() * (sPlayW - 2 * (sw + spikePad));
          sy = sTop + sh + spikePad + Math.random() * (sPlayH - 2 * (sh + spikePad));
          const overlaps = obstacles.some(o => {
            const gapX = Math.abs(sx - o.x) - (sw + o.w + spikePad);
            const gapY = Math.abs(sy - o.y) - (sh + o.h + spikePad);
            return gapX < 0 && gapY < 0;
          });
          if (!overlaps) { placed = true; break; }
        }
        if (placed) {
          const spike: Obstacle = { x: sx, y: sy, w: sw, h: sh, color: HAZARD_COLORS.spike, type: 'hazard', hazardType: 'spike' };
          obstacles.push(spike);
          spikeEventsRef.current.push({ closeAt: now + 500, obstacle: spike });
          navGridDirty = true;
          // Warning particles
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2;
            const s = 30 + Math.random() * 50;
            effects.push({
              x: sx + (Math.random() - 0.5) * sw,
              y: sy + (Math.random() - 0.5) * sh,
              type: 'spark', life: 300, maxLife: 300, radius: 2,
              color: '#CCCCFF',
              vx: Math.cos(a) * s, vy: Math.sin(a) * s,
            });
          }
        }
      }
      // Close expired spikes
      for (let i = spikeEventsRef.current.length - 1; i >= 0; i--) {
        const ev = spikeEventsRef.current[i];
        if (now >= ev.closeAt) {
          const idx = obstacles.indexOf(ev.obstacle);
          if (idx !== -1) obstacles.splice(idx, 1);
          spikeEventsRef.current.splice(i, 1);
          navGridDirty = true;
        }
      }
      if (navGridDirty) {
        navGridRef.current = buildNavGrid(obstacles);
      }

      // Update GO! text
      if (fightTextRef.current.opacity > 0) {
        fightTextRef.current.opacity -= dt * 1.2;
        fightTextRef.current.scale = 2.0 - fightTextRef.current.opacity;
      }

      // Update AI for each living bot
      for (const bot of bots) {
        updateBotAI(bot, bots, projectiles, effects, obstacles, navGridRef.current, dt, now, rageMode, nextProjectileIdRef);
      }

      // Move bots
      for (const bot of bots) {
        if (bot.state === 'dead') continue;

        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;

        // Friction to decay knockback velocity
        const friction = Math.pow(0.02, dt); // rapid decay
        bot.vx *= friction;
        bot.vy *= friction;

        // Clamp to arena
        bot.x = clamp(bot.x, BOT_RADIUS + 5, CANVAS_WIDTH - BOT_RADIUS - 5);
        bot.y = clamp(bot.y, BOT_RADIUS + 5, CANVAS_HEIGHT - BOT_RADIUS - 5);

        // Collide with solid obstacles (not hazards)
        for (const o of obstacles) {
          if (o.type === 'hazard') continue;
          const col = circleRectCollision(bot.x, bot.y, BOT_RADIUS, o.x, o.y, o.w, o.h);
          if (col.hit) {
            // If bot has knockback velocity, deal wall collision damage
            const kbSpeed = Math.sqrt(bot.vx * bot.vx + bot.vy * bot.vy);
            if (kbSpeed > 150) {
              bot.hp -= WALL_COLLISION_DAMAGE;
              effects.push({
                x: bot.x + (Math.random() - 0.5) * 10,
                y: bot.y - BOT_RADIUS,
                type: 'dmgNumber',
                life: 800, maxLife: 800,
                radius: 0, color: '#FFAA00',
                vx: (Math.random() - 0.5) * 20, vy: -40,
                text: WALL_COLLISION_DAMAGE.toString(),
              });
              // Wall impact sparks
              for (let k = 0; k < 4; k++) {
                const a = Math.random() * Math.PI * 2;
                const s = 30 + Math.random() * 50;
                effects.push({
                  x: bot.x, y: bot.y, type: 'spark',
                  life: 200, maxLife: 200, radius: 2,
                  color: '#FFFFFF',
                  vx: Math.cos(a) * s, vy: Math.sin(a) * s,
                });
              }
              bot.vx *= -0.3;
              bot.vy *= -0.3;
            }
            bot.x += col.nx * col.overlap;
            bot.y += col.ny * col.overlap;
          }
        }

        // Hazard effects (lava / spike / goo)
        for (const o of obstacles) {
          if (o.type !== 'hazard') continue;
          const col = circleRectCollision(bot.x, bot.y, BOT_RADIUS, o.x, o.y, o.w, o.h);
          if (!col.hit) continue;
          const ht = o.hazardType ?? 'lava';
          const hazDmg = HAZARD_DPS[ht] * dt;
          bot.hp -= hazDmg;
          // Periodic floating damage number for hazards
          if (Math.random() < dt * 3) {
            const hazardColors: Record<HazardType, string> = { lava: '#FF4500', spike: '#CCCCFF', goo: '#88DD66' };
            effects.push({
              x: bot.x + (Math.random() - 0.5) * 10,
              y: bot.y - BOT_RADIUS,
              type: 'dmgNumber',
              life: 800, maxLife: 800,
              radius: 0, color: hazardColors[ht],
              vx: (Math.random() - 0.5) * 20, vy: -40,
              text: Math.round(HAZARD_DPS[ht] / 3).toString(),
            });
          }
          if (ht === 'lava') {
            bot.lastHitByName = 'Lava';
            bot.lastHitByWeapon = null;
            if (Math.random() < 0.3) {
              effects.push({
                x: bot.x + (Math.random() - 0.5) * 10,
                y: bot.y + (Math.random() - 0.5) * 10,
                type: 'explosion',
                life: 300, maxLife: 300,
                radius: 2 + Math.random() * 3,
                color: ['#FF4500', '#FF6600', '#FFCC00'][Math.floor(Math.random() * 3)],
                vx: (Math.random() - 0.5) * 20,
                vy: -20 - Math.random() * 30,
              });
            }
          } else if (ht === 'spike') {
            bot.lastHitByName = 'Spikes';
            bot.lastHitByWeapon = null;
            if (Math.random() < 0.2) {
              effects.push({
                x: bot.x + (Math.random() - 0.5) * 8,
                y: bot.y + (Math.random() - 0.5) * 8,
                type: 'spark',
                life: 200, maxLife: 200,
                radius: 2,
                color: '#FFFFFF',
                vx: (Math.random() - 0.5) * 40,
                vy: -15 - Math.random() * 25,
              });
            }
          } else if (ht === 'goo') {
            bot.lastHitByName = 'Goo';
            bot.lastHitByWeapon = null;
            bot.gooSlowed = true;
            if (Math.random() < 0.15) {
              effects.push({
                x: bot.x + (Math.random() - 0.5) * 10,
                y: bot.y + (Math.random() - 0.5) * 10,
                type: 'explosion',
                life: 400, maxLife: 400,
                radius: 2 + Math.random() * 2,
                color: ['#44AA22', '#66CC44', '#88DD66'][Math.floor(Math.random() * 3)],
                vx: (Math.random() - 0.5) * 10,
                vy: -5 - Math.random() * 10,
              });
            }
          }
        }

        // Stop when attacking
        if (bot.state === 'attacking') {
          bot.vx = 0;
          bot.vy = 0;
        }
      }

      // Push overlapping bots apart
      for (let i = 0; i < bots.length; i++) {
        for (let j = i + 1; j < bots.length; j++) {
          const a = bots[i];
          const b = bots[j];
          if (a.state === 'dead' || b.state === 'dead') continue;
          const d = dist(a.x, a.y, b.x, b.y);
          const minDist = BOT_RADIUS * 2;
          if (d < minDist && d > 0) {
            const overlap = (minDist - d) / 2;
            const angle = angleBetween(a.x, a.y, b.x, b.y);
            a.x -= Math.cos(angle) * overlap;
            a.y -= Math.sin(angle) * overlap;
            b.x += Math.cos(angle) * overlap;
            b.y += Math.sin(angle) * overlap;
          }
        }
      }

      // Update projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1000;

        // Check collision with bots
        let hit = false;
        for (const bot of bots) {
          if (bot.state === 'dead' || bot.entry.id === p.sourceId) continue;
          if (dist(p.x, p.y, bot.x, bot.y) < BOT_RADIUS + p.radius) {
            bot.hp -= p.damage;
            // Floating damage number
            effects.push({
              x: bot.x + (Math.random() - 0.5) * 10,
              y: bot.y - BOT_RADIUS,
              type: 'dmgNumber',
              life: 800, maxLife: 800,
              radius: 0, color: '#FFFFFF',
              vx: (Math.random() - 0.5) * 20, vy: -40,
              text: Math.round(p.damage).toString(),
            });
            // Track who dealt this hit for kill attribution
            const sourceBot = bots.find(b => b.entry.id === p.sourceId);
            if (sourceBot) {
              bot.lastHitByName = sourceBot.entry.name;
              bot.lastHitByWeapon = p.type;
            }
            // Knockback from projectile
            const kbSpeed = KNOCKBACK_SPEED[p.type] ?? 0;
            if (kbSpeed > 0) {
              const pAngle = Math.atan2(p.vy, p.vx);
              bot.vx += Math.cos(pAngle) * kbSpeed;
              bot.vy += Math.sin(pAngle) * kbSpeed;
            }
            hit = true;

            // Spawn hit particles
            for (let k = 0; k < 4; k++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 30 + Math.random() * 60;
              effects.push({
                x: p.x,
                y: p.y,
                type: 'spark',
                life: 250,
                maxLife: 250,
                radius: 2 + Math.random() * 2,
                color: p.color,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
              });
            }
            break;
          }
        }

        // Check collision with solid obstacles (not hazards)
        if (!hit) {
          for (const o of obstacles) {
            if (o.type === 'hazard') continue;
            const col = circleRectCollision(p.x, p.y, p.radius, o.x, o.y, o.w, o.h);
            if (col.hit) {
              hit = true;
              // Spawn impact sparks on obstacle
              for (let k = 0; k < 3; k++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 20 + Math.random() * 40;
                effects.push({
                  x: p.x, y: p.y, type: 'spark',
                  life: 200, maxLife: 200,
                  radius: 2, color: p.color,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                });
              }
              break;
            }
          }
        }

        // Remove if hit, out of bounds, or expired
        if (hit || p.life <= 0 || p.x < -20 || p.x > CANVAS_WIDTH + 20 || p.y < -20 || p.y > CANVAS_HEIGHT + 20) {
          projectiles.splice(i, 1);
        }
      }

      // Update effects
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.life -= dt * 1000;
        if (e.life <= 0) {
          effects.splice(i, 1);
        }
      }

      // Record frame snapshot for instant replay (keep last 3 seconds)
      const REPLAY_BUFFER_MS = 3000;
      frameHistoryRef.current.push({
        time: now,
        bots: bots.map(b => ({ x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, color: b.color, state: b.state, facing: b.facing, deathTime: b.deathTime, attack: b.attack, entry: b.entry, selectedImageDataUrl: b.selectedImageDataUrl, vx: b.vx, vy: b.vy, gooSlowed: b.gooSlowed })),
        projectiles: projectiles.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: p.radius, color: p.color, type: p.type, life: p.life })),
        effects: effects.map(e => ({ ...e })),
        obstacles: obstacles.map(o => ({ ...o })),
      });
      while (frameHistoryRef.current.length > 0 && frameHistoryRef.current[0].time < now - REPLAY_BUFFER_MS) {
        frameHistoryRef.current.shift();
      }

      // Check for deaths
      let firstDead: Bot | null = null;
      for (const bot of bots) {
        if (bot.state !== 'dead' && bot.hp <= 0) {
          bot.hp = 0;
          bot.state = 'dead';
          bot.deathTime = now;
          bot.vx = 0;
          bot.vy = 0;

          // Death explosion particles
          for (let k = 0; k < 15; k++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            effects.push({
              x: bot.x,
              y: bot.y,
              type: 'explosion',
              life: 500,
              maxLife: 500,
              radius: 3 + Math.random() * 4,
              color: bot.color,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
            });
          }

          if (!firstDead) firstDead = bot;
        }
      }

      // Report first death as the "pick"
      if (firstDead && !pendingWinnerRef.current) {
        pendingWinnerRef.current = firstDead;
      }

      // On death: capture replay data, then show winner dialog immediately
      if (pendingWinnerRef.current) {
        const winner = pendingWinnerRef.current;
        pendingWinnerRef.current = null;
        const killerInfo = winner.lastHitByName
          ? { name: winner.lastHitByName, weapon: winner.lastHitByWeapon ?? 'lava' }
          : undefined;
        replayDataRef.current = {
          frames: [...frameHistoryRef.current],
          targetX: winner.x,
          targetY: winner.y,
          winnerBot: winner,
          killerInfo,
        };
        setRaceState('finished');
        onWinner(winner.entry, winner.selectedImageDataUrl, killerInfo);
        return; // Stop the game loop
      }

      // Edge case: all bots dead simultaneously
      const allDead = bots.every(b => b.state === 'dead');
      if (allDead && bots.length > 0) {
        onAllDestroyed?.();
        setRaceState('finished');
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [raceState, onWinner, onAllDestroyed]);

  // Draw loop (skipped during weapon reveal and replay — they have their own renderers)
  useEffect(() => {
    if (raceState === 'reveal' || replayActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let drawId: number;

    const draw = () => {
      const bots = botsRef.current;
      const projectiles = projectilesRef.current;
      const effects = effectsRef.current;
      const obstacles = obstaclesRef.current;

      // Clear and draw arena background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, '#1a1a2e');
      bgGrad.addColorStop(1, '#16213e');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Arena border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 16);

      // Subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 40; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 40; y < CANVAS_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Draw obstacles
      for (const o of obstacles) {
        ctx.save();
        ctx.fillStyle = o.color;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;

        if (o.type === 'hazard') {
          const rx = o.x - o.w;
          const ry = o.y - o.h;
          const rw = o.w * 2;
          const rh = o.h * 2;
          const t = Date.now() / 400;
          const ht = o.hazardType ?? 'lava';

          if (ht === 'lava') {
            // Animated lava pool
            const pulse = 0.6 + Math.sin(t) * 0.15;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#CC3300';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.fillStyle = '#FF6600';
            ctx.globalAlpha = 0.3 + Math.sin(t * 1.7) * 0.15;
            ctx.fillRect(rx + 3, ry + 3, rw - 6, rh - 6);
            ctx.fillStyle = '#FFAA00';
            ctx.globalAlpha = 0.2 + Math.sin(t * 2.3) * 0.1;
            ctx.fillRect(rx + 6, ry + 6, rw - 12, rh - 12);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(255, 100, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);
          } else if (ht === 'spike') {
            // Metallic spike pit
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#3A3A4A';
            ctx.fillRect(rx, ry, rw, rh);
            // Draw spike points
            ctx.fillStyle = '#AAAACC';
            const cols = Math.max(2, Math.floor(rw / 8));
            const rows = Math.max(2, Math.floor(rh / 8));
            for (let sr = 0; sr < rows; sr++) {
              for (let sc = 0; sc < cols; sc++) {
                const sx = rx + (sc + 0.5) * (rw / cols);
                const sy = ry + (sr + 0.5) * (rh / rows);
                const sSize = 2 + Math.sin(t * 2 + sr + sc) * 0.5;
                ctx.beginPath();
                ctx.moveTo(sx, sy - sSize);
                ctx.lineTo(sx - sSize * 0.6, sy + sSize * 0.5);
                ctx.lineTo(sx + sSize * 0.6, sy + sSize * 0.5);
                ctx.closePath();
                ctx.fill();
              }
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(170, 170, 200, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);
          } else if (ht === 'goo') {
            // Bubbling goo pool
            const pulse = 0.5 + Math.sin(t * 0.8) * 0.1;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#2A7A12';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.fillStyle = '#44AA22';
            ctx.globalAlpha = 0.4 + Math.sin(t * 1.3) * 0.15;
            ctx.fillRect(rx + 2, ry + 2, rw - 4, rh - 4);
            // Goo bubbles
            ctx.fillStyle = '#88DD66';
            for (let b = 0; b < 3; b++) {
              const bx = rx + rw * (0.25 + b * 0.25);
              const by = ry + rh * (0.4 + Math.sin(t * (1.5 + b * 0.7)) * 0.2);
              const br = 1.5 + Math.sin(t * (2 + b)) * 0.8;
              ctx.globalAlpha = 0.4 + Math.sin(t * (1.8 + b * 0.5)) * 0.2;
              ctx.beginPath();
              ctx.arc(bx, by, br, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(68, 170, 34, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);
          }
        } else if (o.type === 'pillar') {
          // Round pillar
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.w, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.arc(o.x - o.w * 0.25, o.y - o.w * 0.25, o.w * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Rectangular wall or crate
          const rx = o.x - o.w;
          const ry = o.y - o.h;
          const rw = o.w * 2;
          const rh = o.h * 2;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);

          if (o.type === 'crate') {
            // Cross lines on crate
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + rw, ry + rh);
            ctx.moveTo(rx + rw, ry);
            ctx.lineTo(rx, ry + rh);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Draw effects (behind bots)
      for (const e of effects) {
        const alpha = e.life / e.maxLife;
        ctx.globalAlpha = alpha;
        if (e.type === 'dmgNumber' && e.text) {
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = e.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 2;
          ctx.strokeText(e.text, e.x, e.y);
          ctx.fillText(e.text, e.x, e.y);
        } else {
          ctx.fillStyle = e.color;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Draw projectiles
      for (const p of projectiles) {
        ctx.save();
        if (p.type === 'fireball') {
          // Water balloon — wobbly blue sphere with white highlight
          const wobble = Math.sin(Date.now() / 60) * 0.15;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.radius * (1 + wobble), p.radius * (1 - wobble), 0, 0, Math.PI * 2);
          ctx.fill();
          // Outline
          ctx.strokeStyle = '#1D6FC8';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(p.x - p.radius * 0.35, p.y - p.radius * 0.35, p.radius * 0.3, 0, Math.PI * 2);
          ctx.fill();
          // Tie knob
          ctx.fillStyle = '#1D6FC8';
          ctx.beginPath();
          ctx.arc(p.x, p.y + p.radius * 0.9, p.radius * 0.22, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'flamethrower') {
          // Bubble — translucent iridescent sphere
          const lifeRatio = p.life / 600;
          ctx.globalAlpha = Math.min(1, lifeRatio * 1.2);
          // Soft translucent fill
          ctx.fillStyle = 'rgba(180, 230, 255, 0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * (0.9 + lifeRatio * 0.3), 0, Math.PI * 2);
          ctx.fill();
          // Rim
          ctx.strokeStyle = 'rgba(150, 220, 255, 0.9)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          // Rainbow sheen (small arc)
          ctx.strokeStyle = 'rgba(255, 200, 255, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.7, -Math.PI * 0.8, -Math.PI * 0.4);
          ctx.stroke();
          // White highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(p.x - p.radius * 0.35, p.y - p.radius * 0.35, p.radius * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (p.type === 'machinegun') {
          // Water droplet — tilted teardrop aligned with velocity
          const ang = Math.atan2(p.vy, p.vx);
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.radius * 1.6, 0);
          ctx.quadraticCurveTo(0, p.radius, -p.radius, 0);
          ctx.quadraticCurveTo(0, -p.radius, p.radius * 1.6, 0);
          ctx.fill();
          ctx.strokeStyle = '#2277BB';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath();
          ctx.arc(0, -p.radius * 0.3, p.radius * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw bots
      for (const bot of bots) {
        if (bot.state === 'dead') {
          // Fading ghost
          if (bot.deathTime) {
            const elapsed = Date.now() - bot.deathTime;
            const fadeAlpha = Math.max(0, 1 - elapsed / 500);
            if (fadeAlpha <= 0) continue;
            ctx.globalAlpha = fadeAlpha * 0.5;
          }
        }

        ctx.save();
        ctx.translate(bot.x, bot.y);

        // Attack type glow ring
        ctx.shadowColor = bot.attack.color;
        ctx.shadowBlur = bot.state === 'attacking' ? 15 : 6;
        ctx.strokeStyle = bot.attack.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, BOT_RADIUS + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Bot body
        const cachedImage = bot.selectedImageDataUrl
          ? playerImagesRef.current.get(bot.selectedImageDataUrl)
          : undefined;

        if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
          const sourceSize = Math.min(cachedImage.naturalWidth, cachedImage.naturalHeight);
          const sx = (cachedImage.naturalWidth - sourceSize) / 2;
          const sy = (cachedImage.naturalHeight - sourceSize) / 2;

          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            cachedImage,
            sx, sy, sourceSize, sourceSize,
            -BOT_RADIUS, -BOT_RADIUS,
            BOT_RADIUS * 2, BOT_RADIUS * 2,
          );
          ctx.restore();
        } else {
          // Colored circle with initial
          ctx.fillStyle = bot.color;
          ctx.beginPath();
          ctx.arc(0, 0, BOT_RADIUS - 1.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bot.entry.name.charAt(0).toUpperCase(), 0, 0);
        }

        // Melee attack visual
        if (bot.state === 'attacking' && bot.attack.range === 'melee') {
          drawMeleeVisual(ctx, bot.attack.type, bot.facing, Date.now() / 100);
        }

        ctx.restore();

        // HP bar (above bot)
        if (bot.state !== 'dead') {
          const barWidth = 30;
          const barHeight = 4;
          const barX = bot.x - barWidth / 2;
          const barY = bot.y - BOT_RADIUS - 12;
          const hpFrac = bot.hp / bot.maxHp;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

          // HP fill
          ctx.fillStyle = hpFrac > 0.5 ? '#4CAF50' : hpFrac > 0.25 ? '#FFC107' : '#F44336';
          ctx.fillRect(barX, barY, barWidth * hpFrac, barHeight);
        }

        // Name label
        if (bot.state !== 'dead') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(bot.entry.name, bot.x, bot.y + BOT_RADIUS + 4, 50);
        }

        ctx.globalAlpha = 1;
      }

      // "GO!" text overlay
      if (fightTextRef.current.opacity > 0) {
        const ft = fightTextRef.current;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.opacity);
        ctx.fillStyle = '#FF4444';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.font = `bold ${Math.round(48 * ft.scale)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('GO!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.fillText('GO!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.restore();
      }

      // Rage mode indicator
      if (raceState === 'racing' && (Date.now() - battleStartTimeRef.current) >= RAGE_TIMER_MS) {
        ctx.save();
        ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 200) * 0.2;
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8);
        ctx.restore();
      }

      drawId = requestAnimationFrame(draw);
    };

    drawId = requestAnimationFrame(draw);

    return () => {
      if (drawId) cancelAnimationFrame(drawId);
    };
  }, [raceState, replayActive]);

  return (
    <div className="racing-game">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas" />

      <WinnerDialog
        theme={battleBotsTheme}
        show={!!currentWinner && !isRacing}
        isFinals={currentWinnerIsLastPlayer ?? entries.length === 0}
        winner={{
          name: currentWinner ?? '',
          imageDataUrl: currentWinnerImage,
          allImages: currentWinnerImages,
        }}
        headline="ELIMINATED"
        finalsHeadline="🏆 ARENA CHAMPION 🏆"
        nextLabel="⚔️ Next Battle"
        detailsNode={
          currentWinnerKillerInfo ? (
            currentWinnerKillerInfo.weapon === 'lava' ? (
              <>Eliminated by <strong>🌋 {currentWinnerKillerInfo.name}</strong></>
            ) : (
              <>
                Eliminated by <strong>{currentWinnerKillerInfo.name}</strong> with{' '}
                {WEAPON_LABELS[currentWinnerKillerInfo.weapon as AttackType] ?? currentWinnerKillerInfo.weapon}
              </>
            )
          ) : undefined
        }
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
        onReplayStart={() => {
          if (replayDataRef.current && replayDataRef.current.frames.length > 0) {
            setReplayActive(true);
          }
        }}
      />
    </div>
  );
};
