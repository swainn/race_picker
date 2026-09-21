import { describe, expect, it } from 'vitest';
import { cardKey, createDeck, dealHoldem, suddenDeath } from './pokerDeck';
import { evaluateSeven, strongestOf, weakestOf } from './pokerHands';

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
  it('singles out a lone contender without drawing', () => {
    const r = suddenDeath([7]);
    expect(r.pickedId).toBe(7);
    expect(r.rounds).toHaveLength(0);
  });

  it('always returns one picked id drawn from the contenders', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const ids = [1, 2, 3, 4];
      const r = suddenDeath(ids);
      expect(ids).toContain(r.pickedId);
      expect(r.rounds.length).toBeGreaterThan(0);
      expect(r.rounds[0].draws).toHaveLength(4);
    }
  });

  it('picks whoever drew the lowest card when taking low', () => {
    for (let trial = 0; trial < 2000; trial++) {
      const r = suddenDeath([1, 2, 3, 4, 5]);
      const last = r.rounds[r.rounds.length - 1];
      const lowest = Math.min(...last.draws.map((d) => d.card.rank));
      const drewLowest = last.draws.filter((d) => d.card.rank === lowest).map((d) => d.id);
      expect(drewLowest).toContain(r.pickedId);
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

  it("picks whoever drew the highest card when taking high", () => {
    for (let trial = 0; trial < 2000; trial++) {
      const r = suddenDeath([1, 2, 3, 4, 5], 'high');
      const last = r.rounds[r.rounds.length - 1];
      const highest = Math.max(...last.draws.map((d) => d.card.rank));
      const drewHighest = last.draws.filter((d) => d.card.rank === highest).map((d) => d.id);
      expect(drewHighest).toContain(r.pickedId);
    }
  });

  it('picks uniformly among tied players (fairness)', () => {
    const ids = [0, 1, 2, 3, 4];
    const trials = 20000;
    const busts = new Array<number>(ids.length).fill(0);
    for (let t = 0; t < trials; t++) busts[suddenDeath(ids).pickedId]++;

    const expected = trials / ids.length;
    for (const count of busts) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });

  it('is uniform in the high direction too (fairness)', () => {
    const ids = [0, 1, 2, 3, 4];
    const trials = 20000;
    const wins = new Array<number>(ids.length).fill(0);
    for (let t = 0; t < trials; t++) wins[suddenDeath(ids, 'high').pickedId]++;

    const expected = trials / ids.length;
    for (const count of wins) {
      expect(count).toBeGreaterThan(expected * 0.9);
      expect(count).toBeLessThan(expected * 1.1);
    }
  });
});

describe('the pick is uniform under either rule (fairness)', () => {
  // This mode is fair by construction: an honest shuffle distributes both the
  // weakest and the strongest hand uniformly across seats, and the deal is
  // independent of where anyone sits. Unlike the other modes, that lets us
  // test the real win condition end to end rather than a helper standing in
  // for it — and both pick rules are settings, so both need covering.
  const RULES = [
    { name: 'worst hand busts', pickOf: weakestOf, take: 'low' as const },
    { name: 'best hand takes the pot', pickOf: strongestOf, take: 'high' as const },
  ];

  for (const rule of RULES) {
    it(`singles out every seat equally often — ${rule.name}`, () => {
      const seats = 8;
      const trials = 12000;
      const picks = new Array<number>(seats).fill(0);

      for (let t = 0; t < trials; t++) {
        const { hole, board } = dealHoldem(seats);
        const hands = hole.map((h) => evaluateSeven([...h, ...board]));
        const tied = rule.pickOf(hands);
        picks[tied.length === 1 ? tied[0] : suddenDeath(tied, rule.take).pickedId]++;
      }

      const expected = trials / seats;
      for (const [seat, count] of picks.entries()) {
        expect(count, `seat ${seat} picked ${count} times, expected ~${expected}`)
          .toBeGreaterThan(expected * 0.9);
        expect(count, `seat ${seat} picked ${count} times, expected ~${expected}`)
          .toBeLessThan(expected * 1.1);
      }
    });
  }
});
