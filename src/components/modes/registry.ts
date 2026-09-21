import { lazy, type ComponentType } from 'react';
import type { GameMode, ModeViewProps } from './types';
import type { WinnerTheme } from './themes';
import {
  alienAbductionTheme,
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
import { getPokerPick } from './PokerMode/pokerSettingsStore';

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
  poker: {
    View: PokerMode,
    Settings: PokerSettings,
    theme: pokerTheme,
    label: '🃏 Poker Night',
    // The only dynamic entry in the registry. Poker's pick rule is a setting,
    // and the two rules need opposite standings ordering: busting the worst
    // hand records eliminations (first out finishes last), while awarding the
    // pot to the best hand records placements (first picked finishes first).
    // App reads this at render time, so a getter is enough.
    get survivalOrder() {
      return getPokerPick() === 'worst';
    },
  },
};

export const MODE_LIST: { value: GameMode; label: string }[] =
  (Object.entries(MODE_REGISTRY) as [GameMode, ModeRegistryEntry][])
    .map(([value, entry]) => ({ value, label: entry.label }));
