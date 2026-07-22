import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import { useReplayRecorder } from '../../../hooks/useReplayRecorder';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  SI,
  speedFactor,
  layoutCombatants,
  layoutHorde,
  baseExtent,
  pickVictim,
  type Variant,
  type Combatant,
  type Shot,
  type Fx,
  type HordeCell,
  type SpaceFrame,
} from './invadersEngine';
import { paintWorld } from './invadersDraw';
import { useSpaceSettings } from './spaceSettingsStore';
import './SpaceGame.css';

interface WinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  isLastPlayer?: boolean;
}

interface Props {
  variant: Variant;
  theme: WinnerTheme;
  headline: string;
  finalsHeadline: string;
  nextLabel: string;
  entries: Entry[];
  allEntries: Entry[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: WinnerDisplay | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

type RaceState = 'ready' | 'reveal' | 'fighting' | 'finished';

export function SpaceGame({
  variant,
  theme,
  headline,
  finalsHeadline,
  nextLabel,
  entries,
  allEntries,
  winOrder,
  onWinner,
  onRaceComplete,
  onShowFinalStandings,
  isRacing,
  currentWinner,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [raceState, setRaceState] = useState<RaceState>('ready');
  const [replayActive, setReplayActive] = useState(false);

  const combatantsRef = useRef<Combatant[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  const fxRef = useRef<Fx[]>([]);
  const hordeRef = useRef<HordeCell[]>([]);
  const marchExtentRef = useRef<{ min: number; max: number }>({ min: 0, max: 0 });

  const cannonXRef = useRef(SI.CANVAS_W / 2);
  const marchDXRef = useRef(0);
  const marchDYRef = useRef(0);
  const marchDirRef = useRef<1 | -1>(1);

  const victimIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const roundStartRef = useRef(0);
  const revealStartRef = useRef(0);
  const lastFireRef = useRef(0);
  const lastBackfireRef = useRef(0);
  const pendingKillRef = useRef<Combatant | null>(null);
  const deathUntilRef = useRef(0);
  const replayVictimRef = useRef<{ id: number } | null>(null);
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());

  const { record, clear, start, stop, getCurrentFrame } = useReplayRecorder<SpaceFrame>({
    maxFrames: 360,
    msPerFrame: 16,
    playbackSpeed: 0.45,
  });

  // Keep the latest settings readable inside the imperative game loop.
  const settings = useSpaceSettings();
  const speedRef = useRef(settings.speed);
  const suddenRef = useRef(settings.suddenDeath);
  const backfireRef = useRef(settings.invadersShootBack);
  const shieldsRef = useRef(settings.defenderShields);
  useEffect(() => {
    speedRef.current = settings.speed;
    suddenRef.current = settings.suddenDeath;
    backfireRef.current = settings.invadersShootBack;
    shieldsRef.current = settings.defenderShields;
  }, [settings]);

  // ---- Image preload ----------------------------------------------------
  const ensureImages = () => {
    for (const entry of entries) {
      const url = getPreferredEntryImage(entry);
      if (url && !imgCacheRef.current.has(entry.id)) {
        const im = new Image();
        im.src = url;
        imgCacheRef.current.set(entry.id, im);
      }
    }
  };

  const hasImage = (id: number) => imgCacheRef.current.has(id);

  // ---- Build a paint/record snapshot from live refs ---------------------
  const snapshot = (): SpaceFrame => ({
    combatants: combatantsRef.current.map((c) => ({
      id: c.id,
      name: c.entry.name,
      x: c.x,
      y: c.y,
      color: c.color,
      alive: c.alive,
      hasImage: hasImage(c.id),
    })),
    shots: shotsRef.current.map((s) => ({ x: s.x, y: s.y, color: s.color, kind: s.kind })),
    fx: fxRef.current.map((f) => ({ ...f })),
    cannonX: cannonXRef.current,
    horde: hordeRef.current.map((h) => ({
      x: h.baseX + marchDXRef.current,
      y: h.baseY + marchDYRef.current,
    })),
  });

  // ---- Round initialization ---------------------------------------------
  const initRound = () => {
    ensureImages();
    combatantsRef.current = layoutCombatants(variant, entries, allEntries);
    shotsRef.current = [];
    fxRef.current = [];
    marchDXRef.current = 0;
    marchDYRef.current = 0;
    marchDirRef.current = 1;
    cannonXRef.current = SI.CANVAS_W / 2;
    lastFireRef.current = 0;
    lastBackfireRef.current = 0;
    pendingKillRef.current = null;

    if (variant === 'defenders') {
      hordeRef.current = layoutHorde();
      marchExtentRef.current = baseExtent(hordeRef.current.map((h) => h.baseX));
    } else {
      hordeRef.current = [];
      marchExtentRef.current = baseExtent(combatantsRef.current.map((c) => c.baseX));
    }

    const victim = pickVictim(entries);
    victimIdRef.current = victim.id;
  };

  // ---- Start a round when the parent requests racing --------------------
  useEffect(() => {
    if (!isRacing) return;
    if (raceState === 'reveal' || raceState === 'fighting') return;
    if (entries.length < 2) return; // App auto-declares a lone survivor
    initRound();
    clear();
    revealStartRef.current = Date.now();
    setReplayActive(false);
    setRaceState('reveal');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the isRacing/raceState transition only
  }, [isRacing, raceState]);

  // ---- Static idle render -----------------------------------------------
  useEffect(() => {
    if (raceState !== 'ready') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (entries.length >= 1) {
      ensureImages();
      combatantsRef.current = layoutCombatants(variant, entries, allEntries);
      marchDXRef.current = 0;
      marchDYRef.current = 0;
      if (variant === 'defenders') hordeRef.current = layoutHorde();
      else hordeRef.current = [];
    } else {
      combatantsRef.current = [];
      hordeRef.current = [];
    }
    cannonXRef.current = SI.CANVAS_W / 2;
    shotsRef.current = [];
    fxRef.current = [];
    const paintIdle = () =>
      paintWorld(ctx, snapshot(), variant, imgCacheRef.current, shieldsRef.current);
    paintIdle();
    // Photos may not have decoded by this one-shot paint — repaint each as it
    // loads so the idle preview shows faces, not just fallback sprites.
    for (const [, im] of imgCacheRef.current) {
      if (!im.complete) im.addEventListener('load', paintIdle, { once: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw idle scene whenever roster/state changes
  }, [raceState, entries, variant]);

  // ---- Reveal countdown -------------------------------------------------
  useEffect(() => {
    if (raceState !== 'reveal') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const elapsed = now - revealStartRef.current;
      paintWorld(ctx, snapshot(), variant, imgCacheRef.current, shieldsRef.current);

      const remaining = SI.REVEAL_MS - elapsed;
      const count = Math.ceil(remaining / 700);
      const label = count <= 0 ? 'GO!' : count >= 3 ? 'READY' : String(count);
      ctx.save();
      ctx.font = `bold ${label === 'GO!' ? 52 : 60}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.accent;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeText(label, SI.CANVAS_W / 2, SI.CANVAS_H / 2);
      ctx.fillText(label, SI.CANVAS_W / 2, SI.CANVAS_H / 2);
      ctx.restore();

      if (elapsed >= SI.REVEAL_MS) {
        roundStartRef.current = Date.now();
        lastFrameTimeRef.current = Date.now();
        lastFireRef.current = Date.now();
        setRaceState('fighting');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countdown loop keyed on raceState
  }, [raceState]);

  // ---- Main firing loop -------------------------------------------------
  useEffect(() => {
    if (raceState !== 'fighting') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const spawnExplosion = (x: number, y: number, color: string) => {
      fxRef.current.push({ x, y, life: 0.6, maxLife: 0.6, radius: 6, growth: 70, color });
      fxRef.current.push({ x, y, life: 0.45, maxLife: 0.45, radius: 2, growth: 130, color: '#ffd23a' });
    };

    const victimHit = (shot: Shot, victim: Combatant): boolean =>
      Math.abs(shot.x - victim.x) < SI.HIT_TOL_X &&
      Math.abs(shot.y - victim.y) < SI.SPRITE * 0.5 + 6;

    const loop = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;
      const sf = speedFactor(speedRef.current);
      const sudden = suddenRef.current;
      const elapsed = now - roundStartRef.current;

      // March the moving group (invaders: participants; defenders: horde).
      const ext = marchExtentRef.current;
      marchDXRef.current += marchDirRef.current * SI.MARCH_VX * sf * dt;
      if (sudden) marchDYRef.current += SI.DESCENT_VY * sf * dt * 6;
      if (ext.max + marchDXRef.current > SI.CANVAS_W - SI.MARGIN) {
        marchDirRef.current = -1;
        marchDYRef.current += SI.MARCH_STEP;
      } else if (ext.min + marchDXRef.current < SI.MARGIN) {
        marchDirRef.current = 1;
        marchDYRef.current += SI.MARCH_STEP;
      }

      // Apply the offset to whichever group marches.
      if (variant === 'invaders') {
        for (const c of combatantsRef.current) {
          c.x = c.baseX + marchDXRef.current;
          c.y = c.baseY + marchDYRef.current;
        }
      }
      // (Defenders participants stay put at their base positions.)

      const victim = combatantsRef.current.find(
        (c) => c.id === victimIdRef.current && c.alive
      );

      // ---- Threat fires at the victim (while no kill is pending) ----------
      if (victim && !pendingKillRef.current) {
        const interval = (SI.FIRE_INTERVAL_MS / sf) * (sudden ? 0.5 : 1);

        if (variant === 'invaders') {
          // Cannon slides toward the victim's column, then fires straight up.
          const dx = victim.x - cannonXRef.current;
          const step = SI.CANNON_SPEED * sf * dt;
          cannonXRef.current += clamp(dx, -step, step);
          if (now - lastFireRef.current > interval) {
            lastFireRef.current = now;
            shotsRef.current.push({
              x: cannonXRef.current,
              y: SI.CANNON_Y - 20,
              vx: 0,
              vy: -SI.SHOT_SPEED * sf,
              color: '#8dffb0',
              kind: 'laser',
              live: true,
            });
          }
          // Cosmetic return fire from random living aliens.
          if (backfireRef.current && now - lastBackfireRef.current > 520 / sf) {
            lastBackfireRef.current = now;
            const alive = combatantsRef.current.filter((c) => c.alive);
            if (alive.length > 0) {
              const shooter = alive[Math.floor(Math.random() * alive.length)];
              shotsRef.current.push({
                x: shooter.x,
                y: shooter.y + 18,
                vx: 0,
                vy: SI.BOMB_SPEED * 0.8 * sf,
                color: shooter.color,
                kind: 'bomb',
                live: false,
              });
            }
          }
        } else {
          // Defenders: a bomb drops from the horde cell above the victim and
          // homes gently onto the victim's column.
          if (now - lastFireRef.current > interval) {
            lastFireRef.current = now;
            let src: { x: number; y: number } = { x: victim.x, y: SI.HORDE_TOP_Y };
            let best = Infinity;
            for (const h of hordeRef.current) {
              const hx = h.baseX + marchDXRef.current;
              const hy = h.baseY + marchDYRef.current;
              const d = Math.abs(hx - victim.x);
              if (d < best) {
                best = d;
                src = { x: hx, y: hy };
              }
            }
            const homing = clamp((victim.x - src.x) * 0.8, -70, 70);
            shotsRef.current.push({
              x: src.x,
              y: src.y + 16,
              vx: homing,
              vy: SI.BOMB_SPEED * sf,
              color: '#ff5a6a',
              kind: 'bomb',
              live: true,
            });
          }
        }
      }

      // ---- Advance shots + resolve the fatal hit --------------------------
      const liveShots: Shot[] = [];
      for (const s of shotsRef.current) {
        // The fatal shot homes onto the victim's column so the kill lands
        // quickly and reads as targeted (the draw already committed the fair,
        // uniform-random pick). Cosmetic shots (live: false) fly straight.
        if (s.live && victim) {
          s.vx = clamp((victim.x - s.x) * 4, -150, 150);
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        let consumed = false;
        if (s.live && victim && victimHit(s, victim)) {
          victim.alive = false;
          spawnExplosion(victim.x, victim.y, victim.color);
          replayVictimRef.current = { id: victim.id };
          pendingKillRef.current = victim;
          deathUntilRef.current = now + SI.DEATH_MS;
          consumed = true;
        }
        if (s.y < -20 || s.y > SI.CANVAS_H + 20) consumed = true;
        if (!consumed) liveShots.push(s);
      }
      shotsRef.current = liveShots;

      // Hard backstop: force the kill if the round drags on.
      if (victim && !pendingKillRef.current && elapsed > SI.FORCED_END_MS) {
        victim.alive = false;
        spawnExplosion(victim.x, victim.y, victim.color);
        replayVictimRef.current = { id: victim.id };
        pendingKillRef.current = victim;
        deathUntilRef.current = now + SI.DEATH_MS;
      }

      // FX decay.
      const liveFx: Fx[] = [];
      for (const fx of fxRef.current) {
        fx.life -= dt;
        fx.radius += fx.growth * dt;
        if (fx.life > 0) liveFx.push(fx);
      }
      fxRef.current = liveFx;

      const frame = snapshot();
      paintWorld(ctx, frame, variant, imgCacheRef.current, shieldsRef.current);
      drawStandingsStrip(ctx);
      record(frame);

      // Commit the elimination once the explosion has played.
      if (pendingKillRef.current && now >= deathUntilRef.current) {
        const dead = pendingKillRef.current;
        pendingKillRef.current = null;
        setRaceState('finished');
        onWinner(dead.entry);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const drawStandingsStrip = (c2d: CanvasRenderingContext2D) => {
      const out = allEntries
        .filter((e) => winOrder.has(e.id))
        .sort((a, b) => (winOrder.get(a.id) ?? 0) - (winOrder.get(b.id) ?? 0));
      if (out.length === 0) return;
      const y = 14;
      let x = 14;
      c2d.save();
      c2d.font = 'bold 10px system-ui, sans-serif';
      c2d.textAlign = 'left';
      c2d.textBaseline = 'middle';
      for (const e of out) {
        c2d.fillStyle = 'rgba(255,255,255,0.8)';
        const label = e.name.length > 8 ? e.name.slice(0, 7) + '…' : e.name;
        c2d.fillText(`💥 ${label}`, x, y);
        x += c2d.measureText(`💥 ${label}`).width + 14;
        if (x > SI.CANVAS_W - 40) break;
      }
      c2d.restore();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvas game loop: keyed on raceState; reads live refs/props by closure
  }, [raceState]);

  // ---- Slow-mo replay ---------------------------------------------------
  useEffect(() => {
    if (!replayActive) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    start(0.55);
    let raf = 0;
    const begin = performance.now();
    const loop = () => {
      const frame = getCurrentFrame(performance.now());
      if (frame) {
        const zoom = lerp(1, 2.1, easeInOut(clamp((performance.now() - begin) / 1100, 0, 1)));
        const victim = replayVictimRef.current
          ? frame.combatants.find((c) => c.id === replayVictimRef.current?.id)
          : undefined;
        const fx = victim?.x ?? SI.CANVAS_W / 2;
        const fy = victim?.y ?? SI.CANVAS_H / 2;
        ctx.save();
        ctx.translate(SI.CANVAS_W / 2, SI.CANVAS_H / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-fx, -fy);
        paintWorld(ctx, frame, variant, imgCacheRef.current, shieldsRef.current);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 18, SI.CANVAS_W, 30);
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀◀ INSTANT REPLAY', SI.CANVAS_W / 2, 33);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay loop keyed on replayActive
  }, [replayActive]);

  const details = currentWinner
    ? variant === 'invaders'
      ? <>Blasted out of the sky!</>
      : <>Base overrun by the invaders!</>
    : undefined;

  return (
    <div className="space-game">
      <div className="space-canvas-host">
        <canvas ref={canvasRef} width={SI.CANVAS_W} height={SI.CANVAS_H} className="game-canvas" />
      </div>

      <WinnerDialog
        theme={theme}
        show={!!currentWinner && !isRacing}
        isFinals={currentWinner?.isLastPlayer ?? entries.length === 0}
        winner={{
          name: currentWinner?.name ?? '',
          imageDataUrl: currentWinner?.imageDataUrl,
          allImages: currentWinner?.allImages,
        }}
        headline={headline}
        finalsHeadline={finalsHeadline}
        nextLabel={nextLabel}
        detailsNode={details}
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
        onReplayStart={() => setReplayActive(true)}
      />
    </div>
  );
}
