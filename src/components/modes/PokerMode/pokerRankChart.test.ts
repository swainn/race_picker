import { describe, expect, it } from 'vitest';
import { cardKey } from './pokerDeck';
import { compareHands, evaluateSeven, type HandCategory } from './pokerHands';
import { HAND_RANK_EXAMPLES } from './pokerRankChart';

/** What each charted row is supposed to demonstrate, top to bottom. */
const EXPECTED: { label: string; category: HandCategory }[] = [
  { label: 'Royal Flush', category: 'straight-flush' },
  { label: 'Straight Flush', category: 'straight-flush' },
  { label: 'Four of a Kind', category: 'quads' },
  { label: 'Full House', category: 'full-house' },
  { label: 'Flush', category: 'flush' },
  { label: 'Straight', category: 'straight' },
  { label: 'Three of a Kind', category: 'trips' },
  { label: 'Two Pair', category: 'two-pair' },
  { label: 'Pair', category: 'pair' },
  { label: 'High Card', category: 'high-card' },
];

describe('HAND_RANK_EXAMPLES', () => {
  it('shows an example that really is the hand it claims', () => {
    // This is the point of keeping the chart as data: the reference the player
    // reads and the engine that judges them can never disagree.
    expect(HAND_RANK_EXAMPLES.map((e) => e.label)).toEqual(EXPECTED.map((e) => e.label));
    for (const [i, example] of HAND_RANK_EXAMPLES.entries()) {
      expect(evaluateSeven(example.cards).category, example.label).toBe(EXPECTED[i].category);
    }
  });

  it('gives the royal flush its own name', () => {
    expect(evaluateSeven(HAND_RANK_EXAMPLES[0].cards).name).toBe('ROYAL FLUSH');
  });

  it('is listed strongest to weakest, strictly descending', () => {
    for (let i = 1; i < HAND_RANK_EXAMPLES.length; i++) {
      const stronger = evaluateSeven(HAND_RANK_EXAMPLES[i - 1].cards);
      const weaker = evaluateSeven(HAND_RANK_EXAMPLES[i].cards);
      expect(
        compareHands(stronger, weaker),
        `${HAND_RANK_EXAMPLES[i - 1].label} should beat ${HAND_RANK_EXAMPLES[i].label}`
      ).toBeGreaterThan(0);
    }
  });

  it('shows five legal, distinct cards per example', () => {
    for (const example of HAND_RANK_EXAMPLES) {
      expect(example.cards, example.label).toHaveLength(5);
      expect(new Set(example.cards.map(cardKey)).size, example.label).toBe(5);
    }
  });

  it('covers every category the evaluator can produce', () => {
    const shown = new Set(HAND_RANK_EXAMPLES.map((e) => evaluateSeven(e.cards).category));
    // Royal flush shares a category with straight flush, hence 9 not 10.
    expect(shown.size).toBe(9);
  });
});
