import { useSyncExternalStore } from 'react';
import type { ShipSizesMode } from './battleshipPlacement';
import type { Visibility } from './BattleshipGrid';

export type PersistentLayout = 'off' | 'on';

export interface BattleshipSettings {
  shipSizes: ShipSizesMode;
  visibility: Visibility;
  persistentLayout: PersistentLayout;
}

const SETTINGS_KEY = 'gamified_picker_battleship_settings';

const DEFAULT_SETTINGS: BattleshipSettings = {
  shipSizes: 'uniform',
  visibility: 'ghosted',
  persistentLayout: 'off',
};

function loadSettings(): BattleshipSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BattleshipSettings>;
    return {
      shipSizes: parsed.shipSizes === 'random' ? 'random' : 'uniform',
      visibility:
        parsed.visibility === 'hidden' || parsed.visibility === 'visible'
          ? parsed.visibility
          : 'ghosted',
      persistentLayout: parsed.persistentLayout === 'on' ? 'on' : 'off',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: BattleshipSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: BattleshipSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): BattleshipSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateBattleshipSettings(next: Partial<BattleshipSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useBattleshipSettings(): BattleshipSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
