import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  AB,
  aimAtPig,
  aimForRank,
  easeInOut,
  TOWER_STYLES,
  layoutTower,
  type TowerStyle,
  pickVictim,
  rankShots,
  solveLaunch,
  volleysForRound,
  type LaunchSolution,
  type ShotScore,
  type TowerLayout,
} from './angryBirdsEngine';
import { createWorld, type AngryBirdsWorld } from './angryBirdsPhysics';
import { drawBird, drawBlock, drawPig, drawPuff, drawSlingshot } from './angryBirdsSprites';
import {
  angryBirdsSpeedFactor,
  useAngryBirdsSettings,
  type AngryBirdsSubMode,
} from './angryBirdsSettingsStore';
import { createShuffleBag } from '../../../utils/shuffleBag';
import * as audio from './angryBirdsAudio';
import './AngryBirdsGame.css';

export interface AngryBirdsWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** Sub-mode `pigs`: never hit — the pig still perched when everyone else is gone. */
  isLastPlayer?: boolean;
  /** Sub-mode `birds`: the very first pick, so first place overall. */
  isChampion?: boolean;
  /** Sub-mode `birds`: the winning score off the round's board. */
  score?: number;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (picked: Entry, score?: number) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: AngryBirdsWinnerDisplay | null;
  /** Bumped by the wrapper to throw the round away and start it over. */
  rerunKey: number;
}

type Phase = 'ready' | 'aim' | 'fly' | 'settle' | 'score' | 'done';

/** Phase lengths in ms, before the speed multiplier. */
const T = {
  aim: 760,
  /** Hard cap on a flight, in case the bird sails off into nothing. */
  flyMax: 3200,
  /** The collapse gets at least this long to read, and at most that long. */
  settleMin: 700,
  settleMax: 2600,
  /** Sub-mode `birds`: between one bird's shot and the next. */
  shotGap: 420,
  /** Sub-mode `birds`: how long the scoreboard holds before the pick. */
  score: 2800,
  done: 900,
} as const;

/** Sub-mode `birds`: the tower of generic, non-participant pigs to shoot at. */
const GENERIC_PIGS = 6;

/** A contact softer than this is a graze, not a hit. */
/**
 * The structure's shape, dealt so the whole set cycles before repeating. Set
 * dressing only — the victim is drawn before any of this is built, so the shape
 * cannot change who gets popped.
 */
const nextTowerStyle = createShuffleBag(TOWER_STYLES);

/** Physics steps run before a round is shown, so the tower starts at rest. */
const PRESETTLE_STEPS = 90;

const HIT_IMPULSE = 1.6;
/** Sub-mode `birds`: how hard a generic pig has to be hit to pop (cosmetic only). */
const GENERIC_POP_IMPULSE = 4.2;

interface Seat {
  entry: Entry;
  color: string;
  initials: string;
}

interface Shooter {
  entry: Entry;
  color: string;
  initials: string;
  rank: number;
  score: number;
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

export function AngryBirdsGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useAngryBirdsSettings();
  useEffect(() => { audio.setAngryBirdsMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setAngryBirdsMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const subModeRef = useRef<AngryBirdsSubMode>(settings.subMode);
  subModeRef.current = settings.subMode;

  // ---- Round state (all mutable, all in refs — never React state) ---------
  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const phaseUntilRef = useRef(0);
  const worldRef = useRef<AngryBirdsWorld | null>(null);
  const layoutRef = useRef<TowerLayout>({ blocks: [], pigs: [] });
  /** Sub-mode `pigs`: pig id -> the participant perched there. */
  const seatsRef = useRef<Map<number, Seat>>(new Map());
  /** Sub-mode `pigs`: the pre-picked pig. -1 outside a round. */
  const chosenPigRef = useRef<number>(-1);
  /** The structure shape in play, kept so the lobby can preview it too. */
  const styleRef = useRef<TowerStyle>('tiers');
  /**
   * Decoded participant photos, keyed by entry id. The rAF loop draws them, so
   * they live in a ref; the sprite falls back to a drawn pig until `complete`
   * flips, and for anyone with no picture at all.
   */
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const faceRef = useRef(settings.face);
  faceRef.current = settings.face;

  /** The photo to wear, or null when this mode or participant has none. */
  const avatarFor = (entry: Entry | undefined): HTMLImageElement | null => {
    if (!entry || faceRef.current !== 'avatar') return null;
    const cached = imgCacheRef.current.get(entry.id);
    if (cached) return cached;
    const url = getPreferredEntryImage(entry);
    if (!url) return null;
    const im = new Image();
    im.src = url;
    imgCacheRef.current.set(entry.id, im);
    return im;
  };
  /** Volleys this round, and which one is in the air (0-based). */
  const volleysRef = useRef(1);
  const volleyRef = useRef(0);
  /** Only the last volley may take the pick. */
  const finalVolley = () => volleyRef.current >= volleysRef.current - 1;
  const solutionRef = useRef<LaunchSolution>({ vx: 0, vy: 0, flightSteps: 0 });
  const launchedAtRef = useRef(0);
  const poppedAtRef = useRef(0);
  const poppedPosRef = useRef<{ x: number; y: number } | null>(null);
  const declaredRef = useRef(false);
  /** Sub-mode `birds`: the round's board, winner first. */
  const boardRef = useRef<ShotScore[]>([]);
  const shootersRef = useRef<Shooter[]>([]);
  const shotIndexRef = useRef(0);
  const captionRef = useRef('');

  const dur = (ms: number) => ms * angryBirdsSpeedFactor(speedRef.current);

  const setPhase = (next: Phase, now: number, ms: number) => {
    phaseRef.current = next;
    phaseStartRef.current = now;
    phaseUntilRef.current = now + ms;
  };

  const teardownWorld = () => {
    worldRef.current?.destroy();
    worldRef.current = null;
  };

  /** Stand a fresh tower up and wire the mode's hit rule to it. */
  const buildWorld = (pigCount: number, onHit: (pigId: number, impulse: number) => void) => {
    teardownWorld();
    layoutRef.current = layoutTower(pigCount, styleRef.current);
    const world = createWorld(layoutRef.current);
    // Settle it offscreen before anyone sees it. Bodies are laid out with a
    // little daylight between tiers so they do not start interpenetrating, and
    // that gap means the structure drops and jostles on the first frames —
    // which is both visible and, until the guard below, able to pop a pig.
    for (let i = 0; i < PRESETTLE_STEPS && !world.isSettled(); i++) world.step();
    world.setPigHitListener(onHit);
    worldRef.current = world;
  };

  /** The only place a participant pig ever leaves the tower. */
  const popChosenPig = (now: number) => {
    const id = chosenPigRef.current;
    const spot = worldRef.current?.snapshot().pigs.find((p) => p.id === id);
    const removed = id >= 0 && (worldRef.current?.popPig(id) ?? false);
    // Record the pop even when the body could not be removed. The backstop
    // calls this every frame until poppedAt is set, so returning early on a
    // failed removal left the round spinning with no way out — which is the
    // "launch never resolves" stall. The pick was made before any of this and
    // still stands, so the round must end regardless of what the sim did.
    if (!removed) {
      console.warn('angry-birds: chosen pig could not be removed; ending the round anyway');
    }
    poppedAtRef.current = now;
    poppedPosRef.current = spot
      ? { x: spot.x, y: spot.y }
      : layoutRef.current.pigs[id] ?? null;
    audio.playPop();
    audio.playCollapse();
  };

  const startPigsRound = (now: number, entries: Entry[]) => {
    const initials = computeInitials(entries);
    const all = propsRef.current.allEntries;

    // Uniform pick first. Everything the slingshot does after this is theatre.
    const chosen = pickVictim(entries);
    const chosenIndex = entries.findIndex((e) => e.id === chosen.id);

    buildWorld(entries.length, (pigId, impulse) => {
      // Nothing counts until the bird is actually away. A settling knock is
      // not a hit, and letting one through ended rounds before the launch.
      if (launchedAtRef.current === 0) return;
      if (impulse < HIT_IMPULSE) return;
      audio.playThud(impulse / 3);
      // Only the pre-picked pig is ever removed; the sim never promotes a
      // bystander into the result, however hard it gets hit. And only the last
      // volley may remove it at all — the earlier birds are there to miss.
      if (!finalVolley()) return;
      if (pigId === chosenPigRef.current && poppedAtRef.current === 0) {
        popChosenPig(performance.now());
      }
    });

    const seats = new Map<number, Seat>();
    entries.forEach((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      seats.set(i, { entry, color: generateColor(idx < 0 ? i : idx), initials: initials[i] });
    });
    seatsRef.current = seats;
    chosenPigRef.current = chosenIndex;

    volleysRef.current = volleysForRound();
    volleyRef.current = 0;
    aimVolley(chosenIndex);
    captionRef.current = volleysRef.current > 1 ? 'VOLLEY 1 — TAKING AIM…' : 'TAKING AIM…';
    audio.playStretch();
    setPhase('aim', now, dur(T.aim));
  };

  /**
   * Point the slingshot for the volley in hand.
   *
   * The telling volley aims at the chosen pig. Earlier ones aim at a different
   * pig's perch, so they land in the structure and throw blocks about without
   * ever being able to take the pick — the listener above holds the pop back
   * regardless, so this only has to look like a near miss.
   */
  const aimVolley = (chosenIndex: number) => {
    const pigs = layoutRef.current.pigs;
    let spot = pigs[chosenIndex];
    if (!finalVolley() && pigs.length > 1) {
      const others = pigs.filter((_, i) => i !== chosenIndex);
      spot = others[Math.floor(Math.random() * others.length)];
    }
    solutionRef.current = solveLaunch({ x: AB.SLING_X, y: AB.SLING_Y }, aimAtPig(spot));
  };

  /** Sub-mode `birds`: stand the generic tower back up for the next shooter. */
  const armShot = (now: number) => {
    const shooter = shootersRef.current[shotIndexRef.current];
    // Each shot stands a fresh tower, so each shot re-arms from scratch.
    launchedAtRef.current = 0;
    buildWorld(GENERIC_PIGS, (pigId, impulse) => {
      if (launchedAtRef.current === 0) return;
      if (impulse < HIT_IMPULSE) return;
      audio.playThud(impulse / 3);
      // These pigs are scenery, not participants, so physics may pop them
      // freely — the scoreboard is still generated from the pre-picked winner.
      if (impulse > GENERIC_POP_IMPULSE) worldRef.current?.popPig(pigId);
    });
    chosenPigRef.current = -1;
    const target = aimForRank(shooter.rank, layoutRef.current);
    solutionRef.current = solveLaunch({ x: AB.SLING_X, y: AB.SLING_Y }, target);
    captionRef.current = `${shooter.entry.name.toUpperCase()} — SHOT ${shotIndexRef.current + 1}/${shootersRef.current.length}`;
    audio.playStretch();
    setPhase('aim', now, dur(T.aim));
  };

  const startBirdsRound = (now: number, entries: Entry[]) => {
    const initials = computeInitials(entries);
    const all = propsRef.current.allEntries;

    // Uniform pick first; the board is then built around it so the numbers on
    // screen can never disagree with who was chosen.
    const winner = pickVictim(entries);
    const board = rankShots(entries, winner.id);
    boardRef.current = board;

    shootersRef.current = entries.map((entry, i) => {
      const row = board.find((r) => r.entryId === entry.id);
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        rank: row?.rank ?? board.length,
        score: row?.score ?? 0,
      };
    });
    shotIndexRef.current = 0;
    armShot(now);
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    if (p.entries.length === 0) return;
    audio.resumeAngryBirdsAudio();
    audio.startTrack();
    declaredRef.current = false;
    poppedAtRef.current = 0;
    // Back to "no bird away yet", which is what makes settling knocks harmless
    // at the start of every round, not just the first.
    launchedAtRef.current = 0;
    poppedPosRef.current = null;
    boardRef.current = [];
    shootersRef.current = [];
    seatsRef.current = new Map();
    styleRef.current = nextTowerStyle();
    if (subModeRef.current === 'birds') startBirdsRound(now, p.entries);
    else startPigsRound(now, p.entries);
  };

  // ---- Start a round on the racing flag ----------------------------------
  useEffect(() => {
    if (props.isRacing) startRound(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag drives a round
  }, [props.isRacing]);

  // ---- Re-run: bin the round in flight and deal a new one ----------------
  useEffect(() => {
    if (props.rerunKey > 0 && props.isRacing) startRound(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the key drives a re-run
  }, [props.rerunKey]);

  // The whole mode is remounted on reset, so the world has to go with it.
  useEffect(() => () => {
    teardownWorld();
    audio.stopTrack();
  }, []);

  // ---- Loop ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const sling = { x: AB.SLING_X, y: AB.SLING_Y };

    /** Where the pouch sits during the draw-back, 0..1 through the aim phase. */
    const pouchAt = (t: number) => {
      const sol = solutionRef.current;
      const speed = Math.hypot(sol.vx, sol.vy) || 1;
      const pull = easeInOut(t) * AB.SLING_PULL;
      return { x: sling.x - (sol.vx / speed) * pull, y: sling.y - (sol.vy / speed) * pull };
    };

    const launch = () => {
      const sol = solutionRef.current;
      worldRef.current?.launchBird(sling, sol.vx, sol.vy);
      launchedAtRef.current = performance.now();
      audio.playLaunch();
      captionRef.current = subModeRef.current === 'birds' ? captionRef.current : 'INCOMING!';
    };

    const declare = () => {
      if (declaredRef.current) return;
      declaredRef.current = true;
      audio.playFanfare();
      const p = propsRef.current;
      if (subModeRef.current === 'birds') {
        const top = boardRef.current[0];
        const entry = p.entries.find((e) => e.id === top?.entryId);
        if (entry) p.onWinner(entry, top.score);
      } else {
        const seat = seatsRef.current.get(chosenPigRef.current);
        if (seat) p.onWinner(seat.entry);
      }
    };

    /** Move on to the next bird, or to the scoreboard once the volley is done. */
    const nextShot = (now: number) => {
      shotIndexRef.current++;
      if (shotIndexRef.current >= shootersRef.current.length) {
        teardownWorld();
        captionRef.current = 'SCORING THE VOLLEY…';
        setPhase('score', now, dur(T.score));
      } else {
        armShot(now);
      }
    };

    const advance = (now: number) => {
      const phase = phaseRef.current;
      if (phase === 'ready') return;
      const world = worldRef.current;
      const birds = subModeRef.current === 'birds';

      switch (phase) {
        case 'aim': {
          if (now < phaseUntilRef.current) break;
          launch();
          setPhase('fly', now, dur(T.flyMax));
          break;
        }
        case 'fly': {
          world?.step();
          const done =
            !!world?.birdIsGone() || poppedAtRef.current > 0 || now >= phaseUntilRef.current;
          if (done) {
            if (!birds && !finalVolley()) captionRef.current = 'NEAR MISS!';
            setPhase('settle', now, dur(T.settleMax));
          }
          break;
        }
        case 'settle': {
          world?.step();
          const held = now - phaseStartRef.current;
          const restful = held > dur(T.settleMin) && (world?.isSettled() ?? true);
          if (birds) {
            const over = now >= phaseUntilRef.current;
            if (over || (restful && held > dur(T.settleMin) + dur(T.shotGap))) nextShot(now);
            break;
          }
          // Sub-mode `pigs`: a volley that was never meant to tell. Let the
          // dust settle, then send the next bird. No backstop here — missing
          // is the whole point of these, so there is nothing to rescue.
          if (!finalVolley()) {
            if (restful || now >= phaseUntilRef.current) {
              volleyRef.current += 1;
              aimVolley(chosenPigRef.current);
              // Re-arm the immunity: the structure is still shifting, and a
              // settling knock must not count while the next bird is drawn.
              launchedAtRef.current = 0;
              captionRef.current = `VOLLEY ${volleyRef.current + 1} — TAKING AIM…`;
              setPhase('aim', now, dur(T.aim));
            }
            break;
          }

          // The backstop. If the collapse never reached the chosen pig, pop it
          // anyway — a round can never stall on physics.
          if (poppedAtRef.current === 0 && now - launchedAtRef.current > AB.FORCED_END_MS) {
            popChosenPig(now);
          }
          if (poppedAtRef.current === 0) {
            if (now >= phaseUntilRef.current) {
              // The dust settled and the pig is still perched: the bird made a
              // mess somewhere else. The pick stands, so pop it now.
              popChosenPig(now);
            }
            break;
          }
          if (now - poppedAtRef.current > dur(T.settleMin)) {
            captionRef.current = 'DIRECT HIT!';
            setPhase('done', now, dur(T.done));
            declare();
          }
          break;
        }
        case 'score': {
          if (now >= phaseUntilRef.current) {
            const top = boardRef.current[0];
            captionRef.current = top ? `BEST SHOT: ${top.name.toUpperCase()}` : '';
            setPhase('done', now, dur(T.done));
            declare();
          }
          break;
        }
      }
    };

    // ---- Drawing ----------------------------------------------------------
    const drawScene = (now: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, AB.GROUND_Y);
      sky.addColorStop(0, '#5FC9F3');
      sky.addColorStop(1, '#BDE9FB');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, AB.CANVAS_W, AB.GROUND_Y);

      // Clouds drifting, slowly enough not to distract
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 4; i++) {
        const cx = ((now / 70 + i * 260) % (AB.CANVAS_W + 220)) - 110;
        const cy = 70 + i * 36;
        for (const [dx, dy, r] of [[0, 0, 26], [26, 6, 20], [-26, 8, 18]] as const) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Rolling hills behind the tower
      ctx.fillStyle = '#7FC24A';
      for (const [hx, hr] of [[300, 120], [620, 160], [820, 110]] as const) {
        ctx.beginPath();
        ctx.arc(hx, AB.GROUND_Y + hr * 0.45, hr, Math.PI, 0);
        ctx.fill();
      }

      // Ground
      ctx.fillStyle = '#5B9A2F';
      ctx.fillRect(0, AB.GROUND_Y, AB.CANVAS_W, AB.CANVAS_H - AB.GROUND_Y);
      ctx.fillStyle = '#9BD35E';
      ctx.fillRect(0, AB.GROUND_Y, AB.CANVAS_W, 9);
      ctx.fillStyle = '#7A5A33';
      ctx.fillRect(0, AB.GROUND_Y + 28, AB.CANVAS_W, AB.CANVAS_H - AB.GROUND_Y - 28);
    };

    const drawBoard = (now: number) => {
      const board = boardRef.current;
      if (board.length === 0) return;
      const shownRows = Math.min(board.length, 9);
      const w = 268;
      const h = 44 + shownRows * 24;
      const x = AB.CANVAS_W / 2 - w / 2;
      const y = 60;
      ctx.save();
      ctx.fillStyle = 'rgba(12, 28, 44, 0.9)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 210, 58, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFD23A';
      ctx.font = 'bold 16px "Arial Black", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCOREBOARD', x + w / 2, y + 22);

      ctx.font = 'bold 13px system-ui, sans-serif';
      board.slice(0, shownRows).forEach((row, i) => {
        const ry = y + 48 + i * 24;
        const top = i === 0;
        // The best shot flashes: it is about to be announced as the pick.
        ctx.globalAlpha = top && Math.floor(now / 260) % 2 === 0 ? 1 : top ? 0.6 : 0.85;
        ctx.fillStyle = top ? '#FFD23A' : '#E6F2FA';
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}. ${row.name}`, x + 16, ry);
        ctx.textAlign = 'right';
        ctx.fillText(String(row.score), x + w - 16, ry);
      });
      ctx.globalAlpha = 1;
      if (board.length > shownRows) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(230,242,250,0.6)';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`+${board.length - shownRows} more`, x + w / 2, y + h - 12);
      }
      ctx.restore();
    };

    /** Caption strip along the bottom, shared by the lobby and live draws. */
    const drawCaption = () => {
      const phase = phaseRef.current;
      const birdsMode = subModeRef.current === 'birds';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      const caption =
        phase === 'ready'
          ? birdsMode
            ? 'LOAD THE FLOCK'
            : 'THE PIGS ARE WAITING'
          : captionRef.current;
      ctx.fillText(caption, AB.CANVAS_W / 2, AB.CANVAS_H - 24);
      ctx.restore();
    };

    /**
     * What the field shows before a round starts.
     *
     * The physics world only exists for the duration of a round, so without
     * this the lobby was an empty meadow under the words "THE PIGS ARE
     * WAITING". Everything here is drawn straight from the pure layout — no
     * bodies, no simulation — purely so the crowd can see who is up before
     * anyone clicks Start, the same way the other modes seat their
     * participants in advance.
     */
    const drawLobby = (now: number) => {
      const p = propsRef.current;
      const birdsMode = subModeRef.current === 'birds';
      const list = p.entries.length > 0 ? p.entries : p.allEntries;
      if (list.length === 0) return;

      // In `birds` the tower is scenery, so it stands at its fixed size and the
      // participants wait their turn on the ground instead.
      const layout = layoutTower(birdsMode ? GENERIC_PIGS : list.length, styleRef.current);
      for (const b of layout.blocks) drawBlock(ctx, b.x, b.y, b.w, b.h, 0, b.kind, b.material);

      const initials = computeInitials(list);
      const colorFor = (entry: Entry, i: number) => {
        const idx = p.allEntries.findIndex((e) => e.id === entry.id);
        return generateColor(idx < 0 ? i : idx);
      };

      layout.pigs.forEach((spot, i) => {
        const entry = birdsMode ? undefined : list[i];
        // A gentle idle bob so the lobby is not a still frame.
        const bob = Math.sin(now / 620 + i * 0.7) * 1.6;
        drawPig(ctx, spot.x, spot.y + bob, spot.r, {
          color: entry ? colorFor(entry, i) : undefined,
          initials: entry ? initials[i] : undefined,
          avatar: avatarFor(entry),
        });
      });

      if (birdsMode) {
        // The flock waiting its turn, huddled behind the slingshot in firing
        // order. Three to a row and stacked upward: a full roster of 20 has to
        // fit in the strip left of the sling without spilling off the canvas.
        list.forEach((entry, i) => {
          const x = 30 + (i % 3) * 27;
          const y = AB.GROUND_Y - 12 - Math.floor(i / 3) * 27;
          const bob = Math.sin(now / 540 + i) * 1.4;
          drawBird(ctx, x, y + bob, AB.BIRD_R, {
            color: colorFor(entry, i),
            initials: initials[i],
          });
        });
      }
    };

    const draw = (now: number) => {
      const phase = phaseRef.current;
      drawScene(now);

      if (phase === 'ready' && !worldRef.current) {
        drawLobby(now);
        drawSlingshot(ctx, sling.x, AB.GROUND_Y, sling.y, null);
        drawCaption();
        return;
      }

      const snap = worldRef.current?.snapshot() ?? { blocks: [], pigs: [], bird: null };
      for (const b of snap.blocks) drawBlock(ctx, b.x, b.y, b.w, b.h, b.angle, b.kind, b.material);

      const birdsMode = subModeRef.current === 'birds';
      for (const p of snap.pigs) {
        const seat = seatsRef.current.get(p.id);
        drawPig(ctx, p.x, p.y, p.r, {
          color: birdsMode ? undefined : seat?.color,
          initials: birdsMode ? undefined : seat?.initials,
          // Scenery pigs in `birds` mode are nobody, so they never wear a face.
          avatar: birdsMode ? null : avatarFor(seat?.entry),
          angle: p.angle,
        });
      }

      // The puff where the chosen pig was
      if (poppedAtRef.current > 0 && poppedPosRef.current) {
        const t = (now - poppedAtRef.current) / 620;
        if (t <= 1) drawPuff(ctx, poppedPosRef.current.x, poppedPosRef.current.y, t);
      }

      // Slingshot, with the bird in the pouch while aiming
      const aiming = phase === 'aim';
      const aimT = aiming
        ? (now - phaseStartRef.current) / Math.max(1, phaseUntilRef.current - phaseStartRef.current)
        : 0;
      const pouch = aiming ? pouchAt(aimT) : null;
      drawSlingshot(ctx, sling.x, AB.GROUND_Y, sling.y, pouch);

      const shooter = birdsMode ? shootersRef.current[shotIndexRef.current] : undefined;
      if (pouch) {
        drawBird(ctx, pouch.x, pouch.y, AB.BIRD_R, {
          color: shooter?.color,
          initials: shooter?.initials,
          loaded: true,
        });
      }
      if (snap.bird) {
        drawBird(ctx, snap.bird.x, snap.bird.y, snap.bird.r, {
          color: shooter?.color,
          initials: shooter?.initials,
          angle: snap.bird.angle,
        });
      }

      if (phase === 'score') drawBoard(now);

      drawCaption();
    };

    const loop = () => {
      const now = performance.now();
      advance(now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs carry the latest values
  }, []);

  const cw = props.currentWinner;
  const pigsMode = settings.subMode === 'pigs';

  return (
    <div className="angry-birds-game">
      <div className="angry-birds-canvas-host">
        <canvas
          ref={canvasRef}
          width={AB.CANVAS_W}
          height={AB.CANVAS_H}
          className="game-canvas"
        />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={props.entries.length === 0}
        // Explicitly set, never undefined: WinnerDialog falls back to `isFinals`
        // for the gold treatment. In `pigs` the champion is the pig that was
        // never hit, so a popped pig must not be gilded; in `birds` the first
        // pick is the champion.
        goldTreatment={pigsMode ? (cw?.isLastPlayer ?? false) : (cw?.isChampion ?? false)}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={pigsMode ? '💥 POPPED' : '🎯 BEST SHOT'}
        finalsHeadline={pigsMode ? '🏆 LAST PIG STANDING 🏆' : '🏆 TOP SHOT 🏆'}
        detailsNode={
          cw?.score !== undefined ? (
            <div className="angry-birds-score">{cw.score.toLocaleString()} pts</div>
          ) : undefined
        }
        nextLabel={pigsMode ? '🐦 Next Bird' : '🎯 Next Volley'}
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
