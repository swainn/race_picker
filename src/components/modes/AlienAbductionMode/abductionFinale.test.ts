import { describe, expect, it } from 'vitest';
import {
  DISGUISE,
  FINALE_CAPTIONS,
  FINALE_IDS,
  FINALE_LABELS,
  HERO,
  parachutePlan,
  type FinaleId,
} from './abductionFinale';
import { FIELD_LEFT, FIELD_RIGHT } from './abductionField';
import { FINALE_MODES } from './alienAbductionSettingsStore';

describe('endings', () => {
  it('lists every ending once, labelled and captioned', () => {
    expect(new Set(FINALE_IDS).size).toBe(FINALE_IDS.length);
    expect(FINALE_IDS.length).toBeGreaterThanOrEqual(2);
    for (const id of FINALE_IDS) {
      expect(FINALE_LABELS[id]).toBeTruthy();
      expect(FINALE_CAPTIONS[id]).toBeTruthy();
    }
  });

  it('keeps the id list in step with the union', () => {
    const every: Record<FinaleId, true> = { disguise: true, hero: true };
    expect(Object.keys(every).sort()).toEqual([...FINALE_IDS].sort());
  });

  it('offers every ending in the settings panel, plus random', () => {
    expect(FINALE_MODES.map((m) => m.value)).toEqual(['random', ...FINALE_IDS]);
  });
});

describe('beat ordering', () => {
  // The sequences are driven off a single rising clock, so a beat landing out
  // of order would silently skip a step (or fire two in the same frame).
  it('runs the disguise ending in order', () => {
    const beats = [
      DISGUISE.SHAKE, DISGUISE.MORPH, DISGUISE.DESCEND,
      DISGUISE.BEAM, DISGUISE.RISE, DISGUISE.DEPART,
    ];
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(beats[0]).toBeGreaterThan(0);
  });

  it('runs the hero ending in order, and blows the ship up only once the survivor is aboard', () => {
    const beats = [
      HERO.DESCEND, HERO.BEAM, HERO.RISE, HERO.ABOARD,
      HERO.RUMBLE, HERO.BOOM, HERO.CAPTION, HERO.END,
    ];
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(HERO.BOOM).toBeGreaterThan(HERO.ABOARD);
    // There has to be room for the alarm to build before it goes up.
    expect(HERO.BOOM - HERO.RUMBLE).toBeGreaterThan(1);
    // And room after the blast for everyone to float down before the title.
    expect(HERO.CAPTION).toBeGreaterThan(HERO.BOOM);
  });
});

describe('parachutePlan', () => {
  it('gives one plan per participant', () => {
    for (const n of [1, 2, 7, 20]) {
      expect(parachutePlan(n)).toHaveLength(n);
    }
    expect(parachutePlan(0)).toEqual([]);
    expect(parachutePlan(-3)).toEqual([]);
  });

  // A full roster is 20, and anyone landing off the edge would be invisible.
  it('lands everyone inside the field at every roster size', () => {
    for (let n = 1; n <= 20; n++) {
      for (let trial = 0; trial < 50; trial++) {
        for (const p of parachutePlan(n)) {
          expect(p.x).toBeGreaterThanOrEqual(FIELD_LEFT);
          expect(p.x).toBeLessThanOrEqual(FIELD_RIGHT);
        }
      }
    }
  });

  it('spreads them out instead of stacking them in one spot', () => {
    const xs = parachutePlan(8).map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThan(0);
    }
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan((FIELD_RIGHT - FIELD_LEFT) * 0.5);
  });

  it('staggers the bail-outs without stalling any of them', () => {
    const plan = parachutePlan(20);
    for (const p of plan) {
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThan(1);
      expect(p.speed).toBeGreaterThan(0);
      expect(p.sway).toBeGreaterThan(0);
    }
    // Not all at the same instant.
    expect(new Set(plan.map((p) => p.delay.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('is deterministic given a deterministic source of randomness', () => {
    const fixed = () => 0.5;
    expect(parachutePlan(6, fixed)).toEqual(parachutePlan(6, fixed));
  });
});
