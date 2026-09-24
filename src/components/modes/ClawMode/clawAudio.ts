/**
 * Arcade-cabinet sound for The Claw, generated on the shared synth.
 * The mode's own sound/music settings are enforced here; the app-wide mute
 * lives inside utils/synth.
 */
import {
  createBus,
  getAudioContext,
  noise,
  resumeAudio as resumeSharedAudio,
  tone,
} from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;

export function resumeClawAudio(): void {
  resumeSharedAudio();
}

export function setClawMuted(m: boolean): void {
  muted = m;
  if (m) stopMotor();
}

export function setClawMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** Coin drop / round start. */
export function playCoin(): void {
  if (muted) return;
  tone(1180, 0.08, 'square', 0.08, 1600);
  setTimeout(() => { if (!muted) tone(1560, 0.13, 'square', 0.08, 1900); }, 70);
}

/** The prongs clamping shut. */
export function playClamp(): void {
  if (muted) return;
  noise(0.09, 0.3, 4200, 900);
  tone(220, 0.12, 'square', 0.08, 120);
}

/** Prongs springing open to release. */
export function playRelease(): void {
  if (muted) return;
  noise(0.07, 0.22, 3200, 1400);
  tone(420, 0.1, 'square', 0.06, 700);
}

/** A toy tumbling down the prize chute. */
export function playChute(): void {
  if (muted) return;
  [0, 90, 170].forEach((d, i) =>
    setTimeout(() => {
      if (!muted) {
        noise(0.12, 0.26 - i * 0.05, 2400 - i * 600, 400);
        tone(180 - i * 30, 0.13, 'triangle', 0.07, 90);
      }
    }, d)
  );
}

/** The reverent "oooooh" as the claw descends — detuned voices swelling. */
export function playAwe(): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || isGlobalMuted()) return;
  const bus = sfxBus();
  if (!bus) return;
  const t0 = ctx.currentTime;
  // A vowel-ish stack: root, fifth, octave, slightly detuned so it wavers.
  [196, 294, 392].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * (1 + (i - 1) * 0.004), t0);
    osc.frequency.linearRampToValueAtTime(f * 1.06, t0 + 1.5);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + 1.75);
  });
}

export function playFanfare(): void {
  if (muted) return;
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => { if (!muted) tone(f, 0.22, 'square', 0.1); }, i * 130)
  );
}

let sfxMaster: GainNode | null = null;
function sfxBus(): GainNode | null {
  if (!sfxMaster) sfxMaster = createBus(0.5);
  return sfxMaster;
}

// ---- Gantry motor: runs only while the claw is moving -------------------

let motorOsc: OscillatorNode | null = null;
let motorGain: GainNode | null = null;

export function startMotor(): void {
  if (muted || isGlobalMuted() || motorOsc) return;
  const ctx = getAudioContext();
  const bus = sfxBus();
  if (!ctx || !bus) return;
  const t0 = ctx.currentTime;
  motorGain = ctx.createGain();
  motorGain.gain.setValueAtTime(0.0001, t0);
  motorGain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.12);
  motorOsc = ctx.createOscillator();
  motorOsc.type = 'sawtooth';
  motorOsc.frequency.setValueAtTime(78, t0);
  motorOsc.connect(motorGain);
  motorGain.connect(bus);
  motorOsc.start(t0);
}

export function stopMotor(): void {
  const ctx = getAudioContext();
  if (!ctx || !motorOsc || !motorGain) return;
  const t0 = ctx.currentTime;
  motorGain.gain.cancelScheduledValues(t0);
  motorGain.gain.setValueAtTime(Math.max(0.0001, motorGain.gain.value), t0);
  motorGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
  motorOsc.stop(t0 + 0.18);
  motorOsc = null;
  motorGain = null;
}

// ---- Attract-mode arcade jingle -----------------------------------------

const BPM = 132;
/** Bright, bouncy, a bit toy-like. 0 = rest. */
const LEAD = [76, 0, 79, 0, 84, 0, 79, 76, 74, 0, 77, 0, 81, 0, 77, 0];
const BASS = [40, 0, 47, 0, 40, 0, 47, 0, 38, 0, 45, 0, 43, 0, 50, 0];

let musicMaster: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let nextNoteTime = 0;

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function musicBus(): GainNode | null {
  if (!musicMaster) musicMaster = createBus(0.3);
  return musicMaster;
}

function noteAt(midi: number, wave: OscillatorType, time: number, dur: number, gain: number): void {
  if (isGlobalMuted()) return; // scheduler keeps running; music resumes on unmute
  const ctx = getAudioContext();
  const bus = musicBus();
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(mtof(midi), time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function scheduler(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const stepDur = 60 / BPM / 4;
  while (nextNoteTime < ctx.currentTime + 0.12) {
    const lead = LEAD[musicStep % LEAD.length];
    if (lead) noteAt(lead, 'square', nextNoteTime, stepDur * 0.85, 0.045);
    const bass = BASS[musicStep % BASS.length];
    if (bass) noteAt(bass, 'triangle', nextNoteTime, stepDur * 1.8, 0.075);
    nextNoteTime += stepDur;
    musicStep++;
  }
}

/** Plays across the session, like a cabinet left switched on. */
export function startTrack(): void {
  if (musicMuted || musicTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  musicStep = 0;
  nextNoteTime = ctx.currentTime + 0.06;
  musicTimer = setInterval(scheduler, 25);
}

export function stopTrack(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
