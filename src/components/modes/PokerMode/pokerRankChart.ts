import type { Card, Rank, Suit } from './pokerDeck';

/**
 * The hand-ranking reference chart shown beside the table, strongest first.
 *
 * These are plain data so the evaluator itself can check them: a test asserts
 * every example really evaluates to the category it claims and that the list
 * is in strictly descending order. The chart can't drift away from the engine.
 */
export interface HandRankExample {
  label: string;
  cards: Card[];
}

/** Terse card literals: "As" "Td" "2c". */
function c(spec: string): Card {
  const suit = spec.slice(-1) as Suit;
  const face = spec.slice(0, -1);
  const rank = ({ A: 14, K: 13, Q: 12, J: 11, T: 10 }[face] ?? Number(face)) as Rank;
  return { rank, suit };
}
const hand = (...specs: string[]) => specs.map(c);

export const HAND_RANK_EXAMPLES: HandRankExample[] = [
  { label: 'Royal Flush', cards: hand('As', 'Ks', 'Qs', 'Js', 'Ts') },
  { label: 'Straight Flush', cards: hand('9h', '8h', '7h', '6h', '5h') },
  { label: 'Four of a Kind', cards: hand('Qs', 'Qh', 'Qd', 'Qc', '3d') },
  { label: 'Full House', cards: hand('Ks', 'Kh', 'Kd', '7c', '7s') },
  { label: 'Flush', cards: hand('Ad', 'Jd', '9d', '6d', '3d') },
  { label: 'Straight', cards: hand('Ts', '9h', '8d', '7c', '6s') },
  { label: 'Three of a Kind', cards: hand('8s', '8h', '8d', 'Kc', '4s') },
  { label: 'Two Pair', cards: hand('Js', 'Jh', '5d', '5c', '9s') },
  { label: 'Pair', cards: hand('Ts', 'Th', 'Ad', '7c', '2s') },
  { label: 'High Card', cards: hand('As', 'Qh', '9d', '6c', '3s') },
];
