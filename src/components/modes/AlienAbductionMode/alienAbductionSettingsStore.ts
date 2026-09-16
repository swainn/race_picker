import { useSyncExternalStore } from 'react';
import { loadFromStorage, saveToStorage } from '../../../utils/storage';

export type AbducteeKind =
  | 'human'
  | 'cow'
  | 'chicken'
  | 'sheep'
  | 'pig'
  | 'cat'
  | 'dog'
  | 'robot';

export type AlienAbductionSubMode = AbducteeKind | 'mixed';

export const ALIEN_ABDUCTION_SUB_MODES: { value: AlienAbductionSubMode; label: string }[] = [
  { value: 'human', label: '🧍 Humans' },
  { value: 'cow', label: '🐄 Cows' },
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

const SUB_MODE_KEY = 'alien_abduction_sub_mode';
const HAZARD_KEY = 'alien_abduction_hazards';

interface AlienAbductionSettings {
  subMode: AlienAbductionSubMode;
  hazards: HazardMode;
}

/** Stored values can predate the current option list (the bird rescues are gone). */
function loadHazards(): HazardMode {
  const stored = loadFromStorage<string>(HAZARD_KEY, 'random');
  return HAZARD_MODES.some((m) => m.value === stored) ? (stored as HazardMode) : 'random';
}

let current: AlienAbductionSettings = {
  subMode: loadFromStorage<AlienAbductionSubMode>(SUB_MODE_KEY, 'cow'),
  hazards: loadHazards(),
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

export function useAlienAbductionSettings(): AlienAbductionSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
