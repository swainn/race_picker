import { useEffect, useState } from 'react';
import type { Entry } from './types';
import { EntryManager } from './components/EntryManager';
import { BattleArena } from './components/BattleArena';
import './App.css';

const STORAGE_KEY = 'gamified_picker_entries';
const GROUPS_STORAGE_KEY = 'gamified_picker_groups';
const IMAGE_CACHE_KEY = 'gamified_picker_image_cache';

interface Group {
  id: number;
  name: string;
  entries: Entry[];
  timestamp: number;
}

interface RaceSnapshot {
  eliminatedIds: number[];
  winOrderEntries: [number, number][];
  standingImageEntries: [number, string][];
  takedownEntries: [number, number][];
}

interface KillerInfo {
  name: string;
  weapon: string;
}

interface WinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  killerInfo?: KillerInfo;
  isLastPlayer?: boolean;
}

function normalizeEntry(entry: Entry): Entry {
  const imageDataUrls = Array.isArray(entry.imageDataUrls)
    ? entry.imageDataUrls.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  if (imageDataUrls.length > 0) {
    return {
      id: entry.id,
      name: entry.name,
      imageDataUrls
    };
  }

  return {
    id: entry.id,
    name: entry.name,
    imageDataUrls: entry.imageDataUrl ? [entry.imageDataUrl] : []
  };
}

function normalizeEntries(entries: Entry[]): Entry[] {
  return entries.map(normalizeEntry);
}

function normalizeGroups(groups: Group[]): Group[] {
  return groups.map((group) => ({
    ...group,
    entries: normalizeEntries(group.entries)
  }));
}

function getEntryImages(entry: Entry): string[] {
  return entry.imageDataUrls ?? (entry.imageDataUrl ? [entry.imageDataUrl] : []);
}

function getPreferredEntryImage(entry: Entry): string | undefined {
  return getEntryImages(entry)[0];
}

// Load initial state from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error(`Failed to load ${key}`, e);
    return defaultValue;
  }
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(() => normalizeEntries(loadFromStorage(STORAGE_KEY, [])));
  const [eliminatedIds, setEliminatedIds] = useState<number[]>([]);
  const [winOrder, setWinOrder] = useState<Map<number, number>>(new Map());
  const [winner, setWinner] = useState<WinnerDisplay | null>(null);
  const [showRace, setShowRace] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [showFinalStandings, setShowFinalStandings] = useState(false);
  const [groups, setGroups] = useState<Group[]>(() => normalizeGroups(loadFromStorage(GROUPS_STORAGE_KEY, [])));
  const [groupNameInput, setGroupNameInput] = useState('');
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [lastRaceSnapshot, setLastRaceSnapshot] = useState<RaceSnapshot | null>(null);
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());
  const [takedowns, setTakedowns] = useState<Map<number, number>>(new Map());
  const [imageCache, setImageCache] = useState<Map<number, string[]>>(() => {
    const cached = loadFromStorage<Record<string, string[]>>(IMAGE_CACHE_KEY, {});
    return new Map(Object.entries(cached).map(([key, val]) => [Number(key), val]));
  });

  // Save entries to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  // Save image cache to localStorage whenever it changes
  useEffect(() => {
    const cacheObj = Object.fromEntries(imageCache);
    localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cacheObj));
  }, [imageCache]);

  const handleEntriesChange = (newEntries: Entry[]) => {
    const normalizedEntries = normalizeEntries(newEntries);
    setEntries(normalizedEntries);
    // Clean up eliminated IDs if entries are removed from the list
    setEliminatedIds((prev) => prev.filter((id) => normalizedEntries.some((e) => e.id === id)));
    // Clean up win order
    setWinOrder((prev) => {
      const newMap = new Map(prev);
      newMap.forEach((_, id) => {
        if (!normalizedEntries.some((e) => e.id === id)) {
          newMap.delete(id);
        }
      });
      return newMap;
    });
    setStandingImages((prev) => {
      const nextMap = new Map(prev);
      nextMap.forEach((_, id) => {
        if (!normalizedEntries.some((entry) => entry.id === id)) {
          nextMap.delete(id);
        }
      });
      return nextMap;
    });
    // Update image cache with images from normalized entries and clean up deleted entries
    setImageCache((prev) => {
      const nextCache = new Map(prev);
      normalizedEntries.forEach((entry) => {
        const images = getEntryImages(entry);
        if (images.length > 0) {
          nextCache.set(entry.id, images);
        }
      });
      // Remove cache entries for deleted participants
      prev.forEach((_, id) => {
        if (!normalizedEntries.some((e) => e.id === id)) {
          nextCache.delete(id);
        }
      });
      return nextCache;
    });
    // Reset track view when entries change
    setResetKey((prev) => prev + 1);
  };

  const handleWinner = (winnerEntry: Entry, selectedImageDataUrl?: string, killerInfo?: KillerInfo) => {
    const winnerImage = selectedImageDataUrl ?? getPreferredEntryImage(winnerEntry);
    const allImages = getEntryImages(winnerEntry);
    // Check if this is the last remaining player (the overall winner)
    const remainingAfter = entries.filter((e) => !eliminatedIds.includes(e.id) && e.id !== winnerEntry.id);
    const isLastPlayer = remainingAfter.length === 0;
    setWinner({
      name: winnerEntry.name,
      imageDataUrl: winnerImage,
      allImages: allImages.length > 0 ? allImages : undefined,
      killerInfo,
      isLastPlayer
    });
    // Add winner to eliminated list and track order
    setEliminatedIds((prev) => [...prev, winnerEntry.id]);
    setWinOrder((prev) => new Map(prev).set(winnerEntry.id, prev.size + 1));
    if (winnerImage) {
      setStandingImages((prev) => new Map(prev).set(winnerEntry.id, winnerImage));
    }
    // Credit the killer with a takedown
    if (killerInfo && killerInfo.name !== 'Lava') {
      const killer = entries.find((e) => e.name === killerInfo.name);
      if (killer) {
        setTakedowns((prev) => new Map(prev).set(killer.id, (prev.get(killer.id) || 0) + 1));
      }
    }
    // Stop the race to show winner dialog
    setShowRace(false);
  };

  const handleAllDestroyed = () => {
    // All balls were destroyed by fire walls - show dialog but don't eliminate anyone
    setWinner({ name: '🔥 All Destroyed! 🔥' });
    // Stop the race to show dialog
    setShowRace(false);
    // Note: We don't add anyone to eliminatedIds, so everyone races again
  };

  const handleRaceComplete = () => {
    // This is called when user clicks "Next Race" button
    setWinner(null);
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    
    // If only 1 racer left, close dialog briefly then declare them winner
    if (activeEntries.length === 1) {
      setTimeout(() => {
        handleWinner(activeEntries[0]);
      }, 300);
      return;
    }
    
    // Automatically start the next race
    if (activeEntries.length >= 2) {
      setLastRaceSnapshot({
        eliminatedIds: [...eliminatedIds],
        winOrderEntries: Array.from(winOrder.entries()),
        standingImageEntries: Array.from(standingImages.entries())
      });
      setResetKey((prev) => prev + 1);
      setShowRace(true);
    }
  };

  const startRace = () => {
    const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));
    if (activeEntries.length < 1) {
      alert('Add at least 1 participant to start a race!');
      return;
    }
    
    // If only 1 racer left, close any open dialog then declare them winner
    if (activeEntries.length === 1) {
      setWinner(null);
      setTimeout(() => {
        handleWinner(activeEntries[0]);
      }, 300);
      return;
    }
    
    setLastRaceSnapshot({
      eliminatedIds: [...eliminatedIds],
      winOrderEntries: Array.from(winOrder.entries()),
      standingImageEntries: Array.from(standingImages.entries()),
      takedownEntries: Array.from(takedowns.entries())
    });
    setResetKey((prev) => prev + 1);
    setWinner(null);
    setShowRace(true);
  };

  const redoLastRace = () => {
    if (!lastRaceSnapshot) {
      alert('No race to redo yet. Start a race first.');
      return;
    }

    setEliminatedIds([...lastRaceSnapshot.eliminatedIds]);
    setWinOrder(new Map(lastRaceSnapshot.winOrderEntries));
    setStandingImages(new Map(lastRaceSnapshot.standingImageEntries));
    setTakedowns(new Map(lastRaceSnapshot.takedownEntries));
    setWinner(null);
    setShowFinalStandings(false);
    setResetKey((prev) => prev + 1);
    setShowRace(true);
  };

  const resetRace = () => {
    // Reset eliminations, bringing all participants back to race
    setEliminatedIds([]);
    setWinOrder(new Map());
    setWinner(null);
    setStandingImages(new Map());
    setTakedowns(new Map());
    setShowRace(false);
    setShowFinalStandings(false);
    setLastRaceSnapshot(null);
    setResetKey((prev) => prev + 1); // Force track to reset
  };

  const resetAllEntries = () => {
    if (window.confirm('Clear all participants from the list?')) {
      setEntries([]);
      setEliminatedIds([]);
      setWinOrder(new Map());
      setWinner(null);
      setStandingImages(new Map());
      setTakedowns(new Map());
      setShowRace(false);
      setShowFinalStandings(false);
      setLastRaceSnapshot(null);
    }
  };

  const saveGroup = () => {
    if (entries.length === 0) {
      alert('Cannot save an empty group!');
      return;
    }
    
    const groupName = groupNameInput.trim() || `Group ${new Date().toLocaleDateString()}`;
    
    // Strip images from entries before storing to reduce localStorage size
    const entriesWithoutImages: Entry[] = entries.map((entry) => ({
      id: entry.id,
      name: entry.name
    }));
    
    const newGroup: Group = {
      id: Date.now(),
      name: groupName,
      entries: entriesWithoutImages,
      timestamp: Date.now()
    };
    
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    setGroupNameInput('');
    alert(`Group "${groupName}" saved successfully!`);
  };

  const loadGroup = (groupId: number) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      // Enrich entries with images from imageCache
      const enrichedEntries = group.entries.map((entry) => {
        const cachedImages = imageCache.get(entry.id);
        return {
          ...entry,
          imageDataUrls: cachedImages && cachedImages.length > 0 ? cachedImages : undefined
        };
      });
      setEntries(enrichedEntries);
      setEliminatedIds([]);
      setWinOrder(new Map());
      setWinner(null);
      setStandingImages(new Map());
      setTakedowns(new Map());
      setShowRace(false);
      setShowFinalStandings(false);
      setLastRaceSnapshot(null);
    }
  };

  const deleteGroup = (groupId: number) => {
    if (window.confirm('Delete this group?')) {
      const updatedGroups = groups.filter(g => g.id !== groupId);
      setGroups(updatedGroups);
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updatedGroups));
    }
  };

  const activeEntries = entries.filter((e) => !eliminatedIds.includes(e.id));

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>⚔️ Aquaveo Battle Bots</h1>
            <p>The Random Selection Tool for Winners!</p>
          </div>
          <button onClick={() => setShowManagementModal(true)} className="header-management-button" aria-label="Manage participants and groups">
            ⚙️
          </button>
        </div>
      </header>

      <div className="app-container">
        <div className="main-content">
          <div className="race-controls">
            {activeEntries.length >= 1 && (
              <button onClick={startRace} className="start-race-button">
                ⚔️ Start Battle ({activeEntries.length})
              </button>
            )}

            {eliminatedIds.length > 0 && (
              <button onClick={resetRace} className="reset-race-button">
                🔄 Reset Battle
              </button>
            )}

            {lastRaceSnapshot && (
              <button onClick={redoLastRace} className="redo-race-button">
                ↻ Redo Last Battle
              </button>
            )}
          </div>

          <BattleArena
            key={resetKey}
            entries={activeEntries}
            allEntries={entries}
            eliminatedIds={eliminatedIds}
            winOrder={winOrder}
            onWinner={handleWinner}
            onRaceComplete={handleRaceComplete}
            onAllDestroyed={handleAllDestroyed}
            onShowFinalStandings={() => setShowFinalStandings(true)}
            isRacing={showRace}
            currentWinner={winner?.name ?? null}
            currentWinnerImage={winner?.imageDataUrl}
            currentWinnerImages={winner?.allImages}
            currentWinnerKillerInfo={winner?.killerInfo}
            currentWinnerIsLastPlayer={winner?.isLastPlayer}
          />

          {showFinalStandings && (
            <FinalStandingsDialog
              entries={entries}
              winOrder={winOrder}
              standingImages={standingImages}
              takedowns={takedowns}
              onClose={() => setShowFinalStandings(false)}
            />
          )}
        </div>
      </div>
      
      {showManagementModal && (
        <ManagementDialog
          entries={entries}
          onEntriesChange={handleEntriesChange}
          eliminatedIds={eliminatedIds}
          winOrder={winOrder}
          onResetAll={resetAllEntries}
          groupNameInput={groupNameInput}
          onGroupNameInputChange={setGroupNameInput}
          onSaveGroup={saveGroup}
          groups={groups}
          onLoadGroup={loadGroup}
          onDeleteGroup={deleteGroup}
          onClose={() => setShowManagementModal(false)}
        />
      )}
    </div>
  );
}

export default App;

interface ManagementDialogProps {
  entries: Entry[];
  onEntriesChange: (entries: Entry[]) => void;
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onResetAll: () => void;
  groupNameInput: string;
  onGroupNameInputChange: (value: string) => void;
  onSaveGroup: () => void;
  groups: Group[];
  onLoadGroup: (groupId: number) => void;
  onDeleteGroup: (groupId: number) => void;
  onClose: () => void;
}

function ManagementDialog({ 
  entries, 
  onEntriesChange, 
  eliminatedIds, 
  winOrder, 
  onResetAll,
  groupNameInput,
  onGroupNameInputChange,
  onSaveGroup,
  groups,
  onLoadGroup,
  onDeleteGroup,
  onClose 
}: ManagementDialogProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="management-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="management-header">
          <h2>⚙️ Manage Participants & Groups</h2>
          <button
            type="button"
            className="management-close-x"
            aria-label="Close management dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="management-body">
          {/* Participants Section */}
          <div className="management-section">
            <h3 className="section-title">👥 Participants</h3>
            <EntryManager 
              entries={entries} 
              onEntriesChange={onEntriesChange}
              eliminatedIds={eliminatedIds}
              winOrder={winOrder}
            />
            {entries.length > 0 && (
              <button onClick={onResetAll} className="reset-button-modal">
                Clear All Participants
              </button>
            )}
          </div>

          {/* Groups Section */}
          <div className="management-section">
            <h3 className="section-title">💾 Groups</h3>
            
            <div className="save-group-box">
              <p className="save-group-label">Save current participants as a group:</p>
              <div className="save-group-controls">
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => onGroupNameInputChange(e.target.value)}
                  placeholder="Group name (optional)..."
                  className="group-name-input-modal"
                  onKeyPress={(e) => e.key === 'Enter' && onSaveGroup()}
                />
                <button onClick={onSaveGroup} className="save-group-button-modal" disabled={entries.length === 0}>
                  Save Group
                </button>
              </div>
            </div>

            {groups.length > 0 ? (
              <div className="saved-groups-box">
                <p className="saved-groups-label">Saved groups ({groups.length}):</p>
                <div className="groups-list-modal">
                  {groups.map((group) => (
                    <div key={group.id} className="group-item-modal">
                      <div className="group-info-modal">
                        <p className="group-name-modal">{group.name}</p>
                        <p className="group-meta">
                          {group.entries.length} participants • {formatDate(group.timestamp)}
                        </p>
                      </div>
                      <div className="group-buttons-modal">
                        <button onClick={() => { onLoadGroup(group.id); onClose(); }} className="load-group-button-modal">
                          Load
                        </button>
                        <button onClick={() => onDeleteGroup(group.id)} className="delete-group-button-modal">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="no-groups-message">No saved groups yet. Save your current participants to create a group!</p>
            )}
          </div>
          
          <button onClick={onClose} className="close-management-button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface FinalStandingsProps {
  entries: Entry[];
  winOrder: Map<number, number>;
  standingImages: Map<number, string>;
  takedowns: Map<number, number>;
  onClose: () => void;
}

function FinalStandingsDialog({ entries, winOrder, standingImages, takedowns, onClose }: FinalStandingsProps) {
  // Last standing = 1st place, then rank by kill count (desc), then elimination order (later = better)
  const lastPlace = Math.max(...Array.from(winOrder.values()));
  const standings = entries
    .filter((e) => winOrder.has(e.id))
    .sort((a, b) => {
      const aOrder = winOrder.get(a.id) || 0;
      const bOrder = winOrder.get(b.id) || 0;
      // Last standing (highest winOrder) is always 1st
      if (aOrder === lastPlace) return -1;
      if (bOrder === lastPlace) return 1;
      // Everyone else: sort by kill count descending, then elimination order (later = better)
      const aKills = takedowns.get(a.id) || 0;
      const bKills = takedowns.get(b.id) || 0;
      if (bKills !== aKills) return bKills - aKills;
      return bOrder - aOrder;
    });

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="standings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="standings-header">
          <h2>🏆 Final Standings 🏆</h2>
          <button
            type="button"
            className="standings-close-x"
            aria-label="Close final standings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="standings-body">
          <div className="standings-list">
            {standings.map((entry, idx) => (
              <div key={entry.id} className="standing-entry">
                <span className="standing-rank">{getOrdinal(idx + 1)}</span>
                {(() => {
                  const allImages = getEntryImages(entry);
                  if (allImages.length > 1) {
                    return (
                      <div className="standing-avatars-gallery" aria-hidden="true">
                        {allImages.map((img, imgIdx) => (
                          <div key={imgIdx} className="standing-avatar-small">
                            <img src={img} alt="" className="standing-avatar-image" />
                          </div>
                        ))}
                      </div>
                    );
                  }
                  const singleImage = allImages[0] ?? standingImages.get(entry.id);
                  return (
                    <div className="standing-avatar" aria-hidden="true">
                      {singleImage ? (
                        <img src={singleImage} alt="" className="standing-avatar-image" />
                      ) : (
                        <span>{entry.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  );
                })()}
                <span className="standing-name">{entry.name}</span>
                {(takedowns.get(entry.id) || 0) > 0 && (
                  <span className="standing-takedowns" title="Takedowns">
                    💥 {takedowns.get(entry.id)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="close-standings-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
