import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { useReplayRecorder } from '../../../hooks/useReplayRecorder';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import { kungFuTheme } from '../themes';
import { KF, MOVES, MOVE_IDS, SPECIAL_IDS, MOVE_ICON, abilityLabel, type MoveId, type MoveDef } from './kungFuMoves';
import { decideIntent, type AiFighter, type Defense } from './kungFuAi';
import {
  drawBackground,
  drawPlatform,
  drawFighter,
  drawProjectile,
  drawFx,
  type FighterState,
  type FighterView,
  type FxView,
} from './kungFuFighter';
import { useKungFuSettings } from './kungFuSettingsStore';
import './KungFuGame.css';

interface KillerInfo {
  name: string;
  weapon: string;
  /** Ability emoji + short title-cased name for the elimination dialog. */
  icon?: string;
  ability?: string;
}

interface Props {
  entries: Entry[];
  allEntries: Entry[];
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onWinner: (winner: Entry, killerInfo?: KillerInfo) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: string | null;
  currentWinnerKillerInfo?: KillerInfo;
  currentWinnerIsLastPlayer?: boolean;
}

interface Fighter extends FighterView {
  id: number;
  entry: Entry;
  vx: number;
  vy: number;
  hp: number;
  stateUntil: number;
  movePhaseUntil: number;
  cooldowns: Record<MoveId, number>;
  hitSet: Set<number>;
  nextDecisionAt: number;
  targetId: number | null;
  desiredVx: number;
  desiredVy: number;
  lastHitByName?: string;
  lastHitByMove?: MoveId;
  /** Super meter + assigned signature special (overrides the optional base fields). */
  charge: number;
  signature: MoveId;
  /** "Get Over Here" follow-up strike: after the yank lands, a delayed launch. */
  hookStrikeAt?: number;
  hookedBy?: number;
  /** Cooldown gate before the next defensive maneuver (shield/jump/dodge). */
  defenseCdUntil: number;
}

interface Projectile {
  id: number;
  ownerId: number;
  ownerName: string;
  moveId: MoveId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  color: string;
  radius: number;
  range: number;
}

interface ImpactFx extends FxView {
  life: number;
  maxLife: number;
  growth: number;
}

interface FrameFighter extends FighterView {
  id: number;
  name: string;
}

interface KungFuFrame {
  platformR: number;
  fighters: FrameFighter[];
  projectiles: { x: number; y: number; color: string; radius: number }[];
  fx: FxView[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const HIT_WORDS = ['POW!', 'WHAM!', 'BAM!', 'BOFF!', 'KAPOW!'];

type RaceState = 'ready' | 'reveal' | 'fighting' | 'finished';

export function KungFuGame({
  entries,
  allEntries,
  eliminatedIds,
  winOrder,
  onWinner,
  onRaceComplete,
  onShowFinalStandings,
  isRacing,
  currentWinner,
  currentWinnerKillerInfo,
  currentWinnerIsLastPlayer,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [raceState, setRaceState] = useState<RaceState>('ready');
  const [replayActive, setReplayActive] = useState(false);

  const fightersRef = useRef<Fighter[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const fxRef = useRef<ImpactFx[]>([]);
  const platformRRef = useRef<number>(KF.PLATFORM_R_START);
  const roundStartRadiusRef = useRef<number>(KF.PLATFORM_R_START);
  const roundStartRef = useRef(0);
  const revealStartRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const pendingRingOutRef = useRef<Fighter | null>(null);
  const replayVictimRef = useRef<{ id: number } | null>(null);
  const nextProjIdRef = useRef(0);

  const { record, clear, start, stop, getCurrentFrame } = useReplayRecorder<KungFuFrame>({
    maxFrames: 360,
    msPerFrame: 16,
    playbackSpeed: 0.4,
  });

  // Keep the latest settings readable inside the game loop.
  const settings = useKungFuSettings();
  const shrinkRef = useRef(settings.shrinkPlatform);
  const specialsRef = useRef(settings.specialMoves);
  useEffect(() => {
    shrinkRef.current = settings.shrinkPlatform;
    specialsRef.current = settings.specialMoves;
  }, [settings.shrinkPlatform, settings.specialMoves]);

  // ---- Initialization ---------------------------------------------------
  // With shrink disabled the platform is always full size; with it enabled,
  // each elimination also tightens the starting radius for the next round.
  const roundStartRadius = () =>
    settings.shrinkPlatform
      ? clamp(
          KF.PLATFORM_R_START - eliminatedIds.length * KF.ROUND_SHRINK_STEP,
          KF.PLATFORM_R_MIN + 30,
          KF.PLATFORM_R_START
        )
      : KF.PLATFORM_R_START;

  const initFighters = () => {
    const n = entries.length;
    const ringRx = roundStartRadius() * 0.55;
    const ringRy = ringRx * KF.PLATFORM_SQUASH;
    fightersRef.current = entries.map((entry, i) => {
      const colorIdx = allEntries.findIndex((e) => e.id === entry.id);
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = KF.PLATFORM_CX + Math.cos(angle) * ringRx;
      const y = KF.PLATFORM_CY + Math.sin(angle) * ringRy;
      const facing: 1 | -1 = KF.PLATFORM_CX >= x ? 1 : -1;
      const cooldowns = Object.fromEntries(MOVE_IDS.map((m) => [m, 0])) as Record<MoveId, number>;
      // Each fighter gets a random signature special for the round. Start with a
      // partial meter so specials start flying early.
      const signature = SPECIAL_IDS[Math.floor(Math.random() * SPECIAL_IDS.length)];
      return {
        id: entry.id,
        entry,
        color: generateColor(colorIdx < 0 ? i : colorIdx),
        x,
        y,
        vx: 0,
        vy: 0,
        facing,
        state: 'idle' as FighterState,
        hp: 100,
        stateUntil: 0,
        currentMove: null,
        movePhase: null,
        movePhaseUntil: 0,
        cooldowns,
        hitSet: new Set<number>(),
        nextDecisionAt: 0,
        targetId: null,
        desiredVx: 0,
        desiredVy: 0,
        fallScale: 1,
        blocking: false,
        charge: KF.CHARGE_MAX * (0.3 + Math.random() * 0.4),
        signature,
        defenseCdUntil: 0,
        airProgress: 0,
        dashDx: 0,
        dashDy: 0,
      };
    });
    projectilesRef.current = [];
    fxRef.current = [];
    roundStartRadiusRef.current = roundStartRadius();
    platformRRef.current = roundStartRadiusRef.current;
  };

  // ---- Start a round when the parent requests racing --------------------
  useEffect(() => {
    if (!isRacing) return;
    if (raceState === 'reveal' || raceState === 'fighting') return;
    if (entries.length < 2) return; // App auto-declares a lone survivor
    initFighters();
    clear();
    revealStartRef.current = Date.now();
    setReplayActive(false);
    setRaceState('reveal');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the isRacing/raceState transition only
  }, [isRacing, raceState]);

  // ---- Static render while idle (ready): show the fighters on the pad ---
  useEffect(() => {
    if (raceState !== 'ready') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (entries.length >= 1) initFighters();
    else fightersRef.current = [];
    const now = performance.now();
    drawBackground(ctx, KF.CANVAS_W, KF.CANVAS_H);
    drawPlatform(ctx, KF.PLATFORM_CX, KF.PLATFORM_CY, platformRRef.current, 0);
    for (const f of [...fightersRef.current].sort((a, b) => a.y - b.y)) drawFighter(ctx, f, now);
    ctx.save();
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    for (const f of fightersRef.current) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.entry.name, f.x, f.y - 26);
      ctx.fillStyle = '#fff';
      ctx.fillText(f.entry.name, f.x, f.y - 26);
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw the idle pad whenever the roster or state changes
  }, [raceState, entries]);

  // ---- Reveal countdown -------------------------------------------------
  useEffect(() => {
    if (raceState !== 'reveal') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const loop = () => {
      const now = Date.now();
      const elapsed = now - revealStartRef.current;
      drawBackground(ctx, KF.CANVAS_W, KF.CANVAS_H);
      drawPlatform(ctx, KF.PLATFORM_CX, KF.PLATFORM_CY, platformRRef.current, 0);
      for (const f of [...fightersRef.current].sort((a, b) => a.y - b.y)) {
        drawFighter(ctx, f, now);
      }

      const remaining = KF.REVEAL_MS - elapsed;
      const count = Math.ceil(remaining / 800);
      const label = count >= 4 ? 'READY' : count <= 0 ? 'FIGHT!' : String(count);
      const phase = 1 - (remaining % 800) / 800;
      ctx.save();
      ctx.globalAlpha = label === 'FIGHT!' ? 1 : 0.4 + phase * 0.6;
      ctx.font = `bold ${label === 'FIGHT!' ? 52 : 64}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.strokeText(label, KF.PLATFORM_CX, KF.PLATFORM_CY);
      ctx.fillText(label, KF.PLATFORM_CX, KF.PLATFORM_CY);
      ctx.restore();

      if (elapsed >= KF.REVEAL_MS) {
        roundStartRef.current = Date.now();
        lastFrameTimeRef.current = Date.now();
        setRaceState('fighting');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [raceState]);

  // ---- Main fight loop --------------------------------------------------
  useEffect(() => {
    if (raceState !== 'fighting') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const spawnFx = (fx: ImpactFx) => fxRef.current.push(fx);

    // The launching strike that follows a "Get Over Here" chain yank — hurls the
    // pulled-in victim back out toward the edge.
    const HOOK_STRIKE_MOVE: MoveDef = {
      ...MOVES.getOverHere,
      isProjectile: false,
      pull: false,
      grab: true,
      knockback: KF.HOOK_STRIKE_KNOCKBACK,
      damage: KF.HOOK_STRIKE_DAMAGE,
      damageStun: 320,
    };

    const applyHit = (
      victim: Fighter,
      srcX: number,
      srcY: number,
      srcName: string,
      move: MoveDef,
      now: number
    ) => {
      if (victim.state === 'out' || victim.state === 'falling') return;
      // Jump / dodge grant i-frames — the attack whiffs entirely.
      if (victim.state === 'jumping' || victim.state === 'dodging') {
        spawnFx({ x: victim.x, y: victim.y - 22, life: 0.5, maxLife: 0.5, radius: 0, growth: 0, color: '#cfe8ff', kind: 'hit', alpha: 1, text: 'MISS!' });
        return;
      }
      // Shielding fully blocks the hit.
      if (victim.state === 'shielding') {
        spawnFx({ x: victim.x, y: victim.y - 3, life: 0.35, maxLife: 0.35, radius: 12, growth: 60, color: '#9cd6ff', kind: 'block', alpha: 1 });
        spawnFx({ x: victim.x, y: victim.y - 20, life: 0.55, maxLife: 0.55, radius: 0, growth: 0, color: '#bfe3ff', kind: 'block', alpha: 1, text: 'BLOCK!' });
        return;
      }
      // A throw hurls the victim outward from the platform center; everything
      // else knocks them away from the source of the hit.
      const dx = move.grab ? victim.x - KF.PLATFORM_CX : victim.x - srcX;
      const dy = move.grab ? victim.y - KF.PLATFORM_CY : victim.y - srcY;
      const len = Math.hypot(dx, dy) || 1;
      const mult = 1 + (100 - victim.hp) / 160;
      const impulse = move.knockback * mult;
      victim.vx += (dx / len) * impulse;
      victim.vy += (dy / len) * impulse;
      // Shoryuken launches the victim skyward.
      if (move.launchVy) victim.vy += move.launchVy;
      victim.state = 'knockback';
      victim.stateUntil = now + move.damageStun;
      victim.hp = Math.max(0, victim.hp - (move.damage ?? 9));
      victim.currentMove = null;
      victim.movePhase = null;
      victim.lastHitByName = srcName;
      victim.lastHitByMove = move.id;
      victim.charge = Math.min(KF.CHARGE_MAX, victim.charge + KF.CHARGE_ON_TAKEN);
      const word = HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)];
      spawnFx({ x: victim.x, y: victim.y - 6, life: 0.32, maxLife: 0.32, radius: 8, growth: 80, color: '#ffd23a', kind: 'hit', alpha: 1 });
      spawnFx({ x: victim.x, y: victim.y - 20, life: 0.55, maxLife: 0.55, radius: 0, growth: 0, color: '#ffd23a', kind: 'hit', alpha: 1, text: word });
    };

    const nearestOpponent = (self: Fighter): Fighter | null => {
      let best: Fighter | null = null;
      let bestD = Infinity;
      for (const o of fightersRef.current) {
        if (o.id === self.id || o.state === 'out' || o.state === 'falling') continue;
        const d = Math.hypot(o.x - self.x, o.y - self.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    };

    // Start a defensive maneuver: shield (full block), jump (hop over), or dodge
    // (dash aside) — the last two grant i-frames.
    const beginDefense = (f: Fighter, kind: Defense, now: number) => {
      f.currentMove = null;
      f.movePhase = null;
      if (kind === 'shield') {
        f.state = 'shielding';
        f.stateUntil = now + KF.SHIELD_MS;
        f.vx *= 0.4;
        f.vy *= 0.4;
      } else if (kind === 'jump') {
        f.state = 'jumping';
        f.stateUntil = now + KF.JUMP_MS;
        f.airProgress = 0;
        f.vx *= 0.5;
        f.vy *= 0.5;
      } else if (kind === 'dodge') {
        f.state = 'dodging';
        f.stateUntil = now + KF.DODGE_MS;
        // Dash perpendicular to the nearest opponent, biased toward center so the
        // dodge doesn't fling the fighter off the platform.
        const opp = nearestOpponent(f);
        let dirx: number;
        let diry: number;
        if (opp) {
          const ox = opp.x - f.x;
          const oy = opp.y - f.y;
          const ol = Math.hypot(ox, oy) || 1;
          const px = -oy / ol;
          const py = ox / ol;
          const dot = px * (KF.PLATFORM_CX - f.x) + py * (KF.PLATFORM_CY - f.y);
          dirx = dot >= 0 ? px : -px;
          diry = dot >= 0 ? py : -py;
        } else {
          const tx = KF.PLATFORM_CX - f.x;
          const ty = KF.PLATFORM_CY - f.y;
          const tl = Math.hypot(tx, ty) || 1;
          dirx = tx / tl;
          diry = ty / tl;
        }
        f.dashDx = dirx;
        f.dashDy = diry;
        f.vx = dirx * KF.DODGE_SPEED;
        f.vy = diry * KF.DODGE_SPEED;
        spawnFx({ x: f.x, y: f.y + 8, life: 0.3, maxLife: 0.3, radius: 6, growth: 60, color: '#dfe7ff', kind: 'block', alpha: 0.8 });
      }
      f.defenseCdUntil = f.stateUntil + KF.DEFENSE_CD_MS;
    };

    const beginMove = (f: Fighter, move: MoveId, now: number) => {
      const def = MOVES[move];
      const target = nearestOpponent(f);
      if (target) f.facing = target.x >= f.x ? 1 : -1;
      f.currentMove = move;
      f.movePhase = 'windup';
      f.movePhaseUntil = now + def.windupMs;
      f.state = 'attack';
      f.hitSet.clear();
      // Unleashing a signature special spends the whole meter and shouts a callout.
      if (def.isSpecial) {
        f.charge = 0;
        if (def.callout) {
          spawnFx({ x: f.x, y: f.y - 34, life: 0.85, maxLife: 0.85, radius: 0, growth: 0, color: f.color, kind: 'hit', alpha: 1, text: def.callout });
        }
        spawnFx({ x: f.x, y: f.y - 2, life: 0.4, maxLife: 0.4, radius: 6, growth: 100, color: f.color, kind: 'hit', alpha: 1 });
      }
    };

    const stepMove = (f: Fighter, now: number) => {
      if (!f.currentMove) return;
      const def = MOVES[f.currentMove];
      if (now >= f.movePhaseUntil) {
        if (f.movePhase === 'windup') {
          if (def.isProjectile) {
            const target = nearestOpponent(f);
            let dirx = f.facing as number;
            let diry = 0;
            if (target) {
              const dx = target.x - f.x;
              const dy = target.y - f.y;
              const len = Math.hypot(dx, dy) || 1;
              dirx = dx / len;
              diry = dy / len;
            }
            const speed = def.projSpeed ?? KF.CHI_SPEED;
            projectilesRef.current.push({
              id: nextProjIdRef.current++,
              ownerId: f.id,
              ownerName: f.entry.name,
              moveId: def.id,
              x: f.x + f.facing * def.reach,
              y: f.y,
              vx: dirx * speed,
              vy: diry * speed,
              traveled: 0,
              color: def.id === 'hadoken' ? '#ff9838' : def.id === 'getOverHere' ? '#8dff9e' : f.color,
              radius: def.hitRadius,
              range: def.projRange ?? KF.CHI_RANGE,
            });
            f.movePhase = 'recover';
            f.movePhaseUntil = now + def.recoverMs;
          } else {
            f.movePhase = 'active';
            f.movePhaseUntil = now + def.activeMs;
            if (def.selfLungeVx) f.vx += f.facing * def.selfLungeVx;
            if (def.selfLungeVy) f.vy += def.selfLungeVy;
          }
        } else if (f.movePhase === 'active') {
          f.movePhase = 'recover';
          f.movePhaseUntil = now + def.recoverMs;
        } else {
          f.cooldowns[f.currentMove] = now + def.cooldownMs;
          f.currentMove = null;
          f.movePhase = null;
          f.hitSet.clear();
          f.state = 'idle';
          return;
        }
      }
      if (f.movePhase === 'active' && !def.isProjectile) {
        const hx = f.x + f.facing * def.reach;
        const hy = f.y;
        for (const o of fightersRef.current) {
          if (o.id === f.id || o.state === 'out' || o.state === 'falling') continue;
          if (f.hitSet.has(o.id)) continue;
          if (Math.hypot(o.x - hx, o.y - hy) <= def.hitRadius + KF.FIGHTER_RADIUS) {
            f.hitSet.add(o.id);
            applyHit(o, f.x, f.y, f.entry.name, def, now);
            f.charge = Math.min(KF.CHARGE_MAX, f.charge + KF.CHARGE_ON_HIT);
          }
        }
      }
    };

    const drawStandingsStrip = () => {
      const out = allEntries
        .filter((e) => winOrder.has(e.id))
        .sort((a, b) => (winOrder.get(a.id) ?? 0) - (winOrder.get(b.id) ?? 0));
      if (out.length === 0) return;
      // Top of the canvas: the minimized winner pill sits at the bottom.
      const y = 14;
      let x = 14;
      ctx.save();
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const e of out) {
        const idx = allEntries.findIndex((a) => a.id === e.id);
        ctx.fillStyle = generateColor(idx < 0 ? 0 : idx);
        ctx.beginPath();
        ctx.arc(x + 5, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const label = e.name.length > 8 ? e.name.slice(0, 7) + '…' : e.name;
        ctx.fillText(label, x + 13, y);
        x += 13 + ctx.measureText(label).width + 12;
        if (x > KF.CANVAS_W - 40) break;
      }
      ctx.restore();
    };

    const drawScene = (platformR: number, shrinking: number, now: number) => {
      const fighters = fightersRef.current;
      drawBackground(ctx, KF.CANVAS_W, KF.CANVAS_H);
      drawPlatform(ctx, KF.PLATFORM_CX, KF.PLATFORM_CY, platformR, shrinking);
      for (const p of projectilesRef.current) drawProjectile(ctx, p.x, p.y, p.radius, p.color);
      for (const f of [...fighters].sort((a, b) => a.y - b.y)) drawFighter(ctx, f, now);
      for (const f of fxRef.current) drawFx(ctx, f);
      // Name labels (outside any mirror transform so text never reverses).
      ctx.save();
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      for (const f of fighters) {
        if (f.state === 'out' || f.state === 'falling') continue;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(f.entry.name, f.x, f.y - 26);
        ctx.fillStyle = '#fff';
        ctx.fillText(f.entry.name, f.x, f.y - 26);
      }
      ctx.restore();
      drawStandingsStrip();
    };

    const loop = () => {
      const now = Date.now();
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
      lastFrameTimeRef.current = now;
      const fighters = fightersRef.current;

      // Platform shrink schedule (forced collapse as a hard backstop).
      const elapsed = now - roundStartRef.current;
      // Forced-collapse backstop always applies (prevents stalemates). The
      // gradual shrink is opt-in via the mode setting.
      let shrinking = 0;
      if (elapsed > KF.FORCED_END_MS) {
        platformRRef.current = Math.max(
          KF.PLATFORM_R_MIN * 0.6,
          platformRRef.current - KF.FORCED_COLLAPSE_SPEED * dt
        );
        shrinking = 1;
      } else if (!shrinkRef.current || elapsed < KF.SHRINK_GRACE_MS) {
        platformRRef.current = roundStartRadiusRef.current;
      } else {
        const t = clamp((elapsed - KF.SHRINK_GRACE_MS) / KF.SHRINK_DURATION_MS, 0, 1);
        platformRRef.current = lerp(roundStartRadiusRef.current, KF.PLATFORM_R_MIN, easeInOut(t));
        shrinking = 1;
      }
      const platformR = platformRRef.current;

      // Decisions + steering + move begin.
      for (const f of fighters) {
        if (f.state === 'out') continue;
        const free = f.state === 'idle' || f.state === 'approach';
        if (free && now >= f.nextDecisionAt) {
          const others = fighters.filter(
            (o) => o.id !== f.id && o.state !== 'out' && o.state !== 'falling'
          );
          // Zero out the meter for the AI when specials are disabled so it never
          // picks a signature move.
          const self: AiFighter = specialsRef.current
            ? f
            : {
                id: f.id, x: f.x, y: f.y, facing: f.facing, state: f.state,
                currentMove: f.currentMove, movePhase: f.movePhase, cooldowns: f.cooldowns,
                charge: 0, signature: null, defenseCdUntil: f.defenseCdUntil,
              };
          const intent = decideIntent({
            self,
            others,
            platformCx: KF.PLATFORM_CX,
            platformCy: KF.PLATFORM_CY,
            platformR,
            squash: KF.PLATFORM_SQUASH,
            now,
          });
          f.targetId = intent.targetId;
          f.desiredVx = intent.desiredVx;
          f.desiredVy = intent.desiredVy;
          if (intent.defense !== 'none' && now >= f.defenseCdUntil) {
            beginDefense(f, intent.defense, now);
          } else if (intent.move && f.currentMove === null) {
            beginMove(f, intent.move, now);
          }
          f.nextDecisionAt = now + 180 + Math.random() * 140;
        }
        if (f.state === 'idle' || f.state === 'approach') {
          f.vx += (f.desiredVx - f.vx) * KF.STEER_ACCEL * dt;
          f.vy += (f.desiredVy - f.vy) * KF.STEER_ACCEL * dt;
          const sp = Math.hypot(f.vx, f.vy);
          f.state = sp > 12 ? 'approach' : 'idle';
        }
      }

      // Move sub-machine + hit resolution.
      for (const f of fighters) {
        if (f.state !== 'out' && f.currentMove) stepMove(f, now);
      }

      // Integrate physics.
      for (const f of fighters) {
        if (f.state === 'out') continue;
        if (f.state !== 'falling') {
          const fric = f.state === 'knockback' ? KF.KNOCKBACK_FRICTION : KF.GROUND_FRICTION;
          f.vx -= f.vx * fric * dt;
          f.vy -= f.vy * fric * dt;
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.blocking = f.state === 'shielding';
        f.charge = Math.min(KF.CHARGE_MAX, f.charge + KF.CHARGE_TRICKLE * dt);
      }

      // Fighter–fighter separation.
      for (let i = 0; i < fighters.length; i++) {
        const a = fighters[i];
        if (a.state === 'out' || a.state === 'falling') continue;
        for (let j = i + 1; j < fighters.length; j++) {
          const b = fighters[j];
          if (b.state === 'out' || b.state === 'falling') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = 2 * KF.FIGHTER_RADIUS;
          if (d > 0 && d < minD) {
            const push = ((minD - d) / minD) * KF.SEPARATION_PUSH * dt * 60;
            const nx = dx / d;
            const ny = dy / d;
            a.vx -= nx * push; a.vy -= ny * push;
            b.vx += nx * push; b.vy += ny * push;
          }
        }
      }

      // State timers + ring-out test.
      for (const f of fighters) {
        if (f.state === 'out') continue;
        if (f.state === 'falling') {
          f.fallScale = clamp((f.stateUntil - now) / KF.FALL_MS, 0, 1);
          if (now >= f.stateUntil) {
            f.state = 'out';
            if (!pendingRingOutRef.current) pendingRingOutRef.current = f;
          }
          continue;
        }
        // Jump: airborne arc, immune to ring-out (lands back on the pad).
        if (f.state === 'jumping') {
          const p = clamp((f.stateUntil - now) / KF.JUMP_MS, 0, 1);
          f.airProgress = Math.sin((1 - p) * Math.PI);
          if (now >= f.stateUntil) {
            f.state = 'idle';
            f.airProgress = 0;
          }
          continue;
        }
        // Dodge / shield windows end back to idle (dodge can still dash off → ring-out).
        if ((f.state === 'dodging' || f.state === 'shielding') && now >= f.stateUntil) {
          f.state = 'idle';
        }
        if ((f.state === 'knockback' || f.state === 'hitstun') && now >= f.stateUntil) {
          f.state = 'idle';
        }
        // "Get Over Here" follow-up: the launching strike after the yank lands.
        if (f.hookStrikeAt !== undefined && now >= f.hookStrikeAt) {
          const hooker = fighters.find((o) => o.id === f.hookedBy);
          f.hookStrikeAt = undefined;
          f.hookedBy = undefined;
          if (hooker && hooker.state !== 'out' && hooker.state !== 'falling') {
            applyHit(f, hooker.x, hooker.y, hooker.entry.name, HOOK_STRIKE_MOVE, now);
            hooker.charge = Math.min(KF.CHARGE_MAX, hooker.charge + KF.CHARGE_ON_HIT);
          }
        }
        // Ring-out against the rendered ellipse (normalized distance > 1 = off).
        const ndx = (f.x - KF.PLATFORM_CX) / platformR;
        const ndy = (f.y - KF.PLATFORM_CY) / (platformR * KF.PLATFORM_SQUASH);
        if (ndx * ndx + ndy * ndy > 1) {
          f.state = 'falling';
          f.stateUntil = now + KF.FALL_MS;
          f.fallScale = 1;
          spawnFx({ x: f.x, y: f.y, life: 0.5, maxLife: 0.5, radius: 12, growth: 90, color: '#ff5a3c', kind: 'ringout', alpha: 1 });
        }
      }

      // Projectiles.
      const liveProjectiles: Projectile[] = [];
      for (const p of projectilesRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.traveled += Math.hypot(p.vx, p.vy) * dt;
        const move = MOVES[p.moveId];
        let consumed = false;
        for (const o of fighters) {
          if (o.id === p.ownerId || o.state === 'out' || o.state === 'falling') continue;
          // Jump / dodge i-frames — the projectile passes over/through untouched.
          if (o.state === 'jumping' || o.state === 'dodging') continue;
          const dist = Math.hypot(o.x - p.x, o.y - p.y);
          // Reactive evade: hop over an incoming projectile that's closing in.
          if ((o.state === 'idle' || o.state === 'approach') && now >= o.defenseCdUntil && dist < 46) {
            const closing = (o.x - p.x) * p.vx + (o.y - p.y) * p.vy > 0;
            if (closing && Math.random() < 0.06) {
              beginDefense(o, 'jump', now);
              continue;
            }
          }
          if (dist <= p.radius + KF.FIGHTER_RADIUS) {
            const owner = fighters.find((fr) => fr.id === p.ownerId);
            if (move.pull) {
              // Yank the victim toward the owner, then schedule the launch strike.
              const ox = owner ? owner.x : p.x;
              const oy = owner ? owner.y : p.y;
              const ddx = ox - o.x;
              const ddy = oy - o.y;
              const dl = Math.hypot(ddx, ddy) || 1;
              o.vx = (ddx / dl) * move.knockback;
              o.vy = (ddy / dl) * move.knockback;
              o.state = 'knockback';
              o.stateUntil = now + move.damageStun;
              o.hp = Math.max(0, o.hp - (move.damage ?? 9));
              o.currentMove = null;
              o.movePhase = null;
              o.lastHitByName = p.ownerName;
              o.lastHitByMove = p.moveId;
              o.charge = Math.min(KF.CHARGE_MAX, o.charge + KF.CHARGE_ON_TAKEN);
              o.hookStrikeAt = now + KF.HOOK_STRIKE_DELAY_MS;
              o.hookedBy = p.ownerId;
              spawnFx({ x: o.x, y: o.y - 6, life: 0.32, maxLife: 0.32, radius: 8, growth: 80, color: '#8dff9e', kind: 'hit', alpha: 1 });
            } else {
              applyHit(o, p.x, p.y, p.ownerName, move, now);
            }
            if (owner) owner.charge = Math.min(KF.CHARGE_MAX, owner.charge + KF.CHARGE_ON_HIT);
            consumed = true;
            break;
          }
        }
        const pndx = (p.x - KF.PLATFORM_CX) / platformR;
        const pndy = (p.y - KF.PLATFORM_CY) / (platformR * KF.PLATFORM_SQUASH);
        const offPlatform = pndx * pndx + pndy * pndy > 1.2;
        if (!consumed && p.traveled < p.range && !offPlatform) liveProjectiles.push(p);
      }
      projectilesRef.current = liveProjectiles;

      // FX decay.
      const liveFx: ImpactFx[] = [];
      for (const fx of fxRef.current) {
        fx.life -= dt;
        fx.radius += fx.growth * dt;
        fx.alpha = Math.max(0, fx.life / fx.maxLife);
        if (fx.life > 0) liveFx.push(fx);
      }
      fxRef.current = liveFx;

      // Record a replay snapshot.
      record({
        platformR,
        fighters: fighters.map((f) => ({
          id: f.id,
          name: f.entry.name,
          x: f.x,
          y: f.y,
          facing: f.facing,
          state: f.state,
          color: f.color,
          currentMove: f.currentMove,
          movePhase: f.movePhase,
          fallScale: f.fallScale,
          blocking: f.blocking,
          charge: specialsRef.current ? f.charge : undefined,
          signature: specialsRef.current ? f.signature : null,
          airProgress: f.airProgress,
          dashDx: f.dashDx,
          dashDy: f.dashDy,
        })),
        projectiles: projectilesRef.current.map((p) => ({ x: p.x, y: p.y, color: p.color, radius: p.radius })),
        fx: fxRef.current.map((fx) => ({ ...fx })),
      });

      drawScene(platformR, shrinking, now);

      // Commit a ring-out (one per round).
      if (pendingRingOutRef.current) {
        const victim = pendingRingOutRef.current;
        pendingRingOutRef.current = null;
        const killMove = victim.lastHitByMove ?? 'punch';
        const killerInfo: KillerInfo | undefined = victim.lastHitByName
          ? {
              name: victim.lastHitByName,
              weapon: MOVES[killMove].weaponLabel,
              icon: MOVE_ICON[killMove],
              ability: abilityLabel(killMove),
            }
          : undefined;
        replayVictimRef.current = { id: victim.id };
        setRaceState('finished');
        onWinner(victim.entry, killerInfo);
        return; // stop the loop
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvas game loop: keyed on raceState; reads live refs/props by closure intentionally
  }, [raceState]);

  // ---- Slow-mo replay ---------------------------------------------------
  useEffect(() => {
    if (!replayActive) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    start(0.6);
    let raf = 0;
    const begin = performance.now();
    const loop = () => {
      const frame = getCurrentFrame(performance.now());
      if (frame) {
        const zoom = lerp(1, 2.3, easeInOut(clamp((performance.now() - begin) / 1200, 0, 1)));
        const victim = replayVictimRef.current
          ? frame.fighters.find((f) => f.id === replayVictimRef.current?.id)
          : undefined;
        const fx = victim?.x ?? KF.PLATFORM_CX;
        const fy = victim?.y ?? KF.PLATFORM_CY;
        ctx.save();
        ctx.translate(KF.PLATFORM_CX, KF.PLATFORM_CY);
        ctx.scale(zoom, zoom);
        ctx.translate(-fx, -fy);
        drawBackground(ctx, KF.CANVAS_W, KF.CANVAS_H);
        drawPlatform(ctx, KF.PLATFORM_CX, KF.PLATFORM_CY, frame.platformR, 1);
        for (const f of [...frame.fighters].sort((a, b) => a.y - b.y)) drawFighter(ctx, f, performance.now());
        for (const p of frame.projectiles) drawProjectile(ctx, p.x, p.y, p.radius, p.color);
        for (const f of frame.fx) drawFx(ctx, f);
        ctx.restore();
        // Replay banner (unzoomed).
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 18, KF.CANVAS_W, 30);
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◀◀ INSTANT REPLAY', KF.PLATFORM_CX, 33);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay loop keyed on replayActive; reads recorder via stable callbacks
  }, [replayActive]);

  // After the final round, auto-open the leaderboard once the champion is crowned
  // (brief pause so the GRAND CHAMPION card is seen first). Kept in a ref so an
  // unstable onShowFinalStandings identity doesn't keep re-arming the timer.
  const showStandingsRef = useRef(onShowFinalStandings);
  useEffect(() => {
    showStandingsRef.current = onShowFinalStandings;
  }, [onShowFinalStandings]);
  useEffect(() => {
    if (!currentWinnerIsLastPlayer || !currentWinner || isRacing) return;
    const t = window.setTimeout(() => showStandingsRef.current?.(), 2600);
    return () => window.clearTimeout(t);
  }, [currentWinnerIsLastPlayer, currentWinner, isRacing]);

  const details =
    currentWinnerIsLastPlayer ? undefined
    : currentWinnerKillerInfo ? (
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          lineHeight: 1.25,
          gap: 1,
        }}
      >
        <span style={{ fontSize: '0.8em', opacity: 0.75, letterSpacing: '0.06em' }}>
          💥 ELIMINATED BY
        </span>
        <span style={{ fontSize: '1.35em', fontWeight: 800 }}>
          🥋 {currentWinnerKillerInfo.name}
        </span>
        <span style={{ fontSize: '0.75em', opacity: 0.7 }}>with</span>
        <span style={{ fontSize: '1.25em', fontWeight: 800, letterSpacing: '0.02em' }}>
          {currentWinnerKillerInfo.icon} {currentWinnerKillerInfo.ability ?? currentWinnerKillerInfo.weapon}
        </span>
      </span>
    ) : currentWinner ? (
      <span style={{ fontWeight: 600 }}>🌀 Tumbled off the platform!</span>
    ) : undefined;

  return (
    <div className="kung-fu-game">
      <div className="kung-fu-canvas-host">
        <canvas ref={canvasRef} width={KF.CANVAS_W} height={KF.CANVAS_H} className="game-canvas" />
      </div>

      <WinnerDialog
        theme={kungFuTheme}
        show={!!currentWinner && !isRacing}
        isFinals={currentWinnerIsLastPlayer ?? entries.length === 0}
        winner={{ name: currentWinner ?? '' }}
        headline="KNOCKED OFF!"
        finalsHeadline="🥋 GRAND CHAMPION 🥋"
        nextLabel="🥋 Next Round"
        detailsNode={details}
        autoMinimize={false}
        onNext={onRaceComplete}
        onShowFinalStandings={() => onShowFinalStandings?.()}
        onReplayStart={() => setReplayActive(true)}
      />
    </div>
  );
}
