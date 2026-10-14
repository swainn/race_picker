import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { createShuffleBag } from '../../../utils/shuffleBag';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  FAKE_SWINGS,
  MOLE_T,
  WHAC,
  easeInCubic,
  easeInOut,
  layoutHoles,
  pickVictim,
  type HoleSpot,
} from './moleEngine';
import {
  drawBoard,
  drawHole,
  drawHoleRim,
  drawImpactDust,
  drawMallet,
  drawMole,
  drawStars,
} from './moleSprites';
import {
  useWhacAMoleSettings,
  whacDensityDwell,
  whacSpeedFactor,
} from './whacAMoleSettingsStore';
import * as audio from './whacAMoleAudio';
import './WhacAMoleGame.css';

export interface WhacAMoleWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** The mole the mallet never came for — the one still standing at the end. */
  isLastPlayer?: boolean;
  /** Gold treatment. In this mode only the never-whacked mole earns it. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (whacked: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: WhacAMoleWinnerDisplay | null;
}

type Phase = 'ready' | 'popping' | 'lock' | 'swing' | 'whack' | 'done';

/** How long a mole takes to travel the full height of its hole. */
const POP_MS = 170;

interface Mole {
  entry: Entry;
  color: string;
  initials: string;
  hole: HoleSpot;
  /** Where the mole is heading: up out of the hole, or back down. */
  up: boolean;
  /** 0 = hidden, 1 = fully up. Eased toward `up` every frame. */
  pop: number;
  /** When this mole next flips between up and down (ms, performance clock). */
  nextAt: number;
  phase: number;
  /** Set once the mallet has landed on it: this mole is out. */
  knocked: boolean;
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

/**
 * The shape of a swing: cock back, strike, recover. `reach` is how far below
 * the hover line the head travels — a fake swing simply uses a short reach,
 * which is the whole difference between a tease and a hit.
 */
function swingShape(t: number, reach: number): { dy: number; tilt: number } {
  if (t < 0.3) {
    const e = easeInOut(t / 0.3);
    return { dy: -26 * e, tilt: -0.55 * e };
  }
  if (t < 0.62) {
    // Accelerating downstroke, so the head is moving fastest when it lands.
    const e = easeInCubic((t - 0.3) / 0.32);
    return { dy: -26 + (reach + 26) * e, tilt: -0.55 * (1 - e) };
  }
  const e = easeInOut((t - 0.62) / 0.38);
  return { dy: reach * (1 - e), tilt: 0 };
}

export function WhacAMoleGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useWhacAMoleSettings();
  useEffect(() => { audio.setWhacMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setWhacMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const densityRef = useRef(settings.density);
  densityRef.current = settings.density;
  useEffect(() => () => { audio.stopTrack(); }, []);

  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const phaseUntilRef = useRef(0);
  const lastFrameRef = useRef(0);

  const molesRef = useRef<Mole[]>([]);
  const rosterSigRef = useRef('');
  /** Index into molesRef of the mole picked before any of this animated. */
  const victimRef = useRef(-1);
  const declaredRef = useRef(false);

  // Mallet: head position, plus where the current leg started and ends.
  const malletXRef = useRef<number>(WHAC.CANVAS_W / 2);
  const malletYRef = useRef<number>(WHAC.BOARD_TOP);
  const fromXRef = useRef<number>(WHAC.CANVAS_W / 2);
  const fromYRef = useRef<number>(WHAC.BOARD_TOP);
  const toXRef = useRef<number>(WHAC.CANVAS_W / 2);
  const toYRef = useRef<number>(WHAC.BOARD_TOP);
  const tiltRef = useRef(0);

  /** Fake swings landed so far this round, and whether one is mid-flight. */
  const fakesDoneRef = useRef(0);
  const fakingRef = useRef(false);
  /** True once the mallet has stopped teasing and committed to the victim. */
  const lockedRef = useRef(false);
  /** Timestamp of impact, used to time the stars and the dust ring. */
  const hitAtRef = useRef(0);
  /**
   * Cosmetic-only picker for which empty hole gets teased next. A shuffle bag
   * keeps the two fakes from landing on the same hole; it must never be used
   * for the victim (see utils/shuffleBag.ts and moleEngine.ts).
   */
  const decoyBagRef = useRef<(() => number) | null>(null);

  const dur = (ms: number) => ms * whacSpeedFactor(speedRef.current);

  const setPhase = (next: Phase, now: number, ms: number) => {
    phaseRef.current = next;
    phaseStartRef.current = now;
    phaseUntilRef.current = now + ms;
  };

  const hoverYFor = (hole: HoleSpot) => hole.y - WHAC.HOVER_DY;

  /** Fill the board from the current entry list (also used between rounds). */
  const seedMoles = (list: Entry[], now: number) => {
    const initials = computeInitials(list);
    const holes = layoutHoles(list.length);
    const all = propsRef.current.allEntries;
    const dwell = whacDensityDwell(densityRef.current);
    molesRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        hole: holes[i],
        up: false,
        pop: 0,
        // Stagger the first appearance so the board does not pulse in unison.
        nextAt: now + Math.random() * dwell.downMs,
        phase: Math.random() * Math.PI * 2,
        knocked: false,
      };
    });
  };

  /** Send the mallet drifting to the next empty hole it will tease. */
  const startDrift = (now: number) => {
    const moles = molesRef.current;
    const draw = decoyBagRef.current;
    const target = draw ? draw() : victimRef.current;
    const hole = moles[target]?.hole ?? moles[0]?.hole;
    fromXRef.current = malletXRef.current;
    fromYRef.current = malletYRef.current;
    toXRef.current = hole?.x ?? WHAC.CANVAS_W / 2;
    toYRef.current = hole ? hoverYFor(hole) : WHAC.BOARD_TOP;
    fakingRef.current = false;
    setPhase('popping', now, dur(MOLE_T.drift));
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumeWhacAudio();
    seedMoles(p.entries, now);

    // Uniform pick first. Everything the mallet does after this line is
    // choreography aimed at a decision that has already been made.
    const victim = pickVictim(p.entries);
    victimRef.current = molesRef.current.findIndex((m) => m.entry.id === victim.id);

    // The fakes are drawn only from holes the pick passed over, so the tease
    // can never collide with — or hint at — the real target.
    const decoys = molesRef.current
      .map((_, i) => i)
      .filter((i) => i !== victimRef.current);
    decoyBagRef.current = decoys.length > 0 ? createShuffleBag(decoys) : null;

    declaredRef.current = false;
    fakesDoneRef.current = 0;
    lockedRef.current = false;
    hitAtRef.current = 0;
    tiltRef.current = 0;

    audio.playWhistle();
    audio.startTrack();
    startDrift(now);
  };

  // ---- Start / stop on the racing flag -----------------------------------
  useEffect(() => {
    if (props.isRacing && props.entries.length >= 1) startRound(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag drives a round
  }, [props.isRacing]);

  // ---- Loop --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const victimMole = () => molesRef.current[victimRef.current];

    /** Move `value` toward `target` by at most `step`. */
    const approach = (value: number, target: number, step: number) =>
      value < target ? Math.min(target, value + step) : Math.max(target, value - step);

    /**
     * Decoy moles bob on their own schedule. This is pure decoration: it runs
     * only while the mallet is still hunting, and stops dead once it locks on.
     */
    const updateMoles = (now: number, dt: number) => {
      const phase = phaseRef.current;
      const idle = phase === 'ready' || phase === 'popping';
      const dwell = whacDensityDwell(densityRef.current);

      for (const mole of molesRef.current) {
        if (mole.knocked) {
          mole.pop = approach(mole.pop, 0, dt / 260);
          continue;
        }
        if (idle && !lockedRef.current && now >= mole.nextAt) {
          mole.up = !mole.up;
          // Not every pop gets a sound, or a busy board turns into mush.
          if (mole.up && Math.random() < 0.55) audio.playPop();
          const base = mole.up ? dwell.upMs : dwell.downMs;
          mole.nextAt = now + base * (0.6 + Math.random() * 0.8);
        }
        mole.pop = approach(mole.pop, mole.up ? 1 : 0, dt / POP_MS);
      }
    };

    const advance = (now: number) => {
      const phase = phaseRef.current;
      if (phase === 'ready' || phase === 'done') return;
      const span = phaseUntilRef.current - phaseStartRef.current;
      const t = span <= 0 ? 1 : (now - phaseStartRef.current) / span;
      const victim = victimMole();

      switch (phase) {
        case 'popping': {
          if (fakingRef.current) {
            // A swing at an empty hole: short reach, nothing lands.
            const s = swingShape(Math.min(1, t), WHAC.IMPACT_DY * 0.55);
            malletXRef.current = toXRef.current;
            malletYRef.current = toYRef.current + s.dy;
            tiltRef.current = s.tilt;
            if (now < phaseUntilRef.current) break;

            fromXRef.current = malletXRef.current;
            fromYRef.current = toYRef.current;
            malletYRef.current = toYRef.current;
            fakesDoneRef.current++;

            if (fakesDoneRef.current >= FAKE_SWINGS) {
              // Commit. Every other mole ducks, leaving the one that was
              // picked before the round began alone on the board.
              lockedRef.current = true;
              molesRef.current.forEach((m, i) => {
                m.up = i === victimRef.current;
                m.nextAt = Number.POSITIVE_INFINITY;
              });
              fromXRef.current = malletXRef.current;
              fromYRef.current = malletYRef.current;
              toXRef.current = victim?.hole.x ?? malletXRef.current;
              toYRef.current = victim ? hoverYFor(victim.hole) : malletYRef.current;
              fakingRef.current = false;
              setPhase('lock', now, dur(MOLE_T.lock));
            } else {
              startDrift(now);
            }
            break;
          }

          // Drifting across the board to the next hole to tease.
          const e = easeInOut(t);
          malletXRef.current = fromXRef.current + (toXRef.current - fromXRef.current) * e;
          malletYRef.current = fromYRef.current + (toYRef.current - fromYRef.current) * e;
          tiltRef.current = 0;
          if (now >= phaseUntilRef.current) {
            fakingRef.current = true;
            audio.playWhoosh();
            setPhase('popping', now, dur(MOLE_T.fake));
          }
          break;
        }
        case 'lock': {
          const e = easeInOut(t);
          malletXRef.current = fromXRef.current + (toXRef.current - fromXRef.current) * e;
          malletYRef.current = fromYRef.current + (toYRef.current - fromYRef.current) * e;
          tiltRef.current = 0;
          if (now >= phaseUntilRef.current) {
            audio.playWhoosh();
            setPhase('swing', now, dur(MOLE_T.swing));
          }
          break;
        }
        case 'swing': {
          // The real swing runs only the cock-and-strike part of the shape, so
          // the phase ends exactly at the moment of impact.
          const s = swingShape(Math.min(1, t) * 0.62, WHAC.IMPACT_DY);
          malletXRef.current = toXRef.current;
          malletYRef.current = toYRef.current + s.dy;
          tiltRef.current = s.tilt;
          if (now >= phaseUntilRef.current) {
            hitAtRef.current = now;
            audio.playBonk();
            audio.playKnockout();
            setPhase('whack', now, dur(MOLE_T.whack));
          }
          break;
        }
        case 'whack': {
          // Head rests on the flattened mole, then lifts away.
          const lift = easeInOut(Math.max(0, (t - 0.45) / 0.55));
          malletXRef.current = toXRef.current;
          malletYRef.current = toYRef.current + WHAC.IMPACT_DY * (1 - lift * 0.85);
          tiltRef.current = 0;
          if (now >= phaseUntilRef.current) {
            if (victim) victim.knocked = true;
            setPhase('done', now, dur(MOLE_T.done));
            // Declared from the loop, exactly once, after the hit has played.
            if (!declaredRef.current) {
              declaredRef.current = true;
              if (victim) propsRef.current.onWinner(victim.entry);
            }
          }
          break;
        }
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const draw = (now: number) => {
      const phase = phaseRef.current;
      drawBoard(ctx, now);

      const moles = molesRef.current;
      const victimIdx = victimRef.current;
      const sinceHit = hitAtRef.current > 0 ? now - hitAtRef.current : 0;
      const hitLanded = hitAtRef.current > 0 && (phase === 'whack' || phase === 'done');

      // Back rows first so a front mole overlaps the one behind it.
      const order = moles.map((_, i) => i).sort((a, b) => moles[a].hole.y - moles[b].hole.y);
      for (const i of order) {
        const mole = moles[i];
        const hole = mole.hole;
        drawHole(ctx, hole.x, hole.y);

        // Alarm rises as the mallet looms overhead — the victim gets the full
        // treatment once the mallet has locked on.
        const dx = Math.abs(malletXRef.current - hole.x);
        const dy = Math.abs(malletYRef.current + WHAC.HOVER_DY - hole.y);
        const near = Math.max(0, 1 - dx / 90) * Math.max(0, 1 - dy / 120);
        const committed = i === victimIdx && (phase === 'lock' || phase === 'swing');
        const alarm = mole.knocked ? 0 : Math.min(1, committed ? 1 : near * 0.8);

        ctx.save();
        // Clip to the hole mouth so the mole reads as rising out of the ground.
        ctx.beginPath();
        ctx.rect(
          hole.x - WHAC.HOLE_RX - 18,
          hole.y - 220,
          (WHAC.HOLE_RX + 18) * 2,
          220 + WHAC.HOLE_RY
        );
        ctx.clip();
        ctx.translate(hole.x, hole.y);
        drawMole(ctx, mole.color, mole.initials, {
          pop: mole.pop,
          phase: mole.phase + now / 420,
          alarm,
          hit: i === victimIdx && hitLanded,
          ghost: mole.knocked && phase !== 'whack',
          sinceHit,
        });
        ctx.restore();

        drawHoleRim(ctx, hole.x, hole.y);
      }

      // Impact effects sit above the board but below the mallet.
      if (hitLanded) {
        const hole = moles[victimIdx]?.hole;
        if (hole) {
          drawImpactDust(ctx, hole.x, hole.y, sinceHit);
          drawStars(ctx, hole.x, hole.y, sinceHit);
        }
      }

      if (phase !== 'ready') {
        drawMallet(ctx, malletXRef.current, malletYRef.current, tiltRef.current);
      }

      // Status line on the cabinet front
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const caption =
        phase === 'ready' ? (moles.length ? 'STEP RIGHT UP…' : 'THE BOARD IS EMPTY')
          : phase === 'popping' ? 'THE MALLET IS HUNTING…'
            : phase === 'lock' ? 'IT HAS PICKED A HOLE…'
              : phase === 'swing' ? 'DUCK!'
                : 'ONE MOLE DOWN';
      ctx.fillText(caption, WHAC.CANVAS_W / 2, WHAC.CANVAS_H - 46);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      const dt = lastFrameRef.current === 0 ? 16 : Math.min(50, now - lastFrameRef.current);
      lastFrameRef.current = now;
      const p = propsRef.current;

      // Refill the board whenever nothing is in play: before the first swing,
      // and again once the session is over.
      const over = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || phaseRef.current === 'done' || over)) {
        const list = over ? p.allEntries : p.entries;
        const sig = `${over ? 'end' : 'lobby'}:${list.map((e) => e.id).join(',')}`;
        if (sig !== rosterSigRef.current && phaseRef.current !== 'done') {
          rosterSigRef.current = sig;
          seedMoles(list, now);
        }
      }

      updateMoles(now, dt);
      advance(now);
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
    <div className="whac-a-mole-game">
      <div className="whac-a-mole-canvas-host">
        <canvas
          ref={canvasRef}
          width={WHAC.CANVAS_W}
          height={WHAC.CANVAS_H}
          className="game-canvas"
        />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={props.entries.length === 0}
        // Explicitly false, not undefined: WinnerDialog falls back to
        // `isFinals` for gold, and a knockout is the opposite of a win here.
        // Only the mole that never got hit earns the champion treatment.
        goldTreatment={cw?.isChampion ?? false}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={cw?.isChampion ? '🏆 NEVER GOT HIT 🏆' : '🔨 WHACKED'}
        finalsHeadline={cw?.isLastPlayer ? '🏆 NEVER GOT HIT 🏆' : '🔨 WHACKED'}
        nextLabel="🔨 Next Swing"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
