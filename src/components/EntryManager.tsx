import { useState } from 'react';
import type { Entry } from '../types';
import './EntryManager.css';

interface Props {
  entries: Entry[];
  onEntriesChange: (entries: Entry[]) => void;
  eliminatedIds: number[];
  winOrder: Map<number, number>;
}

export const EntryManager: React.FC<Props> = ({ entries, onEntriesChange, eliminatedIds, winOrder }) => {
  const [input, setInput] = useState('');

  const addEntry = () => {
    if (input.trim() && entries.length < 12) {
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
          disabled={entries.length >= 12}
          className="entry-input"
        />
        <button onClick={addEntry} disabled={entries.length >= 12} className="add-button">
          + Add
        </button>
      </div>

      {entries.length >= 12 && (
        <p className="limit-message">Maximum 12 participants reached</p>
      )}

      <div className="entries-list">
        {entries.map((entry, idx) => {
          const isEliminated = eliminatedIds.includes(entry.id);
          const order = winOrder.get(entry.id);
          const getOrdinal = (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };
          
          return (
            <div key={entry.id} className={`entry-item ${isEliminated ? 'eliminated' : ''}`}>
              <span className="entry-number">{idx + 1}</span>
              <span className="entry-name">
                {entry.name}
                {isEliminated && order && <span className="eliminated-badge">{getOrdinal(order)}</span>}
              </span>
              <button
                onClick={() => removeEntry(entry.id)}
                className="remove-button"
                title="Remove participant"
              >
                ✕
              </button>
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
