import { useEffect, useRef } from 'react';
import type { Ship } from './battleshipPlacement';
import type { RoundState, ShotResult } from './battleshipTargeting';
import './BattleshipGrid.css';

export type Visibility = 'hidden' | 'ghosted' | 'visible';

interface Props {
  stateRef: React.MutableRefObject<RoundState | null>;
  /** Snapshot of ships for the legend (avoids reading stateRef during render). */
  ships: Ship[];
  visibility: Visibility;
  bannerName: string | null;
  /** Bumped by the wrapper after each shot to trigger a redraw. */
  frameKey: number;
}

const MAX_CANVAS = 640;
const MIN_CELL = 24;

function cellPx(gridSize: number): number {
  return Math.max(MIN_CELL, Math.floor(MAX_CANVAS / gridSize));
}

function drawGrid(ctx: CanvasRenderingContext2D, gridSize: number, cell: number) {
  ctx.fillStyle = '#0a2540';
  ctx.fillRect(0, 0, gridSize * cell, gridSize * cell);
  ctx.strokeStyle = '#143a66';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, gridSize * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(gridSize * cell, i * cell);
    ctx.stroke();
  }
}

function drawShipBody(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  cell: number,
  alpha: number,
  fillColor: string
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;
  for (const c of ship.cells) {
    ctx.fillRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  ctx.strokeStyle = ship.color;
  ctx.lineWidth = 2;
  for (const c of ship.cells) {
    ctx.strokeRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
  }
  ctx.restore();
}

function drawShips(
  ctx: CanvasRenderingContext2D,
  ships: Ship[],
  cell: number,
  visibility: Visibility
) {
  for (const ship of ships) {
    if (ship.sunk) {
      drawShipBody(ctx, ship, cell, 0.85, ship.color);
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      for (const c of ship.cells) {
        ctx.beginPath();
        ctx.moveTo(c.x * cell + 4, c.y * cell + 4);
        ctx.lineTo((c.x + 1) * cell - 4, (c.y + 1) * cell - 4);
        ctx.moveTo((c.x + 1) * cell - 4, c.y * cell + 4);
        ctx.lineTo(c.x * cell + 4, (c.y + 1) * cell - 4);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (visibility === 'visible') {
      drawShipBody(ctx, ship, cell, 0.9, ship.color);
    } else if (visibility === 'ghosted') {
      drawShipBody(ctx, ship, cell, 0.25, ship.color);
    }
  }
}

function drawShots(
  ctx: CanvasRenderingContext2D,
  shots: ShotResult[],
  ships: Ship[],
  cell: number,
  visibility: Visibility
) {
  for (const shot of shots) {
    for (const c of shot.misses) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, cell * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const c of shot.hits) {
      if (visibility === 'hidden') {
        const ship = ships.find((s) =>
          s.cells.some((sc) => sc.x === c.x && sc.y === c.y)
        );
        if (ship) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = ship.color;
          ctx.fillRect(c.x * cell + 2, c.y * cell + 2, cell - 4, cell - 4);
          ctx.restore();
        }
      }
      ctx.save();
      ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.beginPath();
      ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const cx = c.x * cell + cell / 2;
      const cy = c.y * cell + cell / 2;
      const r = cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Most-recent broadside / depth-charge afterglow on top.
  if (shots.length > 0) {
    const last = shots[shots.length - 1];
    if (last.type !== 'cannon') {
      ctx.save();
      ctx.strokeStyle = last.type === 'broadside' ? '#ffd166' : '#ff6b6b';
      ctx.lineWidth = 2;
      for (const c of last.cells) {
        ctx.strokeRect(c.x * cell + 1, c.y * cell + 1, cell - 2, cell - 2);
      }
      ctx.restore();
    }
  }
}

export function BattleshipGrid({
  stateRef,
  ships,
  visibility,
  bannerName,
  frameKey,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const cell = cellPx(state.gridSize);
    const dim = state.gridSize * cell;
    if (canvas.width !== dim) canvas.width = dim;
    if (canvas.height !== dim) canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGrid(ctx, state.gridSize, cell);
    drawShips(ctx, state.ships, cell, visibility);
    drawShots(ctx, state.shots, state.ships, cell, visibility);
  }, [frameKey, visibility, stateRef]);

  return (
    <div className="battleship-grid-wrap">
      <div className="battleship-canvas-host">
        <canvas ref={canvasRef} className="battleship-canvas" />
        {bannerName && (
          <div className="battleship-banner">💥 {bannerName} sunk! 💥</div>
        )}
      </div>
      <div className="battleship-legend">
        {ships.map((s: Ship) => (
          <span
            key={s.id}
            className={`battleship-legend-chip${s.sunk ? ' sunk' : ''}`}
          >
            <span
              className="battleship-legend-swatch"
              style={{ background: s.color }}
            />
            {s.entryName}
          </span>
        ))}
      </div>
    </div>
  );
}
