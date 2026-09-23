import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { shuffle } from '../../../utils/array';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { alienAbductionTheme } from '../themes';
import { ABDUCTEE_KINDS, drawAbductee, drawAlien, drawDisguise } from './abducteeSprites';
import { FARM_KINDS } from './alienAbductionSettingsStore';
import type { AbducteeKind, AlienAbductionSubMode, HazardMode } from './alienAbductionSettingsStore';
import {
  CANVAS_WIDTH,
  FIELD_LEFT,
  FIELD_RIGHT,
  newProwl,
  slotX,
  startingSlots,
  stepProwl,
  type ProwlState,
} from './abductionField';
import * as audio from './alienAbductionAudio';
import './AlienAbductionGame.css';

const CANVAS_HEIGHT = 600;

const HORIZON_Y = 430;
const GROUND_Y = 548; // feet baseline for the folks on the ground

const SHIP_Y = 98; // saucer centre (before bob)
const SHIP_HALF_WIDTH = 62;
const BEAM_TOP = SHIP_Y + 14;
const ABDUCT_Y = SHIP_Y + 32; // feet this high == swallowed by the ship

const BEAM_TOP_HALF = 10;
const BEAM_GROUND_HALF = 30;
const LIFT_ACCEL = 95;
const GRAVITY = 900;
const ABDUCT_ANIM = 0.45; // seconds of the shrink-into-the-ship flourish
/** Seconds until the ship gets impatient: beam widens, the wind dies down. */
const RAGE_RAMP = 10;

/** Beats of the finale, in seconds from the moment the last survivor is crowned. */
const REVEAL_SHAKE = 1.0;   // the disguise starts twitching
const REVEAL_MORPH = 2.1;   // flash — the costume drops
const REVEAL_DESCEND = 2.3; // the saucer comes down to collect its own
const REVEAL_BEAM = 3.8;    // beam on, a slow wave goodbye
const REVEAL_RISE = 4.6;    // stepping aboard, no struggle this time
const REVEAL_DEPART = 8.0;  // ship climbs back to its hover
const SHIP_LOW_OFFSET = 92; // how far it stoops during the finale

type RunnerState = 'running' | 'beamed' | 'falling' | 'abducted';

interface Runner {
  entry: Entry;
  kind: AbducteeKind;
  color: string;
  initials: string;
  x: number;
  y: number;
  dir: 1 | -1;
  baseSpeed: number;
  liftScale: number;
  beamOffset: number;
  phase: number;
  dirTimer: number;
  state: RunnerState;
  grace: number;
  liftV: number;
  fallV: number;
  driftV: number;
  wobble: number;
  abductT: number;
}

interface Ship {
  x: number;
  targetId: number | null;
  retargetAt: number;
  flash: number;
  /** How far the saucer has stooped from its hover height (finale only). */
  yOffset: number;
  /** The beam starts dark: the saucer prowls first (see abductionField.ts). */
  beamOn: boolean;
  /** Opening strafe, until `beamOn`. */
  prowl: ProwlState;
  /** Timestamp the beam lit, which is when the impatience ramp starts. */
  beamOnAt: number;
}

interface Wind {
  strength: number;
  target: number;
  dir: 1 | -1;
  timer: number;
}

interface Mote {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface Flash {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface RaceRef {
  state: 'ready' | 'racing' | 'finished' | 'reveal';
  startTime: number;
  hasWind: boolean;
  declared: boolean;
}

/** State for the last-one-standing reveal. */
interface Reveal {
  id: number;
  t: number;
  puffed: boolean;
  /** One-shot guard so the departure sting only plays once. */
  departed: boolean;
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (winner: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  mode: AlienAbductionSubMode;
  hazards: HazardMode;
  sound: boolean;
  music: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** A fresh saucer, hovering centre-field with its beam still dark. */
function makeShip(): Ship {
  const x = CANVAS_WIDTH / 2;
  return {
    x,
    targetId: null,
    retargetAt: 0,
    flash: 0,
    yOffset: 0,
    beamOn: false,
    prowl: newProwl(x),
    beamOnAt: 0,
  };
}

/** Half-width of the tractor beam at a given height. */
function beamHalfAt(y: number, rage: number, topY: number = BEAM_TOP): number {
  const t = clamp((y - topY) / (GROUND_Y - topY), 0, 1);
  const ground = BEAM_GROUND_HALF + rage * 16;
  return BEAM_TOP_HALF + (ground - BEAM_TOP_HALF) * t;
}

/** Shortest unique-ish initials for each entry, same idea as the other modes. */
function computeInitials(entries: Entry[]): string[] {
  const initialsFor = (name: string, extraLetters = 0) => {
    const words = name.split(' ').filter(Boolean);
    const base = words.map((part) => part[0]?.toUpperCase()).join('');
    if (extraLetters <= 0 || words.length === 0) return base;
    return base + words[0].slice(1, 1 + extraLetters).toLowerCase();
  };

  const result = entries.map((e) => initialsFor(e.name));
  for (let pass = 1; pass <= 2; pass++) {
    const buckets = new Map<string, number[]>();
    result.forEach((value, idx) => {
      const existing = buckets.get(value) ?? [];
      existing.push(idx);
      buckets.set(value, existing);
    });
    let anyDupes = false;
    buckets.forEach((indexes) => {
      if (indexes.length > 1) {
        anyDupes = true;
        indexes.forEach((idx) => {
          result[idx] = initialsFor(entries[idx].name, pass);
        });
      }
    });
    if (!anyDupes) break;
  }
  return result;
}

function assignKinds(count: number, mode: AlienAbductionSubMode): AbducteeKind[] {
  // Every other sub-mode puts the whole field in one costume.
  if (mode !== 'farm' && mode !== 'mixed') {
    return Array.from({ length: count }, () => mode);
  }
  // 'farm' and 'mixed' deal from a bag so the field is varied rather than
  // clumpy: everything comes up once before anything repeats.
  const bag = mode === 'farm' ? FARM_KINDS : ABDUCTEE_KINDS;

  const assignments: AbducteeKind[] = [];
  let pool = shuffle(bag);
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) pool = shuffle(bag);
    assignments.push(pool.pop() as AbducteeKind);
  }
  return assignments;
}

/** Scatter everyone across the field, facing random ways. Starting marks are
 *  shuffled rather than list-ordered — see abductionField.startingSlots. */
function createRunners(entries: Entry[], mode: AlienAbductionSubMode): Runner[] {
  const kinds = assignKinds(entries.length, mode);
  const initials = computeInitials(entries);
  const slots = startingSlots(entries.length);
  return entries.map((entry, index) => ({
    entry,
    kind: kinds[index],
    color: generateColor(index),
    initials: initials[index],
    x: slotX(slots[index], entries.length),
    y: GROUND_Y,
    dir: Math.random() < 0.5 ? 1 : -1,
    baseSpeed: 62 + Math.random() * 52,
    liftScale: 0.82 + Math.random() * 0.45,
    beamOffset: (Math.random() - 0.5) * 16,
    phase: Math.random() * Math.PI * 2,
    dirTimer: 0.5 + Math.random() * 1.5,
    state: 'running',
    grace: 0,
    liftV: 0,
    fallV: 0,
    driftV: 0,
    wobble: 0,
    abductT: 0,
  }));
}

export const AlienAbductionGame: React.FC<Props> = ({
  entries,
  allEntries,
  onWinner,
  onRaceComplete,
  onShowFinalStandings,
  isRacing,
  currentWinner,
  mode,
  hazards,
  sound,
  music,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    audio.setAbductionMuted(!sound);
  }, [sound]);
  useEffect(() => {
    audio.setAbductionMusicMuted(!music);
  }, [music]);
  // The hum and the loop are the only things that outlive a frame, so make
  // sure leaving the mode silences them.
  useEffect(() => () => {
    audio.stopBeamHum();
    audio.stopTrack();
  }, []);

  const runnersRef = useRef<Runner[]>([]);
  const shipRef = useRef<Ship>(makeShip());
  const windRef = useRef<Wind>({ strength: 0, target: 0, dir: 1, timer: 1 });
  const revealRef = useRef<Reveal | null>(null);
  const motesRef = useRef<Mote[]>([]);
  const dustRef = useRef<Dust[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const raceRef = useRef<RaceRef>({
    state: 'ready',
    startTime: 0,
    hasWind: true,
    declared: false,
  });

  // Latest callback, read from inside the animation loop without restarting it.
  const onWinnerRef = useRef(onWinner);
  onWinnerRef.current = onWinner;

  // Static scenery, rolled once per mount.
  const sceneryRef = useRef<{
    stars: { x: number; y: number; r: number; tw: number }[];
    hills: { x: number; w: number; h: number; shade: number }[];
    tufts: { x: number; y: number; h: number }[];
    trees: { x: number; h: number }[];
  } | null>(null);
  if (!sceneryRef.current) {
    sceneryRef.current = {
      stars: Array.from({ length: 110 }, () => ({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * (HORIZON_Y - 40),
        r: 0.4 + Math.random() * 1.3,
        tw: Math.random() * Math.PI * 2,
      })),
      hills: Array.from({ length: 9 }, (_, i) => ({
        x: (i / 8) * CANVAS_WIDTH + (Math.random() - 0.5) * 30,
        w: 70 + Math.random() * 90,
        h: 30 + Math.random() * 55,
        shade: Math.random(),
      })),
      tufts: Array.from({ length: 70 }, () => ({
        x: Math.random() * CANVAS_WIDTH,
        y: GROUND_Y - 10 + Math.random() * 50,
        h: 4 + Math.random() * 7,
      })),
      trees: Array.from({ length: 7 }, () => ({
        x: Math.random() * CANVAS_WIDTH,
        h: 14 + Math.random() * 18,
      })),
    };
  }

  const entriesSignature = entries.map((e) => e.id).join(',');

  // (Re)place everyone on the field. Skipped mid-race / while results are up so
  // the finished frame keeps the abducted winner on screen.
  useEffect(() => {
    if (raceRef.current.state !== 'ready') return;
    // Nobody left to place: keep the last frame so the finale has someone to reveal.
    if (entries.length === 0) return;
    runnersRef.current = createRunners(entries, mode);
    shipRef.current = makeShip();
    motesRef.current = [];
    dustRef.current = [];
    flashesRef.current = [];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the entry-id signature so identical lists don't re-scatter everyone
  }, [entriesSignature, mode]);

  // Kick off / wind down a round.
  useEffect(() => {
    const race = raceRef.current;
    if (isRacing) {
      runnersRef.current = createRunners(entries, mode);
      shipRef.current = makeShip();
      motesRef.current = [];
      dustRef.current = [];
      flashesRef.current = [];
      windRef.current = { strength: 0, target: 0, dir: 1, timer: 0.8 };
      revealRef.current = null;

      raceRef.current = {
        state: 'racing',
        startTime: performance.now(),
        hasWind: hazards === 'random' ? Math.random() < 0.6 : hazards === 'wind',
        declared: false,
      };
      audio.resumeAbductionAudio();
      audio.playArrive();
      audio.startTrack();
    } else if (race.state === 'racing') {
      raceRef.current = { ...race, state: 'ready' };
      audio.stopBeamHum();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag should start/stop a round
  }, [isRacing]);

  // Last one standing: the survivor nobody could abduct was one of them all along.
  const isFinale = !isRacing && !!currentWinner && entries.length === 0;
  useEffect(() => {
    if (!isFinale || revealRef.current) return;
    const survivors = runnersRef.current.filter((r) => r.state !== 'abducted');
    const survivor = survivors.find((r) => r.entry.name === currentWinner) ?? survivors[0];
    if (!survivor) return;
    survivor.state = 'running';
    survivor.grace = 0;
    survivor.abductT = 0;
    survivor.y = GROUND_Y;
    revealRef.current = { id: survivor.entry.id, t: 0, puffed: false, departed: false };
    raceRef.current = { ...raceRef.current, state: 'reveal' };
  }, [isFinale, currentWinner]);

  // One persistent loop: updates while a round is live, always draws.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let last = performance.now();

    const pickTarget = (now: number) => {
      const ship = shipRef.current;
      const runners = runnersRef.current;

      // While someone is in the beam, stay locked over the highest of them.
      const beamed = runners.filter((r) => r.state === 'beamed');
      if (beamed.length > 0) {
        const highest = beamed.reduce((a, b) => (a.y < b.y ? a : b));
        ship.targetId = highest.entry.id;
        return highest.x - highest.beamOffset;
      }

      const current = runners.find((r) => r.entry.id === ship.targetId);
      if (current && current.state === 'running' && current.grace <= 0 && now < ship.retargetAt) {
        return current.x;
      }

      let pool = runners.filter((r) => r.state === 'running' && r.grace <= 0);
      if (pool.length === 0) pool = runners.filter((r) => r.state !== 'abducted');
      if (pool.length === 0) return ship.x;

      // Bias toward whoever is already closest — it hunts, it doesn't wander.
      const sorted = [...pool].sort(
        (a, b) => Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x)
      );
      const pick = sorted[Math.floor(Math.pow(Math.random(), 2) * sorted.length)] ?? sorted[0];
      ship.targetId = pick.entry.id;
      ship.retargetAt = now + 900 + Math.random() * 1400;
      return pick.x;
    };

    const escape = (runner: Runner, text: string, color: string, kick: number) => {
      audio.playEscape();
      runner.state = 'falling';
      runner.fallV = -60;
      runner.driftV = kick;
      runner.liftV = 0;
      runner.grace = 1.1 + Math.random() * 0.9;
      flashesRef.current.push({
        x: runner.x,
        y: runner.y - 48,
        text,
        color,
        life: 1.2,
      });
    };

    const stepParticles = (dt: number, windPush: number, spawnMotes: boolean, rage: number, topY: number) => {
      const ship = shipRef.current;
      const motes = motesRef.current;
      for (const mote of motes) {
        mote.y -= mote.vy * dt;
        mote.life -= dt;
        mote.x += windPush * dt * 0.1;
      }
      motesRef.current = motes.filter((m) => m.life > 0 && m.y > topY);
      if (spawnMotes && motesRef.current.length < 46) {
        for (let i = 0; i < 2; i++) {
          const y = topY + Math.random() * (GROUND_Y - topY);
          const half = beamHalfAt(y, rage, topY);
          motesRef.current.push({
            x: ship.x + (Math.random() - 0.5) * half * 1.8,
            y,
            vy: 55 + Math.random() * 120,
            life: 1.6,
            maxLife: 1.6,
            size: 1 + Math.random() * 2.2,
          });
        }
      }

      const dust = dustRef.current;
      for (const d of dust) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 260 * dt;
        d.life -= dt;
      }
      dustRef.current = dust.filter((d) => d.life > 0);

      const flashes = flashesRef.current;
      for (const f of flashes) {
        f.y -= 26 * dt;
        f.life -= dt;
      }
      flashesRef.current = flashes.filter((f) => f.life > 0);
    };

    /** The finale: costume off, saucer down, a calm ride home. */
    const updateReveal = (dt: number, now: number, windPush: number) => {
      const reveal = revealRef.current;
      const ship = shipRef.current;
      if (!reveal) return;
      reveal.t += dt;

      const runner = runnersRef.current.find((r) => r.entry.id === reveal.id);
      if (!runner) return;

      ship.x += (runner.x - ship.x) * clamp(dt * 1.6, 0, 1);
      const wantsLow = reveal.t >= REVEAL_DESCEND && reveal.t < REVEAL_DEPART;
      ship.yOffset += ((wantsLow ? SHIP_LOW_OFFSET : 0) - ship.yOffset) * clamp(dt * 1.1, 0, 1);

      if (!reveal.departed && reveal.t >= REVEAL_DEPART) {
        reveal.departed = true;
        audio.stopBeamHum();
        audio.playDepart();
        audio.playFanfare();
        audio.stopTrack();
      }

      if (!reveal.puffed && reveal.t >= REVEAL_MORPH) {
        reveal.puffed = true;
        ship.flash = 0.7;
        audio.playMorph();
        for (let i = 0; i < 26; i++) {
          const angle = (i / 26) * Math.PI * 2;
          dustRef.current.push({
            x: runner.x,
            y: GROUND_Y - 18,
            vx: Math.cos(angle) * (60 + Math.random() * 70),
            vy: Math.sin(angle) * 50 - 40,
            life: 0.8,
            maxLife: 0.8,
          });
        }
        flashesRef.current.push({
          x: runner.x,
          y: GROUND_Y - 74,
          text: '👽 ONE OF US 👽',
          color: '#9CFFD0',
          life: 2.4,
        });
      }

      if (reveal.t < REVEAL_MORPH) {
        // The disguise starts to give out.
        const shake = clamp((reveal.t - REVEAL_SHAKE) / (REVEAL_MORPH - REVEAL_SHAKE), 0, 1);
        runner.wobble = Math.sin(now / 38) * 0.13 * shake;
        runner.phase += dt * 2.5;
      } else if (reveal.t < REVEAL_RISE) {
        runner.wobble = 0;
        runner.phase += dt * 1.6;
      } else {
        runner.wobble = Math.sin(now / 430) * 0.05;
        runner.phase += dt * 1.2;
        const abductY = ABDUCT_Y + ship.yOffset;
        runner.y = Math.max(abductY, runner.y - 150 * dt);
        if (runner.y <= abductY + 0.5) {
          runner.abductT = Math.min(1, runner.abductT + dt / 0.7);
          if (runner.abductT >= 1) ship.flash = Math.max(ship.flash, 0.9);
        }
      }

      const beamTop = BEAM_TOP + ship.yOffset;
      stepParticles(dt, windPush, reveal.t >= REVEAL_BEAM && reveal.t < REVEAL_DEPART, 0.4, beamTop);
    };

    const update = (dt: number, now: number) => {
      const race = raceRef.current;
      const live = race.state === 'racing';
      const ship = shipRef.current;
      // The impatience ramp starts when the beam lights, not when the round
      // does — the opening prowl shouldn't eat into it.
      const elapsed = live && ship.beamOn ? (now - ship.beamOnAt) / 1000 : 0;
      const rage = live && ship.beamOn ? clamp(elapsed / RAGE_RAMP, 0, 1) : 0;
      const wind = windRef.current;
      const runners = runnersRef.current;

      ship.flash = Math.max(0, ship.flash - dt);

      // --- wind ------------------------------------------------------------
      wind.timer -= dt;
      if (wind.timer <= 0) {
        const gustsAllowed = live && race.hasWind && rage < 0.9;
        if (gustsAllowed && Math.random() < 0.5) {
          audio.playGust();
          wind.target = 110 + Math.random() * 130;
          wind.dir = Math.random() < 0.5 ? -1 : 1;
          wind.timer = 0.9 + Math.random() * 1.2;
        } else {
          wind.target = live ? 10 + Math.random() * 25 : 15;
          wind.timer = 0.8 + Math.random() * 1.4;
        }
      }
      const windEase = wind.target > wind.strength ? 3.4 : 1.8;
      wind.strength += (wind.target - wind.strength) * clamp(dt * windEase, 0, 1);
      const windPush = wind.strength * wind.dir * (1 - rage * 0.75);

      if (race.state === 'reveal') {
        updateReveal(dt, now, windPush);
        return;
      }

      // --- ship ------------------------------------------------------------
      if (live && !ship.beamOn) {
        // Opening prowl: cruise side to side, beam dark, nobody in danger.
        const { x, ignite } = stepProwl(ship.prowl, ship.x, dt);
        ship.x = x;
        if (ignite) {
          ship.beamOn = true;
          ship.beamOnAt = now;
          ship.flash = Math.max(ship.flash, 0.55); // the port lights up
          audio.playBeamOn();
          audio.startBeamHum();
          // A puff of dust kicks up under the fresh beam.
          for (let i = 0; i < 10; i++) {
            dustRef.current.push({
              x: ship.x + (Math.random() - 0.5) * BEAM_GROUND_HALF * 2,
              y: GROUND_Y,
              vx: (Math.random() - 0.5) * 55,
              vy: -25 - Math.random() * 45,
              life: 0.6,
              maxLife: 0.6,
            });
          }
        }
      } else if (live) {
        const targetX = pickTarget(now);
        const chase = 1.5 + rage * 2.4;
        ship.x += (targetX - ship.x) * clamp(dt * chase, 0, 1);
        ship.x += windPush * dt * 0.18;
      } else {
        ship.x += (CANVAS_WIDTH / 2 - ship.x) * clamp(dt * 0.6, 0, 1);
      }
      ship.x = clamp(ship.x, FIELD_LEFT + 10, FIELD_RIGHT - 10);

      // --- runners ---------------------------------------------------------
      for (const runner of runners) {
        switch (runner.state) {
          case 'running': {
            runner.grace = Math.max(0, runner.grace - dt);

            const gap = runner.x - ship.x;
            // Nobody panics until the beam is actually lit — during the prowl
            // the saucer is just something ominous drifting overhead.
            const fear = live && ship.beamOn ? clamp(1 - Math.abs(gap) / 170, 0, 1) : 0;
            runner.dirTimer -= dt;
            if (fear > 0.15) {
              // Bolt away from whatever is hovering overhead.
              runner.dir = gap >= 0 ? 1 : -1;
            } else if (runner.dirTimer <= 0) {
              if (Math.random() < 0.45) runner.dir = runner.dir === 1 ? -1 : 1;
              runner.dirTimer = 0.6 + Math.random() * 1.6;
            }

            const speed = runner.baseSpeed * (live ? 0.5 + fear * 1.1 : 0.35);
            runner.x += runner.dir * speed * dt + windPush * dt * 0.22;
            if (runner.x < FIELD_LEFT) {
              runner.x = FIELD_LEFT;
              runner.dir = 1;
              runner.dirTimer = 0.4;
            } else if (runner.x > FIELD_RIGHT) {
              runner.x = FIELD_RIGHT;
              runner.dir = -1;
              runner.dirTimer = 0.4;
            }
            runner.phase += (3 + speed * 0.07) * dt;
            runner.y = GROUND_Y;
            runner.wobble = 0;

            if (
              live &&
              ship.beamOn &&
              runner.grace <= 0 &&
              Math.abs(runner.x - ship.x) < beamHalfAt(GROUND_Y, rage) * 0.85
            ) {
              runner.state = 'beamed';
              runner.liftV = 0;
              audio.playCapture();
              for (let i = 0; i < 8; i++) {
                dustRef.current.push({
                  x: runner.x + (Math.random() - 0.5) * 14,
                  y: GROUND_Y,
                  vx: (Math.random() - 0.5) * 40,
                  vy: -20 - Math.random() * 40,
                  life: 0.5,
                  maxLife: 0.5,
                });
              }
            }
            break;
          }

          case 'beamed': {
            runner.liftV = Math.min(
              (118 + rage * 95) * runner.liftScale,
              runner.liftV + LIFT_ACCEL * (1 + rage) * dt
            );
            runner.y -= runner.liftV * dt;
            runner.phase += dt * 6;
            runner.wobble = Math.sin(now / 150 + runner.entry.id) * 0.22;

            // The beam reels them toward its axis; a hard gust fights it.
            const anchor = ship.x + runner.beamOffset;
            runner.x += (anchor - runner.x) * clamp(dt * 2.7, 0, 1);
            runner.x += windPush * dt * 0.78;

            if (Math.abs(runner.x - ship.x) > beamHalfAt(runner.y, rage)) {
              escape(runner, '💨 BLOWN CLEAR!', '#9ff0ff', windPush * 0.45);
              break;
            }

            if (runner.y <= ABDUCT_Y) {
              runner.y = ABDUCT_Y;
              runner.state = 'abducted';
              runner.abductT = 0;
              ship.flash = 0.8;
              audio.playAbducted();
              audio.stopBeamHum();
            }
            break;
          }

          case 'falling': {
            runner.fallV += GRAVITY * dt;
            runner.y += runner.fallV * dt;
            runner.x = clamp(runner.x + runner.driftV * dt, FIELD_LEFT, FIELD_RIGHT);
            runner.driftV *= 1 - clamp(dt * 1.5, 0, 1);
            runner.phase += dt * 8;
            runner.wobble = Math.sin(now / 90 + runner.entry.id) * 0.4;
            if (runner.y >= GROUND_Y) {
              runner.y = GROUND_Y;
              runner.fallV = 0;
              runner.state = 'running';
              runner.dir = runner.x > ship.x ? 1 : -1;
              runner.dirTimer = 0.5;
              for (let i = 0; i < 10; i++) {
                dustRef.current.push({
                  x: runner.x + (Math.random() - 0.5) * 10,
                  y: GROUND_Y,
                  vx: (Math.random() - 0.5) * 110,
                  vy: -30 - Math.random() * 60,
                  life: 0.55,
                  maxLife: 0.55,
                });
              }
            }
            break;
          }

          case 'abducted': {
            runner.abductT = Math.min(1, runner.abductT + dt / ABDUCT_ANIM);
            if (runner.abductT >= 1 && !race.declared) {
              race.declared = true;
              race.state = 'finished';
              onWinnerRef.current(runner.entry);
            }
            break;
          }
        }
      }

      stepParticles(dt, windPush, live && ship.beamOn, rage, BEAM_TOP);
    };

    // ---------------------------------------------------------------- drawing
    const drawSky = (now: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
      sky.addColorStop(0, '#07091d');
      sky.addColorStop(0.5, '#141a3c');
      sky.addColorStop(1, '#3b2f5c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, HORIZON_Y);

      const scenery = sceneryRef.current!;
      scenery.stars.forEach((star) => {
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(now / 900 + star.tw));
        ctx.fillStyle = `rgba(255,255,255,${(0.75 * twinkle).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Moon
      ctx.save();
      const glow = ctx.createRadialGradient(325, 78, 6, 325, 78, 54);
      glow.addColorStop(0, 'rgba(255,245,210,0.35)');
      glow.addColorStop(1, 'rgba(255,245,210,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(325, 78, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f3ead0';
      ctx.beginPath();
      ctx.arc(325, 78, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(190,180,155,0.55)';
      ctx.beginPath();
      ctx.arc(318, 72, 5, 0, Math.PI * 2);
      ctx.arc(332, 84, 3.5, 0, Math.PI * 2);
      ctx.arc(327, 67, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawLand = () => {
      const scenery = sceneryRef.current!;

      // Rolling hills on the horizon, back layer then front layer
      scenery.hills.forEach((hill) => {
        ctx.fillStyle = hill.shade > 0.5 ? '#1d2545' : '#232c52';
        ctx.beginPath();
        ctx.ellipse(hill.x, HORIZON_Y + 6, hill.w, hill.h, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      });

      // Tree line silhouettes
      ctx.fillStyle = '#131a33';
      scenery.trees.forEach((tree) => {
        ctx.beginPath();
        ctx.moveTo(tree.x - 7, HORIZON_Y + 4);
        ctx.lineTo(tree.x, HORIZON_Y + 4 - tree.h);
        ctx.lineTo(tree.x + 7, HORIZON_Y + 4);
        ctx.closePath();
        ctx.fill();
      });

      // Field
      const ground = ctx.createLinearGradient(0, HORIZON_Y, 0, CANVAS_HEIGHT);
      ground.addColorStop(0, '#20402b');
      ground.addColorStop(0.45, '#2c5636');
      ground.addColorStop(1, '#16301f');
      ctx.fillStyle = ground;
      ctx.fillRect(0, HORIZON_Y, CANVAS_WIDTH, CANVAS_HEIGHT - HORIZON_Y);

      // Fence along the back of the field
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y + 18);
      ctx.lineTo(CANVAS_WIDTH, HORIZON_Y + 14);
      ctx.moveTo(0, HORIZON_Y + 26);
      ctx.lineTo(CANVAS_WIDTH, HORIZON_Y + 22);
      ctx.stroke();
      for (let x = 10; x < CANVAS_WIDTH; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x, HORIZON_Y + 8);
        ctx.lineTo(x, HORIZON_Y + 32);
        ctx.stroke();
      }

      // Grass tufts
      ctx.strokeStyle = 'rgba(140, 200, 140, 0.35)';
      ctx.lineWidth = 1.4;
      scenery.tufts.forEach((tuft) => {
        ctx.beginPath();
        ctx.moveTo(tuft.x, tuft.y);
        ctx.lineTo(tuft.x - 2, tuft.y - tuft.h);
        ctx.moveTo(tuft.x, tuft.y);
        ctx.lineTo(tuft.x + 3, tuft.y - tuft.h * 0.8);
        ctx.stroke();
      });
    };

    const drawWind = (now: number) => {
      const wind = windRef.current;
      if (wind.strength < 25) return;
      const intensity = clamp((wind.strength - 25) / 200, 0, 1);
      ctx.save();
      ctx.strokeStyle = `rgba(200,235,255,${(0.1 + intensity * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      const count = Math.round(6 + intensity * 16);
      for (let i = 0; i < count; i++) {
        const seed = i * 97.3;
        const y = 120 + ((seed * 3.7) % (GROUND_Y - 140));
        const travel = ((now / 1000) * wind.strength * 1.2 + seed * 13) % (CANVAS_WIDTH + 160);
        const x = wind.dir > 0 ? travel - 80 : CANVAS_WIDTH + 80 - travel;
        const len = 14 + intensity * 30;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + wind.dir * len, y - 2);
        ctx.stroke();
      }
      if (intensity > 0.45) {
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = wind.dir > 0 ? 'left' : 'right';
        ctx.fillStyle = `rgba(200,240,255,${(0.35 + intensity * 0.5).toFixed(3)})`;
        ctx.fillText('💨 GUST', wind.dir > 0 ? 12 : CANVAS_WIDTH - 12, 34);
      }
      ctx.restore();
    };

    const drawBeam = (
      now: number,
      rage: number,
      overlay: boolean,
      topY: number = BEAM_TOP,
      fade: number = 1
    ) => {
      const ship = shipRef.current;
      const groundHalf = beamHalfAt(GROUND_Y, rage, topY);
      const pulse = 0.82 + 0.18 * Math.sin(now / 180);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (overlay ? 0.22 * pulse : 0.6 * pulse) * fade;

      const grad = ctx.createLinearGradient(0, topY, 0, GROUND_Y);
      grad.addColorStop(0, 'rgba(180,255,220,0.85)');
      grad.addColorStop(0.45, 'rgba(90,240,190,0.35)');
      grad.addColorStop(1, 'rgba(60,220,255,0.12)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ship.x - BEAM_TOP_HALF, topY);
      ctx.lineTo(ship.x + BEAM_TOP_HALF, topY);
      ctx.lineTo(ship.x + groundHalf, GROUND_Y);
      ctx.lineTo(ship.x - groundHalf, GROUND_Y);
      ctx.closePath();
      ctx.fill();

      if (!overlay) {
        // Scan rings sliding down the cone
        ctx.strokeStyle = 'rgba(190,255,235,0.35)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const t = (((now / 1400) + i / 5) % 1);
          const y = topY + t * (GROUND_Y - topY);
          const half = beamHalfAt(y, rage, topY);
          ctx.beginPath();
          ctx.ellipse(ship.x, y, half, half * 0.22, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Pool of light on the grass
        ctx.fillStyle = 'rgba(150,255,210,0.28)';
        ctx.beginPath();
        ctx.ellipse(ship.x, GROUND_Y + 2, groundHalf, groundHalf * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Motes riding the pull upward
        motesRef.current.forEach((mote) => {
          ctx.globalAlpha = 0.65 * (mote.life / mote.maxLife) * fade;
          ctx.fillStyle = '#d6ffe9';
          ctx.beginPath();
          ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.restore();
    };

    const drawShip = (now: number) => {
      const ship = shipRef.current;
      const bob = Math.sin(now / 780) * 5;
      const cx = ship.x;
      const cy = SHIP_Y + bob + ship.yOffset;

      ctx.save();

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 110);
      halo.addColorStop(0, `rgba(120,255,200,${0.16 + ship.flash * 0.3})`);
      halo.addColorStop(1, 'rgba(120,255,200,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, 110, 0, Math.PI * 2);
      ctx.fill();

      // Dome
      const dome = ctx.createLinearGradient(cx, cy - 34, cx, cy);
      dome.addColorStop(0, 'rgba(180,255,245,0.95)');
      dome.addColorStop(1, 'rgba(60,170,190,0.65)');
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 4, 24, 22, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // Two little pilots watching the field
      ctx.fillStyle = '#7de3a0';
      ctx.beginPath();
      ctx.ellipse(cx - 8, cy - 12, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 8, cy - 12, 4.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10201a';
      ctx.beginPath();
      ctx.ellipse(cx - 9.5, cy - 13, 1.8, 2.6, -0.4, 0, Math.PI * 2);
      ctx.ellipse(cx + 6.5, cy - 13, 1.8, 2.6, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Hull
      const hull = ctx.createLinearGradient(cx, cy - 8, cx, cy + 20);
      hull.addColorStop(0, '#d9e6ef');
      hull.addColorStop(0.5, '#8fa6b8');
      hull.addColorStop(1, '#3d4d5e');
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.ellipse(cx, cy, SHIP_HALF_WIDTH, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Underbelly + beam port
      ctx.fillStyle = '#2a3542';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10, 34, 11, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = `rgba(170,255,225,${0.6 + ship.flash * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 14, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rim lights chasing around the saucer
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        const lx = cx - SHIP_HALF_WIDTH + 12 + t * (SHIP_HALF_WIDTH * 2 - 24);
        const ly = cy + 7 + Math.sin(t * Math.PI) * 4;
        const lit = (Math.sin(now / 160 - i * 0.7) + 1) / 2;
        ctx.fillStyle = `rgba(255,${120 + lit * 120},${60 + lit * 90},${0.35 + lit * 0.65})`;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawRunner = (runner: Runner, now: number) => {
      const airborne = runner.state !== 'running';
      const height = clamp((GROUND_Y - runner.y) / (GROUND_Y - ABDUCT_Y), 0, 1);
      const scale = (1 - height * 0.45) * (1 - runner.abductT * 0.85);
      const alpha = 1 - runner.abductT;
      if (alpha <= 0.02) return;

      // Shadow on the grass
      if (!airborne || height < 0.6) {
        ctx.save();
        ctx.globalAlpha = 0.3 * (1 - height);
        ctx.fillStyle = '#0b1a12';
        ctx.beginPath();
        ctx.ellipse(runner.x, GROUND_Y + 3, 11, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(runner.x, runner.y);
      ctx.scale(scale, scale);
      if (runner.wobble) ctx.rotate(runner.wobble);
      if (runner.dir === -1) ctx.scale(-1, 1);
      drawAbductee(ctx, runner.kind, runner.color, { phase: runner.phase, lifted: airborne });
      ctx.restore();

      if (runner.abductT > 0.15) return;

      // Initials tag
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const labelY = runner.y - 44 * scale;
      ctx.strokeText(runner.initials, runner.x, labelY);
      ctx.fillStyle = runner.state === 'beamed' ? '#b6ffe0' : '#fff';
      ctx.fillText(runner.initials, runner.x, labelY);
      ctx.restore();

      // Panic mark while being reeled in
      if (runner.state === 'beamed' && Math.sin(now / 200 + runner.entry.id) > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd166';
        ctx.fillText('!', runner.x + 14 * scale, runner.y - 46 * scale);
        ctx.restore();
      }
    };

    /** The survivor's costume comes off and the saucer collects one of its own. */
    const drawReveal = (reveal: Reveal, now: number) => {
      const runner = runnersRef.current.find((r) => r.entry.id === reveal.id);
      if (!runner) return;
      const ship = shipRef.current;
      const morphed = reveal.t >= REVEAL_MORPH;

      // The shed disguise, crumpled where they stood
      if (morphed) {
        ctx.save();
        ctx.globalAlpha = clamp((reveal.t - REVEAL_MORPH) / 0.4, 0, 1) * 0.95;
        ctx.translate(runner.x + 17, GROUND_Y);
        drawDisguise(ctx, runner.color);
        ctx.restore();
      }

      // The flash that blows the disguise off
      const sinceMorph = reveal.t - REVEAL_MORPH;
      if (sinceMorph >= 0 && sinceMorph < 0.5) {
        const k = sinceMorph / 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#bfffe0';
        ctx.lineWidth = 1 + 4 * (1 - k);
        ctx.beginPath();
        ctx.arc(runner.x, GROUND_Y - 26, 8 + k * 64, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const alpha = 1 - runner.abductT;
      if (alpha > 0.02) {
        const abductY = ABDUCT_Y + ship.yOffset;
        const height = clamp((GROUND_Y - runner.y) / Math.max(1, GROUND_Y - abductY), 0, 1);
        const scale = (1 - height * 0.4) * (1 - runner.abductT * 0.85);

        if (height < 0.6) {
          ctx.save();
          ctx.globalAlpha = 0.3 * (1 - height);
          ctx.fillStyle = '#0b1a12';
          ctx.beginPath();
          ctx.ellipse(runner.x, GROUND_Y + 3, 11, 3.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(runner.x, runner.y);
        ctx.scale(scale, scale);
        if (runner.wobble) ctx.rotate(runner.wobble);
        if (morphed) {
          drawAlien(ctx, runner.color, {
            phase: runner.phase,
            waving: reveal.t >= REVEAL_BEAM && reveal.t < REVEAL_RISE + 0.8,
          });
        } else {
          if (runner.dir === -1) ctx.scale(-1, 1);
          drawAbductee(ctx, runner.kind, runner.color, { phase: runner.phase, lifted: false });
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        const labelY = runner.y - (morphed ? 64 : 44) * scale;
        ctx.strokeText(runner.initials, runner.x, labelY);
        ctx.fillStyle = morphed ? '#9CFFD0' : '#fff';
        ctx.fillText(runner.initials, runner.x, labelY);
        ctx.restore();
      }

      // Closing caption once they are aboard
      if (reveal.t > REVEAL_RISE + 1.4) {
        const pulse = 0.72 + 0.28 * Math.sin(now / 320);
        ctx.save();
        ctx.globalAlpha = clamp((reveal.t - REVEAL_RISE - 1.4) / 0.8, 0, 1) * pulse;
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeText('👽 ALIEN IN DISGUISE 👽', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
        ctx.fillStyle = '#9CFFD0';
        ctx.fillText('👽 ALIEN IN DISGUISE 👽', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
        ctx.restore();
      }
    };

    const draw = (now: number) => {
      const race = raceRef.current;
      const live = race.state === 'racing';
      const revealing = race.state === 'reveal';
      const reveal = revealRef.current;
      const ship = shipRef.current;
      const rage = live && ship.beamOn ? clamp((now - ship.beamOnAt) / 1000 / RAGE_RAMP, 0, 1) : 0;
      const beamTop = BEAM_TOP + ship.yOffset;
      const revealT = reveal?.t ?? 0;
      const beamFade = revealing
        ? clamp((revealT - REVEAL_BEAM) / 0.5, 0, 1) * (1 - clamp((revealT - REVEAL_DEPART) / 0.6, 0, 1))
        : 1;
      // Dark through the opening prowl; the finale lights its own beam.
      const beamOn =
        beamFade > 0 &&
        ((live && ship.beamOn) || revealing || runnersRef.current.some((r) => r.state === 'abducted'));

      drawSky(now);
      drawLand();
      drawWind(now);
      if (beamOn) drawBeam(now, rage, false, beamTop, beamFade);

      dustRef.current.forEach((d) => {
        ctx.globalAlpha = clamp(d.life / d.maxLife, 0, 1) * 0.6;
        ctx.fillStyle = '#c9b88f';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      runnersRef.current.forEach((runner) => {
        if (revealing && reveal && runner.entry.id === reveal.id) return;
        drawRunner(runner, now);
      });
      if (revealing && reveal) drawReveal(reveal, now);
      if (beamOn) drawBeam(now, rage, true, beamTop, beamFade);
      drawShip(now);

      flashesRef.current.forEach((flash) => {
        ctx.save();
        ctx.globalAlpha = clamp(flash.life, 0, 1);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(flash.text, flash.x, flash.y);
        ctx.fillStyle = flash.color;
        ctx.fillText(flash.text, flash.x, flash.y);
        ctx.restore();
      });
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (raceRef.current.state !== 'finished') update(dt, now);
      draw(now);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <div className="alien-abduction-game">
      <div className="alien-abduction-canvas-host">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="alien-abduction-canvas"
        />
      </div>

      <WinnerDialog
        theme={alienAbductionTheme}
        show={!!currentWinner && !isRacing}
        isFinals={entries.length === 0}
        winner={(() => {
          const winnerEntry = allEntries.find((e) => e.name === currentWinner);
          return {
            name: currentWinner ?? '',
            imageDataUrl: winnerEntry ? getPreferredEntryImage(winnerEntry) : undefined,
          };
        })()}
        headline="🛸 ABDUCTED 🛸"
        finalsHeadline="👽 ALIEN IN DISGUISE 👽"
        nextLabel="▶ Next Abduction"
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
      />
    </div>
  );
};
