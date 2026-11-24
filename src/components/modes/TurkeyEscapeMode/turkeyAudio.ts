/**
 * Farmyard sound for Turkey Escape, generated on the shared synth.
 * The mode's own sound/music toggles are enforced here; the app-wide mute
 * lives inside utils/synth.
 */
import { getAudioContext, noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;
let trackTimer: number | null = null;

export function resumeTurkeyAudio(): void {
  resumeSharedAudio();
}

export function setTurkeyMuted(m: boolean): void {
  muted = m;
}

export function setTurkeyMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** The gate swinging open: a creak, then the latch. */
export function playGate(): void {
  if (muted) return;
  tone(180, 0.45, 'sawtooth', 0.04, 320);
  setTimeout(() => { if (!muted) noise(0.08, 0.25, 2600, 600); }, 420);
}

/** The gate swinging shut behind the farmer: a short creak, then the latch. */
export function playGateShut(): void {
  if (muted) return;
  tone(300, 0.25, 'sawtooth', 0.04, 190);
  setTimeout(() => { if (!muted) noise(0.08, 0.25, 2600, 600); }, 240);
}

/** A gobble — three fast descending notes. */
export function playGobble(): void {
  if (muted) return;
  [620, 520, 430].forEach((f, i) =>
    setTimeout(() => {
      if (!muted) tone(f, 0.07, 'sawtooth', 0.04, f * 0.8);
    }, i * 60)
  );
}

/** The farmer launching himself at a turkey. */
export function playWhoosh(): void {
  if (muted) return;
  noise(0.3, 0.2, 500, 3200);
}

/** The farmer meeting the ground instead. */
export function playThud(): void {
  if (muted) return;
  noise(0.2, 0.35, 900, 120);
  tone(110, 0.22, 'sine', 0.12, 48);
}

/** The net coming down on the right turkey at last. */
export function playCatch(): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || isGlobalMuted()) return;
  noise(0.12, 0.25, 3000, 700);
  [392, 494, 587, 784].forEach((f, i) =>
    setTimeout(() => {
      if (!muted) tone(f, 0.24, 'square', 0.05, f * 1.01);
    }, 80 + i * 90)
  );
}

/** A quick banjo roll that loops under the chase. */
export function startTrack(): void {
  if (musicMuted || trackTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // A forward roll over G, C and D: thumb on the low string, then two plucks.
  const NOTES = [196, 294, 392, 247, 294, 392, 196, 330, 392, 262, 330, 392, 220, 294, 370, 294];
  let step = 0;
  const beat = () => {
    if (musicMuted || isGlobalMuted()) return;
    const f = NOTES[step % NOTES.length];
    // A short, bright pluck that dies quickly is most of what makes it a banjo.
    tone(f, 0.16, 'sawtooth', 0.035, f);
    tone(f * 2, 0.09, 'triangle', 0.025, f * 2);
    if (step % 4 === 0) tone(f / 2, 0.22, 'triangle', 0.05, f / 2);
    step++;
  };
  beat();
  trackTimer = window.setInterval(beat, 190);
}

export function stopTrack(): void {
  if (trackTimer !== null) {
    window.clearInterval(trackTimer);
    trackTimer = null;
  }
}
