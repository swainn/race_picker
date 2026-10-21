import { describe, expect, it } from 'vitest';
import type { Entry } from '../types';
import {
  DEFAULT_CROP,
  MIN_ZOOM,
  clampCrop,
  cropFor,
  cropSourceRect,
  INITIAL_CROP,
  entryImageRecords,
  sourceFor,
} from './imageCrop';

/** Portrait, landscape, square and extreme ratios all have to behave. */
const SIZES: [number, number][] = [
  [100, 100], [400, 300], [300, 400], [1600, 400], [400, 1600], [1, 1], [13, 7],
];

describe('clampCrop', () => {
  it('holds zoom inside the allowed range', () => {
    expect(clampCrop({ cx: 0.5, cy: 0.5, zoom: 5 }, 100, 100).zoom).toBe(1);
    expect(clampCrop({ cx: 0.5, cy: 0.5, zoom: 0 }, 100, 100).zoom).toBe(MIN_ZOOM);
    expect(clampCrop({ cx: 0.5, cy: 0.5, zoom: -3 }, 100, 100).zoom).toBe(MIN_ZOOM);
  });

  it('leaves a centred crop alone', () => {
    const c = clampCrop({ cx: 0.5, cy: 0.5, zoom: 0.5 }, 400, 300);
    expect(c.cx).toBeCloseTo(0.5, 6);
    expect(c.cy).toBeCloseTo(0.5, 6);
  });

  it('is idempotent', () => {
    for (const [w, h] of SIZES) {
      for (const zoom of [0.1, 0.35, 0.8, 1, 2]) {
        for (const cx of [-1, 0, 0.5, 1, 2]) {
          const once = clampCrop({ cx, cy: cx, zoom }, w, h);
          expect(clampCrop(once, w, h)).toEqual(once);
        }
      }
    }
  });

  it('survives a degenerate image', () => {
    expect(clampCrop({ cx: 0.2, cy: 0.2, zoom: 0.5 }, 0, 10)).toEqual(DEFAULT_CROP);
    expect(clampCrop({ cx: 0.2, cy: 0.2, zoom: 0.5 }, 10, -1)).toEqual(DEFAULT_CROP);
  });
});

describe('cropSourceRect', () => {
  // A circle hanging over an edge would render with blank padding down one
  // side, which is the whole reason the centre is clamped against the zoom.
  it('never selects pixels outside the image', () => {
    for (const [w, h] of SIZES) {
      for (const zoom of [MIN_ZOOM, 0.3, 0.55, 0.9, 1]) {
        for (const cx of [-0.5, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
          for (const cy of [-0.5, 0, 0.5, 1, 1.5]) {
            const { sx, sy, size } = cropSourceRect({ cx, cy, zoom }, w, h);
            expect(size).toBeGreaterThan(0);
            expect(sx).toBeGreaterThanOrEqual(-1e-9);
            expect(sy).toBeGreaterThanOrEqual(-1e-9);
            expect(sx + size).toBeLessThanOrEqual(w + 1e-9);
            expect(sy + size).toBeLessThanOrEqual(h + 1e-9);
          }
        }
      }
    }
  });

  it('always selects a square, sized off the shorter side', () => {
    expect(cropSourceRect({ cx: 0.5, cy: 0.5, zoom: 1 }, 400, 300).size).toBe(300);
    expect(cropSourceRect({ cx: 0.5, cy: 0.5, zoom: 1 }, 300, 400).size).toBe(300);
    expect(cropSourceRect({ cx: 0.5, cy: 0.5, zoom: 0.5 }, 400, 300).size).toBe(150);
  });

  it('takes the centre square of a landscape image at full zoom', () => {
    const { sx, sy, size } = cropSourceRect(DEFAULT_CROP, 400, 300);
    expect(size).toBe(300);
    expect(sx).toBeCloseTo(50, 6);
    expect(sy).toBeCloseTo(0, 6);
  });
});

describe('entry helpers', () => {
  const legacy: Entry = { id: 1, name: 'Ada', imageDataUrls: ['a.png', 'b.png'] };
  const cropped: Entry = {
    id: 2,
    name: 'Grace',
    imageDataUrls: ['out.png'],
    images: [{ src: 'src.png', crop: { cx: 0.3, cy: 0.7, zoom: 0.4 } }],
  };

  it('defaults the crop for images saved before crops existed', () => {
    expect(cropFor(legacy, 0)).toEqual(DEFAULT_CROP);
    expect(cropFor(legacy, 5)).toEqual(DEFAULT_CROP);
  });

  it('returns a stored crop as-is', () => {
    expect(cropFor(cropped, 0)).toEqual({ cx: 0.3, cy: 0.7, zoom: 0.4 });
  });

  // Without this fallback the crop editor would open on nothing for anyone
  // whose entries predate the feature.
  it('falls back to the cropped square as its own source', () => {
    expect(sourceFor(legacy, 1)).toBe('b.png');
    expect(sourceFor(cropped, 0)).toBe('src.png');
    expect(sourceFor(legacy, 9)).toBeUndefined();
  });

  it('fills in records for every image, old or new', () => {
    expect(entryImageRecords(legacy)).toEqual([
      { src: 'a.png', crop: DEFAULT_CROP },
      { src: 'b.png', crop: DEFAULT_CROP },
    ]);
    expect(entryImageRecords(cropped)).toEqual([
      { src: 'src.png', crop: { cx: 0.3, cy: 0.7, zoom: 0.4 } },
    ]);
    expect(entryImageRecords({ id: 3, name: 'None' })).toEqual([]);
  });
});

describe('INITIAL_CROP', () => {
  it('starts at 60%, centred horizontally', () => {
    expect(INITIAL_CROP.zoom).toBe(0.6);
    expect(INITIAL_CROP.cx).toBe(0.5);
  });

  // cy is 0 and relies on clampCrop to lift it to the tightest legal value,
  // which is what pins the circle's top edge to the top of the picture. If that
  // clamp ever stops happening the circle would start half off the frame.
  it('pins the circle to the top of the frame, whatever the shape', () => {
    for (const [w, h] of SIZES) {
      const { sx, sy, size } = cropSourceRect(INITIAL_CROP, w, h);
      expect(sy).toBeCloseTo(0, 6);
      expect(size).toBeCloseTo(0.6 * Math.min(w, h), 6);
      // Still horizontally centred, and still inside the picture.
      expect(sx).toBeCloseTo((w - size) / 2, 6);
      expect(sx).toBeGreaterThanOrEqual(-1e-9);
      expect(sx + size).toBeLessThanOrEqual(w + 1e-9);
    }
  });
});
