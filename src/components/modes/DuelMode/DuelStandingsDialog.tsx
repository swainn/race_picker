import type { Entry } from '../../../types';
import '../../FinalStandingsDialog.css';

interface Props {
  entries: Entry[];
  /** Total damage inflicted per entry id, across every duel this session. */
  damageTotals: Map<number, number>;
  onClose: () => void;
}

/**
 * Street Duel's own standings: ranked by TOTAL DAMAGE INFLICTED over all
 * rounds, not by elimination order. Reuses the shared standings dialog CSS.
 */
export function DuelStandingsDialog({ entries, damageTotals, onClose }: Props) {
  const standings = [...entries].sort(
    (a, b) => (damageTotals.get(b.id) ?? 0) - (damageTotals.get(a.id) ?? 0)
  );

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="standings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="standings-header">
          <h2>🥊 Final Standings 🥊</h2>
          <button
            type="button"
            className="standings-close-x"
            aria-label="Close final standings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="standings-body">
          <p className="duel-standings-note">Ranked by total damage inflicted</p>
          <div className="standings-list">
            {standings.map((entry, idx) => (
              <div key={entry.id} className="standing-entry">
                <span className="standing-rank">{getOrdinal(idx + 1)}</span>
                <span className="standing-name">{entry.name}</span>
                <span className="duel-standing-damage">
                  💥 {Math.round(damageTotals.get(entry.id) ?? 0)}
                </span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="close-standings-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
