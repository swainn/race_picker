import type { Entry } from '../../../types';
import { rankByPotsWon } from './pokerStandings';
import '../../FinalStandingsDialog.css';
import './PokerGame.css';

interface Props {
  entries: Entry[];
  /** Pots won per entry id across the session. */
  wins: Map<number, number>;
  winOrder: Map<number, number>;
  /** True when the worst hand busts, which flips the tiebreak. */
  survivalOrder: boolean;
  onClose: () => void;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Poker's own standings, ranked by pots won so the leaderboard reads the same
 * under either pick rule. Reuses the shared dialog's chrome and classes.
 */
export function PokerStandingsDialog({ entries, wins, winOrder, survivalOrder, onClose }: Props) {
  const ranked = rankByPotsWon(entries, wins, winOrder, survivalOrder);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="standings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="standings-header">
          <h2>🃏 Final Standings</h2>
          <button className="standings-close-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="standings-body">
          <p className="poker-standings-note">Ranked by pots won</p>
          <div className="standings-list">
            {ranked.map((row, index) => (
              <div key={row.entry.id} className="standing-entry">
                <span className="standing-rank">{getOrdinal(index + 1)}</span>
                <span className="standing-name">{row.entry.name}</span>
                <span className="poker-standing-wins">
                  🏆 {row.wins}
                </span>
              </div>
            ))}
          </div>
          <button className="close-standings-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
