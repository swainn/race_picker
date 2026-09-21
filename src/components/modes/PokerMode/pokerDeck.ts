/**
 * Cards, the deck, and the deal for Poker Night.
 *
 * Fairness note: this mode is the only one in the app where the pick is fair
 * *by construction* rather than by compensation. An honest shuffle means the
 * weakest hand is uniformly distributed across seats, so nothing downstream
 * needs to correct for position. Deal with `shuffle` (Fisher-Yates over a
 * copy) and never with `createShuffleBag`, whose own docs say it must not be
 * used for fairness-critical picks.
 */
import { shuffle } from '../../../utils/array';

export type Suit = 's' | 'h' | 'd' | 'c';

/** 11=J, 12=Q, 13=K, 14=A. Aces are high except in the wheel straight. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
/** Hearts and diamonds paint red; spades and clubs paint dark. */
export const SUIT_IS_RED: Record<Suit, boolean> = { s: false, h: true, d: true, c: false };

const RANK_LABEL: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function rankLabel(rank: Rank): string {
  return RANK_LABEL[rank];
}

/** Card as a short key, e.g. "As" — handy for dedupe checks and tests. */
export function cardKey(card: Card): string {
  return `${RANK_LABEL[card.rank]}${card.suit}`;
}

/** A fresh, ordered 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

export interface HoldemDeal {
  /** Two hole cards per player, in seat order. */
  hole: Card[][];
  /** The five community cards: flop (3), turn, river. */
  board: Card[];
}

/**
 * Deal Texas Hold'em to `playerCount` seats from one honest deck.
 *
 * Hold'em is the only variant that fits the app's 20-participant cap on a
 * single deck: 20 x 2 + 5 = 45 cards. Five-card draw would need 100.
 */
export function dealHoldem(playerCount: number): HoldemDeal {
  const needed = playerCount * 2 + 5;
  if (playerCount < 1) throw new Error('dealHoldem needs at least one player');
  if (needed > 52) {
    throw new Error(`dealHoldem: ${playerCount} players needs ${needed} cards, deck holds 52`);
  }

  const deck = shuffle(createDeck());
  const hole: Card[][] = [];
  let next = 0;
  for (let seat = 0; seat < playerCount; seat++) {
    hole.push([deck[next++], deck[next++]]);
  }
  const board = deck.slice(next, next + 5);
  return { hole, board };
}

export interface SuddenDeathRound {
  draws: { id: number; card: Card }[];
}

export interface SuddenDeathResult {
  /** One entry per draw round; usually just the one. */
  rounds: SuddenDeathRound[];
  /** The seat singled out: the lowest card when taking 'low', highest for 'high'. */
  pickedId: number;
}

/** Redraws before we stop being dramatic and just pick one. */
const SUDDEN_DEATH_MAX_ROUNDS = 6;

/**
 * Break a tie by drawing one card each: `take: 'low'` singles out the lowest
 * card (the worst hand busts), `'high'` the highest (the best hand takes the
 * pot). Ties on the draw redraw among just those players.
 *
 * Cards come from a fresh shuffled deck rather than what's left of the deal —
 * at a full table only seven cards remain, which cannot support a redraw.
 */
export function suddenDeath(ids: number[], take: 'low' | 'high' = 'low'): SuddenDeathResult {
  if (ids.length === 0) throw new Error('suddenDeath needs at least one id');
  if (ids.length === 1) return { rounds: [], pickedId: ids[0] };

  const rounds: SuddenDeathRound[] = [];
  let contenders = [...ids];

  for (let round = 0; round < SUDDEN_DEATH_MAX_ROUNDS; round++) {
    const deck = shuffle(createDeck());
    const draws = contenders.map((id, i) => ({ id, card: deck[i] }));
    rounds.push({ draws });

    let edge = draws[0].card.rank;
    for (const d of draws) {
      if (take === 'low' ? d.card.rank < edge : d.card.rank > edge) edge = d.card.rank;
    }
    const stillTied = draws.filter((d) => d.card.rank === edge).map((d) => d.id);

    if (stillTied.length === 1) return { rounds, pickedId: stillTied[0] };
    contenders = stillTied;
  }

  // Vanishingly unlikely; fall back to a uniform pick so this always ends.
  return { rounds, pickedId: shuffle(contenders)[0] };
}
