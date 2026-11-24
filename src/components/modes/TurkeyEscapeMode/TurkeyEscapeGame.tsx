import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  CHASE,
  STEP,
  YARD,
  createChase,
  createIdleYard,
  pickCaught,
  stepYard,
  type ChasePhase,
  type YardState,
} from './turkeyEngine';
import {
  drawDust,
  drawFarmer,
  drawFeathers,
  drawNet,
  drawObstacles,
  drawTurkey,
  drawYard,
  type FarmerOptions,
} from './turkeySprites';
import { useTurkeyEscapeSettings, turkeyTimeScale } from './turkeyEscapeSettingsStore';
import * as audio from './turkeyAudio';
import './TurkeyEscapeGame.css';

export interface TurkeyWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** The last turkey free — declared only because nobody else remains. */
  isLastPlayer?: boolean;
  /** The survivor, so first place overall. Set on a catch only when that turkey was the last one free. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (caught: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: TurkeyWinnerDisplay | null;
}

/** What a turkey looks like — parallel to `YardState.birds`, never simulated. */
interface Cosmetic {
  entry: Entry;
  color: string;
  initials: string;
  avatar: HTMLImageElement | null;
}

/** Where the component is in a round, as distinct from the chase's own phase. */
type Stage = 'lobby' | 'chase' | 'done';

interface Effect { kind: 'dust' | 'feathers'; x: number; y: number; at: number; ms: number }

/** The longest slice of real time one frame may feed the simulation, in s. */
const MAX_FRAME_S = 0.1;
/** How long the netted turkey is on show before the winner card covers it. */
const CAUGHT_BEAT_MS = 1500;
const GOBBLE_EVERY_MS = 500;
const NET_DROP_MS = 280;

/** Shortest unique-ish initials, same approach as the other modes. */
function computeInitials(entries: Entry[]): string[] {
  const initialsFor = (name: string, extra = 0) => {
    const words = name.split(' ').filter(Boolean);
    const base = words.map((w) => w[0]?.toUpperCase()).join('');
    if (extra <= 0 || words.length === 0) return base;
    return base + words[0].slice(1, 1 + extra).toLowerCase();
  };
  const result = entries.map((e) => initialsFor(e.name));
  for (let pass = 1; pass <= 2; pass++) {
    const buckets = new Map<string, number[]>();
    result.forEach((v, i) => {
      const list = buckets.get(v) ?? [];
      list.push(i);
      buckets.set(v, list);
    });
    let dupes = false;
    buckets.forEach((idx) => {
      if (idx.length > 1) {
        dupes = true;
        idx.forEach((i) => { result[i] = initialsFor(entries[i].name, pass); });
      }
    });
    if (!dupes) break;
  }
  return result;
}

/** Photos are decoded once per data URL and shared across rounds. */
const imageCache = new Map<string, HTMLImageElement>();
function imageFor(url: string | undefined): HTMLImageElement | null {
  if (!url) return null;
  const hit = imageCache.get(url);
  if (hit) return hit;
  const img = new Image();
  img.src = url;
  imageCache.set(url, img);
  return img;
}

export function TurkeyEscapeGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useTurkeyEscapeSettings();
  useEffect(() => { audio.setTurkeyMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setTurkeyMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const avatarsRef = useRef(settings.useAvatars);
  avatarsRef.current = settings.useAvatars;
  useEffect(() => () => { audio.stopTrack(); }, []);

  const stageRef = useRef<Stage>('lobby');
  const yardRef = useRef<YardState | null>(null);
  const cosmeticsRef = useRef<Cosmetic[]>([]);
  const rosterSigRef = useRef<string | null>(null);
  /** Simulated seconds owed to the yard and not yet stepped. */
  const accRef = useRef(0);
  const lastFrameRef = useRef(0);
  const seenPhaseRef = useRef<ChasePhase>('idle');
  const caughtAtRef = useRef(0);
  const declaredRef = useRef(false);
  const lastGobbleRef = useRef(0);
  const gateRef = useRef(0);
  const effectsRef = useRef<Effect[]>([]);

  /**
   * Put `list` in `yard`, keeping any turkey that is already on screen where
   * it stands. Purely cosmetic continuity between the lobby, a chase and the
   * next chase: it runs after the pick and nothing in the simulation can
   * catch anyone but the chosen turkey, wherever they start.
   */
  const populate = (yard: YardState, list: Entry[]) => {
    const before = yardRef.current;
    const beforeCos = cosmeticsRef.current;
    if (before) {
      list.forEach((entry, i) => {
        const j = beforeCos.findIndex((c) => c.entry.id === entry.id);
        const old = j >= 0 ? before.birds[j] : undefined;
        if (old && yard.birds[i]) yard.birds[i] = { ...old };
      });
    }
    const initials = computeInitials(list);
    const all = propsRef.current.allEntries;
    cosmeticsRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        avatar: imageFor(getPreferredEntryImage(entry)),
      };
    });
    yardRef.current = yard;
  };

  /** A yard with nobody chasing (also used between rounds). */
  const seedLobby = (list: Entry[]) => {
    populate(createIdleYard(list.length), list);
    stageRef.current = 'lobby';
    seenPhaseRef.current = 'idle';
    effectsRef.current = [];
  };

  const startRound = () => {
    const p = propsRef.current;
    audio.resumeTurkeyAudio();
    // Uniform pick first; the chase is then handed the answer and can only
    // ever catch this turkey.
    const chosen = pickCaught(p.entries);
    const chosenIdx = p.entries.findIndex((e) => e.id === chosen.id);
    populate(createChase(p.entries.length, chosenIdx), p.entries);

    stageRef.current = 'chase';
    seenPhaseRef.current = 'release';
    declaredRef.current = false;
    caughtAtRef.current = 0;
    accRef.current = 0;
    effectsRef.current = [];

    audio.playGate();
    audio.startTrack();
  };

  // ---- Start on the racing flag -------------------------------------------
  useEffect(() => {
    if (props.isRacing && props.entries.length >= 1) startRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag drives a round
  }, [props.isRacing]);

  // ---- Loop --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const addEffect = (kind: Effect['kind'], x: number, y: number, now: number, ms: number) => {
      effectsRef.current.push({ kind, x, y, at: now, ms });
    };

    /** Keep the lobby yard in step with the roster whenever nothing is in play. */
    const tendLobby = () => {
      const p = propsRef.current;
      if (p.isRacing) return;

      // The race was called off under a running chase: back to the lobby.
      if (stageRef.current === 'chase' && !declaredRef.current) {
        stageRef.current = 'lobby';
        rosterSigRef.current = null;
        audio.stopTrack();
      }

      // Once everyone has been ranked, the pardoned turkey has the yard to itself.
      const over = p.entries.length === 0 && !!p.currentWinner?.isLastPlayer;
      // After a catch the netted turkey stays on show until its card is dismissed.
      const holding = stageRef.current === 'done' && !!p.currentWinner && !over;
      if (stageRef.current === 'chase' || holding) return;

      // Everyone is ranked but no card is up (it is on its way, or has been
      // dismissed): leave whoever is in the yard where they are.
      if (!over && p.entries.length === 0 && p.allEntries.length > 0 && yardRef.current) {
        stageRef.current = 'lobby';
        return;
      }

      const champion = over ? p.allEntries.filter((e) => e.name === p.currentWinner?.name) : [];
      const list = over ? champion : p.entries;
      const sig = `${over ? 'end' : 'lobby'}:${list.map((e) => e.id).join(',')}`;
      if (sig !== rosterSigRef.current || stageRef.current === 'done') {
        rosterSigRef.current = sig;
        seedLobby(list);
      }
    };

    /** Feed real time to the yard in whole steps, and react to what happened. */
    const simulate = (now: number) => {
      const yard = yardRef.current;
      const frame = lastFrameRef.current === 0 ? 0 : (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      if (!yard) return;

      // Capped, so a tab left in the background comes back to one short burst
      // rather than a fast-forward through everything it missed.
      accRef.current += Math.min(MAX_FRAME_S, Math.max(0, frame)) * turkeyTimeScale(speedRef.current);
      while (accRef.current >= STEP) {
        stepYard(yard);
        accRef.current -= STEP;
      }

      // The gate opens only to let the farmer in, then shuts behind him so no
      // turkey can slip out during the chase.
      const gateTarget = stageRef.current === 'chase' && yard.phase === 'release' ? 1 : 0;
      gateRef.current += (gateTarget - gateRef.current) * Math.min(1, frame * 7);

      if (stageRef.current !== 'chase') return;
      const f = yard.farmer;

      // Sound and effects hang off phase changes seen between frames.
      if (yard.phase !== seenPhaseRef.current) {
        if (seenPhaseRef.current === 'release') audio.playGateShut();
        seenPhaseRef.current = yard.phase;
        if (yard.phase === 'lunge') {
          audio.playWhoosh();
          const dodger = yard.birds[yard.targetIdx];
          if (dodger) addEffect('feathers', dodger.x, dodger.y, now, 700);
        } else if (yard.phase === 'stumble') {
          audio.playThud();
          addEffect('dust', f.x, f.y, now, 650);
        } else if (yard.phase === 'caught') {
          audio.playCatch();
          caughtAtRef.current = now;
          const netted = yard.birds[yard.caughtIdx];
          if (netted) addEffect('feathers', netted.x, netted.y, now, 900);
        }
      }

      if (yard.phase !== 'caught' && yard.phase !== 'release'
        && now - lastGobbleRef.current >= GOBBLE_EVERY_MS
        && yard.birds.some((b) => Math.hypot(b.x - f.x, b.y - f.y) <= CHASE.FLEE_RADIUS)) {
        lastGobbleRef.current = now;
        audio.playGobble();
      }

      // Declared at the *end* of the caught beat, not the start of it: the
      // winner card covers the canvas, so announcing on the catch would hide
      // the net coming down.
      if (yard.phase === 'caught' && !declaredRef.current
        && now - caughtAtRef.current >= CAUGHT_BEAT_MS) {
        declaredRef.current = true;
        stageRef.current = 'done';
        const caught = cosmeticsRef.current[yard.caughtIdx];
        if (caught) propsRef.current.onWinner(caught.entry);
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const draw = (now: number) => {
      // Match the backing store to the displayed size in device pixels, so
      // the yard is sharp on a high-DPI screen.
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(YARD.CANVAS_W, Math.round(canvas.clientWidth * dpr));
      const h = Math.round(w * (YARD.CANVAS_H / YARD.CANVAS_W));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const scale = canvas.width / YARD.CANVAS_W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      drawYard(ctx, now, gateRef.current);
      drawObstacles(ctx);

      const yard = yardRef.current;
      const cosmetics = cosmeticsRef.current;
      const phase: ChasePhase = yard ? yard.phase : 'idle';

      if (yard) {
        const f = yard.farmer;
        const hunting = phase === 'chase' || phase === 'lunge' || phase === 'commit';
        const pose: FarmerOptions['pose'] =
          phase === 'lunge' ? 'dive' : phase === 'stumble' ? 'down' : phase === 'caught' ? 'cheer' : 'run';

        // Turkeys and farmer together, back of the yard first. -1 is the farmer.
        const order = yard.birds.map((_, i) => i);
        order.push(-1);
        const yOf = (i: number) => (i < 0 ? f.y : yard.birds[i].y);
        order.sort((a, b) => yOf(a) - yOf(b));

        for (const i of order) {
          if (i < 0) {
            drawFarmer(ctx, f.x, f.y, {
              heading: f.heading,
              speed: phase === 'idle' || phase === 'caught' ? 0 : Math.hypot(f.vx, f.vy),
              pose,
              now,
            });
            continue;
          }
          const b = yard.birds[i];
          const c = cosmetics[i];
          if (!c) continue;
          const caught = i === yard.caughtIdx;
          const speed = Math.hypot(b.vx, b.vy);
          const d = Math.hypot(b.x - f.x, b.y - f.y);
          const panic = phase === 'idle' ? 0
            : hunting && i === yard.targetIdx ? 1
              : Math.max(0, 1 - d / CHASE.FLEE_RADIUS);
          drawTurkey(ctx, b.x, b.y, {
            color: c.color,
            initials: c.initials,
            avatar: avatarsRef.current ? c.avatar : null,
            // Face the way it is actually going; the wander heading twitches.
            heading: speed > 8 ? Math.atan2(b.vy, b.vx) : b.heading,
            speed: caught ? 0 : speed,
            panic,
            caught,
            now,
          });
        }

        // The caught turkey sits under the net.
        const netted = yard.caughtIdx >= 0 ? yard.birds[yard.caughtIdx] : undefined;
        if (netted) drawNet(ctx, netted.x, netted.y, (now - caughtAtRef.current) / NET_DROP_MS);
      }

      // Dust and feathers
      effectsRef.current = effectsRef.current.filter((e) => now - e.at < e.ms);
      for (const e of effectsRef.current) {
        const t = (now - e.at) / e.ms;
        if (e.kind === 'dust') drawDust(ctx, e.x, e.y, t);
        else drawFeathers(ctx, e.x, e.y, t);
      }

      // Caption, on the strip of grass outside the fence beside the track
      const caption =
        phase === 'idle'
          ? (cosmetics.length === 0 ? 'THE YARD IS EMPTY'
            : propsRef.current.entries.length === 0 ? 'PARDONED!' : 'OPEN THE GATE')
          : phase === 'release' ? 'HERE COMES THE FARMER!'
            : phase === 'chase' || phase === 'lunge' ? 'RUN!'
              : phase === 'stumble' ? 'MISSED!'
                : phase === 'commit' ? 'HE’S GAINING…'
                  : 'GOTCHA!';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(30,20,8,0.75)';
      ctx.fillStyle = '#ffe2aa';
      const cx = (YARD.L + YARD.GATE_X - 52) / 2;
      ctx.strokeText(caption, cx, YARD.CANVAS_H - 17);
      ctx.fillText(caption, cx, YARD.CANVAS_H - 17);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      tendLobby();
      simulate(now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistent canvas loop; reads latest props/settings via refs
  }, []);

  const cw = props.currentWinner;

  return (
    <div className="turkey-escape-game">
      <div className="turkey-escape-canvas-host">
        <canvas
          ref={canvasRef}
          width={YARD.CANVAS_W}
          height={YARD.CANVAS_H}
          className="game-canvas"
        />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={props.entries.length === 0}
        // Explicitly false, not undefined: WinnerDialog falls back to
        // `isFinals` for gold, and being caught is the opposite of a win here.
        // Only the last turkey free earns the champion treatment.
        goldTreatment={cw?.isChampion ?? false}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={cw?.isChampion ? '🏆 PARDONED 🏆' : '🍗 CAUGHT!'}
        finalsHeadline={cw?.isLastPlayer ? '🏆 PARDONED — LAST TURKEY FREE 🏆' : '🍗 CAUGHT!'}
        nextLabel="🦃 Next Chase"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
