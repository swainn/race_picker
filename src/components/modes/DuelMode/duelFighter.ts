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
  img: HTMLImageElement | null,
  now: number
): void {
  const feetY = DL.GROUND_Y - f.air;
  // Shadow (shrinks with height).
  ctx.save();
  ctx.globalAlpha = 0.28 * (1 - Math.min(0.6, f.air / 120));
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(f.x, DL.GROUND_Y + 2, 16, 5, 0, 0, Math.PI * 2);
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
  // Bright aura while charging/unleashing a super.
  if ((move === 'superCombo' || move === 'superFireball') && f.movePhase !== null) {
    const auraCol = move === 'superFireball' ? '255,210,80' : '120,220,255';
    const aura = ctx.createRadialGradient(0, -26, 3, 0, -26, 30);
    aura.addColorStop(0, `rgba(${auraCol},0.75)`);
    aura.addColorStop(1, `rgba(${auraCol},0)`);
    ctx.save();
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -26, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const walkCycle = f.state === 'walk' ? Math.sin(now / 90) : 0;
  const lean = f.state === 'hurt' ? -6 : move === 'kick' && active ? 4 : 0;

  ctx.lineCap = 'round';

  // ---- Legs ----
  ctx.strokeStyle = '#3a2f4a';
  ctx.lineWidth = 5;
  if (move === 'kick' && active) {
    // Front kick extended.
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(26, -24);
    ctx.moveTo(0, -20);
    ctx.lineTo(-6, 0);
    ctx.stroke();
  } else if (f.air > 2) {
    // Tucked in the air.
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(8, -8);
    ctx.moveTo(0, -20);
    ctx.lineTo(-6, -6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-6 + walkCycle * 4, 0);
    ctx.moveTo(0, -20);
    ctx.lineTo(7 - walkCycle * 4, 0);
    ctx.stroke();
  }

  // ---- Torso (gi in participant color) ----
  ctx.save();
  ctx.translate(lean * 0.4, 0);
  ctx.fillStyle = f.color;
  roundRect(ctx, -8, -44, 16, 26, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-8, -30, 16, 3); // belt

  // ---- Arms ----
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 5;
  if (f.state === 'block') {
    ctx.beginPath();
    ctx.moveTo(2, -40);
    ctx.lineTo(10, -30);
    ctx.moveTo(2, -34);
    ctx.lineTo(10, -24);
    ctx.stroke();
  } else if ((move === 'punch' && active) || move === 'superCombo') {
    // Punch — or a rapid two-fisted flurry during a Super Combo.
    const flurry = move === 'superCombo' ? Math.sin(now / 45) * 6 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(30 + flurry, -38);
    ctx.moveTo(-2, -38);
    ctx.lineTo(24 - flurry, -32);
    ctx.stroke();
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(31 + flurry, -38, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (move === 'shoryuken') {
    // Rising uppercut fist.
    ctx.beginPath();
    ctx.moveTo(2, -40);
    ctx.lineTo(12, -60);
    ctx.moveTo(-2, -38);
    ctx.lineTo(-8, -30);
    ctx.stroke();
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(13, -62, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (move === 'hadoken' || move === 'superFireball') {
    const big = move === 'superFireball';
    ctx.beginPath();
    ctx.moveTo(2, -38);
    ctx.lineTo(16, -34);
    ctx.moveTo(2, -32);
    ctx.lineTo(16, -30);
    ctx.stroke();
    if (f.movePhase === 'windup') {
      const rr = big ? 15 : 9;
      const rgb = big ? '255,210,80' : '150,220,255';
      const orb = ctx.createRadialGradient(20, -32, 0, 20, -32, rr);
      orb.addColorStop(0, `rgba(${rgb},0.95)`);
      orb.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(20, -32, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(2, -40);
    ctx.lineTo(9, -30);
    ctx.moveTo(-3, -40);
    ctx.lineTo(-9, -30);
    ctx.stroke();
  }
  ctx.restore();

  // ---- Head (participant photo, or skin) ----
  const hx = lean * 0.5;
  const hy = -52;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const s = Math.max(16 / img.naturalWidth, 16 / img.naturalHeight);
    ctx.drawImage(img, hx - (img.naturalWidth * s) / 2, hy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffd9b3';
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy - 3);
    ctx.lineTo(hx + 7, hy - 3);
    ctx.stroke();
  }

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

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  img: HTMLImageElement | null,
  color: string,
  name: string
): void {
  ctx.save();
  roundRect(ctx, x, y, size, size, 5);
  ctx.save();
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    ctx.drawImage(img, x + size / 2 - (img.naturalWidth * s) / 2, y + size / 2 - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((name[0] ?? '?').toUpperCase(), x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, size, size, 5);
  ctx.stroke();
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

  drawPortrait(ctx, pad, barY - 3, pSize, img1, f1.color, f1.entry.name);
  drawPortrait(ctx, DL.CANVAS_W - pad - pSize, barY - 3, pSize, img2, f2.color, f2.entry.name);

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
  ctx.fillText(f1.entry.name.toUpperCase(), barL, superY + superH + 8);
  ctx.textAlign = 'right';
  ctx.fillText(f2.entry.name.toUpperCase(), barR, superY + superH + 8);

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
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, DL.CANVAS_W, DL.CANVAS_H);
  const cy = DL.CANVAS_H * 0.4;
  const s = 96;
  drawPortrait(ctx, DL.CANVAS_W * 0.5 - s - 30, cy - s / 2, s, img1, f1.color, f1.entry.name);
  drawPortrait(ctx, DL.CANVAS_W * 0.5 + 30, cy - s / 2, s, img2, f2.color, f2.entry.name);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px "Arial Black", system-ui, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText('VS', DL.CANVAS_W / 2, cy);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('VS', DL.CANVAS_W / 2, cy);

  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = f1.color;
  ctx.fillText(f1.entry.name, DL.CANVAS_W * 0.5 - s / 2 - 30, cy + s / 2 + 18);
  ctx.fillStyle = f2.color;
  ctx.fillText(f2.entry.name, DL.CANVAS_W * 0.5 + s / 2 + 30, cy + s / 2 + 18);
  ctx.restore();
}
