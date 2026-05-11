import { useSyncExternalStore } from 'react';

export type VehicleMode =
  | 'car'
  | 'boat'
  | 'plane'
  | 'balloon'
  | 'rocket'
  | 'duck'
  | 'snail'
  | 'turtle'
  | 'cat'
  | 'dog';

export type RacingSubMode = VehicleMode | 'mixed';

export const RACING_SUB_MODES: { value: RacingSubMode; label: string }[] = [
  { value: 'car', label: '🚗 Cars' },
  { value: 'boat', label: '⛵ Boats' },
  { value: 'plane', label: '✈️ Planes' },
  { value: 'balloon', label: '🎈 Balloons' },
  { value: 'rocket', label: '🚀 Rockets' },
  { value: 'duck', label: '🦆 Ducks' },
  { value: 'snail', label: '🐌 Snails' },
  { value: 'turtle', label: '🐢 Turtles' },
  { value: 'cat', label: '🐱 Cats' },
  { value: 'dog', label: '🐶 Dogs' },
  { value: 'mixed', label: '🎲 Mixed' },
];

let current: RacingSubMode = 'car';
const listeners = new Set<() => void>();

function getSnapshot(): RacingSubMode {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRacingSubMode(next: RacingSubMode): void {
  if (current === next) return;
  current = next;
  listeners.forEach((l) => l());
}

export function useRacingSubMode(): [RacingSubMode, (next: RacingSubMode) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot);
  return [value, setRacingSubMode];
}
