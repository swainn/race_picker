/**
 * Synth SFX for the Space Invaders family — all sounds are generated (no asset
 * files) on the shared synth foundation (`utils/synth`). The mode's own sound
 * setting is enforced here; the app-wide mute is enforced inside the synth.
 */
import {
  resumeAudio as resumeSharedAudio,
  tone as synthTone,
  noise as synthNoise,
} from '../../../utils/synth';

let muted = false;

export function resumeAudio(): void {
  resumeSharedAudio();
}

export function setMuted(m: boolean): void {
  muted = m;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  if (muted) return;
  synthTone(freq, dur, type, gain, slideTo);
}

function noise(dur: number, gain: number, lowpassFrom: number, lowpassTo: number): void {
  if (muted) return;
  synthNoise(dur, gain, lowpassFrom, lowpassTo);
}

export function playLaser(): void {
  tone(880, 0.16, 'square', 0.14, 220);
}

export function playBomb(): void {
  tone(180, 0.22, 'sawtooth', 0.08, 60);
}

export function playExplosion(): void {
  noise(0.45, 0.5, 1800, 120);
  tone(120, 0.4, 'sawtooth', 0.12, 40);
}

/** The classic descending 4-note march heartbeat; `step` picks the note. */
const MARCH_NOTES = [130.8, 116.5, 98.0, 87.3];
export function playMarchTick(step: number): void {
  tone(MARCH_NOTES[((step % 4) + 4) % 4], 0.11, 'square', 0.09);
}

/** Rising target-lock beep; `intensity` 0→1 raises the pitch as it homes in. */
export function playLockTick(intensity: number): void {
  tone(500 + intensity * 900, 0.06, 'triangle', 0.06);
}

export function playLocked(): void {
  tone(1400, 0.12, 'triangle', 0.12, 1800);
}

export function playShieldBreak(): void {
  tone(300, 0.18, 'square', 0.12, 900);
  noise(0.18, 0.25, 3000, 400);
}

export function playPower(): void {
  tone(660, 0.1, 'triangle', 0.08, 1320);
}

export function playUfo(): void {
  tone(700, 0.5, 'sine', 0.07, 500);
}

/** Light zap when a defender laser destroys a horde alien. */
export function playHordeHit(): void {
  tone(520, 0.08, 'square', 0.06, 200);
  noise(0.08, 0.12, 2600, 600);
}

export function playFanfare(): void {
  if (muted) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'square', 0.13), i * 130));
}
