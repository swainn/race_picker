/**
 * Fairground sound for the Pie Eating Contest, generated on the shared synth.
 * The mode's own sound/music toggles are enforced here; the app-wide mute
 * lives inside utils/synth.
 */
import { createBus, getAudioContext, noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;
let trackTimer: number | null = null;

export function resumePieAudio(): void {
  resumeSharedAudio();
}

export function setPieMuted(m: boolean): void {
  muted = m;
}

export function setPieMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** A countdown pip; the last one ("EAT!") is higher and longer. */
export function playCountBeep(final: boolean): void {
  if (muted) return;
  if (final) tone(988, 0.42, 'square', 0.07, 1000);
  else tone(659, 0.16, 'square', 0.06, 655);
}

/** One mouthful: a short crunch of crust. */
export function playMunch(): void {
  if (muted) return;
  noise(0.06, 0.1, 1800 + Math.random() * 900, 380);
}

/** Feeling sick: a low groan that sags, then a wobble. */
export function playQueasy(): void {
  if (muted) return;
  tone(210, 0.55, 'sawtooth', 0.045, 120);
  setTimeout(() => { if (!muted) tone(150, 0.35, 'triangle', 0.04, 95); }, 380);
}

/** The dinner bell that ends the contest. */
export function playBell(): void {
  if (muted) return;
  tone(1568, 0.9, 'sine', 0.09, 1560);
  tone(2349, 0.6, 'sine', 0.04, 2340);
  setTimeout(() => {
    if (muted) return;
    tone(1568, 1.1, 'sine', 0.09, 1556);
    tone(2349, 0.7, 'sine', 0.04, 2336);
  }, 230);
}

/** The crowd for the clean plate. */
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

/** A bright fiddle vamp that loops under the contest. */
export function startTrack(): void {
  if (musicMuted || trackTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const bus = createBus(0.05);
  if (!bus) return;

  // G major, sawing up and down the chord like a barn-dance fiddle.
  const NOTES = [392, 494, 587, 494, 440, 587, 659, 587, 392, 494, 587, 784, 659, 587, 494, 440];
  let step = 0;
  const beat = () => {
    if (musicMuted || isGlobalMuted()) return;
    const f = NOTES[step % NOTES.length];
    tone(f, 0.24, 'sawtooth', 0.03, f * 1.01);
    if (step % 4 === 0) tone(step % 8 === 0 ? 98 : 147, 0.4, 'triangle', 0.06, step % 8 === 0 ? 98 : 147);
    step++;
  };
  beat();
  trackTimer = window.setInterval(beat, 300);
}

export function stopTrack(): void {
  if (trackTimer !== null) {
    window.clearInterval(trackTimer);
    trackTimer = null;
  }
}
