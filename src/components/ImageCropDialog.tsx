import { useEffect, useRef, useState } from 'react';
import type { ImageCrop } from '../types';
import {
  CROP_OUTPUT_PX,
  MIN_ZOOM,
  clampCrop,
  cropSourceRect,
} from '../utils/imageCrop';
import './ImageCropDialog.css';

/** Side of the square preview, in CSS px. */
const BOX = 300;

interface Props {
  /** The uncropped source to position the circle over. */
  src: string;
  crop: ImageCrop;
  /** Shown above the preview, e.g. "Ada — picture 2 of 3". */
  title: string;
  /** Label for the confirm button; differs for adding vs re-cropping. */
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (crop: ImageCrop, croppedDataUrl: string) => void;
}

/**
 * Position a circular crop over a picture.
 *
 * The preview shows the whole image with everything outside the circle dimmed,
 * so you can see what is being left out — and it renders through the same
 * `cropSourceRect` the final output uses, so the preview cannot drift from the
 * result.
 */
export function ImageCropDialog({ src, crop, title, confirmLabel = 'Save crop', onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [value, setValue] = useState<ImageCrop>(crop);
  const [ready, setReady] = useState(false);

  // Load the source once; everything else draws from it.
  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      imgRef.current = im;
      setReady(true);
      setValue((v) => clampCrop(v, im.naturalWidth, im.naturalHeight));
    };
    im.src = src;
    return () => {
      im.onload = null;
    };
  }, [src]);

  /** Where the image sits inside the square preview, letterboxed. */
  const layout = () => {
    const im = imgRef.current;
    if (!im) return null;
    const scale = Math.min(BOX / im.naturalWidth, BOX / im.naturalHeight);
    const w = im.naturalWidth * scale;
    const h = im.naturalHeight * scale;
    return { im, scale, w, h, ox: (BOX - w) / 2, oy: (BOX - h) / 2 };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const l = layout();
    if (!canvas || !l) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, BOX, BOX);
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, BOX, BOX);
    ctx.drawImage(l.im, l.ox, l.oy, l.w, l.h);

    const c = clampCrop(value, l.im.naturalWidth, l.im.naturalHeight);
    const r = (c.zoom * Math.min(l.w, l.h)) / 2;
    const dx = l.ox + c.cx * l.w;
    const dy = l.oy + c.cy * l.h;

    // Dim everything the crop leaves out. One fill only, and the style has to
    // be set before it — filling first would lay down the opaque background
    // colour and hide the picture outside the circle entirely.
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.58)';
    ctx.beginPath();
    ctx.rect(0, 0, BOX, BOX);
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.stroke();
  }, [value, ready]);

  const pointerToCrop = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const l = layout();
    if (!canvas || !l) return null;
    const rect = canvas.getBoundingClientRect();
    // The canvas is laid out at its intrinsic size, but guard anyway.
    const px = ((clientX - rect.left) / rect.width) * BOX;
    const py = ((clientY - rect.top) / rect.height) * BOX;
    return { px, py, l };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerToCrop(e.clientX, e.clientY);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: p.px, y: p.py, cx: value.cx, cy: value.cy };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const p = pointerToCrop(e.clientX, e.clientY);
    if (!d || !p) return;
    const im = p.l.im;
    setValue((v) =>
      clampCrop(
        { ...v, cx: d.cx + (p.px - d.x) / p.l.w, cy: d.cy + (p.py - d.y) / p.l.h },
        im.naturalWidth,
        im.naturalHeight
      )
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const setZoom = (zoom: number) => {
    const im = imgRef.current;
    if (!im) return;
    setValue((v) => clampCrop({ ...v, zoom }, im.naturalWidth, im.naturalHeight));
  };

  /** Render the circle's square of source pixels out at the stored size. */
  const confirm = () => {
    const im = imgRef.current;
    if (!im) return;
    const c = clampCrop(value, im.naturalWidth, im.naturalHeight);
    const { sx, sy, size } = cropSourceRect(c, im.naturalWidth, im.naturalHeight);
    const out = document.createElement('canvas');
    out.width = CROP_OUTPUT_PX;
    out.height = CROP_OUTPUT_PX;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(im, sx, sy, size, size, 0, 0, CROP_OUTPUT_PX, CROP_OUTPUT_PX);
    onConfirm(c, out.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="crop-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="crop-dialog__header">
          <h3>{title}</h3>
          <button type="button" className="crop-dialog__close" aria-label="Cancel crop" onClick={onCancel}>
            ×
          </button>
        </div>

        <p className="crop-dialog__hint">Drag the picture to position the circle, then zoom to taste.</p>

        <canvas
          ref={canvasRef}
          width={BOX}
          height={BOX}
          className="crop-dialog__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        <label className="crop-dialog__zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={1}
            step={0.01}
            // The slider runs backwards on purpose: dragging right should zoom
            // IN, which means a smaller circle over the source.
            value={MIN_ZOOM + 1 - value.zoom}
            onChange={(e) => setZoom(MIN_ZOOM + 1 - Number(e.target.value))}
            aria-label="Zoom"
          />
        </label>

        <div className="crop-dialog__actions">
          <button type="button" className="crop-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="crop-dialog__confirm" onClick={confirm} disabled={!ready}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
