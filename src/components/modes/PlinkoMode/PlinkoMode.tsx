import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { PlinkoGame } from './PlinkoGame';

interface WinnerEffects {
  fire: boolean;
  ice: boolean;
  green: boolean;
  lightning: boolean;
}

interface WinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  effects?: WinnerEffects;
}

function getEntryImages(entry: Entry): string[] {
  return entry.imageDataUrls ?? (entry.imageDataUrl ? [entry.imageDataUrl] : []);
}

function getPreferredEntryImage(entry: Entry): string | undefined {
  return getEntryImages(entry)[0];
}

export function PlinkoMode(props: ModeViewProps) {
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

  // Mode-internal state migrated from plinko App.tsx:
  // - winnerDisplay: snapshot of the most recent winner with their image + effects,
  //   so PlinkoGame can render the celebration banner correctly.
  // - standingImages / standingEffects: per-eliminated-entry data tracked locally
  //   so a future per-mode standings dialog can consume them. (The shared
  //   FinalStandingsDialog in the parent App ignores these for now.)
  const [winnerDisplay, setWinnerDisplay] = useState<WinnerDisplay | null>(null);
  const [standingImages, setStandingImages] = useState<Map<number, string>>(new Map());
  const [standingEffects, setStandingEffects] = useState<Map<number, WinnerEffects>>(new Map());

  // Reset mode-internal state when the parent clears the race.
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerDisplay(null);
      setStandingImages(new Map());
      setStandingEffects(new Map());
    }
  }, [eliminatedIds.length]);

  // Keep the local winner banner in sync with the shared currentWinner.
  useEffect(() => {
    if (currentWinner === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerDisplay(null);
    }
  }, [currentWinner]);

  const handleWinner = (
    winnerEntry: Entry,
    selectedImageDataUrl?: string,
    effects?: WinnerEffects
  ) => {
    const winnerImage = selectedImageDataUrl ?? getPreferredEntryImage(winnerEntry);
    const allImages = getEntryImages(winnerEntry);

    setWinnerDisplay({
      name: winnerEntry.name,
      imageDataUrl: winnerImage,
      allImages: allImages.length > 0 ? allImages : undefined,
      effects,
    });

    if (winnerImage) {
      setStandingImages((prev) => new Map(prev).set(winnerEntry.id, winnerImage));
    }
    if (effects) {
      setStandingEffects((prev) => new Map(prev).set(winnerEntry.id, effects));
    }

    onWinner(winnerEntry, effects ? { effects } : undefined);
  };

  const handleReset = () => {
    setWinnerDisplay(null);
    setStandingImages(new Map());
    setStandingEffects(new Map());
    onResetRace();
  };

  // Tracked locally for a future per-mode standings dialog; not yet read by
  // the shared FinalStandingsDialog in the parent App.
  void standingImages;
  void standingEffects;

  return (
    <div className="plinko-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            🎯 Drop Ball ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={handleReset} className="reset-race-button">
            🔄 Reset
          </button>
        )}
      </div>

      <PlinkoGame
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={currentWinner}
        currentWinnerImage={winnerDisplay?.imageDataUrl}
        currentWinnerImages={winnerDisplay?.allImages}
        currentWinnerEffects={winnerDisplay?.effects}
        mode="plinko"
      />
    </div>
  );
}
