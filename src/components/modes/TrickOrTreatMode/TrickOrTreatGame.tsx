import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  FEINTS,
  TOT,
  TOT_T,
  bagMouth,
  easeInOut,
  easeInQuad,
  layoutKids,
  pickTreated,
  type KidSpot,
} from './treatEngine';
import {
  COSTUMES,
  drawCandy,
  drawHand,
  drawKid,
  drawPorch,
  drawSparkles,
  type Costume,
} from './treatSprites';
import { useTrickOrTreatSettings, treatSpeedFactor } from './trickOrTreatSettingsStore';
import * as audio from './treatAudio';
import './TrickOrTreatGame.css';

export interface TreatWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** The last one left on the porch — treated only because nobody else remains. */
  isLastPlayer?: boolean;
  /** The very first bag filled, so first place overall. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (treated: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: TreatWinnerDisplay | null;
}

interface Point { x: number; y: number }

type Phase = 'ready' | 'gather' | 'glide' | 'feint' | 'settle' | 'drop' | 'cheer' | 'done';

interface Kid {
  entry: Entry;
  color: string;
  initials: string;
  costume: Costume;
  spot: KidSpot;
  phase: number;
  treated: boolean;
  avatar: HTMLImageElement | null;
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

export function TrickOrTreatGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useTrickOrTreatSettings();
  useEffect(() => { audio.setTreatMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setTreatMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const avatarsRef = useRef(settings.useAvatars);
  avatarsRef.current = settings.useAvatars;
  useEffect(() => () => { audio.stopTrack(); }, []);

  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const phaseUntilRef = useRef(0);
  const kidsRef = useRef<Kid[]>([]);
  const rosterSigRef = useRef('');
  const chosenRef = useRef(-1);
  const declaredRef = useRef(false);

  /** The hand, in canvas coordinates. */
  // Annotated: TOT is `as const`, so inference would pin these to literals.
  const handRef = useRef<Point>({ x: TOT.DOOR_X, y: TOT.HAND_REST_Y });
  const handFromRef = useRef<Point>({ x: TOT.DOOR_X, y: TOT.HAND_REST_Y });
  const handToRef = useRef<Point>({ x: TOT.DOOR_X, y: TOT.HAND_REST_Y });
  /** Which bags the hand pretends to consider before committing. */
  const feintTargetsRef = useRef<number[]>([]);
  const feintRef = useRef(0);
  const candyRef = useRef<{ x: number; y: number; spin: number } | null>(null);
  const treatedAtRef = useRef(0);

  const dur = (ms: number) => ms * treatSpeedFactor(speedRef.current);

  const setPhase = (next: Phase, now: number, ms: number) => {
    phaseRef.current = next;
    phaseStartRef.current = now;
    phaseUntilRef.current = now + ms;
  };

  /** Line everyone up on the porch (also used between rounds). */
  const seedKids = (list: Entry[]) => {
    const initials = computeInitials(list);
    const spots = layoutKids(list.length);
    const all = propsRef.current.allEntries;
    kidsRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        // Costume is cosmetic variety only — never the pick.
        costume: COSTUMES[(idx < 0 ? i : idx) % COSTUMES.length],
        spot: spots[i],
        phase: Math.random() * Math.PI * 2,
        treated: false,
        avatar: avatarsRef.current ? imageFor(getPreferredEntryImage(entry)) : null,
      };
    });
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumeTreatAudio();
    seedKids(p.entries);
    // Uniform pick first; the hand is choreographed to whatever this returned.
    const chosen = pickTreated(p.entries);
    chosenRef.current = kidsRef.current.findIndex((k) => k.entry.id === chosen.id);
    declaredRef.current = false;
    candyRef.current = null;

    // A couple of other bags to hover over on the way, purely for suspense.
    const others = kidsRef.current
      .map((_, i) => i)
      .filter((i) => i !== chosenRef.current)
      .sort(() => Math.random() - 0.5)
      .slice(0, FEINTS);
    feintTargetsRef.current = others;
    feintRef.current = 0;

    handRef.current = { x: TOT.DOOR_X, y: TOT.HAND_REST_Y };
    handFromRef.current = { ...handRef.current };
    handToRef.current = { ...handRef.current };

    audio.playDoorbell();
    audio.startTrack();
    setPhase('gather', now, dur(TOT_T.gather));
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

    const chosenKid = () => kidsRef.current[chosenRef.current];

    /** Where the hand hovers to offer a sweet to kid `i`. */
    const hoverOver = (i: number) => {
      const kid = kidsRef.current[i];
      if (!kid) return { x: TOT.DOOR_X, y: TOT.HAND_REST_Y };
      const mouth = bagMouth(kid.spot);
      // Just above the bag's mouth. Any higher and the hand hovers over the
      // child's face instead of their bag.
      return { x: mouth.x, y: mouth.y - 14 };
    };

    const glideTo = (target: { x: number; y: number }, now: number, ms: number, phase: Phase) => {
      handFromRef.current = { ...handRef.current };
      handToRef.current = target;
      setPhase(phase, now, ms);
    };

    const advance = (now: number) => {
      const phase = phaseRef.current;
      if (phase === 'ready' || phase === 'done') return;
      const span = phaseUntilRef.current - phaseStartRef.current;
      const t = span <= 0 ? 1 : Math.min(1, (now - phaseStartRef.current) / span);

      const lerpHand = (e: number) => {
        handRef.current = {
          x: handFromRef.current.x + (handToRef.current.x - handFromRef.current.x) * e,
          y: handFromRef.current.y + (handToRef.current.y - handFromRef.current.y) * e,
        };
      };

      switch (phase) {
        case 'gather': {
          if (now >= phaseUntilRef.current) {
            audio.playChant();
            const first = feintTargetsRef.current[0];
            const target = first === undefined ? hoverOver(chosenRef.current) : hoverOver(first);
            glideTo(target, now, dur(TOT_T.glide), 'glide');
          }
          break;
        }
        case 'glide': {
          lerpHand(easeInOut(t));
          if (now >= phaseUntilRef.current) {
            audio.playHover();
            setPhase('feint', now, dur(TOT_T.feint));
          }
          break;
        }
        case 'feint': {
          // Dip toward the bag, then think better of it.
          const dip = Math.sin(t * Math.PI) * 14;
          handRef.current = { x: handToRef.current.x, y: handToRef.current.y + dip };
          if (now >= phaseUntilRef.current) {
            feintRef.current++;
            const next = feintTargetsRef.current[feintRef.current];
            if (next === undefined) {
              glideTo(hoverOver(chosenRef.current), now, dur(TOT_T.settle), 'settle');
            } else {
              glideTo(hoverOver(next), now, dur(TOT_T.glide), 'glide');
            }
          }
          break;
        }
        case 'settle': {
          lerpHand(easeInOut(t));
          if (now >= phaseUntilRef.current) {
            const kid = chosenKid();
            candyRef.current = kid
              ? { x: handRef.current.x, y: handRef.current.y + 12, spin: 0 }
              : null;
            setPhase('drop', now, dur(TOT_T.drop));
          }
          break;
        }
        case 'drop': {
          // The sweet falls the last stretch into the bag.
          const kid = chosenKid();
          if (kid) {
            const mouth = bagMouth(kid.spot);
            const from = handRef.current.y + 12;
            candyRef.current = {
              x: handRef.current.x + (mouth.x - handRef.current.x) * t,
              y: from + (mouth.y + 6 - from) * easeInQuad(t),
              spin: t * Math.PI * 2,
            };
          }
          if (now >= phaseUntilRef.current) {
            candyRef.current = null;
            treatedAtRef.current = now;
            if (kid) kid.treated = true;
            audio.playPlop();
            audio.playCheer();
            setPhase('cheer', now, dur(TOT_T.cheer));
          }
          break;
        }
        case 'cheer': {
          // The hand withdraws back through the doorway.
          handRef.current = {
            x: handRef.current.x + (TOT.DOOR_X - handRef.current.x) * 0.06,
            y: handRef.current.y + (TOT.HAND_REST_Y - handRef.current.y) * 0.06,
          };
          if (now >= phaseUntilRef.current) {
            setPhase('done', now, dur(TOT_T.done));
            // Declared at the *end* of the cheer, not the start of it: the
            // winner card covers the porch, so announcing on the drop would
            // hide the candy landing and the celebration it causes.
            if (!declaredRef.current) {
              declaredRef.current = true;
              const kid = chosenKid();
              if (kid) propsRef.current.onWinner(kid.entry);
            }
          }
          break;
        }
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const draw = (now: number) => {
      const phase = phaseRef.current;
      drawPorch(ctx, now);

      const kids = kidsRef.current;
      const chosen = chosenRef.current;

      // Back rows first so the line overlaps correctly.
      const order = kids.map((_, i) => i).sort((a, b) => kids[a].spot.y - kids[b].spot.y);
      for (const i of order) {
        const kid = kids[i];
        // Hope rises as the hand comes within reach of this bag.
        const dx = Math.abs(handRef.current.x - kid.spot.x);
        const dy = Math.abs(handRef.current.y - (kid.spot.y - TOT.BAG_LIFT));
        const near = Math.max(0, 1 - dx / 80) * Math.max(0, 1 - dy / 120);
        const reaching = phase === 'feint' || phase === 'settle' || phase === 'drop';
        drawKid(ctx, kid.spot.x, kid.spot.y, kid.spot.scale, {
          costume: kid.costume,
          color: kid.color,
          initials: kid.initials,
          phase: kid.phase + now / 620,
          hopeful: kid.treated ? 0 : Math.min(1, near * (reaching ? 1 : 0.65)),
          treated: kid.treated,
          sinceTreat: kid.treated ? now - treatedAtRef.current : 0,
          avatar: kid.avatar,
        });

        if (kid.treated && i === chosen) {
          const mouth = bagMouth(kid.spot);
          drawSparkles(ctx, mouth.x, mouth.y, (now - treatedAtRef.current) / dur(700));
        }
      }

      // The hand, and whatever it is holding
      if (phase !== 'ready' && phase !== 'done') {
        const holding = phase !== 'drop' && phase !== 'cheer';
        ctx.save();
        if (phase === 'cheer') {
          // Fades as it withdraws, so it doesn't end up a stub hovering in
          // the middle of the open doorway.
          const span = phaseUntilRef.current - phaseStartRef.current;
          const t = span <= 0 ? 1 : (now - phaseStartRef.current) / span;
          ctx.globalAlpha = Math.max(0, 1 - t * 1.6);
        }
        drawHand(ctx, handRef.current.x, handRef.current.y, holding);
        ctx.restore();
        const candy = candyRef.current;
        if (candy) drawCandy(ctx, candy.x, candy.y, 1, candy.spin);
      }

      // Caption across the porch boards
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,226,170,0.9)';
      const caption =
        phase === 'ready' ? (kids.length ? 'RING THE DOORBELL' : 'THE PORCH IS EMPTY')
          : phase === 'gather' ? 'TRICK OR TREAT!'
            : phase === 'glide' || phase === 'feint' ? 'WHOSE BAG…?'
              : phase === 'settle' ? 'THIS ONE…'
                : phase === 'drop' ? 'ONE FOR YOU!'
                  : 'HAPPY HALLOWEEN';
      ctx.fillText(caption, TOT.CANVAS_W / 2, TOT.CANVAS_H - 16);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      const p = propsRef.current;

      // Refill the porch whenever nothing is in play: before the first round,
      // and again once the session is over.
      const over = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || phaseRef.current === 'done' || over)) {
        const list = over ? p.allEntries : p.entries;
        const sig = `${over ? 'end' : 'lobby'}:${avatarsRef.current}:${list.map((e) => e.id).join(',')}`;
        if (sig !== rosterSigRef.current && phaseRef.current !== 'done') {
          rosterSigRef.current = sig;
          seedKids(list);
        }
      }

      advance(now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
  }, []);

  const cw = props.currentWinner;

  return (
    <div className="trick-or-treat-game">
      <div className="trick-or-treat-canvas-host">
        <canvas
          ref={canvasRef}
          width={TOT.CANVAS_W}
          height={TOT.CANVAS_H}
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
        headline={cw?.isChampion ? '🏆 FIRST TREAT OF THE NIGHT 🏆' : '🍬 A TREAT IN THE BAG'}
        finalsHeadline={cw?.isLastPlayer ? '🎃 LAST ONE ON THE PORCH' : '🏆 FIRST TREAT OF THE NIGHT 🏆'}
        nextLabel="🔔 Next Doorbell"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
