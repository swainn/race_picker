import type { Entry, EntryImage, ImageCrop } from '../types';
import { getEntryImages } from './entryImages';

/**
 * Circular-crop geometry, kept pure so the clamping can be tested without a
 * canvas. The editor and the final render both go through `cropSourceRect`,
 * which is what keeps the preview honest: what you line up is what you get.
 */

export const DEFAULT_CROP: ImageCrop = { cx: 0.5, cy: 0.5, zoom: 1 };

/** Tightest crop allowed, as a fraction of the shorter side. */
export const MIN_ZOOM = 0.2;

/** Side length of the square written out for each crop. */
export const CROP_OUTPUT_PX = 192;

/** Longest edge kept for the stored source image. */
export const SOURCE_MAX_PX = 480;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Pull a crop back inside the image: the circle may not hang over an edge, or
 * the render would pad it with blank pixels.
 *
 * Note the centre is clamped *after* the zoom, since how far the centre may
 * travel depends on how big the circle is.
 */
export function clampCrop(crop: ImageCrop, imgW: number, imgH: number): ImageCrop {
  if (imgW <= 0 || imgH <= 0) return { ...DEFAULT_CROP };
  const zoom = clamp(crop.zoom, MIN_ZOOM, 1);
  const size = zoom * Math.min(imgW, imgH);
  const halfX = size / 2 / imgW;
  const halfY = size / 2 / imgH;
  return {
    zoom,
    cx: clamp(crop.cx, halfX, 1 - halfX),
    cy: clamp(crop.cy, halfY, 1 - halfY),
  };
}

/** The square of source pixels a crop selects, in image coordinates. */
export function cropSourceRect(
  crop: ImageCrop,
  imgW: number,
  imgH: number
): { sx: number; sy: number; size: number } {
  const c = clampCrop(crop, imgW, imgH);
  const size = c.zoom * Math.min(imgW, imgH);
  return { sx: c.cx * imgW - size / 2, sy: c.cy * imgH - size / 2, size };
}

/**
 * The crop stored for image `index`, falling back to a centred full-frame crop
 * for entries saved before crops existed.
 */
export function cropFor(entry: Entry, index: number): ImageCrop {
  return entry.images?.[index]?.crop ?? { ...DEFAULT_CROP };
}

/**
 * The source to re-crop from. Entries saved before cropping have no source, so
 * the already-cropped square stands in for one — re-cropping those is lossy but
 * never fails, and a fresh upload replaces it with a real source.
 */
export function sourceFor(entry: Entry, index: number): string | undefined {
  return entry.images?.[index]?.src ?? getEntryImages(entry)[index];
}

/** Sources and crops for an entry, filled in for any image that predates them. */
export function entryImageRecords(entry: Entry): EntryImage[] {
  const urls = getEntryImages(entry);
  return urls.map((url, i) => ({
    src: entry.images?.[i]?.src ?? url,
    crop: entry.images?.[i]?.crop ?? { ...DEFAULT_CROP },
  }));
}

/**
 * Encode a canvas for storage, preferring WebP.
 *
 * WebP carries alpha *and* compresses like JPEG, so one format covers cut-outs
 * and photographs alike — a transparent PNG of the same picture is several
 * times larger, and these all live in localStorage.
 *
 * `toDataURL` silently falls back to PNG for a type the browser cannot encode,
 * so the result is checked rather than trusted: on a browser without WebP that
 * would quietly store the largest option for every single picture.
 */
export function encodeCanvas(
  canvas: HTMLCanvasElement,
  keepAlpha: boolean,
  quality = 0.85
): string {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return webp;
  return keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
}

/** Perceived brightness, for deciding what counts as "background black". */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Clear dark pixels that are connected to the border, in place.
 *
 * This repairs pictures whose transparency was flattened onto black by an
 * earlier encoder: the lost alpha cannot be recovered, but the black it left
 * behind can be keyed back out.
 *
 * Deliberately a flood fill inward from the edges rather than "every dark
 * pixel": a subject with dark hair, a black jacket or a shadowed eye would
 * otherwise be punched full of holes. Only background reachable from outside
 * the subject is removed.
 *
 * The threshold is deliberately tight. Flattened transparency is *pure* black
 * (the encoder wrote 0,0,0), while real dark content — hair, a black jacket —
 * almost never is. A looser threshold eats a dark subject that happens to touch
 * the background, which no colour-based key can tell apart from it.
 *
 * Returns how many pixels were cleared, so a caller can tell the user when
 * there was nothing to do.
 */
export function keyOutBorder(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxLuma = 24
): number {
  if (width <= 0 || height <= 0) return 0;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (data[i + 3] === 0) {
      // Already transparent: keep walking through it to reach black beyond.
      stack.push(p);
      return;
    }
    if (luma(data[i], data[i + 1], data[i + 2]) > maxLuma) return;
    data[i + 3] = 0;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    consider(x, 0);
    consider(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    consider(0, y);
    consider(width - 1, y);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const p = stack.pop() as number;
    cleared++;
    const x = p % width;
    const y = (p - x) / width;
    consider(x - 1, y);
    consider(x + 1, y);
    consider(x, y - 1);
    consider(x, y + 1);
  }
  return cleared;
}

/**
 * Re-encode an image with its black border background keyed out, or null when
 * there was nothing dark to remove.
 */
export function removeBorderBackground(img: HTMLImageElement, maxLuma = 24): string | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let frame: ImageData;
  try {
    frame = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const cleared = keyOutBorder(frame.data, w, h, maxLuma);
  if (cleared === 0) return null;
  ctx.putImageData(frame, 0, 0);
  return encodeCanvas(canvas, true);
}
