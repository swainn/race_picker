import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  MAZE,
  cellCenter,
  generateMaze,
  layoutFor,
  pickFirstOut,
  pickStarts,
  type Maze,
} from './mazeEngine';
import { planRace, poseAt, type RacePlan, type RunnerPose } from './mazeRace';
import { drawExitBurst, drawField, drawRunner, drawWalls, runnerSize } from './mazeSprites';
import { mazeTimeScale, useCornMazeSettings } from './cornMazeSettingsStore';
import * as audio from './mazeAudio';
import './CornMazeGame.css';

export interface MazeWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** The last one left in the corn — out only because nobody else remains. */
  isLastPlayer?: boolean;
  /** First out of the very first maze, so first place overall. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (firstOut: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: MazeWinnerDisplay | null;
}

type Phase = 'ready' | 'reveal' | 'race' | 'out' | 'done';

/** Real-time beats either side of the race itself, in ms. */
const REVEAL_MS = 700;
const OUT_MS = 1400;
/** How far the winner walks out of the exit into the pumpkin patch. */
const OUT_SLIDE = 40;
const RUSTLE_EVERY_MS = 220;
const PUZZLED_EVERY_MS = 600;

interface Runner {
  entry: Entry;
  color: string;
  initials: string;
  avatar: HTMLImageElement | null;
  /** Where they stand before the race, and where their route begins. */
  start: number;
  /** Eased nudge that keeps tokens sharing a cell from hiding each other. */
  ox: number;
  oy: number;
  wasMoving: boolean;
}

/** The wall painting for one maze at one device scale. */
interface WallLayer {
  canvas: HTMLCanvasElement;
  maze: Maze;
  scale: number;
}

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

function easeOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) * (1 - c);
}

export function CornMazeGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useCornMazeSettings();
  useEffect(() => { audio.setMazeMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setMazeMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const avatarsRef = useRef(settings.useAvatars);
  avatarsRef.current = settings.useAvatars;
  useEffect(() => () => { audio.stopTrack(); }, []);

  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const mazeRef = useRef<Maze | null>(null);
  const wallRef = useRef<WallLayer | null>(null);
  const planRef = useRef<RacePlan | null>(null);
  const runnersRef = useRef<Runner[]>([]);
  const rosterSigRef = useRef('');
  const chosenRef = useRef(-1);
  const declaredRef = useRef(false);
  /** Race time in plan seconds, and the frame it was last advanced on. */
  const tRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastRustleRef = useRef(0);
  const lastPuzzledRef = useRef(0);

  /** Stand everyone on their start cells (also used in the lobby). */
  const seedRunners = (list: Entry[], starts: number[]) => {
    const initials = computeInitials(list);
    const all = propsRef.current.allEntries;
    runnersRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        avatar: avatarsRef.current ? imageFor(getPreferredEntryImage(entry)) : null,
        start: starts[i],
        ox: 0,
        oy: 0,
        wasMoving: false,
      };
    });
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumeMazeAudio();
    // Uniform pick first. The maze, the start cells and every route are
    // generated afterwards and written around whoever this returned.
    const chosen = pickFirstOut(p.entries);
    const chosenIdx = p.entries.findIndex((e) => e.id === chosen.id);

    // Sized to the field: fewer runners left, smaller and simpler maze.
    const maze = generateMaze(layoutFor(p.entries.length));
    const starts = pickStarts(maze, p.entries.length);
    mazeRef.current = maze;
    planRef.current = planRace(maze, starts, chosenIdx);
    seedRunners(p.entries, starts);
    chosenRef.current = chosenIdx;
    declaredRef.current = false;
    tRef.current = 0;
    lastRustleRef.current = 0;
    lastPuzzledRef.current = 0;

    audio.playStart();
    audio.startTrack();
    phaseRef.current = 'reveal';
    phaseStartRef.current = now;
  };

  // ---- Start / stop on the racing flag -----------------------------------
  useEffect(() => {
    if (props.isRacing && props.entries.length >= 1) {
      startRound(performance.now());
    } else if (!props.isRacing && (phaseRef.current === 'reveal' || phaseRef.current === 'race' || phaseRef.current === 'out')) {
      // The round was called off without a remount (a group was loaded or the
      // list cleared mid-race). Drop it here, or it would run on and declare a
      // winner drawn from a roster that no longer exists.
      declaredRef.current = true;
      planRef.current = null;
      phaseRef.current = 'ready';
      rosterSigRef.current = '';
      audio.stopTrack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag drives a round
  }, [props.isRacing]);

  // ---- Loop --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const setPhase = (next: Phase, now: number) => {
      phaseRef.current = next;
      phaseStartRef.current = now;
    };

    /** The corn is painted once per maze and per device scale, then blitted. */
    const wallLayer = (maze: Maze, scale: number): HTMLCanvasElement | null => {
      const have = wallRef.current;
      if (have && have.maze === maze && have.scale === scale) return have.canvas;
      const layer = have?.canvas ?? document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lctx = layer.getContext('2d');
      if (!lctx) return null;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawWalls(lctx, maze);
      wallRef.current = { canvas: layer, maze, scale };
      return layer;
    };

    const advance = (now: number) => {
      const phase = phaseRef.current;
      const plan = planRef.current;
      const sincePhase = now - phaseStartRef.current;

      if (phase === 'reveal') {
        if (sincePhase >= REVEAL_MS) setPhase('race', now);
        return;
      }

      if (phase === 'race') {
        const layout = mazeRef.current?.layout;
        if (!plan || !layout) return;
        // Clamped per frame, so a tab left in the background resumes where it
        // stopped instead of skipping straight past the finish.
        const dt = Math.min(0.1, Math.max(0, (now - lastFrameRef.current) / 1000));
        tRef.current += dt * mazeTimeScale(speedRef.current);

        if (tRef.current >= plan.winnerTime) {
          // Held here from now on, so everyone else stops where they are.
          tRef.current = plan.winnerTime;
          audio.playHorn();
          audio.playCheer();
          setPhase('out', now);
          return;
        }

        let anyMoving = false;
        let newlyPuzzled = false;
        runnersRef.current.forEach((runner, i) => {
          const pose = poseAt(layout, plan.runners[i], plan.stepTime, tRef.current);
          if (pose.moving) anyMoving = true;
          else if (runner.wasMoving) newlyPuzzled = true;
          runner.wasMoving = pose.moving;
        });
        if (anyMoving && now - lastRustleRef.current >= RUSTLE_EVERY_MS) {
          lastRustleRef.current = now;
          audio.playRustle();
        }
        if (newlyPuzzled && now - lastPuzzledRef.current >= PUZZLED_EVERY_MS) {
          lastPuzzledRef.current = now;
          audio.playPuzzled();
        }
        return;
      }

      if (phase === 'out' && sincePhase >= OUT_MS) {
        setPhase('done', now);
        // Declared at the *end* of the walk out, not the start of it: the
        // winner card covers the canvas, so announcing at the exit would hide
        // the moment it is announcing.
        if (!declaredRef.current) {
          declaredRef.current = true;
          const runner = runnersRef.current[chosenRef.current];
          if (runner) propsRef.current.onWinner(runner.entry);
        }
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const draw = (now: number, scale: number) => {
      const phase = phaseRef.current;
      const maze = mazeRef.current;
      const plan = planRef.current;
      const runners = runnersRef.current;
      const chosen = chosenRef.current;
      const sincePhase = now - phaseStartRef.current;
      const racing = phase === 'race';
      const finished = phase === 'out' || phase === 'done';

      if (!maze) return;
      const layout = maze.layout;
      const size = runnerSize(layout);

      drawField(ctx, layout, now);
      {
        const layer = wallLayer(maze, scale);
        // Blitted in device pixels, one for one. Going through the frame
        // transform would resample it by a fraction of a pixel and blur the corn.
        if (layer) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(layer, 0, 0);
          ctx.restore();
        }
      }

      // Where everyone is this frame.
      const poses: RunnerPose[] = runners.map((runner, i) => {
        const route = plan?.runners[i];
        if (!route || phase === 'ready' || phase === 'reveal') {
          const c = cellCenter(layout, runner.start);
          return { x: c.x, y: c.y, heading: Math.PI / 2, moving: false, done: false };
        }
        return poseAt(layout, route, plan.stepTime, tRef.current);
      });

      // Runners sharing a cell fan out a little so no token hides another.
      const crowd = new Map<number, number>();
      const cellOf = poses.map((p) => {
        const col = Math.floor((p.x - layout.originX) / layout.cell);
        const row = Math.floor((p.y - MAZE.ORIGIN_Y) / layout.cell);
        const cell = row * layout.cols + col;
        crowd.set(cell, (crowd.get(cell) ?? 0) + 1);
        return cell;
      });
      runners.forEach((runner, i) => {
        const shared = (crowd.get(cellOf[i]) ?? 0) > 1;
        const tx = shared ? ((i % 3) - 1) * 6 * size : 0;
        const ty = shared ? ((i % 2) * 2 - 1) * 4 * size : 0;
        // Eased, so a token does not jump as others step in and out of its cell.
        runner.ox += (tx - runner.ox) * 0.2;
        runner.oy += (ty - runner.oy) * 0.2;
      });

      const outT = phase === 'out' ? Math.min(1, sincePhase / OUT_MS) : phase === 'done' ? 1 : 0;

      ctx.save();
      if (phase === 'reveal') ctx.globalAlpha = Math.min(1, sincePhase / REVEAL_MS);
      const order = runners.map((_, i) => i).sort((a, b) => poses[a].y - poses[b].y);
      for (const i of order) {
        const runner = runners[i];
        const pose = poses[i];
        const isWinner = finished && i === chosen;
        let x = pose.x + runner.ox;
        let y = pose.y + runner.oy;
        if (isWinner) {
          // Out through the gap and down into the pumpkin patch.
          x = pose.x;
          y = pose.y + OUT_SLIDE * easeOut(outT * 1.6);
        }
        drawRunner(ctx, x, y, {
          color: runner.color,
          initials: runner.initials,
          avatar: runner.avatar,
          heading: isWinner ? Math.PI / 2 : pose.heading,
          moving: (racing && pose.moving) || (isWinner && phase === 'out' && outT < 0.6),
          puzzled: racing && !pose.moving && tRef.current > 0,
          winner: isWinner,
          now,
          size,
        });
      }
      ctx.restore();

      if (phase === 'out') drawExitBurst(ctx, layout, outT);

      // Caption in the bottom strip, left of the way out
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,236,170,0.95)';
      // With everyone ranked there is no maze left to enter.
      const sessionOver = propsRef.current.entries.length === 0 && !!propsRef.current.currentWinner;
      const caption =
        phase === 'ready' ? (sessionOver ? 'EVERYONE IS OUT!' : runners.length ? 'ENTER THE MAZE' : 'THE MAZE IS EMPTY')
          : phase === 'reveal' ? 'A NEW MAZE!'
            : phase === 'race' ? 'WHO FINDS THE WAY OUT…?'
              : 'OUT!';
      ctx.fillText(caption, 140, MAZE.CANVAS_H - 15);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      const p = propsRef.current;

      // Backing store in device pixels, so walls and tokens stay sharp on
      // high-DPI displays and after the window is resized.
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(MAZE.CANVAS_W, Math.round(canvas.clientWidth * dpr));
      const h = Math.round(w * (MAZE.CANVAS_H / MAZE.CANVAS_W));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const scale = canvas.width / MAZE.CANVAS_W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // One maze for the lobby, generated on the first frame after mount.
      if (!mazeRef.current) mazeRef.current = generateMaze(layoutFor(p.entries.length));

      // Place the roster in the maze whenever nothing is in play: before the
      // first round, and again once the session is over.
      // Once a finished round's card has been dismissed the scene is no
      // longer on show, so hand it back to the lobby. Without this a group
      // loaded after a round would leave the old round frozen on screen.
      if (!p.isRacing && !p.currentWinner && phaseRef.current === 'done') {
        phaseRef.current = 'ready';
        rosterSigRef.current = '';
        planRef.current = null;
      }
      const over = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || phaseRef.current === 'done' || over)) {
        const list = over ? p.allEntries : p.entries;
        const sig = `${over ? 'end' : 'lobby'}:${avatarsRef.current}:${list.map((e) => e.id).join(',')}`;
        if (sig !== rosterSigRef.current && phaseRef.current !== 'done') {
          rosterSigRef.current = sig;
          // The lobby shows the size of maze the next round will be run in.
          const want = layoutFor(list.length);
          if (mazeRef.current.layout !== want) mazeRef.current = generateMaze(want);
          seedRunners(list, pickStarts(mazeRef.current, list.length));
        }
      }

      advance(now);
      draw(now, scale);
      lastFrameRef.current = now;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
  }, []);

  const cw = props.currentWinner;

  return (
    <div className="corn-maze-game">
      <div className="corn-maze-canvas-host">
        <canvas
          ref={canvasRef}
          width={MAZE.CANVAS_W}
          height={MAZE.CANVAS_H}
          className="game-canvas"
        />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={props.entries.length === 0}
        // Explicit, not undefined: WinnerDialog falls back to `isFinals` for
        // gold, which would crown the last one left instead of the first out.
        goldTreatment={cw?.isChampion ?? false}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={cw?.isChampion ? '🏆 FIRST OUT OF THE MAZE 🏆' : '🌽 FOUND THE WAY OUT'}
        finalsHeadline={cw?.isLastPlayer ? '🌾 LAST ONE IN THE CORN' : '🏆 FIRST OUT OF THE MAZE 🏆'}
        nextLabel="🌽 Next Maze"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
