import { useSyncExternalStore } from 'react';

/** Persisted settings for Whac-a-Mole — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_whac_a_mole_settings';

export type WhacSpeed = 'slow' | 'normal' | 'fast';
/** How busy the board looks while the mallet is hunting. Cosmetic only. */
export type WhacDensity = 'sparse' | 'normal' | 'busy';

export interface WhacAMoleSettings {
  speed: WhacSpeed;
  density: WhacDensity;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: WhacAMoleSettings = {
  speed: 'normal',
  density: 'normal',
  sound: true,
  music: true,
};

function loadSettings(): WhacAMoleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WhacAMoleSettings>;
    const speed: WhacSpeed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    const density: WhacDensity =
      parsed.density === 'sparse' || parsed.density === 'busy' ? parsed.density : 'normal';
    return { speed, density, sound: parsed.sound ?? true, music: parsed.music ?? true };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: WhacAMoleSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: WhacAMoleSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): WhacAMoleSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateWhacAMoleSettings(next: Partial<WhacAMoleSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useWhacAMoleSettings(): WhacAMoleSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Multiplier on every phase duration. */
export function whacSpeedFactor(speed: WhacSpeed): number {
  return speed === 'slow' ? 1.4 : speed === 'fast' ? 0.62 : 1;
}

/**
 * How long a decoy mole stays up, and how long it waits underground before
 * trying again. Density only changes how lively the board looks — it has no
 * bearing on the pick, which happened before any of this ran.
 */
export function whacDensityDwell(density: WhacDensity): { upMs: number; downMs: number } {
  if (density === 'sparse') return { upMs: 760, downMs: 1500 };
  if (density === 'busy') return { upMs: 700, downMs: 360 };
  return { upMs: 680, downMs: 820 };
}
