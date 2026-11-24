import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  PIE,
  PIE_T,
  isStalled,
  layoutSeats,
  pickChampion,
  planContest,
  progressAt,
  type EaterPlan,
  type SeatSpot,
} from './pieEngine';
import {
  drawCountdown,
  drawCrumbs,
  drawEater,
  drawHall,
  drawPie,
  drawTable,
} from './pieSprites';
import { usePieEatingSettings, pieSpeedFactor } from './pieEatingSettingsStore';
import * as audio from './pieAudio';
import './PieEatingGame.css';

export interface PieWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** The last one left at the table — picked only because nobody else remains. */
  isLastPlayer?: boolean;
  /** The very first clean plate, so first place overall. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (champion: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: PieWinnerDisplay | null;
}

type Phase = 'ready' | 'countdown' | 'contest' | 'cheer' | 'done';

interface Eater {
  entry: Entry;
  color: string;
  initials: string;
  seat: SeatSpot;
  /** Written at the start of a round; null while the table is just a lobby. */
  plan: EaterPlan | null;
  /** Each eater chews to their own rhythm. Cosmetic only. */
  chewOffset: number;
  chewMs: number;
  wasStalled: boolean;
  finished: boolean;
  avatar: HTMLImageElement | null;
}

const COUNT_LABELS = ['3', '2', '1', 'EAT!'] as const;
/** Minimum gap between munch sounds. */
const MUNCH_EVERY_MS = 140;
/** A frame longer than this (tab was hidden) advances the contest by only this much. */
const MAX_FRAME_MS = 250;

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

export function PieEatingGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = usePieEatingSettings();
  useEffect(() => { audio.setPieMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setPieMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const avatarsRef = useRef(settings.useAvatars);
  avatarsRef.current = settings.useAvatars;
  useEffect(() => () => { audio.stopTrack(); }, []);

  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const phaseUntilRef = useRef(0);
  const eatersRef = useRef<Eater[]>([]);
  const rosterSigRef = useRef('');
  const chosenRef = useRef(-1);
  const declaredRef = useRef(false);

  /** Which countdown label is showing, so each change beeps once. */
  const countRef = useRef(0);
  /**
   * Normalized contest time, 0..1. Stored rather than derived from the clock so
   * a pacing change mid-contest carries on from the same point in every curve.
   */
  const contestTRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastMunchRef = useRef(0);
  const finishedAtRef = useRef(0);

  const dur = (ms: number) => ms * pieSpeedFactor(speedRef.current);

  const setPhase = (next: Phase, now: number, ms: number) => {
    phaseRef.current = next;
    phaseStartRef.current = now;
    phaseUntilRef.current = now + ms;
  };

  /** Seat everyone at the tables (also used between rounds). */
  const seedEaters = (list: Entry[]) => {
    const initials = computeInitials(list);
    const seats = layoutSeats(list.length);
    const all = propsRef.current.allEntries;
    eatersRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        seat: seats[i],
        plan: null,
        chewOffset: Math.random(),
        chewMs: 250 + Math.random() * 130,
        wasStalled: false,
        finished: false,
        avatar: avatarsRef.current ? imageFor(getPreferredEntryImage(entry)) : null,
      };
    });
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumePieAudio();
    seedEaters(p.entries);
    // Uniform pick first; every curve is then written to produce it.
    const chosen = pickChampion(p.entries);
    chosenRef.current = eatersRef.current.findIndex((e) => e.entry.id === chosen.id);
    const plans = planContest(eatersRef.current.length, chosenRef.current);
    eatersRef.current.forEach((eater, i) => { eater.plan = plans[i] ?? null; });
    declaredRef.current = false;
    countRef.current = 0;
    contestTRef.current = 0;

    audio.playCountBeep(false);
    audio.startTrack();
    setPhase('countdown', now, dur(PIE_T.countdown));
  };

  // ---- Start / stop on the racing flag -----------------------------------
  useEffect(() => {
    if (props.isRacing && props.entries.length >= 1) {
      startRound(performance.now());
    } else if (!props.isRacing && (phaseRef.current === 'countdown' || phaseRef.current === 'contest' || phaseRef.current === 'cheer')) {
      // The round was called off without a remount (a group was loaded or the
      // list cleared mid-contest). Drop it here, or it would run on and declare
      // a winner drawn from a roster that no longer exists.
      declaredRef.current = true;
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

    const chosenEater = () => eatersRef.current[chosenRef.current];

    /** 0..1 through the current timed phase. */
    const phaseT = (now: number) => {
      const span = phaseUntilRef.current - phaseStartRef.current;
      return span <= 0 ? 1 : Math.max(0, Math.min(1, (now - phaseStartRef.current) / span));
    };

    const advance = (now: number, dt: number) => {
      switch (phaseRef.current) {
        case 'ready':
        case 'done':
          break;
        case 'countdown': {
          const label = Math.min(COUNT_LABELS.length - 1, Math.floor(phaseT(now) * COUNT_LABELS.length));
          if (label !== countRef.current) {
            countRef.current = label;
            audio.playCountBeep(label === COUNT_LABELS.length - 1);
          }
          if (now >= phaseUntilRef.current) {
            contestTRef.current = 0;
            lastMunchRef.current = 0;
            setPhase('contest', now, 0);
          }
          break;
        }
        case 'contest': {
          // The speed is read fresh every frame, and only ever scales the step.
          const t = Math.min(1, contestTRef.current + dt / dur(PIE_T.contest));
          contestTRef.current = t;

          let sick = false;
          for (const eater of eatersRef.current) {
            const stalled = !!eater.plan && isStalled(eater.plan, t);
            if (stalled && !eater.wasStalled) sick = true;
            eater.wasStalled = stalled;
          }
          if (sick) audio.playQueasy();
          if (now - lastMunchRef.current >= MUNCH_EVERY_MS) {
            lastMunchRef.current = now;
            audio.playMunch();
          }

          if (t >= 1) {
            const champ = chosenEater();
            if (champ) champ.finished = true;
            for (const eater of eatersRef.current) eater.wasStalled = false;
            finishedAtRef.current = now;
            audio.playBell();
            audio.playCheer();
            setPhase('cheer', now, dur(PIE_T.cheer));
          }
          break;
        }
        case 'cheer': {
          if (now >= phaseUntilRef.current) {
            setPhase('done', now, dur(PIE_T.done));
            // Declared at the *end* of the cheer, not at the bell: the winner
            // card covers the canvas, so announcing straight away would hide
            // the clean plate and the celebration it causes.
            if (!declaredRef.current) {
              declaredRef.current = true;
              const champ = chosenEater();
              if (champ) propsRef.current.onWinner(champ.entry);
            }
          }
          break;
        }
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const draw = (now: number) => {
      const phase = phaseRef.current;
      drawHall(ctx, now);

      const eaters = eatersRef.current;
      const eating = phase === 'contest';
      const t = phase === 'ready' || phase === 'countdown' ? 0 : contestTRef.current;

      if (eaters.length === 0) {
        // Nobody to seat, but the table is still laid.
        drawTable(ctx, PIE.FRONT_Y, 1);
      }

      // Back rows first. Within a row: eaters, then the table that hides their
      // laps, then the pies on top of it.
      const rows = [...new Set(eaters.map((e) => e.seat.row))].sort((a, b) => a - b);
      for (const row of rows) {
        const seated = eaters.filter((e) => e.seat.row === row);
        const progress = seated.map((e) => (e.plan ? progressAt(e.plan, t) : 0));
        const stalled = seated.map((e) => eating && !!e.plan && isStalled(e.plan, t));

        seated.forEach((eater, i) => {
          const chewing = eating && !stalled[i];
          drawEater(ctx, eater.seat.x, eater.seat.y, eater.seat.scale, {
            color: eater.color,
            initials: eater.initials,
            avatar: eater.avatar,
            progress: progress[i],
            chomp: chewing ? (now / eater.chewMs + eater.chewOffset) % 1 : 0,
            stalled: stalled[i],
            now,
            finished: eater.finished,
            sinceFinish: eater.finished ? now - finishedAtRef.current : 0,
          });
        });

        drawTable(ctx, seated[0].seat.y, seated[0].seat.scale);

        seated.forEach((eater, i) => {
          const { x, y, scale } = eater.seat;
          drawPie(ctx, x, y, scale, 1 - progress[i]);
          if (eating && !stalled[i]) {
            drawCrumbs(ctx, x, y, (now / (eater.chewMs * 2) + eater.chewOffset) % 1);
          }
        });
      }

      if (phase === 'countdown') {
        const through = phaseT(now) * COUNT_LABELS.length;
        const label = Math.min(COUNT_LABELS.length - 1, Math.floor(through));
        drawCountdown(ctx, COUNT_LABELS[label], through - label);
      }

      // Caption along the bottom edge
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 14px system-ui, sans-serif';
      // With everyone ranked there is no bell left to ring.
      const sessionOver = propsRef.current.entries.length === 0 && !!propsRef.current.currentWinner;
      const caption =
        phase === 'ready' ? (sessionOver ? 'THE PIES ARE GONE!' : eaters.length ? 'RING THE DINNER BELL' : 'THE TABLE IS EMPTY')
          : phase === 'countdown' ? 'FORKS DOWN, FACES IN'
            : phase === 'contest' ? 'WHO CLEARS THE PLATE…?'
              : 'CLEAN PLATE!';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(43,18,10,0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(caption, PIE.CANVAS_W / 2, PIE.CANVAS_H - 8);
      ctx.fillStyle = '#FFD9A0';
      ctx.fillText(caption, PIE.CANVAS_W / 2, PIE.CANVAS_H - 8);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      const p = propsRef.current;

      // Keep the backing store at the displayed size in device pixels, and
      // draw everything in PIE's logical 720x560 coordinates.
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(PIE.CANVAS_W, Math.round(canvas.clientWidth * dpr));
      const h = Math.round(w * (PIE.CANVAS_H / PIE.CANVAS_W));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const scale = canvas.width / PIE.CANVAS_W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      // Reseat the table whenever nothing is in play: before the first round,
      // and again once the session is over.
      // Once a finished round's card has been dismissed the scene is no
      // longer on show, so hand it back to the lobby. Without this a group
      // loaded after a round would leave the old round frozen on screen.
      if (!p.isRacing && !p.currentWinner && phaseRef.current === 'done') {
        phaseRef.current = 'ready';
        rosterSigRef.current = '';
      }
      const over = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || phaseRef.current === 'done' || over)) {
        const list = over ? p.allEntries : p.entries;
        const sig = `${over ? 'end' : 'lobby'}:${avatarsRef.current}:${list.map((e) => e.id).join(',')}`;
        if (sig !== rosterSigRef.current && phaseRef.current !== 'done') {
          rosterSigRef.current = sig;
          seedEaters(list);
        }
      }

      const dt = lastFrameRef.current ? Math.min(MAX_FRAME_MS, now - lastFrameRef.current) : 0;
      lastFrameRef.current = now;

      advance(now, dt);
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
  }, []);

  const cw = props.currentWinner;

  return (
    <div className="pie-eating-game">
      <div className="pie-eating-canvas-host">
        <canvas
          ref={canvasRef}
          width={PIE.CANVAS_W}
          height={PIE.CANVAS_H}
          className="game-canvas"
        />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={props.entries.length === 0}
        // Explicit, not undefined: WinnerDialog falls back to `isFinals` for
        // gold, which would crown the last one left instead of the first picked.
        goldTreatment={cw?.isChampion ?? false}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={cw?.isChampion ? '🏆 PIE CHAMPION 🏆' : '🥧 CLEAN PLATE!'}
        finalsHeadline={cw?.isLastPlayer ? '🍂 LAST ONE AT THE TABLE' : '🏆 PIE CHAMPION 🏆'}
        nextLabel="🥧 Next Pie"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
