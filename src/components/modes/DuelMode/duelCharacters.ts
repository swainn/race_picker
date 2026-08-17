/**
 * The Street Duel character roster. Each duelist is randomly assigned one of
 * these per duel (Street Fighter-style). A character carries its own look
 * (palette / build / headgear / extras) and a signature super.
 *
 * Original archetypes — no trademarked names or art.
 */

export type Build = 'thin' | 'normal' | 'wide' | 'huge';
export type Headgear =
  | 'turban'
  | 'topknot'
  | 'mane'
  | 'mohawk'
  | 'cap'
  | 'mask'
  | 'band'
  | 'buns'
  | 'beret'
  | 'ponytail'
  | 'pigtails';

/** The super mechanic a character unleashes from a full meter. */
export type SuperKind =
  | 'projectile' // a big flaming/energy fireball
  | 'flurry' // rapid multi-hit (optionally dashing forward)
  | 'electric' // short-range burst that shocks anyone nearby
  | 'grab' // rush in and slam (piledriver / flying press)
  | 'crusher' // spin-charge straight across the screen
  | 'dive' // leap up and crash down
  | 'drill' // low horizontal drilling dash (spiral arrow)
  | 'volley'; // staggered burst of three thrown projectiles

export interface CharacterVisual {
  skin: string;
  /** Gi / trunks / uniform main color (also the HUD accent). */
  body: string;
  /** Belt / trim accent. */
  trim: string;
  hair: string;
  build: Build;
  headgear: Headgear;
  gloves?: boolean;
  cape?: boolean;
  claw?: boolean;
}

export interface DuelCharacter {
  id: string;
  name: string;
  visual: CharacterVisual;
  superKind: SuperKind;
  superCallout: string;
  superColor: string;
  /** Extra motion for the flurry/dash supers. */
  dashing?: boolean;
  /** Flurry supers throw punches by default; 'kick' flurries kick instead. */
  flurryStyle?: 'kick';
}

export const DUEL_CHARACTERS: DuelCharacter[] = [
  {
    id: 'yogi', name: 'Yogi',
    visual: { skin: '#b06a3a', body: '#e8c14a', trim: '#7a1f1f', hair: '#20130a', build: 'thin', headgear: 'turban' },
    superKind: 'projectile', superCallout: 'YOGA FIRE!', superColor: '#ff7a2a',
  },
  {
    id: 'sumo', name: 'Sumo',
    visual: { skin: '#f0d0b0', body: '#2a4a8a', trim: '#f5f5f5', hair: '#161616', build: 'wide', headgear: 'topknot' },
    superKind: 'flurry', superCallout: 'HUNDRED SLAPS!', superColor: '#ffe06a',
  },
  {
    id: 'beast', name: 'Beast',
    visual: { skin: '#3fa34d', body: '#6a4a2a', trim: '#3a2a1a', hair: '#e8681c', build: 'normal', headgear: 'mane' },
    superKind: 'electric', superCallout: 'SHOCK!', superColor: '#8fe0ff',
  },
  {
    id: 'grappler', name: 'Grappler',
    visual: { skin: '#e8b48a', body: '#8a1f1f', trim: '#c9a227', hair: '#d59a3a', build: 'huge', headgear: 'mohawk' },
    superKind: 'grab', superCallout: 'PILEDRIVER!', superColor: '#ff5a3c',
  },
  {
    id: 'boxer', name: 'Boxer',
    visual: { skin: '#6a4a30', body: '#5a3a8a', trim: '#e8c14a', hair: '#141414', build: 'huge', headgear: 'band', gloves: true },
    superKind: 'flurry', superCallout: 'DASH RUSH!', superColor: '#ff5757', dashing: true,
  },
  {
    id: 'general', name: 'General',
    visual: { skin: '#e8c19a', body: '#b03a3a', trim: '#e8c14a', hair: '#2a1d12', build: 'normal', headgear: 'cap', cape: true },
    superKind: 'crusher', superCallout: 'PSYCHO CRUSHER!', superColor: '#9c6bff',
  },
  {
    id: 'claw', name: 'Claw',
    visual: { skin: '#e8c19a', body: '#7a2a5a', trim: '#e8c14a', hair: '#caa06a', build: 'thin', headgear: 'mask', claw: true },
    superKind: 'dive', superCallout: 'CLAW DIVE!', superColor: '#ff6bd0',
  },
  {
    id: 'lightning', name: 'Lightning',
    visual: { skin: '#f0c8a0', body: '#2a6ae8', trim: '#e8c14a', hair: '#2a1d12', build: 'normal', headgear: 'buns' },
    superKind: 'flurry', superCallout: 'LIGHTNING KICKS!', superColor: '#7ad7ff',
    flurryStyle: 'kick',
  },
  {
    id: 'commando', name: 'Commando',
    visual: { skin: '#e8c19a', body: '#3a8a4a', trim: '#c02a2a', hair: '#d5a53a', build: 'thin', headgear: 'beret' },
    superKind: 'drill', superCallout: 'SPIRAL ARROW!', superColor: '#7dff8a',
  },
  {
    id: 'kunoichi', name: 'Kunoichi',
    visual: { skin: '#e8c19a', body: '#4a4458', trim: '#c9a227', hair: '#2a1d12', build: 'thin', headgear: 'ponytail' },
    superKind: 'volley', superCallout: 'KUNAI STORM!', superColor: '#d9b3ff',
  },
  {
    id: 'luchadora', name: 'Luchadora',
    visual: { skin: '#e8b48a', body: '#e84a8a', trim: '#f5f5f5', hair: '#7ad7ff', build: 'normal', headgear: 'pigtails' },
    superKind: 'grab', superCallout: 'FLYING PRESS!', superColor: '#ff9ac0',
  },
];

export function pickCharacter(): DuelCharacter {
  return DUEL_CHARACTERS[Math.floor(Math.random() * DUEL_CHARACTERS.length)];
}

/** Two distinct random characters for a duel (SF-style: no mirror matches). */
export function pickTwoCharacters(): [DuelCharacter, DuelCharacter] {
  const i = Math.floor(Math.random() * DUEL_CHARACTERS.length);
  let j = Math.floor(Math.random() * (DUEL_CHARACTERS.length - 1));
  if (j >= i) j++;
  return [DUEL_CHARACTERS[i], DUEL_CHARACTERS[j]];
}
