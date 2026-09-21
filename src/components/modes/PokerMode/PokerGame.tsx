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
import { PokerHandStrip } from './PokerHandStrip';
import * as audio from './pokerAudio';
import './PokerGame.css';

/** One end of a showdown: who held it, what it was, and the five cards. */
export interface PokerShowdownHand {
  player: string;
  hand: string;
  cards: Card[];
}

/** What the game reports when a hand resolves. */
export interface PokerRoundResult {
  /** The player the rule singled out, with their own five cards. */
  picked: PokerShowdownHand;
  /** The opposite end of the table, for contrast. Absent if it is the same player. */
  other?: PokerShowdownHand;
}

export interface PokerWinnerDisplay {
  name: string;
  imageDataUrl?: string;
  allImages?: string[];
  /** Worst-hand rule: the survivor nobody could bust. */
  isLastPlayer?: boolean;
  /** Best-hand rule: took the very first pot, so the overall champion. */
  isChampion?: boolean;
  /** The hand they were picked on, with their five cards. */
  picked?: PokerShowdownHand;
  /** The opposite end of that showdown. */
  other?: PokerShowdownHand;
}

interface Props {
  theme: WinnerTheme;
  entries: Entry[];
  allEntries: Entry[];
  onWinner: (picked: Entry, result: PokerRoundResult) => void;
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
  /** False while seated but not yet dealt in (pre-deal and post-session views). */
  dealt: boolean;
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
  const pickRef = useRef(settings.pick);
  pickRef.current = settings.pick;

  const phaseRef = useRef<Phase>('ready');
  const phaseUntilRef = useRef(0);
  const playersRef = useRef<Player[]>([]);
  const boardRef = useRef<Card[]>([]);
  const revealedRef = useRef(0);
  /** Indexes tied for the weakest hand — highlighted as at risk. */
  const worstIdxRef = useRef<number[]>([]);
  /** Indexes tied for the strongest hand — highlighted as leading. */
  const bestIdxRef = useRef<number[]>([]);
  const pickedIdxRef = useRef<number | null>(null);
  const suddenRef = useRef<SuddenDeathResult | null>(null);
  const suddenRoundRef = useRef(0);
  const suddenUntilRef = useRef(0);
  const declaredRef = useRef(false);
  /** Signature of the currently seated roster, so we reseat only when it changes. */
  const rosterSigRef = useRef('');
  const flashRef = useRef(0);
  const imgCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());

  const dur = (ms: number) => ms * pokerSpeedFactor(speedRef.current);

  /** Seat a list of people with no cards dealt — the lobby and post-game views. */
  const seatRoster = (list: Entry[]) => {
    const initials = computeInitials(list);
    const all = propsRef.current.allEntries;
    playersRef.current = list.map((entry, i) => {
      const url = getPreferredEntryImage(entry);
      if (url && !imgCacheRef.current.has(entry.id)) {
        const im = new Image();
        im.src = url;
        imgCacheRef.current.set(entry.id, im);
      }
      const idxInAll = all.findIndex((e) => e.id === entry.id);
      return {
        entry,
        color: generateColor(idxInAll < 0 ? i : idxInAll),
        initials: initials[i],
        hole: [],
        hand: null,
        dealt: false,
      };
    });
    boardRef.current = [];
    revealedRef.current = 0;
    worstIdxRef.current = [];
    bestIdxRef.current = [];
    pickedIdxRef.current = null;
    suddenRef.current = null;
  };

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
        dealt: true,
      };
    });
    boardRef.current = board;
    revealedRef.current = 0;
    worstIdxRef.current = [];
    bestIdxRef.current = [];
    pickedIdxRef.current = null;
    suddenRef.current = null;
    suddenRoundRef.current = 0;
    declaredRef.current = false;
    rosterSigRef.current = '';
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
    // Both ends get called out: who is in danger and who is on top. Only one
    // of them is the pick, but knowing both is what makes the board readable.
    worstIdxRef.current = weakestOf(hands);
    bestIdxRef.current = strongestOf(hands);
  };

  /** The end of the table the active rule picks from. */
  const spotlight = () => (pickRef.current === 'worst' ? worstIdxRef.current : bestIdxRef.current);

  const finishRound = () => {
    if (declaredRef.current) return;
    declaredRef.current = true;
    const idx = pickedIdxRef.current;
    if (idx === null) return;
    const player = playersRef.current[idx];
    if (pickRef.current === 'worst') audio.playBust();
    else audio.playChips();

    // Report both ends of the showdown so the dialog can show the winning and
    // the losing cards side by side. The picked player's own cards matter here:
    // after a sudden-death draw they are not necessarily the first tied seat,
    // and two players can hold the same-value hand out of different cards.
    const showdownOf = (i: number): PokerShowdownHand | undefined => {
      const pl = playersRef.current[i];
      return pl?.hand
        ? { player: pl.entry.name, hand: pl.hand.name, cards: pl.hand.cards }
        : undefined;
    };
    const otherEndIdxs = pickRef.current === 'worst' ? bestIdxRef.current : worstIdxRef.current;
    const otherIdx = otherEndIdxs.find((i) => i !== idx);

    const picked = showdownOf(idx);
    if (!picked) return;
    propsRef.current.onWinner(player.entry, {
      picked,
      other: otherIdx === undefined ? undefined : showdownOf(otherIdx),
    });
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
          const tied = spotlight();
          if (tied.length > 1) {
            // Lowest card busts under the worst-hand rule; highest takes the
            // pot under the best-hand rule.
            suddenRef.current = suddenDeath(
              tied.map((i) => i),
              pickRef.current === 'worst' ? 'low' : 'high'
            );
            suddenRoundRef.current = 0;
            suddenUntilRef.current = now + dur(T.suddenRound);
            audio.playSuddenDeathTick(0.2);
            phaseRef.current = 'sudden';
            phaseUntilRef.current = Number.MAX_SAFE_INTEGER;
          } else {
            pickedIdxRef.current = tied[0] ?? 0;
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
      // Last round shown — hold on the result, then declare.
      pickedIdxRef.current = sd.pickedId;
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

      const takesWorst = pickRef.current === 'worst';
      const isPicked = pickedIdxRef.current === i;
      const scored = revealedRef.current >= 3;
      // Both ends of the table are called out every street: who is in danger
      // and who is on top. The active rule decides which one becomes the pick.
      const atRisk = scored && worstIdxRef.current.includes(i);
      const leading = scored && bestIdxRef.current.includes(i);
      // Busting is bad news (red); taking the pot is good news (gold).
      const pickHue = takesWorst ? '255,90,90' : '255,206,92';
      const RISK = '255,150,60';
      const LEAD = '255,214,102';

      ctx.save();
      if (isPicked) {
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
        ctx.shadowColor = `rgba(${pickHue},${pulse})`;
        ctx.shadowBlur = 22;
      }
      ctx.fillStyle = isPicked
        ? takesWorst ? 'rgba(92,22,26,0.96)' : 'rgba(74,58,16,0.96)'
        : atRisk ? 'rgba(46,28,20,0.94)'
          : leading ? 'rgba(40,36,18,0.94)'
            : 'rgba(24,29,39,0.94)';
      roundRect(x, y, tw, th, 9);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isPicked
        ? `rgba(${pickHue},1)`
        : atRisk ? `rgba(${RISK},0.95)`
          : leading ? `rgba(${LEAD},0.95)`
            : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = isPicked || atRisk || leading ? 2.2 : 1.2;
      roundRect(x, y, tw, th, 9);
      ctx.stroke();
      ctx.restore();

      ctx.save();

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

      // Hole cards. Once they are face up they stay fully legible — dimming
      // the losing hands made them unreadable exactly when you want to read
      // them. Seated-but-not-dealt players show two card backs.
      const cx0 = x + 8;
      const cy0 = y + 31;
      const faceUp = revealedRef.current >= 3;
      const backs: (Card | null)[] = player.dealt ? player.hole : [null, null];
      backs.forEach((card, k) => {
        drawCard(faceUp ? card : null, cx0 + k * (MINI_W + 3), cy0, MINI_W, MINI_H);
      });

      // Hand label
      if (player.hand) {
        ctx.fillStyle = isPicked
          ? takesWorst ? '#ffb3b3' : '#ffe9a8'
          : atRisk ? `rgba(${RISK},1)`
            : leading ? `rgba(${LEAD},1)`
              : 'rgba(255,255,255,0.78)';
        ctx.font = `bold ${tw >= 104 ? 10 : 9}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(player.hand.shortLabel, cx0 + MINI_W * 2 + 10, cy0 + MINI_H / 2, tw - MINI_W * 2 - 20);
      }

      // Status flags. A player can be both ends at once only in degenerate
      // cases, so the pick and then the rule's own end win the label.
      ctx.textAlign = 'right';
      if (isPicked) {
        ctx.fillStyle = takesWorst ? '#ff8080' : '#ffd76b';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText(takesWorst ? 'BUSTED' : 'WINS', x + tw - 7, y + 8);
      } else if (atRisk && (!leading || takesWorst)) {
        ctx.fillStyle = `rgba(${RISK},0.95)`;
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillText('AT RISK', x + tw - 7, y + 8);
      } else if (leading) {
        ctx.fillStyle = `rgba(${LEAD},0.95)`;
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillText('LEADING', x + tw - 7, y + 8);
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
      ctx.fillText(
        pickRef.current === 'worst'
          ? 'TIED FOR WORST — LOWEST CARD BUSTS'
          : 'TIED FOR BEST — HIGHEST CARD TAKES IT',
        TABLE_CX,
        178
      );

      const n = round.draws.length;
      const { cardW: cw, cardH: ch, gap, left } = suddenDeathLayout(n);
      const py = 240;
      const ranks = round.draws.map((d) => d.card.rank);
      const edge = pickRef.current === 'worst' ? Math.min(...ranks) : Math.max(...ranks);

      round.draws.forEach((d, i) => {
        const px = left + i * (cw + gap);
        const player = playersRef.current[d.id];
        const isEdge = d.card.rank === edge;
        const edgeGlow = pickRef.current === 'worst' ? 'rgba(255,90,90,0.9)' : 'rgba(255,214,102,0.9)';
        drawCard(d.card, px, py, cw, ch, { glow: isEdge ? edgeGlow : undefined });
        ctx.fillStyle = isEdge
          ? pickRef.current === 'worst' ? '#ff8080' : '#ffd76b'
          : 'rgba(255,255,255,0.82)';
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
      ctx.fillText(
        pickRef.current === 'worst'
          ? 'Worst hand at showdown busts out'
          : 'Best hand at showdown takes the pot',
        TABLE_CX,
        TABLE_CY + 16
      );
      ctx.restore();
    };

    const loop = () => {
      const now = performance.now();
      advance(now);
      advanceSudden(now);

      // Seat the room whenever no hand is in play: everybody before the first
      // deal, and the whole field again once the session is over.
      const p = propsRef.current;
      const sessionOver = p.entries.length === 0 && !!p.currentWinner;
      if (!p.isRacing && (phaseRef.current === 'ready' || sessionOver)) {
        const list = sessionOver ? p.allEntries : p.entries;
        // The two views can hold identical id lists (nobody eliminated yet vs
        // everybody eliminated), so the tag has to be part of the signature.
        const signature = `${sessionOver ? 'end' : 'lobby'}:${list.map((e) => e.id).join(',')}`;
        if (signature !== rosterSigRef.current) {
          rosterSigRef.current = signature;
          seatRoster(list);
        }
      }

      drawTable(now);

      if (playersRef.current.length === 0) {
        drawIdle();
        raf = requestAnimationFrame(loop);
        return;
      }

      drawCommunity(now);
      playersRef.current.forEach((pl, i) => drawSeat(pl, i, now));

      if (phaseRef.current === 'sudden') drawSuddenDeath(now);

      // Result banner
      const picked = pickedIdxRef.current;
      if (picked !== null && (phaseRef.current === 'showdown' || phaseRef.current === 'done')) {
        const pl = playersRef.current[picked];
        const takesWorst = pickRef.current === 'worst';
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(6,8,12,0.72)';
        roundRect(TABLE_CX - 210, TABLE_CY + 58, 420, 58, 10);
        ctx.fill();
        ctx.fillStyle = takesWorst ? '#ff7a7a' : '#ffd76b';
        ctx.font = 'bold 19px "Arial Black", system-ui, sans-serif';
        ctx.fillText(
          `${pl.entry.name.toUpperCase()} ${takesWorst ? 'BUSTS OUT' : 'TAKES THE POT'}`,
          TABLE_CX,
          TABLE_CY + 82
        );
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
  const takesWorst = settings.pick === 'worst';
  const details =
    cw && !cw.isLastPlayer && cw.picked ? (
      <span className="poker-showdown">
        <span className="poker-showdown__block">
          <span className="poker-showdown__label">
            {takesWorst ? '💀 BUSTED WITH' : '🏆 WON WITH'}
          </span>
          <span className="poker-showdown__hand">{cw.picked.hand}</span>
          <PokerHandStrip cards={cw.picked.cards} />
        </span>
        {cw.other && (
          <span className="poker-showdown__block poker-showdown__block--other">
            <span className="poker-showdown__label">
              {takesWorst ? '🏆 BEST HAND' : '💀 WORST HAND'} — {cw.other.player}
            </span>
            <span className="poker-showdown__hand poker-showdown__hand--other">
              {cw.other.hand}
            </span>
            <PokerHandStrip cards={cw.other.cards} />
          </span>
        )}
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
        // Worst-hand rule: the survivor is the champion, so the last round is
        // the finale. Best-hand rule works like Racing — the very first pot is
        // the championship, and "finals" only means the standings are ready.
        isFinals={takesWorst ? (cw?.isLastPlayer ?? props.entries.length === 0) : props.entries.length === 0}
        goldTreatment={takesWorst ? undefined : cw?.isChampion}
        winner={{ name: cw?.name ?? '', imageDataUrl: cw?.imageDataUrl, allImages: cw?.allImages }}
        headline={takesWorst ? '💀 BUSTED' : '🏆 TAKES THE POT'}
        finalsHeadline={takesWorst ? '🏆 LAST ONE STANDING 🏆' : '🃏 LAST TO BE DEALT IN'}
        nextLabel="🃏 Next Hand"
        detailsNode={details}
        // No instant replay in this mode, so there is nothing to uncover by
        // shrinking the card — it stays up until the player acts on it.
        autoMinimize={false}
        onNext={props.onRaceComplete}
        onShowFinalStandings={() => props.onShowFinalStandings?.()}
      />
    </div>
  );
}
