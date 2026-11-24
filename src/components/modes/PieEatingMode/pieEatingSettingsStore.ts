import { useSyncExternalStore } from 'react';

/** Persisted settings for the Pie Eating Contest — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_pie_eating_settings';

export type PieSpeed = 'slow' | 'normal' | 'fast';

export interface PieEatingSettings {
  speed: PieSpeed;
  /** Use participant photos as the contestants' faces. */
  useAvatars: boolean;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: PieEatingSettings = {
  speed: 'normal',
  useAvatars: true,
  sound: true,
  music: true,
};

function loadSettings(): PieEatingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PieEatingSettings>;
    const speed: PieSpeed =
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

function saveSettings(s: PieEatingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: PieEatingSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): PieEatingSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updatePieEatingSettings(next: Partial<PieEatingSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function usePieEatingSettings(): PieEatingSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every PIE_T duration: slow 1.4, normal 1, fast 0.62. */
export function pieSpeedFactor(speed: PieSpeed): number {
  return speed === 'slow' ? 1.4 : speed === 'fast' ? 0.62 : 1;
}
