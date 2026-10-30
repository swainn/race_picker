import { useSyncExternalStore } from 'react';

/** Persisted settings for Trick-or-Treat — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_trick_or_treat_settings';

export type TreatSpeed = 'slow' | 'normal' | 'fast';

export interface TrickOrTreatSettings {
  speed: TreatSpeed;
  /** Use participant photos as the trick-or-treaters' faces. */
  useAvatars: boolean;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: TrickOrTreatSettings = {
  speed: 'normal',
  useAvatars: true,
  sound: true,
  music: true,
};

function loadSettings(): TrickOrTreatSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TrickOrTreatSettings>;
    const speed: TreatSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return {
      speed,
      useAvatars: parsed.useAvatars ?? true,
      sound: parsed.sound ?? true,
      music: parsed.music ?? true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: TrickOrTreatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: TrickOrTreatSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): TrickOrTreatSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateTrickOrTreatSettings(next: Partial<TrickOrTreatSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useTrickOrTreatSettings(): TrickOrTreatSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every phase duration. */
export function treatSpeedFactor(speed: TreatSpeed): number {
  return speed === 'slow' ? 1.4 : speed === 'fast' ? 0.62 : 1;
}
