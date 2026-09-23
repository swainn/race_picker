import { useSyncExternalStore } from 'react';
import { loadFromStorage, saveToStorage } from '../../../utils/storage';

export type AbducteeKind =
  | 'human'
  | 'cow'
  | 'horse'
  | 'chicken'
  | 'sheep'
  | 'pig'
  | 'cat'
  | 'dog'
  | 'robot';

export type AlienAbductionSubMode = AbducteeKind | 'mixed' | 'farm';

/** What a saucer actually comes for. Drawn at random per participant. */
export const FARM_KINDS: AbducteeKind[] = ['cow', 'horse', 'sheep', 'pig', 'chicken'];

export const ALIEN_ABDUCTION_SUB_MODES: { value: AlienAbductionSubMode; label: string }[] = [
  { value: 'farm', label: '🚜 Farm animals' },
  { value: 'human', label: '🧍 Humans' },
  { value: 'cow', label: '🐄 Cows' },
  { value: 'horse', label: '🐴 Horses' },
  { value: 'chicken', label: '🐔 Chickens' },
  { value: 'sheep', label: '🐑 Sheep' },
  { value: 'pig', label: '🐖 Pigs' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'robot', label: '🤖 Robots' },
  { value: 'mixed', label: '🎲 Mixed' },
];

export type HazardMode = 'random' | 'wind' | 'none';

export const HAZARD_MODES: { value: HazardMode; label: string }[] = [
  { value: 'random', label: '🎲 Random each round' },
  { value: 'wind', label: '💨 Always windy' },
  { value: 'none', label: '🚫 Dead calm' },
];

const SUB_MODE_KEY = 'alien_abduction_sub_mode_v2';
const LEGACY_SUB_MODE_KEY = 'alien_abduction_sub_mode';
const HAZARD_KEY = 'alien_abduction_hazards';
const SOUND_KEY = 'alien_abduction_sound';
const MUSIC_KEY = 'alien_abduction_music';

interface AlienAbductionSettings {
  subMode: AlienAbductionSubMode;
  hazards: HazardMode;
  sound: boolean;
  music: boolean;
}

/**
 * The default used to be 'cow', so everyone in the field was the same animal.
 * A mixed farm is the default now. Anyone who had explicitly picked something
 * keeps it; only the old default is treated as "never chosen" and upgraded.
 */
function loadSubMode(): AlienAbductionSubMode {
  const chosen = loadFromStorage<AlienAbductionSubMode | null>(SUB_MODE_KEY, null);
  if (chosen) return chosen;
  const legacy = loadFromStorage<AlienAbductionSubMode | null>(LEGACY_SUB_MODE_KEY, null);
  return !legacy || legacy === 'cow' ? 'farm' : legacy;
}

/** Stored values can predate the current option list (the bird rescues are gone). */
function loadHazards(): HazardMode {
  const stored = loadFromStorage<string>(HAZARD_KEY, 'random');
  return HAZARD_MODES.some((m) => m.value === stored) ? (stored as HazardMode) : 'random';
}

let current: AlienAbductionSettings = {
  subMode: loadSubMode(),
  hazards: loadHazards(),
  sound: loadFromStorage<boolean>(SOUND_KEY, true),
  music: loadFromStorage<boolean>(MUSIC_KEY, true),
};

const listeners = new Set<() => void>();

function getSnapshot(): AlienAbductionSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function setAlienAbductionSubMode(next: AlienAbductionSubMode): void {
  if (current.subMode === next) return;
  current = { ...current, subMode: next };
  saveToStorage(SUB_MODE_KEY, next);
  notify();
}

export function setAlienAbductionHazards(next: HazardMode): void {
  if (current.hazards === next) return;
  current = { ...current, hazards: next };
  saveToStorage(HAZARD_KEY, next);
  notify();
}

export function setAlienAbductionSound(next: boolean): void {
  if (current.sound === next) return;
  current = { ...current, sound: next };
  saveToStorage(SOUND_KEY, next);
  notify();
}

export function setAlienAbductionMusic(next: boolean): void {
  if (current.music === next) return;
  current = { ...current, music: next };
  saveToStorage(MUSIC_KEY, next);
  notify();
}

export function useAlienAbductionSettings(): AlienAbductionSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
