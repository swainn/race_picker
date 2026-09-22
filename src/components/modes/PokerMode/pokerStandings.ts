import type { Entry } from '../../../types';

/**
 * Final-standings ranking for Poker Night.
 *
 * Both pick rules rank by the same thing — pots won — so the leaderboard means
 * the same across settings. Without this, the two rules would rank by entirely
 * different things: worst-hand-busts would order by survival, while
 * best-hand-takes-the-pot would order by when you were picked.
 *
 * A "pot won" is holding the best hand at a showdown; a split pot counts for
 * everyone who held it.
 */
export interface PokerStanding {
  entry: Entry;
  wins: number;
}

/**
 * Rank everyone by pots won, descending.
 *
 * Ties fall back to the mode's own ordering, which differs by rule and is
 * exactly what `survivalOrder` already encodes: under worst-hand-busts a later
 * elimination is better, so surviving longer breaks the tie upward; under
 * best-hand-takes-the-pot an earlier pick is better.
 */
export function rankByPotsWon(
  entries: Entry[],
  wins: Map<number, number>,
  winOrder: Map<number, number>,
  survivalOrder: boolean
): PokerStanding[] {
  return entries
    .map((entry) => ({ entry, wins: wins.get(entry.id) ?? 0 }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      // Unplaced entries sort last either way.
      const ao = winOrder.get(a.entry.id);
      const bo = winOrder.get(b.entry.id);
      if (ao === undefined && bo === undefined) return 0;
      if (ao === undefined) return 1;
      if (bo === undefined) return -1;
      return survivalOrder ? bo - ao : ao - bo;
    });
}
