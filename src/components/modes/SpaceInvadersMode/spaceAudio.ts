/**
 * Tiny Web Audio synth for the Space Invaders family — all sounds are generated
 * (no asset files). One shared AudioContext, created lazily and resumed on the
 * first user gesture (the Start button click satisfies the autoplay policy).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    // Pre-bake a short white-noise buffer for explosions.
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function resumeAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number
): void {
  if (muted) return;
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain: number, lowpassFrom: number, lowpassTo: number): void {
  if (muted) return;
  const c = ensure();
  if (!c || !master || !noiseBuffer) return;
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(lowpassFrom, t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(60, lowpassTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
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
  const c = ensure();
  if (!c) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'square', 0.13), i * 130));
}
