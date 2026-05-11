import type { Entry } from '../types';
import './FinalStandingsDialog.css';

interface Props {
  entries: Entry[];
  winOrder: Map<number, number>;
  onClose: () => void;
  /** When true, the highest winOrder is ranked 1st (survival modes — last
   *  alive wins). Default false sorts the lowest winOrder first
   *  (sequential-pick modes — first across the line wins). */
  reverseOrder?: boolean;
}

export function FinalStandingsDialog({ entries, winOrder, onClose, reverseOrder }: Props) {
  const standings = entries
    .filter((e) => winOrder.has(e.id))
    .sort((a, b) => {
      const diff = (winOrder.get(a.id) || 0) - (winOrder.get(b.id) || 0);
      return reverseOrder ? -diff : diff;
    });

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="standings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="standings-header">
          <h2>🏆 Final Standings 🏆</h2>
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
          <div className="standings-list">
            {standings.map((entry, idx) => (
              <div key={entry.id} className="standing-entry">
                <span className="standing-rank">{getOrdinal(idx + 1)}</span>
                <span className="standing-name">{entry.name}</span>
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
