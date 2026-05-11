import type { Entry } from '../types';

export function getEntryImages(entry: Entry): string[] {
  return entry.imageDataUrls ?? (entry.imageDataUrl ? [entry.imageDataUrl] : []);
}

export function getPreferredEntryImage(entry: Entry): string | undefined {
  return getEntryImages(entry)[0];
}

export function pickRandomEntryImage(entry: Entry): string | undefined {
  const images = getEntryImages(entry);
  if (images.length === 0) return undefined;
  return images[Math.floor(Math.random() * images.length)];
}
