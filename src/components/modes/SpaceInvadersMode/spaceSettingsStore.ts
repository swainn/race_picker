import { useSyncExternalStore } from 'react';
import type { Speed } from './invadersEngine';

/**
 * Persisted settings shared by the Space Invaders family (Invaders + Defenders).
 * Module-level singleton + useSyncExternalStore, matching the other modes.
 */
const STORAGE_KEY = 'gamified_picker_space_settings';

export interface SpaceSettings {
  /** March + fire pacing. */
  speed: Speed;
  /** Threat closes in fast so a kill resolves quickly. */
  suddenDeath: boolean;
  /** Invaders variant: participant aliens drop cosmetic bombs. */
  invadersShootBack: boolean;
  /** Defenders variant: draw classic shield bunkers (cosmetic). */
  defenderShields: boolean;
  /** Synthesized arcade sound effects. */
  sound: boolean;
  /** Random theatrical powers/protections on invaders (never bias the pick). */
  powerUps: boolean;
}

const DEFAULT_SETTINGS: SpaceSettings = {
  speed: 'normal',
  suddenDeath: false,
  invadersShootBack: true,
  defenderShields: true,
  sound: true,
  powerUps: true,
};

function loadSettings(): SpaceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SpaceSettings>;
    const speed: Speed =
      parsed.speed === 'slow' || parsed.speed === 'fast' ? parsed.speed : 'normal';
    return {
      speed,
      suddenDeath: !!parsed.suddenDeath,
      invadersShootBack: parsed.invadersShootBack ?? true,
      defenderShields: parsed.defenderShields ?? true,
      sound: parsed.sound ?? true,
      powerUps: parsed.powerUps ?? true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: SpaceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: SpaceSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): SpaceSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSpaceSettings(next: Partial<SpaceSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useSpaceSettings(): SpaceSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
