/** Tiny synth SFX + an 8-bit chiptune soundtrack for Street Duel — no asset
 *  files. One shared AudioContext, resumed on the first user gesture. */
import type { StageId } from './duelEngine';

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

// ---- 8-bit chiptune soundtrack (a track per stage) ----------------------
interface Track {
  bpm: number;
  lead: number[]; // MIDI notes, 0 = rest
  bass: number[];
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  hats: boolean;
  leadGain: number;
}

const TRACKS: Record<StageId, Track> = {
  city: {
    bpm: 140, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.06,
    lead: [72, 0, 76, 79, 84, 0, 79, 76, 74, 0, 77, 81, 79, 76, 72, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 41, 0, 48, 0, 43, 0, 50, 0],
  },
  jungle: {
    bpm: 126, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.06,
    lead: [69, 0, 72, 0, 76, 74, 72, 0, 69, 0, 67, 69, 72, 0, 69, 0],
    bass: [45, 45, 0, 45, 45, 0, 45, 0, 41, 41, 0, 41, 43, 0, 43, 0],
  },
  space: {
    bpm: 138, leadWave: 'triangle', bassWave: 'sine', hats: false, leadGain: 0.055,
    lead: [69, 72, 76, 81, 76, 81, 84, 88, 68, 71, 75, 80, 75, 80, 83, 87],
    bass: [45, 0, 0, 0, 45, 0, 0, 0, 40, 0, 0, 0, 43, 0, 0, 0],
  },
  desert: {
    bpm: 116, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.06,
    lead: [69, 0, 70, 73, 74, 0, 73, 70, 69, 0, 77, 76, 74, 73, 70, 69],
    bass: [45, 0, 45, 0, 41, 0, 41, 0, 40, 0, 40, 0, 41, 0, 41, 0],
  },
  dojo: {
    bpm: 96, leadWave: 'triangle', bassWave: 'sine', hats: false, leadGain: 0.06,
    lead: [74, 0, 76, 0, 81, 0, 79, 76, 74, 0, 71, 0, 69, 0, 71, 0],
    bass: [50, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0],
  },
  harbor: {
    bpm: 128, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.055,
    lead: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 77, 81, 0, 77, 74, 0],
    bass: [48, 0, 52, 0, 55, 0, 52, 0, 50, 0, 53, 0, 55, 0, 53, 0],
  },
  market: {
    bpm: 148, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.06,
    lead: [81, 79, 81, 84, 81, 79, 76, 79, 81, 79, 81, 84, 86, 84, 81, 79],
    bass: [45, 45, 0, 45, 0, 45, 45, 0, 41, 41, 0, 41, 43, 43, 0, 43],
  },
  casino: {
    bpm: 132, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.055,
    lead: [72, 0, 75, 76, 79, 0, 76, 72, 70, 0, 73, 74, 77, 0, 74, 70],
    bass: [48, 0, 55, 0, 46, 0, 53, 0, 44, 0, 51, 0, 43, 0, 50, 0],
  },
  arena: {
    bpm: 138, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.065,
    lead: [76, 0, 0, 76, 79, 0, 76, 0, 74, 0, 0, 74, 76, 0, 74, 0],
    bass: [40, 40, 0, 40, 40, 40, 0, 40, 38, 38, 0, 38, 43, 43, 0, 43],
  },
  volcano: {
    bpm: 120, leadWave: 'square', bassWave: 'sine', hats: true, leadGain: 0.055,
    lead: [64, 0, 65, 64, 0, 62, 64, 0, 64, 0, 65, 67, 65, 64, 62, 0],
    bass: [40, 0, 0, 40, 39, 0, 0, 39, 38, 0, 0, 38, 39, 0, 0, 39],
  },
  frozen: {
    bpm: 130, leadWave: 'triangle', bassWave: 'sine', hats: false, leadGain: 0.055,
    lead: [81, 84, 88, 93, 88, 84, 81, 84, 79, 83, 86, 91, 86, 83, 79, 83],
    bass: [45, 0, 0, 0, 52, 0, 0, 0, 43, 0, 0, 0, 50, 0, 0, 0],
  },
  beach: {
    bpm: 104, leadWave: 'triangle', bassWave: 'triangle', hats: true, leadGain: 0.06,
    lead: [77, 0, 81, 0, 84, 81, 0, 77, 0, 79, 0, 82, 0, 79, 77, 0],
    bass: [41, 0, 48, 0, 46, 0, 48, 0, 39, 0, 46, 0, 41, 0, 48, 0],
  },
  waterfall: {
    bpm: 112, leadWave: 'triangle', bassWave: 'sine', hats: false, leadGain: 0.055,
    lead: [79, 81, 84, 81, 86, 84, 81, 79, 76, 79, 81, 79, 74, 76, 79, 0],
    bass: [43, 0, 0, 50, 0, 0, 43, 0, 41, 0, 0, 48, 0, 0, 41, 0],
  },
  train: {
    bpm: 150, leadWave: 'square', bassWave: 'triangle', hats: true, leadGain: 0.055,
    lead: [74, 74, 77, 74, 79, 74, 77, 74, 74, 74, 77, 74, 81, 79, 77, 74],
    bass: [38, 50, 38, 50, 38, 50, 38, 50, 36, 48, 36, 48, 38, 50, 38, 50],
  },
  alley: {
    bpm: 110, leadWave: 'sawtooth', bassWave: 'triangle', hats: true, leadGain: 0.045,
    lead: [69, 0, 0, 72, 0, 71, 0, 69, 0, 0, 67, 0, 69, 0, 71, 72],
    bass: [33, 0, 45, 0, 33, 0, 45, 0, 31, 0, 43, 0, 32, 0, 44, 0],
  },
  graveyard: {
    bpm: 90, leadWave: 'triangle', bassWave: 'sine', hats: false, leadGain: 0.055,
    lead: [74, 0, 77, 0, 74, 0, 73, 0, 74, 0, 70, 0, 69, 0, 0, 0],
    bass: [38, 0, 0, 45, 0, 0, 38, 0, 0, 43, 0, 0, 37, 0, 0, 0],
  },
};

let musicMaster: GainNode | null = null;
let musicMuted = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let nextNoteTime = 0;
let currentTrack: Track | null = null;

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function musicBus(): GainNode | null {
  const c = ensure();
  if (!c) return null;
  if (!musicMaster) {
    musicMaster = c.createGain();
    musicMaster.gain.value = 0.42;
    musicMaster.connect(c.destination);
  }
  return musicMaster;
}

function playNoteAt(midi: number, wave: OscillatorType, time: number, dur: number, gain: number): void {
  const c = ensure();
  const bus = musicBus();
  if (!c || !bus) return;
  const osc = c.createOscillator();
  const g = c.createGain();
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

function playHatAt(time: number): void {
  const c = ensure();
  const bus = musicBus();
  if (!c || !bus || !noiseBuffer) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 6500;
  const g = c.createGain();
  g.gain.setValueAtTime(0.05, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  src.connect(filt);
  filt.connect(g);
  g.connect(bus);
  src.start(time);
  src.stop(time + 0.06);
}

function scheduler(): void {
  const c = ensure();
  const t = currentTrack;
  if (!c || !t) return;
  const stepDur = 60 / t.bpm / 4; // sixteenth note
  while (nextNoteTime < c.currentTime + 0.12) {
    const lead = t.lead[musicStep % t.lead.length];
    if (lead) playNoteAt(lead, t.leadWave, nextNoteTime, stepDur * 0.9, t.leadGain);
    const bass = t.bass[musicStep % t.bass.length];
    if (bass) playNoteAt(bass, t.bassWave, nextNoteTime, stepDur * 1.9, 0.1);
    if (t.hats && musicStep % 2 === 0) playHatAt(nextNoteTime);
    nextNoteTime += stepDur;
    musicStep++;
  }
}

export function startTrack(stage: StageId): void {
  if (musicMuted) return;
  const c = ensure();
  if (!c) return;
  stopTrack();
  currentTrack = TRACKS[stage];
  musicStep = 0;
  nextNoteTime = c.currentTime + 0.06;
  musicTimer = setInterval(scheduler, 25);
}

export function stopTrack(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  currentTrack = null;
}

export function setMusicMuted(m: boolean): void {
  musicMuted = m;
  if (m) stopTrack();
}
