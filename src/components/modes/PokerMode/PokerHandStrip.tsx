import { SUIT_IS_RED, SUIT_SYMBOL, rankLabel, type Card } from './pokerDeck';

/** The five cards of a showdown hand, as small faces for the winner dialog. */
export function PokerHandStrip({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  return (
    <span className="poker-hand-strip" aria-hidden="true">
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
