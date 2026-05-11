import { useSyncExternalStore } from 'react';
import { setMuted as audioSetMuted, SOUND_OPTIONS, type SoundType } from './audio';

const SOUND_STORAGE_KEY = 'wheel_mode_sound';
const MUTE_STORAGE_KEY = 'wheel_mode_muted';

export interface WheelSettings {
  soundType: SoundType;
  muted: boolean;
}

function loadSoundType(): SoundType {
  try {
    const v = localStorage.getItem(SOUND_STORAGE_KEY);
    if (!v) return 'classic';
    const known = SOUND_OPTIONS.some((o) => o.value === v);
    return known ? (v as SoundType) : 'classic';
  } catch {
    return 'classic';
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let current: WheelSettings = {
  soundType: loadSoundType(),
  muted: loadMuted(),
};

audioSetMuted(current.muted);

const listeners = new Set<() => void>();

function getSnapshot(): WheelSettings {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setWheelSoundType(next: SoundType): void {
  if (current.soundType === next) return;
  current = { ...current, soundType: next };
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function setWheelMuted(next: boolean): void {
  if (current.muted === next) return;
  current = { ...current, muted: next };
  audioSetMuted(next);
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useWheelSettings(): WheelSettings {
  return useSyncExternalStore(subscribe, getSnapshot);
}
