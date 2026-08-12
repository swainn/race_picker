import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  DL,
  DUEL_MOVES,
  pickDuelists,
  type DuelFighter,
  type DuelMoveId,
  type DuelProjectile,
  type DuelFx,
} from './duelEngine';
import {
  drawStage,
  drawCrowd,
  drawFighter,
  drawDuelProjectile,
  drawDuelFx,
  drawHealthBars,
  drawAnnounce,
  drawVsSplash,
} from './duelFighter';
import { useDuelSettings, duelSpeedFactor } from './duelSettingsStore';
import * as audio from './duelAudio';
import './DuelGame.css';

export interface DuelWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  isLastPlayer?: boolean;
  beatenBy?: string;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  winOrder: Map<number, number>;
  onWinner: (loser: Entry, winnerName: string) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: DuelWinnerDisplay | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const HIT_WORDS = ['POW!', 'WHAM!', 'BAM!', 'KAPOW!', 'BOOM!'];

type Phase = 'ready' | 'intro' | 'announce' | 'fight' | 'ko' | 'finished';

export function DuelGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest props for the persistent loop to read.
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = useDuelSettings();
  useEffect(() => {
    audio.setDuelMuted(!settings.sound);
  }, [settings.sound]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;

  const phaseRef = useRef<Phase>('ready');
  const f1Ref = useRef<DuelFighter | null>(null);
  const f2Ref = useRef<DuelFighter | null>(null);
  const projRef = useRef<DuelProjectile[]>([]);
  const fxRef = useRef<DuelFx[]>([]);
  const crowdRef = useRef<{ color: string; name: string }[]>([]);
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());

  const introUntilRef = useRef(0);
  const announceUntilRef = useRef(0);
  const fightStartRef = useRef(0);
  const koStartRef = useRef(0);
  const koUntilRef = useRef(0);
  const roundEndAtRef = useRef(0);
  const lastFrameRef = useRef(0);
  const loserRef = useRef<DuelFighter | null>(null);
  const winnerRef = useRef<DuelFighter | null>(null);

  const colorOf = (entry: Entry) => {
    const idx = propsRef.current.allEntries.findIndex((e) => e.id === entry.id);
    return generateColor(idx < 0 ? 0 : idx);
  };
  const imgOf = (entry: Entry): HTMLImageElement | null => imgCacheRef.current.get(entry.id) ?? null;

  const makeFighter = (entry: Entry, side: 1 | -1): DuelFighter => {
    const url = getPreferredEntryImage(entry);
    if (url && !imgCacheRef.current.has(entry.id)) {
      const im = new Image();
      im.src = url;
      imgCacheRef.current.set(entry.id, im);
    }
    return {
      entry,
      color: colorOf(entry),
      side,
      facing: side === 1 ? 1 : -1,
      x: side === 1 ? DL.P1_START : DL.P2_START,
      air: 0,
      vy: 0,
      hp: DL.MAX_HP,
      state: 'idle',
      stateUntil: 0,
      currentMove: null,
      movePhase: null,
      movePhaseUntil: 0,
      cooldowns: { punch: 0, kick: 0, hadoken: 0, shoryuken: 0 },
      nextDecisionAt: 0,
      blockUntil: 0,
      hitReg: false,
    };
  };

  const startDuel = (now: number) => {
    const p = propsRef.current;
    audio.resumeDuelAudio();
    const [a, b] = pickDuelists(p.entries);
    f1Ref.current = makeFighter(a, 1);
    f2Ref.current = makeFighter(b, -1);
    projRef.current = [];
    fxRef.current = [];
    loserRef.current = null;
    winnerRef.current = null;
    crowdRef.current = p.entries
      .filter((e) => e.id !== a.id && e.id !== b.id)
      .map((e) => ({ color: colorOf(e), name: e.name }));
    introUntilRef.current = now + DL.INTRO_MS;
    phaseRef.current = 'intro';
    audio.playBell();
  };

  // ---- Combat helpers ---------------------------------------------------
  const ready = (f: DuelFighter, m: DuelMoveId, now: number) => f.cooldowns[m] <= now;

  const startMove = (f: DuelFighter, m: DuelMoveId, opp: DuelFighter, now: number) => {
    f.facing = opp.x >= f.x ? 1 : -1;
    f.currentMove = m;
    f.movePhase = 'windup';
    f.movePhaseUntil = now + DUEL_MOVES[m].windupMs;
    f.state = 'attack';
    f.hitReg = false;
    if (DUEL_MOVES[m].callout) {
      fxRef.current.push({ x: f.x, y: DL.GROUND_Y - 78, life: 0.8, maxLife: 0.8, radius: 0, growth: 0, color: f.color, kind: 'spark', text: DUEL_MOVES[m].callout });
      if (m === 'hadoken') audio.playFireball();
    }
  };

  const startJump = (f: DuelFighter) => {
    if (f.air > 0) return;
    f.vy = DL.JUMP_VY;
    f.state = 'jump';
  };

  const decide = (self: DuelFighter, opp: DuelFighter, now: number) => {
    if (self.state === 'hurt' || self.state === 'attack' || self.air > 2) return;
    self.facing = opp.x >= self.x ? 1 : -1;
    const dist = Math.abs(opp.x - self.x);

    // React to an incoming attack: block or hop (kept modest so fights stay decisive).
    if (opp.currentMove && opp.movePhase === 'windup' && dist < DUEL_MOVES.kick.reach + 26) {
      const r = Math.random();
      if (r < 0.24) { self.state = 'block'; self.stateUntil = now + 260; return; }
      if (r < 0.34) { startJump(self); return; }
    }

    if (dist > DUEL_MOVES.kick.reach + 8) {
      if (dist > 150 && ready(self, 'hadoken', now) && Math.random() < 0.4) {
        startMove(self, 'hadoken', opp, now);
        return;
      }
      if (Math.random() < 0.05) { startJump(self); return; }
      self.state = 'walk';
      return;
    }

    // In range → attack.
    if (opp.air > 24 && ready(self, 'shoryuken', now) && Math.random() < 0.7) {
      startMove(self, 'shoryuken', opp, now);
      return;
    }
    const r = Math.random();
    if (r < 0.15 && ready(self, 'shoryuken', now)) startMove(self, 'shoryuken', opp, now);
    else if (r < 0.55) startMove(self, 'kick', opp, now);
    else startMove(self, 'punch', opp, now);
  };

  const spawnSpark = (x: number, y: number, color: string, word?: string) => {
    fxRef.current.push({ x, y, life: 0.3, maxLife: 0.3, radius: 8, growth: 70, color, kind: 'spark' });
    if (word) fxRef.current.push({ x, y: y - 14, life: 0.5, maxLife: 0.5, radius: 0, growth: 0, color: '#ffd23a', kind: 'spark', text: word });
  };

  const applyDamage = (a: DuelFighter, d: DuelFighter, moveId: DuelMoveId, now: number) => {
    const m = DUEL_MOVES[moveId];
    const blocking = d.state === 'block' && Math.sign(a.x - d.x) === d.facing;
    d.currentMove = null;
    d.movePhase = null;
    if (blocking) {
      d.hp = Math.max(0, d.hp - (m.chip ?? 0));
      d.x = clamp(d.x + a.facing * 10, DL.STAGE_L, DL.STAGE_R);
      fxRef.current.push({ x: d.x + d.facing * 12, y: DL.GROUND_Y - 40, life: 0.28, maxLife: 0.28, radius: 10, growth: 40, color: '#9cd6ff', kind: 'block' });
      audio.playBlock();
      return;
    }
    d.hp = Math.max(0, d.hp - m.dmg);
    d.state = 'hurt';
    d.stateUntil = now + DL.HITSTUN_MS;
    d.x = clamp(d.x + a.facing * m.knockback * 0.3, DL.STAGE_L, DL.STAGE_R);
    if (m.launch) { d.vy = DL.JUMP_VY * 0.85; d.air = Math.max(d.air, 1); }
    spawnSpark(d.x + d.facing * 10, DL.GROUND_Y - 42, '#fff2a8', HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]);
    audio.playHit();
  };

  const stepMove = (f: DuelFighter, opp: DuelFighter, now: number) => {
    if (!f.currentMove) return;
    const m = DUEL_MOVES[f.currentMove];
    if (now >= f.movePhaseUntil) {
      if (f.movePhase === 'windup') {
        if (m.isProjectile) {
          projRef.current.push({ x: f.x + f.facing * 22, y: DL.GROUND_Y - 40, vx: f.facing * DL.HADOKEN_SPEED, ownerSide: f.side, color: f.color, traveled: 0 });
          f.movePhase = 'recover';
          f.movePhaseUntil = now + m.recoverMs;
        } else {
          f.movePhase = 'active';
          f.movePhaseUntil = now + m.activeMs;
          f.hitReg = false;
          if (m.launch) { f.vy = DL.JUMP_VY * 0.6; f.air = Math.max(f.air, 1); audio.playPunch(); }
          else audio.playPunch();
        }
      } else if (f.movePhase === 'active') {
        f.movePhase = 'recover';
        f.movePhaseUntil = now + m.recoverMs;
      } else {
        f.cooldowns[f.currentMove] = now + m.cooldownMs;
        f.currentMove = null;
        f.movePhase = null;
        f.state = 'idle';
        return;
      }
    }
    // Melee hit window.
    if (f.movePhase === 'active' && !m.isProjectile && !f.hitReg) {
      const dist = Math.abs(opp.x - f.x);
      if (dist <= m.reach + DL.FIGHTER_HALF_W && (opp.x >= f.x ? 1 : -1) === f.facing) {
        f.hitReg = true;
        applyDamage(f, opp, f.currentMove, now);
      }
    }
  };

  const stepPhysics = (f: DuelFighter, opp: DuelFighter, dt: number) => {
    // Jump arc.
    if (f.air > 0 || f.vy !== 0) {
      f.air += f.vy * dt;
      f.vy -= DL.GRAVITY * dt;
      if (f.air <= 0) { f.air = 0; f.vy = 0; if (f.state === 'jump') f.state = 'idle'; }
      if (f.state === 'jump') f.x = clamp(f.x + f.facing * DL.WALK_SPEED * 0.7 * dt, DL.STAGE_L, DL.STAGE_R);
    }
    // Ground walk toward the opponent (stop at striking distance, don't overlap).
    if (f.state === 'walk') {
      const dist = Math.abs(opp.x - f.x);
      if (dist > DUEL_MOVES.kick.reach - 4) {
        f.x = clamp(f.x + f.facing * DL.WALK_SPEED * dt, DL.STAGE_L, DL.STAGE_R);
      } else {
        f.state = 'idle';
      }
    }
    // Keep bodies from overlapping.
    if (Math.abs(f.x - opp.x) < 28) {
      const push = (28 - Math.abs(f.x - opp.x)) / 2;
      f.x = clamp(f.x - Math.sign(opp.x - f.x) * push, DL.STAGE_L, DL.STAGE_R);
    }
    // Recover from hurt/block.
    if ((f.state === 'hurt' || f.state === 'block') && Date.now() >= f.stateUntil) f.state = 'idle';
  };

  const updateFight = (now: number, dt: number) => {
    const f1 = f1Ref.current!;
    const f2 = f2Ref.current!;
    for (const [self, opp] of [[f1, f2], [f2, f1]] as const) {
      if (now >= self.nextDecisionAt) {
        decide(self, opp, now);
        self.nextDecisionAt = now + 110 + Math.random() * 130;
      }
    }
    stepMove(f1, f2, now);
    stepMove(f2, f1, now);
    stepPhysics(f1, f2, dt);
    stepPhysics(f2, f1, dt);

    // Projectiles.
    const live: DuelProjectile[] = [];
    for (const pr of projRef.current) {
      pr.x += pr.vx * dt;
      pr.traveled += Math.abs(pr.vx) * dt;
      const target = pr.ownerSide === 1 ? f2 : f1;
      let consumed = false;
      if (Math.abs(target.x - pr.x) < 20 && target.air < 40) {
        const blocking = target.state === 'block' && Math.sign(pr.vx) === -target.facing;
        if (blocking) {
          target.hp = Math.max(0, target.hp - (DUEL_MOVES.hadoken.chip ?? 0));
          fxRef.current.push({ x: target.x, y: DL.GROUND_Y - 40, life: 0.28, maxLife: 0.28, radius: 10, growth: 40, color: '#9cd6ff', kind: 'block' });
          audio.playBlock();
        } else {
          target.hp = Math.max(0, target.hp - DUEL_MOVES.hadoken.dmg);
          target.state = 'hurt';
          target.stateUntil = now + DL.HITSTUN_MS;
          target.currentMove = null;
          target.movePhase = null;
          spawnSpark(target.x, DL.GROUND_Y - 42, '#aee9ff');
          audio.playHit();
        }
        consumed = true;
      }
      if (!consumed && pr.traveled < DL.HADOKEN_RANGE && pr.x > -20 && pr.x < DL.CANVAS_W + 20) live.push(pr);
    }
    projRef.current = live;

    // KO / time-up.
    const timeUp = now - fightStartRef.current >= DL.ROUND_TIME_S * 1000;
    if (f1.hp <= 0 || f2.hp <= 0 || timeUp) {
      let loser: DuelFighter;
      if (f1.hp <= 0 && f2.hp <= 0) loser = Math.random() < 0.5 ? f1 : f2;
      else if (f1.hp <= 0) loser = f1;
      else if (f2.hp <= 0) loser = f2;
      else loser = f1.hp < f2.hp ? f1 : f2.hp < f1.hp ? f2 : Math.random() < 0.5 ? f1 : f2;
      const winner = loser === f1 ? f2 : f1;
      loser.state = 'ko';
      winner.state = 'win';
      winner.currentMove = null;
      winner.movePhase = null;
      loserRef.current = loser;
      winnerRef.current = winner;
      fxRef.current.push({ x: loser.x, y: DL.GROUND_Y - 40, life: 0.6, maxLife: 0.6, radius: 12, growth: 120, color: '#ff5a3c', kind: 'ring' });
      koStartRef.current = now;
      koUntilRef.current = now + DL.KO_MS;
      phaseRef.current = 'ko';
      audio.playKo();
    }
  };

  const decayFx = (dt: number) => {
    const live: DuelFx[] = [];
    for (const fx of fxRef.current) {
      fx.life -= dt;
      fx.radius += fx.growth * dt;
      if (fx.life > 0) live.push(fx);
    }
    fxRef.current = live;
  };

  // ---- Rendering --------------------------------------------------------
  const drawScene = (ctx: CanvasRenderingContext2D, now: number, withBars: boolean) => {
    drawStage(ctx);
    for (const pr of projRef.current) drawDuelProjectile(ctx, pr);
    const f1 = f1Ref.current;
    const f2 = f2Ref.current;
    if (f1 && f2) {
      // Draw the far fighter first for simple depth.
      const order = f1.x <= f2.x ? [f1, f2] : [f2, f1];
      for (const f of order) drawFighter(ctx, f, imgOf(f.entry), now);
    }
    for (const fx of fxRef.current) drawDuelFx(ctx, fx);
    drawCrowd(ctx, crowdRef.current, now);
    if (withBars && f1 && f2) {
      const timer = Math.max(0, DL.ROUND_TIME_S - (now - fightStartRef.current) / 1000);
      drawHealthBars(ctx, f1, f2, imgOf(f1.entry), imgOf(f2.entry), timer);
    }
  };

  // ---- Persistent game loop --------------------------------------------
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      const rawDt = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;
      const dt = rawDt * duelSpeedFactor(speedRef.current);
      const p = propsRef.current;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(loop); return; }

      const canStart =
        (phaseRef.current === 'ready' || phaseRef.current === 'finished') &&
        p.isRacing && p.entries.length >= 2 && !p.currentWinner;
      if (canStart) startDuel(now);

      switch (phaseRef.current) {
        case 'ready': {
          drawStage(ctx);
          crowdRef.current = p.entries.map((e) => ({ color: colorOf(e), name: e.name }));
          drawCrowd(ctx, crowdRef.current, now);
          drawAnnounce(ctx, 'READY?', '#ffd23a', 0.8);
          break;
        }
        case 'intro': {
          drawScene(ctx, now, false);
          drawVsSplash(ctx, f1Ref.current!, f2Ref.current!, imgOf(f1Ref.current!.entry), imgOf(f2Ref.current!.entry));
          if (now >= introUntilRef.current) {
            phaseRef.current = 'announce';
            announceUntilRef.current = now + DL.ANNOUNCE_MS;
          }
          break;
        }
        case 'announce': {
          drawScene(ctx, now, true);
          const half = announceUntilRef.current - DL.ANNOUNCE_MS / 2;
          drawAnnounce(ctx, now < half ? 'ROUND 1' : 'FIGHT!', now < half ? '#fff' : '#ff5a3c');
          if (now >= announceUntilRef.current) {
            phaseRef.current = 'fight';
            fightStartRef.current = now;
            roundEndAtRef.current = now + DL.ROUND_TIME_S * 1000;
            audio.playBell();
          }
          break;
        }
        case 'fight': {
          updateFight(now, dt);
          decayFx(dt);
          drawScene(ctx, now, true);
          // "FIGHT!" lingers briefly.
          if (now - fightStartRef.current < 500) drawAnnounce(ctx, 'FIGHT!', '#ff5a3c');
          break;
        }
        case 'ko': {
          // Physics keep resolving so the loser drops; no new decisions.
          stepPhysics(f1Ref.current!, f2Ref.current!, dt);
          stepPhysics(f2Ref.current!, f1Ref.current!, dt);
          decayFx(dt);
          drawScene(ctx, now, true);
          const winner = winnerRef.current!;
          if (now - koStartRef.current < 900) drawAnnounce(ctx, 'K.O.!', '#ff3b3b', 1.15);
          else drawAnnounce(ctx, `${winner.entry.name.toUpperCase()} WINS!`, winner.color, 0.72);
          if (now >= koUntilRef.current) {
            phaseRef.current = 'finished';
            audio.playFanfare();
            p.onWinner(loserRef.current!.entry, winnerRef.current!.entry.name);
          }
          break;
        }
        case 'finished': {
          decayFx(dt);
          drawScene(ctx, now, true);
          const winner = winnerRef.current;
          if (winner) drawAnnounce(ctx, `${winner.entry.name.toUpperCase()} WINS!`, winner.color, 0.72);
          break;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistent canvas loop; reads latest props/settings via refs
  }, []);

  const cw = props.currentWinner;
  const details =
    cw && !cw.isLastPlayer && cw.beatenBy ? (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3, gap: 1 }}>
        <span style={{ fontSize: '0.8em', opacity: 0.75, letterSpacing: '0.06em' }}>💥 DEFEATED BY</span>
        <span style={{ fontSize: '1.35em', fontWeight: 800 }}>🥊 {cw.beatenBy}</span>
      </span>
    ) : undefined;

  return (
    <div className="duel-game">
      <div className="duel-canvas-host">
        <canvas ref={canvasRef} width={DL.CANVAS_W} height={DL.CANVAS_H} className="game-canvas" />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={cw?.isLastPlayer ?? props.entries.length === 0}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline="K.O.!"
        finalsHeadline="🥊 CHAMPION 🥊"
        nextLabel="🥊 Next Duel"
        detailsNode={details}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
