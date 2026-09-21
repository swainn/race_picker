import { describe, expect, it } from 'vitest';
import { cardKey, createDeck, dealHoldem, suddenDeath } from './pokerDeck';
import { evaluateSeven, weakestOf } from './pokerHands';

describe('createDeck', () => {
  it('is 52 distinct cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });

  it('has thirteen ranks in each of four suits', () => {
    const deck = createDeck();
    for (const suit of ['s', 'h', 'd', 'c']) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
  });
});

describe('dealHoldem', () => {
  it('deals two hole cards each plus a five-card board', () => {
    for (const count of [1, 2, 7, 20]) {
      const { hole, board } = dealHoldem(count);
      expect(hole).toHaveLength(count);
      for (const h of hole) expect(h).toHaveLength(2);
      expect(board).toHaveLength(5);
    }
  });

  it('never deals the same card twice, even at a full table', () => {
    for (let trial = 0; trial < 500; trial++) {
      const { hole, board } = dealHoldem(20);
      const all = [...hole.flat(), ...board];
      expect(all).toHaveLength(45);
      expect(new Set(all.map(cardKey)).size).toBe(45);
    }
  });

  it('fits the app cap of 20 players in one deck, and refuses more', () => {
    expect(() => dealHoldem(20)).not.toThrow(); // 20*2 + 5 = 45
    expect(() => dealHoldem(24)).toThrow(); // 24*2 + 5 = 53
    expect(() => dealHoldem(0)).toThrow();
  });
});

describe('suddenDeath', () => {
  it('busts the single contender without drawing', () => {
    const r = suddenDeath([7]);
    expect(r.bustedId).toBe(7);
    expect(r.rounds).toHaveLength(0);
  });

  it('always returns one busted id drawn from the contenders', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const ids = [1, 2, 3, 4];
      const r = suddenDeath(ids);
      expect(ids).toContain(r.bustedId);
      expect(r.rounds.length).toBeGreaterThan(0);
      expect(r.rounds[0].draws).toHaveLength(4);
    }
  });

  it('busts whoever drew the lowest card', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const r = suddenDeath([1, 2, 3, 4, 5]);
      const last = r.rounds[r.rounds.length - 1];
      const lowest = Math.min(...last.draws.map((d) => d.card.rank));
      const drewLowest = last.draws.filter((d) => d.card.rank === lowest).map((d) => d.id);
      expect(drewLowest).toContain(r.bustedId);
    }
  });

  it('redraws only among players still tied', () => {
    for (let trial = 0; trial < 3000; trial++) {
      const r = suddenDeath([1, 2, 3, 4]);
      for (let i = 1; i < r.rounds.length; i++) {
        const prev = r.rounds[i - 1];
        const low = Math.min(...prev.draws.map((d) => d.card.rank));
        const tied = prev.draws.filter((d) => d.card.rank === low).map((d) => d.id).sort();
        const nextIds = r.rounds[i].draws.map((d) => d.id).sort();
        expect(nextIds).toEqual(tied);
      }
    }
  });

  it('picks uniformly among tied players (fairness)', () => {
    const ids = [0, 1, 2, 3, 4];
    const trials = 20000;
    const busts = new Array<number>(ids.length).fill(0);
    for (let t = 0; t < trials; t++) busts[suddenDeath(ids).bustedId]++;

    const expected = trials / ids.length;
    for (const count of busts) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});

describe('the pick is uniform (fairness)', () => {
  // This mode is fair by construction: an honest shuffle means the weakest
  // hand is uniformly distributed across seats, and the deal is independent of
  // where anyone sits. Unlike the other modes, that lets us test the real win
  // condition end to end rather than a helper standing in for it.
  it('busts every seat equally often over a full deal + showdown', () => {
    const seats = 8;
    const trials = 12000;
    const busts = new Array<number>(seats).fill(0);

    for (let t = 0; t < trials; t++) {
      const { hole, board } = dealHoldem(seats);
      const hands = hole.map((h) => evaluateSeven([...h, ...board]));
      const tied = weakestOf(hands);
      busts[tied.length === 1 ? tied[0] : suddenDeath(tied).bustedId]++;
    }

    const expected = trials / seats;
    for (const [seat, count] of busts.entries()) {
      expect(count, `seat ${seat} busted ${count} times, expected ~${expected}`)
        .toBeGreaterThan(expected * 0.9);
      expect(count, `seat ${seat} busted ${count} times, expected ~${expected}`)
        .toBeLessThan(expected * 1.1);
    }
  });
});
