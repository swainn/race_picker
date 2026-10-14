import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import {
  WHAC,
  colsFor,
  easeInCubic,
  easeInOut,
  layoutHoles,
  pickVictim,
} from './moleEngine';

/** Every crowd size the grid has to cope with. */
const COUNTS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('layoutHoles', () => {
  it('cuts exactly one hole per participant', () => {
    for (const count of COUNTS) expect(layoutHoles(count)).toHaveLength(count);
    expect(layoutHoles(0)).toEqual([]);
  });

  it('keeps every hole fully inside the board', () => {
    // A hole clipped by the edge would hide the mole popping out of it.
    for (const count of COUNTS) {
      for (const hole of layoutHoles(count)) {
        expect(hole.x - WHAC.HOLE_RX, `n=${count}`).toBeGreaterThanOrEqual(WHAC.BOARD_L);
        expect(hole.x + WHAC.HOLE_RX, `n=${count}`).toBeLessThanOrEqual(WHAC.BOARD_R);
        expect(hole.y - WHAC.HOLE_RY, `n=${count}`).toBeGreaterThanOrEqual(WHAC.BOARD_TOP);
        expect(hole.y + WHAC.HOLE_RY, `n=${count}`).toBeLessThanOrEqual(WHAC.BOARD_BOTTOM);
      }
    }
  });

  it('never lets two holes overlap', () => {
    // Two ellipses of this size are disjoint as soon as they are separated by
    // a full width on x or a full height on y, which the grid guarantees.
    for (const count of COUNTS) {
      const holes = layoutHoles(count);
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          const dx = Math.abs(holes[i].x - holes[j].x);
          const dy = Math.abs(holes[i].y - holes[j].y);
          const apart = dx >= 2 * WHAC.HOLE_RX - 1e-6 || dy >= 2 * WHAC.HOLE_RY - 1e-6;
          expect(apart, `n=${count}: holes ${i} and ${j} overlap`).toBe(true);
        }
      }
    }
  });

  it('widens the grid only as the crowd grows', () => {
    expect(colsFor(1)).toBe(1);
    expect(colsFor(3)).toBe(3);
    expect(colsFor(4)).toBe(4);
    expect(colsFor(8)).toBe(4);
    expect(colsFor(9)).toBe(WHAC.MAX_COLS);
    expect(colsFor(20)).toBe(WHAC.MAX_COLS);
  });

  it('centres a short final row', () => {
    // 5 participants is 4 + 1; the lone hole belongs in the middle.
    const holes = layoutHoles(5);
    const last = holes[4];
    expect(last.row).toBe(1);
    expect(last.x).toBeCloseTo((WHAC.BOARD_L + WHAC.BOARD_R) / 2, 6);
  });
});

describe('pickVictim', () => {
  const entries: Entry[] = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

  it('always picks a mole that is still on the board', () => {
    for (let t = 0; t < 500; t++) expect(entries).toContain(pickVictim(entries));
  });

  it('picks every participant equally often (fairness)', () => {
    // The mallet is choreographed to whoever this returns, so this is the only
    // thing standing between the mode and a biased knockout.
    const trials = 16000;
    const counts = new Map<number, number>();
    for (let t = 0; t < trials; t++) {
      const victim = pickVictim(entries);
      counts.set(victim.id, (counts.get(victim.id) ?? 0) + 1);
    }
    const expected = trials / entries.length;
    for (const e of entries) {
      const got = counts.get(e.id) ?? 0;
      expect(got, `${e.name} whacked ${got} times, expected ~${expected}`)
        .toBeGreaterThan(expected * 0.9);
      expect(got).toBeLessThan(expected * 1.1);
    }
  });

  it('does not care which hole a mole sits in (fairness)', () => {
    // Position must not correlate with being hit: lay the crowd out on the
    // board, pick many times, and check every hole index takes its share.
    const trials = 16000;
    const holes = layoutHoles(entries.length);
    expect(holes).toHaveLength(entries.length);

    const byHole = new Array<number>(entries.length).fill(0);
    for (let t = 0; t < trials; t++) {
      const victim = pickVictim(entries);
      // Entry i occupies hole i, exactly as the game seeds it.
      byHole[entries.indexOf(victim)]++;
    }
    const expected = trials / entries.length;
    for (const [i, got] of byHole.entries()) {
      const where = `hole r${holes[i].row}c${holes[i].col}`;
      expect(got, where).toBeGreaterThan(expected * 0.9);
      expect(got, where).toBeLessThan(expected * 1.1);
    }
  });
});

describe('easing', () => {
  it('runs from 0 to 1 and clamps outside that range', () => {
    for (const ease of [easeInOut, easeInCubic]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-2)).toBe(0);
      expect(ease(9)).toBe(1);
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('never goes backwards', () => {
    for (const ease of [easeInOut, easeInCubic]) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = ease(i / 100);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('accelerates into the impact', () => {
    // The downstroke should cover most of its distance late, so the hit lands hard.
    expect(easeInCubic(0.5)).toBeLessThan(0.2);
  });
});
