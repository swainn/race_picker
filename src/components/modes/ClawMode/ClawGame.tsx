import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import { CLAW, easeInOut, layoutToys, pickChosen, type ToySpot } from './clawEngine';
import { drawAlienToy, drawClaw } from './clawToys';
import { useClawSettings, clawSpeedFactor } from './clawSettingsStore';
import * as audio from './clawAudio';
import './ClawGame.css';

export interface ClawWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** Never chosen — the toy still in the tank when everyone else is gone. */
  isLastPlayer?: boolean;
  /** The very first toy taken, so first place overall. */
  isChampion?: boolean;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (taken: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: ClawWinnerDisplay | null;
}

type Phase = 'ready' | 'scan' | 'descend' | 'grab' | 'lift' | 'travel' | 'drop' | 'done';

/** Phase lengths in ms, before the speed multiplier. */
const T = {
  scanLeg: 900,   // one pass across the tank
  settle: 700,    // easing onto the chosen toy
  descend: 1150,
  grab: 650,
  lift: 1150,
  travel: 1400,
  drop: 900,
  done: 1100,
} as const;

/** Passes across the tank before the claw commits to its target. */
const SCAN_LEGS = 3;

/** The toy art is authored small; this is its size inside the cabinet. */
const TOY_SCALE = 1.35;

interface Toy {
  entry: Entry;
  color: string;
  initials: string;
  spot: ToySpot;
  phase: number;
  taken: boolean;
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

export function ClawGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useClawSettings();
  useEffect(() => { audio.setClawMuted(!settings.sound); }, [settings.sound]);
  useEffect(() => { audio.setClawMusicMuted(!settings.music); }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  useEffect(() => () => {
    audio.stopMotor();
    audio.stopTrack();
  }, []);

  const phaseRef = useRef<Phase>('ready');
  const phaseStartRef = useRef(0);
  const phaseUntilRef = useRef(0);
  const toysRef = useRef<Toy[]>([]);
  const rosterSigRef = useRef('');
  const chosenRef = useRef<number>(-1);
  const clawXRef = useRef(CLAW.CANVAS_W / 2);
  const clawFromRef = useRef(CLAW.CANVAS_W / 2);
  const clawToRef = useRef(CLAW.CANVAS_W / 2);
  const clawYRef = useRef<number>(CLAW.REST_Y);
  const clawOpenRef = useRef(1);
  const legRef = useRef(0);
  /** True once the claw has stopped hunting and is easing onto its target. */
  const settlingRef = useRef(false);
  const declaredRef = useRef(false);
  const heldYRef = useRef(0);

  const dur = (ms: number) => ms * clawSpeedFactor(speedRef.current);

  const setPhase = (next: Phase, now: number, ms: number) => {
    phaseRef.current = next;
    phaseStartRef.current = now;
    phaseUntilRef.current = now + ms;
  };

  /** Fill the tank from the current entry list (also used between rounds). */
  const seedToys = (list: Entry[]) => {
    const initials = computeInitials(list);
    const spots = layoutToys(list.length);
    const all = propsRef.current.allEntries;
    toysRef.current = list.map((entry, i) => {
      const idx = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idx < 0 ? i : idx),
        initials: initials[i],
        spot: spots[i],
        phase: Math.random() * Math.PI * 2,
        taken: false,
      };
    });
  };

  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumeClawAudio();
    seedToys(p.entries);
    // Uniform pick first; everything the claw does after this is theatre.
    const chosen = pickChosen(p.entries);
    chosenRef.current = toysRef.current.findIndex((t) => t.entry.id === chosen.id);
    declaredRef.current = false;
    clawYRef.current = CLAW.REST_Y;
    clawOpenRef.current = 1;
    legRef.current = 0;
    settlingRef.current = false;
    clawFromRef.current = clawXRef.current;
    clawToRef.current = CLAW.RAIL_L + Math.random() * (CLAW.RAIL_R - CLAW.RAIL_L);
    audio.playCoin();
    audio.startTrack();
    audio.startMotor();
    setPhase('scan', now, dur(T.scanLeg));
  };

  // ---- Start / stop on the racing flag -----------------------------------
  useEffect(() => {
    if (props.isRacing) {
      if (props.entries.length >= 1) startRound(performance.now());
    } else {
      audio.stopMotor();
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

    const chosenToy = () => toysRef.current[chosenRef.current];

    const advance = (now: number) => {
      const phase = phaseRef.current;
      if (phase === 'ready' || phase === 'done') return;
      const span = phaseUntilRef.current - phaseStartRef.current;
      const t = span <= 0 ? 1 : (now - phaseStartRef.current) / span;

      switch (phase) {
        case 'scan': {
          clawXRef.current =
            clawFromRef.current + (clawToRef.current - clawFromRef.current) * easeInOut(t);
          if (now < phaseUntilRef.current) break;
          clawFromRef.current = clawXRef.current;

          if (settlingRef.current) {
            audio.stopMotor();
            audio.playAwe();
            setPhase('descend', now, dur(T.descend));
            break;
          }

          legRef.current++;
          if (legRef.current >= SCAN_LEGS) {
            // Commit: ease onto the toy that was chosen before any of this ran.
            settlingRef.current = true;
            clawToRef.current = chosenToy()?.spot.x ?? clawXRef.current;
            setPhase('scan', now, dur(T.settle));
          } else {
            // Another pass, ending somewhere new on the far side.
            const far = clawXRef.current < CLAW.CANVAS_W / 2 ? CLAW.RAIL_R : CLAW.RAIL_L;
            clawToRef.current = Math.max(
              CLAW.RAIL_L,
              Math.min(CLAW.RAIL_R, far + (Math.random() - 0.5) * 70)
            );
            setPhase('scan', now, dur(T.scanLeg));
          }
          break;
        }
        case 'descend': {
          const target = (chosenToy()?.spot.y ?? CLAW.FLOOR_Y) - 30 - CLAW.REST_Y;
          clawYRef.current = CLAW.REST_Y + easeInOut(t) * target;
          if (now >= phaseUntilRef.current) {
            audio.playClamp();
            setPhase('grab', now, dur(T.grab));
          }
          break;
        }
        case 'grab': {
          clawOpenRef.current = 1 - easeInOut(t);
          if (now >= phaseUntilRef.current) {
            audio.startMotor();
            setPhase('lift', now, dur(T.lift));
          }
          break;
        }
        case 'lift': {
          const start = (chosenToy()?.spot.y ?? CLAW.FLOOR_Y) - 30;
          clawYRef.current = start - easeInOut(t) * (start - CLAW.REST_Y);
          heldYRef.current = clawYRef.current + 30;
          if (now >= phaseUntilRef.current) {
            clawFromRef.current = clawXRef.current;
            clawToRef.current = CLAW.CHUTE_X;
            setPhase('travel', now, dur(T.travel));
          }
          break;
        }
        case 'travel': {
          clawXRef.current =
            clawFromRef.current + (clawToRef.current - clawFromRef.current) * easeInOut(t);
          heldYRef.current = clawYRef.current + 30;
          if (now >= phaseUntilRef.current) {
            audio.stopMotor();
            audio.playRelease();
            audio.playChute();
            setPhase('drop', now, dur(T.drop));
          }
          break;
        }
        case 'drop': {
          clawOpenRef.current = easeInOut(Math.min(1, t * 3));
          // The toy falls away down the chute.
          heldYRef.current = clawYRef.current + 30 + easeInOut(t) * 230;
          if (now >= phaseUntilRef.current) {
            const toy = chosenToy();
            if (toy) toy.taken = true;
            setPhase('done', now, dur(T.done));
            if (!declaredRef.current) {
              declaredRef.current = true;
              audio.playFanfare();
              if (toy) propsRef.current.onWinner(toy.entry);
            }
          }
          break;
        }
      }
    };

    // ---- Drawing ---------------------------------------------------------
    const drawCabinet = (now: number) => {
      // Room behind the cabinet
      const bg = ctx.createLinearGradient(0, 0, 0, CLAW.CANVAS_H);
      bg.addColorStop(0, '#241a3a');
      bg.addColorStop(1, '#140f22');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CLAW.CANVAS_W, CLAW.CANVAS_H);

      // Cabinet shell
      ctx.fillStyle = '#e8483c';
      ctx.beginPath();
      ctx.roundRect(14, 18, CLAW.CANVAS_W - 28, CLAW.CANVAS_H - 40, 16);
      ctx.fill();
      ctx.fillStyle = '#c3352c';
      ctx.beginPath();
      ctx.roundRect(14, CLAW.CANVAS_H - 132, CLAW.CANVAS_W - 28, 114, 16);
      ctx.fill();

      // Marquee
      ctx.fillStyle = '#1d1430';
      ctx.beginPath();
      ctx.roundRect(34, 26, CLAW.CANVAS_W - 68, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd23a';
      ctx.font = 'bold 21px "Arial Black", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('THE CLAW', CLAW.CANVAS_W / 2, 43);
      // Chase lights around the marquee
      for (let i = 0; i < 14; i++) {
        const lit = (i + Math.floor(now / 190)) % 3 !== 0;
        ctx.fillStyle = lit ? '#ffe98a' : 'rgba(255,233,138,0.25)';
        ctx.beginPath();
        ctx.arc(40 + i * ((CLAW.CANVAS_W - 80) / 13), 22, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tank interior — dark, so the toys read against it.
      const tankH = CLAW.FLOOR_Y + 34 - CLAW.TANK_TOP;
      const inside = ctx.createLinearGradient(0, CLAW.TANK_TOP, 0, CLAW.FLOOR_Y + 34);
      inside.addColorStop(0, '#171033');
      inside.addColorStop(1, '#241a44');
      ctx.fillStyle = inside;
      ctx.beginPath();
      ctx.roundRect(CLAW.TANK_L, CLAW.TANK_TOP, CLAW.TANK_R - CLAW.TANK_L, tankH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,200,235,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tank floor
      ctx.fillStyle = '#2f2559';
      ctx.fillRect(CLAW.TANK_L + 3, CLAW.FLOOR_Y + 6, CLAW.TANK_R - CLAW.TANK_L - 6, 28);

      // Rail the claw rides
      ctx.fillStyle = '#9aa0ad';
      ctx.fillRect(CLAW.RAIL_L - 12, CLAW.RAIL_Y - 6, CLAW.RAIL_R - CLAW.RAIL_L + 24, 5);
    };

    const drawChute = () => {
      ctx.save();
      // The mouth: a dark hole cut into the tank floor.
      ctx.fillStyle = '#0b0818';
      ctx.beginPath();
      ctx.ellipse(CLAW.CHUTE_X, CLAW.CHUTE_TOP, CLAW.CHUTE_HALF, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(CLAW.CHUTE_X - CLAW.CHUTE_HALF, CLAW.CHUTE_TOP, CLAW.CHUTE_HALF * 2, 34);
      ctx.strokeStyle = 'rgba(160,200,235,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(CLAW.CHUTE_X, CLAW.CHUTE_TOP, CLAW.CHUTE_HALF, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    /** The collection tray on the cabinet front, below the glass. */
    const drawTray = () => {
      ctx.save();
      ctx.fillStyle = '#17112a';
      ctx.beginPath();
      ctx.roundRect(CLAW.CHUTE_X - 42, CLAW.CANVAS_H - 112, 84, 60, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRIZE', CLAW.CHUTE_X, CLAW.CANVAS_H - 60);
      ctx.restore();
    };

    const drawGlassSheen = () => {
      ctx.save();
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(CLAW.TANK_L + 16, CLAW.TANK_TOP);
      ctx.lineTo(CLAW.TANK_L + 92, CLAW.TANK_TOP);
      ctx.lineTo(CLAW.TANK_L + 30, CLAW.FLOOR_Y + 30);
      ctx.lineTo(CLAW.TANK_L + 6, CLAW.FLOOR_Y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const draw = (now: number) => {
      const phase = phaseRef.current;
      drawCabinet(now);
      drawChute();
      drawTray();

      const toys = toysRef.current;
      const chosen = chosenRef.current;
      const held = phase === 'grab' || phase === 'lift' || phase === 'travel' || phase === 'drop';

      // Back rows first so the pile overlaps correctly.
      const order = toys.map((_, i) => i).sort((a, b) => toys[a].spot.y - toys[b].spot.y);
      for (const i of order) {
        const toy = toys[i];
        const isChosen = i === chosen;
        if (isChosen && held) continue; // drawn with the claw instead

        // Awe rises as the claw closes in overhead.
        const dx = Math.abs(clawXRef.current - toy.spot.x);
        const near = Math.max(0, 1 - dx / 90);
        const descending = phase === 'descend' || phase === 'grab';
        const awe = toy.taken ? 0 : Math.min(1, near * (descending ? 1 : 0.75));

        ctx.save();
        ctx.translate(toy.spot.x, toy.spot.y);
        ctx.scale(toy.spot.scale * TOY_SCALE, toy.spot.scale * TOY_SCALE);
        drawAlienToy(ctx, toy.color, toy.initials, {
          awe,
          phase: toy.phase + now / 520,
          held: false,
          ghost: toy.taken,
        });
        ctx.restore();
      }

      // The claw, and whatever it has hold of
      if (phase !== 'ready') {
        const toy = toys[chosen];
        if (toy && held) {
          ctx.save();
          ctx.translate(clawXRef.current, heldYRef.current);
          ctx.scale(toy.spot.scale * TOY_SCALE, toy.spot.scale * TOY_SCALE);
          drawAlienToy(ctx, toy.color, toy.initials, {
            awe: 1,
            phase: toy.phase,
            held: true,
          });
          ctx.restore();
        }
        drawClaw(ctx, clawXRef.current, CLAW.RAIL_Y, clawYRef.current, clawOpenRef.current);
      }

      drawGlassSheen();

      // Status line on the cabinet front
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const caption =
        phase === 'ready' ? (toys.length ? 'INSERT COIN' : 'THE CLAW AWAITS')
          : phase === 'scan' ? 'THE CLAW IS CHOOSING…'
            : phase === 'descend' || phase === 'grab' ? 'OOOOOOH…'
              : phase === 'lift' || phase === 'travel' ? 'I HAVE BEEN CHOSEN!'
                : 'FAREWELL, MY FRIENDS';
      ctx.fillText(caption, CLAW.CANVAS_W / 2, CLAW.CANVAS_H - 76);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      const p = propsRef.current;

      // Refill the tank whenever nothing is in play: before the first drop,
      // and again once the session is over.
      const over = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || phaseRef.current === 'done' || over)) {
        const list = over ? p.allEntries : p.entries;
        const sig = `${over ? 'end' : 'lobby'}:${list.map((e) => e.id).join(',')}`;
        if (sig !== rosterSigRef.current && phaseRef.current !== 'done') {
          rosterSigRef.current = sig;
          seedToys(list);
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
    <div className="claw-game">
      <div className="claw-canvas-host">
        <canvas ref={canvasRef} width={CLAW.CANVAS_W} height={CLAW.CANVAS_H} className="game-canvas" />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        // The last toy is not a champion here — it is the one the claw never
        // came for. Gold belongs to whoever was chosen first.
        isFinals={props.entries.length === 0}
        // Explicitly false, not undefined: WinnerDialog falls back to
        // `isFinals` for gold, which would crown the leftover toy.
        goldTreatment={cw?.isChampion ?? false}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={cw?.isChampion ? '🏆 THE CHOSEN ONE 🏆' : '🛸 THE CLAW HAS CHOSEN'}
        finalsHeadline={cw?.isLastPlayer ? '🕹 LEFT IN THE MACHINE' : '🏆 THE CHOSEN ONE 🏆'}
        nextLabel="🕹 Next Drop"
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
