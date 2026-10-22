import { useRef, useState } from 'react';
import type { Entry, EntryImage, ImageCrop } from '../types';
import { MAX_PARTICIPANTS } from '../constants';
import { getEntryImages } from '../utils/entryImages';
import { INITIAL_CROP, SOURCE_MAX_PX, encodeCanvas, entryImageRecords } from '../utils/imageCrop';
import { ImageCropDialog } from './ImageCropDialog';
import './EntryManager.css';

/**
 * Whether any pixel is less than fully opaque. Sampled on a grid rather than
 * every pixel: a cut-out has large transparent regions, so a coarse sweep
 * finds it, and this runs on the UI thread during an upload.
 */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    const step = 4 * Math.max(1, Math.floor((width * height) / 4096));
    for (let i = 3; i < data.length; i += step) {
      if (data[i] < 250) return true;
    }
    // The border is where a cut-out is most likely to be transparent.
    for (let x = 0; x < width; x++) {
      if (data[(x + 0 * width) * 4 + 3] < 250) return true;
      if (data[(x + (height - 1) * width) * 4 + 3] < 250) return true;
    }
    return false;
  } catch {
    // Tainted canvas or similar: assume opaque and keep the smaller encoding.
    return false;
  }
}

interface Props {
  entries: Entry[];
  onEntriesChange: (entries: Entry[]) => void;
  eliminatedIds: number[];
  winOrder: Map<number, number>;
}

/** What the crop dialog is currently pointed at. */
interface CropTarget {
  entryId: number;
  /** Index being re-cropped, or null when this is a picture being added. */
  index: number | null;
  src: string;
  crop: ImageCrop;
  name: string;
  /** Position within a multi-file add, for the dialog title. */
  queued: { at: number; of: number } | null;
}

export const EntryManager: React.FC<Props> = ({ entries, onEntriesChange, eliminatedIds, winOrder }) => {
  const [input, setInput] = useState('');
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  /** Sources still waiting for a crop, when several files were picked at once. */
  const pendingRef = useRef<{ entryId: number; name: string; src: string }[]>([]);
  const pendingTotalRef = useRef(0);
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const addEntry = () => {
    if (input.trim() && entries.length < MAX_PARTICIPANTS) {
      const newEntry: Entry = {
        id: Date.now(),
        name: input.trim(),
      };
      onEntriesChange([...entries, newEntry]);
      setInput('');
    }
  };

  const removeEntry = (id: number) => {
    onEntriesChange(entries.filter((e) => e.id !== id));
    delete fileInputsRef.current[id];
  };

  const renameEntry = (id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onEntriesChange(entries.map((e) => (e.id === id ? { ...e, name: trimmed } : e)));
  };

  const startRename = (entry: Entry) => {
    setEditingNameId(entry.id);
    setNameDraft(entry.name);
  };

  const commitRename = () => {
    if (editingNameId !== null) renameEntry(editingNameId, nameDraft);
    setEditingNameId(null);
  };

  /**
   * Write both halves of an entry's pictures at once. `imageDataUrls` is what
   * every mode draws; `images` keeps the uncropped sources beside it so a crop
   * stays editable instead of being baked in.
   */
  const writePictures = (id: number, records: EntryImage[], urls: string[]) => {
    onEntriesChange(
      entries.map((entry) =>
        entry.id === id
          ? { ...entry, imageDataUrls: urls, images: records, imageDataUrl: undefined }
          : entry
      )
    );
  };

  /** Downscale an upload for storage. The crop is applied later, from this. */
  const readSource = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = reader.result;
        if (typeof raw !== 'string') {
          reject(new Error('Failed to read file.'));
          return;
        }
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(SOURCE_MAX_PX / img.width, SOURCE_MAX_PX / img.height, 1);
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Unable to process image.'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // Transparency has to survive: the avatars-only look in Whac-a-Mole
          // draws the source untouched, and a flattened cut-out would arrive
          // on a black square. WebP keeps alpha at roughly JPEG size; the
          // alpha check only matters for the PNG/JPEG fallback.
          resolve(encodeCanvas(canvas, hasTransparency(ctx, width, height)));
        };
        img.onerror = () => reject(new Error('Image could not be loaded.'));
        img.src = raw;
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  /** Open the crop dialog on the next queued upload, or close it when done. */
  const advanceQueue = () => {
    const next = pendingRef.current.shift();
    if (!next) {
      pendingTotalRef.current = 0;
      setCropTarget(null);
      return;
    }
    const at = pendingTotalRef.current - pendingRef.current.length;
    setCropTarget({
      entryId: next.entryId,
      index: null,
      src: next.src,
      crop: { ...INITIAL_CROP },
      name: next.name,
      queued: pendingTotalRef.current > 1 ? { at, of: pendingTotalRef.current } : null,
    });
  };

  const handleImageChange = async (id: number, files: FileList | undefined) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.some((file) => !file.type.startsWith('image/'))) {
      alert('Please choose an image file.');
      return;
    }
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;

    try {
      const sources = await Promise.all(selectedFiles.map((file) => readSource(file)));
      pendingRef.current = sources.map((src) => ({ entryId: id, name: entry.name, src }));
      pendingTotalRef.current = sources.length;
      advanceQueue();
    } catch (error) {
      console.error(error);
      alert('Unable to add this image. Try a different file.');
    }
  };

  const openRecrop = (entry: Entry, index: number) => {
    const records = entryImageRecords(entry);
    const record = records[index];
    if (!record) return;
    pendingRef.current = [];
    pendingTotalRef.current = 0;
    setCropTarget({
      entryId: entry.id,
      index,
      src: record.src,
      crop: record.crop,
      name: entry.name,
      queued: null,
    });
  };

  const handleCropConfirm = (crop: ImageCrop, croppedDataUrl: string) => {
    const target = cropTarget;
    if (!target) return;
    const entry = entries.find((item) => item.id === target.entryId);
    if (!entry) {
      advanceQueue();
      return;
    }
    const records = entryImageRecords(entry);
    const urls = getEntryImages(entry);

    if (target.index === null) {
      writePictures(
        entry.id,
        [...records, { src: target.src, crop }],
        [...urls, croppedDataUrl]
      );
    } else {
      const nextRecords = records.map((r, i) =>
        i === target.index ? { src: target.src, crop } : r
      );
      const nextUrls = urls.map((u, i) => (i === target.index ? croppedDataUrl : u));
      writePictures(entry.id, nextRecords, nextUrls);
    }
    advanceQueue();
  };

  /** Cancelling one of a batch skips just that picture, not the whole batch. */
  const handleCropCancel = () => {
    if (cropTarget?.index === null) advanceQueue();
    else setCropTarget(null);
  };

  const removeImageAtIndex = (id: number, imageIndex: number) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    writePictures(
      id,
      entryImageRecords(entry).filter((_, index) => index !== imageIndex),
      getEntryImages(entry).filter((_, index) => index !== imageIndex)
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addEntry();
    }
  };

  return (
    <div className="entry-manager">
      <div className="input-group">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter participant name..."
          maxLength={20}
          disabled={entries.length >= MAX_PARTICIPANTS}
          className="entry-input"
        />
        <button onClick={addEntry} disabled={entries.length >= MAX_PARTICIPANTS} className="add-button">
          + Add
        </button>
      </div>

      {entries.length >= MAX_PARTICIPANTS && (
        <p className="limit-message">Maximum {MAX_PARTICIPANTS} participants reached</p>
      )}

      <div className="entries-list">
        {entries.map((entry, idx) => {
          const isEliminated = eliminatedIds.includes(entry.id);
          const order = winOrder.get(entry.id);
          const images = getEntryImages(entry);
          const getOrdinal = (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };

          return (
            <div key={entry.id} className={`entry-item ${isEliminated ? 'eliminated' : ''}`}>
              <div className="entry-main-row">
                <span className="entry-number">{idx + 1}</span>
                <div className="entry-avatar" aria-hidden="true">
                  {images[0] ? (
                    <img src={images[0]} alt="" />
                  ) : (
                    <span>{entry.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                {editingNameId === entry.id ? (
                  <input
                    type="text"
                    className="entry-name-input"
                    value={nameDraft}
                    maxLength={20}
                    autoFocus
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingNameId(null);
                    }}
                    aria-label={`Rename ${entry.name}`}
                  />
                ) : (
                  <span className="entry-name">
                    {entry.name}
                    {images.length > 1 && <span className="image-count-badge">{images.length} pics</span>}
                    {isEliminated && order && <span className="eliminated-badge">{getOrdinal(order)}</span>}
                  </span>
                )}
                <div className="entry-actions">
                  <input
                    ref={(node) => {
                      fileInputsRef.current[entry.id] = node;
                    }}
                    type="file"
                    accept="image/*"
                    multiple
                    className="image-input-hidden"
                    onChange={(e) => {
                      void handleImageChange(entry.id, e.target.files ?? undefined);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => startRename(entry)}
                    className="rename-button"
                    title="Rename participant"
                    aria-label={`Rename ${entry.name}`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputsRef.current[entry.id]?.click()}
                    className="image-button"
                    title="Add participant images"
                  >
                    Add Image
                  </button>
                  {images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => writePictures(entry.id, [], [])}
                      className="remove-image-button"
                      title="Remove all participant images"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="remove-button"
                  title="Remove participant"
                >
                  ✕
                </button>
              </div>
              {images.length > 0 && (
                <div className="entry-gallery">
                  {images.map((imageDataUrl, imageIndex) => (
                    <div key={`${entry.id}-${imageIndex}`} className="entry-gallery-item">
                      <img src={imageDataUrl} alt="" className="entry-gallery-image" />
                      <button
                        type="button"
                        className="entry-gallery-crop"
                        title="Adjust crop"
                        onClick={() => openRecrop(entry, imageIndex)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="entry-gallery-remove"
                        title="Remove this image"
                        onClick={() => removeImageAtIndex(entry.id, imageIndex)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <p className="empty-message">Add at least 2 participants to start</p>
      )}

      {cropTarget && (
        <ImageCropDialog
          src={cropTarget.src}
          crop={cropTarget.crop}
          title={
            cropTarget.queued
              ? `${cropTarget.name} — picture ${cropTarget.queued.at} of ${cropTarget.queued.of}`
              : cropTarget.name
          }
          confirmLabel={cropTarget.index === null ? 'Add picture' : 'Save crop'}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
};
