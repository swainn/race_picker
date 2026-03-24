import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import './BattleArena.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type AttackType = 'fireball' | 'buzzsaw' | 'hammer' | 'machinegun';

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
  type: 'explosion' | 'slash' | 'spark' | 'hit';
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
}

interface Obstacle {
  x: number;      // center x
  y: number;      // center y
  w: number;      // half-width
  h: number;      // half-height
  color: string;
  type: 'wall' | 'pillar' | 'crate';
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry, selectedImageDataUrl?: string) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  onAllDestroyed?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  currentWinnerImage?: string;
  currentWinnerImages?: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const BOT_RADIUS = 12;
const BASE_SPEED = 160; // pixels per second
const MAX_HP = 100;
const ARENA_MARGIN = 50;
const RAGE_TIMER_MS = 10000;


// ─── Attack Definitions ─────────────────────────────────────────────────────

const ATTACKS: AttackDef[] = [
  {
    type: 'fireball',
    range: 'ranged',
    damage: [15, 22],
    cooldownMs: 800,
    speedMultiplier: 1.0,
    attackRange: 150,
    color: '#FF6B35',
    label: '🔥',
  },
  {
    type: 'buzzsaw',
    range: 'melee',
    damage: [25, 32],
    cooldownMs: 500,
    speedMultiplier: 1.5,
    attackRange: 28,
    color: '#C0C0C0',
    label: '⚙️',
  },
  {
    type: 'hammer',
    range: 'melee',
    damage: [35, 42],
    cooldownMs: 1000,
    speedMultiplier: 0.7,
    attackRange: 32,
    color: '#8B4513',
    label: '🔨',
  },
  {
    type: 'machinegun',
    range: 'ranged',
    damage: [5, 9],
    cooldownMs: 200,
    speedMultiplier: 1.0,
    attackRange: 120,
    color: '#FFD700',
    label: '💥',
  },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

function getEntryImages(entry: Entry): string[] {
  return entry.imageDataUrls ?? (entry.imageDataUrl ? [entry.imageDataUrl] : []);
}

function pickRaceImage(entry: Entry): string | undefined {
  const images = getEntryImages(entry);
  if (images.length === 0) return undefined;
  return images[Math.floor(Math.random() * images.length)];
}

function generateColor(index: number): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
    '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
    '#FF8B94', '#D4A5A5', '#9BC995', '#C7CEEA',
    '#FFB4A2', '#E5989B', '#B5838D', '#6D6875',
    '#FF1744', '#00B0FF', '#76FF03', '#FFD600',
    '#F50057', '#651FFF',
  ];
  return colors[index % colors.length];
}

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

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
  for (let i = 0; i < pillarCount; i++) {
    const px = left + 20 + Math.random() * (playW - 40);
    const py = top + 20 + Math.random() * (playH - 40);
    // Only place if not overlapping existing walls
    const tooClose = obstacles.some(o => dist(px, py, o.x, o.y) < 30);
    if (!tooClose) {
      obstacles.push({ x: px, y: py, w: 10, h: 10, color: '#6a6a7a', type: 'pillar' });
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
  _dt: number,
  now: number,
  rageMode: boolean,
  nextProjectileId: { current: number },
): void {
  if (bot.state === 'dead') return;

  // Pick a target if we don't have one or our target is dead
  if (bot.targetId === null) {
    bot.targetId = pickTarget(bot, allBots);
    bot.state = bot.targetId !== null ? 'moving' : 'idle';
  }

  const target = allBots.find(b => b.entry.id === bot.targetId);
  if (!target || target.state === 'dead') {
    bot.targetId = null;
    bot.state = 'idle';
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
        bot.attackCooldownUntil = now + bot.attack.cooldownMs;

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
    const speed = BASE_SPEED * bot.attack.speedMultiplier;
    bot.vx = Math.cos(bot.facing) * speed;
    bot.vy = Math.sin(bot.facing) * speed;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [raceState, setRaceState] = useState<'ready' | 'racing' | 'finished'>('ready');
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
  const fightTextRef = useRef<{ opacity: number; scale: number }>({ opacity: 0, scale: 0 });

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
    if (raceState === 'finished' || raceState === 'racing') return;

    const shuffled = shuffle(entries);
    const n = shuffled.length;

    const newBots: Bot[] = shuffled.map((entry, index) => {
      const pos = perimeterPosition(index, n);
      const originalIndex = entries.findIndex(e => e.id === entry.id);
      return {
        entry,
        selectedImageDataUrl: pickRaceImage(entry),
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
      };
    });

    botsRef.current = newBots;
    projectilesRef.current = [];
    effectsRef.current = [];
    obstaclesRef.current = generateObstacles();
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
        selectedImageDataUrl: pickRaceImage(entry),
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
      };
    });

    botsRef.current = newBots;
    projectilesRef.current = [];
    effectsRef.current = [];
    obstaclesRef.current = generateObstacles();
    nextProjectileIdRef.current = 0;
    fightTextRef.current = { opacity: 1.0, scale: 2.0 };

    const now = Date.now();
    battleStartTimeRef.current = now;
    lastFrameTimeRef.current = now;
    pendingWinnerRef.current = null;

    setRaceState('racing');
  }, [isRacing, entries]);

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

      // Update FIGHT! text
      if (fightTextRef.current.opacity > 0) {
        fightTextRef.current.opacity -= dt * 1.2;
        fightTextRef.current.scale = 2.0 - fightTextRef.current.opacity;
      }

      // Update AI for each living bot
      for (const bot of bots) {
        updateBotAI(bot, bots, projectiles, effects, obstacles, dt, now, rageMode, nextProjectileIdRef);
      }

      // Move bots
      for (const bot of bots) {
        if (bot.state === 'dead') continue;

        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;

        // Clamp to arena
        bot.x = clamp(bot.x, BOT_RADIUS + 5, CANVAS_WIDTH - BOT_RADIUS - 5);
        bot.y = clamp(bot.y, BOT_RADIUS + 5, CANVAS_HEIGHT - BOT_RADIUS - 5);

        // Collide with obstacles
        for (const o of obstacles) {
          const col = circleRectCollision(bot.x, bot.y, BOT_RADIUS, o.x, o.y, o.w, o.h);
          if (col.hit) {
            bot.x += col.nx * col.overlap;
            bot.y += col.ny * col.overlap;
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

        // Check collision with obstacles
        if (!hit) {
          for (const o of obstacles) {
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

      // Check if pending winner should be reported (immediate stop)
      if (pendingWinnerRef.current) {
        const winner = pendingWinnerRef.current;
        pendingWinnerRef.current = null;
        setRaceState('finished');
        onWinner(winner.entry, winner.selectedImageDataUrl);
        return; // Stop the loop
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

  // Draw loop
  useEffect(() => {
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

        if (o.type === 'pillar') {
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
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Draw projectiles
      for (const p of projectiles) {
        ctx.save();
        if (p.type === 'fireball') {
          // Fireball glow
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          // Inner white core
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#FFF8E0';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'machinegun') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
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

        // Melee attack visual (buzz saw rotation / hammer swing)
        if (bot.state === 'attacking' && bot.attack.range === 'melee') {
          const t = Date.now() / 100;
          if (bot.attack.type === 'buzzsaw') {
            // Spinning saw blades
            ctx.strokeStyle = 'rgba(192, 192, 192, 0.7)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
              const sawAngle = t + (i * Math.PI / 2);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(
                Math.cos(sawAngle) * (BOT_RADIUS + 6),
                Math.sin(sawAngle) * (BOT_RADIUS + 6),
              );
              ctx.stroke();
            }
          } else if (bot.attack.type === 'hammer') {
            // Hammer swing arc
            const swingAngle = bot.facing + Math.sin(t * 3) * 0.8;
            ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
              Math.cos(swingAngle) * (BOT_RADIUS + 10),
              Math.sin(swingAngle) * (BOT_RADIUS + 10),
            );
            ctx.stroke();
            // Hammer head
            ctx.fillStyle = '#8B4513';
            ctx.beginPath();
            ctx.arc(
              Math.cos(swingAngle) * (BOT_RADIUS + 10),
              Math.sin(swingAngle) * (BOT_RADIUS + 10),
              4, 0, Math.PI * 2,
            );
            ctx.fill();
          }
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

      // "FIGHT!" text overlay
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
        ctx.strokeText('FIGHT!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.fillText('FIGHT!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
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
  }, [raceState]);

  return (
    <div className="racing-game">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="game-canvas" />

      {currentWinner && !isRacing && (
        <div className="winner-display">
          <div className="winner-banner">
            <h2>💀 ELIMINATED 💀</h2>
            {currentWinnerImages && currentWinnerImages.length > 0 ? (
              <div className="winner-images-gallery">
                {currentWinnerImages.map((image, idx) => (
                  <div key={idx} className="winner-avatar-small" aria-hidden="true">
                    <img src={image} alt="" className="winner-avatar-image-small" />
                  </div>
                ))}
              </div>
            ) : currentWinnerImage ? (
              <div className="winner-avatar" aria-hidden="true">
                <img src={currentWinnerImage} alt="" className="winner-avatar-image" />
              </div>
            ) : null}
            <p className="winner-name">{currentWinner}</p>
            {entries.length === 0 ? (
              <button onClick={onShowFinalStandings} className="final-standings-btn">
                🏆 Final Standings
              </button>
            ) : (
              <button onClick={onRaceComplete} className="next-race-btn">
                ⚔️ Next Battle
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
