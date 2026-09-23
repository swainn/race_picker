import { SUIT_IS_RED, SUIT_SYMBOL, rankLabel, type Card } from './pokerDeck';

/** The cards of a hand, as small faces. `compact` suits the reference chart. */
export function PokerHandStrip({ cards, compact }: { cards: Card[]; compact?: boolean }) {
  if (cards.length === 0) return null;
  return (
    <span
      className={`poker-hand-strip${compact ? ' poker-hand-strip--compact' : ''}`}
      aria-hidden="true"
    >
      {cards.map((card, i) => (
        <span
          key={`${card.rank}${card.suit}-${i}`}
          className={`poker-mini-card${SUIT_IS_RED[card.suit] ? ' poker-mini-card--red' : ''}`}
        >
          <span className="poker-mini-card__rank">{rankLabel(card.rank)}</span>
          <span className="poker-mini-card__suit">{SUIT_SYMBOL[card.suit]}</span>
        </span>
      ))}
    </span>
  );
}
