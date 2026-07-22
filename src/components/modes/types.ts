import type { Entry } from '../../types';

export type GameMode =
  | 'racing'
  | 'battle-bots'
  | 'light-cycles'
  | 'plinko'
  | 'wall-climber'
  | 'battleship'
  | 'wheel'
  | 'kung-fu'
  | 'space-invaders'
  | 'space-defenders';

/** Per-mode metadata that gets stashed on a winner record. */
export interface ModeWinnerExtras {
  killerInfo?: { name: string; weapon: string };
  effects?: { fire: boolean; ice: boolean; green: boolean; lightning: boolean };
}

export interface ModeViewProps {
  /** Active (non-eliminated) entries, in display order. */
  entries: Entry[];
  /** Full list including eliminated, used for replay/standings. */
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  isRacing: boolean;
  currentWinner: string | null;
  onWinner: (entry: Entry, extras?: ModeWinnerExtras) => void;
  onRaceComplete: () => void;
  onShowFinalStandings: () => void;
  onStartRace: () => void;
  onResetRace: () => void;
}
