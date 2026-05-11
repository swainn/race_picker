import { useRef, useState } from 'react';
import type { Entry } from '../types';
import { getEntryImages } from '../utils/entryImages';
import './EntryManager.css';

interface Props {
  entries: Entry[];
  onEntriesChange: (entries: Entry[]) => void;
  eliminatedIds: number[];
  winOrder: Map<number, number>;
}

export const EntryManager: React.FC<Props> = ({ entries, onEntriesChange, eliminatedIds, winOrder }) => {
  const [input, setInput] = useState('');
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  const addEntry = () => {
    if (input.trim() && entries.length < 20) {
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

  const updateEntryImages = (id: number, imageDataUrls: string[]) => {
    onEntriesChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, imageDataUrls, imageDataUrl: undefined } : entry
      )
    );
  };

  const resizeImageToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const raw = reader.result;
        if (typeof raw !== 'string') {
          reject(new Error('Failed to read file.'));
          return;
        }

        const img = new Image();
        img.onload = () => {
          const MAX_SIZE = 160;
          const scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height, 1);
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
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };

        img.onerror = () => reject(new Error('Image could not be loaded.'));
        img.src = raw;
      };

      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (id: number, files: FileList | undefined) => {
    if (!files || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files);
    if (selectedFiles.some((file) => !file.type.startsWith('image/'))) {
      alert('Please choose an image file.');
      return;
    }

    try {
      const dataUrls = await Promise.all(selectedFiles.map((file) => resizeImageToDataUrl(file)));
      const entry = entries.find((item) => item.id === id);
      const existingImages = entry ? getEntryImages(entry) : [];
      updateEntryImages(id, [...existingImages, ...dataUrls]);
    } catch (error) {
      console.error(error);
      alert('Unable to add this image. Try a different file.');
    }
  };

  const removeImageAtIndex = (id: number, imageIndex: number) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
      return;
    }

    updateEntryImages(
      id,
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
          disabled={entries.length >= 20}
          className="entry-input"
        />
        <button onClick={addEntry} disabled={entries.length >= 20} className="add-button">
          + Add
        </button>
      </div>

      {entries.length >= 20 && (
        <p className="limit-message">Maximum 20 participants reached</p>
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
                <span className="entry-name">
                  {entry.name}
                  {images.length > 1 && <span className="image-count-badge">{images.length} pics</span>}
                  {isEliminated && order && <span className="eliminated-badge">{getOrdinal(order)}</span>}
                </span>
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
                    onClick={() => fileInputsRef.current[entry.id]?.click()}
                    className="image-button"
                    title="Add participant images"
                  >
                    Add Image
                  </button>
                  {images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateEntryImages(entry.id, [])}
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
    </div>
  );
};
