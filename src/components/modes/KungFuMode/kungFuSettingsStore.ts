import { useSyncExternalStore } from 'react';

/**
 * Persisted settings for Kung Fu mode. Module-level singleton + useSyncExternalStore,
 * matching the pattern used by the other modes' settings stores.
 */
const STORAGE_KEY = 'gamified_picker_kung_fu_settings';

export interface KungFuSettings {
  /** When true, the platform gradually shrinks during a round (sudden death).
   *  A hard time-cap collapse always applies regardless, to prevent stalemates. */
  shrinkPlatform: boolean;
}

const DEFAULT_SETTINGS: KungFuSettings = {
  shrinkPlatform: false,
};

function loadSettings(): KungFuSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<KungFuSettings>;
    return { shrinkPlatform: !!parsed.shrinkPlatform };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: KungFuSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: KungFuSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): KungFuSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateKungFuSettings(next: Partial<KungFuSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useKungFuSettings(): KungFuSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
