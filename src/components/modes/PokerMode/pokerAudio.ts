/**
 * Card-table SFX for Poker Night, generated on the shared synth (no assets).
 * The mode's own sound setting is enforced here; the app-wide mute lives
 * inside utils/synth.
 */
import { noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';

let muted = false;

export function resumePokerAudio(): void {
  resumeSharedAudio();
}

export function setPokerMuted(m: boolean): void {
  muted = m;
}

/** A card sliding onto the felt. */
export function playDeal(): void {
  if (muted) return;
  noise(0.07, 0.12, 5200, 1400);
}

/** A community card turning over. */
export function playFlip(): void {
  if (muted) return;
  noise(0.05, 0.18, 6500, 2000);
  tone(820, 0.05, 'square', 0.03, 1250);
}

/** Chips pushed into the pot. */
export function playChips(): void {
  if (muted) return;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      if (!muted) tone(1500 + Math.random() * 700, 0.045, 'triangle', 0.05, 900);
    }, i * 42);
  }
}

/** The river landing — a held, slightly ominous beat. */
export function playRiver(): void {
  if (muted) return;
  tone(300, 0.34, 'sine', 0.09, 190);
  noise(0.09, 0.16, 5200, 1500);
}

/** Showdown sting before the loser is named. */
export function playShowdown(): void {
  if (muted) return;
  const notes = [392, 523, 659];
  notes.forEach((f, i) => setTimeout(() => { if (!muted) tone(f, 0.16, 'square', 0.09); }, i * 105));
}

/** Somebody just busted out. */
export function playBust(): void {
  if (muted) return;
  tone(260, 0.42, 'sawtooth', 0.11, 70);
  noise(0.3, 0.26, 1500, 220);
}

/** Tense tick while sudden-death cards are drawn. */
export function playSuddenDeathTick(intensity: number): void {
  if (muted) return;
  tone(520 + intensity * 620, 0.07, 'triangle', 0.07);
}

export function playFanfare(): void {
  if (muted) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => { if (!muted) tone(f, 0.22, 'square', 0.12); }, i * 130));
}
