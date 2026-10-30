import { describe, expect, it } from 'vitest';
import { MAX_PARTICIPANTS } from '../../../constants';
import type { Entry } from '../../../types';
import {
  FEINTS,
  TOT,
  TOT_T,
  bagMouth,
  easeInOut,
  easeInQuad,
  layoutKids,
  pickTreated,
  rowsFor,
} from './treatEngine';

const COUNTS = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i + 1);

describe('layoutKids', () => {
  it('finds a place for everyone', () => {
    for (const n of COUNTS) expect(layoutKids(n), `${n}`).toHaveLength(n);
    expect(layoutKids(0)).toEqual([]);
    expect(layoutKids(-4)).toEqual([]);
  });

  it('keeps every child on the porch', () => {
    for (const n of COUNTS) {
      for (const s of layoutKids(n)) {
        expect(s.x - TOT.KID_W / 2, `${n}`).toBeGreaterThanOrEqual(TOT.LINE_L - 1e-6);
        expect(s.x + TOT.KID_W / 2, `${n}`).toBeLessThanOrEqual(TOT.LINE_R + 1e-6);
        expect(s.y).toBeLessThanOrEqual(TOT.PORCH_Y);
        // Nobody stands off the back of the deck, up the wall of the house.
        expect(s.y, `${n}`).toBeGreaterThanOrEqual(TOT.DECK_Y);
        expect(s.y - TOT.KID_H).toBeGreaterThan(0);
      }
    }
  });

  // Two children in the same spot would make the hand's choice ambiguous.
  it('never stands two children on top of each other', () => {
    for (const n of COUNTS) {
      const spots = layoutKids(n);
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const a = spots[i];
          const b = spots[j];
          if (a.row !== b.row) continue;
          expect(Math.abs(a.x - b.x), `${n}: ${i} and ${j}`).toBeGreaterThan(TOT.KID_W * 0.8);
        }
      }
    }
  });

  it('adds a row only when the porch runs out of width', () => {
    expect(rowsFor(1)).toBe(1);
    expect(rowsFor(TOT.MAX_PER_ROW)).toBe(1);
    expect(rowsFor(TOT.MAX_PER_ROW + 1)).toBe(2);
    expect(rowsFor(TOT.MAX_PER_ROW * 2 + 1)).toBe(3);
    expect(rowsFor(0)).toBe(0);
  });

  it('stands the back rows smaller and further up the porch', () => {
    const spots = layoutKids(TOT.MAX_PER_ROW * 2);
    const back = spots.find((s) => s.row === 0)!;
    const front = spots.find((s) => s.row === 1)!;
    expect(back.y).toBeLessThan(front.y);
    expect(back.scale).toBeLessThan(front.scale);
  });

  it('puts the bag mouth above the child who holds it', () => {
    for (const s of layoutKids(12)) {
      const mouth = bagMouth(s);
      expect(mouth.x).toBe(s.x);
      expect(mouth.y).toBeLessThan(s.y);
    }
  });
});

describe('pickTreated', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('always picks somebody still knocking', () => {
    for (let t = 0; t < 500; t++) expect(entries).toContain(pickTreated(entries));
  });

  // The hand is walked to whoever this returns, so this is the only thing
  // standing between the mode and a biased pick.
  it('picks every participant equally often (fairness)', () => {
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const chosen = pickTreated(entries);
      counts.set(chosen.id, (counts.get(chosen.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      const got = counts.get(e.id) ?? 0;
      expect(got, `${e.name} treated ${got} times, expected ~${expected}`)
        .toBeGreaterThan(expected * 0.9);
      expect(got).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care where a child stands in the line (fairness)', () => {
    const trials = 16000;
    const bySpot = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) bySpot[entries.indexOf(pickTreated(entries))]++;
    const expected = trials / entries.length;
    for (const [i, got] of bySpot.entries()) {
      expect(got, `spot ${i}`).toBeGreaterThan(expected * 0.9);
      expect(got, `spot ${i}`).toBeLessThan(expected * 1.1);
    }
  });
});

describe('timing and easing', () => {
  it('hovers over a bag or two before committing', () => {
    expect(FEINTS).toBeGreaterThanOrEqual(1);
  });

  it('gives every beat a positive length', () => {
    for (const [name, ms] of Object.entries(TOT_T)) {
      expect(ms, name).toBeGreaterThan(0);
    }
  });

  it('eases from 0 to 1 and stays inside it', () => {
    for (const ease of [easeInOut, easeInQuad]) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
      for (let t = -0.5; t <= 1.5; t += 0.05) {
        const v = ease(t);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drops the candy faster the further it has fallen', () => {
    // Accelerating, unlike the hand's drift.
    expect(easeInQuad(0.5)).toBeLessThan(easeInOut(0.5));
  });
});
