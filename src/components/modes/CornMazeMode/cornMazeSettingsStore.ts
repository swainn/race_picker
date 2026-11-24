import { useSyncExternalStore } from 'react';

/** Persisted settings for Corn Maze — module singleton + useSyncExternalStore. */
const STORAGE_KEY = 'gamified_picker_corn_maze_settings';

export type MazeSpeed = 'slow' | 'normal' | 'fast';

export interface CornMazeSettings {
  speed: MazeSpeed;
  /** Use participant photos as the runners' tokens. */
  useAvatars: boolean;
  sound: boolean;
  music: boolean;
}

const DEFAULT_SETTINGS: CornMazeSettings = {
  speed: 'normal',
  useAvatars: true,
  sound: true,
  music: true,
};

function loadSettings(): CornMazeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CornMazeSettings>;
    const speed: MazeSpeed =
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

function saveSettings(s: CornMazeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/serialization errors */
  }
}

let current: CornMazeSettings = loadSettings();
const listeners = new Set<() => void>();

function getSnapshot(): CornMazeSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateCornMazeSettings(next: Partial<CornMazeSettings>): void {
  current = { ...current, ...next };
  saveSettings(current);
  listeners.forEach((l) => l());
}

export function useCornMazeSettings(): CornMazeSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * How fast race time runs against real time. A time scale, so bigger is
 * faster — the inverse of Trick-or-Treat's duration multiplier.
 */
export function mazeTimeScale(speed: MazeSpeed): number {
  return speed === 'slow' ? 0.75 : speed === 'fast' ? 1.45 : 1;
}
