export type SoundType =
  | 'classic'
  | 'beep'
  | 'click'
  | 'pop'
  | 'blip'
  | 'thud'
  | 'bass'
  | 'drum'
  | 'random'
  | 'cycle';

export const NAMED_SOUNDS: ReadonlyArray<Exclude<SoundType, 'random' | 'cycle'>> = [
  'classic',
  'beep',
  'click',
  'pop',
  'blip',
  'thud',
  'bass',
  'drum',
];

let audioContext: AudioContext | null = null;
let muted = false;
let cycleIndex = 0;
let warned = false;

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  } catch (e) {
    if (!warned) {
      console.warn('Web Audio API not supported:', e);
      warned = true;
    }
    return null;
  }
  return audioContext;
}

function resolveSoundType(type: SoundType): Exclude<SoundType, 'random' | 'cycle'> {
  if (type === 'random') {
    return NAMED_SOUNDS[Math.floor(Math.random() * NAMED_SOUNDS.length)];
  }
  if (type === 'cycle') {
    const sound = NAMED_SOUNDS[cycleIndex % NAMED_SOUNDS.length];
    cycleIndex += 1;
    return sound;
  }
  return type;
}

export function playTick(type: SoundType): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const t = ctx.currentTime;
    const sound = resolveSoundType(type);

    switch (sound) {
      case 'classic':
        oscillator.frequency.setValueAtTime(800, t);
        oscillator.frequency.exponentialRampToValueAtTime(400, t + 0.02);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.3, t + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        oscillator.start(t);
        oscillator.stop(t + 0.05);
        break;
      case 'beep':
        oscillator.frequency.setValueAtTime(1000, t);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.4, t + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, t + 0.08);
        oscillator.start(t);
        oscillator.stop(t + 0.08);
        break;
      case 'click':
        oscillator.frequency.setValueAtTime(600, t);
        oscillator.frequency.exponentialRampToValueAtTime(200, t + 0.01);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.5, t + 0.002);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
        oscillator.start(t);
        oscillator.stop(t + 0.03);
        break;
      case 'pop':
        oscillator.frequency.setValueAtTime(300, t);
        oscillator.frequency.exponentialRampToValueAtTime(80, t + 0.04);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.6, t + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
        oscillator.start(t);
        oscillator.stop(t + 0.06);
        break;
      case 'blip':
        oscillator.frequency.setValueAtTime(400, t);
        oscillator.frequency.linearRampToValueAtTime(800, t + 0.02);
        oscillator.frequency.linearRampToValueAtTime(400, t + 0.04);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.35, t + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, t + 0.05);
        oscillator.start(t);
        oscillator.stop(t + 0.05);
        break;
      case 'thud':
        oscillator.frequency.setValueAtTime(120, t);
        oscillator.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.7, t + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
        oscillator.start(t);
        oscillator.stop(t + 0.12);
        break;
      case 'bass':
        oscillator.frequency.setValueAtTime(80, t);
        oscillator.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.8, t + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        oscillator.start(t);
        oscillator.stop(t + 0.2);
        break;
      case 'drum':
        oscillator.frequency.setValueAtTime(100, t);
        oscillator.frequency.exponentialRampToValueAtTime(50, t + 0.05);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(0.6, t + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        oscillator.start(t);
        oscillator.stop(t + 0.08);
        break;
    }

    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore
      }
    };
  } catch (e) {
    if (!warned) {
      console.warn('Error playing tick sound:', e);
      warned = true;
    }
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export const SOUND_OPTIONS: ReadonlyArray<{ value: SoundType; label: string }> = [
  { value: 'classic', label: 'Classic Tick' },
  { value: 'beep', label: 'Electronic Beep' },
  { value: 'click', label: 'Mechanical Click' },
  { value: 'pop', label: 'Pop' },
  { value: 'blip', label: 'Retro Blip' },
  { value: 'thud', label: 'Deep Thud' },
  { value: 'bass', label: 'Bass Drop' },
  { value: 'drum', label: 'Low Drum' },
  { value: 'random', label: 'Random' },
  { value: 'cycle', label: 'Cycle' },
];
