import { HAND_RANK_EXAMPLES } from './pokerRankChart';
import { PokerHandStrip } from './PokerHandStrip';
import { usePokerSettings, updatePokerSettings } from './pokerSettingsStore';

/** Hand-ranking reference chart beside the table, strongest hand first. */
export function PokerHandRanks() {
  const { showRanks } = usePokerSettings();

  return (
    <aside className={`poker-ranks${showRanks ? '' : ' poker-ranks--collapsed'}`}>
      <div className="poker-ranks__header">
        <button
          type="button"
          className="poker-ranks__toggle"
          aria-expanded={showRanks}
          onClick={() => updatePokerSettings({ showRanks: !showRanks })}
          title={showRanks ? 'Hide hand rankings' : 'Show hand rankings'}
        >
          <span className="poker-ranks__chevron" aria-hidden="true">{showRanks ? '▾' : '▸'}</span>
          <span className="poker-ranks__title">Hand Rankings</span>
        </button>
        {showRanks && (
          <span className="poker-ranks__hint">strongest → weakest</span>
        )}
      </div>

      {showRanks && (
        <ol className="poker-ranks__list">
          {HAND_RANK_EXAMPLES.map((example, i) => (
            <li key={example.label} className="poker-ranks__row">
              <span className="poker-ranks__label">
                <span className="poker-ranks__index">{i + 1}</span>
                {example.label}
              </span>
              <PokerHandStrip cards={example.cards} compact />
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
