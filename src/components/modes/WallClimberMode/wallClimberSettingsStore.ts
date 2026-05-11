import { useSyncExternalStore } from 'react';

export type ClimberMode =
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'rocket'
  | 'duck'
  | 'snail'
  | 'cat'
  | 'dog';

export type WallClimberSubMode = ClimberMode | 'mixed';

export const WALL_CLIMBER_SUB_MODES: { value: WallClimberSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

let current: WallClimberSubMode = 'car';
const listeners = new Set<() => void>();

function getSnapshot(): WallClimberSubMode {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setWallClimberSubMode(next: WallClimberSubMode): void {
  if (current === next) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useWallClimberSubMode(): [WallClimberSubMode, (next: WallClimberSubMode) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot);
  return [value, setWallClimberSubMode];
}
