import { describe, expect, it } from 'vitest';
import type { Entry } from '../../../types';
import { rankByPotsWon } from './pokerStandings';

const entries: Entry[] = ['Ann', 'Bob', 'Cal', 'Dee'].map((name, i) => ({ id: i + 1, name }));
const names = (rows: { entry: Entry }[]) => rows.map((r) => r.entry.name);

describe('rankByPotsWon', () => {
  it('ranks by pots won, most first', () => {
    const wins = new Map([[1, 1], [2, 4], [3, 0], [4, 2]]);
    const order = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(names(rankByPotsWon(entries, wins, order, true))).toEqual(['Bob', 'Dee', 'Ann', 'Cal']);
  });

  it('includes everyone, even players who never won a pot', () => {
    const rows = rankByPotsWon(entries, new Map(), new Map(), true);
    expect(rows).toHaveLength(entries.length);
    expect(rows.every((r) => r.wins === 0)).toBe(true);
  });

  it('breaks ties by surviving longest when the worst hand busts', () => {
    // Everyone level on pots: whoever was eliminated last ranks highest.
    const wins = new Map([[1, 1], [2, 1], [3, 1], [4, 1]]);
    const order = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(names(rankByPotsWon(entries, wins, order, true))).toEqual(['Dee', 'Cal', 'Bob', 'Ann']);
  });

  it('breaks ties by winning earliest when the best hand takes the pot', () => {
    const wins = new Map([[1, 1], [2, 1], [3, 1], [4, 1]]);
    const order = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(names(rankByPotsWon(entries, wins, order, false))).toEqual(['Ann', 'Bob', 'Cal', 'Dee']);
  });

  it('puts pots won ahead of the tiebreak in both rules', () => {
    // Ann busted first but won the most pots, so she still tops the table.
    const wins = new Map([[1, 3], [2, 0], [3, 0], [4, 0]]);
    const order = new Map([[1, 1], [2, 2], [3, 3], [4, 4]]);
    expect(names(rankByPotsWon(entries, wins, order, true))[0]).toBe('Ann');
    expect(names(rankByPotsWon(entries, wins, order, false))[0]).toBe('Ann');
  });

  it('sorts unplaced entries last', () => {
    const wins = new Map([[1, 0], [2, 0], [3, 0], [4, 0]]);
    const order = new Map([[2, 1], [3, 2]]); // Ann and Dee never placed
    const ranked = names(rankByPotsWon(entries, wins, order, false));
    expect(ranked.slice(0, 2)).toEqual(['Bob', 'Cal']);
    expect(ranked.slice(2).sort()).toEqual(['Ann', 'Dee']);
  });

  it('does not mutate the entries array', () => {
    const copy = [...entries];
    rankByPotsWon(entries, new Map(), new Map(), true);
    expect(entries).toEqual(copy);
  });
});
