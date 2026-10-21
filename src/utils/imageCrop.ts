import type { Entry, EntryImage, ImageCrop } from '../types';
import { getEntryImages } from './entryImages';

/**
 * Circular-crop geometry, kept pure so the clamping can be tested without a
 * canvas. The editor and the final render both go through `cropSourceRect`,
 * which is what keeps the preview honest: what you line up is what you get.
 */

/**
 * The whole frame. Used as the faithful stand-in for images saved before crops
 * existed: their stored square *is* the full picture, so this describes it
 * exactly. Not what a fresh upload starts at — see INITIAL_CROP.
 */
export const DEFAULT_CROP: ImageCrop = { cx: 0.5, cy: 0.5, zoom: 1 };

/**
 * Where a newly added picture starts: a 60% circle pinned to the top of the
 * frame and centred horizontally — heads sit at the top of a portrait, so this
 * lands on the face more often than not.
 *
 * `cy: 0` is deliberate rather than a computed value. How far up the centre can
 * sit depends on the zoom and the image's aspect ratio, and `clampCrop` already
 * works that out; asking for 0 and letting it clamp pins the circle's top edge
 * exactly to the image's top edge for any picture.
 */
export const INITIAL_CROP: ImageCrop = { cx: 0.5, cy: 0, zoom: 0.6 };

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
