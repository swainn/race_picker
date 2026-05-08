import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import type { SoundType } from './audio';
import { playTick } from './audio';
import './WheelGame.css';

interface WheelGameProps {
  entries: Entry[];
  isRacing: boolean;
  soundType: SoundType;
  onWinner: (entry: Entry) => void;
}

const CANVAS_WIDTH = 650;
const CANVAS_HEIGHT = 550;
const WHEEL_HEIGHT_RATIO = 0.8;
const WHEEL_WIDTH_RATIO = 0.5;
const SPIN_DURATION_MS = 4000;
const SPIN_ROTATIONS = 3;

const PALETTE = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#ffe66d',
  '#a8e6cf',
  '#ff8b94',
  '#c9b1ff',
  '#ffd3b6',
];
const DIVIDER_COLOR = '#1a1a1a';
const TEXT_COLOR = '#1a1a1a';
const THICKNESS_COLOR = '#2a2a2a';
const OUTLINE_COLOR = '#0f0f0f';
const CENTER_LINE_COLOR = '#ffffff';

function getEntryImage(entry: Entry): string | undefined {
  if (entry.imageDataUrls && entry.imageDataUrls.length > 0) {
    return entry.imageDataUrls[0];
  }
  return entry.imageDataUrl;
}

interface WheelGeometry {
  wheelWidth: number;
  wheelHeight: number;
  x: number;
  y: number;
  centerY: number;
  segHeight: number;
}

function geometryFor(entryCount: number): WheelGeometry {
  const wheelHeight = CANVAS_HEIGHT * WHEEL_HEIGHT_RATIO;
  const wheelWidth = CANVAS_WIDTH * WHEEL_WIDTH_RATIO;
  const x = (CANVAS_WIDTH - wheelWidth) / 2;
  const y = (CANVAS_HEIGHT - wheelHeight) / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const segHeight = entryCount > 0 ? wheelHeight / entryCount : 0;
  return { wheelWidth, wheelHeight, x, y, centerY, segHeight };
}

function getIndexAtCentre(entryCount: number, offset: number): number {
  if (entryCount === 0) return 0;
  const { wheelHeight, y, centerY, segHeight } = geometryFor(entryCount);
  const relativePos = centerY - y - offset;
  const normalizedPos = ((relativePos % wheelHeight) + wheelHeight) % wheelHeight;
  const index = Math.floor(normalizedPos / segHeight);
  return index % entryCount;
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  entries: Entry[],
  offset: number,
  images: Map<number, HTMLImageElement>
): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (entries.length === 0) return;

  const { wheelWidth, wheelHeight, x, y, centerY, segHeight } = geometryFor(entries.length);

  for (let i = 0; i < entries.length; i++) {
    const rawStart = y + i * segHeight + offset;
    const sy = (((rawStart - y) % wheelHeight) + wheelHeight) % wheelHeight + y;

    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(x, sy, wheelWidth, segHeight);

    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x + wheelWidth, sy);
    ctx.stroke();

    const entry = entries[i];
    const img = images.get(entry.id);
    const stripeMidY = sy + segHeight / 2;
    const fontSize = Math.min(20, Math.max(10, segHeight * 0.45));
    const padding = 8;

    if (img && img.complete && img.naturalWidth > 0) {
      const avatarSize = Math.min(segHeight - 6, 36);
      const avatarRadius = avatarSize / 2;
      const avatarCx = x + padding + avatarRadius;
      const avatarCy = stripeMidY;

      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCx, avatarCy, avatarRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        img,
        avatarCx - avatarRadius,
        avatarCy - avatarRadius,
        avatarSize,
        avatarSize
      );
      ctx.restore();

      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(avatarCx, avatarCy, avatarRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const textX = avatarCx + avatarRadius + padding;
      const maxTextWidth = x + wheelWidth - textX - padding;
      ctx.fillText(entry.name, textX, stripeMidY, Math.max(maxTextWidth, 20));
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.name, x + wheelWidth / 2, stripeMidY, wheelWidth - 2 * padding);
      ctx.restore();
    }
  }

  ctx.strokeStyle = DIVIDER_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + wheelHeight);
  ctx.lineTo(x + wheelWidth, y + wheelHeight);
  ctx.stroke();

  const thickness = wheelHeight * 0.08;
  ctx.fillStyle = THICKNESS_COLOR;
  ctx.fillRect(x, y - thickness, wheelWidth, thickness);
  ctx.fillRect(x, y + wheelHeight, wheelWidth, thickness);

  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, wheelWidth, wheelHeight);

  ctx.save();
  ctx.strokeStyle = CENTER_LINE_COLOR;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - 8, centerY);
  ctx.lineTo(x + wheelWidth + 8, centerY);
  ctx.stroke();

  ctx.strokeStyle = PALETTE[0];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 8, centerY);
  ctx.lineTo(x + wheelWidth + 8, centerY);
  ctx.stroke();

  ctx.fillStyle = PALETTE[0];
  ctx.beginPath();
  ctx.moveTo(x - 8, centerY - 8);
  ctx.lineTo(x + 6, centerY);
  ctx.lineTo(x - 8, centerY + 8);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + wheelWidth + 8, centerY - 8);
  ctx.lineTo(x + wheelWidth - 6, centerY);
  ctx.lineTo(x + wheelWidth + 8, centerY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function WheelGame({ entries, isRacing, soundType, onWinner }: WheelGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastTickIndexRef = useRef<number>(-1);
  const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  // Mirror props in refs so the long-lived RAF loop reads current values
  // without restarting the spin every render.
  const entriesRef = useRef<Entry[]>(entries);
  const soundTypeRef = useRef<SoundType>(soundType);
  const onWinnerRef = useRef(onWinner);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    soundTypeRef.current = soundType;
  }, [soundType]);

  useEffect(() => {
    onWinnerRef.current = onWinner;
  }, [onWinner]);

  // Pre-load avatar images so the draw loop never blocks on decode.
  useEffect(() => {
    const cache = imagesRef.current;
    const seenIds = new Set<number>();

    for (const entry of entries) {
      seenIds.add(entry.id);
      const src = getEntryImage(entry);
      if (!src) {
        cache.delete(entry.id);
        continue;
      }
      const existing = cache.get(entry.id);
      if (existing && existing.src === src) continue;

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) drawWheel(ctx, entriesRef.current, offsetRef.current, cache);
        }
      };
      img.onerror = () => {
        cache.delete(entry.id);
      };
      img.src = src;
      cache.set(entry.id, img);
    }

    for (const id of cache.keys()) {
      if (!seenIds.has(id)) cache.delete(id);
    }
  }, [entries]);

  // Static draw on entry / mount changes (when not spinning).
  useEffect(() => {
    if (rafRef.current !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawWheel(ctx, entries, offsetRef.current, imagesRef.current);
  }, [entries]);

  // Spin lifecycle.
  useEffect(() => {
    if (!isRacing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const liveEntries = entriesRef.current;
    if (liveEntries.length === 0) return;

    const winnerIndex = Math.floor(Math.random() * liveEntries.length);
    const { wheelHeight, y, centerY, segHeight } = geometryFor(liveEntries.length);
    const finalOffset = centerY - y - winnerIndex * segHeight - segHeight / 2;
    const targetOffset = finalOffset + SPIN_ROTATIONS * wheelHeight;
    const startOffset = offsetRef.current;
    const distance = targetOffset - startOffset;
    const startTime = performance.now();
    lastTickIndexRef.current = getIndexAtCentre(liveEntries.length, startOffset);

    let cancelled = false;

    const animate = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      offsetRef.current = startOffset + distance * easeOut;

      const currentIndex = getIndexAtCentre(liveEntries.length, offsetRef.current);
      if (currentIndex !== lastTickIndexRef.current) {
        lastTickIndexRef.current = currentIndex;
        playTick(soundTypeRef.current);
      }

      drawWheel(ctx, liveEntries, offsetRef.current, imagesRef.current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        offsetRef.current = ((finalOffset % wheelHeight) + wheelHeight) % wheelHeight;
        drawWheel(ctx, liveEntries, offsetRef.current, imagesRef.current);
        rafRef.current = null;
        lastTickIndexRef.current = -1;
        offsetRef.current = 0;
        onWinnerRef.current(liveEntries[winnerIndex]);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRacing]);

  return (
    <div className="wheel-game-root">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="wheel-canvas"
      />
    </div>
  );
}
