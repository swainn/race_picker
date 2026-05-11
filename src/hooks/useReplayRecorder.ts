import { useCallback, useRef, useState } from 'react';

interface UseReplayRecorderOptions {
  /** Max frames retained in the ring buffer. Default 600 (~10s @ 60fps). */
  maxFrames?: number;
  /** Wall-clock ms each recorded frame represents. Default 16 (60fps). */
  msPerFrame?: number;
  /** Playback speed multiplier; 1 = realtime, <1 = slow-mo. Default 1. */
  playbackSpeed?: number;
  /** When true, playback loops from the starting frame after reaching the
   *  end. When false (default), playback pins on the last frame. */
  loop?: boolean;
  /** Extra wall-clock ms to hold the last frame before looping. Only used
   *  when `loop` is true. Default 600. */
  loopEndPauseMs?: number;
}

export interface ReplayHandle<TFrame> {
  /** Record a frame snapshot. Drops the oldest frame when full. */
  record: (frame: TFrame) => void;
  /** Drop all recorded frames; also stops playback if active. */
  clear: () => void;
  /** Begin playback. `fromFraction` (0–1) picks the starting position in the
   *  recorded timeline — pass 0.75 to replay only the final quarter, etc.
   *  Defaults to 0 (full replay). No-op if there are no frames. */
  start: (fromFraction?: number) => void;
  /** Halt playback; currentFrame stays pinned at its last value. */
  stop: () => void;
  /** True while playback is active. */
  isReplaying: boolean;
  /** Returns the playback frame for `now`, or null when not replaying. */
  getCurrentFrame: (now: number) => TFrame | null;
}

/**
 * Generic replay recorder for canvas-animation game modes. The mode picks its
 * own TFrame shape (positions, healths, projectile state, etc.) and pushes a
 * snapshot per game tick. The hook returns the frame for the current playback
 * timestamp; the mode swaps it in for the live state inside its render loop.
 */
export function useReplayRecorder<TFrame>(
  opts: UseReplayRecorderOptions = {}
): ReplayHandle<TFrame> {
  const {
    maxFrames = 600,
    msPerFrame = 16,
    playbackSpeed = 1,
    loop = false,
    loopEndPauseMs = 600,
  } = opts;

  const framesRef = useRef<TFrame[]>([]);
  const playbackStartRef = useRef(0);
  const playbackStartIndexRef = useRef(0);
  const [isReplaying, setIsReplaying] = useState(false);

  const record = useCallback(
    (frame: TFrame) => {
      framesRef.current.push(frame);
      if (framesRef.current.length > maxFrames) {
        framesRef.current.shift();
      }
    },
    [maxFrames]
  );

  const clear = useCallback(() => {
    framesRef.current = [];
    playbackStartRef.current = 0;
    playbackStartIndexRef.current = 0;
    setIsReplaying(false);
  }, []);

  const start = useCallback((fromFraction = 0) => {
    const total = framesRef.current.length;
    if (total === 0) return;
    const clamped = Math.max(0, Math.min(0.999, fromFraction));
    playbackStartIndexRef.current = Math.floor(clamped * total);
    playbackStartRef.current = performance.now();
    setIsReplaying(true);
  }, []);

  const stop = useCallback(() => {
    setIsReplaying(false);
  }, []);

  const getCurrentFrame = useCallback(
    (now: number): TFrame | null => {
      if (!isReplaying) return null;
      const frames = framesRef.current;
      if (frames.length === 0) return null;
      const elapsed = (now - playbackStartRef.current) * playbackSpeed;
      const offset = Math.floor(elapsed / msPerFrame);
      const startIdx = playbackStartIndexRef.current;
      const lastIdx = frames.length - 1;

      if (!loop) {
        return frames[Math.max(0, Math.min(startIdx + offset, lastIdx))];
      }

      // Looping: each cycle is `windowFrames` frames of playback plus a
      // wall-clock pause on the final frame, expressed in playback frames.
      const windowFrames = lastIdx - startIdx + 1;
      const pauseFrames = Math.max(
        0,
        Math.floor((loopEndPauseMs * playbackSpeed) / msPerFrame)
      );
      const cycleFrames = windowFrames + pauseFrames;
      const positionInCycle = ((offset % cycleFrames) + cycleFrames) % cycleFrames;
      const idx =
        positionInCycle < windowFrames
          ? startIdx + positionInCycle
          : lastIdx; // hold on last frame for the pause window
      return frames[idx];
    },
    [isReplaying, msPerFrame, playbackSpeed, loop, loopEndPauseMs]
  );

  return { record, clear, start, stop, isReplaying, getCurrentFrame };
}
