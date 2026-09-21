import { describe, expect, it } from 'vitest';
import { cardKey, type Card, type Rank, type Suit } from './pokerDeck';
import {
  CATEGORY_ORDER,
  compareHands,
  evaluateSeven,
  strongestOf,
  weakestOf,
} from './pokerHands';

/** Terse card literals: "As" "Td" "2c". */
function c(spec: string): Card {
  const suit = spec.slice(-1) as Suit;
  const face = spec.slice(0, -1);
  const rank = (
    { A: 14, K: 13, Q: 12, J: 11, T: 10 }[face] ?? Number(face)
  ) as Rank;
  return { rank, suit };
}
const hand = (...specs: string[]) => specs.map(c);

describe('evaluateSeven — categories', () => {
  const cases: { label: string; cards: string[]; category: string; name: string }[] = [
    { label: 'royal flush', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts', '3d', '7c'], category: 'straight-flush', name: 'ROYAL FLUSH' },
    { label: 'straight flush', cards: ['9h', '8h', '7h', '6h', '5h', 'Ad', 'Kc'], category: 'straight-flush', name: 'STRAIGHT FLUSH, NINE HIGH' },
    { label: 'steel wheel', cards: ['As', '2s', '3s', '4s', '5s', 'Kd', 'Qc'], category: 'straight-flush', name: 'STRAIGHT FLUSH, FIVE HIGH' },
    { label: 'quads', cards: ['9h', '9s', '9d', '9c', 'Kh', '2d', '7c'], category: 'quads', name: 'FOUR OF A KIND, NINES' },
    { label: 'full house', cards: ['Kh', 'Ks', 'Kd', '7c', '7h', '2d', '3c'], category: 'full-house', name: 'FULL HOUSE, KINGS FULL OF SEVENS' },
    { label: 'flush', cards: ['Ad', 'Jd', '9d', '6d', '3d', 'Kc', 'Qh'], category: 'flush', name: 'FLUSH, ACE HIGH' },
    { label: 'straight', cards: ['Th', '9s', '8d', '7c', '6h', 'Ad', '2c'], category: 'straight', name: 'STRAIGHT, TEN HIGH' },
    { label: 'wheel straight', cards: ['Ah', '2s', '3d', '4c', '5h', 'Kd', 'Qc'], category: 'straight', name: 'STRAIGHT, FIVE HIGH' },
    { label: 'broadway', cards: ['Ah', 'Ks', 'Qd', 'Jc', 'Th', '3d', '2c'], category: 'straight', name: 'STRAIGHT, ACE HIGH' },
    { label: 'trips', cards: ['Qh', 'Qs', 'Qd', '9c', '4h', '2d', '7c'], category: 'trips', name: 'THREE OF A KIND, QUEENS' },
    { label: 'two pair', cards: ['Kh', 'Ks', '8d', '8c', '4h', '2d', '3c'], category: 'two-pair', name: 'TWO PAIR, KINGS AND EIGHTS' },
    { label: 'pair', cards: ['Jh', 'Js', '9d', '6c', '4h', '2d', '3c'], category: 'pair', name: 'PAIR OF JACKS' },
    { label: 'high card', cards: ['Ah', 'Js', '9d', '6c', '4h', '2d', '3c'], category: 'high-card', name: 'ACE HIGH' },
  ];

  for (const tc of cases) {
    it(`reads ${tc.label}`, () => {
      const v = evaluateSeven(hand(...tc.cards));
      expect(v.category, tc.label).toBe(tc.category);
      expect(v.name, tc.label).toBe(tc.name);
    });
  }

  it('gives every hand a short label that fits a seat tile', () => {
    for (const tc of cases) {
      const v = evaluateSeven(hand(...tc.cards));
      expect(v.shortLabel.length, `${tc.label}: "${v.shortLabel}"`).toBeLessThanOrEqual(10);
      expect(v.shortLabel.length).toBeGreaterThan(0);
    }
  });

  it('always returns exactly five cards, all drawn from the input', () => {
    for (const tc of cases) {
      const input = hand(...tc.cards);
      const v = evaluateSeven(input);
      expect(v.cards).toHaveLength(5);
      const pool = new Set(input.map(cardKey));
      for (const card of v.cards) expect(pool.has(cardKey(card))).toBe(true);
      // No card used twice.
      expect(new Set(v.cards.map(cardKey)).size).toBe(5);
    }
  });

  it('ranks the categories in the documented order', () => {
    const byCategory = new Map(cases.map((tc) => [tc.category, evaluateSeven(hand(...tc.cards))]));
    for (let i = 1; i < CATEGORY_ORDER.length; i++) {
      const lower = byCategory.get(CATEGORY_ORDER[i - 1]);
      const higher = byCategory.get(CATEGORY_ORDER[i]);
      if (!lower || !higher) continue;
      expect(
        compareHands(higher, lower),
        `${CATEGORY_ORDER[i]} should beat ${CATEGORY_ORDER[i - 1]}`
      ).toBeGreaterThan(0);
    }
  });
});

describe('evaluateSeven — the classic traps', () => {
  it('does not let the wheel outrank a six-high straight', () => {
    const wheel = evaluateSeven(hand('Ah', '2s', '3d', '4c', '5h', 'Kd', 'Qc'));
    const six = evaluateSeven(hand('2h', '3s', '4d', '5c', '6h', 'Kd', 'Qc'));
    expect(compareHands(six, wheel)).toBeGreaterThan(0);
  });

  it('does not read A-K-Q-J-... as a straight without the ten', () => {
    const v = evaluateSeven(hand('Ah', 'Ks', 'Qd', 'Jc', '9h', '3d', '2c'));
    expect(v.category).toBe('high-card');
  });

  it('ranks a flush above a straight', () => {
    const flush = evaluateSeven(hand('2d', '5d', '9d', 'Jd', 'Kd', 'Ah', '3c'));
    const straight = evaluateSeven(hand('Th', '9s', '8d', '7c', '6h', 'Ad', '2c'));
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  it('ranks a full house above a flush', () => {
    const boat = evaluateSeven(hand('Kh', 'Ks', 'Kd', '7c', '7h', '2d', '3c'));
    const flush = evaluateSeven(hand('Ad', 'Jd', '9d', '6d', '3d', 'Kc', 'Qh'));
    expect(compareHands(boat, flush)).toBeGreaterThan(0);
  });

  it('picks the higher trips for a full house when two are available', () => {
    // Kings full of sevens beats sevens full of kings.
    const v = evaluateSeven(hand('Kh', 'Ks', 'Kd', '7c', '7h', '7d', '2c'));
    expect(v.name).toBe('FULL HOUSE, KINGS FULL OF SEVENS');
  });

  it('compares two pair by high pair, then low pair, then kicker', () => {
    const kingsAndTwos = evaluateSeven(hand('Kh', 'Ks', '2d', '2c', '9h', '4d', '3c'));
    const queensAndJacks = evaluateSeven(hand('Qh', 'Qs', 'Jd', 'Jc', '9h', '4d', '3c'));
    expect(compareHands(kingsAndTwos, queensAndJacks)).toBeGreaterThan(0);

    const sameHighBetterLow = evaluateSeven(hand('Kh', 'Ks', '5d', '5c', '9h', '4d', '3c'));
    expect(compareHands(sameHighBetterLow, kingsAndTwos)).toBeGreaterThan(0);

    const sameTwoPairBetterKicker = evaluateSeven(hand('Kh', 'Ks', '5d', '5c', 'Jh', '4d', '3c'));
    expect(compareHands(sameTwoPairBetterKicker, sameHighBetterLow)).toBeGreaterThan(0);
  });

  it('compares quads by the kicker when the quads match', () => {
    const withAce = evaluateSeven(hand('9h', '9s', '9d', '9c', 'Ah', '2d', '3c'));
    const withKing = evaluateSeven(hand('9h', '9s', '9d', '9c', 'Kh', '2d', '3c'));
    expect(compareHands(withAce, withKing)).toBeGreaterThan(0);
  });

  it('compares high card down to the very last kicker', () => {
    // Identical through four cards (A-J-T-9); only the fifth separates them.
    // Ranks are chosen to avoid an accidental pair, flush, or wheel straight.
    const a = evaluateSeven(hand('Ah', 'Js', 'Td', '9c', '6h', '3d', '2c'));
    const b = evaluateSeven(hand('Ah', 'Js', 'Td', '9c', '5h', '3d', '2c'));
    expect(a.category).toBe('high-card');
    expect(b.category).toBe('high-card');
    expect(a.cards.map((x) => x.rank)).toEqual([14, 11, 10, 9, 6]);
    expect(b.cards.map((x) => x.rank)).toEqual([14, 11, 10, 9, 5]);
    expect(compareHands(a, b)).toBeGreaterThan(0);
    expect(compareHands(a, a)).toBe(0);
  });

  it('takes the best flush cards when six of a suit are present', () => {
    const v = evaluateSeven(hand('Ad', 'Kd', '9d', '6d', '3d', '2d', '7c'));
    expect(v.category).toBe('flush');
    expect(v.cards.map((x) => x.rank)).toEqual([14, 13, 9, 6, 3]);
  });

  it('prefers a straight flush over the quads hiding in the same seven', () => {
    const v = evaluateSeven(hand('6s', '7s', '8s', '9s', 'Ts', '6h', '6d'));
    expect(v.category).toBe('straight-flush');
  });
});

describe('weakestOf / strongestOf', () => {
  const pairAces = evaluateSeven(hand('Ah', 'As', '9d', '6c', '4h', '2d', '3c'));
  const aceHigh = evaluateSeven(hand('Ah', 'Js', '9d', '6c', '4h', '2d', '3c'));
  const aceHighTwin = evaluateSeven(hand('Ac', 'Jd', '9h', '6s', '4c', '2h', '3d'));

  it('finds the single weakest hand', () => {
    expect(weakestOf([pairAces, aceHigh])).toEqual([1]);
  });

  it('returns every index tied for weakest', () => {
    expect(weakestOf([pairAces, aceHigh, aceHighTwin])).toEqual([1, 2]);
  });

  it('finds the strongest hand', () => {
    expect(strongestOf([aceHigh, pairAces])).toEqual([1]);
  });

  it('handles a single hand and an empty list', () => {
    expect(weakestOf([pairAces])).toEqual([0]);
    expect(weakestOf([])).toEqual([]);
    expect(strongestOf([])).toEqual([]);
  });
});
