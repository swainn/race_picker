import { useEffect, useState } from 'react';
import type { Entry } from '../../../types';
import type { ModeViewProps } from '../types';
import { BattleArena } from './BattleArena';

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

function getEntryImages(entry: Entry): string[] {
  if (Array.isArray(entry.imageDataUrls) && entry.imageDataUrls.length > 0) {
    return entry.imageDataUrls.filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
  }
  return entry.imageDataUrl ? [entry.imageDataUrl] : [];
}

function getPreferredEntryImage(entry: Entry): string | undefined {
  return getEntryImages(entry)[0];
}

export function BattleBotsMode(props: ModeViewProps) {
  const {
    entries,
    allEntries,
    eliminatedIds,
    winOrder,
    isRacing,
    onWinner,
    onRaceComplete,
    onShowFinalStandings,
    onStartRace,
    onResetRace,
  } = props;

  // Mode-internal state extracted from battle-bots App.tsx (minus shared race
  // state which now lives in the parent App). takedowns and standingImages
  // are kept here for parity with the source so a battle-bots-flavored final
  // standings (with takedown counts and per-entry images) can be added later
  // without re-plumbing the wrapper. The shared FinalStandings dialog at App
  // level currently does not consume them.
  const [takedowns, setTakedowns] = useState<Map<number, number>>(new Map());
  const [standingImages, setStandingImages] = useState<Map<number, string>>(
    new Map()
  );
  const [winnerDisplay, setWinnerDisplay] = useState<WinnerDisplay | null>(null);

  // Reference the recorded state so eslint's no-unused-vars doesn't strip it;
  // these values are intentionally captured for future battle-bots standings.
  void takedowns;
  void standingImages;

  /* Reset all mode-internal state whenever the parent race resets
     (eliminatedIds goes back to empty — covers Reset, Clear All, and
     mode-switch reset). This is the parent-prop-change reset pattern; the
     react-hooks set-state-in-effect warning is intentional here. */
  useEffect(() => {
    if (eliminatedIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTakedowns(new Map());
      setStandingImages(new Map());
      setWinnerDisplay(null);
    }
  }, [eliminatedIds.length]);

  /* When the parent flags a new race start, clear the displayed winner
     overlay so the arena no longer freezes on it. */
  useEffect(() => {
    if (isRacing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWinnerDisplay(null);
    }
  }, [isRacing]);

  // BattleArena's onWinner signature: (winner, selectedImageDataUrl?, killerInfo?)
  const handleWinner = (
    winnerEntry: Entry,
    selectedImageDataUrl?: string,
    killerInfo?: KillerInfo
  ) => {
    const winnerImage = selectedImageDataUrl ?? getPreferredEntryImage(winnerEntry);
    const allImages = getEntryImages(winnerEntry);
    const remainingAfter = entries.filter((e) => e.id !== winnerEntry.id);
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

    // Credit the killer with a takedown (skip environmental kills like Lava).
    if (killerInfo && killerInfo.name !== 'Lava') {
      const killer = allEntries.find((e) => e.name === killerInfo.name);
      if (killer) {
        setTakedowns((prev) =>
          new Map(prev).set(killer.id, (prev.get(killer.id) || 0) + 1)
        );
      }
    }

    // Forward to parent with extras so other modes/standings can read killerInfo.
    onWinner(winnerEntry, killerInfo ? { killerInfo } : undefined);
  };

  // BattleArena fires this when all bots were destroyed by hazards with no
  // winner. The parent doesn't need to record an elimination — just clear the
  // racing flag and show a transient banner.
  const handleAllDestroyed = () => {
    setWinnerDisplay({ name: '🔥 All Destroyed! 🔥' });
    onRaceComplete();
  };

  return (
    <div className="battle-bots-mode">
      <div className="race-controls">
        {entries.length >= 1 && (
          <button onClick={onStartRace} className="start-race-button">
            ⚔️ Start Battle ({entries.length})
          </button>
        )}
        {eliminatedIds.length > 0 && (
          <button onClick={onResetRace} className="reset-race-button">
            🔄 Reset Battle
          </button>
        )}
      </div>

      <BattleArena
        entries={entries}
        allEntries={allEntries}
        eliminatedIds={eliminatedIds}
        winOrder={winOrder}
        onWinner={handleWinner}
        onRaceComplete={onRaceComplete}
        onAllDestroyed={handleAllDestroyed}
        onShowFinalStandings={onShowFinalStandings}
        isRacing={isRacing}
        currentWinner={winnerDisplay?.name ?? null}
        currentWinnerImage={winnerDisplay?.imageDataUrl}
        currentWinnerImages={winnerDisplay?.allImages}
        currentWinnerKillerInfo={winnerDisplay?.killerInfo}
        currentWinnerIsLastPlayer={winnerDisplay?.isLastPlayer}
      />
    </div>
  );
}
