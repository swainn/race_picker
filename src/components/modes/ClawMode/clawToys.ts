/**
 * Art for The Claw: the little three-eyed toys and the claw that comes for
 * them. Everything is drawn with its anchor at the toy's feet, facing the
 * viewer, so the caller only has to place and scale it.
 */

export interface ToyOptions {
  /** 0..1 reverence — arms rise and eyes widen as the claw approaches. */
  awe: number;
  /** Idle bob phase. */
  phase: number;
  /** True once the claw has hold of it (legs dangle). */
  held: boolean;
  /** Dim the ones already taken away. */
  ghost?: boolean;
}

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

/** One toy, feet at (0, 0) in local space. */
export function drawAlienToy(
  ctx: CanvasRenderingContext2D,
  color: string,
  initials: string,
  o: ToyOptions
): void {
  const bob = o.held ? 0 : Math.sin(o.phase) * 1.2;
  ctx.save();
  ctx.translate(0, bob);
  if (o.ghost) ctx.globalAlpha = 0.22;

  const body = color;
  const belly = lighten(color, 0.45);
  const shade = darken(color, 0.4);

  // Feet — they dangle together once the claw has them.
  ctx.fillStyle = shade;
  const footSpread = o.held ? 3 : 6;
  const footY = o.held ? 1.5 : 0;
  ctx.beginPath();
  ctx.ellipse(-footSpread, footY, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(footSpread, footY, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arms — raised in reverence as the claw nears.
  const lift = o.awe;
  ctx.strokeStyle = body;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -17);
  ctx.lineTo(-13 - lift * 2, -19 - lift * 12);
  ctx.moveTo(8, -17);
  ctx.lineTo(13 + lift * 2, -19 - lift * 12);
  ctx.stroke();

  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -14, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Jumpsuit belly patch, with the initials on it
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, -10, 6.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darken(color, 0.62);
  ctx.font = 'bold 7px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials.slice(0, 3), 0, -9.5);

  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -28, 9.5, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Antenna
  ctx.strokeStyle = body;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.lineTo(1.5, -42);
  ctx.stroke();
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(1.8, -43, 2, 0, Math.PI * 2);
  ctx.fill();

  // Three eyes, widening with awe
  const r = 3 + o.awe * 0.7;
  for (const ex of [-5.2, 0, 5.2]) {
    ctx.fillStyle = '#f8f8f4';
    ctx.beginPath();
    ctx.arc(ex, -29, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20222a';
    ctx.beginPath();
    ctx.arc(ex, -29 + o.awe * 0.6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth — a small "oooooh" that opens with the awe
  ctx.fillStyle = darken(color, 0.55);
  ctx.beginPath();
  ctx.ellipse(0, -21.5, 1.6 + o.awe * 1.4, 1.2 + o.awe * 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * The claw on its cable, anchored at the rail. `open` is 0 (clamped shut) to 1
 * (spread wide); `y` is how far the claw head has descended from the rail.
 */
export function drawClaw(
  ctx: CanvasRenderingContext2D,
  x: number,
  railY: number,
  y: number,
  open: number
): void {
  ctx.save();

  // Cable
  ctx.strokeStyle = '#8a8f9c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, railY);
  ctx.lineTo(x, y - 12);
  ctx.stroke();

  // Housing
  ctx.fillStyle = '#c9ccd6';
  ctx.beginPath();
  ctx.roundRect(x - 11, y - 14, 22, 12, 3);
  ctx.fill();
  ctx.fillStyle = '#9aa0ad';
  ctx.fillRect(x - 11, y - 6, 22, 3);

  // Three prongs, hinging open
  const spread = 4 + open * 11;
  const tip = 20;
  ctx.strokeStyle = '#d7dae3';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 4, y - 2);
    ctx.lineTo(x + side * spread, y + tip * 0.55);
    ctx.lineTo(x + side * (spread * 0.62), y + tip);
    ctx.stroke();
  }
  // Centre prong, drawn shorter so the shape reads as three-fingered.
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x + open * 2, y + tip * 0.8);
  ctx.stroke();

  ctx.restore();
}
