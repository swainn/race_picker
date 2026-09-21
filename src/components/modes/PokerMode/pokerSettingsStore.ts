import { useSyncExternalStore } from 'react';

/** Persisted settings for Poker Night — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_poker_settings';

export type PokerSpeed = 'slow' | 'normal' | 'fast';

export interface PokerSettings {
  speed: PokerSpeed;
  sound: boolean;
}

const DEFAULT_SETTINGS: PokerSettings = { speed: 'normal', sound: true };

function loadSettings(): PokerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PokerSettings>;
    const speed: PokerSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return { speed, sound: parsed.sound ?? true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: PokerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: PokerSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): PokerSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updatePokerSettings(next: Partial<PokerSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function usePokerSettings(): PokerSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every phase duration. */
export function pokerSpeedFactor(speed: PokerSpeed): number {
  return speed === 'slow' ? 1.45 : speed === 'fast' ? 0.62 : 1;
}
