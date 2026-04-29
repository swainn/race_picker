import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './LightCycles.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type Personality = 'aggressive' | 'defensive' | 'wanderer' | 'hunter';
type Direction = 'up' | 'down' | 'left' | 'right';
type PowerUpType = 'boost' | 'hop' | 'disc' | 'derez' | 'phase';

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ownerId: number;
  color: string;
}

interface Cycle {
  entry: Entry;
  selectedImageDataUrl?: string;
  alive: boolean;
  deathTime: number | null;

  x: number;
  y: number;
  dir: Direction;
  speed: number;

  trail: Segment[];
  liveStart: { x: number; y: number };

  color: string;
  personality: Personality;

  pendingTurn: Direction | null;
  decisionCooldown: number;
  randomTurnAt: number;

  inventory: PowerUpType | null;
  boostUntil: number;
  hopUntil: number;
  phaseUntil: number;

  lastHitByName: string | null;
  lastHitByWeapon: string | null;
}

interface Disc {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  color: string;
  spawnedAt: number;
}

interface PowerUpPickup {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  spawnedAt: number;
}

interface Effect {
  type: 'derez' | 'hop' | 'discBurst' | 'boostFlare' | 'phaseShimmer' | 'pickupGrab' | 'derezTrail';
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  vx?: number;
  vy?: number;
  radius?: number;
}

interface FrameSnapshot {
  time: number;
  cycles: Array<{
    x: number;
    y: number;
    dir: Direction;
    color: string;
    alive: boolean;
    trail: Segment[];
    liveStart: { x: number; y: number };
    boost: boolean;
    hop: boolean;
    phase: boolean;
  }>;
  discs: Array<{ x: number; y: number; vx: number; vy: number; color: string }>;
  pickups: Array<{ x: number; y: number; type: PowerUpType }>;
  effects: Effect[];
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
const GRID_CELL = 10;
const ARENA_PAD = 14;
const ARENA_LEFT = ARENA_PAD;
const ARENA_RIGHT = CANVAS_WIDTH - ARENA_PAD;
const ARENA_TOP = ARENA_PAD;
const ARENA_BOTTOM = CANVAS_HEIGHT - ARENA_PAD;
const PLAY_WIDTH = ARENA_RIGHT - ARENA_LEFT;
const PLAY_HEIGHT = ARENA_BOTTOM - ARENA_TOP;

const BASE_SPEED = 110; // px/sec
const TRAIL_THICK = 3;
const CYCLE_RADIUS = 4;

const BOOST_MULT = 1.6;
const BOOST_DURATION = 2500;
const HOP_DURATION = 600;
const HOP_DISTANCE = 30;
const PHASE_DURATION = 1200;

const POWERUP_SPAWN_MIN = 3500;
const POWERUP_SPAWN_MAX = 6500;
const POWERUP_LIFETIME = 12000;
const POWERUP_RADIUS = 7;

const DISC_SPEED = 240;
const DISC_LIFETIME = 2200;

const REVEAL_PER_PARTICIPANT = 380; // ms each cycle materializes
const REVEAL_TAIL = 800;             // pause after last
const COUNTDOWN_DURATION = 3000;     // 3-2-1
const GO_FLASH_DURATION = 700;

const REPLAY_DURATION = 3000;
const REPLAY_SPEED = 0.35; // slow-mo factor
const FRAME_HISTORY_MS = 3000;

const ANTI_SUICIDE_LOOK_AHEAD = 60; // px
const COLLISION_EPS = 1.6;

const PALETTE = [
  '#00E5FF', // cyan (Tron canon)
  '#FF6B1A', // orange (Clu/program)
  '#FF2E63', // crimson red
  '#FFE600', // yellow
  '#D946EF', // magenta
  '#5DFF59', // green
  '#FFFFFF', // identity white
  '#A855F7', // purple
  '#3CB4FF', // azure
  '#FF8AB3', // pink
  '#7CFFB7', // mint
  '#FFB347', // amber
];

const PERSONALITIES: Personality[] = ['aggressive', 'defensive', 'wanderer', 'hunter'];

const POWERUP_LABEL: Record<PowerUpType, string> = {
  boost: 'Light Boost',
  hop: 'Hop',
  disc: 'Identity Disc',
  derez: 'Derez',
  phase: 'Wall Phase',
};

const POWERUP_GLYPH: Record<PowerUpType, string> = {
  boost: '»',
  hop: '⌃',
  disc: '◎',
  derez: '✕',
  phase: '⌬',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colorForEntryId(id: number): string {
  const hash = ((id * 2654435761) >>> 0) % PALETTE.length;
  return PALETTE[hash];
}

function dirDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up': return { dx: 0, dy: -1 };
    case 'down': return { dx: 0, dy: 1 };
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
  }
}

function oppositeDir(dir: Direction): Direction {
  switch (dir) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

function perpendicularDirs(dir: Direction): Direction[] {
  if (dir === 'up' || dir === 'down') return ['left', 'right'];
  return ['up', 'down'];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickEntryImage(entry: Entry): string | undefined {
  const urls = entry.imageDataUrls && entry.imageDataUrls.length > 0
    ? entry.imageDataUrls
    : (entry.imageDataUrl ? [entry.imageDataUrl] : []);
  if (urls.length === 0) return undefined;
  return urls[Math.floor(Math.random() * urls.length)];
}

function getEntryImages(entry: Entry): string[] {
  return entry.imageDataUrls ?? (entry.imageDataUrl ? [entry.imageDataUrl] : []);
}

// Distribute spawn positions evenly around the arena perimeter, all facing inward.
function spawnPositions(n: number): Array<{ x: number; y: number; dir: Direction }> {
  const padIn = 30;
  const slots: Array<{ x: number; y: number; dir: Direction }> = [];
  if (n <= 0) return slots;

  // Evenly distribute around 4 sides
  const perSide = Math.ceil(n / 4);
  const xStep = (PLAY_WIDTH - 2 * padIn) / Math.max(1, perSide);
  const yStep = (PLAY_HEIGHT - 2 * padIn) / Math.max(1, perSide);

  // Top edge → facing down
  for (let i = 0; i < perSide && slots.length < n; i++) {
    slots.push({
      x: ARENA_LEFT + padIn + xStep * (i + 0.5),
      y: ARENA_TOP + padIn,
      dir: 'down',
    });
  }
  // Right edge → facing left
  for (let i = 0; i < perSide && slots.length < n; i++) {
    slots.push({
      x: ARENA_RIGHT - padIn,
      y: ARENA_TOP + padIn + yStep * (i + 0.5),
      dir: 'left',
    });
  }
  // Bottom edge → facing up
  for (let i = 0; i < perSide && slots.length < n; i++) {
    slots.push({
      x: ARENA_RIGHT - padIn - xStep * (i + 0.5),
      y: ARENA_BOTTOM - padIn,
      dir: 'up',
    });
  }
  // Left edge → facing right
  for (let i = 0; i < perSide && slots.length < n; i++) {
    slots.push({
      x: ARENA_LEFT + padIn,
      y: ARENA_BOTTOM - padIn - yStep * (i + 0.5),
      dir: 'right',
    });
  }

  return slots.slice(0, n);
}

// Test if a point lies on (or within EPS of) an axis-aligned segment.
function pointOnSegment(px: number, py: number, seg: Segment, eps: number): boolean {
  const sx1 = Math.min(seg.x1, seg.x2);
  const sx2 = Math.max(seg.x1, seg.x2);
  const sy1 = Math.min(seg.y1, seg.y2);
  const sy2 = Math.max(seg.y1, seg.y2);

  if (Math.abs(seg.y1 - seg.y2) < 0.5) {
    // Horizontal
    if (Math.abs(py - seg.y1) > eps) return false;
    return px >= sx1 - eps && px <= sx2 + eps;
  }
  // Vertical
  if (Math.abs(px - seg.x1) > eps) return false;
  return py >= sy1 - eps && py <= sy2 + eps;
}

// Test if axis-aligned movement segment (oldX,oldY)→(newX,newY) crosses target segment.
function segmentSweepHits(
  oldX: number, oldY: number, newX: number, newY: number,
  target: Segment, eps: number,
): boolean {
  const movingHoriz = Math.abs(oldY - newY) < 0.001;
  const targetHoriz = Math.abs(target.y1 - target.y2) < 0.5;

  const tMinX = Math.min(target.x1, target.x2);
  const tMaxX = Math.max(target.x1, target.x2);
  const tMinY = Math.min(target.y1, target.y2);
  const tMaxY = Math.max(target.y1, target.y2);

  const mMinX = Math.min(oldX, newX);
  const mMaxX = Math.max(oldX, newX);
  const mMinY = Math.min(oldY, newY);
  const mMaxY = Math.max(oldY, newY);

  if (movingHoriz === targetHoriz) {
    // Parallel: hit only if collinear and ranges overlap
    if (movingHoriz) {
      if (Math.abs(oldY - target.y1) > eps) return false;
      return mMaxX >= tMinX - eps && mMinX <= tMaxX + eps;
    }
    if (Math.abs(oldX - target.x1) > eps) return false;
    return mMaxY >= tMinY - eps && mMinY <= tMaxY + eps;
  }

  // Perpendicular: head crosses target if perpendicular projection lies within both ranges.
  if (movingHoriz) {
    const tx = target.x1; // target is vertical
    return tx >= mMinX - eps && tx <= mMaxX + eps && oldY >= tMinY - eps && oldY <= tMaxY + eps;
  }
  // moving vertical, target horizontal
  const ty = target.y1;
  return ty >= mMinY - eps && ty <= mMaxY + eps && oldX >= tMinX - eps && oldX <= tMaxX + eps;
}

function buildLiveSegment(c: Cycle): Segment {
  return {
    x1: c.liveStart.x,
    y1: c.liveStart.y,
    x2: c.x,
    y2: c.y,
    ownerId: c.entry.id,
    color: c.color,
  };
}

// Returns nearest opposing cycle (alive, not self).
function nearestOpponent(c: Cycle, all: Cycle[]): Cycle | null {
  let best: Cycle | null = null;
  let bestD = Infinity;
  for (const other of all) {
    if (other === c || !other.alive) continue;
    const dx = other.x - c.x;
    const dy = other.y - c.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

// Look ahead in current direction by `dist` px, see how far until something blocks.
// Returns distance until block (Infinity = clear within look-ahead).
function lookAheadClearance(
  c: Cycle,
  dir: Direction,
  all: Cycle[],
  maxDist: number,
): number {
  const { dx, dy } = dirDelta(dir);
  // Walls
  let wallDist = Infinity;
  if (dx > 0) wallDist = ARENA_RIGHT - c.x;
  else if (dx < 0) wallDist = c.x - ARENA_LEFT;
  else if (dy > 0) wallDist = ARENA_BOTTOM - c.y;
  else wallDist = c.y - ARENA_TOP;

  let minDist = Math.min(wallDist, maxDist);

  // Trails
  const sx = c.x;
  const sy = c.y;
  const ex = sx + dx * minDist;
  const ey = sy + dy * minDist;

  for (const other of all) {
    const segs: Segment[] = [...other.trail];
    if (other.alive) segs.push(buildLiveSegment(other));

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      // Skip own most-recent segment + own live (they share endpoint with current head)
      if (other === c) {
        if (i === segs.length - 1) continue; // live
        if (i === segs.length - 2) continue; // most recent frozen
      }

      const movingHoriz = dy === 0;
      const segHoriz = Math.abs(seg.y1 - seg.y2) < 0.5;

      if (movingHoriz === segHoriz) continue; // parallel - skip for clearance check

      const tMinX = Math.min(seg.x1, seg.x2);
      const tMaxX = Math.max(seg.x1, seg.x2);
      const tMinY = Math.min(seg.y1, seg.y2);
      const tMaxY = Math.max(seg.y1, seg.y2);

      let hitDist = Infinity;
      if (movingHoriz) {
        // Cross with vertical segment at x = seg.x1
        if (sy < tMinY - 0.5 || sy > tMaxY + 0.5) continue;
        const tx = seg.x1;
        const dist = (tx - sx) * dx; // signed
        if (dist > 0 && dist <= minDist + 0.5) hitDist = dist;
      } else {
        if (sx < tMinX - 0.5 || sx > tMaxX + 0.5) continue;
        const ty = seg.y1;
        const dist = (ty - sy) * dy;
        if (dist > 0 && dist <= minDist + 0.5) hitDist = dist;
      }

      if (hitDist < minDist) minDist = hitDist;
    }

    // Other cycles' bodies (head): treat as 6px obstacle
    if (other !== c && other.alive) {
      const ahead = movingTowardOther(c, dir, other);
      if (ahead != null && ahead < minDist) minDist = ahead;
    }
  }
  // Suppress unused-helper warning for ex/ey: they describe the look-ahead extent.
  void ex; void ey;
  return Math.max(0, minDist);
}

function movingTowardOther(c: Cycle, dir: Direction, other: Cycle): number | null {
  const { dx, dy } = dirDelta(dir);
  const ddx = other.x - c.x;
  const ddy = other.y - c.y;
  if (dx > 0 && ddx > 0 && Math.abs(ddy) < 8) return ddx - 6;
  if (dx < 0 && ddx < 0 && Math.abs(ddy) < 8) return -ddx - 6;
  if (dy > 0 && ddy > 0 && Math.abs(ddx) < 8) return ddy - 6;
  if (dy < 0 && ddy < 0 && Math.abs(ddx) < 8) return -ddy - 6;
  return null;
}

// Simple flood-fill from cycle's next-cell forward direction; counts open cells reachable.
// Used by defensive personality to choose the most-spacious turn.
function spaceAhead(c: Cycle, dir: Direction, all: Cycle[], budget: number): number {
  const { dx, dy } = dirDelta(dir);
  const startX = c.x + dx * 12;
  const startY = c.y + dy * 12;
  if (startX < ARENA_LEFT || startX > ARENA_RIGHT || startY < ARENA_TOP || startY > ARENA_BOTTOM) return 0;

  // Coarse grid (cells of GRID_CELL*2) for quick BFS
  const cell = GRID_CELL * 2;
  const cols = Math.ceil(PLAY_WIDTH / cell);
  const rows = Math.ceil(PLAY_HEIGHT / cell);
  const blocked: boolean[] = new Array(cols * rows).fill(false);

  const markSeg = (s: Segment) => {
    const sx1 = Math.min(s.x1, s.x2);
    const sx2 = Math.max(s.x1, s.x2);
    const sy1 = Math.min(s.y1, s.y2);
    const sy2 = Math.max(s.y1, s.y2);
    for (let y = sy1; y <= sy2 + 0.5; y += cell / 2) {
      for (let x = sx1; x <= sx2 + 0.5; x += cell / 2) {
        const cx = Math.floor((x - ARENA_LEFT) / cell);
        const cy = Math.floor((y - ARENA_TOP) / cell);
        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) blocked[cy * cols + cx] = true;
      }
    }
  };
  for (const other of all) {
    for (const s of other.trail) markSeg(s);
    if (other.alive) markSeg(buildLiveSegment(other));
  }

  const startCx = Math.floor((startX - ARENA_LEFT) / cell);
  const startCy = Math.floor((startY - ARENA_TOP) / cell);
  if (startCx < 0 || startCx >= cols || startCy < 0 || startCy >= rows) return 0;
  if (blocked[startCy * cols + startCx]) return 0;

  const visited = new Set<number>();
  const queue: Array<[number, number]> = [[startCx, startCy]];
  visited.add(startCy * cols + startCx);

  let count = 0;
  while (queue.length > 0 && count < budget) {
    const [cx, cy] = queue.shift()!;
    count++;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + ddx;
      const ny = cy + ddy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const k = ny * cols + nx;
      if (visited.has(k) || blocked[k]) continue;
      visited.add(k);
      queue.push([nx, ny]);
    }
  }
  return count;
}

// ─── AI Personalities ────────────────────────────────────────────────────────

interface AIContext {
  cycle: Cycle;
  all: Cycle[];
  discs: Disc[];
  pickups: PowerUpPickup[];
  now: number;
}

// Choose the best (or a) turn given an option set; "stay" means continue current dir.
function chooseTurn(ctx: AIContext, scoreFn: (dir: Direction) => number): Direction | null {
  const c = ctx.cycle;
  const options: Direction[] = [c.dir, ...perpendicularDirs(c.dir)];
  let bestDir = c.dir;
  let bestScore = -Infinity;
  for (const d of options) {
    const clearance = lookAheadClearance(c, d, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
    if (clearance < 12) continue; // immediate suicide → skip
    const score = scoreFn(d) + clearance * 0.2;
    if (score > bestScore) { bestScore = score; bestDir = d; }
  }
  if (bestScore === -Infinity) {
    // All options crash; pick highest clearance regardless
    let safest: Direction = c.dir;
    let safestClear = -1;
    for (const d of options) {
      const cl = lookAheadClearance(c, d, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
      if (cl > safestClear) { safestClear = cl; safest = d; }
    }
    return safest === c.dir ? null : safest;
  }
  return bestDir === c.dir ? null : bestDir;
}

function aiAggressive(ctx: AIContext): Direction | null {
  const target = nearestOpponent(ctx.cycle, ctx.all);
  if (!target) return aiWanderer(ctx);
  return chooseTurn(ctx, (d) => {
    const { dx, dy } = dirDelta(d);
    // Try to cut in front of target's path
    const tx = target.x + (dirDelta(target.dir).dx * 60);
    const ty = target.y + (dirDelta(target.dir).dy * 60);
    const headX = ctx.cycle.x + dx * 30;
    const headY = ctx.cycle.y + dy * 30;
    const distToTargetFuture = Math.hypot(headX - tx, headY - ty);
    return -distToTargetFuture * 0.5;
  });
}

function aiHunter(ctx: AIContext): Direction | null {
  const target = nearestOpponent(ctx.cycle, ctx.all);
  if (!target) return aiWanderer(ctx);
  return chooseTurn(ctx, (d) => {
    const { dx, dy } = dirDelta(d);
    const headX = ctx.cycle.x + dx * 24;
    const headY = ctx.cycle.y + dy * 24;
    return -Math.hypot(headX - target.x, headY - target.y);
  });
}

function aiDefensive(ctx: AIContext): Direction | null {
  return chooseTurn(ctx, (d) => spaceAhead(ctx.cycle, d, ctx.all, 200));
}

function aiWanderer(ctx: AIContext): Direction | null {
  // Wanderer: rarely turns unless forced. Random chance to turn.
  const c = ctx.cycle;
  const forwardClear = lookAheadClearance(c, c.dir, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
  if (forwardClear < 14) {
    // Forced — pick safer perpendicular
    const perps = perpendicularDirs(c.dir);
    let best: Direction = perps[0];
    let bestClear = -1;
    for (const p of perps) {
      const cl = lookAheadClearance(c, p, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
      if (cl > bestClear) { bestClear = cl; best = p; }
    }
    return best;
  }
  // Random whim
  if (ctx.now > c.randomTurnAt) {
    c.randomTurnAt = ctx.now + 700 + Math.random() * 1800;
    if (Math.random() < 0.55) {
      const perps = perpendicularDirs(c.dir);
      const choice = perps[Math.floor(Math.random() * perps.length)];
      const cl = lookAheadClearance(c, choice, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
      if (cl > 18) return choice;
    }
  }
  return null;
}

function aiDecideTurn(ctx: AIContext): Direction | null {
  switch (ctx.cycle.personality) {
    case 'aggressive': return aiAggressive(ctx);
    case 'defensive': return aiDefensive(ctx);
    case 'hunter': return aiHunter(ctx);
    case 'wanderer': return aiWanderer(ctx);
  }
}

// Decide whether to use the current power-up. Returns true if we should use it now.
function aiShouldUsePowerUp(ctx: AIContext): boolean {
  const c = ctx.cycle;
  if (!c.inventory) return false;
  if (ctx.now < c.boostUntil || ctx.now < c.hopUntil || ctx.now < c.phaseUntil) return false;

  const forwardClear = lookAheadClearance(c, c.dir, ctx.all, ANTI_SUICIDE_LOOK_AHEAD);
  const target = nearestOpponent(c, ctx.all);
  const distToTarget = target ? Math.hypot(target.x - c.x, target.y - c.y) : Infinity;

  switch (c.inventory) {
    case 'boost': {
      // Aggressive/Hunter: use freely. Defensive: only when chasing or escaping.
      if (c.personality === 'aggressive' || c.personality === 'hunter') {
        return forwardClear > 40 && Math.random() < 0.04;
      }
      return forwardClear > 80 && Math.random() < 0.012;
    }
    case 'hop': {
      // Defensive: hop when boxed in (low clearance)
      if (forwardClear < 22) return true;
      // Wanderer: random hop
      if (c.personality === 'wanderer') return Math.random() < 0.007;
      return Math.random() < 0.003;
    }
    case 'disc': {
      // Aggressive/Hunter: throw when target is in line of fire
      if (target) {
        const sameRow = Math.abs(target.y - c.y) < 12;
        const sameCol = Math.abs(target.x - c.x) < 12;
        const facingTarget = (
          (c.dir === 'right' && target.x > c.x && sameRow) ||
          (c.dir === 'left' && target.x < c.x && sameRow) ||
          (c.dir === 'down' && target.y > c.y && sameCol) ||
          (c.dir === 'up' && target.y < c.y && sameCol)
        );
        if (facingTarget && distToTarget < 250) {
          if (c.personality === 'aggressive' || c.personality === 'hunter') return true;
          return Math.random() < 0.4;
        }
      }
      return false;
    }
    case 'derez': {
      // Defensive: when boxed in critically
      if (forwardClear < 18) return true;
      // Others: random low chance
      return Math.random() < 0.002;
    }
    case 'phase': {
      // Wanderer/Defensive: when about to hit a trail
      if (forwardClear < 26) return true;
      return Math.random() < 0.004;
    }
  }
  return false;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const LightCycles: React.FC<Props> = ({
  entries,
  onWinner,
  onRaceComplete,
  onShowFinalStandings,
  isRacing,
  currentWinner,
  currentWinnerImage,
  currentWinnerImages,
  currentWinnerKillerInfo,
  currentWinnerIsLastPlayer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'countdown' | 'racing' | 'finished'>('idle');
  const [winnerMinimized, setWinnerMinimized] = useState(false);
  const [replayActive, setReplayActive] = useState(false);
  const autoMinimizeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cyclesRef = useRef<Cycle[]>([]);
  const discsRef = useRef<Disc[]>([]);
  const pickupsRef = useRef<PowerUpPickup[]>([]);
  const effectsRef = useRef<Effect[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const phaseStartRef = useRef<number>(0);
  const playerImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingWinnerRef = useRef<Cycle | null>(null);
  const nextDiscIdRef = useRef<number>(0);
  const nextPickupIdRef = useRef<number>(0);
  const nextPickupAtRef = useRef<number>(0);
  const fightTextRef = useRef<{ opacity: number; scale: number }>({ opacity: 0, scale: 0 });
  const frameHistoryRef = useRef<FrameSnapshot[]>([]);
  const replayDataRef = useRef<{ frames: FrameSnapshot[]; targetX: number; targetY: number; killerInfo?: { name: string; weapon: string } } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Auto-minimize banner + replay 3s after a new winner appears
  useEffect(() => {
    if (!currentWinner) return;
    setWinnerMinimized(false);
    setReplayActive(false);
    if (autoMinimizeRef.current) clearTimeout(autoMinimizeRef.current);
    autoMinimizeRef.current = setTimeout(() => {
      setWinnerMinimized(true);
      if (replayDataRef.current && replayDataRef.current.frames.length > 0) {
        setReplayActive(true);
      }
    }, 3000);
    return () => {
      if (autoMinimizeRef.current) clearTimeout(autoMinimizeRef.current);
    };
  }, [currentWinner]);

  // Preload images
  useEffect(() => {
    const nextImageUrls = new Set(entries.flatMap((entry) => getEntryImages(entry)));
    playerImagesRef.current.forEach((_, imageUrl) => {
      if (!nextImageUrls.has(imageUrl)) playerImagesRef.current.delete(imageUrl);
    });
    for (const imageUrl of nextImageUrls) {
      if (playerImagesRef.current.has(imageUrl)) continue;
      const image = new Image();
      image.src = imageUrl;
      playerImagesRef.current.set(imageUrl, image);
    }
  }, [entries]);

  // Build cycles when ready (idle → idle re-init on entries change)
  useEffect(() => {
    if (phase !== 'idle') return;
    cyclesRef.current = buildCyclesFromEntries(entries);
    discsRef.current = [];
    pickupsRef.current = [];
    effectsRef.current = [];
    frameHistoryRef.current = [];
    replayDataRef.current = null;
  }, [entries, phase]);

  // Start race when isRacing flips true
  useEffect(() => {
    if (!isRacing || entries.length === 0) return;

    cyclesRef.current = buildCyclesFromEntries(entries);
    discsRef.current = [];
    pickupsRef.current = [];
    effectsRef.current = [];
    pendingWinnerRef.current = null;
    frameHistoryRef.current = [];
    replayDataRef.current = null;
    nextPickupAtRef.current = Date.now() + 2000 + Math.random() * 1500;

    phaseStartRef.current = Date.now();
    setPhase('reveal');
  }, [isRacing, entries]);

  // Reveal → Countdown → Racing
  useEffect(() => {
    if (phase !== 'reveal') return;
    const total = entries.length * REVEAL_PER_PARTICIPANT + REVEAL_TAIL;
    const t = setTimeout(() => {
      phaseStartRef.current = Date.now();
      setPhase('countdown');
    }, total);
    return () => clearTimeout(t);
  }, [phase, entries.length]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    const t = setTimeout(() => {
      phaseStartRef.current = Date.now();
      fightTextRef.current = { opacity: 1, scale: 1.6 };
      setPhase('racing');
    }, COUNTDOWN_DURATION);
    return () => clearTimeout(t);
  }, [phase]);

  // Game loop
  useEffect(() => {
    if (phase !== 'racing') return;
    let raf: number;

    const tick = (now: number) => {
      const dt = lastFrameTimeRef.current === 0 ? 16 : Math.min(40, now - lastFrameTimeRef.current);
      lastFrameTimeRef.current = now;
      const dtSec = dt / 1000;
      const wallNow = Date.now();

      const cycles = cyclesRef.current;
      const discs = discsRef.current;
      const pickups = pickupsRef.current;
      const effects = effectsRef.current;

      // GO! text fade
      if (fightTextRef.current.opacity > 0) {
        fightTextRef.current.opacity -= dt / GO_FLASH_DURATION;
        fightTextRef.current.scale += dt / 800;
      }

      // Update cycles (movement + AI decisions)
      for (const c of cycles) {
        if (!c.alive) continue;

        // AI turn decisions on cooldown
        c.decisionCooldown -= dt;
        if (c.decisionCooldown <= 0 && wallNow >= c.hopUntil) {
          c.decisionCooldown = 100 + Math.random() * 80;
          const turn = aiDecideTurn({
            cycle: c, all: cycles, discs, pickups, now: wallNow,
          });
          if (turn && turn !== c.dir && turn !== oppositeDir(c.dir)) {
            // Commit current live segment, start new from current head
            commitLiveSegment(c);
            c.dir = turn;
          }
        }

        // Power-up usage
        if (aiShouldUsePowerUp({ cycle: c, all: cycles, discs, pickups, now: wallNow })) {
          firePowerUp(c, wallNow, discs, effects, nextDiscIdRef);
        }

        // Movement
        let speed = c.speed;
        if (wallNow < c.boostUntil) speed *= BOOST_MULT;
        if (wallNow < c.hopUntil) speed *= 1.15; // hop carries forward fast

        const oldX = c.x;
        const oldY = c.y;
        const { dx, dy } = dirDelta(c.dir);
        c.x += dx * speed * dtSec;
        c.y += dy * speed * dtSec;

        // Collisions: walls
        let crashed = false;
        let killerName: string | null = null;
        let killerWeapon = 'Trail';

        if (c.x < ARENA_LEFT || c.x > ARENA_RIGHT || c.y < ARENA_TOP || c.y > ARENA_BOTTOM) {
          c.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, c.x));
          c.y = Math.max(ARENA_TOP, Math.min(ARENA_BOTTOM, c.y));
          if (wallNow >= c.hopUntil && wallNow >= c.phaseUntil) {
            crashed = true;
            killerWeapon = 'Wall';
          }
        }

        // Trail collisions (skip during phase or hop)
        if (!crashed && wallNow >= c.phaseUntil && wallNow >= c.hopUntil) {
          for (const other of cycles) {
            const segs: Segment[] = [...other.trail];
            if (other.alive) segs.push(buildLiveSegment(other));
            for (let i = 0; i < segs.length; i++) {
              if (other === c) {
                if (i === segs.length - 1) continue;
                if (i === segs.length - 2) continue;
              }
              const s = segs[i];
              if (segmentSweepHits(oldX, oldY, c.x, c.y, s, COLLISION_EPS)) {
                crashed = true;
                if (other !== c) {
                  killerName = other.entry.name;
                  killerWeapon = 'Trail';
                }
                break;
              }
            }
            if (crashed) break;
          }
        }

        if (crashed) {
          c.alive = false;
          c.deathTime = wallNow;
          c.lastHitByName = killerName;
          c.lastHitByWeapon = killerWeapon;
          // Final commit of live segment (frozen at crash point)
          commitLiveSegment(c);
          spawnDerezEffect(effects, c);
          if (!pendingWinnerRef.current) {
            pendingWinnerRef.current = c;
          }
        }
      }

      // Update discs
      for (const d of discs) {
        if (!d.active) continue;
        if (wallNow - d.spawnedAt > DISC_LIFETIME) { d.active = false; continue; }
        const oldDx = d.x;
        const oldDy = d.y;
        d.x += d.vx * dtSec;
        d.y += d.vy * dtSec;
        if (d.x < ARENA_LEFT || d.x > ARENA_RIGHT || d.y < ARENA_TOP || d.y > ARENA_BOTTOM) {
          d.active = false;
          spawnDiscBurst(effects, d);
          continue;
        }
        // Hit cycles
        for (const c of cycles) {
          if (!c.alive || c.entry.id === d.ownerId) continue;
          if (wallNow < c.phaseUntil) continue;
          const dist = Math.hypot(c.x - d.x, c.y - d.y);
          if (dist < CYCLE_RADIUS + 4) {
            // Disc kill
            const owner = cycles.find(o => o.entry.id === d.ownerId);
            c.alive = false;
            c.deathTime = wallNow;
            c.lastHitByName = owner ? owner.entry.name : null;
            c.lastHitByWeapon = 'Identity Disc';
            commitLiveSegment(c);
            spawnDerezEffect(effects, c);
            spawnDiscBurst(effects, d);
            d.active = false;
            if (!pendingWinnerRef.current) pendingWinnerRef.current = c;
            break;
          }
        }
        if (!d.active) continue;
        // Hit trails: erase the segment that was hit
        let didHitTrail = false;
        for (const other of cycles) {
          for (let i = 0; i < other.trail.length; i++) {
            const s = other.trail[i];
            if (segmentSweepHits(oldDx, oldDy, d.x, d.y, s, 2)) {
              other.trail.splice(i, 1);
              spawnDiscBurst(effects, d);
              spawnDerezTrailEffect(effects, d.x, d.y, s.color);
              d.active = false;
              didHitTrail = true;
              break;
            }
          }
          if (didHitTrail) break;
          // Also hit live segment of OTHER cycles (treat as trail derez, no kill)
          if (other.entry.id !== d.ownerId && other.alive) {
            const live = buildLiveSegment(other);
            if (segmentSweepHits(oldDx, oldDy, d.x, d.y, live, 2)) {
              // Truncate live: commit as if turning here
              commitLiveSegment(other);
              spawnDiscBurst(effects, d);
              spawnDerezTrailEffect(effects, d.x, d.y, live.color);
              d.active = false;
              didHitTrail = true;
              break;
            }
          }
        }
      }

      // Power-up pickup spawn
      if (wallNow >= nextPickupAtRef.current && pickups.length < 5) {
        const p = trySpawnPickup(cycles, pickups, wallNow);
        if (p) {
          pickups.push(p);
          nextPickupIdRef.current = Math.max(nextPickupIdRef.current, p.id) + 1;
        }
        nextPickupAtRef.current = wallNow + POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN);
      }

      // Pickup expiration + collection
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (wallNow - p.spawnedAt > POWERUP_LIFETIME) {
          pickups.splice(i, 1);
          continue;
        }
        for (const c of cycles) {
          if (!c.alive) continue;
          const dist = Math.hypot(c.x - p.x, c.y - p.y);
          if (dist < CYCLE_RADIUS + POWERUP_RADIUS) {
            c.inventory = p.type;
            spawnPickupEffect(effects, p);
            pickups.splice(i, 1);
            break;
          }
        }
      }

      // Effects update
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        e.life -= dt;
        if (e.vx !== undefined && e.vy !== undefined) {
          e.x += e.vx * dtSec;
          e.y += e.vy * dtSec;
        }
        if (e.life <= 0) effects.splice(i, 1);
      }

      // Discs cleanup
      for (let i = discs.length - 1; i >= 0; i--) {
        if (!discs[i].active && wallNow - discs[i].spawnedAt > 600) discs.splice(i, 1);
      }

      // Snapshot frame for replay buffer
      frameHistoryRef.current.push(snapshotFrame(wallNow, cyclesRef.current, discsRef.current, pickupsRef.current, effectsRef.current));
      while (frameHistoryRef.current.length > 0 && wallNow - frameHistoryRef.current[0].time > FRAME_HISTORY_MS) {
        frameHistoryRef.current.shift();
      }

      // Check for elimination → fire onWinner
      if (pendingWinnerRef.current) {
        const dead = pendingWinnerRef.current;
        const aliveCount = cyclesRef.current.filter(c => c.alive).length;
        const isLast = aliveCount === 0; // final cycle
        // Stash replay data
        replayDataRef.current = {
          frames: [...frameHistoryRef.current],
          targetX: dead.x,
          targetY: dead.y,
          killerInfo: dead.lastHitByName ? { name: dead.lastHitByName, weapon: dead.lastHitByWeapon ?? 'Trail' } : undefined,
        };
        pendingWinnerRef.current = null;
        setPhase('finished');
        onWinner(dead.entry, dead.selectedImageDataUrl, replayDataRef.current.killerInfo);
        // Suppress unused linter warning
        void isLast;
        return;
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, onWinner]);

  // When isRacing flips false (after onWinner), keep phase='finished' for replay/banner.
  useEffect(() => {
    if (!isRacing && phase === 'racing') {
      setPhase('finished');
    }
    if (!isRacing && phase === 'finished') {
      // Stay finished; banner is shown by parent. When isRacing flips true again,
      // the start-race effect will reinitialize.
    }
  }, [isRacing, phase]);

  // Reset to idle when there's no winner shown and not racing (full state reset)
  useEffect(() => {
    if (!isRacing && !currentWinner) {
      setPhase('idle');
      setReplayActive(false);
      setWinnerMinimized(false);
      replayDataRef.current = null;
    }
  }, [isRacing, currentWinner]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let raf: number;
    const draw = () => {
      const wallNow = Date.now();
      // Clear background
      ctx.fillStyle = '#03060d';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Grid backdrop
      drawGridBackdrop(ctx, wallNow);

      // Arena perimeter glow
      drawPerimeter(ctx, phaseRef.current);

      if (replayActive && replayDataRef.current && replayDataRef.current.frames.length > 0) {
        drawReplay(ctx, replayDataRef.current, wallNow, playerImagesRef.current);
      } else if (phase === 'reveal') {
        drawReveal(ctx, cyclesRef.current, wallNow - phaseStartRef.current, playerImagesRef.current);
      } else if (phase === 'countdown') {
        drawScene(ctx, cyclesRef.current, discsRef.current, pickupsRef.current, effectsRef.current, wallNow);
        drawCountdown(ctx, wallNow - phaseStartRef.current);
      } else {
        drawScene(ctx, cyclesRef.current, discsRef.current, pickupsRef.current, effectsRef.current, wallNow);
        if (fightTextRef.current.opacity > 0) drawGoFlash(ctx, fightTextRef.current);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, replayActive]);

  return (
    <div className="light-cycles">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="lc-canvas" />

      {currentWinner && !isRacing && !winnerMinimized && (
        <div className="lc-winner-display">
          <div className={`lc-winner-banner ${currentWinnerIsLastPlayer ? 'lc-winner-banner-last' : ''}`}>
            <button
              type="button"
              className="lc-winner-minimize-btn"
              onClick={() => setWinnerMinimized(true)}
              aria-label="Minimize"
            >
              −
            </button>
            <h2>{currentWinnerIsLastPlayer ? '🏆 GRID CHAMPION 🏆' : 'DEREZZED'}</h2>
            {currentWinnerImages && currentWinnerImages.length > 0 ? (
              <div className="lc-winner-images-gallery">
                {currentWinnerImages.map((image, idx) => (
                  <div key={idx} className="lc-winner-avatar-small" aria-hidden="true">
                    <img src={image} alt="" className="lc-winner-avatar-image-small" />
                  </div>
                ))}
              </div>
            ) : currentWinnerImage ? (
              <div className="lc-winner-avatar" aria-hidden="true">
                <img src={currentWinnerImage} alt="" className="lc-winner-avatar-image" />
              </div>
            ) : null}
            <p className="lc-winner-name">{currentWinner}</p>
            {currentWinnerKillerInfo && (
              <p className="lc-killer-info">
                {currentWinnerKillerInfo.weapon === 'Wall'
                  ? <>Crashed into the grid wall</>
                  : <>Derezzed by <strong>{currentWinnerKillerInfo.name}</strong> · {currentWinnerKillerInfo.weapon}</>}
              </p>
            )}
            {entries.length === 0 ? (
              <button onClick={onShowFinalStandings} className="lc-final-btn">
                🏆 Final Standings
              </button>
            ) : (
              <button onClick={onRaceComplete} className="lc-next-btn">
                ▶ Next Run
              </button>
            )}
          </div>
        </div>
      )}
      {currentWinner && !isRacing && winnerMinimized && (
        <div className="lc-winner-minimized" onClick={() => setWinnerMinimized(false)}>
          <span className="lc-winner-minimized-text">
            {currentWinnerIsLastPlayer ? '🏆' : '✕'} {currentWinner}
          </span>
          {entries.length === 0 ? (
            <button onClick={(e) => { e.stopPropagation(); onShowFinalStandings?.(); }} className="lc-winner-minimized-action">
              🏆 Standings
            </button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onRaceComplete(); }} className="lc-winner-minimized-action">
              ▶ Next
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Game state setup helpers ────────────────────────────────────────────────

function buildCyclesFromEntries(entries: Entry[]): Cycle[] {
  const shuffled = shuffle(entries);
  const slots = spawnPositions(shuffled.length);
  return shuffled.map((entry, idx) => {
    const pos = slots[idx];
    const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    return {
      entry,
      selectedImageDataUrl: pickEntryImage(entry),
      alive: true,
      deathTime: null,
      x: pos.x,
      y: pos.y,
      dir: pos.dir,
      speed: BASE_SPEED,
      trail: [],
      liveStart: { x: pos.x, y: pos.y },
      color: colorForEntryId(entry.id),
      personality,
      pendingTurn: null,
      decisionCooldown: 200 + Math.random() * 300,
      randomTurnAt: Date.now() + 800 + Math.random() * 1200,
      inventory: null,
      boostUntil: 0,
      hopUntil: 0,
      phaseUntil: 0,
      lastHitByName: null,
      lastHitByWeapon: null,
    };
  });
}

function commitLiveSegment(c: Cycle) {
  // Don't commit zero-length segments
  if (Math.abs(c.liveStart.x - c.x) < 0.5 && Math.abs(c.liveStart.y - c.y) < 0.5) {
    c.liveStart = { x: c.x, y: c.y };
    return;
  }
  c.trail.push({
    x1: c.liveStart.x,
    y1: c.liveStart.y,
    x2: c.x,
    y2: c.y,
    ownerId: c.entry.id,
    color: c.color,
  });
  c.liveStart = { x: c.x, y: c.y };
}

function firePowerUp(
  c: Cycle,
  now: number,
  discs: Disc[],
  effects: Effect[],
  nextDiscIdRef: { current: number },
) {
  if (!c.inventory) return;
  switch (c.inventory) {
    case 'boost': {
      c.boostUntil = now + BOOST_DURATION;
      effects.push({
        type: 'boostFlare', x: c.x, y: c.y, life: 600, maxLife: 600,
        color: c.color, radius: 18,
      });
      break;
    }
    case 'hop': {
      // Hop forward HOP_DISTANCE px, briefly intangible to trails
      const { dx, dy } = dirDelta(c.dir);
      // Commit current segment, teleport, start new
      commitLiveSegment(c);
      c.x += dx * HOP_DISTANCE;
      c.y += dy * HOP_DISTANCE;
      // Clamp
      c.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, c.x));
      c.y = Math.max(ARENA_TOP, Math.min(ARENA_BOTTOM, c.y));
      c.liveStart = { x: c.x, y: c.y };
      c.hopUntil = now + HOP_DURATION;
      effects.push({
        type: 'hop', x: c.x, y: c.y, life: 350, maxLife: 350, color: c.color, radius: 14,
      });
      break;
    }
    case 'disc': {
      const { dx, dy } = dirDelta(c.dir);
      const id = nextDiscIdRef.current++;
      discs.push({
        id,
        ownerId: c.entry.id,
        x: c.x + dx * (CYCLE_RADIUS + 3),
        y: c.y + dy * (CYCLE_RADIUS + 3),
        vx: dx * DISC_SPEED,
        vy: dy * DISC_SPEED,
        active: true,
        color: c.color,
        spawnedAt: now,
      });
      break;
    }
    case 'derez': {
      // Erase entire frozen trail, reset liveStart to here
      const wipeColor = c.color;
      for (const seg of c.trail) {
        effects.push({
          type: 'derezTrail',
          x: (seg.x1 + seg.x2) / 2,
          y: (seg.y1 + seg.y2) / 2,
          life: 500, maxLife: 500, color: wipeColor, radius: 8,
        });
      }
      c.trail = [];
      c.liveStart = { x: c.x, y: c.y };
      break;
    }
    case 'phase': {
      c.phaseUntil = now + PHASE_DURATION;
      effects.push({
        type: 'phaseShimmer', x: c.x, y: c.y, life: PHASE_DURATION, maxLife: PHASE_DURATION,
        color: c.color, radius: 16,
      });
      break;
    }
  }
  c.inventory = null;
}

function trySpawnPickup(cycles: Cycle[], pickups: PowerUpPickup[], now: number): PowerUpPickup | null {
  const types: PowerUpType[] = ['boost', 'hop', 'disc', 'derez', 'phase'];
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = ARENA_LEFT + 30 + Math.random() * (PLAY_WIDTH - 60);
    const y = ARENA_TOP + 30 + Math.random() * (PLAY_HEIGHT - 60);
    let ok = true;
    for (const c of cycles) {
      if (Math.hypot(c.x - x, c.y - y) < 40) { ok = false; break; }
      for (const seg of c.trail) {
        if (pointOnSegment(x, y, seg, 14)) { ok = false; break; }
      }
      if (!ok) break;
      if (c.alive && pointOnSegment(x, y, buildLiveSegment(c), 14)) { ok = false; break; }
    }
    if (!ok) continue;
    for (const p of pickups) {
      if (Math.hypot(p.x - x, p.y - y) < 40) { ok = false; break; }
    }
    if (!ok) continue;
    return {
      id: now,
      type: types[Math.floor(Math.random() * types.length)],
      x, y, spawnedAt: now,
    };
  }
  return null;
}

function snapshotFrame(time: number, cycles: Cycle[], discs: Disc[], pickups: PowerUpPickup[], effects: Effect[]): FrameSnapshot {
  return {
    time,
    cycles: cycles.map(c => ({
      x: c.x, y: c.y, dir: c.dir, color: c.color, alive: c.alive,
      trail: c.trail.map(s => ({ ...s })),
      liveStart: { ...c.liveStart },
      boost: time < c.boostUntil,
      hop: time < c.hopUntil,
      phase: time < c.phaseUntil,
    })),
    discs: discs.filter(d => d.active).map(d => ({ x: d.x, y: d.y, vx: d.vx, vy: d.vy, color: d.color })),
    pickups: pickups.map(p => ({ x: p.x, y: p.y, type: p.type })),
    effects: effects.map(e => ({ ...e })),
  };
}

function spawnDerezEffect(effects: Effect[], c: Cycle) {
  const count = 16;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 60 + Math.random() * 80;
    effects.push({
      type: 'derez',
      x: c.x, y: c.y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      life: 700 + Math.random() * 400, maxLife: 1100,
      color: c.color, radius: 1.5 + Math.random() * 1.5,
    });
  }
}

function spawnDerezTrailEffect(effects: Effect[], x: number, y: number, color: string) {
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 60;
    effects.push({
      type: 'derezTrail', x, y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      life: 400 + Math.random() * 200, maxLife: 600,
      color, radius: 1 + Math.random() * 1.2,
    });
  }
}

function spawnDiscBurst(effects: Effect[], d: Disc) {
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 60;
    effects.push({
      type: 'discBurst', x: d.x, y: d.y,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      life: 350, maxLife: 350, color: d.color, radius: 2,
    });
  }
}

function spawnPickupEffect(effects: Effect[], p: PowerUpPickup) {
  effects.push({
    type: 'pickupGrab', x: p.x, y: p.y,
    life: 450, maxLife: 450, color: '#FFFFFF', radius: 6,
  });
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawGridBackdrop(ctx: CanvasRenderingContext2D, wallNow: number) {
  const t = wallNow / 1000;
  const pulse = 0.18 + Math.sin(t * 0.6) * 0.04;

  ctx.save();
  ctx.strokeStyle = `rgba(0, 180, 220, ${pulse})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= CANVAS_WIDTH; x += GRID_CELL) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_CELL) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CANVAS_WIDTH, y + 0.5);
    ctx.stroke();
  }
  // Stronger lines every 5 cells
  ctx.strokeStyle = `rgba(0, 220, 255, ${pulse * 1.4})`;
  ctx.lineWidth = 0.7;
  for (let x = 0; x <= CANVAS_WIDTH; x += GRID_CELL * 5) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_CELL * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CANVAS_WIDTH, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPerimeter(ctx: CanvasRenderingContext2D, phase: string) {
  ctx.save();
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = phase === 'racing' ? 14 : 8;
  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 2;
  ctx.strokeRect(ARENA_LEFT, ARENA_TOP, PLAY_WIDTH, PLAY_HEIGHT);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  cycles: Cycle[],
  discs: Disc[],
  pickups: PowerUpPickup[],
  effects: Effect[],
  wallNow: number,
) {
  // Trails
  for (const c of cycles) {
    drawTrails(ctx, c, c.alive, wallNow);
  }
  // Pickups
  for (const p of pickups) {
    drawPickup(ctx, p, wallNow);
  }
  // Discs
  for (const d of discs) {
    if (!d.active) continue;
    drawDisc(ctx, d, wallNow);
  }
  // Cycles
  for (const c of cycles) {
    drawCycleSprite(ctx, c, wallNow);
  }
  // Effects
  for (const e of effects) {
    drawEffect(ctx, e);
  }
}

function drawTrails(ctx: CanvasRenderingContext2D, c: Cycle, alive: boolean, wallNow: number) {
  ctx.save();
  ctx.shadowColor = c.color;
  ctx.shadowBlur = alive ? 10 : 5;
  ctx.strokeStyle = c.color;
  ctx.lineWidth = TRAIL_THICK;
  ctx.lineCap = 'square';

  const fade = alive ? 1 : Math.max(0.25, 1 - (wallNow - (c.deathTime ?? wallNow)) / 1500);
  ctx.globalAlpha = fade;

  for (const s of c.trail) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  // Live segment
  if (alive) {
    ctx.beginPath();
    ctx.moveTo(c.liveStart.x, c.liveStart.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCycleSprite(ctx: CanvasRenderingContext2D, c: Cycle, wallNow: number) {
  if (!c.alive) return;
  ctx.save();
  ctx.translate(c.x, c.y);
  // Rotate to face direction
  let rot = 0;
  switch (c.dir) {
    case 'up': rot = -Math.PI / 2; break;
    case 'down': rot = Math.PI / 2; break;
    case 'left': rot = Math.PI; break;
    case 'right': rot = 0; break;
  }
  ctx.rotate(rot);

  const phasing = wallNow < c.phaseUntil;
  const boosting = wallNow < c.boostUntil;

  // Outer glow
  ctx.shadowColor = c.color;
  ctx.shadowBlur = boosting ? 22 : 14;
  ctx.fillStyle = c.color;
  ctx.globalAlpha = phasing ? 0.55 + 0.4 * Math.sin(wallNow / 60) : 1;

  // Body: a simple stylized cycle (a rounded rectangle pointed forward)
  const bodyLen = 12;
  const bodyWidth = 6;
  ctx.beginPath();
  ctx.moveTo(bodyLen * 0.6, 0);
  ctx.lineTo(bodyLen * 0.3, -bodyWidth / 2);
  ctx.lineTo(-bodyLen * 0.5, -bodyWidth / 2);
  ctx.lineTo(-bodyLen * 0.5, bodyWidth / 2);
  ctx.lineTo(bodyLen * 0.3, bodyWidth / 2);
  ctx.closePath();
  ctx.fill();

  // Inner spine (white)
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-bodyLen * 0.4, -1, bodyLen * 0.8, 2);

  ctx.globalAlpha = 1;
  ctx.restore();

  // Inventory glyph above cycle
  if (c.inventory) {
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = c.color;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_GLYPH[c.inventory], c.x, c.y - 14);
    ctx.restore();
  }

  // Boost flare trail behind
  if (boosting) {
    ctx.save();
    const { dx, dy } = dirDelta(c.dir);
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = c.color;
    ctx.globalAlpha = 0.6;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(c.x - dx * i * 4, c.y - dy * i * 4, 2.5 - i * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Name label
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(c.entry.name, c.x, c.y + 9, 50);
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, p: PowerUpPickup, wallNow: number) {
  const t = wallNow / 200;
  const pulse = 0.7 + Math.sin(t + p.id * 0.7) * 0.3;
  ctx.save();
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 12 * pulse;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  // Hexagonal frame
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = p.x + Math.cos(a) * POWERUP_RADIUS;
    const y = p.y + Math.sin(a) * POWERUP_RADIUS;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Glyph
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERUP_GLYPH[p.type], p.x, p.y);
  ctx.restore();
}

function drawDisc(ctx: CanvasRenderingContext2D, d: Disc, wallNow: number) {
  ctx.save();
  ctx.translate(d.x, d.y);
  const rot = (wallNow / 60) % (Math.PI * 2);
  ctx.rotate(rot);
  ctx.shadowColor = d.color;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1.6;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.strokeStyle = d.color;
  ctx.stroke();
  ctx.restore();
}

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect) {
  const alpha = e.life / e.maxLife;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  if (e.type === 'phaseShimmer') {
    ctx.strokeStyle = e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.radius ?? 12) * (1 - alpha * 0.4), 0, Math.PI * 2);
    ctx.stroke();
  } else if (e.type === 'boostFlare') {
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.radius ?? 16) * alpha, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'pickupGrab') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.radius ?? 8) * (1 + (1 - alpha) * 1.2), 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // particle
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius ?? 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawReveal(
  ctx: CanvasRenderingContext2D,
  cycles: Cycle[],
  elapsed: number,
  imageMap: Map<string, HTMLImageElement>,
) {
  // Draw "INITIALIZE" header
  ctx.save();
  ctx.fillStyle = '#00E5FF';
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 12;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('INITIALIZING GRID', CANVAS_WIDTH / 2, 36);
  ctx.restore();

  // Reveal each cycle one-by-one with avatar → cycle morph
  for (let i = 0; i < cycles.length; i++) {
    const c = cycles[i];
    const startAt = i * REVEAL_PER_PARTICIPANT;
    if (elapsed < startAt) continue;
    const localT = Math.min(1, (elapsed - startAt) / REVEAL_PER_PARTICIPANT);
    drawSpawnReveal(ctx, c, localT, imageMap);
  }
}

function drawSpawnReveal(
  ctx: CanvasRenderingContext2D,
  c: Cycle,
  t: number,
  imageMap: Map<string, HTMLImageElement>,
) {
  // 0-0.55: avatar appears with rezzing scan-lines.
  // 0.55-1: avatar dissolves into glowing cycle outline at spawn position.
  ctx.save();

  if (t < 0.55) {
    const localT = t / 0.55;
    const img = c.selectedImageDataUrl ? imageMap.get(c.selectedImageDataUrl) : undefined;
    if (img && img.complete && img.naturalWidth > 0) {
      const r = 18;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.clip();
      const sourceSize = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - sourceSize) / 2;
      const sy = (img.naturalHeight - sourceSize) / 2;
      ctx.globalAlpha = localT;
      ctx.drawImage(img, sx, sy, sourceSize, sourceSize, c.x - r, c.y - r, r * 2, r * 2);
      ctx.restore();
      // Scan line
      ctx.strokeStyle = c.color;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 8;
      const sliceY = c.y - r + (r * 2) * localT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x - r, sliceY);
      ctx.lineTo(c.x + r, sliceY);
      ctx.stroke();
      // Ring
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 1, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // No image: just a rezzing colored ring with name
      ctx.strokeStyle = c.color;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.globalAlpha = localT;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c.color;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.entry.name.charAt(0).toUpperCase(), c.x, c.y);
    }
    ctx.fillStyle = c.color;
    ctx.shadowBlur = 0;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(c.entry.name, c.x, c.y + 22, 60);
  } else {
    // Morph: shrink avatar into cycle sprite
    const localT = (t - 0.55) / 0.45;
    const r = 18 * (1 - localT) + 6 * localT;
    ctx.strokeStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Bright streak rays
    ctx.globalAlpha = (1 - localT);
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + localT * 2;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r);
      ctx.lineTo(c.x + Math.cos(ang) * (r + 8), c.y + Math.sin(ang) * (r + 8));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (localT > 0.7) {
      drawCycleSprite(ctx, c, Date.now());
    }
    ctx.fillStyle = c.color;
    ctx.shadowBlur = 0;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(c.entry.name, c.x, c.y + 22, 60);
  }
  ctx.restore();
}

function drawCountdown(ctx: CanvasRenderingContext2D, elapsed: number) {
  const remaining = COUNTDOWN_DURATION - elapsed;
  const second = Math.ceil(remaining / 1000); // 3, 2, 1
  const within = (elapsed % 1000) / 1000;
  const scale = 1.0 + 0.6 * (1 - within);
  const alpha = 0.4 + 0.6 * (1 - within);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#00E5FF';
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 18;
  ctx.font = `bold ${Math.round(80 * scale)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (second > 0) {
    ctx.fillText(String(second), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  }
  ctx.restore();
}

function drawGoFlash(ctx: CanvasRenderingContext2D, ft: { opacity: number; scale: number }) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, ft.opacity);
  ctx.fillStyle = '#FFE600';
  ctx.shadowColor = '#FFE600';
  ctx.shadowBlur = 22;
  ctx.font = `bold ${Math.round(60 * ft.scale)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GO!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.restore();
}

function drawReplay(
  ctx: CanvasRenderingContext2D,
  data: { frames: FrameSnapshot[]; targetX: number; targetY: number },
  wallNow: number,
  imageMap: Map<string, HTMLImageElement>,
) {
  void imageMap;
  if (data.frames.length === 0) return;
  const startTime = data.frames[0].time;
  const totalLength = data.frames[data.frames.length - 1].time - startTime;
  if (totalLength <= 0) return;

  const replayElapsed = (wallNow % (REPLAY_DURATION / REPLAY_SPEED)) * REPLAY_SPEED;
  const targetTime = startTime + Math.min(totalLength, replayElapsed);
  // Pick nearest frame
  let snap = data.frames[0];
  for (const f of data.frames) {
    if (f.time <= targetTime) snap = f;
    else break;
  }

  // Zoom on target
  const zoom = 2.4;
  const cx = data.targetX;
  const cy = data.targetY;

  ctx.save();
  ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);

  // Re-render simplified scene
  // Trails + live segs
  for (const c of snap.cycles) {
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = TRAIL_THICK;
    ctx.lineCap = 'square';
    for (const s of c.trail) {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    if (c.alive) {
      ctx.beginPath();
      ctx.moveTo(c.liveStart.x, c.liveStart.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Cycles
  for (const c of snap.cycles) {
    if (!c.alive) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    let rot = 0;
    switch (c.dir) {
      case 'up': rot = -Math.PI / 2; break;
      case 'down': rot = Math.PI / 2; break;
      case 'left': rot = Math.PI; break;
      case 'right': rot = 0; break;
    }
    ctx.rotate(rot);
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(3, -3);
    ctx.lineTo(-6, -3);
    ctx.lineTo(-6, 3);
    ctx.lineTo(3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Discs
  for (const d of snap.discs) {
    ctx.save();
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = d.color;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Effects (final flash)
  for (const e of snap.effects) {
    const alpha = e.life / e.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius ?? 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Replay overlay label
  ctx.save();
  ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
  ctx.shadowColor = '#00E5FF';
  ctx.shadowBlur = 8;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('▶ REPLAY · 0.35×', 12, 20);
  ctx.restore();
}

void POWERUP_LABEL;
