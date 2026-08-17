import { DL, type DuelFighter, type DuelFx, type DuelProjectile, type StageId } from './duelEngine';

/* Deterministic star/detail field so backdrops don't twinkle. */
function seeded(n: number): () => number {
  let s = n;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function sky(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, DL.GROUND_Y);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, DL.CANVAS_W, DL.GROUND_Y);
}

function floor(ctx: CanvasRenderingContext2D, top: string, bottom: string, edge: string): void {
  const g = ctx.createLinearGradient(0, DL.GROUND_Y, 0, DL.CANVAS_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, DL.GROUND_Y, DL.CANVAS_W, DL.CANVAS_H - DL.GROUND_Y);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, DL.GROUND_Y);
  ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y);
  ctx.stroke();
}

/** Draw the arena backdrop for the given stage. */
export function drawStage(ctx: CanvasRenderingContext2D, stage: StageId): void {
  if (stage === 'city') {
    sky(ctx, '#241a3a', '#3a2a56');
    ctx.fillStyle = 'rgba(18,12,32,0.7)';
    const heights = [70, 120, 46, 96, 60, 140, 84, 54, 110, 72, 100];
    let bx = 8;
    let i = 0;
    while (bx < DL.CANVAS_W) {
      const w = 26 + (i % 3) * 10;
      const h = heights[i % heights.length];
      ctx.fillRect(bx, DL.GROUND_Y - 60 - h, w, h + 60);
      // lit windows
      ctx.fillStyle = 'rgba(255,220,120,0.5)';
      const r = seeded(i * 31 + 7);
      for (let wy = DL.GROUND_Y - 55 - h; wy < DL.GROUND_Y - 60; wy += 12) {
        for (let wx = bx + 4; wx < bx + w - 4; wx += 8) if (r() > 0.5) ctx.fillRect(wx, wy, 3, 4);
      }
      ctx.fillStyle = 'rgba(18,12,32,0.7)';
      bx += w + 6;
      i++;
    }
    floor(ctx, '#4a3b2b', '#2a2018', 'rgba(255,220,150,0.35)');
    return;
  }

  if (stage === 'jungle') {
    sky(ctx, '#0e3b2e', '#1c5c40');
    // Sun disc.
    ctx.fillStyle = 'rgba(255,240,180,0.5)';
    ctx.beginPath();
    ctx.arc(DL.CANVAS_W * 0.72, 80, 34, 0, Math.PI * 2);
    ctx.fill();
    // Layered canopy silhouettes.
    const layers = [
      { y: DL.GROUND_Y - 40, col: 'rgba(8,40,24,0.9)', r: 60 },
      { y: DL.GROUND_Y - 110, col: 'rgba(12,56,34,0.85)', r: 52 },
      { y: DL.GROUND_Y - 175, col: 'rgba(16,72,44,0.7)', r: 44 },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.col;
      for (let x = -20; x < DL.CANVAS_W + 40; x += l.r * 0.9) {
        ctx.beginPath();
        ctx.arc(x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Hanging vines.
    ctx.strokeStyle = 'rgba(30,90,50,0.6)';
    ctx.lineWidth = 2;
    const rv = seeded(99);
    for (let k = 0; k < 9; k++) {
      const x = 20 + rv() * (DL.CANVAS_W - 40);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + 8, 60, x, 120 + rv() * 60);
      ctx.stroke();
    }
    floor(ctx, '#3c5a2a', '#22371a', 'rgba(160,230,120,0.35)');
    return;
  }

  if (stage === 'space') {
    sky(ctx, '#05060f', '#0c1030');
    const rs = seeded(2024);
    for (let k = 0; k < 90; k++) {
      ctx.globalAlpha = 0.3 + rs() * 0.6;
      ctx.fillStyle = '#cdd6ff';
      ctx.fillRect(rs() * DL.CANVAS_W, rs() * DL.GROUND_Y, rs() > 0.9 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
    // Planet.
    const pg = ctx.createRadialGradient(90, 110, 6, 90, 110, 46);
    pg.addColorStop(0, '#6ba3ff');
    pg.addColorStop(1, '#20366e');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(90, 110, 46, 0, Math.PI * 2);
    ctx.fill();
    // Station panels along the horizon.
    ctx.fillStyle = 'rgba(40,52,90,0.85)';
    ctx.fillRect(0, DL.GROUND_Y - 46, DL.CANVAS_W, 46);
    ctx.fillStyle = 'rgba(90,120,200,0.5)';
    for (let x = 6; x < DL.CANVAS_W; x += 26) ctx.fillRect(x, DL.GROUND_Y - 40, 16, 10);
    // Metal floor with a grid.
    floor(ctx, '#2b3350', '#161a2c', 'rgba(120,160,255,0.5)');
    ctx.strokeStyle = 'rgba(120,160,255,0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < DL.CANVAS_W; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, DL.GROUND_Y);
      ctx.lineTo(x - 40, DL.CANVAS_H);
      ctx.stroke();
    }
    return;
  }

  // desert
  sky(ctx, '#f2a65a', '#f9d98a');
  ctx.fillStyle = 'rgba(255,250,210,0.9)';
  ctx.beginPath();
  ctx.arc(DL.CANVAS_W * 0.3, 96, 40, 0, Math.PI * 2);
  ctx.fill();
  // Distant pyramids.
  ctx.fillStyle = 'rgba(190,130,70,0.7)';
  const pyr = [[120, 150], [230, 200], [360, 130]];
  for (const [px, ph] of pyr) {
    ctx.beginPath();
    ctx.moveTo(px, DL.GROUND_Y - 30);
    ctx.lineTo(px + ph * 0.9, DL.GROUND_Y - 30);
    ctx.lineTo(px + ph * 0.45, DL.GROUND_Y - 30 - ph);
    ctx.closePath();
    ctx.fill();
  }
  // Dune ridges.
  ctx.fillStyle = 'rgba(210,150,80,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, DL.GROUND_Y - 18);
  for (let x = 0; x <= DL.CANVAS_W; x += 40) ctx.quadraticCurveTo(x + 20, DL.GROUND_Y - 34, x + 40, DL.GROUND_Y - 18);
  ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y);
  ctx.lineTo(0, DL.GROUND_Y);
  ctx.fill();
  floor(ctx, '#d9a35a', '#a06f34', 'rgba(255,240,180,0.5)');
}

/** Bobbing spectator heads along the crowd band. */
export function drawCrowd(
  ctx: CanvasRenderingContext2D,
  crowd: { color: string; name: string }[],
  now: number
): void {
  if (crowd.length === 0) return;
  const bandY = DL.CANVAS_H - 74;
  const n = crowd.length;
  const gap = DL.CANVAS_W / (n + 1);
  ctx.save();
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const c = crowd[i];
    const x = gap * (i + 1);
    const bob = Math.sin(now / 220 + i * 1.3) * 3;
    const y = bandY + bob;
    // Body.
    ctx.fillStyle = c.color;
    roundRect(ctx, x - 9, y, 18, 26, 5);
    ctx.fill();
    // Head.
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(x, y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    // Name.
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const label = c.name.length > 7 ? c.name.slice(0, 6) + '…' : c.name;
    ctx.fillText(label, x, y + 36);
  }
  ctx.restore();
}

/**
 * Draw a side-view fighter. Origin is the feet; the figure is built facing right
 * (+x forward) and flipped via scale(facing,1) so poses never mirror-break.
 */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: DuelFighter,
  _img: HTMLImageElement | null,
  now: number
): void {
  const v = f.character.visual;
  // Build scaling: wider/taller bodies per archetype.
  const bw = v.build === 'thin' ? 0.8 : v.build === 'wide' ? 1.5 : v.build === 'huge' ? 1.3 : 1;
  const bh = v.build === 'thin' ? 1.12 : v.build === 'wide' ? 0.95 : v.build === 'huge' ? 1.08 : 1;
  const halfW = 8 * bw;

  const feetY = DL.GROUND_Y - f.air;
  // Shadow (shrinks with height).
  ctx.save();
  ctx.globalAlpha = 0.28 * (1 - Math.min(0.6, f.air / 120));
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(f.x, DL.GROUND_Y + 2, 16 * bw, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(f.x, feetY);

  if (f.state === 'ko') {
    // Collapsed on the ground.
    ctx.translate(0, -6);
    ctx.rotate(f.facing * 1.5);
    ctx.globalAlpha = 0.9;
  } else {
    ctx.scale(f.facing, 1);
  }

  // Idle/ready bounce — the whole fighter bobs on its toes (offset per fighter
  // so the two aren't perfectly synced).
  const grounded = f.air <= 0.5 && f.state !== 'ko';
  const bouncing = grounded && (f.state === 'idle' || f.state === 'walk' || f.state === 'block' || f.state === 'win');
  const bounce = bouncing ? Math.abs(Math.sin(now / 165 + f.x * 0.06)) * 2.6 : 0;
  ctx.translate(0, -bounce);

  const move = f.currentMove;
  const active = f.movePhase === 'active';
  const isSuper = move === 'superCombo' || move === 'superFireball';
  // Bright aura in the character's super color while charging/unleashing.
  if (isSuper && f.movePhase !== null) {
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
  const walkCycle = f.state === 'walk' ? Math.sin(now / 90) : 0;
  const lean = f.state === 'hurt' ? -6 : move === 'kick' && active ? 4 : 0;

  ctx.lineCap = 'round';

  // ---- Legs (skin or trousers tinted darker than body) ----
  ctx.strokeStyle = v.build === 'wide' ? v.skin : '#3a2f4a';
  ctx.lineWidth = 5 * Math.max(1, bw * 0.85);
  // Legs hang from the torso's base (y = -18) as vertical lines. The stroke
  // centerline is inset by half the line width so the legs' OUTER edges align
  // flush with the torso's outside edges. Sumo instead keeps corner anchors
  // for its bow-legged squat stance.
  const legW = 5 * Math.max(1, bw * 0.85);
  const isSumo = v.build === 'wide';
  const legL = isSumo ? -(halfW - 1.5) : -(halfW - legW / 2);
  const legR = isSumo ? halfW - 1.5 : halfW - legW / 2;
  if (move === 'kick' && active) {
    // Front leg kicks from the front anchor; back leg stays planted.
    ctx.beginPath();
    ctx.moveTo(legR, -18);
    ctx.lineTo(26, -24);
    ctx.moveTo(legL, -18);
    ctx.lineTo(legL, 0);
    ctx.stroke();
  } else if (f.air > 2) {
    // Tucked in the air, bent from the anchors.
    ctx.beginPath();
    ctx.moveTo(legR, -18);
    ctx.lineTo(legR + 6, -8);
    ctx.moveTo(legL, -18);
    ctx.lineTo(legL - 4, -6);
    ctx.stroke();
  } else if (isSumo) {
    // Sumo squat: knees bowed outward past the hips, feet planted beneath.
    ctx.beginPath();
    ctx.moveTo(legL, -18);
    ctx.lineTo(legL - 5, -9 + walkCycle * 1.5);
    ctx.lineTo(legL - 2 + walkCycle * 3, 0);
    ctx.moveTo(legR, -18);
    ctx.lineTo(legR + 5, -9 - walkCycle * 1.5);
    ctx.lineTo(legR + 2 - walkCycle * 3, 0);
    ctx.stroke();
  } else {
    // Standing/walking: vertical lines; the stride only swings the feet.
    ctx.beginPath();
    ctx.moveTo(legL, -18);
    ctx.lineTo(legL + walkCycle * 4, 0);
    ctx.moveTo(legR, -18);
    ctx.lineTo(legR - walkCycle * 4, 0);
    ctx.stroke();
  }

  // ---- Torso (character costume) ----
  ctx.save();
  ctx.translate(lean * 0.4, 0);
  ctx.fillStyle = v.body;
  roundRect(ctx, -halfW, -44 * bh, halfW * 2, 26 * bh + (bh - 1) * 18, 5 * bw);
  ctx.fill();
  // Wide build: bare belly overhang (sumo).
  if (v.build === 'wide') {
    ctx.fillStyle = v.skin;
    ctx.beginPath();
    ctx.ellipse(0, -26, halfW * 0.85, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cape (drawn behind-ish, trailing).
  if (v.cape) {
    ctx.fillStyle = 'rgba(30,20,50,0.9)';
    ctx.beginPath();
    ctx.moveTo(-halfW, -42);
    ctx.quadraticCurveTo(-halfW - 10, -20, -halfW - 6 + Math.sin(now / 200) * 2, -2);
    ctx.lineTo(-halfW + 2, -16);
    ctx.closePath();
    ctx.fill();
  }
  // Belt / trim.
  ctx.fillStyle = v.trim;
  ctx.fillRect(-halfW, -30 * bh + (bh - 1) * -6, halfW * 2, 3);

  // ---- Arms (anchored at the torso's top corners) ----
  ctx.strokeStyle = v.build === 'wide' || v.build === 'huge' ? v.skin : v.body;
  ctx.lineWidth = 5 * Math.max(1, bw * 0.85);
  const fist = v.gloves ? '#c9302c' : v.skin;
  const fistR = v.gloves ? 4.4 : 3.2;
  const shTop = -44 * bh + 2; // shoulder height (just below the torso's top edge)
  const shL = -(halfW - 1.5);
  const shR = halfW - 1.5;
  if (f.state === 'block') {
    // Both arms cross up in front from their corners.
    ctx.beginPath();
    ctx.moveTo(shR, shTop);
    ctx.lineTo(10, -30);
    ctx.moveTo(shL, shTop);
    ctx.lineTo(10, -24);
    ctx.stroke();
  } else if ((move === 'punch' && active) || move === 'superCombo') {
    // Punch — or the rapid flurry during a multi-hit super.
    const flurry = move === 'superCombo' ? Math.sin(now / 45) * 6 : 0;
    const reachX = v.build === 'thin' ? 36 : 30; // lanky arms reach farther
    ctx.beginPath();
    ctx.moveTo(shR, shTop);
    ctx.lineTo(reachX + flurry, -38);
    ctx.moveTo(shL, shTop);
    ctx.lineTo(reachX - 6 - flurry, -32);
    ctx.stroke();
    ctx.fillStyle = fist;
    ctx.beginPath();
    ctx.arc(reachX + 1 + flurry, -38, fistR, 0, Math.PI * 2);
    ctx.fill();
    // Claw slash lines.
    if (v.claw) {
      ctx.strokeStyle = '#e8e8f2';
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(reachX + 2 + flurry, -38 + k * 3);
        ctx.lineTo(reachX + 12 + flurry, -40 + k * 4);
        ctx.stroke();
      }
    }
  } else if (move === 'shoryuken') {
    ctx.beginPath();
    ctx.moveTo(shR, shTop);
    ctx.lineTo(12, -60);
    ctx.moveTo(shL, shTop);
    ctx.lineTo(shL - 5, shTop + 10);
    ctx.stroke();
    ctx.fillStyle = fist;
    ctx.beginPath();
    ctx.arc(13, -62, fistR, 0, Math.PI * 2);
    ctx.fill();
  } else if (move === 'hadoken' || move === 'superFireball') {
    const big = move === 'superFireball';
    ctx.beginPath();
    ctx.moveTo(shR, shTop);
    ctx.lineTo(16, -34);
    ctx.moveTo(shL, shTop);
    ctx.lineTo(16, -30);
    ctx.stroke();
    if (f.movePhase === 'windup') {
      const rr = big ? 15 : 9;
      const orb = ctx.createRadialGradient(20, -32, 0, 20, -32, rr);
      orb.addColorStop(0, big ? f.character.superColor : 'rgba(150,220,255,0.95)');
      orb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(20, -32, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Relaxed guard: arms hang from the shoulder corners.
    ctx.beginPath();
    ctx.moveTo(shR, shTop);
    ctx.lineTo(shR + 3, shTop + 11);
    ctx.moveTo(shL, shTop);
    ctx.lineTo(shL - 3, shTop + 11);
    ctx.stroke();
    if (v.gloves) {
      ctx.fillStyle = fist;
      ctx.beginPath();
      ctx.arc(shR + 4, shTop + 12, fistR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(shL - 4, shTop + 12, fistR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ---- Head + headgear ----
  const hx = lean * 0.5;
  const hy = (-52 * bh) + (bh - 1) * -4;
  ctx.fillStyle = v.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();

  switch (v.headgear) {
    case 'turban': {
      ctx.fillStyle = v.trim;
      ctx.beginPath();
      ctx.arc(hx, hy - 3, 7.2, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#e8c14a';
      ctx.beginPath();
      ctx.arc(hx, hy - 8, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'topknot': {
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2.5, 7.1, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.ellipse(hx - 2, hy - 8.5, 3.4, 2.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mane': {
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 8.6, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      // spiky tips
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(hx + k * 3.4, hy - 7);
        ctx.lineTo(hx + k * 4.2, hy - 12);
        ctx.lineTo(hx + k * 3.4 + 2, hy - 7);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'mohawk': {
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 4);
      ctx.quadraticCurveTo(hx, hy - 14, hx + 6, hy - 4);
      ctx.lineTo(hx + 3, hy - 4);
      ctx.quadraticCurveTo(hx, hy - 9, hx - 3, hy - 4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cap': {
      ctx.fillStyle = v.hair;
      ctx.fillRect(hx - 7, hy - 8, 14, 4);
      ctx.fillStyle = v.body;
      ctx.beginPath();
      ctx.arc(hx, hy - 7, 6.6, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 3, hy - 9, 6, 2);
      break;
    }
    case 'mask': {
      ctx.fillStyle = '#f2f2f6';
      ctx.beginPath();
      ctx.arc(hx, hy, 6.4, -Math.PI * 0.65, Math.PI * 0.65);
      ctx.fill();
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx - 2, hy - 3, 6.4, Math.PI * 0.8, Math.PI * 1.9);
      ctx.fill();
      break;
    }
    case 'band': {
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 7, hy - 4.5, 14, 2.4);
      break;
    }
  }

  ctx.restore();
}

/** A character mugshot for HUD portraits / VS splash (head + shoulders). */
export function drawCharacterMug(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  f: DuelFighter
): void {
  const v = f.character.visual;
  ctx.save();
  roundRect(ctx, x, y, size, size, 5);
  ctx.save();
  ctx.clip();
  // Backdrop tinted by the costume.
  const bg = ctx.createLinearGradient(x, y, x, y + size);
  bg.addColorStop(0, v.body);
  bg.addColorStop(1, '#1a1428');
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  // Shoulders.
  ctx.fillStyle = v.body;
  ctx.beginPath();
  ctx.ellipse(x + size / 2, y + size * 0.98, size * 0.44, size * 0.3, 0, Math.PI, 0);
  ctx.fill();
  // Head, scaled up ~2.4x of the in-game sprite head.
  ctx.translate(x + size / 2, y + size * 0.56);
  ctx.scale(size / 34, size / 34);
  ctx.fillStyle = v.skin;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  // Eyes.
  ctx.fillStyle = '#1a1a24';
  ctx.beginPath();
  ctx.arc(-2.4, -0.8, 0.9, 0, Math.PI * 2);
  ctx.arc(2.4, -0.8, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // Headgear (reuse the same shapes at the head origin).
  const hx = 0;
  const hy = 0;
  switch (v.headgear) {
    case 'turban':
      ctx.fillStyle = v.trim;
      ctx.beginPath();
      ctx.arc(hx, hy - 3, 7.2, Math.PI, 0);
      ctx.fill();
      break;
    case 'topknot':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2.5, 7.1, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - 2, hy - 8.5, 3.4, 2.2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mane':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 8.6, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      break;
    case 'mohawk':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 4);
      ctx.quadraticCurveTo(hx, hy - 14, hx + 6, hy - 4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cap':
      ctx.fillStyle = v.body;
      ctx.beginPath();
      ctx.arc(hx, hy - 5, 6.8, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 3, hy - 8, 6, 2);
      break;
    case 'mask':
      ctx.fillStyle = '#f2f2f6';
      ctx.beginPath();
      ctx.arc(hx, hy, 6.4, -Math.PI * 0.65, Math.PI * 0.65);
      ctx.fill();
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx - 2, hy - 3, 6.4, Math.PI * 0.8, Math.PI * 1.9);
      ctx.fill();
      break;
    case 'band':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 7, hy - 4.5, 14, 2.4);
      break;
  }
  ctx.restore();
  // Frame.
  ctx.strokeStyle = v.trim;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, size, size, 5);
  ctx.stroke();
  ctx.restore();
}

export function drawDuelProjectile(ctx: CanvasRenderingContext2D, p: DuelProjectile): void {
  const r = p.radius;
  const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, p.big ? '#ffcf5d' : p.color);
  grad.addColorStop(1, p.big ? 'rgba(255,180,60,0)' : 'rgba(120,180,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function drawDuelFx(ctx: CanvasRenderingContext2D, fx: DuelFx): void {
  const alpha = Math.max(0, fx.life / fx.maxLife);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fx.text) {
    ctx.font = 'bold 20px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(fx.text, fx.x, fx.y);
    ctx.fillStyle = fx.color;
    ctx.fillText(fx.text, fx.x, fx.y);
  } else if (fx.kind === 'spark') {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + fx.radius * 0.05;
      ctx.beginPath();
      ctx.moveTo(fx.x + Math.cos(a) * fx.radius * 0.4, fx.y + Math.sin(a) * fx.radius * 0.4);
      ctx.lineTo(fx.x + Math.cos(a) * fx.radius, fx.y + Math.sin(a) * fx.radius);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = fx.kind === 'ring' ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Top HUD: portraits, names, draining health bars, and the round timer. */
export function drawHealthBars(
  ctx: CanvasRenderingContext2D,
  f1: DuelFighter,
  f2: DuelFighter,
  img1: HTMLImageElement | null,
  img2: HTMLImageElement | null,
  timerSec: number
): void {
  const pad = 8;
  const pSize = 34;
  const barY = 14;
  const barH = 16;
  const barL = pad + pSize + 6;
  const barR = DL.CANVAS_W - pad - pSize - 6;
  const barW = (DL.CANVAS_W / 2) - barL - 20;

  void img1;
  void img2;
  drawCharacterMug(ctx, pad, barY - 3, pSize, f1);
  drawCharacterMug(ctx, DL.CANVAS_W - pad - pSize, barY - 3, pSize, f2);

  const drawBar = (x: number, anchorRight: boolean, hp: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, barY, barW, barH, 3);
    ctx.fill();
    const frac = Math.max(0, Math.min(1, hp / DL.MAX_HP));
    const w = barW * frac;
    const col = frac > 0.5 ? '#ffd23a' : frac > 0.22 ? '#ff8c2a' : '#ff3b3b';
    ctx.fillStyle = col;
    if (anchorRight) roundRect(ctx, x + barW - w, barY, w, barH, 3);
    else roundRect(ctx, x, barY, w, barH, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, barY, barW, barH, 3);
    ctx.stroke();
  };

  drawBar(barL, false, f1.hp);
  drawBar(barR - barW, true, f2.hp);

  // Super meter bars beneath each health bar.
  const superY = barY + barH + 3;
  const superH = 5;
  const superW = barW * 0.75;
  const drawSuper = (x: number, anchorRight: boolean, meter: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, superY, superW, superH, 2);
    ctx.fill();
    const frac = Math.max(0, Math.min(1, meter / DL.METER_MAX));
    const full = frac >= 1;
    const w = superW * frac;
    ctx.fillStyle = full ? '#ffe66d' : '#4fd0ff';
    if (anchorRight) roundRect(ctx, x + superW - w, superY, w, superH, 2);
    else roundRect(ctx, x, superY, w, superH, 2);
    ctx.fill();
    if (full) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 130));
      ctx.strokeStyle = '#fff2a8';
      ctx.lineWidth = 1;
      roundRect(ctx, x - 1, superY - 1, superW + 2, superH + 2, 3);
      ctx.stroke();
      ctx.font = 'bold 8px system-ui, sans-serif';
      ctx.fillStyle = '#ffe66d';
      ctx.textBaseline = 'middle';
      ctx.textAlign = anchorRight ? 'right' : 'left';
      ctx.fillText('SUPER', anchorRight ? x + superW : x, superY + superH + 7);
      ctx.restore();
    }
  };
  drawSuper(barL, false, f1.meter);
  drawSuper(barR - superW, true, f2.meter);

  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${f1.entry.name.toUpperCase()} · ${f1.character.name.toUpperCase()}`,
    barL, superY + superH + 8
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    `${f2.entry.name.toUpperCase()} · ${f2.character.name.toUpperCase()}`,
    barR, superY + superH + 8
  );

  // Round timer.
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.fillStyle = timerSec <= 5 ? '#ff5a5a' : '#fff';
  ctx.fillText(String(Math.max(0, Math.ceil(timerSec))).padStart(2, '0'), DL.CANVAS_W / 2, barY + barH / 2 + 1);
  ctx.restore();
}

/** Big center announcer text ("ROUND 1", "FIGHT!", "K.O.!", "…WINS!"). */
export function drawAnnounce(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  scale = 1
): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(46 * scale)}px "Arial Black", system-ui, sans-serif`;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, DL.CANVAS_W / 2, DL.GROUND_Y * 0.42);
  ctx.fillStyle = color;
  ctx.fillText(text, DL.CANVAS_W / 2, DL.GROUND_Y * 0.42);
  ctx.restore();
}

/** VS splash: both portraits + names + a big "VS". */
export function drawVsSplash(
  ctx: CanvasRenderingContext2D,
  f1: DuelFighter,
  f2: DuelFighter,
  img1: HTMLImageElement | null,
  img2: HTMLImageElement | null
): void {
  void img1;
  void img2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, DL.CANVAS_W, DL.CANVAS_H);
  const cy = DL.CANVAS_H * 0.4;
  const s = 96;
  drawCharacterMug(ctx, DL.CANVAS_W * 0.5 - s - 30, cy - s / 2, s, f1);
  drawCharacterMug(ctx, DL.CANVAS_W * 0.5 + 30, cy - s / 2, s, f2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px "Arial Black", system-ui, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText('VS', DL.CANVAS_W / 2, cy);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('VS', DL.CANVAS_W / 2, cy);

  const x1 = DL.CANVAS_W * 0.5 - s / 2 - 30;
  const x2 = DL.CANVAS_W * 0.5 + s / 2 + 30;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = f1.color;
  ctx.fillText(f1.entry.name, x1, cy + s / 2 + 18);
  ctx.fillStyle = f2.color;
  ctx.fillText(f2.entry.name, x2, cy + s / 2 + 18);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`as ${f1.character.name.toUpperCase()}`, x1, cy + s / 2 + 35);
  ctx.fillText(`as ${f2.character.name.toUpperCase()}`, x2, cy + s / 2 + 35);
  ctx.restore();
}
