import { useEffect, useRef } from 'react';
import type { Entry } from '../../../types';
import { generateColor } from '../../../utils/colors';
import { getPreferredEntryImage } from '../../../utils/entryImages';
import { WinnerDialog } from '../../shared/WinnerDialog/WinnerDialog';
import type { WinnerTheme } from '../themes';
import {
  SUIT_IS_RED,
  SUIT_SYMBOL,
  dealHoldem,
  rankLabel,
  suddenDeath,
  type Card,
  type SuddenDeathResult,
} from './pokerDeck';
import { evaluateSeven, strongestOf, weakestOf, type HandValue } from './pokerHands';
import {
  CANVAS_H,
  CANVAS_W,
  FELT_RX,
  FELT_RY,
  TABLE_CX,
  TABLE_CY,
  communitySlots,
  seatPositions,
  seatTileWidth,
  suddenDeathLayout,
} from './pokerTable';
import { usePokerSettings, pokerSpeedFactor } from './pokerSettingsStore';
import * as audio from './pokerAudio';
import './PokerGame.css';

export interface PokerWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  isLastPlayer?: boolean;
  /** The hand they went out with. */
  bustedWith?: string;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (busted: Entry, handName: string) => void;
  onRaceComplete: () => void;
  onShowFinalStandings?: () => void;
  isRacing: boolean;
  currentWinner: PokerWinnerDisplay | null;
}

type Phase = 'ready' | 'deal' | 'flop' | 'turn' | 'river' | 'showdown' | 'sudden' | 'done';

/** Phase lengths in ms, before the speed multiplier. */
const T = {
  deal: 1250,
  flop: 1500,
  turn: 1200,
  river: 1900,
  showdown: 2300,
  suddenRound: 1300,
  suddenHold: 1200,
} as const;

interface Player {
  entry: Entry;
  color: string;
  initials: string;
  hole: Card[];
  hand: HandValue | null;
}

const CARD_W = 46;
const CARD_H = 64;
const MINI_W = 21;
const MINI_H = 29;

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

export function PokerGame(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const settings = usePokerSettings();
  useEffect(() => {
    audio.setPokerMuted(!settings.sound);
  }, [settings.sound]);
  const speedRef = useRef(settings.speed);
  speedRef.current = settings.speed;

  const phaseRef = useRef<Phase>('ready');
  const phaseUntilRef = useRef(0);
  const playersRef = useRef<Player[]>([]);
  const boardRef = useRef<Card[]>([]);
  const revealedRef = useRef(0);
  const riskIdxRef = useRef<number[]>([]);
  const leaderIdxRef = useRef<number[]>([]);
  const bustedIdxRef = useRef<number | null>(null);
  const suddenRef = useRef<SuddenDeathResult | null>(null);
  const suddenRoundRef = useRef(0);
  const suddenUntilRef = useRef(0);
  const declaredRef = useRef(false);
  const flashRef = useRef(0);
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());

  const dur = (ms: number) => ms * pokerSpeedFactor(speedRef.current);

  // ---- Round lifecycle ---------------------------------------------------
  const startRound = (now: number) => {
    const p = propsRef.current;
    audio.resumePokerAudio();
    const initials = computeInitials(p.entries);
    const { hole, board } = dealHoldem(p.entries.length);

    playersRef.current = p.entries.map((entry, i) => {
      const url = getPreferredEntryImage(entry);
      if (url && !imgCacheRef.current.has(entry.id)) {
        const im = new Image();
        im.src = url;
        imgCacheRef.current.set(entry.id, im);
      }
      const idxInAll = p.allEntries.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idxInAll < 0 ? i : idxInAll),
        initials: initials[i],
        hole: hole[i],
        hand: null,
      };
    });
    boardRef.current = board;
    revealedRef.current = 0;
    riskIdxRef.current = [];
    leaderIdxRef.current = [];
    bustedIdxRef.current = null;
    suddenRef.current = null;
    suddenRoundRef.current = 0;
    declaredRef.current = false;
    flashRef.current = 0;
    phaseRef.current = 'deal';
    phaseUntilRef.current = now + dur(T.deal);
    audio.playDeal();
  };

  /** Re-score every live hand against the cards revealed so far. */
  const rescore = () => {
    const board = boardRef.current.slice(0, revealedRef.current);
    if (board.length < 3) return;
    for (const pl of playersRef.current) {
      pl.hand = evaluateSeven([...pl.hole, ...board]);
    }
    const hands = playersRef.current.map((pl) => pl.hand!).filter(Boolean);
    riskIdxRef.current = weakestOf(hands);
    leaderIdxRef.current = strongestOf(hands);
  };

  const finishRound = () => {
    if (declaredRef.current) return;
    declaredRef.current = true;
    const idx = bustedIdxRef.current;
    if (idx === null) return;
    const player = playersRef.current[idx];
    audio.playBust();
    propsRef.current.onWinner(player.entry, player.hand?.name ?? 'HIGH CARD');
  };

  // ---- Start / stop on the racing flag -----------------------------------
  useEffect(() => {
    if (props.isRacing) {
      if (props.entries.length >= 2) startRound(performance.now());
    } else if (phaseRef.current !== 'ready' && declaredRef.current) {
      phaseRef.current = 'done';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the racing flag drives a round
  }, [props.isRacing]);

  // ---- Persistent draw + update loop -------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const advance = (now: number) => {
      const phase = phaseRef.current;
      if (phase === 'ready' || phase === 'done') return;
      if (now < phaseUntilRef.current) return;

      switch (phase) {
        case 'deal':
          revealedRef.current = 3;
          rescore();
          audio.playFlip();
          setTimeout(() => audio.playFlip(), 110);
          setTimeout(() => audio.playFlip(), 220);
          phaseRef.current = 'flop';
          phaseUntilRef.current = now + dur(T.flop);
          break;
        case 'flop':
          revealedRef.current = 4;
          rescore();
          audio.playFlip();
          phaseRef.current = 'turn';
          phaseUntilRef.current = now + dur(T.turn);
          break;
        case 'turn':
          revealedRef.current = 5;
          rescore();
          audio.playRiver();
          phaseRef.current = 'river';
          phaseUntilRef.current = now + dur(T.river);
          break;
        case 'river': {
          audio.playShowdown();
          const tied = riskIdxRef.current;
          if (tied.length > 1) {
            const ids = tied.map((i) => i);
            suddenRef.current = suddenDeath(ids);
            suddenRoundRef.current = 0;
            suddenUntilRef.current = now + dur(T.suddenRound);
            audio.playSuddenDeathTick(0.2);
            phaseRef.current = 'sudden';
            phaseUntilRef.current = Number.MAX_SAFE_INTEGER;
          } else {
            bustedIdxRef.current = tied[0] ?? 0;
            flashRef.current = 1;
            phaseRef.current = 'showdown';
            phaseUntilRef.current = now + dur(T.showdown);
          }
          break;
        }
        case 'showdown':
          finishRound();
          phaseRef.current = 'done';
          break;
        case 'sudden':
          break;
      }
    };

    const advanceSudden = (now: number) => {
      if (phaseRef.current !== 'sudden') return;
      const sd = suddenRef.current;
      if (!sd || now < suddenUntilRef.current) return;

      if (suddenRoundRef.current < sd.rounds.length - 1) {
        suddenRoundRef.current++;
        suddenUntilRef.current = now + dur(T.suddenRound);
        audio.playSuddenDeathTick(0.4 + suddenRoundRef.current * 0.2);
        return;
      }
      // Last round shown — hold on the result, then bust.
      bustedIdxRef.current = sd.bustedId;
      flashRef.current = 1;
      phaseRef.current = 'showdown';
      phaseUntilRef.current = now + dur(T.suddenHold);
    };

    // ---- Drawing ---------------------------------------------------------
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    const drawCard = (
      card: Card | null,
      x: number,
      y: number,
      w: number,
      h: number,
      opts: { dim?: boolean; glow?: string } = {}
    ) => {
      ctx.save();
      if (opts.glow) {
        ctx.shadowColor = opts.glow;
        ctx.shadowBlur = 14;
      }
      if (card) {
        ctx.fillStyle = opts.dim ? '#8d8f98' : '#f6f4ee';
        roundRect(x, y, w, h, Math.max(3, w * 0.12));
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        roundRect(x, y, w, h, Math.max(3, w * 0.12));
        ctx.stroke();

        const red = SUIT_IS_RED[card.suit];
        ctx.fillStyle = opts.dim ? '#5a5c66' : red ? '#c8102e' : '#16181f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const big = w >= 34;
        ctx.font = `bold ${Math.round(w * (big ? 0.46 : 0.52))}px system-ui, sans-serif`;
        ctx.fillText(rankLabel(card.rank), x + w / 2, y + h * (big ? 0.36 : 0.34));
        ctx.font = `${Math.round(w * (big ? 0.42 : 0.46))}px system-ui, sans-serif`;
        ctx.fillText(SUIT_SYMBOL[card.suit], x + w / 2, y + h * (big ? 0.7 : 0.71));
      } else {
        // Face down.
        ctx.fillStyle = '#2c3f78';
        roundRect(x, y, w, h, Math.max(3, w * 0.12));
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(2, w * 0.1));
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawTable = (now: number) => {
      // Room
      const bg = ctx.createRadialGradient(TABLE_CX, TABLE_CY, 60, TABLE_CX, TABLE_CY, 560);
      bg.addColorStop(0, '#20242e');
      bg.addColorStop(1, '#0d0f14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Rail
      ctx.fillStyle = '#4a3222';
      ctx.beginPath();
      ctx.ellipse(TABLE_CX, TABLE_CY, FELT_RX + 22, FELT_RY + 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Felt
      const felt = ctx.createRadialGradient(TABLE_CX, TABLE_CY - 40, 30, TABLE_CX, TABLE_CY, FELT_RX);
      felt.addColorStop(0, '#1f6b46');
      felt.addColorStop(1, '#10422b');
      ctx.fillStyle = felt;
      ctx.beginPath();
      ctx.ellipse(TABLE_CX, TABLE_CY, FELT_RX, FELT_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(TABLE_CX, TABLE_CY, FELT_RX - 14, FELT_RY - 14, 0, 0, Math.PI * 2);
      ctx.stroke();

      void now;
    };

    const drawCommunity = (now: number) => {
      const slots = communitySlots(CARD_W, 12);
      const revealed = revealedRef.current;
      for (let i = 0; i < 5; i++) {
        const showing = i < revealed;
        const justFlipped = showing && i >= revealed - (revealed === 3 ? 3 : 1);
        const glow = justFlipped && phaseRef.current !== 'done' ? 'rgba(255,214,102,0.8)' : undefined;
        drawCard(showing ? boardRef.current[i] : null, slots[i].x, slots[i].y, CARD_W, CARD_H, { glow });
      }

      // Street caption under the board.
      const label =
        phaseRef.current === 'deal' ? 'DEALING…'
          : revealed === 3 ? 'THE FLOP'
            : revealed === 4 ? 'THE TURN'
              : revealed === 5 ? 'THE RIVER' : '';
      if (label) {
        ctx.save();
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.letterSpacing = '3px';
        ctx.fillText(label, TABLE_CX, slots[0].y + CARD_H + 26);
        ctx.restore();
      }
      void now;
    };

    const drawSeat = (player: Player, i: number, now: number) => {
      const seats = seatPositions(playersRef.current.length);
      const seat = seats[i];
      const tw = seatTileWidth(playersRef.current.length);
      const th = 66;
      const x = seat.x - tw / 2;
      const y = seat.y - th / 2;

      const isBusted = bustedIdxRef.current === i;
      const atRisk = !isBusted && riskIdxRef.current.includes(i) && revealedRef.current >= 3;
      const isLeader = leaderIdxRef.current.includes(i) && revealedRef.current >= 3;
      const settled = phaseRef.current === 'showdown' || phaseRef.current === 'done';
      const dim = settled && !isBusted;

      ctx.save();
      if (isBusted) {
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
        ctx.shadowColor = `rgba(255,70,70,${pulse})`;
        ctx.shadowBlur = 22;
      }
      ctx.fillStyle = isBusted ? 'rgba(92,22,26,0.96)' : dim ? 'rgba(18,22,30,0.72)' : 'rgba(24,29,39,0.94)';
      roundRect(x, y, tw, th, 9);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isBusted
        ? '#ff5a5a'
        : atRisk
          ? 'rgba(255,170,60,0.95)'
          : isLeader
            ? 'rgba(255,214,102,0.75)'
            : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = isBusted || atRisk ? 2.4 : 1.2;
      roundRect(x, y, tw, th, 9);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = dim ? 0.55 : 1;

      // Avatar disc (photo when there is one).
      const ax = x + 16;
      const ay = y + 17;
      const img = imgCacheRef.current.get(player.entry.id);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, 11, 0, Math.PI * 2);
      ctx.closePath();
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.clip();
        ctx.drawImage(img, ax - 11, ay - 11, 22, 22);
      } else {
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.fillStyle = '#10131a';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.initials.slice(0, 3), ax, ay + 0.5);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ax, ay, 11, 0, Math.PI * 2);
      ctx.stroke();

      // Name
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.entry.name.toUpperCase(), x + 31, y + 17, tw - 37);

      // Hole cards
      const cx0 = x + 8;
      const cy0 = y + 31;
      const faceUp = revealedRef.current >= 3;
      player.hole.forEach((card, k) => {
        drawCard(faceUp ? card : null, cx0 + k * (MINI_W + 3), cy0, MINI_W, MINI_H, { dim });
      });

      // Hand label
      if (player.hand) {
        ctx.fillStyle = isBusted ? '#ffb3b3' : atRisk ? '#ffc46b' : 'rgba(255,255,255,0.78)';
        ctx.font = `bold ${tw >= 104 ? 10 : 9}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(player.hand.shortLabel, cx0 + MINI_W * 2 + 10, cy0 + MINI_H / 2, tw - MINI_W * 2 - 20);
      }

      // Status flags
      if (atRisk) {
        ctx.fillStyle = 'rgba(255,170,60,0.95)';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('AT RISK', x + tw - 7, y + 8);
      } else if (isLeader && !settled) {
        ctx.fillStyle = 'rgba(255,214,102,0.9)';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('♔', x + tw - 8, y + 9);
      }
      if (isBusted) {
        ctx.fillStyle = '#ff8080';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('BUSTED', x + tw - 7, y + 8);
      }
      ctx.restore();
    };

    const drawSuddenDeath = (now: number) => {
      const sd = suddenRef.current;
      if (!sd || sd.rounds.length === 0) return;
      const round = sd.rounds[Math.min(suddenRoundRef.current, sd.rounds.length - 1)];

      ctx.save();
      ctx.fillStyle = 'rgba(6,8,12,0.82)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd36b';
      ctx.font = 'bold 30px "Arial Black", system-ui, sans-serif';
      ctx.fillText('SUDDEN DEATH', TABLE_CX, 150);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('TIED FOR WORST — LOWEST CARD BUSTS', TABLE_CX, 178);

      const n = round.draws.length;
      const { cardW: cw, cardH: ch, gap, left } = suddenDeathLayout(n);
      const py = 240;
      const lowest = Math.min(...round.draws.map((d) => d.card.rank));

      round.draws.forEach((d, i) => {
        const px = left + i * (cw + gap);
        const player = playersRef.current[d.id];
        const isLow = d.card.rank === lowest;
        drawCard(d.card, px, py, cw, ch, {
          glow: isLow ? 'rgba(255,90,90,0.9)' : undefined,
        });
        ctx.fillStyle = isLow ? '#ff8080' : 'rgba(255,255,255,0.82)';
        // Full names stop fitting once the row is crowded; fall back to initials.
        const label = cw >= 38
          ? (player?.entry.name ?? '?').toUpperCase()
          : (player?.initials ?? '?');
        ctx.font = `bold ${cw >= 38 ? 11 : 9}px system-ui, sans-serif`;
        ctx.fillText(label, px + cw / 2, py + ch + 15, cw + gap);
      });

      if (sd.rounds.length > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText(
          `DRAW ${suddenRoundRef.current + 1} OF ${sd.rounds.length}`,
          TABLE_CX,
          py + ch + 40
        );
      }
      ctx.restore();
      void now;
    };

    const drawIdle = () => {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('POKER NIGHT', TABLE_CX, TABLE_CY - 12);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Worst hand at showdown busts out', TABLE_CX, TABLE_CY + 16);
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      advance(now);
      advanceSudden(now);

      drawTable(now);

      if (phaseRef.current === 'ready' && playersRef.current.length === 0) {
        drawIdle();
        raf = requestAnimationFrame(loop);
        return;
      }

      drawCommunity(now);
      playersRef.current.forEach((pl, i) => drawSeat(pl, i, now));

      if (phaseRef.current === 'sudden') drawSuddenDeath(now);

      // Result banner
      const busted = bustedIdxRef.current;
      if (busted !== null && (phaseRef.current === 'showdown' || phaseRef.current === 'done')) {
        const pl = playersRef.current[busted];
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(6,8,12,0.72)';
        roundRect(TABLE_CX - 210, TABLE_CY + 58, 420, 58, 10);
        ctx.fill();
        ctx.fillStyle = '#ff7a7a';
        ctx.font = 'bold 19px "Arial Black", system-ui, sans-serif';
        ctx.fillText(`${pl.entry.name.toUpperCase()} BUSTS OUT`, TABLE_CX, TABLE_CY + 82);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(pl.hand?.name ?? '', TABLE_CX, TABLE_CY + 104);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Mounted once: the loop reads the latest props and settings through refs.
  }, []);

  const cw = props.currentWinner;
  const details =
    cw && !cw.isLastPlayer && cw.bustedWith ? (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3, gap: 1 }}>
        <span style={{ fontSize: '0.8em', opacity: 0.75, letterSpacing: '0.06em' }}>💀 BUSTED WITH</span>
        <span style={{ fontSize: '1.2em', fontWeight: 800 }}>🃏 {cw.bustedWith}</span>
      </span>
    ) : undefined;

  return (
    <div className="poker-game">
      <div className="poker-canvas-host">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game-canvas" />
      </div>

      <WinnerDialog
        theme={props.theme}
        show={!!cw && !props.isRacing}
        isFinals={cw?.isLastPlayer ?? props.entries.length === 0}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline="💀 BUSTED"
        finalsHeadline="🏆 LAST ONE STANDING 🏆"
        nextLabel="🃏 Next Hand"
        detailsNode={details}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
