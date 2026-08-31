import { useEffect, useRef, useState } from 'react';
import { useReplayRecorder } from '../../../hooks/useReplayRecorder';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  DL,
  DUEL_MOVES,
  DUEL_MOVE_IDS,
  STAGE_IDS,
  pickDuelists,
  type DuelFighter,
  type DuelMoveId,
  type DuelProjectile,
  type DuelFx,
  type StageId,
} from './duelEngine';
import { pickTwoCharacters, type DuelCharacter } from './duelCharacters';
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
  /** Reports every point of damage inflicted (attacker entry id, amount). */
  onDamage?: (attackerId: number, amount: number) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: DuelWinnerDisplay | null;
}

/** Replay snapshot: shallow fighter copies (entry/character refs are stable). */
interface DuelFrame {
  f1: DuelFighter;
  f2: DuelFighter;
  projectiles: DuelProjectile[];
  fx: DuelFx[];
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
  useEffect(() => {
    audio.setMusicMuted(!settings.music);
  }, [settings.music]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;
  const stageRef = useRef<StageId>('city');

  // Instant replay: slow-mo playback of the final moments, zoomed on the loser.
  const { record, clear, start, stop, getCurrentFrame } = useReplayRecorder<DuelFrame>({
    maxFrames: 360,
    msPerFrame: 16,
    playbackSpeed: 0.4,
  });
  const [replayActive, setReplayActive] = useState(false);
  const replayActiveRef = useRef(false);
  const replayStartedAtRef = useRef(0);
  // The persistent loop never re-renders its closure — keep the latest
  // getCurrentFrame (which depends on isReplaying state) readable via a ref.
  const getFrameRef = useRef(getCurrentFrame);
  getFrameRef.current = getCurrentFrame;
  useEffect(() => {
    replayActiveRef.current = replayActive;
    if (replayActive) {
      replayStartedAtRef.current = performance.now();
      start(0.55);
    } else {
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recorder callbacks are stable
  }, [replayActive]);

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

  const makeFighter = (entry: Entry, side: 1 | -1, character: DuelCharacter): DuelFighter => {
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
      cooldowns: Object.fromEntries(DUEL_MOVE_IDS.map((m) => [m, 0])) as Record<DuelMoveId, number>,
      nextDecisionAt: 0,
      blockUntil: 0,
      hitReg: false,
      meter: Math.round(DL.METER_MAX * 0.22), // head-start so a super reliably lands mid-duel
      character,
      comboHitAt: 0,
      superVx: 0,
    };
  };

  const superFlashUntilRef = useRef(0);

  const startDuel = (now: number) => {
    const p = propsRef.current;
    audio.resumeDuelAudio();
    const [a, b] = pickDuelists(p.entries);
    const [ca, cb] = pickTwoCharacters();
    f1Ref.current = makeFighter(a, 1, ca);
    f2Ref.current = makeFighter(b, -1, cb);
    projRef.current = [];
    fxRef.current = [];
    loserRef.current = null;
    winnerRef.current = null;
    crowdRef.current = p.entries
      .filter((e) => e.id !== a.id && e.id !== b.id)
      .map((e) => ({ color: colorOf(e), name: e.name }));
    stageRef.current = STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)];
    introUntilRef.current = now + DL.INTRO_MS;
    phaseRef.current = 'intro';
    clear();
    setReplayActive(false);
    audio.playBell();
    audio.startTrack(stageRef.current); // no-op if music is muted
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

  // Spend a full meter on the character's signature super — flash + callout.
  const startSuper = (f: DuelFighter, opp: DuelFighter, now: number) => {
    const kind = f.character.superKind;
    const moveId: DuelMoveId =
      kind === 'projectile' || kind === 'volley' ? 'superFireball' : 'superCombo';
    f.meter = 0;
    f.facing = opp.x >= f.x ? 1 : -1;
    f.currentMove = moveId;
    f.movePhase = 'windup';
    f.movePhaseUntil = now + DUEL_MOVES[moveId].windupMs;
    f.state = 'attack';
    f.hitReg = false;
    f.comboHitAt = 0;
    f.superVx = 0;
    superFlashUntilRef.current = now + 260;
    fxRef.current.push({ x: DL.CANVAS_W / 2, y: DL.GROUND_Y * 0.42, life: 1, maxLife: 1, radius: 0, growth: 0, color: f.character.superColor, kind: 'spark', text: f.character.superCallout });
    audio.playFireball();
  };

  const decide = (self: DuelFighter, opp: DuelFighter, now: number) => {
    if (self.state === 'hurt' || self.state === 'attack' || self.air > 2) return;
    self.facing = opp.x >= self.x ? 1 : -1;
    const dist = Math.abs(opp.x - self.x);

    // Full meter → unleash the character's super when it's in its useful range:
    // projectile fires from anywhere; travelling supers (grab/crusher/dive) fire
    // from mid-range; melee flurries need to close in first.
    if (self.meter >= DL.METER_MAX && self.currentMove === null) {
      const kind = self.character.superKind;
      const inRange =
        kind === 'projectile' || kind === 'volley' ? true :
        kind === 'grab' || kind === 'crusher' || kind === 'dive' || kind === 'drill' ? dist <= 220 :
        dist <= DUEL_MOVES.kick.reach + 20;
      if (inRange) {
        startSuper(self, opp, now);
        return;
      }
      self.state = 'walk';
      return;
    }

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

  const isSuperMove = (m: DuelMoveId) => m === 'superCombo' || m === 'superFireball';

  const gainMeter = (f: DuelFighter, amount: number) => {
    f.meter = Math.min(DL.METER_MAX, f.meter + amount);
  };

  const applyDamage = (
    a: DuelFighter,
    d: DuelFighter,
    moveId: DuelMoveId,
    now: number,
    override?: { dmg?: number; knockback?: number; launch?: boolean }
  ) => {
    const m = DUEL_MOVES[moveId];
    const dmg = override?.dmg ?? m.dmg;
    const knockback = override?.knockback ?? m.knockback;
    const launch = override?.launch ?? m.launch;
    const zsuper = isSuperMove(moveId);
    const blocking = d.state === 'block' && Math.sign(a.x - d.x) === d.facing;
    d.currentMove = null;
    d.movePhase = null;
    if (blocking) {
      d.hp = Math.max(0, d.hp - (m.chip ?? 0));
      if (m.chip) propsRef.current.onDamage?.(a.entry.id, m.chip);
      d.x = clamp(d.x + a.facing * 10, DL.STAGE_L, DL.STAGE_R);
      fxRef.current.push({ x: d.x + d.facing * 12, y: DL.GROUND_Y - 40, life: 0.28, maxLife: 0.28, radius: 10, growth: 40, color: '#9cd6ff', kind: 'block' });
      gainMeter(d, DL.METER_ON_BLOCK);
      if (!zsuper) gainMeter(a, DL.METER_ON_BLOCK);
      audio.playBlock();
      return;
    }
    d.hp = Math.max(0, d.hp - dmg);
    propsRef.current.onDamage?.(a.entry.id, dmg);
    d.state = 'hurt';
    d.stateUntil = now + DL.HITSTUN_MS;
    d.x = clamp(d.x + a.facing * knockback * 0.3, DL.STAGE_L, DL.STAGE_R);
    if (launch) { d.vy = DL.JUMP_VY * 0.85; d.air = Math.max(d.air, 1); }
    gainMeter(d, DL.METER_ON_TAKEN);
    if (!zsuper) gainMeter(a, DL.METER_ON_HIT);
    const sparkCol = zsuper ? a.character.superColor : '#fff2a8';
    spawnSpark(d.x + d.facing * 10, DL.GROUND_Y - 42, sparkCol, zsuper ? undefined : HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]);
    // Electric super: extra shock rings around the victim.
    if (zsuper && a.character.superKind === 'electric') {
      fxRef.current.push({ x: d.x, y: DL.GROUND_Y - 40, life: 0.35, maxLife: 0.35, radius: 6, growth: 110, color: a.character.superColor, kind: 'ring' });
    }
    audio.playHit();
  };

  const stepMove = (f: DuelFighter, opp: DuelFighter, now: number) => {
    if (!f.currentMove) return;
    const m = DUEL_MOVES[f.currentMove];
    if (now >= f.movePhaseUntil) {
      if (f.movePhase === 'windup') {
        if (m.isProjectile) {
          if (f.currentMove === 'superFireball' && f.character.superKind === 'volley') {
            // Kunai storm: three thrown blades at staggered speeds.
            for (let k = 0; k < 3; k++) {
              projRef.current.push({
                x: f.x + f.facing * (18 + k * 6), y: DL.GROUND_Y - 40,
                vx: f.facing * DL.HADOKEN_SPEED * (1.1 + k * 0.28),
                ownerSide: f.side, color: f.character.superColor, traveled: 0,
                radius: 10, dmg: 9, chip: 2, big: false,
              });
            }
          } else {
            const big = f.currentMove === 'superFireball';
            projRef.current.push({
              x: f.x + f.facing * 22, y: DL.GROUND_Y - 40,
              vx: f.facing * DL.HADOKEN_SPEED * (big ? 1.15 : 1),
              ownerSide: f.side, color: big ? f.character.superColor : f.color, traveled: 0,
              radius: big ? 30 : 16, dmg: m.dmg, chip: m.chip ?? 0, big,
            });
          }
          f.movePhase = 'recover';
          f.movePhaseUntil = now + m.recoverMs;
        } else {
          f.movePhase = 'active';
          f.movePhaseUntil = now + m.activeMs;
          f.hitReg = false;
          f.comboHitAt = 0;
          // Character supers with motion: set their travel on activation.
          if (f.currentMove === 'superCombo') {
            const kind = f.character.superKind;
            if (kind === 'grab') f.superVx = f.facing * 380;
            else if (kind === 'crusher') f.superVx = f.facing * 420;
            else if (kind === 'drill') f.superVx = f.facing * 460;
            else if (kind === 'dive') {
              f.vy = DL.JUMP_VY * 1.05;
              f.air = Math.max(f.air, 1);
              f.superVx = f.facing * 200;
            } else if (f.character.dashing) f.superVx = f.facing * 160;
          }
          if (m.launch) { f.vy = DL.JUMP_VY * 0.6; f.air = Math.max(f.air, 1); audio.playPunch(); }
          else audio.playPunch();
        }
      } else if (f.movePhase === 'active') {
        f.movePhase = 'recover';
        f.movePhaseUntil = now + m.recoverMs;
        f.superVx = 0;
      } else {
        f.cooldowns[f.currentMove] = now + m.cooldownMs;
        f.currentMove = null;
        f.movePhase = null;
        f.state = 'idle';
        return;
      }
    }
    // Melee hit window.
    if (f.movePhase === 'active' && !m.isProjectile) {
      const dist = Math.abs(opp.x - f.x);
      const inReach = dist <= m.reach + DL.FIGHTER_HALF_W && (opp.x >= f.x ? 1 : -1) === f.facing;
      if (f.currentMove === 'superCombo') {
        const kind = f.character.superKind;
        if (kind === 'grab' || kind === 'crusher' || kind === 'dive' || kind === 'drill') {
          // Travelling super: one big launching blow on contact.
          if (!f.hitReg && inReach) {
            f.hitReg = true;
            // Crusher and drill carry through the opponent; grab/dive stop.
            f.superVx = kind === 'crusher' || kind === 'drill' ? f.superVx : 0;
            applyDamage(f, opp, 'superCombo', now, { dmg: 24, knockback: 220, launch: true });
          }
        } else {
          // Flurry/electric: a hit every ~85ms, combo-locking the opponent in range.
          if (now >= f.comboHitAt && inReach) {
            applyDamage(f, opp, 'superCombo', now);
            opp.x = clamp(f.x + f.facing * DUEL_MOVES.punch.reach, DL.STAGE_L, DL.STAGE_R);
            f.comboHitAt = now + 85;
          } else if (now >= f.comboHitAt) {
            f.comboHitAt = now + 85;
          }
        }
      } else if (!f.hitReg && inReach) {
        f.hitReg = true;
        applyDamage(f, opp, f.currentMove, now);
      }
    }
  };

  const stepPhysics = (f: DuelFighter, opp: DuelFighter, dt: number) => {
    // Travelling super (grab rush / psycho crusher / claw dive drift).
    if (f.superVx !== 0 && f.movePhase === 'active') {
      f.x = clamp(f.x + f.superVx * dt, DL.STAGE_L, DL.STAGE_R);
    }
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
      const owner = pr.ownerSide === 1 ? f1 : f2;
      let consumed = false;
      if (Math.abs(target.x - pr.x) < pr.radius + 4 && target.air < 40) {
        const blocking = target.state === 'block' && Math.sign(pr.vx) === -target.facing;
        if (blocking) {
          target.hp = Math.max(0, target.hp - pr.chip);
          if (pr.chip) propsRef.current.onDamage?.(owner.entry.id, pr.chip);
          fxRef.current.push({ x: target.x, y: DL.GROUND_Y - 40, life: 0.28, maxLife: 0.28, radius: 12, growth: 40, color: '#9cd6ff', kind: 'block' });
          gainMeter(target, DL.METER_ON_BLOCK);
          if (!pr.big) gainMeter(owner, DL.METER_ON_BLOCK);
          audio.playBlock();
        } else {
          target.hp = Math.max(0, target.hp - pr.dmg);
          propsRef.current.onDamage?.(owner.entry.id, pr.dmg);
          target.state = 'hurt';
          target.stateUntil = now + DL.HITSTUN_MS;
          target.currentMove = null;
          target.movePhase = null;
          gainMeter(target, DL.METER_ON_TAKEN);
          if (!pr.big) gainMeter(owner, DL.METER_ON_HIT);
          spawnSpark(target.x, DL.GROUND_Y - 42, pr.big ? '#ffe66d' : '#aee9ff');
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
      loser.currentMove = null;
      loser.movePhase = null;
      loser.superVx = 0;
      winner.state = 'win';
      winner.currentMove = null;
      winner.movePhase = null;
      winner.superVx = 0;
      // Stand the winner clear of the prone body (it sprawls ~50px toward its
      // facing), off to their own side — flipping sides if the stage edge is
      // too close.
      {
        const sgn = winner.x >= loser.x ? 1 : -1;
        let wx = loser.x + sgn * 70;
        if (wx < DL.STAGE_L || wx > DL.STAGE_R) wx = loser.x - sgn * 70;
        winner.x = clamp(wx, DL.STAGE_L, DL.STAGE_R);
        winner.facing = loser.x >= winner.x ? 1 : -1;
        winner.air = 0;
        winner.vy = 0;
      }
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
    drawStage(ctx, stageRef.current, now);
    for (const pr of projRef.current) drawDuelProjectile(ctx, pr);
    const f1 = f1Ref.current;
    const f2 = f2Ref.current;
    if (f1 && f2) {
      // Draw the far fighter first for simple depth.
      const order = f1.x <= f2.x ? [f1, f2] : [f2, f1];
      for (const f of order) drawFighter(ctx, f, imgOf(f.entry), now);
    }
    for (const fx of fxRef.current) drawDuelFx(ctx, fx);
    // Super activation flash.
    if (now < superFlashUntilRef.current) {
      const a = (superFlashUntilRef.current - now) / 260;
      ctx.save();
      ctx.globalAlpha = 0.7 * a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, DL.CANVAS_W, DL.GROUND_Y);
      ctx.restore();
    }
    drawCrowd(ctx, crowdRef.current, now);
    if (withBars && f1 && f2) {
      const timer = Math.max(0, DL.ROUND_TIME_S - (now - fightStartRef.current) / 1000);
      drawHealthBars(ctx, f1, f2, imgOf(f1.entry), imgOf(f2.entry), timer);
    }
  };

  // Snapshot the world for the replay buffer (shallow copies; entry/character
  // references are stable and safe to share across frames).
  const recordFrame = () => {
    const f1 = f1Ref.current;
    const f2 = f2Ref.current;
    if (!f1 || !f2) return;
    record({
      f1: { ...f1 },
      f2: { ...f2 },
      projectiles: projRef.current.map((pr) => ({ ...pr })),
      fx: fxRef.current.map((fx) => ({ ...fx })),
    });
  };

  // Slow-mo replay frame, zoomed on the loser's final moments.
  const drawReplay = (ctx: CanvasRenderingContext2D, wallNow: number): boolean => {
    const frame = getFrameRef.current(wallNow);
    if (!frame) return false;
    const zoom = 1 + 0.9 * Math.min(1, (wallNow - replayStartedAtRef.current) / 1100);
    const loser = loserRef.current;
    const target = loser && frame.f1.side === loser.side ? frame.f1 : frame.f2;
    const fx = target.x;
    const fy = DL.GROUND_Y - 40;
    ctx.save();
    ctx.translate(DL.CANVAS_W / 2, DL.CANVAS_H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx, -fy);
    drawStage(ctx, stageRef.current, wallNow);
    for (const pr of frame.projectiles) drawDuelProjectile(ctx, pr);
    const order = frame.f1.x <= frame.f2.x ? [frame.f1, frame.f2] : [frame.f2, frame.f1];
    for (const f of order) drawFighter(ctx, f, imgOf(f.entry), wallNow);
    for (const e of frame.fx) drawDuelFx(ctx, e);
    ctx.restore();
    // Banner (unzoomed).
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 18, DL.CANVAS_W, 30);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀◀ INSTANT REPLAY', DL.CANVAS_W / 2, 33);
    ctx.restore();
    return true;
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
          drawStage(ctx, stageRef.current, now);
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
          recordFrame();
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
          recordFrame();
          drawScene(ctx, now, true);
          const winner = winnerRef.current!;
          if (now - koStartRef.current < 900) drawAnnounce(ctx, 'K.O.!', '#ff3b3b', 1.15);
          else drawAnnounce(ctx, `${winner.entry.name.toUpperCase()} WINS!`, winner.color, 0.72);
          if (now >= koUntilRef.current) {
            phaseRef.current = 'finished';
            audio.stopTrack();
            audio.playFanfare();
            p.onWinner(loserRef.current!.entry, winnerRef.current!.entry.name);
          }
          break;
        }
        case 'finished': {
          // Once the winner dialog minimizes, play the slow-mo instant replay.
          if (replayActiveRef.current && drawReplay(ctx, performance.now())) break;
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
    return () => {
      cancelAnimationFrame(raf);
      audio.stopTrack();
    };
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
        onReplayStart={() => setReplayActive(true)}
      />
    </div>
  );
}
