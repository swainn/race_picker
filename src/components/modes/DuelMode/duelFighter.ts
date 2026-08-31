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

/** Draw the arena backdrop for the given stage. `now` drives ambient motion
 *  (embers, snow, rain, waves, scrolling scenery, crowd waves…). */
export function drawStage(ctx: CanvasRenderingContext2D, stage: StageId, now = 0): void {
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

  if (stage === 'desert') {
    sky(ctx, '#f2a65a', '#f9d98a');
    ctx.fillStyle = 'rgba(255,250,210,0.9)';
    ctx.beginPath();
    ctx.arc(DL.CANVAS_W * 0.3, 96, 40, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(210,150,80,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, DL.GROUND_Y - 18);
    for (let x = 0; x <= DL.CANVAS_W; x += 40) ctx.quadraticCurveTo(x + 20, DL.GROUND_Y - 34, x + 40, DL.GROUND_Y - 18);
    ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y);
    ctx.lineTo(0, DL.GROUND_Y);
    ctx.fill();
    floor(ctx, '#d9a35a', '#a06f34', 'rgba(255,240,180,0.5)');
    return;
  }

  if (stage === 'dojo') {
    // Warm wooden hall with paper screens, a scroll, and a gong.
    sky(ctx, '#5a4030', '#3a2818');
    ctx.fillStyle = 'rgba(240,230,200,0.85)';
    for (const px of [70, 200, 330]) {
      ctx.fillRect(px, 90, 80, DL.GROUND_Y - 150);
      ctx.strokeStyle = 'rgba(90,64,40,0.8)';
      ctx.lineWidth = 3;
      for (let gy = 90; gy <= DL.GROUND_Y - 60; gy += 42) {
        ctx.beginPath(); ctx.moveTo(px, gy); ctx.lineTo(px + 80, gy); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(px + 40, 90); ctx.lineTo(px + 40, DL.GROUND_Y - 60); ctx.stroke();
    }
    // Pillars.
    ctx.fillStyle = '#2e1f12';
    for (const px of [40, 160, 290, 420]) ctx.fillRect(px, 60, 18, DL.GROUND_Y - 60);
    // Header beam + gong.
    ctx.fillStyle = '#2e1f12';
    ctx.fillRect(0, 52, DL.CANVAS_W, 16);
    const gongG = ctx.createRadialGradient(240, 130, 4, 240, 130, 26);
    gongG.addColorStop(0, '#f0d070');
    gongG.addColorStop(1, '#8a6a20');
    ctx.fillStyle = gongG;
    ctx.beginPath();
    ctx.arc(240, 130, 26, 0, Math.PI * 2);
    ctx.fill();
    floor(ctx, '#8a7448', '#5c4c2c', 'rgba(255,235,180,0.4)');
    // Tatami seams.
    ctx.strokeStyle = 'rgba(60,48,24,0.5)';
    ctx.lineWidth = 2;
    for (let x = 40; x < DL.CANVAS_W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, DL.GROUND_Y); ctx.lineTo(x - 30, DL.CANVAS_H); ctx.stroke();
    }
    return;
  }

  if (stage === 'harbor') {
    // Sunset docks: ship, cranes, drifting gulls.
    sky(ctx, '#f2915a', '#f9c98a');
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(DL.CANVAS_W * 0.68, 120, 34, 0, Math.PI * 2);
    ctx.fill();
    // Sea band.
    ctx.fillStyle = 'rgba(150,90,80,0.7)';
    ctx.fillRect(0, DL.GROUND_Y - 60, DL.CANVAS_W, 60);
    // Ship hull + containers.
    ctx.fillStyle = 'rgba(60,34,40,0.9)';
    ctx.fillRect(50, DL.GROUND_Y - 108, 250, 52);
    ctx.beginPath();
    ctx.moveTo(50, DL.GROUND_Y - 56); ctx.lineTo(30, DL.GROUND_Y - 80); ctx.lineTo(50, DL.GROUND_Y - 80);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ['#a04a3a', '#3a6a8a', '#7a8a3a'][i % 3];
      ctx.fillRect(70 + i * 44, DL.GROUND_Y - 126, 38, 18);
    }
    // Crane.
    ctx.strokeStyle = 'rgba(50,30,36,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(380, DL.GROUND_Y - 60); ctx.lineTo(380, 130); ctx.lineTo(300, 150);
    ctx.stroke();
    // Gulls drifting.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (let g = 0; g < 3; g++) {
      const gx = ((now / (26 + g * 7)) + g * 190) % (DL.CANVAS_W + 60) - 30;
      const gy = 90 + g * 34 + Math.sin(now / 300 + g) * 5;
      ctx.beginPath();
      ctx.moveTo(gx - 6, gy); ctx.quadraticCurveTo(gx - 2, gy - 5, gx, gy);
      ctx.quadraticCurveTo(gx + 2, gy - 5, gx + 6, gy);
      ctx.stroke();
    }
    floor(ctx, '#6a5030', '#463420', 'rgba(255,220,160,0.45)');
    return;
  }

  if (stage === 'market') {
    // Neon night market with bobbing lantern strings.
    sky(ctx, '#1c1230', '#33204a');
    ctx.fillStyle = 'rgba(14,8,26,0.85)';
    for (const [bx, bw2, bh2] of [[0, 90, 200], [100, 120, 260], [240, 100, 230], [350, 130, 210]]) {
      ctx.fillRect(bx, DL.GROUND_Y - bh2, bw2, bh2);
    }
    // Neon signs.
    const neon = [['#ff4a8a', 120, 200], ['#4affd0', 270, 240], ['#ffd24a', 380, 220]] as const;
    for (const [col, nx, ny] of neon) {
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fillRect(nx, DL.GROUND_Y - ny, 26, 54);
      ctx.shadowBlur = 0;
    }
    // Lantern string.
    ctx.strokeStyle = 'rgba(200,180,160,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.quadraticCurveTo(DL.CANVAS_W / 2, 140, DL.CANVAS_W, 84);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      const lx = t * DL.CANVAS_W;
      const ly = 90 + Math.sin(Math.PI * t) * 46 + Math.sin(now / 400 + i * 1.7) * 4;
      ctx.fillStyle = '#ff5a3c';
      ctx.shadowColor = '#ff8a5c';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd24a';
      ctx.fillRect(lx - 2, ly + 9, 4, 3);
    }
    floor(ctx, '#3c3048', '#241c30', 'rgba(255,150,190,0.4)');
    return;
  }

  if (stage === 'casino') {
    // Night strip: twinkling marquee arch, dice and card silhouettes.
    sky(ctx, '#160f26', '#2c1a3e');
    // Marquee arch of bulbs.
    for (let i = 0; i < 15; i++) {
      const a = Math.PI * (1 + i / 14);
      const bx2 = DL.CANVAS_W / 2 + Math.cos(a) * 190;
      const by = 260 + Math.sin(a) * 190;
      const on = (i + Math.floor(now / 220)) % 3 !== 0;
      ctx.fillStyle = on ? '#ffd24a' : 'rgba(255,210,74,0.25)';
      ctx.shadowColor = '#ffd24a';
      ctx.shadowBlur = on ? 10 : 0;
      ctx.beginPath();
      ctx.arc(bx2, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Giant die.
    ctx.save();
    ctx.translate(96, DL.GROUND_Y - 74);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#e8e4f2';
    ctx.fillRect(-34, -34, 68, 68);
    ctx.fillStyle = '#26203a';
    for (const [dx, dy] of [[-15, -15], [15, 15], [0, 0], [-15, 15], [15, -15]]) {
      ctx.beginPath(); ctx.arc(dx, dy, 5.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Card.
    ctx.save();
    ctx.translate(388, DL.GROUND_Y - 66);
    ctx.rotate(0.14);
    ctx.fillStyle = '#f2eee6';
    ctx.fillRect(-26, -38, 52, 76);
    ctx.fillStyle = '#c02a3a';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥', 0, 2);
    ctx.restore();
    floor(ctx, '#8a6a2a', '#5a4418', 'rgba(255,220,120,0.5)');
    return;
  }

  if (stage === 'arena') {
    // Wrestling arena: waving crowd rows, sweeping spotlights, ring ropes.
    sky(ctx, '#12101e', '#241e34');
    // Crowd rows doing the wave.
    const rowCols = ['#5a4a7a', '#6a5a8a', '#7a6a9a'];
    for (let r = 0; r < 3; r++) {
      const y0 = 150 + r * 46;
      for (let x = 14; x < DL.CANVAS_W; x += 24) {
        const bob = Math.sin(now / 260 + x / 46 + r) * 6;
        ctx.fillStyle = rowCols[r];
        ctx.beginPath();
        ctx.arc(x, y0 + bob, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Spotlight cones.
    for (const s of [-1, 1]) {
      const ang = Math.sin(now / 900 + (s === 1 ? 1.6 : 0)) * 0.5;
      ctx.save();
      ctx.translate(DL.CANVAS_W / 2 + s * 160, 30);
      ctx.rotate(ang * s);
      const grad = ctx.createLinearGradient(0, 0, 0, 360);
      grad.addColorStop(0, 'rgba(255,255,220,0.30)');
      grad.addColorStop(1, 'rgba(255,255,220,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-58, 380); ctx.lineTo(58, 380);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    floor(ctx, '#c8c2d8', '#8a84a0', 'rgba(255,255,255,0.6)');
    // Ring ropes + posts on the apron.
    ctx.fillStyle = '#c02a3a';
    ctx.fillRect(6, DL.GROUND_Y - 92, 10, 92);
    ctx.fillRect(DL.CANVAS_W - 16, DL.GROUND_Y - 92, 10, 92);
    for (let rp = 0; rp < 3; rp++) {
      ctx.strokeStyle = ['#e8e4f2', '#4a8ae8', '#c02a3a'][rp];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, DL.GROUND_Y - 78 + rp * 26);
      ctx.lineTo(DL.CANVAS_W - 10, DL.GROUND_Y - 78 + rp * 26);
      ctx.stroke();
    }
    return;
  }

  if (stage === 'volcano') {
    // Volcano rim: lava river, drifting embers.
    sky(ctx, '#1c0806', '#4a1408');
    ctx.fillStyle = 'rgba(16,6,6,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, DL.GROUND_Y - 30);
    ctx.lineTo(90, 150); ctx.lineTo(190, DL.GROUND_Y - 90);
    ctx.lineTo(300, 110); ctx.lineTo(420, DL.GROUND_Y - 60);
    ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y - 110); ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y);
    ctx.lineTo(0, DL.GROUND_Y);
    ctx.fill();
    // Lava river.
    const lg = ctx.createLinearGradient(0, DL.GROUND_Y - 44, 0, DL.GROUND_Y);
    lg.addColorStop(0, '#ffb02a');
    lg.addColorStop(1, '#c22a08');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, DL.GROUND_Y - 26);
    for (let x = 0; x <= DL.CANVAS_W; x += 32) {
      ctx.quadraticCurveTo(x + 16, DL.GROUND_Y - 26 + Math.sin(now / 500 + x / 40) * 7 - 8, x + 32, DL.GROUND_Y - 26);
    }
    ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y);
    ctx.lineTo(0, DL.GROUND_Y);
    ctx.fill();
    // Rising embers (seeded, looping upward).
    const re = seeded(77);
    for (let e = 0; e < 14; e++) {
      const ex = re() * DL.CANVAS_W;
      const speed = 26 + re() * 40;
      const ey = DL.GROUND_Y - ((now / 1000) * speed + re() * 300) % 320;
      ctx.globalAlpha = 0.35 + re() * 0.5;
      ctx.fillStyle = re() > 0.5 ? '#ffb02a' : '#ff5a2a';
      ctx.fillRect(ex + Math.sin(now / 300 + e) * 6, ey, 3, 3);
    }
    ctx.globalAlpha = 1;
    floor(ctx, '#2c1410', '#180a08', 'rgba(255,120,50,0.5)');
    return;
  }

  if (stage === 'frozen') {
    // Frozen peak: aurora ribbons, ice crags, falling snow.
    sky(ctx, '#0a1430', '#1c3054');
    for (let a = 0; a < 3; a++) {
      ctx.beginPath();
      ctx.moveTo(0, 80 + a * 40);
      for (let x = 0; x <= DL.CANVAS_W; x += 24) {
        ctx.lineTo(x, 80 + a * 40 + Math.sin(now / 1400 + x / 60 + a * 2) * 22);
      }
      ctx.strokeStyle = ['rgba(120,255,190,0.25)', 'rgba(120,190,255,0.22)', 'rgba(190,120,255,0.18)'][a];
      ctx.lineWidth = 14;
      ctx.stroke();
    }
    // Ice crags.
    ctx.fillStyle = 'rgba(170,200,235,0.55)';
    for (const [cx2, cw, ch] of [[60, 90, 140], [200, 70, 180], [330, 110, 150]]) {
      ctx.beginPath();
      ctx.moveTo(cx2 - cw / 2, DL.GROUND_Y);
      ctx.lineTo(cx2, DL.GROUND_Y - ch);
      ctx.lineTo(cx2 + cw / 2, DL.GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    // Snow.
    const rs2 = seeded(4242);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let s = 0; s < 26; s++) {
      const sx = (rs2() * DL.CANVAS_W + Math.sin(now / 700 + s) * 18 + DL.CANVAS_W) % DL.CANVAS_W;
      const sy = ((now / 1000) * (24 + rs2() * 30) + rs2() * 600) % DL.CANVAS_H;
      ctx.fillRect(sx, sy, 2.4, 2.4);
    }
    floor(ctx, '#dce8f4', '#9ab4cc', 'rgba(255,255,255,0.8)');
    return;
  }

  if (stage === 'beach') {
    // Dusk beach: palms, rolling wave line, sailboat.
    sky(ctx, '#e86a8a', '#f9c98a');
    ctx.fillStyle = 'rgba(255,240,220,0.9)';
    ctx.beginPath();
    ctx.arc(DL.CANVAS_W * 0.34, 110, 30, 0, Math.PI * 2);
    ctx.fill();
    // Sea with animated shoreline.
    ctx.fillStyle = 'rgba(60,90,140,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, DL.GROUND_Y - 64);
    for (let x = 0; x <= DL.CANVAS_W; x += 40) {
      ctx.quadraticCurveTo(x + 20, DL.GROUND_Y - 64 + Math.sin(now / 600 + x / 50) * 6, x + 40, DL.GROUND_Y - 64);
    }
    ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y - 8);
    ctx.lineTo(0, DL.GROUND_Y - 8);
    ctx.fill();
    // Foam line.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, DL.GROUND_Y - 10 + Math.sin(now / 800) * 3);
    ctx.lineTo(DL.CANVAS_W, DL.GROUND_Y - 10 + Math.cos(now / 800) * 3);
    ctx.stroke();
    // Sailboat.
    const bx3 = 330 + Math.sin(now / 2200) * 14;
    ctx.fillStyle = '#3a2a20';
    ctx.fillRect(bx3 - 18, DL.GROUND_Y - 86, 36, 7);
    ctx.fillStyle = '#f2eee6';
    ctx.beginPath();
    ctx.moveTo(bx3, DL.GROUND_Y - 86); ctx.lineTo(bx3, DL.GROUND_Y - 122); ctx.lineTo(bx3 + 20, DL.GROUND_Y - 90);
    ctx.closePath();
    ctx.fill();
    // Palms.
    for (const [px2, lean2] of [[52, 1], [430, -1]] as const) {
      ctx.strokeStyle = '#4a3222';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(px2, DL.GROUND_Y);
      ctx.quadraticCurveTo(px2 + lean2 * 14, DL.GROUND_Y - 70, px2 + lean2 * 26, DL.GROUND_Y - 118);
      ctx.stroke();
      ctx.strokeStyle = '#2c6a3c';
      ctx.lineWidth = 5;
      for (let fr = 0; fr < 5; fr++) {
        const fa = -Math.PI / 2 + (fr - 2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(px2 + lean2 * 26, DL.GROUND_Y - 118);
        ctx.quadraticCurveTo(
          px2 + lean2 * 26 + Math.cos(fa) * 30, DL.GROUND_Y - 118 + Math.sin(fa) * 30 - 8,
          px2 + lean2 * 26 + Math.cos(fa) * 52, DL.GROUND_Y - 118 + Math.sin(fa) * 40 + 10
        );
        ctx.stroke();
      }
    }
    floor(ctx, '#e8c98a', '#b89658', 'rgba(255,240,200,0.6)');
    return;
  }

  if (stage === 'waterfall') {
    // Gorge with a shimmering waterfall column and mist.
    sky(ctx, '#2c4a3c', '#446a50');
    ctx.fillStyle = 'rgba(30,46,38,0.9)';
    ctx.fillRect(0, 80, 150, DL.GROUND_Y - 80);
    ctx.fillRect(330, 60, 150, DL.GROUND_Y - 60);
    // Waterfall column with moving shimmer.
    const wf = ctx.createLinearGradient(150, 0, 330, 0);
    wf.addColorStop(0, 'rgba(150,210,235,0.85)');
    wf.addColorStop(0.5, 'rgba(200,240,255,0.95)');
    wf.addColorStop(1, 'rgba(150,210,235,0.85)');
    ctx.fillStyle = wf;
    ctx.fillRect(170, 60, 140, DL.GROUND_Y - 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    for (let st = 0; st < 5; st++) {
      const sy2 = ((now / 4) + st * 80) % (DL.GROUND_Y - 80);
      ctx.beginPath();
      ctx.moveTo(184 + st * 24, 70 + sy2);
      ctx.lineTo(184 + st * 24, 70 + sy2 + 34);
      ctx.stroke();
    }
    // Mist at the base.
    ctx.fillStyle = 'rgba(230,245,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(240, DL.GROUND_Y - 8, 130 + Math.sin(now / 900) * 12, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    floor(ctx, '#5a6a58', '#38443a', 'rgba(200,240,255,0.5)');
    return;
  }

  if (stage === 'train') {
    // Fighting on a speeding train roof — everything scrolls.
    sky(ctx, '#7ab0d8', '#c8e0ee');
    // Clouds whipping past.
    const rc = seeded(303);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let c = 0; c < 5; c++) {
      const cw2 = 60 + rc() * 60;
      const cy2 = 60 + rc() * 120;
      const cx3 = DL.CANVAS_W - (((now / 3) + rc() * 900) % (DL.CANVAS_W + cw2 * 2)) + cw2;
      ctx.beginPath();
      ctx.ellipse(cx3, cy2, cw2, 14 + rc() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Distant hills scrolling slower.
    ctx.fillStyle = 'rgba(90,130,90,0.8)';
    for (let h = 0; h < 4; h++) {
      const hw = 190;
      const hx2 = DL.CANVAS_W - (((now / 14) + h * 160) % (DL.CANVAS_W + hw * 2)) + hw;
      ctx.beginPath();
      ctx.ellipse(hx2, DL.GROUND_Y - 30, hw, 70, 0, Math.PI, 0);
      ctx.fill();
    }
    // Telegraph poles whipping by.
    ctx.fillStyle = 'rgba(60,44,30,0.9)';
    const px3 = DL.CANVAS_W - ((now / 1.4) % (DL.CANVAS_W + 60)) + 30;
    ctx.fillRect(px3, DL.GROUND_Y - 190, 8, 160);
    ctx.fillRect(px3 - 16, DL.GROUND_Y - 182, 40, 6);
    // Train roof: metal with scrolling panel seams.
    floor(ctx, '#8a8f9c', '#5a6070', 'rgba(220,230,255,0.7)');
    ctx.strokeStyle = 'rgba(40,46,60,0.7)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      const sx2 = DL.CANVAS_W - (((now / 1.4) + k * 90) % (DL.CANVAS_W + 40)) + 20;
      ctx.beginPath();
      ctx.moveTo(sx2, DL.GROUND_Y);
      ctx.lineTo(sx2 - 26, DL.CANVAS_H);
      ctx.stroke();
    }
    return;
  }

  if (stage === 'alley') {
    // Rainy cyberpunk alley: fire escapes, flickering neon, puddles.
    sky(ctx, '#101624', '#1e2a3e');
    ctx.fillStyle = 'rgba(8,12,22,0.9)';
    ctx.fillRect(0, 60, 120, DL.GROUND_Y - 60);
    ctx.fillRect(360, 40, 120, DL.GROUND_Y - 40);
    // Fire escapes.
    ctx.strokeStyle = 'rgba(90,110,140,0.7)';
    ctx.lineWidth = 3;
    for (const ex of [24, 396]) {
      for (let fy = 110; fy < DL.GROUND_Y - 60; fy += 70) {
        ctx.strokeRect(ex, fy, 72, 8);
        ctx.beginPath();
        ctx.moveTo(ex + 62, fy + 8); ctx.lineTo(ex + 30, fy + 60);
        ctx.stroke();
      }
    }
    // Neon signs (one flickers).
    const flick = Math.floor(now / 90) % 11 !== 0;
    ctx.fillStyle = flick ? '#ff2a8a' : 'rgba(255,42,138,0.2)';
    ctx.shadowColor = '#ff2a8a';
    ctx.shadowBlur = flick ? 16 : 0;
    ctx.fillRect(140, 120, 14, 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2ae8d8';
    ctx.shadowColor = '#2ae8d8';
    ctx.shadowBlur = 14;
    ctx.fillRect(326, 150, 14, 64);
    ctx.shadowBlur = 0;
    // Rain streaks.
    const rr2 = seeded(555);
    ctx.strokeStyle = 'rgba(180,210,255,0.35)';
    ctx.lineWidth = 1.4;
    for (let r = 0; r < 30; r++) {
      const rx = (rr2() * DL.CANVAS_W + now / 6) % DL.CANVAS_W;
      const ry = ((now / 2.4) * (0.8 + rr2() * 0.5) + rr2() * 600) % DL.CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 14);
      ctx.stroke();
    }
    floor(ctx, '#242c3c', '#141a26', 'rgba(120,180,255,0.5)');
    // Puddle glints.
    ctx.fillStyle = 'rgba(42,232,216,0.25)';
    ctx.beginPath();
    ctx.ellipse(150, DL.GROUND_Y + 40, 60, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,42,138,0.22)';
    ctx.beginPath();
    ctx.ellipse(330, DL.GROUND_Y + 70, 70, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // graveyard (default/final stage)
  sky(ctx, '#0c101e', '#1c2434');
  // Full moon + glow.
  const moonG = ctx.createRadialGradient(360, 100, 8, 360, 100, 60);
  moonG.addColorStop(0, 'rgba(240,240,220,1)');
  moonG.addColorStop(0.5, 'rgba(240,240,220,0.25)');
  moonG.addColorStop(1, 'rgba(240,240,220,0)');
  ctx.fillStyle = moonG;
  ctx.beginPath();
  ctx.arc(360, 100, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ece8d8';
  ctx.beginPath();
  ctx.arc(360, 100, 26, 0, Math.PI * 2);
  ctx.fill();
  // Dead tree.
  ctx.strokeStyle = 'rgba(30,26,40,0.95)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(70, DL.GROUND_Y);
  ctx.quadraticCurveTo(60, DL.GROUND_Y - 90, 78, DL.GROUND_Y - 150);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(74, DL.GROUND_Y - 110); ctx.lineTo(110, DL.GROUND_Y - 150);
  ctx.moveTo(76, DL.GROUND_Y - 140); ctx.lineTo(50, DL.GROUND_Y - 180);
  ctx.stroke();
  // Tombstones.
  ctx.fillStyle = 'rgba(120,124,140,0.8)';
  for (const [tx2, tilt] of [[170, -0.06], [260, 0.09], [400, -0.1]] as const) {
    ctx.save();
    ctx.translate(tx2, DL.GROUND_Y);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-16, -36);
    ctx.arc(0, -36, 16, Math.PI, 0);
    ctx.lineTo(16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Bats crossing.
  ctx.fillStyle = 'rgba(20,18,30,0.95)';
  for (let b = 0; b < 3; b++) {
    const btx = ((now / (16 + b * 6)) + b * 240) % (DL.CANVAS_W + 80) - 40;
    const bty = 120 + b * 40 + Math.sin(now / 180 + b * 2) * 10;
    const wing = Math.sin(now / 90 + b) * 5;
    ctx.beginPath();
    ctx.moveTo(btx - 10, bty - wing);
    ctx.quadraticCurveTo(btx - 4, bty + 3, btx, bty);
    ctx.quadraticCurveTo(btx + 4, bty + 3, btx + 10, bty - wing);
    ctx.quadraticCurveTo(btx + 4, bty + 6, btx, bty + 3);
    ctx.quadraticCurveTo(btx - 4, bty + 6, btx - 10, bty - wing);
    ctx.fill();
  }
  // Drifting fog band.
  ctx.fillStyle = 'rgba(190,200,220,0.16)';
  ctx.beginPath();
  ctx.ellipse(DL.CANVAS_W / 2 + Math.sin(now / 2400) * 60, DL.GROUND_Y - 14, 240, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  floor(ctx, '#2a3024', '#181c14', 'rgba(160,180,150,0.4)');
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
  // Drill super (Spiral Arrow): the whole body tips near-horizontal, feet-first
  // spin read as a corkscrew dash.
  if (move === 'superCombo' && f.character.superKind === 'drill' && f.movePhase === 'active') {
    ctx.rotate(1.25);
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
  const kickFlurry = move === 'superCombo' && active && f.character.flurryStyle === 'kick';
  if (kickFlurry) {
    // Lightning-kick flurry: the front leg blurs between heights.
    const fl = Math.sin(now / 40) * 9;
    ctx.beginPath();
    ctx.moveTo(legR, -18);
    ctx.lineTo(28, -26 + fl);
    ctx.moveTo(legL, -18);
    ctx.lineTo(legL, 0);
    ctx.stroke();
  } else if (move === 'kick' && active) {
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
  } else if ((move === 'punch' && active) || (move === 'superCombo' && f.character.flurryStyle !== 'kick')) {
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
    case 'buns': {
      // Hair cap + twin ox-horn buns with trim ribbons.
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx - 5.5, hy - 7, 3, 0, Math.PI * 2);
      ctx.arc(hx + 5.5, hy - 7, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = v.trim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(hx - 5.5, hy - 7, 3.4, 0, Math.PI * 2);
      ctx.moveTo(hx + 8.9, hy - 7);
      ctx.arc(hx + 5.5, hy - 7, 3.4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'beret': {
      // Braided hair falling back + a tilted beret.
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 7.4, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillRect(hx - 8, hy - 2, 3, 12); // braids trailing behind
      ctx.fillStyle = v.trim;
      ctx.beginPath();
      ctx.ellipse(hx + 1, hy - 6.5, 6.6, 3, -0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ponytail': {
      // Ninja wrap + a high ponytail flowing behind.
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx - 4, hy - 7);
      ctx.quadraticCurveTo(hx - 11, hy - 10 + Math.sin(now / 150) * 1.5, hx - 13, hy + 2);
      ctx.lineTo(hx - 9, hy + 2);
      ctx.quadraticCurveTo(hx - 8, hy - 5, hx - 2, hy - 7.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 7, hy - 5, 14, 2); // forehead band
      break;
    }
    case 'pigtails': {
      // Twin high pigtails, one each side.
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      const flick2 = Math.sin(now / 160) * 1.4;
      ctx.beginPath();
      ctx.ellipse(hx - 8, hy - 5 + flick2, 3, 5.5, -0.5, 0, Math.PI * 2);
      ctx.ellipse(hx + 8, hy - 5 - flick2, 3, 5.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
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
    case 'buns':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx - 5.5, hy - 7, 3, 0, Math.PI * 2);
      ctx.arc(hx + 5.5, hy - 7, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'beret':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 7.4, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.beginPath();
      ctx.ellipse(hx + 1, hy - 6.5, 6.6, 3, -0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ponytail':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - 8, hy - 3, 2.6, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = v.trim;
      ctx.fillRect(hx - 7, hy - 5, 14, 2);
      break;
    case 'pigtails':
      ctx.fillStyle = v.hair;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 7, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - 8, hy - 4, 3, 5.5, -0.5, 0, Math.PI * 2);
      ctx.ellipse(hx + 8, hy - 4, 3, 5.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
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
