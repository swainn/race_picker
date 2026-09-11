/**
 * The galaxy roster — a space-opera cast for Street Duel's alternate theme.
 * Same `DuelCharacter` shape as the default roster: each entry is pure data
 * (palette, build, headgear, weapon, signature super), so the fight mechanics
 * are byte-for-byte identical across themes. Only the presentation differs.
 *
 * All eight `SuperKind` mechanics are represented.
 */
import type { DuelCharacter } from './duelCharacters';

const SABER_BLUE = '#6fd3ff';
const SABER_GREEN = '#7dff8a';
const SABER_RED = '#ff4444';
const BOLT_RED = '#ff5a3c';
const BOLT_GREEN = '#9dff6a';

export const GALAXY_CHARACTERS: DuelCharacter[] = [
  {
    id: 'luke', name: 'Luke',
    visual: {
      skin: '#f0c8a0', body: '#e8e4d8', trim: '#6a5a44', hair: '#d5a53a',
      build: 'normal', headgear: 'jediHair', weapon: 'saber', weaponColor: SABER_BLUE,
    },
    superKind: 'projectile', superCallout: 'FORCE PUSH!', superColor: '#bfe9ff',
  },
  {
    id: 'vader', name: 'Vader',
    visual: {
      skin: '#2a2a32', body: '#16161c', trim: '#8a1f1f', hair: '#0e0e12',
      build: 'huge', headgear: 'vaderMask', cape: true,
      weapon: 'saber', weaponColor: SABER_RED,
    },
    superKind: 'grab', superCallout: 'FORCE CHOKE!', superColor: '#ff3b3b',
  },
  {
    id: 'yoda', name: 'Yoda',
    visual: {
      skin: '#8fbf5a', body: '#8a7a56', trim: '#5a4a30', hair: '#d8d8cc',
      build: 'thin', headgear: 'bigEars', weapon: 'saber', weaponColor: SABER_GREEN,
    },
    superKind: 'flurry', superCallout: 'SABER FLURRY!', superColor: SABER_GREEN,
  },
  {
    id: 'obiwan', name: 'Obi-Wan',
    visual: {
      skin: '#e8c19a', body: '#c9b28a', trim: '#6a5a44', hair: '#8a7a5a',
      build: 'normal', headgear: 'hood', weapon: 'saber', weaponColor: SABER_BLUE,
    },
    superKind: 'crusher', superCallout: 'SABER CHARGE!', superColor: SABER_BLUE,
  },
  {
    id: 'maul', name: 'Maul',
    visual: {
      skin: '#c0392b', body: '#1a1a20', trim: '#7a1f1f', hair: '#12121a',
      build: 'normal', headgear: 'horns', weapon: 'saberDouble', weaponColor: SABER_RED,
    },
    superKind: 'drill', superCallout: 'SPIN ATTACK!', superColor: SABER_RED,
  },
  {
    id: 'emperor', name: 'Emperor',
    visual: {
      skin: '#cfc2b0', body: '#20202a', trim: '#3a3a48', hair: '#d8d8cc',
      build: 'thin', headgear: 'hood', cape: true,
    },
    superKind: 'electric', superCallout: 'FORCE LIGHTNING!', superColor: '#bda8ff',
  },
  {
    id: 'boba', name: 'Boba Fett',
    visual: {
      skin: '#e8c19a', body: '#4a6a4a', trim: '#a03a2a', hair: '#2a2a2a',
      build: 'normal', headgear: 'fettHelmet',
      weapon: 'blaster', weaponColor: BOLT_RED,
    },
    superKind: 'dive', superCallout: 'ROCKET DIVE!', superColor: '#ffa53a',
  },
  {
    id: 'han', name: 'Han Solo',
    visual: {
      skin: '#e8c19a', body: '#3a4a6a', trim: '#c9c9d2', hair: '#4a3020',
      build: 'normal', headgear: 'jediHair', weapon: 'blaster', weaponColor: BOLT_RED,
    },
    superKind: 'volley', superCallout: 'QUICK DRAW!', superColor: BOLT_RED,
  },
  {
    id: 'chewbacca', name: 'Chewbacca',
    visual: {
      skin: '#8a6a3a', body: '#6a4a28', trim: '#3a2a18', hair: '#7a5a30',
      build: 'huge', headgear: 'mane', weapon: 'bowcaster', weaponColor: BOLT_GREEN,
    },
    superKind: 'grab', superCallout: 'WOOKIEE SLAM!', superColor: '#d5a53a',
  },
  {
    id: 'leia', name: 'Leia',
    visual: {
      skin: '#f0c8a0', body: '#f2f2f6', trim: '#c0c0cc', hair: '#3a2418',
      build: 'thin', headgear: 'buns', weapon: 'blaster', weaponColor: BOLT_RED,
    },
    superKind: 'volley', superCallout: 'BLASTER BARRAGE!', superColor: BOLT_RED,
  },
  {
    id: 'trooper', name: 'Stormtrooper',
    visual: {
      skin: '#e8e8ee', body: '#f2f2f6', trim: '#1a1a24', hair: '#1a1a24',
      build: 'normal', headgear: 'trooperHelmet',
      weapon: 'blaster', weaponColor: BOLT_RED,
    },
    superKind: 'projectile', superCallout: 'SUPPRESSING FIRE!', superColor: BOLT_RED,
  },
];
