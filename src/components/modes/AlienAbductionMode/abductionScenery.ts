import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_Y, HORIZON_Y } from './abductionField';

/**
 * Where the saucer shows up, and what the weather is doing when it does.
 *
 * Scene detail is generated from a seeded RNG at draw time rather than stored,
 * so every location looks the same frame to frame without the game having to
 * hold state for ten of them.
 */

export type LocationId =
  | 'field'
  | 'cornfield'
  | 'desert'
  | 'forest'
  | 'lakeshore'
  | 'snowfield'
  | 'suburb'
  | 'pumpkin'
  | 'canyon'
  | 'driveIn';

export const LOCATION_IDS: LocationId[] = [
  'field', 'cornfield', 'desert', 'forest', 'lakeshore',
  'snowfield', 'suburb', 'pumpkin', 'canyon', 'driveIn',
];

export const LOCATION_LABELS: Record<LocationId, string> = {
  field: 'Moonlit Pasture',
  cornfield: 'Cornfield',
  desert: 'Desert Flats',
  forest: 'Deep Woods',
  lakeshore: 'Lake Shore',
  snowfield: 'Frozen Tundra',
  suburb: 'Quiet Suburb',
  pumpkin: 'Pumpkin Patch',
  canyon: 'Red Canyon',
  driveIn: 'Drive-In Theater',
};

export type Weather = 'clear' | 'wind' | 'rain' | 'storm' | 'snow' | 'fog' | 'meteors';

export const WEATHER_IDS: Weather[] = ['clear', 'wind', 'rain', 'storm', 'snow', 'fog', 'meteors'];

export const WEATHER_LABELS: Record<Weather, string> = {
  clear: '🌙 Dead calm',
  wind: '💨 Windy',
  rain: '🌧️ Rain',
  storm: '⛈️ Thunderstorm',
  snow: '🌨️ Snowfall',
  fog: '🌫️ Fog',
  meteors: '☄️ Meteor shower',
};

/**
 * Whether this weather can blow an abductee out of the beam. Only the windy
 * ones carry the rescue mechanic; the rest are atmosphere.
 */
export function weatherHasGusts(w: Weather): boolean {
  return w === 'wind' || w === 'storm';
}

/** Deterministic per-scene detail, so nothing shimmers between frames. */
function seeded(n: number): () => number {
  let s = n;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const SEEDS: Record<LocationId, number> = {
  field: 101, cornfield: 211, desert: 307, forest: 401, lakeshore: 523,
  snowfield: 617, suburb: 719, pumpkin: 827, canyon: 929, driveIn: 1031,
};

function sky(ctx: CanvasRenderingContext2D, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HORIZON_Y);
}

function ground(ctx: CanvasRenderingContext2D, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_HEIGHT);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON_Y, CANVAS_WIDTH, CANVAS_HEIGHT - HORIZON_Y);
}

function stars(ctx: CanvasRenderingContext2D, rand: () => number, count: number, now: number, maxY = HORIZON_Y - 60): void {
  for (let i = 0; i < count; i++) {
    const x = rand() * CANVAS_WIDTH;
    const y = rand() * maxY;
    const r = 0.4 + rand() * 1.3;
    const tw = rand() * Math.PI * 2;
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(now / 900 + tw));
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * twinkle).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, face: string, glowColor: string): void {
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, r * 0.25, x, y, r * 2.5);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.26, r * 0.22, 0, Math.PI * 2);
  ctx.arc(x + r * 0.32, y + r * 0.28, r * 0.16, 0, Math.PI * 2);
  ctx.arc(x + r * 0.1, y - r * 0.5, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A row of conifer silhouettes along the horizon. */
function pines(ctx: CanvasRenderingContext2D, rand: () => number, count: number, color: string, minH: number, maxH: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = rand() * CANVAS_WIDTH;
    const h = minH + rand() * (maxH - minH);
    const w = h * 0.34;
    ctx.beginPath();
    ctx.moveTo(x - w, HORIZON_Y + 4);
    ctx.lineTo(x, HORIZON_Y + 4 - h);
    ctx.lineTo(x + w, HORIZON_Y + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function grassTufts(ctx: CanvasRenderingContext2D, rand: () => number, count: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < count; i++) {
    const x = rand() * CANVAS_WIDTH;
    const y = GROUND_Y - 10 + rand() * 50;
    const h = 4 + rand() * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - h);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - h * 0.8);
    ctx.stroke();
  }
}

/** Paint the backdrop for one location: sky, horizon and ground. */
export function drawLocation(ctx: CanvasRenderingContext2D, loc: LocationId, now: number): void {
  const rand = seeded(SEEDS[loc]);

  switch (loc) {
    case 'field': {
      sky(ctx, [[0, '#07091d'], [0.5, '#141a3c'], [1, '#3b2f5c']]);
      stars(ctx, rand, 110, now);
      moon(ctx, 325, 78, 22, '#f3ead0', 'rgba(255,245,210,0.35)');
      for (let i = 0; i < 9; i++) {
        const x = (i / 8) * CANVAS_WIDTH + (rand() - 0.5) * 30;
        const w = 70 + rand() * 90;
        const h = 30 + rand() * 55;
        ctx.fillStyle = rand() > 0.5 ? '#1d2545' : '#232c52';
        ctx.beginPath();
        ctx.ellipse(x, HORIZON_Y + 6, w, h, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      pines(ctx, rand, 7, '#131a33', 14, 32);
      ground(ctx, [[0, '#20402b'], [0.45, '#2c5636'], [1, '#16301f']]);
      // Fence along the back of the field
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y + 18);
      ctx.lineTo(CANVAS_WIDTH, HORIZON_Y + 14);
      ctx.moveTo(0, HORIZON_Y + 26);
      ctx.lineTo(CANVAS_WIDTH, HORIZON_Y + 22);
      ctx.stroke();
      for (let x = 10; x < CANVAS_WIDTH; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x, HORIZON_Y + 8);
        ctx.lineTo(x, HORIZON_Y + 32);
        ctx.stroke();
      }
      grassTufts(ctx, rand, 70, 'rgba(140, 200, 140, 0.35)');
      break;
    }

    case 'cornfield': {
      sky(ctx, [[0, '#120a22'], [0.55, '#2a1636'], [1, '#5a2f36']]);
      stars(ctx, rand, 70, now);
      moon(ctx, 86, 92, 27, '#f6c173', 'rgba(246,170,90,0.4)'); // harvest moon
      ground(ctx, [[0, '#4a3a18'], [0.4, '#5d4a1e'], [1, '#2e2410']]);
      // Standing corn: a dense back wall, then scattered stalks in the field.
      ctx.strokeStyle = '#1d2410';
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 90; i++) {
        const x = rand() * CANVAS_WIDTH;
        const h = 36 + rand() * 26;
        ctx.beginPath();
        ctx.moveTo(x, HORIZON_Y + 12);
        ctx.lineTo(x + (rand() - 0.5) * 6, HORIZON_Y + 12 - h);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,150,60,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = GROUND_Y - 6 + rand() * 48;
        const h = 16 + rand() * 16;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h);
        ctx.moveTo(x, y - h * 0.6);
        ctx.lineTo(x + 7, y - h * 0.9);
        ctx.moveTo(x, y - h * 0.4);
        ctx.lineTo(x - 7, y - h * 0.7);
        ctx.stroke();
      }
      break;
    }

    case 'desert': {
      sky(ctx, [[0, '#09061c'], [0.55, '#241444'], [1, '#4a2b4e']]);
      stars(ctx, rand, 150, now);
      moon(ctx, 300, 66, 18, '#efe6cf', 'rgba(255,245,210,0.3)');
      // Mesas
      for (let i = 0; i < 5; i++) {
        const x = rand() * CANVAS_WIDTH;
        const w = 50 + rand() * 80;
        const h = 28 + rand() * 46;
        ctx.fillStyle = i % 2 ? '#2a1c34' : '#35223c';
        ctx.beginPath();
        ctx.moveTo(x - w / 2, HORIZON_Y + 6);
        ctx.lineTo(x - w / 2 + 8, HORIZON_Y + 6 - h);
        ctx.lineTo(x + w / 2 - 8, HORIZON_Y + 6 - h);
        ctx.lineTo(x + w / 2, HORIZON_Y + 6);
        ctx.closePath();
        ctx.fill();
      }
      ground(ctx, [[0, '#5a4330'], [0.4, '#6d5236'], [1, '#3a2a1c']]);
      // Saguaro
      ctx.strokeStyle = '#1f3324';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = 30 + rand() * (CANVAS_WIDTH - 60);
        const y = HORIZON_Y + 24 + rand() * 40;
        const h = 24 + rand() * 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h);
        ctx.moveTo(x, y - h * 0.6);
        ctx.lineTo(x - 8, y - h * 0.6);
        ctx.lineTo(x - 8, y - h * 0.85);
        ctx.stroke();
      }
      // Scattered stones
      ctx.fillStyle = 'rgba(40,28,18,0.6)';
      for (let i = 0; i < 24; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 20 + rand() * (CANVAS_HEIGHT - HORIZON_Y - 30);
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + rand() * 4, 1.5 + rand() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'forest': {
      sky(ctx, [[0, '#04060f'], [0.6, '#0b1222'], [1, '#17243a']]);
      stars(ctx, rand, 40, now, 160);
      moon(ctx, 210, 48, 14, '#dfe8ef', 'rgba(210,230,245,0.25)');
      // Layered tree line, far then near, closing in on both sides.
      pines(ctx, rand, 16, '#0b1420', 30, 70);
      pines(ctx, rand, 14, '#0e1a26', 44, 96);
      ground(ctx, [[0, '#15301f'], [0.45, '#1b3b26'], [1, '#0d1f15']]);
      // Trunks framing the clearing
      ctx.fillStyle = '#0a1410';
      for (const side of [0, 1]) {
        const x = side === 0 ? 8 : CANVAS_WIDTH - 26;
        ctx.fillRect(x, HORIZON_Y - 40, 18, CANVAS_HEIGHT - HORIZON_Y + 40);
      }
      grassTufts(ctx, rand, 55, 'rgba(110,170,120,0.3)');
      // Ferns
      ctx.strokeStyle = 'rgba(90,150,100,0.45)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 18; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 30 + rand() * 90;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + k * 5, y - 9 + Math.abs(k) * 2);
          ctx.stroke();
        }
      }
      break;
    }

    case 'lakeshore': {
      sky(ctx, [[0, '#060b22'], [0.55, '#122244'], [1, '#2f3f66']]);
      stars(ctx, rand, 100, now);
      moon(ctx, 200, 70, 20, '#f1efe0', 'rgba(240,245,220,0.33)');
      // Far shore
      ctx.fillStyle = '#0e1728';
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y - 54);
      for (let x = 0; x <= CANVAS_WIDTH; x += 40) {
        ctx.quadraticCurveTo(x + 20, HORIZON_Y - 66, x + 40, HORIZON_Y - 54);
      }
      ctx.lineTo(CANVAS_WIDTH, HORIZON_Y - 44);
      ctx.lineTo(0, HORIZON_Y - 44);
      ctx.fill();

      // The lake itself: a wide band sitting behind the shoreline.
      const water = ctx.createLinearGradient(0, HORIZON_Y - 46, 0, HORIZON_Y + 42);
      water.addColorStop(0, '#1b3a63');
      water.addColorStop(0.6, '#132a4b');
      water.addColorStop(1, '#0c1c33');
      ctx.fillStyle = water;
      ctx.fillRect(0, HORIZON_Y - 46, CANVAS_WIDTH, 88);

      // Moon track: soft broken glints that spread as they come toward shore.
      // Drawn as jittered ellipses rather than a stack of bars, which read as a
      // ladder rather than a reflection.
      for (let i = 0; i < 20; i++) {
        const y = HORIZON_Y - 42 + i * 4.3;
        const spread = 5 + i * 1.9;
        const sway = Math.sin(now / 700 + i * 0.8) * (2 + i * 0.5);
        const glints = 1 + (i % 3);
        for (let k = 0; k < glints; k++) {
          const off = (k - (glints - 1) / 2) * spread * 0.9 + sway;
          const w = (3 + i * 0.5) * (0.6 + rand() * 0.7);
          ctx.fillStyle = `rgba(242, 240, 218, ${(0.22 - i * 0.009).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(200 + off, y, w, 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ripple lines so the band reads as a surface, not a wall.
      ctx.strokeStyle = 'rgba(150, 190, 235, 0.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const y = HORIZON_Y - 40 + i * 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= CANVAS_WIDTH; x += 40) {
          ctx.quadraticCurveTo(x + 20, y + Math.sin(now / 800 + i + x / 60) * 2.5, x + 40, y);
        }
        ctx.stroke();
      }

      ground(ctx, [[0, '#4e4634'], [0.35, '#5c5440'], [1, '#2e2a1f']]);
      // A fringe of reeds right at the waterline, kept well above the field so
      // they never tangle with the abductees standing on the sand.
      ctx.strokeStyle = 'rgba(78,96,60,0.75)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 46 + rand() * 8;
        const h = 10 + rand() * 14;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 3, y - h * 0.6, x + 6, y - h);
        ctx.stroke();
      }
      // Wet sand darkening toward the water
      ctx.fillStyle = 'rgba(60, 62, 52, 0.45)';
      ctx.fillRect(0, HORIZON_Y + 42, CANVAS_WIDTH, 14);
      break;
    }

    case 'snowfield': {
      sky(ctx, [[0, '#050a1e'], [0.6, '#0e1c3a'], [1, '#1e3358']]);
      stars(ctx, rand, 120, now);
      // Aurora ribbons
      ctx.save();
      for (let a = 0; a < 3; a++) {
        ctx.beginPath();
        ctx.moveTo(0, 90 + a * 42);
        for (let x = 0; x <= CANVAS_WIDTH; x += 24) {
          ctx.lineTo(x, 90 + a * 42 + Math.sin(now / 1500 + x / 55 + a * 2) * 20);
        }
        ctx.strokeStyle = ['rgba(120,255,190,0.22)', 'rgba(120,190,255,0.2)', 'rgba(190,120,255,0.16)'][a];
        ctx.lineWidth = 16;
        ctx.stroke();
      }
      ctx.restore();
      // Snowy hills
      for (let i = 0; i < 6; i++) {
        const x = (i / 5) * CANVAS_WIDTH + (rand() - 0.5) * 40;
        ctx.fillStyle = i % 2 ? '#2b3c5e' : '#334568';
        ctx.beginPath();
        ctx.ellipse(x, HORIZON_Y + 8, 70 + rand() * 70, 26 + rand() * 32, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      // Bare trees
      ctx.strokeStyle = '#1a2436';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const x = rand() * CANVAS_WIDTH;
        const h = 18 + rand() * 18;
        ctx.beginPath();
        ctx.moveTo(x, HORIZON_Y + 4);
        ctx.lineTo(x, HORIZON_Y + 4 - h);
        ctx.moveTo(x, HORIZON_Y + 4 - h * 0.65);
        ctx.lineTo(x - 7, HORIZON_Y + 4 - h);
        ctx.moveTo(x, HORIZON_Y + 4 - h * 0.5);
        ctx.lineTo(x + 7, HORIZON_Y + 4 - h * 0.85);
        ctx.stroke();
      }
      ground(ctx, [[0, '#c9d8e8'], [0.4, '#dce8f2'], [1, '#9fb2c6']]);
      // Drifts
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 12; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 30 + rand() * 110;
        ctx.beginPath();
        ctx.ellipse(x, y, 20 + rand() * 40, 4 + rand() * 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'suburb': {
      sky(ctx, [[0, '#0a0f24'], [0.6, '#1a2144'], [1, '#39335e']]);
      stars(ctx, rand, 55, now);
      moon(ctx, 60, 60, 16, '#f0ead6', 'rgba(250,245,215,0.28)');
      // Houses with lit windows
      for (let i = 0; i < 5; i++) {
        const w = 56 + rand() * 34;
        const x = i * 84 - 20 + rand() * 16;
        const h = 44 + rand() * 24;
        const top = HORIZON_Y + 6 - h;
        ctx.fillStyle = '#161d33';
        ctx.fillRect(x, top, w, h);
        ctx.beginPath();
        ctx.moveTo(x - 5, top);
        ctx.lineTo(x + w / 2, top - 18);
        ctx.lineTo(x + w + 5, top);
        ctx.closePath();
        ctx.fill();
        for (let k = 0; k < 3; k++) {
          const lit = rand() > 0.42;
          ctx.fillStyle = lit ? 'rgba(255,214,120,0.85)' : 'rgba(40,50,74,0.9)';
          ctx.fillRect(x + 8 + k * 20, top + 14, 11, 11);
        }
      }
      ground(ctx, [[0, '#21402c'], [0.45, '#2b5134'], [1, '#17301e']]);
      // Street lamp casting a pool of light
      ctx.strokeStyle = '#2b3348';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(340, HORIZON_Y + 46);
      ctx.lineTo(340, HORIZON_Y - 26);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,140,0.9)';
      ctx.beginPath();
      ctx.ellipse(340, HORIZON_Y - 28, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const pool = ctx.createRadialGradient(340, HORIZON_Y + 60, 4, 340, HORIZON_Y + 60, 72);
      pool.addColorStop(0, 'rgba(255,220,140,0.2)');
      pool.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(340, HORIZON_Y + 60, 72, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      grassTufts(ctx, rand, 50, 'rgba(150,205,150,0.3)');
      break;
    }

    case 'pumpkin': {
      sky(ctx, [[0, '#160a1e'], [0.55, '#33142c'], [1, '#6b2f2a']]);
      stars(ctx, rand, 60, now);
      moon(ctx, 310, 74, 24, '#f7cf8a', 'rgba(250,190,110,0.36)');
      // Barn
      ctx.fillStyle = '#2a1118';
      ctx.fillRect(40, HORIZON_Y - 58, 96, 62);
      ctx.beginPath();
      ctx.moveTo(34, HORIZON_Y - 58);
      ctx.lineTo(88, HORIZON_Y - 84);
      ctx.lineTo(142, HORIZON_Y - 58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,214,120,0.75)';
      ctx.fillRect(80, HORIZON_Y - 46, 16, 14);
      pines(ctx, rand, 5, '#1b0f1c', 16, 30);
      ground(ctx, [[0, '#4a3a20'], [0.4, '#5a4726'], [1, '#2c2213']]);
      // Dead stalks
      ctx.strokeStyle = 'rgba(120,96,50,0.6)';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 30; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 18 + rand() * 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 8, y - 14 - rand() * 12);
        ctx.stroke();
      }
      // Pumpkins
      for (let i = 0; i < 16; i++) {
        const x = rand() * CANVAS_WIDTH;
        const y = HORIZON_Y + 36 + rand() * 130;
        const r = 5 + rand() * 6;
        ctx.fillStyle = '#d2691e';
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,58,16,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.8);
        ctx.lineTo(x, y + r * 0.8);
        ctx.stroke();
        ctx.strokeStyle = '#3f6128';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.8);
        ctx.lineTo(x + 2, y - r * 0.8 - 4);
        ctx.stroke();
      }
      break;
    }

    case 'canyon': {
      sky(ctx, [[0, '#07061a'], [0.6, '#1b0f2e'], [1, '#3a1a33']]);
      stars(ctx, rand, 90, now, 300);
      moon(ctx, 196, 54, 15, '#ece2cc', 'rgba(250,240,215,0.28)');
      // Canyon walls down either edge. They stay narrow on purpose: the saucer
      // works the middle of the field, so the walls frame the action instead of
      // covering it.
      for (const side of [0, 1]) {
        const base = side === 0 ? 0 : CANVAS_WIDTH;
        const dir = side === 0 ? 1 : -1;
        // Back wall, then a darker near wall slightly inset.
        for (const [w0, w1, color] of [[26, 18, '#4c2630'], [16, 12, '#361822']] as const) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(base, 0);
          ctx.lineTo(base + dir * (w0 + rand() * w1), 0);
          for (let y = 50; y <= HORIZON_Y + 50; y += 50) {
            ctx.lineTo(base + dir * (w0 + rand() * w1), y);
          }
          ctx.lineTo(base, HORIZON_Y + 70);
          ctx.closePath();
          ctx.fill();
        }
      }
      // A distant butte on the skyline, well above where anyone stands.
      ctx.fillStyle = '#2e1620';
      ctx.beginPath();
      ctx.moveTo(130, HORIZON_Y + 4);
      ctx.lineTo(152, HORIZON_Y - 58);
      ctx.lineTo(248, HORIZON_Y - 58);
      ctx.lineTo(272, HORIZON_Y + 4);
      ctx.closePath();
      ctx.fill();
      ground(ctx, [[0, '#6b4430'], [0.4, '#7c5138'], [1, '#3e2819']]);
      // Strata lines on the floor
      ctx.strokeStyle = 'rgba(60,36,22,0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = HORIZON_Y + 20 + i * 24;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= CANVAS_WIDTH; x += 50) {
          ctx.quadraticCurveTo(x + 25, y + (rand() - 0.5) * 8, x + 50, y);
        }
        ctx.stroke();
      }
      break;
    }

    case 'driveIn': {
      sky(ctx, [[0, '#06091c'], [0.6, '#131a36'], [1, '#2a2b4c']]);
      stars(ctx, rand, 85, now);
      // The screen, glowing
      const sx = 96;
      const sy = HORIZON_Y - 150;
      ctx.fillStyle = '#3c4152';
      ctx.fillRect(sx - 6, sy - 6, 220, 118);
      const screen = ctx.createLinearGradient(0, sy, 0, sy + 106);
      screen.addColorStop(0, '#dfe4f0');
      screen.addColorStop(1, '#a9b2cc');
      ctx.fillStyle = screen;
      ctx.fillRect(sx, sy, 208, 106);
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(now / 420);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, 208, 106);
      ctx.restore();
      // Support legs
      ctx.fillStyle = '#2b3042';
      ctx.fillRect(sx + 24, sy + 112, 8, 42);
      ctx.fillRect(sx + 176, sy + 112, 8, 42);
      ground(ctx, [[0, '#4a4654'], [0.4, '#565266'], [1, '#2e2c38']]);
      // Parked cars facing the screen
      for (let i = 0; i < 5; i++) {
        const x = 24 + i * 78 + rand() * 18;
        const y = HORIZON_Y + 30 + rand() * 24;
        ctx.fillStyle = ['#8a5f6e', '#5f7f9c', '#9c6a4a', '#5d8a68', '#7a6aa8'][i];
        ctx.beginPath();
        ctx.roundRect(x - 20, y - 9, 40, 12, 3);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x - 11, y - 17, 22, 9, 3);
        ctx.fill();
        // Windscreen catching the glow off the screen
        ctx.fillStyle = 'rgba(220, 235, 255, 0.4)';
        ctx.fillRect(x - 9, y - 15, 18, 5);
        ctx.fillStyle = 'rgba(255,230,160,0.55)';
        ctx.beginPath();
        ctx.arc(x - 20, y - 3, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

/** Deterministic particle field, animated by wrapping on `now`. */
function particles(
  count: number,
  seed: number,
  now: number,
  speed: number,
  drift: number,
  spanY: number
): { x: number; y: number; r: number }[] {
  const rand = seeded(seed);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x0 = rand() * (CANVAS_WIDTH + 120) - 60;
    const y0 = rand() * spanY;
    const r = rand();
    const y = (y0 + now * speed * (0.6 + r * 0.8)) % spanY;
    const x = x0 + drift * y + Math.sin(now / 900 + i) * (drift === 0 ? 6 : 2);
    out.push({ x: ((x % (CANVAS_WIDTH + 120)) + CANVAS_WIDTH + 120) % (CANVAS_WIDTH + 120) - 60, y, r });
  }
  return out;
}

/**
 * Draw the weather over the scene. `wind` is the live gust strength the game
 * already tracks (-1..1); gusty weathers lean their particles into it so the
 * rescue mechanic reads visually.
 */
export function drawWeather(
  ctx: CanvasRenderingContext2D,
  weather: Weather,
  now: number,
  wind: number
): void {
  ctx.save();
  switch (weather) {
    case 'clear':
      break;

    // Wind has no ambient layer of its own: the game draws the live gust (and
    // its label) directly, since that is a mechanic and not just atmosphere.
    case 'wind':
      break;

    case 'rain': {
      ctx.strokeStyle = 'rgba(165, 200, 235, 0.45)';
      ctx.lineWidth = 1.2;
      const slant = 3 + wind * 10;
      for (const p of particles(150, 7703, now, 0.9, 0, CANVAS_HEIGHT)) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + slant, p.y + 12 + p.r * 8);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20, 40, 70, 0.18)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      break;
    }

    case 'storm': {
      ctx.strokeStyle = 'rgba(175, 205, 240, 0.55)';
      ctx.lineWidth = 1.4;
      const slant = 6 + wind * 18;
      for (const p of particles(200, 8807, now, 1.35, 0, CANVAS_HEIGHT)) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + slant, p.y + 16 + p.r * 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(12, 22, 46, 0.3)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      // Lightning: a bright flash on a slow irregular cycle, with a bolt.
      const cycle = now % 5200;
      if (cycle < 160) {
        const strength = cycle < 70 ? 0.5 : 0.22;
        ctx.fillStyle = `rgba(220, 232, 255, ${strength})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const bolt = seeded(Math.floor(now / 5200) + 1);
        let bx = 60 + bolt() * (CANVAS_WIDTH - 120);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        for (let y = 24; y < HORIZON_Y - 40; y += 30) {
          bx += (bolt() - 0.5) * 42;
          ctx.lineTo(bx, y);
        }
        ctx.stroke();
      }
      break;
    }

    case 'snow': {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (const p of particles(130, 9901, now, 0.07, 0, CANVAS_HEIGHT)) {
        const sway = Math.sin(now / 700 + p.x) * 8 + wind * 22;
        ctx.globalAlpha = 0.35 + p.r * 0.5;
        ctx.beginPath();
        ctx.arc(p.x + sway, p.y, 1 + p.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'fog': {
      // Slow banks drifting across the field, thickest near the ground.
      for (let i = 0; i < 5; i++) {
        const y = HORIZON_Y - 30 + i * 36;
        const x = ((now / (22 + i * 9)) % (CANVAS_WIDTH + 400)) - 200;
        const g = ctx.createLinearGradient(x - 200, 0, x + 200, 0);
        g.addColorStop(0, 'rgba(190, 205, 225, 0)');
        g.addColorStop(0.5, `rgba(190, 205, 225, ${0.1 + i * 0.045})`);
        g.addColorStop(1, 'rgba(190, 205, 225, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, 200, 22 + i * 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(180, 195, 215, 0.12)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      break;
    }

    case 'meteors': {
      // A handful of streaks on staggered cycles, each burning out before the
      // next begins so the sky never looks busy.
      for (let i = 0; i < 4; i++) {
        const period = 2600 + i * 900;
        const t = ((now + i * 1300) % period) / period;
        if (t > 0.38) continue;
        const r = seeded(Math.floor((now + i * 1300) / period) * 17 + i * 31);
        const sx = r() * CANVAS_WIDTH;
        const sy = r() * 120;
        const len = 70 + r() * 70;
        const ang = 0.5 + r() * 0.35;
        const p = t / 0.38;
        const hx = sx + Math.cos(ang) * 280 * p;
        const hy = sy + Math.sin(ang) * 280 * p;
        const tailX = hx - Math.cos(ang) * len;
        const tailY = hy - Math.sin(ang) * len;
        const fade = 1 - p;
        const g = ctx.createLinearGradient(hx, hy, tailX, tailY);
        g.addColorStop(0, `rgba(255, 240, 200, ${(0.95 * fade).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 180, 120, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Round caption
// ---------------------------------------------------------------------------

/** How long the location/weather caption stays on screen, in ms. */
export const CAPTION_MS = 2600;

/**
 * Opacity of the caption given how long it has left: a quick fade in, a hold,
 * then a slower fade out. Returns 0 once it has expired.
 */
export function captionAlpha(msLeft: number): number {
  if (msLeft <= 0 || msLeft > CAPTION_MS) return 0;
  const age = CAPTION_MS - msLeft;
  return Math.max(0, Math.min(1, Math.min(age / 300, msLeft / 600)));
}

/** The "where and what" title card shown at the top of each round. */
export function drawSceneCaption(
  ctx: CanvasRenderingContext2D,
  loc: LocationId,
  weather: Weather,
  alpha: number
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  ctx.font = 'bold 17px system-ui, sans-serif';
  const place = LOCATION_LABELS[loc];
  ctx.strokeText(place, CANVAS_WIDTH / 2, 36);
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(place, CANVAS_WIDTH / 2, 36);
  ctx.font = '13px system-ui, sans-serif';
  const sky = WEATHER_LABELS[weather];
  ctx.strokeText(sky, CANVAS_WIDTH / 2, 56);
  ctx.fillStyle = 'rgba(190,205,240,0.95)';
  ctx.fillText(sky, CANVAS_WIDTH / 2, 56);
  ctx.restore();
}
