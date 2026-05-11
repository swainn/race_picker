import type { ReactNode } from 'react';
import type { WinnerTheme } from '../../modes/themes';

export interface WinnerInfo {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
}

export interface WinnerEffects {
  fire: boolean;
  ice: boolean;
  green: boolean;
  lightning: boolean;
}

export interface WinnerDialogProps {
  theme: WinnerTheme;
  show: boolean;
  isFinals: boolean;
  winner: WinnerInfo;
  /** Headline above the avatar in the expanded state. */
  headline: string;
  /** Headline shown when isFinals=true (e.g. "🏆 CHAMPION 🏆"). */
  finalsHeadline: string;
  /** Optional details rendered below the name (e.g. killer info or weapon). */
  detailsNode?: ReactNode;
  /** Optional effect badges (Plinko). */
  effects?: WinnerEffects;
  /** Primary action label. Defaults to "▶ Next". */
  nextLabel?: string;
  /** Finals action label. Defaults to "🏆 Final Standings". */
  finalsLabel?: string;
  /** Minimized pill action label. Defaults to nextLabel value. */
  minimizedNextLabel?: string;
  /** Minimized pill finals label. Defaults to "🏆 Standings". */
  minimizedFinalsLabel?: string;
  onNext: () => void;
  onShowFinalStandings: () => void;
  /** Called once each time the dialog enters the minimized state. */
  onReplayStart?: () => void;
  /** Auto-minimize delay in ms. Defaults to 3000. */
  autoMinimizeMs?: number;
}
