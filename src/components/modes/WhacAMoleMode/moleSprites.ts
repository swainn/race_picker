/**
 * Art for Whac-a-Mole: the fairground board, the holes cut into it, the moles
 * that bob out of them and the mallet that comes down.
 *
 * Everything is drawn in board space (the same coordinates `layoutHoles`
 * returns), so the caller only has to say where and how far up.
 */
import { WHAC } from './moleEngine';

function lighten(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount);
  };
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

function darken(color: string, amount = 0.35): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const to = (i: number) =>
    Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)));
  return `rgb(${to(0)}, ${to(2)}, ${to(4)})`;
}

/** The cabinet, the grass playfield and the marquee behind everything. */
export function drawBoard(ctx: CanvasRenderingContext2D, now: number): void {
  // Sky behind the booth
  const sky = ctx.createLinearGradient(0, 0, 0, WHAC.CANVAS_H);
  sky.addColorStop(0, '#1b3b2a');
  sky.addColorStop(1, '#0d2017');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WHAC.CANVAS_W, WHAC.CANVAS_H);

  // Cabinet shell
  ctx.fillStyle = '#7a3b22';
  ctx.beginPath();
  ctx.roundRect(16, 16, WHAC.CANVAS_W - 32, WHAC.CANVAS_H - 32, 18);
  ctx.fill();
  ctx.fillStyle = '#5d2c19';
  ctx.beginPath();
  ctx.roundRect(16, WHAC.CANVAS_H - 76, WHAC.CANVAS_W - 32, 60, 18);
  ctx.fill();

  // Marquee
  ctx.fillStyle = '#1f1208';
  ctx.beginPath();
  ctx.roundRect(60, 28, WHAC.CANVAS_W - 120, 38, 9);
  ctx.fill();
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 23px "Arial Black", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WHAC-A-MOLE', WHAC.CANVAS_W / 2, 48);
  // Chase lights, same trick as the other cabinets.
  for (let i = 0; i < 18; i++) {
    const lit = (i + Math.floor(now / 180)) % 3 !== 0;
    ctx.fillStyle = lit ? '#ffe98a' : 'rgba(255,233,138,0.22)';
    ctx.beginPath();
    ctx.arc(64 + i * ((WHAC.CANVAS_W - 128) / 17), 24, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grass playfield the holes are cut into
  const pad = 22;
  const grass = ctx.createLinearGradient(0, WHAC.BOARD_TOP - pad, 0, WHAC.BOARD_BOTTOM + pad);
  grass.addColorStop(0, '#3f8f45');
  grass.addColorStop(1, '#27622f');
  ctx.fillStyle = grass;
  ctx.beginPath();
  ctx.roundRect(
    WHAC.BOARD_L - pad,
    WHAC.BOARD_TOP - pad,
    WHAC.BOARD_R - WHAC.BOARD_L + pad * 2,
    WHAC.BOARD_BOTTOM - WHAC.BOARD_TOP + pad * 2,
    14
  );
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Tufts of grass, laid out deterministically so they do not shimmer.
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const gx = WHAC.BOARD_L - pad + ((i * 97) % (WHAC.BOARD_R - WHAC.BOARD_L + pad * 2));
    const gy = WHAC.BOARD_TOP - pad + ((i * 53) % (WHAC.BOARD_BOTTOM - WHAC.BOARD_TOP + pad * 2));
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + 2, gy - 6);
    ctx.stroke();
  }
}

/** The dirt mound and the dark mouth of one hole. Drawn before its mole. */
export function drawHole(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  // Mound of loose dirt around the rim
  ctx.fillStyle = '#6b4a2c';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, WHAC.HOLE_RX + 9, WHAC.HOLE_RY + 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // The hole itself
  ctx.fillStyle = '#17110a';
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX, WHAC.HOLE_RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The front lip of the hole, drawn *after* the mole so the mole reads as
 * coming out of the ground rather than standing on it.
 */
export function drawHoleRim(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = '#8a6239';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX, WHAC.HOLE_RY, 0, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}

export interface MoleOptions {
  /** 0 = hidden in the hole, 1 = fully up. */
  pop: number;
  /** Idle wobble phase. */
  phase: number;
  /** 0..1 alarm — eyes widen and the mole cringes as the mallet looms. */
  alarm: number;
  /** True from the moment of impact: flattened, X eyes, stars. */
  hit: boolean;
  /** Dim the moles that have already been knocked out. */
  ghost?: boolean;
  /** Milliseconds since impact, for the stars and the squash recovery. */
  sinceHit?: number;
}

/**
 * One mole, with the hole's centre at local (0, 0). The caller is expected to
 * have clipped to the hole mouth, so the lower half simply disappears.
 */
export function drawMole(
  ctx: CanvasRenderingContext2D,
  color: string,
  initials: string,
  o: MoleOptions
): void {
  const fur = color;
  const belly = lighten(color, 0.5);
  const shade = darken(color, 0.42);

  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.2;

  // How far down in the hole the mole is sitting, plus a little idle wobble.
  const sink = (1 - o.pop) * WHAC.MOLE_RISE;
  const wobble = o.hit ? 0 : Math.sin(o.phase) * 1.6 * o.pop;
  ctx.translate(wobble, sink);

  // A whacked mole is driven down into the hole and squashed flat.
  if (o.hit) {
    const t = Math.min(1, (o.sinceHit ?? 0) / 320);
    ctx.translate(0, 12 * (1 - t) + 10 * t);
    ctx.scale(1 + 0.22 * (1 - t), 0.62 + 0.18 * t);
  } else if (o.alarm > 0) {
    // Cringe: pull the head down into the shoulders a touch.
    ctx.translate(0, o.alarm * 3);
  }

  // Ears
  ctx.fillStyle = shade;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 17, -42, 5.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body/head — one rounded blob, which is how the arcade ones look.
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -24, 24, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Paws gripping the rim
  ctx.fillStyle = shade;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 21, -2, 7.5, 5, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Muzzle, with the participant's initials on it like a name badge.
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, -15, 15, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(color, 0.65);
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials.slice(0, 3), 0, -13);

  // Nose
  ctx.fillStyle = '#e8718b';
  ctx.beginPath();
  ctx.ellipse(0, -24, 4, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes — round and widening with alarm, crossed out once hit.
  const eyeR = 4.2 + o.alarm * 1.4;
  for (const ex of [-9, 9]) {
    if (o.hit) {
      ctx.strokeStyle = '#20222a';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 4, -38);
      ctx.lineTo(ex + 4, -30);
      ctx.moveTo(ex + 4, -38);
      ctx.lineTo(ex - 4, -30);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f8f8f4';
      ctx.beginPath();
      ctx.arc(ex, -34, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20222a';
      ctx.beginPath();
      ctx.arc(ex, -34 + o.alarm * 0.8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Whiskers
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 1.1;
  for (const side of [-1, 1]) {
    for (const dy of [-18, -14]) {
      ctx.beginPath();
      ctx.moveTo(side * 12, dy);
      ctx.lineTo(side * 24, dy - 3);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Stars spinning over a mole that just took the hit. */
export function drawStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sinceHit: number
): void {
  const t = Math.min(1, sinceHit / 900);
  if (t >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = '#ffe66d';
  for (let i = 0; i < 3; i++) {
    const a = (sinceHit / 220) + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 24;
    const sy = y - 54 - t * 12 + Math.sin(a) * 8;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? 6 : 2.6;
      const pa = (p / 10) * Math.PI * 2 - Math.PI / 2;
      const px = sx + Math.cos(pa) * r;
      const py = sy + Math.sin(pa) * r;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The mallet. `(x, y)` is the centre of the head; `tilt` is the cock-back
 * angle in radians (0 = straight down on the hole, negative = wound up).
 */
/**
 * The mallet, drawn first-person: the player's own hammer reaching into frame.
 *
 * The head is a cylinder stood on end — flat striking face down, so it lands
 * squarely on a hole — and the handle comes off its side and runs down toward
 * the viewer's hands. The handle is a tapered quad rather than a stroked line:
 * widening as it approaches the camera is what sells the perspective, and a
 * constant-width line reads as a stick lying flat on the board instead. It
 * stops short of the bottom edge; the taper is what carries the perspective,
 * not the length.
 *
 * `x`/`y` is the point the head strikes, so the caller aims at a hole and the
 * geometry below hangs off that.
 *
 * `tilt` pivots the whole mallet about the FAR end of the handle — the grip,
 * where a hand would be — so cocking back lifts the cylinder end and leaves the
 * grip where it is. Rotating about the head instead (the obvious reading of
 * "rotate at x/y") swings the handle around a stationary cylinder, which looks
 * like the mallet is being waved by the wrong end.
 */
export function drawMallet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilt: number
): void {
  const FACE_DY = 12;   // keeps the striking face where the old sprite's was
  const RX = 31;        // cylinder radius
  const RY = 11;        // how deep the end caps look (the viewing angle)
  const H = 54;         // cylinder height

  // Where the handle ends, relative to the strike point: the grip, and the
  // pivot every swing turns about.
  const GRIP_X = 64;
  const GRIP_Y = 185;

  ctx.save();
  ctx.translate(x, y);
  ctx.translate(GRIP_X, GRIP_Y);
  ctx.rotate(tilt);
  ctx.translate(-GRIP_X, -GRIP_Y);

  const faceY = FACE_DY;
  const topY = faceY - H;
  /**
   * Where the handle enters the barrel. Sits below the midline: dead centre
   * reads too high once the top cap's bulge is counted as part of the
   * silhouette.
   */
  const SOCKET_Y = topY + H / 2 + 10;
  const SOCKET_R = 12;

  // ---- Head: a cylinder stood on end -----------------------------------
  // Goes down before the handle; see the note on the handle below.
  //
  // The view looks slightly DOWN on the mallet, so only the top cap is ever
  // visible. The underside is hidden behind the barrel: all that shows of it
  // is the near half of the bottom rim, curving down as the silhouette. An
  // ellipse drawn at the bottom too would show both ends of the cylinder at
  // once, which cannot happen on a solid object and makes it read as a
  // transparent tube.
  const barrel = ctx.createLinearGradient(-RX, 0, RX, 0);
  barrel.addColorStop(0, '#8e1f1b');
  barrel.addColorStop(0.38, '#e8443c');
  barrel.addColorStop(0.68, '#cf3731');
  barrel.addColorStop(1, '#7d1a17');
  ctx.fillStyle = barrel;
  ctx.beginPath();
  ctx.moveTo(-RX, topY);
  ctx.lineTo(-RX, faceY);
  // Near half of the bottom rim only — the far half is behind the barrel.
  ctx.ellipse(0, faceY, RX, RY, 0, Math.PI, 0, true);
  ctx.lineTo(RX, topY);
  ctx.closePath();
  ctx.fill();

  // A banded stripe around the barrel, the way these mallets are painted. It
  // follows the rim curvature so it wraps the cylinder instead of cutting
  // straight across it.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-RX, topY);
  ctx.lineTo(-RX, faceY);
  ctx.ellipse(0, faceY, RX, RY, 0, Math.PI, 0, true);
  ctx.lineTo(RX, topY);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.beginPath();
  ctx.ellipse(0, topY + H * 0.46, RX, RY, 0, 0, Math.PI);
  ctx.lineTo(-RX, topY + H * 0.46 + 11);
  ctx.ellipse(0, topY + H * 0.60, RX, RY, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();

  // The underside turning away from the light, hugging the bottom rim.
  const foot = ctx.createLinearGradient(0, faceY - 16, 0, faceY + RY);
  foot.addColorStop(0, 'rgba(0,0,0,0)');
  foot.addColorStop(1, 'rgba(0,0,0,0.33)');
  ctx.fillStyle = foot;
  ctx.fillRect(-RX, faceY - 16, RX * 2, RY + 16);
  ctx.restore();

  // The socket the handle seats into, dead centre of the barrel. Drawn with
  // the head so the shaft's rounded tip laps over it and reads as a round
  // handle sunk into a round hole rather than laid across the face.
  // Clipped to the barrel, so sitting this low cannot spill past the rim.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-RX, topY);
  ctx.lineTo(-RX, faceY);
  ctx.ellipse(0, faceY, RX, RY, 0, Math.PI, 0, true);
  ctx.lineTo(RX, topY);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#5e130f';
  ctx.beginPath();
  ctx.ellipse(0, SOCKET_Y, SOCKET_R, SOCKET_R * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, SOCKET_Y - 1, SOCKET_R * 0.74, SOCKET_R * 0.66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Top cap: the only face in view, and catching the light from above.
  const cap = ctx.createLinearGradient(0, topY - RY, 0, topY + RY);
  cap.addColorStop(0, '#ff7a72');
  cap.addColorStop(1, '#e04a42');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.ellipse(0, topY, RX, RY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // ---- Handle, running down toward the viewer --------------------------
  // Drawn AFTER the head, so the shaft laps over the cylinder and reads as
  // seated into it. Drawing it first instead leaves the cylinder sitting on
  // top of the joint, which looks like the handle merely ends at the head
  // rather than going into it.
  const nearX = GRIP_X;
  const nearY = GRIP_Y;
  // The shaft runs to the centre of the cylinder rather than stopping at its
  // face, so the join sits where the socket is.
  const farX = 0;
  const farY = SOCKET_Y;
  const farHalf = 8;
  const nearHalf = 17;
  const ang = Math.atan2(nearY - farY, nearX - farX);
  const nx = Math.sin(ang);
  const ny = -Math.cos(ang);

  const grad = ctx.createLinearGradient(farX, farY, nearX, nearY);
  grad.addColorStop(0, '#8a5526');
  grad.addColorStop(0.55, '#a86b36');
  grad.addColorStop(1, '#c0803f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(farX + nx * farHalf, farY + ny * farHalf);
  ctx.lineTo(nearX + nx * nearHalf, nearY + ny * nearHalf);
  ctx.lineTo(nearX - nx * nearHalf, nearY - ny * nearHalf);
  ctx.lineTo(farX - nx * farHalf, farY - ny * farHalf);
  ctx.closePath();
  ctx.fill();
  // Domed end, so the shaft reads as a round rod entering the hole rather
  // than a flat plank butted up against it.
  ctx.beginPath();
  ctx.arc(farX, farY, farHalf, 0, Math.PI * 2);
  ctx.fill();

  // Grip wrap at the near end, where the hands would be.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(farX + nx * farHalf, farY + ny * farHalf);
  ctx.lineTo(nearX + nx * nearHalf, nearY + ny * nearHalf);
  ctx.lineTo(nearX - nx * nearHalf, nearY - ny * nearHalf);
  ctx.lineTo(farX - nx * farHalf, farY - ny * farHalf);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = '#3f2614';
  ctx.lineWidth = 38;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(nearX - Math.cos(ang) * 54, nearY - Math.sin(ang) * 54);
  ctx.lineTo(nearX + Math.cos(ang) * 18, nearY + Math.sin(ang) * 18);
  ctx.stroke();
  ctx.restore();


  ctx.restore();
}

/** A ring of dust kicked up where the mallet landed. */
export function drawImpactDust(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sinceHit: number
): void {
  const t = Math.min(1, sinceHit / 420);
  if (t >= 1) return;
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.55;
  ctx.strokeStyle = '#d8c6a4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, WHAC.HOLE_RX + 10 + t * 34, WHAC.HOLE_RY + 6 + t * 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
