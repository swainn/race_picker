import { describe, expect, it } from 'vitest';
import {
  CANVAS_H,
  CANVAS_W,
  CARD_W,
  communitySlots,
  seatPositions,
  seatTileWidth,
  suddenDeathLayout,
} from './pokerTable';

const COUNTS = [1, 2, 3, 5, 8, 12, 16, 20];

describe('seatPositions', () => {
  it('returns one seat per player', () => {
    for (const count of COUNTS) expect(seatPositions(count)).toHaveLength(count);
    expect(seatPositions(0)).toEqual([]);
  });

  it('keeps every seat on the canvas', () => {
    for (const count of COUNTS) {
      for (const seat of seatPositions(count)) {
        expect(seat.x).toBeGreaterThanOrEqual(0);
        expect(seat.x).toBeLessThanOrEqual(CANVAS_W);
        expect(seat.y).toBeGreaterThanOrEqual(0);
        expect(seat.y).toBeLessThanOrEqual(CANVAS_H);
      }
    }
  });

  it('seats the first player at bottom centre', () => {
    for (const count of COUNTS) {
      const first = seatPositions(count)[0];
      expect(Math.abs(first.x - CANVAS_W / 2)).toBeLessThan(12);
      expect(first.y).toBeGreaterThan(CANVAS_H / 2);
      expect(first.side).toBe('bottom');
    }
  });

  it('spaces seats evenly by arc length, not by angle', () => {
    // Even-angle spacing on a 1.5:1 ellipse would bunch seats at the ends;
    // neighbour gaps would vary by well over 50%.
    for (const count of [8, 12, 16, 20]) {
      const seats = seatPositions(count);
      const gaps = seats.map((s, i) => {
        const n = seats[(i + 1) % count];
        return Math.hypot(n.x - s.x, n.y - s.y);
      });
      const min = Math.min(...gaps);
      const max = Math.max(...gaps);
      expect(max / min, `count ${count} gap spread`).toBeLessThan(1.15);
    }
  });

  it('never overlaps seat tiles, even at a full table', () => {
    for (const count of [12, 16, 20]) {
      const seats = seatPositions(count);
      const gaps = seats.map((s, i) => {
        const n = seats[(i + 1) % count];
        return Math.hypot(n.x - s.x, n.y - s.y);
      });
      expect(Math.min(...gaps), `count ${count}`).toBeGreaterThanOrEqual(seatTileWidth(count));
    }
  });
});

describe('communitySlots', () => {
  it('lays five cards out centred and in order', () => {
    const slots = communitySlots(52, 10);
    expect(slots).toHaveLength(5);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
      expect(slots[i].y).toBe(slots[0].y);
    }
    const spanCentre = (slots[0].x + slots[4].x + 52) / 2;
    expect(Math.abs(spanCentre - CANVAS_W / 2)).toBeLessThan(1);
  });
});

describe('suddenDeathLayout', () => {
  it('keeps the row on the canvas for every possible tie size', () => {
    // A board straight or flush can tie the whole table, so 20 must fit.
    for (let n = 2; n <= 20; n++) {
      const { cardW, gap, left } = suddenDeathLayout(n);
      const right = left + n * cardW + (n - 1) * gap;
      expect(left, `n=${n} left edge`).toBeGreaterThanOrEqual(0);
      expect(right, `n=${n} right edge`).toBeLessThanOrEqual(CANVAS_W);
    }
  });

  it('stays centred and keeps cards legible', () => {
    for (let n = 2; n <= 20; n++) {
      const { cardW, cardH, gap, left } = suddenDeathLayout(n);
      const centre = left + (n * cardW + (n - 1) * gap) / 2;
      expect(Math.abs(centre - CANVAS_W / 2)).toBeLessThan(1);
      expect(cardW).toBeGreaterThanOrEqual(20);
      expect(cardH).toBeGreaterThan(cardW); // cards stay portrait
      expect(gap).toBeGreaterThanOrEqual(4);
    }
  });

  it('does not shrink cards when the row already fits', () => {
    expect(suddenDeathLayout(2).cardW).toBe(CARD_W);
    expect(suddenDeathLayout(11).cardW).toBe(CARD_W);
  });
});
