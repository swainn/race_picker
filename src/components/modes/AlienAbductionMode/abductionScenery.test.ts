import { describe, expect, it } from 'vitest';
import {
  LOCATION_IDS,
  LOCATION_LABELS,
  WEATHER_IDS,
  WEATHER_LABELS,
  CAPTION_MS,
  captionAlpha,
  drawLocation,
  drawSceneCaption,
  drawWeather,
  weatherHasGusts,
  type LocationId,
  type Weather,
} from './abductionScenery';
import { HAZARD_MODES, LOCATION_MODES } from './alienAbductionSettingsStore';

describe('locations', () => {
  it('lists every location exactly once', () => {
    expect(new Set(LOCATION_IDS).size).toBe(LOCATION_IDS.length);
    expect(LOCATION_IDS.length).toBeGreaterThanOrEqual(10);
  });

  it('labels every location', () => {
    for (const id of LOCATION_IDS) {
      expect(LOCATION_LABELS[id]).toBeTruthy();
    }
    expect(Object.keys(LOCATION_LABELS).sort()).toEqual([...LOCATION_IDS].sort());
  });

  it('offers every location in the settings panel, plus random', () => {
    expect(LOCATION_MODES.map((m) => m.value)).toEqual(['random', ...LOCATION_IDS]);
  });
});

describe('weather', () => {
  it('lists every weather exactly once and labels it', () => {
    expect(new Set(WEATHER_IDS).size).toBe(WEATHER_IDS.length);
    for (const w of WEATHER_IDS) expect(WEATHER_LABELS[w]).toBeTruthy();
    expect(Object.keys(WEATHER_LABELS).sort()).toEqual([...WEATHER_IDS].sort());
  });

  it('offers every weather in the settings panel, plus random', () => {
    expect(HAZARD_MODES.map((m) => m.value)).toEqual(['random', ...WEATHER_IDS]);
  });

  // The gust rescue is a real mechanic, not decoration: it must fire for the
  // blustery weathers and stay off for the calm ones, whatever else changes.
  it('only lets the blustery weathers blow abductees out of the beam', () => {
    const gusty = WEATHER_IDS.filter(weatherHasGusts);
    expect(gusty).toEqual(['wind', 'storm']);
  });

  it('leaves at least one calm weather so the beam can be clean', () => {
    expect(WEATHER_IDS.some((w) => !weatherHasGusts(w))).toBe(true);
  });
});

describe('type coverage', () => {
  // A new member of either union that nobody added to the ID list would make
  // the random picker silently unable to choose it.
  it('keeps the id lists in step with the unions', () => {
    const everyLocation: Record<LocationId, true> = {
      field: true, cornfield: true, desert: true, forest: true, lakeshore: true,
      snowfield: true, suburb: true, pumpkin: true, canyon: true, driveIn: true,
    };
    const everyWeather: Record<Weather, true> = {
      clear: true, wind: true, rain: true, storm: true, snow: true, fog: true, meteors: true,
    };
    expect(Object.keys(everyLocation).sort()).toEqual([...LOCATION_IDS].sort());
    expect(Object.keys(everyWeather).sort()).toEqual([...WEATHER_IDS].sort());
  });
});

/**
 * A recording stand-in for a 2D context. The drawing code has no unit tests of
 * its own elsewhere in this repo, but these two functions have 17 independent
 * branches, so it is worth proving each one runs, paints something, and leaves
 * the context stack the way it found it — an unbalanced save/restore corrupts
 * every later draw in the frame, not just this one.
 */
function stubContext() {
  let depth = 0;
  let minDepth = 0;
  let paints = 0;
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = {
    canvas: { width: 400, height: 600 },
    save: () => { depth += 1; },
    restore: () => { depth -= 1; minDepth = Math.min(minDepth, depth); },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    fill: () => { paints += 1; },
    stroke: () => { paints += 1; },
    fillRect: () => { paints += 1; },
    fillText: () => { paints += 1; },
    strokeText: () => { paints += 1; },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    get depth() { return depth; },
    get minDepth() { return minDepth; },
    get paints() { return paints; },
  };
}

describe('drawing', () => {
  it.each(LOCATION_IDS)('draws %s without unbalancing the context', (loc) => {
    const rec = stubContext();
    drawLocation(rec.ctx, loc, 1234);
    expect(rec.paints).toBeGreaterThan(0);
    expect(rec.depth).toBe(0);
    expect(rec.minDepth).toBe(0);
  });

  it.each(WEATHER_IDS)('draws %s weather without unbalancing the context', (w) => {
    for (const wind of [-1, 0, 0.5, 1]) {
      // Sample across a long span so cycle-gated effects (the lightning flash,
      // the meteor streaks) are actually exercised rather than skipped.
      for (let now = 0; now < 12000; now += 137) {
        const rec = stubContext();
        drawWeather(rec.ctx, w, now, wind);
        expect(rec.depth).toBe(0);
        expect(rec.minDepth).toBe(0);
      }
    }
  });

  // 'clear' has nothing to draw, and 'wind' is drawn by the game itself (the
  // gust is a mechanic, so it is rendered alongside the rescue it causes).
  it('paints something for every weather with an ambient layer', () => {
    for (const w of WEATHER_IDS) {
      let painted = 0;
      for (let now = 0; now < 12000; now += 97) {
        const rec = stubContext();
        drawWeather(rec.ctx, w, now, 0.8);
        painted += rec.paints;
      }
      if (w === 'clear' || w === 'wind') expect(painted).toBe(0);
      else expect(painted).toBeGreaterThan(0);
    }
  });
});

describe('round caption', () => {
  it('is invisible before it starts and after it expires', () => {
    expect(captionAlpha(0)).toBe(0);
    expect(captionAlpha(-500)).toBe(0);
    expect(captionAlpha(CAPTION_MS + 1)).toBe(0);
  });

  it('fades in, holds at full, then fades out', () => {
    expect(captionAlpha(CAPTION_MS)).toBeCloseTo(0, 5);
    expect(captionAlpha(CAPTION_MS - 150)).toBeCloseTo(0.5, 2);
    expect(captionAlpha(CAPTION_MS - 300)).toBeCloseTo(1, 5);
    expect(captionAlpha(1200)).toBe(1);
    expect(captionAlpha(300)).toBeCloseTo(0.5, 2);
    expect(captionAlpha(60)).toBeCloseTo(0.1, 5);
  });

  it('never leaves the 0..1 range at any point in its life', () => {
    for (let left = -200; left <= CAPTION_MS + 200; left += 10) {
      const a = captionAlpha(left);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  it('draws text for every location and weather, and nothing at zero alpha', () => {
    for (const loc of LOCATION_IDS) {
      for (const w of WEATHER_IDS) {
        const rec = stubContext();
        drawSceneCaption(rec.ctx, loc, w, 1);
        expect(rec.paints).toBeGreaterThan(0);
        expect(rec.depth).toBe(0);
      }
    }
    const skipped = stubContext();
    drawSceneCaption(skipped.ctx, 'field', 'clear', 0);
    expect(skipped.paints).toBe(0);
  });
});
