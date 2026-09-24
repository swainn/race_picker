import { useSyncExternalStore } from 'react';

/** Persisted settings for The Claw — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_claw_settings';

export type ClawSpeed = 'slow' | 'normal' | 'fast';

export interface ClawSettings {
  speed: ClawSpeed;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: ClawSettings = { speed: 'normal', sound: true, music: true };

function loadSettings(): ClawSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ClawSettings>;
    const speed: ClawSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return { speed, sound: parsed.sound ?? true, music: parsed.music ?? true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: ClawSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: ClawSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): ClawSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateClawSettings(next: Partial<ClawSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useClawSettings(): ClawSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every phase duration. */
export function clawSpeedFactor(speed: ClawSpeed): number {
  return speed === 'slow' ? 1.4 : speed === 'fast' ? 0.62 : 1;
}
