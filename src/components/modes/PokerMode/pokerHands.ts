/**
 * Texas Hold'em hand evaluation: the best five cards out of seven.
 *
 * The approach is deliberately the obvious one — score all 21 five-card
 * subsets of the seven and keep the strongest. It is correct by inspection,
 * and 21 subsets x 20 seats per street is nothing. A clever bit-twiddling
 * evaluator would be faster and far easier to get subtly wrong, and a subtle
 * bug here would quietly skew every pick this mode makes.
 */
import { rankLabel, type Card, type Rank } from './pokerDeck';

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'quads'
  | 'straight-flush';

/** Index into this array is the category's strength; higher beats lower. */
export const CATEGORY_ORDER: HandCategory[] = [
  'high-card',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
];

export interface HandValue {
  category: HandCategory;
  /** 0 (high card) .. 8 (straight flush). */
  categoryRank: number;
  /** Ordered tiebreakers, most significant first. */
  tiebreak: number[];
  /** The five cards that make the hand. */
  cards: Card[];
  /** Display name, e.g. "FULL HOUSE, KINGS FULL OF SEVENS". */
  name: string;
  /** Nine characters or fewer, for the cramped seat tiles. */
  shortLabel: string;
}

const PLURAL: Record<Rank, string> = {
  2: 'TWOS', 3: 'THREES', 4: 'FOURS', 5: 'FIVES', 6: 'SIXES', 7: 'SEVENS',
  8: 'EIGHTS', 9: 'NINES', 10: 'TENS', 11: 'JACKS', 12: 'QUEENS',
  13: 'KINGS', 14: 'ACES',
};

const SINGULAR: Record<Rank, string> = {
  2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE', 6: 'SIX', 7: 'SEVEN',
  8: 'EIGHT', 9: 'NINE', 10: 'TEN', 11: 'JACK', 12: 'QUEEN',
  13: 'KING', 14: 'ACE',
};

interface Scored {
  categoryRank: number;
  category: HandCategory;
  tiebreak: number[];
}

/** Lexicographic compare of [categoryRank, ...tiebreak]. >0 means `a` is stronger. */
function compareScored(a: Scored, b: Scored): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * The straight's high card, or 0 if these five ranks aren't a run.
 * The wheel (A-2-3-4-5) counts as a five-high straight, so the ace plays low.
 */
function straightHigh(sortedDesc: Rank[]): number {
  const unique = [...new Set(sortedDesc)];
  if (unique.length !== 5) return 0;
  if (unique[0] - unique[4] === 4) return unique[0];
  // Wheel: A,5,4,3,2 sorts as 14,5,4,3,2.
  if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) return 5;
  return 0;
}

/** Score exactly five cards. */
function scoreFive(cards: Card[]): Scored {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a) as Rank[];
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const high = straightHigh(ranks);

  // Group ranks by how many times they appear, then order by count, then rank.
  const counts = new Map<Rank, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const shape = groups.map((g) => g[1]).join('');
  const byGroup = groups.map((g) => g[0]);

  if (isFlush && high) {
    return { categoryRank: 8, category: 'straight-flush', tiebreak: [high] };
  }
  if (shape === '41') {
    return { categoryRank: 7, category: 'quads', tiebreak: byGroup };
  }
  if (shape === '32') {
    return { categoryRank: 6, category: 'full-house', tiebreak: byGroup };
  }
  if (isFlush) {
    return { categoryRank: 5, category: 'flush', tiebreak: ranks };
  }
  if (high) {
    return { categoryRank: 4, category: 'straight', tiebreak: [high] };
  }
  if (shape === '311') {
    return { categoryRank: 3, category: 'trips', tiebreak: byGroup };
  }
  if (shape === '221') {
    return { categoryRank: 2, category: 'two-pair', tiebreak: byGroup };
  }
  if (shape === '2111') {
    return { categoryRank: 1, category: 'pair', tiebreak: byGroup };
  }
  return { categoryRank: 0, category: 'high-card', tiebreak: ranks };
}

function nameFor(scored: Scored, cards: Card[]): string {
  const t = scored.tiebreak;
  switch (scored.category) {
    case 'straight-flush':
      return t[0] === 14 ? 'ROYAL FLUSH' : `STRAIGHT FLUSH, ${SINGULAR[t[0] as Rank]} HIGH`;
    case 'quads':
      return `FOUR OF A KIND, ${PLURAL[t[0] as Rank]}`;
    case 'full-house':
      return `FULL HOUSE, ${PLURAL[t[0] as Rank]} FULL OF ${PLURAL[t[1] as Rank]}`;
    case 'flush': {
      const top = cards.map((c) => c.rank).sort((a, b) => b - a)[0] as Rank;
      return `FLUSH, ${SINGULAR[top]} HIGH`;
    }
    case 'straight':
      return `STRAIGHT, ${SINGULAR[t[0] as Rank]} HIGH`;
    case 'trips':
      return `THREE OF A KIND, ${PLURAL[t[0] as Rank]}`;
    case 'two-pair':
      return `TWO PAIR, ${PLURAL[t[0] as Rank]} AND ${PLURAL[t[1] as Rank]}`;
    case 'pair':
      return `PAIR OF ${PLURAL[t[0] as Rank]}`;
    default:
      return `${SINGULAR[t[0] as Rank]} HIGH`;
  }
}

function shortLabelFor(scored: Scored): string {
  const t = scored.tiebreak;
  switch (scored.category) {
    case 'straight-flush': return t[0] === 14 ? 'ROYAL' : 'STR FLUSH';
    case 'quads': return 'QUADS';
    case 'full-house': return 'FULL HOUSE';
    case 'flush': return 'FLUSH';
    case 'straight': return 'STRAIGHT';
    case 'trips': return 'TRIPS';
    case 'two-pair': return 'TWO PAIR';
    case 'pair': return `PAIR ${rankLabel(t[0] as Rank)}`;
    default: return `${rankLabel(t[0] as Rank)} HIGH`;
  }
}

/** Every 5-card combination of 7 cards: 21 of them. */
function fiveCardSubsets(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return out;
}

/** Best five-card hand from five or more cards (normally 2 hole + 5 board). */
export function evaluateSeven(cards: Card[]): HandValue {
  if (cards.length < 5) throw new Error('evaluateSeven needs at least five cards');

  let bestCards = cards.slice(0, 5);
  let best = scoreFive(bestCards);
  for (const combo of fiveCardSubsets(cards)) {
    const scored = scoreFive(combo);
    if (compareScored(scored, best) > 0) {
      best = scored;
      bestCards = combo;
    }
  }

  return {
    category: best.category,
    categoryRank: best.categoryRank,
    tiebreak: best.tiebreak,
    cards: [...bestCards].sort((x, y) => y.rank - x.rank),
    name: nameFor(best, bestCards),
    shortLabel: shortLabelFor(best),
  };
}

/** >0 when `a` is the stronger hand, 0 when they are exactly equal. */
export function compareHands(a: HandValue, b: HandValue): number {
  return compareScored(a, b);
}

/** Indexes of the hands tied for *weakest* — the ones facing elimination. */
export function weakestOf(hands: HandValue[]): number[] {
  if (hands.length === 0) return [];
  let worst = 0;
  for (let i = 1; i < hands.length; i++) {
    if (compareHands(hands[i], hands[worst]) < 0) worst = i;
  }
  return hands
    .map((h, i) => (compareHands(h, hands[worst]) === 0 ? i : -1))
    .filter((i) => i >= 0);
}

/** Indexes of the hands tied for strongest — used for the "leader" highlight. */
export function strongestOf(hands: HandValue[]): number[] {
  if (hands.length === 0) return [];
  let best = 0;
  for (let i = 1; i < hands.length; i++) {
    if (compareHands(hands[i], hands[best]) > 0) best = i;
  }
  return hands
    .map((h, i) => (compareHands(h, hands[best]) === 0 ? i : -1))
    .filter((i) => i >= 0);
}
