import { useSyncExternalStore } from 'react';

/**
 * Persisted settings for Angry Birds — module singleton + useSyncExternalStore,
 * so the settings panel and the running game read the same source.
 */
const STORAGE_KEY = 'gamified_picker_angry_birds_settings';

/**
 * Who the participants are:
 *  - `pigs`  : participants perch in the tower, one is popped per round, and
 *              the last one still perched is the champion (survival order).
 *  - `birds` : participants take turns shooting at generic pigs, and the best
 *              shot of the round is that round's pick (first-out order).
 */
export type AngryBirdsSubMode = 'pigs' | 'birds';

export const ANGRY_BIRDS_SUB_MODES: { value: AngryBirdsSubMode; label: string }[] = [
  { value: 'pigs', label: '🐷 Pigs — last pig standing wins' },
  { value: 'birds', label: '🐦 Birds — best shot wins' },
];

export type AngryBirdsSpeed = 'slow' | 'normal' | 'fast';

export const ANGRY_BIRDS_SPEEDS: { value: AngryBirdsSpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

export interface AngryBirdsSettings {
  subMode: AngryBirdsSubMode;
  speed: AngryBirdsSpeed;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: AngryBirdsSettings = {
  subMode: 'pigs',
  speed: 'normal',
  sound: true,
  music: true,
};

/** Stored values are validated on read — an old or hand-edited key must not
 *  leave the mode in a sub-mode it does not know how to play. */
function loadSettings(): AngryBirdsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AngryBirdsSettings>;
    const subMode: AngryBirdsSubMode = parsed.subMode === 'birds' ? 'birds' : 'pigs';
    const speed: AngryBirdsSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return { subMode, speed, sound: parsed.sound ?? true, music: parsed.music ?? true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: AngryBirdsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: AngryBirdsSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): AngryBirdsSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAngryBirdsSettings(): AngryBirdsSettings {
  return current;
}

export function updateAngryBirdsSettings(next: Partial<AngryBirdsSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useAngryBirdsSettings(): AngryBirdsSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every phase duration. */
export function angryBirdsSpeedFactor(speed: AngryBirdsSpeed): number {
  return speed === 'slow' ? 1.4 : speed === 'fast' ? 0.62 : 1;
}
