/**
 * Doorstep sound for Trick-or-Treat, generated on the shared synth.
 * The mode's own sound/music toggles are enforced here; the app-wide mute
 * lives inside utils/synth.
 */
import { createBus, getAudioContext, noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;
let trackTimer: number | null = null;

export function resumeTreatAudio(): void {
  resumeSharedAudio();
}

export function setTreatMuted(m: boolean): void {
  muted = m;
}

export function setTreatMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** The doorbell that opens a round. */
export function playDoorbell(): void {
  if (muted) return;
  tone(784, 0.5, 'sine', 0.09, 780);
  setTimeout(() => { if (!muted) tone(587, 0.7, 'sine', 0.09, 584); }, 240);
}

/** Children chorusing "trick or treat!" — three rising syllables. */
export function playChant(): void {
  if (muted) return;
  [330, 392, 494].forEach((f, i) =>
    setTimeout(() => {
      if (!muted) tone(f, 0.22, 'triangle', 0.06, f * 1.02);
    }, i * 150)
  );
}

/** A footstep / shuffle as the line gathers. */
export function playShuffle(): void {
  if (muted) return;
  noise(0.09, 0.14, 2200, 500);
}

/** The hand hovering, deciding. */
export function playHover(): void {
  if (muted) return;
  tone(520, 0.1, 'sine', 0.035, 600);
}

/** Candy landing in a paper bag. */
export function playPlop(): void {
  if (muted) return;
  noise(0.14, 0.3, 3000, 420);
  tone(170, 0.16, 'triangle', 0.07, 95);
}

/** A delighted cheer from the treated child. */
export function playCheer(): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || isGlobalMuted()) return;
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => {
      if (!muted) tone(f, 0.26, 'square', 0.055, f * 1.01);
    }, i * 95)
  );
}

/** A spooky two-bar vamp that loops under the scene. */
export function startTrack(): void {
  if (musicMuted || trackTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const bus = createBus(0.05);
  if (!bus) return;

  // A minor-key ostinato: the old Halloween trick of a tritone in the bass.
  const NOTES = [196, 233, 196, 277, 196, 233, 185, 233];
  let step = 0;
  const beat = () => {
    if (musicMuted || isGlobalMuted()) return;
    const f = NOTES[step % NOTES.length];
    tone(f, 0.3, 'triangle', 0.05, f);
    if (step % 4 === 0) tone(f / 2, 0.5, 'sine', 0.05, f / 2);
    step++;
  };
  beat();
  trackTimer = window.setInterval(beat, 330);
}

export function stopTrack(): void {
  if (trackTimer !== null) {
    window.clearInterval(trackTimer);
    trackTimer = null;
  }
}
