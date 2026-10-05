import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { shuffle } from '../../../utils/array';
import { createShuffleBag } from '../../../utils/shuffleBag';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { alienAbductionTheme } from '../themes';
import { ABDUCTEE_KINDS, drawAbductee, drawAlien, drawDisguise } from './abducteeSprites';
import { FARM_KINDS } from './alienAbductionSettingsStore';
import type {
  AbducteeKind,
  AlienAbductionSubMode,
  FinaleMode,
  HazardMode,
  LocationMode,
} from './alienAbductionSettingsStore';
import {
  DISGUISE,
  FINALE_CAPTIONS,
  FINALE_IDS,
  HERO,
  parachutePlan,
  type FinaleId,
} from './abductionFinale';
import {
  LOCATION_IDS,
  WEATHER_IDS,
  CAPTION_MS,
  captionAlpha,
  drawLocation,
  drawSceneCaption,
  drawWeather,
  weatherHasGusts,
  type LocationId,
  type Weather,
} from './abductionScenery';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIELD_LEFT,
  FIELD_RIGHT,
  GROUND_Y,
  newProwl,
  slotX,
  startingSlots,
  stepProwl,
  type ProwlState,
} from './abductionField';
import * as audio from './alienAbductionAudio';
import './AlienAbductionGame.css';

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

// Beats of each ending live in abductionFinale.ts; these are the local names
// the disguise sequence has always used.
const REVEAL_SHAKE = DISGUISE.SHAKE;
const REVEAL_MORPH = DISGUISE.MORPH;
const REVEAL_DESCEND = DISGUISE.DESCEND;
const REVEAL_BEAM = DISGUISE.BEAM;
const REVEAL_RISE = DISGUISE.RISE;
const REVEAL_DEPART = DISGUISE.DEPART;
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
  /** Judder amplitude while the saucer is coming apart (hero ending only). */
  shake: number;
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
  location: LocationId;
  weather: Weather;
  /** Seconds the location/weather caption stays up at the top of a round. */
  captionUntil: number;
  declared: boolean;
}

/** State for the last-one-standing reveal. */
interface Reveal {
  id: number;
  t: number;
  /** Which ending is playing. */
  kind: FinaleId;
  puffed: boolean;
  /** One-shot guard so the departure sting only plays once. */
  departed: boolean;
  /** Hero ending one-shots: alarm, explosion, canopies. */
  rumbled: boolean;
  boomed: boolean;
}

/** One participant floating home after the saucer comes apart. */
interface Chute {
  kind: AbducteeKind;
  color: string;
  initials: string;
  /** The hero gets a gold label and lands dead centre of the attention. */
  isHero: boolean;
  x: number;
  y: number;
  targetX: number;
  speed: number;
  sway: number;
  phase: number;
  /** Seconds before this one bails out. */
  delay: number;
  /** Canopy deployment, 0..1. */
  open: number;
  landed: boolean;
}

/** A piece of the saucer, after. */
interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  life: number;
  maxLife: number;
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
  location: LocationMode;
  finale: FinaleMode;
  sound: boolean;
  music: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Where the saucer shows up and what the sky is doing are pure set dressing —
// they have no bearing on who gets taken — so these draw from shuffle bags to
// cycle the whole catalogue before repeating. Never for the pick itself.
const nextLocation = createShuffleBag(LOCATION_IDS);
const nextWeather = createShuffleBag(WEATHER_IDS);
// The winner is already decided before any ending plays, so this is theatre
// too — the bag just stops the same send-off coming up twice in a row.
const nextFinale = createShuffleBag(FINALE_IDS);

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
    shake: 0,
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
  location,
  finale,
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
  const chutesRef = useRef<Chute[]>([]);
  const debrisRef = useRef<Debris[]>([]);
  // The winner dialog headline depends on which ending played, so this one bit
  // of finale state has to live in React rather than a ref.
  const [finaleKind, setFinaleKind] = useState<FinaleId>('disguise');
  const motesRef = useRef<Mote[]>([]);
  const dustRef = useRef<Dust[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const raceRef = useRef<RaceRef>({
    state: 'ready',
    startTime: 0,
    hasWind: true,
    location: 'field',
    weather: 'clear',
    captionUntil: 0,
    declared: false,
  });

  // Latest settings, read from inside the round-start effect without listing
  // them as deps (only the racing flag may start a round).
  const sceneSettingsRef = useRef({ hazards, location, finale });
  sceneSettingsRef.current = { hazards, location, finale };

  // The finale needs the whole roster and the current costume setting, and the
  // loop only mounts once, so both are read through refs like the callbacks.
  const allEntriesRef = useRef(allEntries);
  allEntriesRef.current = allEntries;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Latest callback, read from inside the animation loop without restarting it.
  const onWinnerRef = useRef(onWinner);
  onWinnerRef.current = onWinner;

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
      chutesRef.current = [];
      debrisRef.current = [];
      windRef.current = { strength: 0, target: 0, dir: 1, timer: 0.8 };
      revealRef.current = null;

      const scene = sceneSettingsRef.current;
      const loc = scene.location === 'random' ? nextLocation() : scene.location;
      const weather = scene.hazards === 'random' ? nextWeather() : scene.hazards;

      raceRef.current = {
        state: 'racing',
        startTime: performance.now(),
        // Only the blustery weathers can blow an abductee back out of the beam.
        hasWind: weatherHasGusts(weather),
        location: loc,
        weather,
        captionUntil: performance.now() + CAPTION_MS,
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

    const pinned = sceneSettingsRef.current.finale;
    const kind = pinned === 'random' ? nextFinale() : pinned;
    setFinaleKind(kind);

    chutesRef.current = [];
    debrisRef.current = [];
    revealRef.current = {
      id: survivor.entry.id,
      t: 0,
      kind,
      puffed: false,
      departed: false,
      rumbled: false,
      boomed: false,
    };
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

    /** Everyone the saucer ever took, bailing out of the wreck. */
    const spawnChutes = (hero: Runner) => {
      const ship = shipRef.current;
      const roster = allEntriesRef.current;
      const kinds = assignKinds(roster.length, modeRef.current);
      const initials = computeInitials(roster);
      const plan = parachutePlan(roster.length);
      chutesRef.current = roster.map((entry: Entry, i: number) => ({
        kind: entry.id === hero.entry.id ? hero.kind : kinds[i],
        color: entry.id === hero.entry.id ? hero.color : generateColor(i),
        initials: initials[i],
        isHero: entry.id === hero.entry.id,
        // They all come out of the fireball, then spread to their own patch.
        x: ship.x + (Math.random() - 0.5) * 70,
        y: SHIP_Y + ship.yOffset + (Math.random() - 0.5) * 24,
        targetX: plan[i].x,
        speed: plan[i].speed,
        sway: plan[i].sway,
        phase: plan[i].phase,
        delay: plan[i].delay,
        open: 0,
        landed: false,
      }));
    };

    /** The saucer bursting: a ring of hull fragments thrown outward. */
    const spawnDebris = (cx: number, cy: number) => {
      debrisRef.current = Array.from({ length: 26 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 190;
        return {
          x: cx + (Math.random() - 0.5) * 40,
          y: cy + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          rot: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 9,
          size: 3 + Math.random() * 7,
          life: 2.2 + Math.random() * 1.6,
          maxLife: 3.8,
        };
      });
    };

    /**
     * The hero ending: the survivor is taken like everyone else, and then the
     * saucer tears itself apart — every participant it collected floats home.
     */
    const updateHero = (dt: number, now: number, windPush: number) => {
      const reveal = revealRef.current;
      const ship = shipRef.current;
      if (!reveal) return;
      const runner = runnersRef.current.find((r) => r.entry.id === reveal.id);
      if (!runner) return;
      const t = reveal.t;

      if (!reveal.boomed) {
        ship.x += (runner.x - ship.x) * clamp(dt * 1.6, 0, 1);
        const wantsLow = t >= HERO.DESCEND && t < HERO.BOOM;
        ship.yOffset += ((wantsLow ? SHIP_LOW_OFFSET : 0) - ship.yOffset) * clamp(dt * 1.1, 0, 1);
      }

      // Lifted, then swallowed.
      if (t >= HERO.RISE && t < HERO.BOOM) {
        const abductY = ABDUCT_Y + ship.yOffset;
        runner.y = Math.max(abductY, runner.y - 150 * dt);
        runner.wobble = Math.sin(now / 180) * 0.12;
        runner.phase += dt * 3;
        if (runner.y <= abductY + 0.5) {
          runner.abductT = Math.min(1, runner.abductT + dt / 0.6);
        }
      } else if (t < HERO.RISE) {
        runner.phase += dt * 2.2;
      }

      if (!reveal.rumbled && t >= HERO.RUMBLE) {
        reveal.rumbled = true;
        audio.stopBeamHum();
        audio.playAlarm();
      }

      // Shaking itself to pieces: the flash flickers and the hull judders.
      if (t >= HERO.RUMBLE && t < HERO.BOOM) {
        const build = clamp((t - HERO.RUMBLE) / (HERO.BOOM - HERO.RUMBLE), 0, 1);
        ship.shake = build * 7;
        ship.flash = 0.35 + 0.5 * build * Math.abs(Math.sin(now / 70));
      }

      if (!reveal.boomed && t >= HERO.BOOM) {
        reveal.boomed = true;
        ship.shake = 0;
        ship.flash = 1;
        const cy = SHIP_Y + ship.yOffset;
        spawnDebris(ship.x, cy);
        spawnChutes(runner);
        // The hero is out of the ship now and lands with everyone else.
        runner.abductT = 1;
        audio.playExplosion();
        audio.stopTrack();
        setTimeout(() => audio.playChutes(), 450);
        flashesRef.current.push({
          x: CANVAS_WIDTH / 2,
          y: SHIP_Y + 70,
          text: '💥 SHIP DOWN 💥',
          color: '#ffd27a',
          life: 2.6,
        });
      }

      if (reveal.boomed) {
        ship.flash = Math.max(0, ship.flash - dt * 1.2);
        stepDebris(dt);
        stepChutes(dt, now);
      }

      if (!reveal.departed && t >= HERO.CAPTION) {
        reveal.departed = true;
        audio.playFanfare();
      }

      const beamTop = BEAM_TOP + ship.yOffset;
      stepParticles(dt, windPush, t >= HERO.BEAM && t < HERO.ABOARD, 0.4, beamTop);
    };

    const stepDebris = (dt: number) => {
      const next: Debris[] = [];
      for (const d of debrisRef.current) {
        d.life -= dt;
        if (d.life <= 0) continue;
        d.vy += GRAVITY * 0.35 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        // Fragments settle on the ground rather than falling through it.
        if (d.y >= GROUND_Y) {
          d.y = GROUND_Y;
          d.vy = 0;
          d.vx *= 0.8;
          d.spin *= 0.6;
        }
        next.push(d);
      }
      debrisRef.current = next;
    };

    const stepChutes = (dt: number, now: number) => {
      for (const c of chutesRef.current) {
        if (c.delay > 0) {
          c.delay -= dt;
          continue;
        }
        if (c.landed) continue;
        c.open = Math.min(1, c.open + dt * 2.6);
        // Falls fast until the canopy catches, then drifts toward its patch.
        const fall = c.speed * (0.35 + 0.65 * c.open);
        c.y += fall * dt;
        c.x += (c.targetX - c.x) * clamp(dt * 0.9, 0, 1);
        if (c.y >= GROUND_Y) {
          c.y = GROUND_Y;
          c.landed = true;
          dustRef.current.push(
            ...Array.from({ length: 5 }, () => ({
              x: c.x,
              y: GROUND_Y,
              vx: (Math.random() - 0.5) * 70,
              vy: -20 - Math.random() * 30,
              life: 0.5,
              maxLife: 0.5,
            }))
          );
        }
      }
      void now;
    };

    /** The finale: costume off, saucer down, a calm ride home. */
    const updateReveal = (dt: number, now: number, windPush: number) => {
      const reveal = revealRef.current;
      const ship = shipRef.current;
      if (!reveal) return;
      reveal.t += dt;
      if (reveal.kind === 'hero') {
        updateHero(dt, now, windPush);
        return;
      }

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
    /** The live gust that can blow an abductee out of the beam. Distinct from
     *  the ambient weather below: this one is the mechanic telling on itself. */
    const drawGust = (now: number) => {
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

    const drawCaption = (now: number) => {
      const race = raceRef.current;
      drawSceneCaption(ctx, race.location, race.weather, captionAlpha(race.captionUntil - now));
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
      // The judder as it tears itself apart; zero for every other moment.
      const jx = ship.shake ? (Math.random() - 0.5) * ship.shake : 0;
      const jy = ship.shake ? (Math.random() - 0.5) * ship.shake : 0;
      const cx = ship.x + jx;
      const cy = SHIP_Y + bob + ship.yOffset + jy;

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

    /** Burning hull fragments, tumbling and then lying where they fell. */
    const drawDebris = () => {
      for (const d of debrisRef.current) {
        const fade = clamp(d.life / 1.2, 0, 1);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.fillStyle = '#6d7f8f';
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.7);
        // Still glowing while it is fresh.
        if (d.life > d.maxLife - 1.4) {
          ctx.globalAlpha = fade * 0.8;
          ctx.fillStyle = '#ffb765';
          ctx.fillRect(-d.size / 2, -d.size / 2, d.size * 0.45, d.size * 0.35);
        }
        ctx.restore();
      }
    };

    /** The fireball, for the moment or so after the saucer goes up. */
    const drawFireball = (reveal: Reveal) => {
      const since = reveal.t - HERO.BOOM;
      if (since < 0 || since > 1.1) return;
      const ship = shipRef.current;
      const cy = SHIP_Y + ship.yOffset;
      const k = since / 1.1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k;
      const r = 26 + k * 120;
      const burst = ctx.createRadialGradient(ship.x, cy, 4, ship.x, cy, r);
      burst.addColorStop(0, 'rgba(255,255,235,0.95)');
      burst.addColorStop(0.35, 'rgba(255,190,90,0.7)');
      burst.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = burst;
      ctx.beginPath();
      ctx.arc(ship.x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Shockwave ring
      ctx.strokeStyle = `rgba(255,230,180,${(1 - k).toFixed(3)})`;
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(ship.x, cy, 20 + k * 190, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    /** One participant under a canopy, on the way home. */
    const drawChute = (c: Chute, now: number) => {
      if (c.delay > 0) return;
      const swing = c.landed ? 0 : Math.sin(now / 520 + c.phase) * c.sway;
      const x = c.x + swing * 0.35;
      const tilt = c.landed ? 0 : (swing / Math.max(c.sway, 1)) * 0.12;

      ctx.save();
      ctx.translate(x, c.y);

      // Canopy and rigging, collapsing once they are down
      const canopy = c.open * (c.landed ? 0.3 : 1);
      if (canopy > 0.02) {
        const w = 27 * canopy;
        const h = 18 * canopy;
        const cy = -58 + (c.landed ? 26 : 0);
        const harness = -20;
        ctx.save();
        ctx.rotate(tilt);

        // The hero's canopy gets a halo so it reads as theirs even next to a
        // participant whose own colour happens to be gold.
        if (c.isHero) {
          const halo = ctx.createRadialGradient(0, cy, 4, 0, cy, w * 2.2);
          halo.addColorStop(0, 'rgba(255,215,110,0.45)');
          halo.addColorStop(1, 'rgba(255,215,110,0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(0, cy, w * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Gores, alternating the fabric with the jumper's colour
        for (let i = 0; i < 4; i++) {
          const a0 = Math.PI + (i * Math.PI) / 4;
          const a1 = Math.PI + ((i + 1) * Math.PI) / 4;
          ctx.fillStyle = i % 2 ? '#f2f5fb' : (c.isHero ? '#FFC93C' : c.color);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a0) * w, cy + Math.sin(a0) * h);
          ctx.ellipse(0, cy, w, h, 0, a0, a1);
          ctx.lineTo(0, cy);
          ctx.closePath();
          ctx.fill();
        }
        // Rim, so the dome has an edge against the night sky
        ctx.strokeStyle = c.isHero ? 'rgba(255,240,190,0.95)' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, cy, w, h, 0, Math.PI, Math.PI * 2);
        ctx.stroke();

        // Rigging down to the harness
        ctx.strokeStyle = 'rgba(225,232,245,0.7)';
        ctx.lineWidth = 0.9;
        for (const k of [-1, -0.45, 0.45, 1]) {
          ctx.beginPath();
          ctx.moveTo(w * k, cy);
          ctx.lineTo(0, harness);
          ctx.stroke();
        }
        ctx.restore();
      }

      // The passenger
      ctx.save();
      ctx.rotate(tilt * 0.6);
      drawAbductee(ctx, c.kind, c.color, { phase: c.landed ? 0 : now / 400 + c.phase, lifted: !c.landed });
      ctx.restore();
      ctx.restore();

      // Name, gold for the one who brought the ship down
      ctx.save();
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const labelY = c.y - (canopy > 0.3 ? 82 : 42);
      ctx.strokeText(c.initials, x, labelY);
      ctx.fillStyle = c.isHero ? '#FFD966' : '#fff';
      ctx.fillText(c.initials, x, labelY);
      ctx.restore();
    };

    /** The hero ending, from the last catch to the landing. */
    const drawHeroReveal = (reveal: Reveal, now: number) => {
      const runner = runnersRef.current.find((r) => r.entry.id === reveal.id);
      const ship = shipRef.current;

      // Before the blast the survivor rides the beam up like anyone else.
      if (runner && !reveal.boomed) {
        const alpha = 1 - runner.abductT;
        if (alpha > 0.02) {
          const abductY = ABDUCT_Y + ship.yOffset;
          const height = clamp((GROUND_Y - runner.y) / Math.max(1, GROUND_Y - abductY), 0, 1);
          const scale = (1 - height * 0.4) * (1 - runner.abductT * 0.85);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(runner.x, runner.y);
          ctx.scale(scale, scale);
          if (runner.wobble) ctx.rotate(runner.wobble);
          if (runner.dir === -1) ctx.scale(-1, 1);
          drawAbductee(ctx, runner.kind, runner.color, {
            phase: runner.phase,
            lifted: reveal.t >= HERO.RISE,
          });
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.strokeText(runner.initials, runner.x, runner.y - 44 * scale);
          ctx.fillStyle = '#fff';
          ctx.fillText(runner.initials, runner.x, runner.y - 44 * scale);
          ctx.restore();
        }
      }

      drawFireball(reveal);
      drawDebris();
      for (const c of chutesRef.current) drawChute(c, now);
    };

    /** The survivor's costume comes off and the saucer collects one of its own. */
    const drawReveal = (reveal: Reveal, now: number) => {
      if (reveal.kind === 'hero') {
        drawHeroReveal(reveal, now);
        return;
      }
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
        const text = FINALE_CAPTIONS.disguise;
        ctx.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
        ctx.fillStyle = '#9CFFD0';
        ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 22);
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
      // Each ending runs the beam to its own schedule: the disguise ending
      // holds it until the saucer leaves, the hero ending cuts it the moment
      // the survivor is aboard, well before the explosion.
      const heroEnding = revealing && reveal?.kind === 'hero';
      let beamFade = 1;
      if (heroEnding) {
        beamFade =
          clamp((revealT - HERO.BEAM) / 0.4, 0, 1) * (1 - clamp((revealT - HERO.ABOARD) / 0.4, 0, 1));
      } else if (revealing) {
        beamFade =
          clamp((revealT - REVEAL_BEAM) / 0.5, 0, 1) * (1 - clamp((revealT - REVEAL_DEPART) / 0.6, 0, 1));
      }
      // Dark through the opening prowl; the finale lights its own beam.
      const beamOn =
        beamFade > 0 &&
        ((live && ship.beamOn) || revealing || runnersRef.current.some((r) => r.state === 'abducted'));

      drawLocation(ctx, raceRef.current.location, now);
      drawGust(now);
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
      // Nothing left to draw once it has come apart — only the wreckage.
      if (!(heroEnding && reveal?.boomed)) drawShip(now);

      // Weather is in front of everything in the field, so rain and snow fall
      // between the viewer and the abductees rather than behind them.
      drawWeather(
        ctx,
        raceRef.current.weather,
        now,
        clamp((windRef.current.strength / 220) * windRef.current.dir, -1, 1)
      );
      drawCaption(now);

      if (heroEnding && reveal && reveal.t > HERO.CAPTION) {
        const pulse = 0.72 + 0.28 * Math.sin(now / 320);
        ctx.save();
        ctx.globalAlpha = clamp((reveal.t - HERO.CAPTION) / 0.8, 0, 1) * pulse;
        ctx.font = 'bold 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        // Clear of the minimised winner bar that sits along the bottom edge.
        const text = FINALE_CAPTIONS.hero;
        const y = CANVAS_HEIGHT - 76;
        ctx.strokeText(text, CANVAS_WIDTH / 2, y);
        ctx.fillStyle = '#FFD966';
        ctx.fillText(text, CANVAS_WIDTH / 2, y);
        ctx.restore();
      }

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
        finalsHeadline={FINALE_CAPTIONS[finaleKind]}
        nextLabel="▶ Next Abduction"
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
      />
    </div>
  );
};
