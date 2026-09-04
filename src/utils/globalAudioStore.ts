/**
 * Global sound kill-switch, shared by every mode's audio module. Sits above
 * the per-mode sound/music settings: when muted here, nothing plays anywhere.
 * Module-level singleton + useSyncExternalStore, like the per-mode settings
 * stores, so non-React audio modules can read (and subscribe to) it directly.
 */
import { useSyncExternalStore } from 'react';
import { loadFromStorage, saveToStorage } from './storage';

const STORAGE_KEY = 'gamified_picker_global_muted';

let muted: boolean = loadFromStorage<boolean>(STORAGE_KEY, false);
const listeners = new Set<() => void>();

export function isGlobalMuted(): boolean {
  return muted;
}

export function setGlobalMuted(m: boolean): void {
  if (m === muted) return;
  muted = m;
  saveToStorage(STORAGE_KEY, m);
  listeners.forEach((l) => l());
}

export function subscribeGlobalMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGlobalMuted(): boolean {
  return useSyncExternalStore(subscribeGlobalMuted, isGlobalMuted);
}
