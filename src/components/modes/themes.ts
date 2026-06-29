export interface WinnerTheme {
  accent: string;
  accentSoft: string;
  bgGradient: string;
  finalsAccent: string;
  finalsAccentSoft: string;
  finalsBgGradient: string;
  /** Body text color. Defaults to white if not specified. */
  textColor?: string;
  /** Body text color for finals state. Defaults to textColor or white. */
  finalsTextColor?: string;
  /** Headline color in expanded dialog. Defaults to accent. */
  headlineColor?: string;
  /** Headline color in finals state. Defaults to finalsAccent. */
  finalsHeadlineColor?: string;
  fontFamily?: string;
  letterSpacing?: string;
  buttonStyle?: 'outline' | 'solid';
}

const FINALS_GOLD = '#FFE600';
const FINALS_GOLD_SOFT = 'rgba(255, 230, 0, 0.55)';
const FINALS_GOLD_GRADIENT = 'linear-gradient(135deg,#2a1d03 0%,#1a1003 100%)';

export const lightCyclesTheme: WinnerTheme = {
  accent: '#00E5FF',
  accentSoft: 'rgba(0, 229, 255, 0.55)',
  bgGradient: 'linear-gradient(135deg,#03182a 0%,#061026 100%)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  fontFamily: '"Courier New", monospace',
  letterSpacing: '1px',
  buttonStyle: 'outline',
};

export const racingTheme: WinnerTheme = {
  accent: '#236192',
  accentSoft: 'rgba(35, 97, 146, 0.55)',
  bgGradient: 'linear-gradient(135deg,#236192 0%,#1a4d7a 100%)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#F0EEE9',
  buttonStyle: 'solid',
};

export const wallClimberTheme: WinnerTheme = {
  ...racingTheme,
};

export const plinkoTheme: WinnerTheme = {
  ...racingTheme,
};

export const battleBotsTheme: WinnerTheme = {
  accent: '#FF4444',
  accentSoft: 'rgba(255, 68, 68, 0.55)',
  bgGradient: 'linear-gradient(135deg,#8B0000 0%,#4a0000 100%)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#FF6B6B',
  buttonStyle: 'solid',
};

export const battleshipTheme: WinnerTheme = {
  accent: '#c9a227',
  accentSoft: 'rgba(255, 215, 80, 0.55)',
  bgGradient: 'linear-gradient(135deg,#0d2540 0%,#081830 100%)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  buttonStyle: 'solid',
};

export const kungFuTheme: WinnerTheme = {
  accent: '#E8B23A',
  accentSoft: 'rgba(232, 178, 58, 0.55)',
  bgGradient: 'linear-gradient(135deg,#3a1d12 0%,#1a0f08 100%)',
  finalsAccent: FINALS_GOLD,
  finalsAccentSoft: FINALS_GOLD_SOFT,
  finalsBgGradient: FINALS_GOLD_GRADIENT,
  headlineColor: '#F4C95D',
  buttonStyle: 'solid',
};

export const wheelTheme: WinnerTheme = {
  accent: '#2d3436',
  accentSoft: 'rgba(45, 52, 54, 0.45)',
  bgGradient: 'linear-gradient(135deg,#fafafa 0%,#e7e9eb 100%)',
  finalsAccent: '#c9a227',
  finalsAccentSoft: 'rgba(201, 162, 39, 0.55)',
  finalsBgGradient: 'linear-gradient(135deg,#fff8d6 0%,#f5e7a4 100%)',
  textColor: '#1a1a1a',
  finalsTextColor: '#2b2b2b',
  buttonStyle: 'solid',
};
