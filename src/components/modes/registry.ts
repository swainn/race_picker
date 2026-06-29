import type { ComponentType } from 'react';
import type { GameMode, ModeViewProps } from './types';
import type { WinnerTheme } from './themes';
import {
  battleBotsTheme,
  battleshipTheme,
  lightCyclesTheme,
  plinkoTheme,
  kungFuTheme,
  racingTheme,
  wallClimberTheme,
  wheelTheme,
} from './themes';
import { RacingMode } from './RacingMode/RacingMode';
import { RacingSettings } from './RacingMode/RacingSettings';
import { BattleBotsMode } from './BattleBotsMode/BattleBotsMode';
import { LightCyclesMode } from './LightCyclesMode/LightCyclesMode';
import { PlinkoMode } from './PlinkoMode/PlinkoMode';
import { WallClimberMode } from './WallClimberMode/WallClimberMode';
import { WallClimberSettings } from './WallClimberMode/WallClimberSettings';
import { BattleshipMode } from './BattleshipMode/BattleshipMode';
import { BattleshipSettings } from './BattleshipMode/BattleshipSettings';
import { WheelMode } from './WheelMode/WheelMode';
import { WheelSettings } from './WheelMode/WheelSettings';
import { KungFuMode } from './KungFuMode/KungFuMode';

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
  'kung-fu':      { View: KungFuMode,      theme: kungFuTheme,      label: '🥋 Kung Fu',      survivalOrder: true },
};

export const MODE_LIST: { value: GameMode; label: string }[] =
  (Object.entries(MODE_REGISTRY) as [GameMode, ModeRegistryEntry][])
    .map(([value, entry]) => ({ value, label: entry.label }));
