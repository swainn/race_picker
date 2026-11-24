import { OBSTACLES, YARD } from './turkeyEngine';

/**
 * Canvas drawing for Turkey Escape, seen from straight above. Everything here
 * is pure painting: the caller decides where things are and what state they
 * are in. Nothing uses `shadowBlur`, so nothing needs the canvas scale.
 */

const TAU = Math.PI * 2;

/** Half the width of the gap the gate closes. */
const GATE_HALF = 38;

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

/** A stable 0..1 value per index, so scenery does not reshuffle every frame. */
function scatter(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const LEAF_COLORS = ['#c8642a', '#d99a2b', '#a8412a', '#e0b545', '#8a5a2b'];

/** The barn, the grass, the fence and the gate. `gateOpen` runs 0 (shut) to 1. */
export function drawYard(ctx: CanvasRenderingContext2D, now: number, gateOpen: number): void {
  const W = YARD.CANVAS_W;
  const H = YARD.CANVAS_H;

  // Autumn grass
  const grass = ctx.createLinearGradient(0, YARD.T, 0, H);
  grass.addColorStop(0, '#6f8f3a');
  grass.addColorStop(1, '#55742c');
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, W, H);

  // Worn patches, so the yard is not one flat green
  ctx.fillStyle = 'rgba(160,130,70,0.16)';
  for (let i = 0; i < 9; i++) {
    const px = YARD.L + 40 + scatter(i, 1) * (YARD.R - YARD.L - 80);
    const py = YARD.T + 40 + scatter(i, 2) * (YARD.B - YARD.T - 80);
    ctx.beginPath();
    ctx.ellipse(px, py, 34 + scatter(i, 3) * 30, 16 + scatter(i, 4) * 14, scatter(i, 5) * Math.PI, 0, TAU);
    ctx.fill();
  }

  // Scattered leaves, stirring slightly
  for (let i = 0; i < 46; i++) {
    const lx = 8 + scatter(i, 6) * (W - 16);
    const ly = YARD.T + 6 + scatter(i, 7) * (H - YARD.T - 12);
    const rot = scatter(i, 8) * TAU + Math.sin(now / 900 + i) * 0.18;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The dirt track the farmer comes up, outside the gate
  ctx.fillStyle = '#9a7a4c';
  ctx.beginPath();
  ctx.moveTo(YARD.GATE_X - GATE_HALF + 4, YARD.B);
  ctx.lineTo(YARD.GATE_X + GATE_HALF - 4, YARD.B);
  ctx.lineTo(YARD.GATE_X + GATE_HALF + 14, H);
  ctx.lineTo(YARD.GATE_X - GATE_HALF - 14, H);
  ctx.closePath();
  ctx.fill();

  // The red barn across the top
  const barnH = YARD.T - 8;
  ctx.fillStyle = '#9e2b25';
  ctx.fillRect(0, 0, W, barnH);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  for (let x = 18; x < W; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, barnH);
    ctx.stroke();
  }
  // Roof edge and its shadow on the grass
  ctx.fillStyle = '#5c1a17';
  ctx.fillRect(0, barnH - 10, W, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, barnH, W, 6);
  // White-trimmed doors and hayloft windows
  ctx.strokeStyle = '#f3ead8';
  ctx.lineWidth = 3;
  const doorW = 96;
  const doorX = W / 2 - doorW / 2;
  ctx.fillStyle = '#7d211c';
  ctx.fillRect(doorX, 14, doorW, barnH - 24);
  ctx.strokeRect(doorX, 14, doorW, barnH - 24);
  ctx.beginPath();
  ctx.moveTo(doorX, 14);
  ctx.lineTo(doorX + doorW / 2, barnH - 10);
  ctx.lineTo(doorX + doorW, 14);
  ctx.moveTo(doorX + doorW / 2, 14);
  ctx.lineTo(doorX + doorW / 2, barnH - 10);
  ctx.stroke();
  for (const wx of [118, W - 118 - 44]) {
    ctx.fillStyle = '#3a1512';
    ctx.fillRect(wx, 20, 44, 30);
    ctx.strokeRect(wx, 20, 44, 30);
    ctx.beginPath();
    ctx.moveTo(wx + 22, 20);
    ctx.lineTo(wx + 22, 50);
    ctx.stroke();
  }

  drawFence(ctx, gateOpen);
}

function drawFence(ctx: CanvasRenderingContext2D, gateOpen: number): void {
  const gl = YARD.GATE_X - GATE_HALF;
  const gr = YARD.GATE_X + GATE_HALF;

  // Two rails round the yard, broken at the gate
  ctx.lineCap = 'round';
  for (const [color, width] of [['#6b4a2a', 6], ['#a57c4c', 3]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(gl, YARD.B);
    ctx.lineTo(YARD.L, YARD.B);
    ctx.lineTo(YARD.L, YARD.T);
    ctx.lineTo(YARD.R, YARD.T);
    ctx.lineTo(YARD.R, YARD.B);
    ctx.lineTo(gr, YARD.B);
    ctx.stroke();
  }

  // Posts
  const post = (x: number, y: number, big = false) => {
    const s = big ? 6 : 4.5;
    ctx.fillStyle = '#4f3620';
    ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = '#c29a66';
    ctx.fillRect(x - s + 1.5, y - s + 1.5, s * 2 - 3, s * 2 - 3);
  };
  const spanX = YARD.R - YARD.L;
  const spanY = YARD.B - YARD.T;
  for (let i = 0; i <= 12; i++) {
    const x = YARD.L + (spanX * i) / 12;
    post(x, YARD.T);
    // Leave the gateway itself clear of posts.
    if (x < gl - 8 || x > gr + 8) post(x, YARD.B);
  }
  for (let i = 1; i < 8; i++) {
    const y = YARD.T + (spanY * i) / 8;
    post(YARD.L, y);
    post(YARD.R, y);
  }
  post(gl, YARD.B, true);
  post(gr, YARD.B, true);

  // The gate, hinged on the left post and swinging out toward the viewer
  const open = Math.max(0, Math.min(1, gateOpen));
  ctx.save();
  ctx.translate(gl, YARD.B);
  ctx.rotate(open * 1.9);
  const len = GATE_HALF * 2 - 4;
  ctx.strokeStyle = '#4f3620';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.strokeStyle = '#d2ac74';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.fillStyle = '#4f3620';
  for (let x = 10; x < len; x += 14) ctx.fillRect(x - 1, -4.5, 2, 9);
  ctx.restore();
  ctx.lineCap = 'butt';
}

function drawHayBale(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(3, 4, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d9b24a';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // The coil of a round bale seen end-on
  ctx.strokeStyle = '#b08a2c';
  ctx.lineWidth = 1.6;
  for (let rr = r - 4; rr > 3; rr -= 5) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0.4, TAU - 0.3);
    ctx.stroke();
  }
  // Loose straw round the edge
  ctx.strokeStyle = '#ecd27a';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + scatter(i, x) * 0.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
    ctx.lineTo(Math.cos(a + 0.12) * (r + 2), Math.sin(a + 0.12) * (r + 2));
    ctx.stroke();
  }
  ctx.strokeStyle = '#8a6a1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPumpkin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(3, 4, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e07a1f';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // Ribs running out from the stem
  ctx.strokeStyle = '#b85a12';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.25) * r * 0.6, Math.sin(a + 0.25) * r * 0.6,
      Math.cos(a) * (r - 1), Math.sin(a) * (r - 1)
    );
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,220,150,0.25)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.35, r * 0.22, -0.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8f4208';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#4d6b23';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Hay bales and pumpkins, alternating down the obstacle list. */
export function drawObstacles(ctx: CanvasRenderingContext2D): void {
  OBSTACLES.forEach((o, i) => {
    if (i % 2 === 0) drawHayBale(ctx, o.x, o.y, o.r);
    else drawPumpkin(ctx, o.x, o.y, o.r);
  });
}

export interface TurkeyOptions {
  color: string;
  initials: string;
  avatar: HTMLImageElement | null;
  /** Radians. */
  heading: number;
  /** px/s, drives the leg and wing flap rate. */
  speed: number;
  /** 0..1 */
  panic: number;
  caught: boolean;
  now: number;
}

const TAIL_COLORS = ['#6b3d1e', '#a8672c', '#3d2414'];

export function drawTurkey(ctx: CanvasRenderingContext2D, x: number, y: number, o: TurkeyOptions): void {
  const R = YARD.BIRD_R;
  const panic = Math.max(0, Math.min(1, o.panic));
  const moving = o.caught ? 0 : Math.min(1, o.speed / 120);
  // Faster turkeys flap faster; a caught one has given up flapping.
  const flap = o.caught ? 0 : Math.sin(o.now / (110 - moving * 60) + x * 0.05) * (0.15 + moving * 0.5);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 3, R + 1, R - 1, 0, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.heading);
  if (o.caught) ctx.scale(0.92, 0.92);

  // Feet, paddling under the body when it runs
  if (moving > 0.05) {
    const kick = Math.sin(o.now / (95 - moving * 45) + y * 0.05) * 5 * moving;
    ctx.strokeStyle = '#d9912b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, side * 4);
      ctx.lineTo(4 + side * kick, side * 5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // The fanned tail, behind the body. It spreads wider in a panic.
  const spread = 1.0 + panic * 0.35;
  const feathers = 9;
  for (let i = 0; i < feathers; i++) {
    const a = Math.PI + ((i / (feathers - 1)) - 0.5) * 2 * spread;
    const len = R + 7 - Math.abs(i - (feathers - 1) / 2) * 0.6;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = TAIL_COLORS[i % TAIL_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(len * 0.6, 0, len * 0.5, 3.6, 0, 0, TAU);
    ctx.fill();
    // Pale tips
    ctx.fillStyle = '#ecd9b0';
    ctx.beginPath();
    ctx.ellipse(len * 1.02, 0, 2.2, 3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Wings either side
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-1, side * (R - 5));
    ctx.rotate(side * (0.25 + flap));
    ctx.fillStyle = '#5a3418';
    ctx.beginPath();
    ctx.ellipse(-2, side * 3, 8, 4.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Body, ringed in the participant's colour
  ctx.fillStyle = '#7a4a22';
  ctx.beginPath();
  ctx.ellipse(0, 0, R - 2, R - 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = o.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, R - 2, R - 3.5, 0, 0, TAU);
  ctx.stroke();

  // Beak and wattle, poking out ahead of the face
  ctx.fillStyle = '#e8a62c';
  ctx.beginPath();
  ctx.moveTo(R + 6, 0);
  ctx.lineTo(R - 1, -3);
  ctx.lineTo(R - 1, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d42a2a';
  ctx.beginPath();
  ctx.ellipse(R + 1, 3.5 + flap * 2, 2.4, 3.6, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();

  // The face sits at the front of the body but stays upright, so a photo or
  // initials are readable whichever way the turkey is running.
  const fr = 9;
  const fx = x + Math.cos(o.heading) * 5;
  const fy = y + Math.sin(o.heading) * 5;
  const photo = o.avatar && o.avatar.complete && o.avatar.naturalWidth > 0 ? o.avatar : null;

  if (photo) {
    // A black disc behind it: participant pictures are cut-outs, and the
    // turkey's body would otherwise show straight through the face.
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, TAU);
    ctx.clip();
    const scale = Math.max((fr * 2) / photo.naturalWidth, (fr * 2) / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, fx - w / 2, fy - h / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c120a';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.initials.slice(0, 3), fx, fy + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.strokeStyle = darken(o.color, 0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, TAU);
  ctx.stroke();

  // Sweat flying off a turkey that is really running for it
  if (panic > 0.5 && !o.caught) {
    ctx.fillStyle = 'rgba(200,235,255,0.85)';
    for (let i = 0; i < 2; i++) {
      const t = ((o.now / 380) + i * 0.5 + x * 0.01) % 1;
      const a = o.heading + Math.PI + (i === 0 ? 0.7 : -0.7);
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * (8 + t * 12), fy + Math.sin(a) * (8 + t * 12), 1.8 * (1 - t), 0, TAU);
      ctx.fill();
    }
  }
}

export interface FarmerOptions {
  heading: number;
  speed: number;
  pose: 'run' | 'dive' | 'down' | 'cheer';
  now: number;
}

/** The net on its pole, drawn in the farmer's own frame pointing along +x. */
function drawHeldNet(ctx: CanvasRenderingContext2D, reach: number): void {
  ctx.strokeStyle = '#7a5a34';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4, 9);
  ctx.lineTo(reach, 4);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.arc(reach + 9, 3, 10, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.8;
  for (let i = -8; i <= 8; i += 4) {
    const half = Math.sqrt(Math.max(0, 100 - i * i));
    ctx.beginPath();
    ctx.moveTo(reach + 9 + i, 3 - half);
    ctx.lineTo(reach + 9 + i, 3 + half);
    ctx.moveTo(reach + 9 - half, 3 + i);
    ctx.lineTo(reach + 9 + half, 3 + i);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3d3d3d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(reach + 9, 3, 10, 0, TAU);
  ctx.stroke();
}

export function drawFarmer(ctx: CanvasRenderingContext2D, x: number, y: number, o: FarmerOptions): void {
  const R = YARD.FARMER_R;
  const stride = Math.min(1, o.speed / 160);
  const swing = Math.sin(o.now / 80) * stride;
  const bounce = o.pose === 'cheer' ? Math.abs(Math.sin(o.now / 140)) : 0;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 4, R + 2 + (o.pose === 'dive' || o.pose === 'down' ? 8 : 0), R, o.heading, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.heading);
  const flat = o.pose === 'dive' || o.pose === 'down';

  // Boots
  ctx.fillStyle = '#3a2a1c';
  if (flat) {
    // Laid out behind him
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-R - 12, side * 5, 6, 3.4, 0, 0, TAU);
      ctx.fill();
    }
  } else {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * swing * 9, side * 6, 6, 3.6, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Legs of the overalls, only visible when he is stretched out
  if (flat) {
    ctx.fillStyle = '#2f5d9c';
    ctx.fillRect(-R - 10, -8, R + 6, 6.5);
    ctx.fillRect(-R - 10, 1.5, R + 6, 6.5);
  }

  // The net: carried ahead on the run, flung out on the dive, dropped when he
  // is down. In `cheer` it is over the turkey, so he holds nothing.
  if (o.pose === 'run') drawHeldNet(ctx, R + 8);
  if (o.pose === 'dive') drawHeldNet(ctx, R + 22);
  if (o.pose === 'down') {
    ctx.save();
    ctx.translate(R + 6, -12);
    ctx.rotate(-0.9);
    drawHeldNet(ctx, 10);
    ctx.restore();
  }

  // Arms
  ctx.strokeStyle = '#c9423a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (o.pose === 'cheer') {
    // Thrown wide and pumping
    for (const side of [-1, 1]) {
      ctx.moveTo(0, side * 9);
      ctx.lineTo(4 + bounce * 6, side * (R + 8 + bounce * 4));
    }
  } else if (flat) {
    for (const side of [-1, 1]) {
      ctx.moveTo(4, side * 9);
      ctx.lineTo(R + 12, side * 6);
    }
  } else {
    ctx.moveTo(0, 10);
    ctx.lineTo(R - 2, 8);
    ctx.moveTo(0, -10);
    ctx.lineTo(6 - swing * 8, -R + 1);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Hands
  ctx.fillStyle = '#f0c8a0';
  const hand = (hx: number, hy: number) => {
    ctx.beginPath();
    ctx.arc(hx, hy, 3.2, 0, TAU);
    ctx.fill();
  };
  if (o.pose === 'cheer') {
    hand(4 + bounce * 6, R + 8 + bounce * 4);
    hand(4 + bounce * 6, -(R + 8 + bounce * 4));
  } else if (flat) {
    hand(R + 12, 6);
    hand(R + 12, -6);
  } else {
    hand(R - 2, 8);
    hand(6 - swing * 8, -R + 1);
  }

  // Shoulders: blue overalls over a red shirt
  ctx.fillStyle = '#c9423a';
  ctx.beginPath();
  ctx.ellipse(flat ? -3 : 0, 0, flat ? 12 : 8.5, 13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2f5d9c';
  ctx.fillRect(flat ? -13 : -7, -7, flat ? 20 : 12, 14);
  ctx.fillStyle = '#e8c33c';
  ctx.beginPath();
  ctx.arc(flat ? -9 : -4, -5, 1.4, 0, TAU);
  ctx.arc(flat ? -9 : -4, 5, 1.4, 0, TAU);
  ctx.fill();

  // Straw hat. On the faceplant it has come off and lies ahead of him.
  const hatX = o.pose === 'down' ? R + 16 : flat ? 9 : 1;
  const hatY = o.pose === 'down' ? 10 : 0;
  if (o.pose === 'down') {
    // His head, hatless
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(9, 0, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8a5a2e';
    ctx.beginPath();
    ctx.arc(8, 0, 6.4, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
  }
  ctx.fillStyle = '#e3c26b';
  ctx.beginPath();
  ctx.arc(hatX, hatY, 12.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#b3923f';
  ctx.lineWidth = 1.2;
  for (let rr = 4; rr <= 12; rr += 4) {
    ctx.beginPath();
    ctx.arc(hatX, hatY, rr, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0d98a';
  ctx.beginPath();
  ctx.arc(hatX, hatY, 6.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8a3a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hatX, hatY, 6.5, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Stars circling a farmer who has just eaten dirt
  if (o.pose === 'down') {
    const hx = x + Math.cos(o.heading) * 9;
    const hy = y + Math.sin(o.heading) * 9;
    ctx.fillStyle = '#ffe66d';
    for (let i = 0; i < 3; i++) {
      const a = o.now / 260 + (i * TAU) / 3;
      drawStar(ctx, hx + Math.cos(a) * 15, hy + Math.sin(a) * 9 - 4, 3.6);
    }
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** A puff of dust. `t` runs 0 (just kicked up) to 1 (gone). */
export function drawDust(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t < 0 || t >= 1) return;
  ctx.save();
  ctx.globalAlpha = 0.55 * (1 - t);
  ctx.fillStyle = '#d8c39a';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    const d = 6 + t * 24;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 4 + t * 7, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Feathers knocked loose. `t` runs 0 to 1. */
export function drawFeathers(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t < 0 || t >= 1) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (1 - t) * 1.6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.9;
    // Burst out fast, then drift.
    const d = 8 + (1 - Math.pow(1 - t, 2)) * (22 + (i % 3) * 8);
    ctx.save();
    ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d + t * 6);
    ctx.rotate(a + t * 4 * (i % 2 === 0 ? 1 : -1));
    ctx.fillStyle = TAIL_COLORS[i % TAIL_COLORS.length];
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 2, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ecd9b0';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.lineTo(5.5, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** The net coming down over a turkey. `t` runs 0 (in the air) to 1 (landed). */
export function drawNet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const c = Math.max(0, Math.min(1, t));
  const r = (YARD.BIRD_R + 9) * (1.7 - 0.7 * c);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.65 * c;
  ctx.translate(x, y);

  // Pole, lying where it fell
  ctx.strokeStyle = '#7a5a34';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.7, r * 0.7);
  ctx.lineTo(r * 0.7 + 22, r * 0.7 + 22);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // Mesh, clipped to the hoop
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = -r * 2; i <= r * 2; i += 6) {
    ctx.moveTo(i, -r);
    ctx.lineTo(i + r * 2, r);
    ctx.moveTo(i, r);
    ctx.lineTo(i + r * 2, -r);
  }
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#3d3d3d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
