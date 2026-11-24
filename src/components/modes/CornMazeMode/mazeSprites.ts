import { DIR, MAZE, cellCenter, type Maze, type MazeLayout } from './mazeEngine';

/**
 * Canvas drawing for Corn Maze. Everything here is pure painting: the caller
 * decides where things are and what state they are in. All coordinates are in
 * the logical 720x560 space; the caller sets the device-pixel transform.
 */

/** Thickness of a row of corn. Passages are a cell less WALL wide. */
const WALL = 10;
const MAZE_H = MAZE.FIELD_H;
const MAZE_BOTTOM = MAZE.ORIGIN_Y + MAZE_H;
/** The cell size the corn and the runners were first drawn for. */
const BASE_CELL = 36;

/** Stable 0..1 noise from two integers, so the corn looks the same on every repaint. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawPumpkin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.82, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e07a1f';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b85c12';
  ctx.lineWidth = 1.2;
  for (const k of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.ellipse(k * r, 0, r * 0.38, r * 0.86, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#4c6b1f';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.85);
  ctx.quadraticCurveTo(r * 0.1, -r * 1.25, r * 0.4, -r * 1.25);
  ctx.stroke();
  ctx.restore();
}

function drawScarecrow(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const sway = Math.sin(now / 900) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  // Small enough to stand wholly inside the strip below the maze.
  ctx.scale(0.78, 0.78);
  ctx.rotate(sway);
  ctx.lineCap = 'round';
  // Post and crossbar
  ctx.strokeStyle = '#6b4a26';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -26);
  ctx.moveTo(-12, -17);
  ctx.lineTo(12, -17);
  ctx.stroke();
  // Shirt
  ctx.fillStyle = '#9c3b2a';
  ctx.fillRect(-6, -20, 12, 12);
  // Straw cuffs
  ctx.strokeStyle = '#e8c45a';
  ctx.lineWidth = 1.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 12, -17);
    ctx.lineTo(side * 15, -14);
    ctx.moveTo(side * 12, -17);
    ctx.lineTo(side * 15, -19);
    ctx.stroke();
  }
  // Head and hat
  ctx.fillStyle = '#e9cf94';
  ctx.beginPath();
  ctx.arc(0, -25, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3d1e';
  ctx.fillRect(-7, -29, 14, 2);
  ctx.beginPath();
  ctx.moveTo(-4, -29);
  ctx.lineTo(0, -35);
  ctx.lineTo(4, -29);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Field, title strip and the pumpkin patch outside the exit. Logical 720x560. */
export function drawField(ctx: CanvasRenderingContext2D, layout: MazeLayout, now: number): void {
  const { cell, cols, rows, originX } = layout;
  const W = MAZE.CANVAS_W;
  const H = MAZE.CANVAS_H;

  // Standing corn all round the maze
  ctx.fillStyle = '#3d4a17';
  ctx.fillRect(0, 0, W, H);

  // Title strip: a dusk sky over the field
  const sky = ctx.createLinearGradient(0, 0, 0, MAZE.ORIGIN_Y);
  sky.addColorStop(0, '#2b2a4a');
  sky.addColorStop(0.6, '#8a4a3a');
  sky.addColorStop(1, '#d98a3c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, MAZE.ORIGIN_Y - WALL / 2);
  // A ragged line of tassels against the sky
  ctx.fillStyle = '#3d4a17';
  ctx.beginPath();
  ctx.moveTo(0, MAZE.ORIGIN_Y);
  for (let x = 0; x <= W; x += 12) {
    ctx.lineTo(x, MAZE.ORIGIN_Y - 10 - hash(x, 7) * 7);
    ctx.lineTo(x + 6, MAZE.ORIGIN_Y - 5);
  }
  ctx.lineTo(W, MAZE.ORIGIN_Y);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 24px "Arial Black", system-ui, sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(26,33,9,0.85)';
  ctx.strokeText('CORN MAZE', W / 2, 24);
  ctx.fillStyle = '#ffe27a';
  ctx.fillText('CORN MAZE', W / 2, 24);
  ctx.restore();

  // Packed-earth paths
  ctx.fillStyle = '#c9a66b';
  ctx.fillRect(originX, MAZE.ORIGIN_Y, cols * cell, MAZE_H);
  // A scatter of pebbles and scuffs, so the paths are not a flat fill
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + (col + 0.22 + hash(col, row) * 0.56) * cell;
      const y = MAZE.ORIGIN_Y + (row + 0.22 + hash(row, col + 31) * 0.56) * cell;
      ctx.fillStyle = hash(col + 5, row + 9) > 0.5 ? 'rgba(120,88,44,0.28)' : 'rgba(255,236,190,0.3)';
      ctx.fillRect(x, y, 3, 2);
    }
  }

  // The pumpkin patch below the maze, with a trodden path out of the exit
  ctx.fillStyle = '#6f5a2c';
  ctx.fillRect(0, MAZE_BOTTOM + WALL / 2, W, H - MAZE_BOTTOM - WALL / 2);
  const exit = cellCenter(layout, layout.exitCell);
  const gap = (cell - WALL) / 2;
  // Widening on the way down, however wide the gap in the corn is.
  const foot = Math.max(34, gap + 6);
  ctx.fillStyle = '#c9a66b';
  ctx.beginPath();
  ctx.moveTo(exit.x - gap, MAZE_BOTTOM - WALL / 2);
  ctx.lineTo(exit.x + gap, MAZE_BOTTOM - WALL / 2);
  ctx.lineTo(exit.x + foot, H);
  ctx.lineTo(exit.x - foot, H);
  ctx.closePath();
  ctx.fill();

  // Pumpkins either side of the way out, kept clear of the exit path and the caption
  const pumpkinY = MAZE_BOTTOM + 21;
  for (const [dx, r] of [[-62, 8], [-88, 6], [62, 7.5], [90, 9], [124, 6], [196, 8], [232, 6.5], [300, 8.5], [326, 6]] as const) {
    drawPumpkin(ctx, exit.x + dx, pumpkinY + hash(dx, 3) * 4, r);
  }
  drawScarecrow(ctx, exit.x + 160, H - 2, now);
}

/** One row of corn between two points, in three passes so neighbours overlap cleanly. */
interface Segment { x1: number; y1: number; x2: number; y2: number; seed: number }

function wallSegments(maze: Maze): Segment[] {
  const segs: Segment[] = [];
  const { cell: size, originX, exitCell } = maze.layout;
  const exitCol = exitCell % maze.cols;
  const exitRow = Math.floor(exitCell / maze.cols);
  for (let row = 0; row < maze.rows; row++) {
    for (let col = 0; col < maze.cols; col++) {
      const cell = row * maze.cols + col;
      const x = originX + col * size;
      const y = MAZE.ORIGIN_Y + row * size;
      const bits = maze.open[cell];
      if (!(bits & DIR.N)) segs.push({ x1: x, y1: y, x2: x + size, y2: y, seed: cell * 4 });
      if (!(bits & DIR.W)) segs.push({ x1: x, y1: y, x2: x, y2: y + size, seed: cell * 4 + 1 });
      // The bottom row closes the field, except where the exit lets out.
      const isExit = col === exitCol && row === exitRow;
      if (row === maze.rows - 1 && !(bits & DIR.S) && !isExit) {
        segs.push({ x1: x, y1: y + size, x2: x + size, y2: y + size, seed: cell * 4 + 2 });
      }
      if (col === maze.cols - 1 && !(bits & DIR.E)) {
        segs.push({ x1: x + size, y1: y, x2: x + size, y2: y + size, seed: cell * 4 + 3 });
      }
    }
  }
  return segs;
}

/** Every corn wall of the maze, with the exit gap open. Paint once per maze. */
export function drawWalls(ctx: CanvasRenderingContext2D, maze: Maze): void {
  const segs = wallSegments(maze);
  // Longer rows of corn carry more leaves and tassels, so the planting looks
  // just as dense whatever the size of the maze.
  const density = maze.layout.cell / BASE_CELL;
  const leaves = Math.round(6 * density);
  const tassels = Math.round(3 * density);
  ctx.save();
  ctx.lineCap = 'round';

  // A soft shadow under the rows, so the corn stands up off the path
  ctx.strokeStyle = 'rgba(60,40,10,0.22)';
  ctx.lineWidth = WALL + 3;
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo(s.x1 + 1.5, s.y1 + 2.5);
    ctx.lineTo(s.x2 + 1.5, s.y2 + 2.5);
  }
  ctx.stroke();

  // Dark green base
  ctx.strokeStyle = '#2f4a14';
  ctx.lineWidth = WALL;
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();

  // Lighter leaf strokes, fanning off each stalk
  ctx.lineWidth = 1.6;
  for (const [tone, pick] of [['#4f7a22', 0], ['#6c9a2e', 1]] as const) {
    ctx.strokeStyle = tone;
    ctx.beginPath();
    for (const s of segs) {
      const horizontal = s.y1 === s.y2;
      for (let k = 0; k < leaves; k++) {
        if (k % 2 !== pick) continue;
        const f = (k + 0.5) / leaves;
        const cx = s.x1 + (s.x2 - s.x1) * f;
        const cy = s.y1 + (s.y2 - s.y1) * f;
        const lean = (hash(s.seed, k) - 0.5) * 5;
        const reach = 2.5 + hash(s.seed + 11, k) * 2;
        if (horizontal) {
          ctx.moveTo(cx - 2.5 + lean * 0.3, cy - reach);
          ctx.lineTo(cx + 2.5 + lean * 0.3, cy + reach);
        } else {
          ctx.moveTo(cx - reach, cy - 2.5 + lean * 0.3);
          ctx.lineTo(cx + reach, cy + 2.5 + lean * 0.3);
        }
      }
    }
    ctx.stroke();
  }

  // Gold tassel dots
  ctx.fillStyle = '#e8b923';
  for (const s of segs) {
    for (let k = 0; k < tassels; k++) {
      const f = (k + 0.2 + hash(s.seed + 23, k) * 0.6) / tassels;
      const cx = s.x1 + (s.x2 - s.x1) * f + (hash(s.seed + 37, k) - 0.5) * 3;
      const cy = s.y1 + (s.y2 - s.y1) * f + (hash(s.seed + 41, k) - 0.5) * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export interface RunnerOptions {
  color: string;
  initials: string;
  avatar: HTMLImageElement | null;
  heading: number;
  moving: boolean;
  /** Paused at a junction: show a "?" */
  puzzled: boolean;
  winner: boolean;
  now: number;
  /** Token scale: 1 in the tightest maze, larger where the paths are wider. */
  size: number;
}

/** How much bigger than the base token a runner is drawn in this maze. */
export function runnerSize(layout: MazeLayout): number {
  return Math.min(1.5, Math.max(1, Math.sqrt(layout.cell / BASE_CELL)));
}

export function drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, o: RunnerOptions): void {
  const r = MAZE.RUNNER_R;
  // shadowBlur ignores the transform, so scale it by hand.
  const scale = (ctx.getTransform().a || 1) * o.size;
  const photo = o.avatar && o.avatar.complete && o.avatar.naturalWidth > 0 ? o.avatar : null;
  // A walking token bobs a little; a standing one is still.
  const bob = o.moving ? Math.sin(o.now / 70) * 0.8 : 0;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(o.size, o.size);

  // Ground shadow
  ctx.fillStyle = 'rgba(40,26,6,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.75 - bob, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.winner) {
    ctx.save();
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = (10 + 4 * Math.sin(o.now / 140)) * scale;
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Heading notch, under the disc so only its tip shows beyond the ring
  ctx.save();
  ctx.rotate(o.heading);
  ctx.fillStyle = o.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r + 4.5, 0);
  ctx.lineTo(r - 2, -4);
  ctx.lineTo(r - 2, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (photo) {
    // A black disc behind it: participant pictures are cut-outs, and the path
    // would otherwise show straight through the face.
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    const fit = Math.max((r * 2) / photo.naturalWidth, (r * 2) / photo.naturalHeight);
    const w = photo.naturalWidth * fit;
    const h = photo.naturalHeight * fit;
    ctx.drawImage(photo, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = '#1d1a12';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const label = o.initials.slice(0, 3);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${label.length > 2 ? 8 : 10}px system-ui, sans-serif`;
    ctx.fillText(label, 0, 0.5);
  }

  // The colour ring
  ctx.strokeStyle = o.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  if (o.puzzled) {
    const lift = -r - 9 + Math.sin(o.now / 220) * 1.5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 14px "Arial Black", system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(26,33,9,0.9)';
    ctx.strokeText('?', 0, lift);
    ctx.fillStyle = '#ffe27a';
    ctx.fillText('?', 0, lift);
  }

  ctx.restore();
}

/** Rays and kernels bursting from the exit as the winner walks out. `t` runs 0..1. */
export function drawExitBurst(ctx: CanvasRenderingContext2D, layout: MazeLayout, t: number): void {
  if (t <= 0 || t >= 1) return;
  const exit = cellCenter(layout, layout.exitCell);
  const cx = exit.x;
  const cy = MAZE_BOTTOM;
  const scale = ctx.getTransform().a || 1;
  const fade = 1 - t;

  ctx.save();
  ctx.globalAlpha = Math.min(1, fade * 1.4);
  ctx.shadowColor = '#ffd84a';
  ctx.shadowBlur = 8 * scale;

  // An expanding ring
  ctx.strokeStyle = '#ffe27a';
  ctx.lineWidth = 3 * fade + 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 10 + t * 46, 0, Math.PI * 2);
  ctx.stroke();

  // Kernels flying outward
  ctx.fillStyle = '#ffd84a';
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + hash(i, 5) * 0.4;
    const d = 8 + t * (34 + hash(i, 9) * 30);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 2.2 * fade + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
