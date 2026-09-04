/**
 * Shared Web Audio synth foundation for all game-mode sound. One lazily
 * created AudioContext (resumed on the first user gesture to satisfy autoplay
 * policy), one master SFX bus, and a pre-baked white-noise buffer, plus the
 * two envelope primitives (`tone`, `noise`) every mode's SFX are built from.
 *
 * The primitives are gated by the app-wide mute (globalAudioStore); per-mode
 * sound settings are enforced by each mode's own audio module on top.
 */
import { isGlobalMuted } from './globalAudioStore';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

/** Lazily create (and return) the shared AudioContext, or null if unsupported. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    // Pre-bake a short white-noise buffer for percussive sounds.
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Resume a suspended context — call from a user gesture (e.g. Start click). */
export function resumeAudio(): void {
  const c = getAudioContext();
  if (c && c.state === 'suspended') void c.resume();
}

export function getNoiseBuffer(): AudioBuffer | null {
  getAudioContext();
  return noiseBuffer;
}

/** Create an independent output bus (e.g. a music bus with its own level). */
export function createBus(gain: number): GainNode | null {
  const c = getAudioContext();
  if (!c) return null;
  const bus = c.createGain();
  bus.gain.value = gain;
  bus.connect(c.destination);
  return bus;
}

/** A single enveloped oscillator note on the SFX bus, with optional pitch slide. */
export function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo?: number
): void {
  if (isGlobalMuted()) return;
  const c = getAudioContext();
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

/** A filtered white-noise burst on the SFX bus (explosions, impacts, hats). */
export function noise(dur: number, gain: number, lowpassFrom: number, lowpassTo: number): void {
  if (isGlobalMuted()) return;
  const c = getAudioContext();
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
