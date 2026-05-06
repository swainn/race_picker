export interface Entry {
  id: number;
  name: string;
  imageDataUrls?: string[];
  /** @deprecated Legacy single-image field. Tolerated on read; never written. */
  imageDataUrl?: string;
}
