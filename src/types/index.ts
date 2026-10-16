/** A picture as uploaded, plus where its circular crop sits. */
export interface EntryImage {
  /** The uploaded picture, downscaled but uncropped, so the crop stays editable. */
  src: string;
  crop: ImageCrop;
}

/**
 * A circular crop over a source image.
 *
 * `cx`/`cy` are the circle's centre as a fraction of the image's width and
 * height; `zoom` is its diameter as a fraction of the image's *shorter* side,
 * so 1 is the largest circle that fits whatever the aspect ratio.
 */
export interface ImageCrop {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Entry {
  id: number;
  name: string;
  /**
   * The cropped squares every consumer draws. Derived from `images`, and
   * regenerated whenever a crop is edited.
   */
  imageDataUrls?: string[];
  /**
   * Sources and crops, parallel to `imageDataUrls`. Absent on entries saved
   * before cropping existed — those fall back to treating the stored square as
   * its own source (see utils/imageCrop.ts).
   */
  images?: EntryImage[];
  /** @deprecated Legacy single-image field. Tolerated on read; never written. */
  imageDataUrl?: string;
}
