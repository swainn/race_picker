/**
 * Synth SFX and an eerie loop for Alien Abduction — generated, no assets.
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

export function resumeAbductionAudio(): void {
  resumeSharedAudio();
}

export function setAbductionMuted(m: boolean): void {
  muted = m;
  if (m) stopBeamHum();
}

export function setAbductionMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}

// ---- One-shot effects ---------------------------------------------------

/** The saucer sliding in, beam still dark. */
export function playArrive(): void {
  if (muted) return;
  tone(180, 0.9, 'sine', 0.07, 320);
  tone(181.5, 0.9, 'sine', 0.05, 322); // slight detune = a wobbling hull
}

/** The tractor beam snapping on. */
export function playBeamOn(): void {
  if (muted) return;
  tone(240, 0.5, 'sawtooth', 0.1, 1500);
  noise(0.3, 0.2, 900, 4200);
}

/** Somebody just got caught in the beam. */
export function playCapture(): void {
  if (muted) return;
  tone(300, 0.5, 'triangle', 0.09, 1250);
  noise(0.18, 0.12, 1800, 5200);
}

/** A gust shoves someone clear. */
export function playEscape(): void {
  if (muted) return;
  noise(0.34, 0.22, 4200, 700);
  tone(520, 0.24, 'triangle', 0.06, 190);
}

/** Swallowed by the ship. */
export function playAbducted(): void {
  if (muted) return;
  tone(900, 0.28, 'square', 0.09, 2400);
  setTimeout(() => { if (!muted) noise(0.34, 0.26, 3600, 400); }, 90);
}

/** Wind picking up across the field. */
export function playGust(): void {
  if (muted) return;
  noise(0.85, 0.11, 620, 240);
}

/** The disguise drops — the survivor was one of them all along. */
export function playMorph(): void {
  if (muted) return;
  noise(0.4, 0.3, 6200, 500);
  [660, 880, 1180].forEach((f, i) =>
    setTimeout(() => { if (!muted) tone(f, 0.3, 'triangle', 0.08, f * 1.5); }, i * 80)
  );
}

/** The saucer climbing away at the end. */
export function playDepart(): void {
  if (muted) return;
  tone(420, 1.3, 'sine', 0.08, 90);
  noise(0.9, 0.12, 2600, 300);
}

export function playFanfare(): void {
  if (muted) return;
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => { if (!muted) tone(f, 0.22, 'triangle', 0.1, f * 1.01); }, i * 130)
  );
}

// ---- Sustained beam hum -------------------------------------------------

let humOsc: OscillatorNode | null = null;
let humLfo: OscillatorNode | null = null;
let humGain: GainNode | null = null;

/** A wavering theremin-ish drone that runs for as long as the beam is lit. */
export function startBeamHum(): void {
  if (muted || isGlobalMuted() || humOsc) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const bus = beamBus();
  if (!bus) return;

  const now = ctx.currentTime;
  humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.0001, now);
  humGain.gain.exponentialRampToValueAtTime(0.05, now + 0.5);

  humOsc = ctx.createOscillator();
  humOsc.type = 'sine';
  humOsc.frequency.setValueAtTime(196, now);

  // Slow vibrato on the pitch is what makes it read as a flying saucer.
  humLfo = ctx.createOscillator();
  humLfo.type = 'sine';
  humLfo.frequency.setValueAtTime(5.5, now);
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.setValueAtTime(7, now);
  humLfo.connect(lfoDepth);
  lfoDepth.connect(humOsc.frequency);

  humOsc.connect(humGain);
  humGain.connect(bus);
  humOsc.start(now);
  humLfo.start(now);
}

export function stopBeamHum(): void {
  const ctx = getAudioContext();
  if (!ctx || !humOsc || !humGain) return;
  const now = ctx.currentTime;
  humGain.gain.cancelScheduledValues(now);
  humGain.gain.setValueAtTime(Math.max(0.0001, humGain.gain.value), now);
  humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  humOsc.stop(now + 0.4);
  humLfo?.stop(now + 0.4);
  humOsc = null;
  humLfo = null;
  humGain = null;
}

let beamMaster: GainNode | null = null;
function beamBus(): GainNode | null {
  if (!beamMaster) beamMaster = createBus(0.5);
  return beamMaster;
}

// ---- Music: a slow, uneasy night-sky loop -------------------------------

interface Track {
  bpm: number;
  lead: number[]; // MIDI, 0 = rest
  bass: number[];
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  leadGain: number;
}

/** Minor, sparse, hanging on the tritone — a field at night with something above it. */
const NIGHT_SKY: Track = {
  bpm: 76,
  leadWave: 'triangle',
  bassWave: 'sine',
  leadGain: 0.05,
  lead: [69, 0, 0, 72, 0, 0, 75, 0, 74, 0, 0, 72, 0, 68, 0, 0],
  bass: [33, 0, 0, 0, 40, 0, 0, 0, 31, 0, 0, 0, 38, 0, 0, 0],
};

let musicMaster: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let nextNoteTime = 0;

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function musicBus(): GainNode | null {
  if (!musicMaster) musicMaster = createBus(0.34);
  return musicMaster;
}

function playNoteAt(midi: number, wave: OscillatorType, time: number, dur: number, gain: number): void {
  if (isGlobalMuted()) return; // scheduler keeps running; music resumes on unmute
  const ctx = getAudioContext();
  const bus = musicBus();
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(mtof(midi), time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function scheduler(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = NIGHT_SKY;
  const stepDur = 60 / t.bpm / 4;
  while (nextNoteTime < ctx.currentTime + 0.12) {
    const lead = t.lead[musicStep % t.lead.length];
    if (lead) playNoteAt(lead, t.leadWave, nextNoteTime, stepDur * 3.2, t.leadGain);
    const bass = t.bass[musicStep % t.bass.length];
    if (bass) playNoteAt(bass, t.bassWave, nextNoteTime, stepDur * 5, 0.085);
    nextNoteTime += stepDur;
    musicStep++;
  }
}

/**
 * Start the loop. It deliberately plays on across rounds — it is a soundtrack
 * for the session, not a per-round cue — and stops at the finale, on mute, or
 * when the mode unmounts.
 */
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
