import { useSyncExternalStore } from 'react';

/** Persisted settings for Street Duel — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_duel_settings';

export type DuelSpeed = 'slow' | 'normal' | 'fast';

export interface DuelSettings {
  speed: DuelSpeed;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: DuelSettings = { speed: 'normal', sound: true, music: true };

function loadSettings(): DuelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DuelSettings>;
    const speed: DuelSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return { speed, sound: parsed.sound ?? true, music: parsed.music ?? true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: DuelSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: DuelSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): DuelSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateDuelSettings(next: Partial<DuelSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useDuelSettings(): DuelSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function duelSpeedFactor(speed: DuelSpeed): number {
  return speed === 'slow' ? 0.75 : speed === 'fast' ? 1.4 : 1;
}
