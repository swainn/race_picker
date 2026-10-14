/**
 * Fairground sound for Whac-a-Mole, generated on the shared synth.
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

export function resumeWhacAudio(): void {
  resumeSharedAudio();
}

export function setWhacMuted(m: boolean): void {
  muted = m;
}

export function setWhacMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

let sfxMaster: GainNode | null = null;
function sfxBus(): GainNode | null {
  if (!sfxMaster) sfxMaster = createBus(0.5);
  return sfxMaster;
}

/** Round start — the barker's whistle. */
export function playWhistle(): void {
  if (muted) return;
  tone(1480, 0.16, 'sine', 0.07, 2100);
  setTimeout(() => { if (!muted) tone(1980, 0.12, 'sine', 0.06, 1500); }, 130);
}

/** A mole bobbing up out of its hole. Short, so a busy board does not mush. */
export function playPop(): void {
  if (muted) return;
  tone(420, 0.07, 'sine', 0.05, 880);
}

/** The mallet cutting through the air on a swing — fake or real. */
export function playWhoosh(): void {
  if (muted) return;
  noise(0.16, 0.14, 1800, 260);
}

/** The hit. A wooden thud with a cartoon boing riding on top. */
export function playBonk(): void {
  if (muted) return;
  noise(0.12, 0.4, 2600, 220);
  tone(150, 0.2, 'square', 0.1, 60);
  setTimeout(() => { if (!muted) tone(660, 0.22, 'triangle', 0.07, 180); }, 60);
}

/** The knocked-out mole's little descending "ohhh". */
export function playKnockout(): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx || isGlobalMuted()) return;
  const bus = sfxBus();
  if (!bus) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, t0);
  osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.75);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + 0.85);
}

// ---- Carnival tune -------------------------------------------------------

const BPM = 142;
/** Oom-pah fairground organ. 0 = rest. */
const LEAD = [72, 0, 76, 0, 79, 76, 72, 0, 74, 0, 77, 0, 81, 0, 77, 0];
const BASS = [36, 0, 43, 0, 36, 0, 43, 0, 38, 0, 45, 0, 41, 0, 48, 0];

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

/** Plays across the session, like a booth left switched on. */
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
