/**
 * Field sound for Corn Maze, generated on the shared synth.
 * The mode's own sound/music toggles are enforced here; the app-wide mute
 * lives inside utils/synth.
 */
import { createBus, getAudioContext, noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;
let trackTimer: number | null = null;

export function resumeMazeAudio(): void {
  resumeSharedAudio();
}

export function setMazeMuted(m: boolean): void {
  muted = m;
}

export function setMazeMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** A cowbell clank as everyone is sent into the corn. */
export function playStart(): void {
  if (muted) return;
  tone(660, 0.28, 'square', 0.06, 640);
  tone(990, 0.22, 'triangle', 0.05, 960);
  setTimeout(() => { if (!muted) tone(660, 0.4, 'square', 0.055, 630); }, 190);
}

/** Leaves brushing past: a short, bright, quiet burst of noise. */
export function playRustle(): void {
  if (muted) return;
  noise(0.07, 0.06, 6500, 2600);
}

/** A little "hm?" from a runner stuck at a junction. */
export function playPuzzled(): void {
  if (muted) return;
  tone(392, 0.16, 'sine', 0.04, 523);
}

/** The horn that says somebody is out. */
export function playHorn(): void {
  if (muted) return;
  tone(196, 0.75, 'sawtooth', 0.07, 192);
  tone(294, 0.75, 'sawtooth', 0.045, 290);
}

/** A cheer from the pumpkin patch. */
export function playCheer(): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || isGlobalMuted()) return;
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => {
      if (!muted) tone(f, 0.26, 'square', 0.055, f * 1.01);
    }, 260 + i * 95)
  );
}

/** A slow, slightly mysterious plucked pattern that loops under the maze. */
export function startTrack(): void {
  if (musicMuted || trackTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const bus = createBus(0.05);
  if (!bus) return;

  // D dorian, wandering up and back without ever quite resolving.
  const NOTES = [147, 220, 175, 262, 196, 220, 165, 247];
  let step = 0;
  const beat = () => {
    if (musicMuted || isGlobalMuted()) return;
    const f = NOTES[step % NOTES.length];
    // A pluck: fast attack, falling slightly flat as it dies.
    tone(f * 2, 0.32, 'triangle', 0.045, f * 1.98);
    if (step % 4 === 0) tone(f / 2, 0.6, 'sine', 0.05, f / 2);
    step++;
  };
  beat();
  trackTimer = window.setInterval(beat, 360);
}

export function stopTrack(): void {
  if (trackTimer !== null) {
    window.clearInterval(trackTimer);
    trackTimer = null;
  }
}
