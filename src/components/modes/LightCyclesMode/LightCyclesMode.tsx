import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { getEntryImages, getPreferredEntryImage } from '../../../utils/entryImages';
import { LightCycles } from './LightCycles';

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

export function LightCyclesMode(props: ModeViewProps) {
  const {
    entries,
    allEntries,
    eliminatedIds,
    winOrder,
    isRacing,
    currentWinner,
    onWinner,
    onRaceComplete,
    onShowFinalStandings,
    onStartRace,
    onResetRace,
  } = props;

  // Mode-internal state migrated from light-cycles App.tsx
  const [winnerDisplay, setWinnerDisplay] = useState<WinnerDisplay | null>(null);
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());
  const [takedowns, setTakedowns] = useState<Map<number, number>>(new Map());

  // Reset mode-internal state when the parent clears the race.
  // (Parent App also bumps `resetKey` on hard resets, which unmounts us — but
  // we still watch eliminatedIds defensively so a soft reset elsewhere clears
  // local state too.)
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerDisplay(null);
      setStandingImages(new Map());
      setTakedowns(new Map());
    }
  }, [eliminatedIds.length]);

  // Keep the local winner display banner in sync with the shared currentWinner
  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  const handleWinner = (
    winnerEntry: Entry,
    selectedImageDataUrl?: string,
    killerInfo?: KillerInfo
  ) => {
    const winnerImage = selectedImageDataUrl ?? getPreferredEntryImage(winnerEntry);
    const allImages = getEntryImages(winnerEntry);
    const remainingAfter = allEntries.filter(
      (e) => !eliminatedIds.includes(e.id) && e.id !== winnerEntry.id
    );
    const isLastPlayer = remainingAfter.length === 0;

    setWinnerDisplay({
      name: winnerEntry.name,
      imageDataUrl: winnerImage,
      allImages: allImages.length > 0 ? allImages : undefined,
      killerInfo,
      isLastPlayer,
    });

    if (winnerImage) {
      setStandingImages((prev) => new Map(prev).set(winnerEntry.id, winnerImage));
    }

    if (killerInfo && killerInfo.name !== 'Lava') {
      const killer = allEntries.find((e) => e.name === killerInfo.name);
      if (killer) {
        setTakedowns((prev) =>
          new Map(prev).set(killer.id, (prev.get(killer.id) || 0) + 1)
        );
      }
    }

    onWinner(winnerEntry, killerInfo ? { killerInfo } : undefined);
  };

  const handleAllDestroyed = () => {
    setWinnerDisplay({ name: '🔥 All Destroyed! 🔥' });
  };

  const handleReset = () => {
    setWinnerDisplay(null);
    setStandingImages(new Map());
    setTakedowns(new Map());
    onResetRace();
  };

  // Suppress unused-warning when standings/takedowns are read only by the
  // shared FinalStandingsDialog (which lives in the parent App). They are
  // tracked locally so a future per-mode standings dialog can consume them.
  void standingImages;
  void takedowns;

  return (
    <div className="light-cycles-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            ▶ Start Match ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={handleReset} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <LightCycles
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onAllDestroyed={handleAllDestroyed}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        currentWinnerImage={winnerDisplay?.imageDataUrl}
        currentWinnerImages={winnerDisplay?.allImages}
        currentWinnerKillerInfo={winnerDisplay?.killerInfo}
        currentWinnerIsLastPlayer={winnerDisplay?.isLastPlayer}
      />
    </div>
  );
}
