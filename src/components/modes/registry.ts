import { lazy, type ComponentType } from 'react';
import type { GameMode, ModeViewProps } from './types';
import type { WinnerTheme } from './themes';
import {
  alienAbductionTheme,
  angryBirdsTheme,
  clawTheme,
  whacAMoleTheme,
  trickOrTreatTheme,
  pokerTheme,
  battleBotsTheme,
  battleshipTheme,
  lightCyclesTheme,
  plinkoTheme,
  kungFuTheme,
  invadersTheme,
  defendersTheme,
  duelTheme,
  racingTheme,
  wallClimberTheme,
  wheelTheme,
} from './themes';
import { RacingSettings } from './RacingMode/RacingSettings';
import { WallClimberSettings } from './WallClimberMode/WallClimberSettings';
import { BattleshipSettings } from './BattleshipMode/BattleshipSettings';
import { WheelSettings } from './WheelMode/WheelSettings';
import { KungFuSettings } from './KungFuMode/KungFuSettings';
import { InvadersSettings } from './SpaceInvadersMode/InvadersSettings';
import { DefendersSettings } from './SpaceInvadersMode/DefendersSettings';
import { DuelSettings } from './DuelMode/DuelSettings';
import { AlienAbductionSettings } from './AlienAbductionMode/AlienAbductionSettings';
import { PokerSettings } from './PokerMode/PokerSettings';
import { ClawSettings } from './ClawMode/ClawSettings';
import { WhacAMoleSettings } from './WhacAMoleMode/WhacAMoleSettings';
import { AngryBirdsSettings } from './AngryBirdsMode/AngryBirdsSettings';
import { TrickOrTreatSettings } from './TrickOrTreatMode/TrickOrTreatSettings';

// Mode views are code-split: each mode's chunk (engine, drawing, audio, CSS)
// loads on first use instead of in the initial bundle. Settings panels stay
// static — they're tiny and must render inside the shared SettingsModal
// without a suspense boundary.
const RacingMode = lazy(() => import('./RacingMode/RacingMode').then((m) => ({ default: m.RacingMode })));
const BattleBotsMode = lazy(() => import('./BattleBotsMode/BattleBotsMode').then((m) => ({ default: m.BattleBotsMode })));
const LightCyclesMode = lazy(() => import('./LightCyclesMode/LightCyclesMode').then((m) => ({ default: m.LightCyclesMode })));
const PlinkoMode = lazy(() => import('./PlinkoMode/PlinkoMode').then((m) => ({ default: m.PlinkoMode })));
const WallClimberMode = lazy(() => import('./WallClimberMode/WallClimberMode').then((m) => ({ default: m.WallClimberMode })));
const BattleshipMode = lazy(() => import('./BattleshipMode/BattleshipMode').then((m) => ({ default: m.BattleshipMode })));
const WheelMode = lazy(() => import('./WheelMode/WheelMode').then((m) => ({ default: m.WheelMode })));
const KungFuMode = lazy(() => import('./KungFuMode/KungFuMode').then((m) => ({ default: m.KungFuMode })));
const InvadersMode = lazy(() => import('./SpaceInvadersMode/InvadersMode').then((m) => ({ default: m.InvadersMode })));
const DefendersMode = lazy(() => import('./SpaceInvadersMode/DefendersMode').then((m) => ({ default: m.DefendersMode })));
const DuelMode = lazy(() => import('./DuelMode/DuelMode').then((m) => ({ default: m.DuelMode })));
const AlienAbductionMode = lazy(() => import('./AlienAbductionMode/AlienAbductionMode').then((m) => ({ default: m.AlienAbductionMode })));
const PokerMode = lazy(() => import('./PokerMode/PokerMode').then((m) => ({ default: m.PokerMode })));
const ClawMode = lazy(() => import('./ClawMode/ClawMode').then((m) => ({ default: m.ClawMode })));
const WhacAMoleMode = lazy(() => import('./WhacAMoleMode/WhacAMoleMode').then((m) => ({ default: m.WhacAMoleMode })));
// Angry Birds pulls matter-js into its chunk; code-splitting keeps that out of
// the initial bundle for everyone who never opens the mode.
const AngryBirdsMode = lazy(() => import('./AngryBirdsMode/AngryBirdsMode').then((m) => ({ default: m.AngryBirdsMode })));
const TrickOrTreatMode = lazy(() => import('./TrickOrTreatMode/TrickOrTreatMode').then((m) => ({ default: m.TrickOrTreatMode })));

export interface ModeRegistryEntry {
  View: ComponentType<ModeViewProps>;
  Settings?: ComponentType;
  theme: WinnerTheme;
  label: string;
  /** True when winOrder is recorded in elimination order — last survivor wins.
   *  FinalStandingsDialog reverses the sort so the survivor is shown first. */
  survivalOrder?: boolean;
}

export const MODE_REGISTRY: Record<GameMode, ModeRegistryEntry> = {
  racing:         { View: RacingMode,      Settings: RacingSettings, theme: racingTheme,      label: '🏁 Racing' },
  'battle-bots':  { View: BattleBotsMode,  theme: battleBotsTheme,  label: '⚔️ Battle Bots',  survivalOrder: true },
  'light-cycles': { View: LightCyclesMode, theme: lightCyclesTheme, label: '🏍️ Light Cycles', survivalOrder: true },
  plinko:         { View: PlinkoMode,      theme: plinkoTheme,      label: '🎯 Plinko' },
  'wall-climber': { View: WallClimberMode, Settings: WallClimberSettings, theme: wallClimberTheme, label: '🧗 Wall Climber' },
  battleship:     { View: BattleshipMode,  Settings: BattleshipSettings, theme: battleshipTheme,  label: '🚢 Battleship', survivalOrder: true },
  wheel:          { View: WheelMode,       Settings: WheelSettings,      theme: wheelTheme,       label: '🎡 Wheel' },
  'kung-fu':      { View: KungFuMode,      Settings: KungFuSettings, theme: kungFuTheme, label: '🥋 Kung Fu', survivalOrder: true },
  'space-invaders':  { View: InvadersMode,  Settings: InvadersSettings,  theme: invadersTheme,  label: '👾 Space Invaders', survivalOrder: true },
  'space-defenders': { View: DefendersMode, Settings: DefendersSettings, theme: defendersTheme, label: '🛡️ Space Defenders', survivalOrder: true },
  'street-duel':     { View: DuelMode,      Settings: DuelSettings,      theme: duelTheme,      label: '🥊 Street Duel', survivalOrder: true },
  'alien-abduction': { View: AlienAbductionMode, Settings: AlienAbductionSettings, theme: alienAbductionTheme, label: '🛸 Alien Abduction' },
  // Poker renders its own standings — ranked by pots won so the leaderboard
  // reads the same under either pick rule — so the shared dialog's ordering
  // never applies here. See PokerStandingsDialog.
  poker:             { View: PokerMode,      Settings: PokerSettings,      theme: pokerTheme,      label: '🃏 Poker Night', survivalOrder: true },
  // The claw takes one toy per drop and that toy is the pick, so this orders
  // like Racing: first chosen places first.
  claw:              { View: ClawMode,       Settings: ClawSettings,       theme: clawTheme,       label: '🕹 The Claw' },
  // The mallet knocks a mole out, so the one it never comes for is champion.
  'whac-a-mole':     { View: WhacAMoleMode,  Settings: WhacAMoleSettings,  theme: whacAMoleTheme,  label: '🔨 Whac-a-Mole', survivalOrder: true },
  // Ordering here depends on the sub-mode — pigs eliminate, birds place first —
  // so AngryBirdsMode renders its own FinalStandingsDialog with a runtime
  // `reverseOrder` and never calls onShowFinalStandings. This flag is the
  // correct default for the pigs sub-mode but is otherwise unused: the shared
  // standings dialog never opens for this mode. See AngryBirdsMode.tsx.
  'angry-birds':     { View: AngryBirdsMode, Settings: AngryBirdsSettings, theme: angryBirdsTheme, label: '🐦 Angry Birds', survivalOrder: true },
  // One candy goes in one bag per doorbell and that bag's owner is the pick,
  // so this orders like Racing: the first treated places first.
  'trick-or-treat':  { View: TrickOrTreatMode, Settings: TrickOrTreatSettings, theme: trickOrTreatTheme, label: '🎃 Trick-or-Treat' },
};

/** Labels lead with an emoji, so sort on the name that follows it. */
function modeSortKey(label: string): string {
  return label.replace(/^[^\p{L}]+/u, '').toLocaleLowerCase();
}

/** The dropdown, in alphabetical order by mode name. */
export const MODE_LIST: { value: GameMode; label: string }[] =
  (Object.entries(MODE_REGISTRY) as [GameMode, ModeRegistryEntry][])
    .map(([value, entry]) => ({ value, label: entry.label }))
    .sort((a, b) => modeSortKey(a.label).localeCompare(modeSortKey(b.label)));
