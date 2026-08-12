/** Tiny synth SFX for Street Duel — no asset files. Mirrors the Space Invaders
 *  audio approach: one shared AudioContext, resumed on the first user gesture. */

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
    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function resumeDuelAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

export function setDuelMuted(m: boolean): void {
  muted = m;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
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

function noise(dur: number, gain: number, lowFrom: number, lowTo: number): void {
  if (muted) return;
  const c = ensure();
  if (!c || !master || !noiseBuffer) return;
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(lowFrom, t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(60, lowTo), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function playHit(): void {
  noise(0.12, 0.35, 2600, 500);
  tone(160, 0.12, 'square', 0.09, 90);
}
export function playPunch(): void {
  tone(320, 0.07, 'triangle', 0.06, 160);
}
export function playBlock(): void {
  tone(500, 0.1, 'square', 0.07, 900);
  noise(0.08, 0.15, 3000, 800);
}
export function playFireball(): void {
  tone(760, 0.22, 'sawtooth', 0.07, 300);
}
export function playKo(): void {
  noise(0.5, 0.5, 1600, 100);
  tone(120, 0.45, 'sawtooth', 0.13, 40);
}
export function playBell(): void {
  tone(880, 0.4, 'sine', 0.12);
  tone(1320, 0.4, 'sine', 0.08);
}
export function playFanfare(): void {
  if (muted) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((fq, i) => setTimeout(() => tone(fq, 0.22, 'square', 0.12), i * 130));
}
