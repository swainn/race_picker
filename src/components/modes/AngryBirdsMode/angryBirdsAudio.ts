/**
 * Sound for Angry Birds, generated on the shared synth. The mode's own
 * sound/music settings are enforced here; the app-wide mute lives inside
 * utils/synth and utils/globalAudioStore.
 */
import { createBus, getAudioContext, noise, resumeAudio as resumeSharedAudio, tone } from '../../../utils/synth';
import { isGlobalMuted } from '../../../utils/globalAudioStore';

let muted = false;
let musicMuted = false;

export function resumeAngryBirdsAudio(): void {
  resumeSharedAudio();
}

export function setAngryBirdsMuted(m: boolean): void {
  muted = m;
}

export function setAngryBirdsMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

/** Elastic stretching as the pouch is drawn back. */
export function playStretch(): void {
  if (muted) return;
  tone(160, 0.34, 'triangle', 0.05, 320);
}

/** The pouch letting go. */
export function playLaunch(): void {
  if (muted) return;
  tone(520, 0.14, 'square', 0.09, 170);
  noise(0.1, 0.22, 3600, 800);
}

/** Wood taking a hit. */
export function playThud(strength = 1): void {
  if (muted) return;
  const g = Math.max(0.03, Math.min(0.14, 0.05 * strength));
  noise(0.14, g, 1800, 260);
  tone(120, 0.16, 'triangle', g, 70);
}

/** Planks tumbling — a short clatter. */
export function playCollapse(): void {
  if (muted) return;
  [0, 70, 150, 230].forEach((d, i) =>
    setTimeout(() => {
      if (!muted) noise(0.1, 0.15 - i * 0.025, 2200 - i * 400, 300);
    }, d)
  );
}

/** A pig going up in a puff. */
export function playPop(): void {
  if (muted) return;
  tone(880, 0.09, 'square', 0.09, 2100);
  noise(0.12, 0.2, 5200, 900);
  setTimeout(() => { if (!muted) tone(1320, 0.1, 'square', 0.06, 420); }, 60);
}

/** The pigs' snigger, for a shot that left them standing. */
export function playSnort(): void {
  if (muted) return;
  [0, 110, 220].forEach((d) =>
    setTimeout(() => { if (!muted) tone(190, 0.1, 'sawtooth', 0.05, 140); }, d)
  );
}

export function playFanfare(): void {
  if (muted) return;
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => { if (!muted) tone(f, 0.22, 'square', 0.1); }, i * 130)
  );
}

// ---- Marching theme ------------------------------------------------------

const BPM = 150;
/** Jaunty minor-key march, 0 = rest. */
const LEAD = [64, 0, 64, 66, 67, 0, 66, 64, 62, 0, 64, 0, 59, 0, 0, 0];
const BASS = [40, 0, 47, 0, 40, 0, 47, 0, 38, 0, 45, 0, 43, 0, 43, 0];

let musicMaster: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let nextNoteTime = 0;

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function musicBus(): GainNode | null {
  if (!musicMaster) musicMaster = createBus(0.28);
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
    if (lead) noteAt(lead, 'square', nextNoteTime, stepDur * 0.8, 0.04);
    const bass = BASS[musicStep % BASS.length];
    if (bass) noteAt(bass, 'triangle', nextNoteTime, stepDur * 1.7, 0.07);
    nextNoteTime += stepDur;
    musicStep++;
  }
}

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
