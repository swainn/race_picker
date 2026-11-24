import { useSyncExternalStore } from 'react';

/** Persisted settings for Turkey Escape — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_turkey_escape_settings';

export type TurkeySpeed = 'slow' | 'normal' | 'fast';

export interface TurkeyEscapeSettings {
  speed: TurkeySpeed;
  /** Use participant photos as the turkeys' faces. */
  useAvatars: boolean;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: TurkeyEscapeSettings = {
  speed: 'normal',
  useAvatars: true,
  sound: true,
  music: true,
};

function loadSettings(): TurkeyEscapeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TurkeyEscapeSettings>;
    const speed: TurkeySpeed =
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

function saveSettings(s: TurkeyEscapeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: TurkeyEscapeSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): TurkeyEscapeSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateTurkeyEscapeSettings(next: Partial<TurkeyEscapeSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useTurkeyEscapeSettings(): TurkeyEscapeSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * How fast simulated time runs against real time. Bigger is faster — the
 * inverse of Trick-or-Treat's duration multiplier.
 */
export function turkeyTimeScale(speed: TurkeySpeed): number {
  return speed === 'slow' ? 0.75 : speed === 'fast' ? 1.45 : 1;
}
