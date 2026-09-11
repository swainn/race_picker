/**
 * Roster themes for Street Duel. A theme swaps the cast, the stage rotation,
 * and the on-screen wording — but never the fight mechanics: `DUEL_MOVES`,
 * the AI, damage, and the meter economy are shared, so every theme plays and
 * balances identically.
 */
import { createShuffleBag } from '../../../utils/shuffleBag';
import { DUEL_MOVES, STAGE_IDS, type DuelMoveId, type StageId } from './duelEngine';
import { DUEL_CHARACTERS, type DuelCharacter } from './duelCharacters';
import { GALAXY_CHARACTERS } from './duelRosterGalaxy';

export type DuelThemeId = 'street' | 'galaxy';

export interface DuelRosterTheme {
  id: DuelThemeId;
  /** Settings radio label. */
  label: string;
  roster: DuelCharacter[];
  /** Stage rotation for this theme (a subset of STAGE_IDS). */
  stages: StageId[];
  /** Next character from this theme's own shuffle bag. */
  drawCharacter: () => DuelCharacter;
  /** Next stage from this theme's own shuffle bag. */
  drawStage: () => StageId;
  announce: { round: string; fight: string; ko: string };
  hitWords: string[];
  dialog: {
    headline: string;
    finalsHeadline: string;
    nextLabel: string;
    /** Emoji beside the eliminator's name in the winner dialog. */
    byIcon: string;
  };
  /** Callout shouted when a normal move starts (undefined = silent move). */
  moveCallout: (moveId: DuelMoveId, c: DuelCharacter) => string | undefined;
}

/** Two distinct characters for one duel. The shuffle bag guarantees
 *  consecutive draws differ, so mirror matches can't happen. */
export function pickTwoFrom(theme: DuelRosterTheme): [DuelCharacter, DuelCharacter] {
  return [theme.drawCharacter(), theme.drawCharacter()];
}

const GALAXY_STAGES: StageId[] = [
  'space', 'desert', 'frozen', 'volcano', 'jungle', 'city', 'alley', 'arena', 'train',
];

function galaxyCallout(moveId: DuelMoveId, c: DuelCharacter): string | undefined {
  const w = c.visual.weapon;
  const blade = w === 'saber' || w === 'saberDouble';
  if (moveId === 'hadoken') {
    if (w === 'blaster') return 'BLASTER!';
    if (w === 'bowcaster') return 'BOWCASTER!';
    return 'FORCE PUSH!'; // sabers and bare-handed Force users
  }
  if (moveId === 'shoryuken') return blade ? 'RISING SLASH!' : 'UPPERCUT!';
  return undefined;
}

export const DUEL_THEMES: Record<DuelThemeId, DuelRosterTheme> = {
  street: {
    id: 'street',
    label: 'Street Fighter',
    roster: DUEL_CHARACTERS,
    stages: STAGE_IDS,
    drawCharacter: createShuffleBag(DUEL_CHARACTERS),
    drawStage: createShuffleBag(STAGE_IDS),
    announce: { round: 'ROUND 1', fight: 'FIGHT!', ko: 'K.O.!' },
    hitWords: ['POW!', 'WHAM!', 'BAM!', 'KAPOW!', 'BOOM!'],
    dialog: {
      headline: 'K.O.!',
      finalsHeadline: '🥊 CHAMPION 🥊',
      nextLabel: '🥊 Next Duel',
      byIcon: '🥊',
    },
    moveCallout: (moveId) => DUEL_MOVES[moveId].callout,
  },
  galaxy: {
    id: 'galaxy',
    label: 'Star Wars',
    roster: GALAXY_CHARACTERS,
    stages: GALAXY_STAGES,
    drawCharacter: createShuffleBag(GALAXY_CHARACTERS),
    drawStage: createShuffleBag(GALAXY_STAGES),
    announce: { round: 'DUEL 1', fight: 'ENGAGE!', ko: 'DOWN!' },
    hitWords: ['CLASH!', 'ZAP!', 'KRAK!', 'BZZT!', 'WHOOSH!'],
    dialog: {
      headline: 'DOWN!',
      finalsHeadline: '⚔️ CHAMPION ⚔️',
      nextLabel: '⚔️ Next Duel',
      byIcon: '⚔️',
    },
    moveCallout: galaxyCallout,
  },
};

export const DUEL_THEME_IDS: DuelThemeId[] = ['street', 'galaxy'];
