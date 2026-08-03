import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gavel, Ticket, AlertTriangle, Clock, ShieldAlert, Pin } from 'lucide-react';
import { preserveGreek } from '../ui/greek';
import Simulator from '../../core/simulator';
import { buildMocRead } from '../../core/fracture';
import { weighContract, type WeighedContract, type ContractVerdict } from '../../core/contractScore';
import { pinStrike } from '../../data/gex';
import { UNIVERSE } from '../../data/universe';
import { VERDICT_LABEL, VERDICT_TONE } from './verdict';
import { computeClock, lottoGateArmed } from './mocClock';
import ContractTrack from './ContractTrack';
import { weighedToPlan } from './contractTrackModel';
import type { Verdict } from '../../types/compass';
import type { MocRead } from '../../types/fracture';
import type { MarketSnapshot } from '../../types/market';
import { DUR, EASE, PILL } from '../../lib/motion';
import Panel from '../ui/Panel';
import EmptyState from '../ui/EmptyState';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import Skeleton from '../ui/Skeleton';
import { ROW_INTERACTIVE } from '../ui/interactiveRow';
import type { Tone } from '../ui/tones';
import { fmtUsd } from '../../data/gex';

const mocToneOf = (moc: MocRead): Tone =>
  moc.classification === 'CONTINUATION'
    ? moc.side === 'BUY'
      ? 'bull'
      : 'bear'
    : moc.classification === 'ABSORPTION FADE'
      ? 'warn'
      : moc.classification === 'DISLOCATION REVERSAL'
        ? 'magenta'
        : 'neutral';

/**
 * One grade lexicon across the terminal. The engine keeps BUY/WATCH/FADE; every
 * screen renders QUALIFIED / WATCH / FADED through verdict.ts. This board used
 * to carry a third private set (QUALIFIES / CONDITIONAL / REJECTED) with its own
 * tone map, so the same state was spoken three ways depending on the pane.
 */
const GRADE_VERDICT: Record<ContractVerdict, Verdict> = { BUY: 'ENTER', WATCH: 'WATCH', FADE: 'EXIT' };

/* ================================================================
   The auction board model. Direction is read off buildMoc's own
   notes rather than off moc.side, because two of the four
   classifications argue for the side OPPOSITE the imbalance.
   ================================================================ */

interface AuctionRead {
  ticker: string;
  moc: MocRead;
  /** The side the classification argues for. Null when it argues for none. */
  side: 'C' | 'P' | null;
  stance: 'WITH' | 'AGAINST' | 'NONE';
  /** One sentence naming what the board is doing and why. */
  reason: string;
  /** Same-day unless the classification says the trade is after the cross. */
  boardDte: 0 | 1;
  strength: number;
  actionable: boolean;
}

const sideWord = (s: 'C' | 'P' | null) => (s === 'C' ? 'Calls' : s === 'P' ? 'Puts' : 'No side');

/** One signed format for the pane. The MOC score used to print a hyphen while
    its own scale label printed a typographic minus directly underneath. */
const signed = (v: number, digits = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;

function readAuction(snapshot: MarketSnapshot): AuctionRead {
  const moc = buildMocRead(snapshot);
  // BALANCED carries no direction to trade with or against, so it voids the
  // classification's argument no matter which one fired.
  const imbalance: 'C' | 'P' | null = moc.side === 'BUY' ? 'C' : moc.side === 'SELL' ? 'P' : null;
  const inverse: 'C' | 'P' | null = imbalance === 'C' ? 'P' : imbalance === 'P' ? 'C' : null;

  let side: 'C' | 'P' | null = null;
  let stance: AuctionRead['stance'] = 'NONE';
  let boardDte: 0 | 1 = 0;
  let reason: string;

  switch (moc.classification) {
    case 'CONTINUATION':
      // "trade the imbalance into the close"
      side = imbalance;
      stance = 'WITH';
      reason = `${sideWord(side)} only. The ${moc.side} imbalance is not being absorbed, so the board follows it into the cross.`;
      break;
    case 'ABSORPTION FADE':
      // "Fade the initial reaction once the imbalance demonstrably weakens"
      side = inverse;
      stance = 'AGAINST';
      reason = `${sideWord(side)} only. ${moc.absorptionPct}% of the ${moc.side} imbalance is being paired off, so the board takes the other side of the reaction.`;
      break;
    case 'DISLOCATION REVERSAL':
      // "take the mean-reversion after" the cross. There is no 0DTE after 16:00.
      side = inverse;
      stance = 'AGAINST';
      boardDte = 1;
      reason = `${sideWord(side)} only, and next session. The pressure looks mechanical, and the reversion comes after the cross, so there is no same-day ticket left to hold it.`;
      break;
    default:
      reason = `No side on ${snapshot.ticker}. The imbalance and the indicative displacement disagree, so the board is not naming a ticket here.`;
  }

  if (moc.side === 'BALANCED') {
    side = null;
    stance = 'NONE';
    boardDte = 0;
    reason = `No side on ${snapshot.ticker}. The auction is balanced, so there is no imbalance to follow or fade.`;
  }

  return { ticker: snapshot.ticker, moc, side, stance, reason, boardDte, strength: Math.abs(moc.score), actionable: side !== null };
}

/**
 * Board-local auction term, bounded at ±18 points and never folded into
 * `composite`. The flow factor already moves the composite by up to 26 points
 * across its range at weight 0.28, so an auction term worth two thirds of that
 * is the same order as the largest term the engine already tolerates. Keeping it
 * outside the composite is what lets a lotto grade stay comparable with the same
 * contract's grade on the Weigher.
 */
function auctionAdjust(c: WeighedContract, r: AuctionRead, mocOpen: boolean): number {
  if (!mocOpen || !r.side) return 0;
  const align = c.right === r.side ? 1 : -1;
  const raw = (Math.abs(r.moc.score) / 100) * 18 * (1 - r.moc.absorptionPct / 100) * (1 - r.moc.reversalRisk / 100);
  return Math.round(align * raw);
}

/**
 * Black-Scholes floors its price at $0.02 (contractScore.ts). Past that floor the
 * number stops being a price: theta over premium collapses, so the decay factor
 * reads "carryable" precisely because there is nothing left to burn, and a dead
 * strike outscores a live one. Measured on this board's own ladder names, ORCL
 * 0DTE puts run 59 / 43 / 39 / 43 / 57 / 59 walking away from spot, so the two
 * worthless strikes outrank three live ones. Nothing floored is ever ranked here.
 */
const isPriceable = (c: WeighedContract) => c.mid > 0.02 && Math.abs(c.delta) >= 0.01;

/**
 * The board's ticket ladder: the nearest listed strikes on one side, walked out
 * from the money on the chain's own grid.
 *
 * Percentage offsets were the obvious alternative and they do not survive
 * contact with the grid. A fixed 0.2%/0.4%/0.7% sweep is one strike apart on SPY
 * at $502 but lands on the SAME strike three times on AVGO at $175, where a $1
 * grid is 0.57% wide. Walking the grid gives six distinct listed contracts on
 * every name, which is also what a chain actually looks like.
 */
function lottoLadder(snapshot: MarketSnapshot, right: 'C' | 'P', dte: number, want = 6): WeighedContract[] {
  const sorted = [...snapshot.chain].sort((a, b) => a.strike - b.strike);
  const step = sorted.length > 1 ? Math.abs(sorted[1].strike - sorted[0].strike) : Math.max(snapshot.spot * 0.005, 0.5);
  const atm = Math.round(snapshot.spot / step) * step;
  const lo = sorted[0]?.strike ?? atm;
  const hi = sorted[sorted.length - 1]?.strike ?? atm;
  const out: WeighedContract[] = [];
  for (let k = 0; k <= 12 && out.length < want; k++) {
    const strike = right === 'C' ? atm + k * step : atm - k * step;
    if (strike < lo || strike > hi) break;
    const c = weighContract(snapshot, right, strike, dte);
    if (isPriceable(c)) out.push(c);
  }
  return out;
}

/**
 * What the closing auction is worth to THIS strike.
 *
 * The generic long-shot question is "does 1σ cover the breakeven". The MOC
 * question is "does the auction's own indicative displacement cover it by the
 * bell", and that answer differs per strike because the breakeven does. Both
 * inputs are read straight off the engines that own them: `displacementZ` from
 * buildMoc (σ units) and `expectedMovePct` from the scorer (% per σ).
 */
const auctionReach = (c: WeighedContract, moc: MocRead) => {
  const movePct = Math.abs(moc.displacementZ) * c.expectedMovePct;
  return { movePct, covers: movePct / Math.max(c.breakevenMovePct, 0.05) };
};

/* ---- MOC score gauge: -100 (sell) … 0 … +100 (buy) ---- */
const ScoreGauge = ({ score }: { score: number }) => {
  const pct = (score + 100) / 2; // 0..100
  return (
    <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
      <span
        className={`absolute top-0 bottom-0 ${score >= 0 ? 'left-1/2' : ''} ${score >= 0 ? 'bg-bull/80' : 'bg-bear/80'}`}
        style={score >= 0 ? { width: `${(pct - 50).toFixed(1)}%` } : { left: `${pct.toFixed(1)}%`, width: `${(50 - pct).toFixed(1)}%` }}
      />
      <span className="absolute -top-0.5 h-3 w-[2px] bg-textPrimary rounded-full" style={{ left: `calc(${pct.toFixed(1)}% - 1px)` }} aria-hidden />
    </div>
  );
};

/* ---- imbalance growth: the one signed growth term the model publishes ---- */
/**
 * This used to be a five-bar timeline stamped 3:50 / 3:52 / 3:54 / 3:56 / 3:58,
 * with each bar synthesised as `normalizedZ * shape` off a power curve. buildMoc
 * publishes a single `growthZ` for the whole window and no per-print history at
 * all, so those timestamps and that curve were invented to look like auction
 * evidence under a panel titled exactly that. One term exists; one term is shown.
 */
const GrowthRead = ({ moc }: { moc: MocRead }) => {
  // The imbalance is BUILDING only when growth runs the same way as the
  // imbalance itself. A positive growth term against a SELL imbalance is that
  // imbalance shrinking, which the old `growthZ >= 0` test called building and
  // then coloured with the imbalance's own side. buildMoc's own CONTINUATION
  // test uses this product, so the board and the engine now agree on the word.
  const building = moc.growthZ * moc.normalizedZ > 0;
  const side: Tone = moc.normalizedZ >= 0 ? 'bull' : 'bear';
  // growthZ is a gaussian scaled to 0.9, so ±2σ is the practical rail. The bar
  // pins there rather than rescaling its own axis under the reader.
  const fill = Math.min(100, (Math.abs(moc.growthZ) / 2) * 100);
  const barClass = building ? (side === 'bull' ? 'bg-bull/70' : 'bg-bear/70') : 'bg-white/25';
  const numClass = building ? (side === 'bull' ? 'text-bull' : 'text-bear') : 'text-textSecondary';
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-micro uppercase tracking-widest text-textMuted">Imbalance growth</span>
        <SignalBadge tone={building ? side : 'neutral'}>{building ? 'building into the cross' : 'fading pre-cross'}</SignalBadge>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-data font-bold tnum ${numClass}`}>{signed(moc.growthZ, 2)}σ</span>
        <span className="font-mono text-micro text-textMuted">over the window&apos;s last updates</span>
      </div>
      <div className="mt-2 relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <span className={`absolute inset-y-0 left-0 rounded-full ${barClass}`} style={{ width: `${fill.toFixed(1)}%` }} aria-hidden />
      </div>
      <p className="mt-2 font-mono text-micro text-textMuted leading-relaxed">
        Magnitude against a ±2σ rail. The model carries one growth term for the window, not a print-by-print history.
      </p>
    </div>
  );
};

/* ---- one auction chip in the ladder strip ---- */
const LadderChip = ({
  r,
  selected,
  active,
  onSelect,
}: {
  r: AuctionRead;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    role="radio"
    aria-checked={selected}
    onClick={onSelect}
    aria-label={`${r.ticker}, ${r.moc.classification.toLowerCase()}, ${r.moc.side.toLowerCase()} imbalance, score ${r.moc.score >= 0 ? 'plus' : 'minus'} ${Math.abs(r.moc.score)}${r.actionable ? `, board takes ${sideWord(r.side).toLowerCase()}` : ', no ticket'}`}
    className={`relative shrink-0 -my-1 py-2 px-2.5 rounded-md border text-left transition-colors ${ROW_INTERACTIVE} ${
      selected ? 'border-select/40' : 'border-borderSubtle hover:bg-rowHover'
    } ${r.actionable ? '' : 'opacity-60'}`}
  >
    {selected && (
      <motion.span layoutId="moc-ladder-pill" transition={PILL} className="absolute inset-0 rounded-md bg-white/[0.06]" aria-hidden />
    )}
    <span className="relative flex items-center gap-2">
      <span className="font-mono text-caption font-semibold text-textPrimary">{r.ticker}</span>
      {active && <span className="font-mono text-micro uppercase tracking-wider text-textMuted">active</span>}
      <span className="font-mono text-caption tnum text-textSecondary w-[4ch] text-right">{signed(r.moc.score)}</span>
    </span>
    <span className="relative mt-1 flex items-center gap-1.5">
      <SignalBadge tone={mocToneOf(r.moc)}>{r.moc.classification}</SignalBadge>
    </span>
  </button>
);

/* ---- one lotto ticket row ---- */
const LottoRow = ({
  c,
  moc,
  adjust,
  pin,
  hoursToBell,
  best,
  selected,
  onSelect,
  counter = false,
}: {
  c: WeighedContract;
  moc: MocRead;
  adjust: number;
  pin: number;
  hoursToBell: number | null;
  best: boolean;
  selected: boolean;
  onSelect: () => void;
  counter?: boolean;
}) => {
  const rightColor = c.right === 'C' ? 'text-bull' : 'text-bear';
  const graded = c.composite + adjust;
  const reach = auctionReach(c, moc);
  const onPin = c.strike === pin;
  // Today's countdown only settles a same-session ticket, and only while the
  // session is running. A 1DTE board (DISLOCATION REVERSAL) and a board read
  // after the close both expire at the NEXT bell, so neither the theta line nor
  // the breakeven sentence may point at today's. They used to disagree: the
  // theta line already fell back to "next session", while the sentence beside it
  // said "by the bell" on every row unconditionally.
  const bellHours = c.dte === 0 ? hoursToBell : null;

  return (
    /* A row is the handle on the contract track below the board, so it is a real
       control rather than a div with a cursor. No selection rail: the wash is the
       marker the rest of this desk uses on a picked card. */
    <motion.button
      type="button"
      layout="position"
      transition={{ duration: DUR.reflow, ease: EASE }}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${c.ticker} ${c.strike}${c.right === 'C' ? ' call' : ' put'}, ${
        c.dte === 0 ? 'same session' : `${c.dte} day`
      }, mid $${c.mid.toFixed(2)}, grades ${graded}. Chart this ticket.`}
      className={`w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors ${ROW_INTERACTIVE} ${
        selected ? 'bg-select/[0.06]' : best ? 'bg-white/[0.02] hover:bg-rowHover' : 'hover:bg-rowHover'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-data font-semibold text-textPrimary tnum">
            {c.ticker} {c.strike}
            <span className={rightColor}>{c.right}</span>
          </span>
          <span className="font-mono text-micro uppercase tracking-wider text-textMuted border border-borderSubtle rounded px-1 py-px">
            {c.dte === 0 ? '0DTE' : `${c.dte}DTE`}
          </span>
          {best && <SignalBadge tone="select">Top ticket</SignalBadge>}
          {counter && <SignalBadge tone="warn">counter-auction</SignalBadge>}
          {/* Which side the board is taking is a property of the board, not of a
              row, and it is already stated in the panel subtitle and the
              playbook. Printing it on every row is what made the old `c.edge`
              line worthless: the same sentence on six rows carries nothing. The
              chip a row earns is its own auction reach, which changes at every
              strike and is where the board stops being worth taking. */}
          <SignalBadge tone={reach.covers >= 1 ? 'select' : 'warn'}>
            auction {reach.covers >= 1 ? 'covers' : 'short'} {reach.covers.toFixed(1)}x
          </SignalBadge>
          {onPin && (
            <SignalBadge tone="warn">
              <Pin className="w-2.5 h-2.5" aria-hidden /> at the pin
            </SignalBadge>
          )}
        </div>
        <div className="mt-1 font-mono text-label text-textMuted leading-relaxed">
          Needs {Math.abs(c.breakevenMovePct).toFixed(2)}% {bellHours === null ? 'by the next bell' : 'by the bell'}. The auction
          is displacing{' '}
          {Math.abs(moc.displacementZ).toFixed(2)}σ, worth {reach.movePct.toFixed(2)}% on this strike.
          {onPin ? ` Dealers are heaviest on ${c.strike}, so it has to break its own pin.` : ''}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{preserveGreek('±1σ')}</span>
        <span className="font-mono text-caption text-textSecondary tnum">{c.expectedMovePct.toFixed(1)}%</span>
      </div>
      <div className="hidden md:flex flex-col items-end shrink-0 w-[76px]">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">{preserveGreek('θ/day')}</span>
        <span className="font-mono text-caption text-warn tnum">−{c.thetaPerDayPct.toFixed(0)}%</span>
        <span className="font-mono text-micro text-textMuted tnum">
          {bellHours === null ? 'next session' : `${bellHours.toFixed(1)}h to bell`}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0 w-14">
        <span className="font-mono text-micro uppercase tracking-wider text-textMuted">mid</span>
        <span className="font-mono text-caption text-textPrimary tnum">${c.mid.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2.5 shrink-0 justify-end">
        <div className="flex flex-col items-end">
          <div className="flex items-baseline gap-1">
            {adjust !== 0 && (
              <>
                <span className="font-mono text-caption text-textMuted tnum w-[3ch] text-right">{c.composite}</span>
                <span className="font-mono text-caption text-textMuted" aria-hidden>
                  →
                </span>
              </>
            )}
            <span className="font-mono text-lg font-bold text-textPrimary tnum w-[3ch] text-right">{graded}</span>
          </div>
          {adjust !== 0 && (
            <span className="font-mono text-micro text-textMuted tnum">
              ({adjust > 0 ? '+' : ''}
              {adjust} auction)
            </span>
          )}
        </div>
        <SignalBadge tone={VERDICT_TONE[GRADE_VERDICT[c.verdict]]} className="min-w-[96px] justify-center">
          {VERDICT_LABEL[GRADE_VERDICT[c.verdict]]}
        </SignalBadge>
      </div>
    </motion.button>
  );
};

/**
 * Compass's third mode: the closing-auction lotto desk.
 *
 * The board used to be one flat `weighContracts(snapshot, 'LOTTO').slice(0, 6)`
 * on the active ticker. Composite is a quality score with no direction in it, so
 * a call and a put on the same underlying sorted into one list and the page
 * presented a 504C above a 501P as if that were an opinion. It is now a function
 * of the MOC read: the auction names a side, the board only lists that side, and
 * the other side lives in a labelled collapse instead of interleaved.
 */
interface LottoBoardProps {
  snapshot: MarketSnapshot;
}

const LottoBoard = ({ snapshot }: LottoBoardProps) => {
  const activeTicker = snapshot.ticker;

  // The gate stores WHICH product was accepted, not merely that something was.
  // It used to be a bare boolean under a paragraph hard-coded to "same-session",
  // so a DISLOCATION REVERSAL board — next session, held through the overnight
  // gap — unlocked on an acknowledgement of a risk it does not carry.
  const [ackedDte, setAckedDte] = useState<0 | 1 | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /** WeighedContract id of the ticket the track below the board is drawing. */
  const [pickedTicket, setPickedTicket] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [warmed, setWarmed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const clock = useMemo(() => computeClock(nowTick), [nowTick]);

  const ladderNames = useMemo(
    () => Array.from(new Set([activeTicker, ...Simulator.WATCHLIST, ...UNIVERSE.slice(0, 8).map(u => u.ticker)])),
    [activeTicker]
  );

  // Seeding a name the simulator has not met costs ~70ms (22 sessions of
  // minute bars), and this ladder asks for six it usually has not. Doing that
  // inside render is a measured ~450ms stall on the frame that mounts the pane,
  // so names are seeded one per task: the page paints, then the strip fills in.
  useEffect(() => {
    const pending = ladderNames.filter(n => !Simulator.TICKERS[n]);
    if (pending.length === 0) return;
    let i = 0;
    let id: ReturnType<typeof setTimeout>;
    const step = () => {
      Simulator.ensureTicker(pending[i]);
      i += 1;
      setWarmed(w => w + 1);
      if (i < pending.length) id = setTimeout(step, 0);
    };
    id = setTimeout(step, 0);
    return () => clearTimeout(id);
  }, [ladderNames]);

  // Only names the simulator already holds are read: buildSnapshot would seed a
  // missing one as a side effect, which is the stall the warm-up exists to avoid.
  // `snapshot` is a dependency rather than an input: the ladder reads every name
  // from the simulator, and the prop is what tells it a new sweep has landed.
  const reads = useMemo(() => {
    void warmed;
    void snapshot;
    return ladderNames
      .filter(n => Simulator.TICKERS[n])
      .map(n => readAuction(Simulator.buildSnapshot(n)))
      .sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.strength - a.strength);
  }, [ladderNames, warmed, snapshot]);

  const pendingCount = ladderNames.length - reads.length;

  // Open on a name that actually has tickets. SPY is frequently NO TRADE, and a
  // single-name board that refuses on NO TRADE is an empty page on arrival. The
  // redirect is stated on screen rather than performed quietly.
  const autoTicker = useMemo(() => {
    const own = reads.find(r => r.ticker === activeTicker);
    if (own?.actionable) return activeTicker;
    return reads.find(r => r.actionable)?.ticker ?? activeTicker;
  }, [reads, activeTicker]);

  const selectedTicker = picked ?? autoTicker;
  const selectedSnap = useMemo(() => {
    void snapshot;
    return Simulator.buildSnapshot(selectedTicker);
  }, [selectedTicker, snapshot]);

  const read = useMemo(() => readAuction(selectedSnap), [selectedSnap]);
  const moc = read.moc;

  /*
    The acknowledgement is proportional to what it is acknowledging.

    Measured with the page clock faked to five market states, the wall fired in
    all five — pre-market, mid-session, the MOC window, after the close, and on
    a Saturday — and the board was unreachable in every one. Two of those are
    states with nothing to trade at all, so the page was asking consent to a
    total loss on a session that had already settled. A gate that fires
    unconditionally trains people to dismiss it unread, which defeats the only
    thing it is for.

    So it fires in the window where it bites: 15:45 to 16:00 ET, when a
    same-session ticket is minutes from being worth its intrinsic or nothing.
    Outside it the board shows and the risk paragraph stays pinned above it,
    unchanged and unweakened — relocated, not softened.
  */
  const gateArmed = lottoGateArmed(clock);
  // Switching from a same-session name to a next-session one re-arms the gate:
  // the paragraph the user accepted no longer describes the board behind it.
  const acked = !gateArmed || ackedDte === read.boardDte;
  const pin = useMemo(() => pinStrike(selectedSnap, 6), [selectedSnap]);

  const board = useMemo(
    () => (read.side ? lottoLadder(selectedSnap, read.side, read.boardDte) : []),
    [selectedSnap, read.side, read.boardDte]
  );
  const counter = useMemo(
    () => (read.side ? lottoLadder(selectedSnap, read.side === 'C' ? 'P' : 'C', read.boardDte) : []),
    [selectedSnap, read.side, read.boardDte]
  );

  // Ranking, filtering and the auction term all happen here, never inside
  // weighContracts, which the Weigher shares.
  const rank = (rows: WeighedContract[]) =>
    rows
      .map(c => ({ c, adjust: auctionAdjust(c, read, clock.mocOpen) }))
      .sort((a, b) => b.c.composite + b.adjust - (a.c.composite + a.adjust));
  const ranked = rank(board);
  const rankedCounter = rank(counter);

  /* The ticket the track draws. Resolved rather than reset: switching name, side
     or session rebuilds the ladder, and a stale id simply stops matching, so the
     board falls back to its own top ticket without an effect chasing it. */
  const trackedTicket =
    [...ranked, ...rankedCounter].find(r => r.c.id === pickedTicket)?.c ?? ranked[0]?.c ?? null;
  const trackPlan = trackedTicket ? weighedToPlan(trackedTicket) : null;

  const mocTone = mocToneOf(moc);
  const qualifies = board.filter(c => c.verdict === 'BUY').length;
  // Rounded to the tenth of an hour it is printed at, so the value handed to the
  // rows changes every six minutes rather than on every one-second clock tick.
  const hoursToBell = clock.marketOpen ? Math.round(clock.secsToClose / 360) / 10 : null;
  const redirected = selectedTicker !== activeTicker;

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="170px">
        <StatCard label="Auction read" value={moc.classification} sub={`${selectedTicker} closing auction`} tone={mocTone} emphasis />
        <StatCard
          label="MOC score"
          value={<span className="inline-block w-[4ch] text-right">{signed(moc.score)}</span>}
          sub="−100 sell … +100 buy"
          tone={moc.score >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Imbalance"
          value={`${moc.side} ${fmtUsd(Math.abs(moc.imbalanceUsd))}`}
          sub={`${signed(moc.normalizedZ, 2)}σ normalized`}
          tone={moc.side === 'BUY' ? 'bull' : moc.side === 'SELL' ? 'bear' : 'neutral'}
        />
        <StatCard
          label="Time to close"
          value={clock.marketOpen ? clock.toClose : 'closed'}
          sub={clock.label}
          tone={clock.mocOpen ? 'warn' : clock.marketOpen ? 'select' : 'neutral'}
        />
        <StatCard
          label="Board"
          value={sideWord(read.side)}
          sub={read.side ? `${qualifies} of ${board.length} qualify` : 'no ticket on this name'}
          tone={read.side ? 'select' : 'neutral'}
        />
      </MetricGrid>

      {/* The ladder. 24 names measured across a session run 13 NO TRADE, so a
          one-name board would be blank most of the time; this one never is. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Gavel className="w-3.5 h-3.5" /> Closing auction reads
          </span>
        }
        subtitle="actionable names first"
        bodyClassName="py-2.5"
      >
        <div role="radiogroup" aria-label="Closing auction reads" className="flex gap-2 overflow-x-auto pb-1">
          {reads.map(r => (
            <LadderChip
              key={r.ticker}
              r={r}
              selected={r.ticker === selectedTicker}
              active={r.ticker === activeTicker}
              onSelect={() => setPicked(r.ticker)}
            />
          ))}
          {/* Placeholder built from the chip's own padding rather than a
              measured height, so a name landing mid-warm-up does not jog the
              strip by however much the constant had drifted. */}
          {Array.from({ length: Math.max(0, pendingCount) }).map((_, i) => (
            <div key={`pending-${i}`} className="shrink-0 -my-1 py-2 px-2.5 rounded-md border border-borderSubtle" aria-hidden>
              <Skeleton className="h-[17px] w-16 rounded" />
              <Skeleton className="mt-1 h-[18px] w-24 rounded" />
            </div>
          ))}
        </div>
      </Panel>

      {/* Playbook: what the board is doing, then the engine's own note. */}
      <Panel bodyClassName="py-3" tone={mocTone}>
        <div className="flex flex-col gap-2">
          <p className="text-caption text-textPrimary leading-relaxed">
            <span className="font-mono text-micro font-semibold uppercase tracking-widest text-textMuted mr-2">Playbook</span>
            {read.reason}
          </p>
          {redirected && (
            <p className="font-mono text-label text-textMuted leading-relaxed">
              {activeTicker} has no actionable closing-auction read right now, so the board opened on {selectedTicker}. Pick any
              name above to change it.
            </p>
          )}
          <p className="flex items-start gap-2 font-mono text-label text-textMuted leading-relaxed border-t border-borderSubtle pt-2">
            <Clock className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
            <span aria-live="polite">
              {clock.mocOpen
                ? 'MOC window open. Grades carry the auction term.'
                : 'The auction has not published. Grades are flow and liquidity only.'}{' '}
              This is the modelled closing-auction read for the session, not an exchange feed.
            </span>
          </p>
        </div>
      </Panel>

      <Panel tone="warn" bodyClassName="py-2.5">
        <p className="flex items-start gap-2 text-caption text-textSecondary leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" aria-hidden />
          <span>
            <span className="font-mono text-micro font-semibold uppercase tracking-widest text-warn mr-2">Lotto risk</span>
            Closing-auction plays are all-or-nothing. Theta is measured per hour, a contract can go to zero the same session, and
            the imbalance printed at 3:50 is not the one that clears. Size for a total loss.
          </span>
        </p>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Ticket className="w-3.5 h-3.5" /> {read.boardDte}DTE lotto board
          </span>
        }
        subtitle={
          // Computed, never hardcoded. The old title read "0DTE lotto board"
          // over a 0-and-1DTE mix, and said nothing about which way the board
          // was leaning relative to the imbalance printed above it.
          //
          // With the market shut the board is a read on a session that has not
          // opened, and saying so is the difference between a stale page and a
          // page about tomorrow.
          !clock.marketOpen
            ? `${clock.label} · these price the next session`
            : read.side
              ? `${sideWord(read.side)} only, ${read.stance === 'AGAINST' ? 'against' : 'with'} the ${moc.side} imbalance`
              : 'no side named on this read'
        }
        flush
      >
        {!acked ? (
          /* A bar, not a curtain. This used to be eight rows of centred
             padding around one paragraph, so the panel it gated was a hole in
             the page even in the states where it had no business firing. */
          <div className="px-3.5 py-3 flex items-start gap-3 flex-wrap border-b border-warn/20 bg-warn/[0.05]">
            <ShieldAlert className="w-4 h-4 text-warn shrink-0 mt-0.5" aria-hidden />
            <p className="flex-1 min-w-[24ch] text-caption text-textSecondary leading-relaxed">
              The cross is minutes away.{' '}
              {read.boardDte === 0
                ? 'These are same-session lotto tickets, held into today’s bell.'
                : 'These are next-session lotto tickets. This read argues for the reversion after the cross, so the ticket is carried through the close and the overnight gap.'}{' '}
              Most expire worthless. Only view the board if you accept that a full loss of the premium is the expected outcome.
            </p>
            <button
              onClick={() => setAckedDte(read.boardDte)}
              className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-warn/40 bg-warn/10 hover:bg-warn/15 font-mono text-label font-semibold uppercase tracking-wider text-warn transition-colors"
            >
              I accept a total loss, show the board
            </button>
          </div>
        ) : !read.side ? (
          <EmptyState size="lg" title="NO CLEAN AUCTION EDGE" body={moc.note}>
            <span className="font-mono text-label text-textMuted">Pick a name with an actionable read from the ladder above.</span>
          </EmptyState>
        ) : ranked.length === 0 ? (
          <EmptyState
            size="lg"
            title="NOTHING PRICEABLE"
            body={`Every listed ${sideWord(read.side).toLowerCase().slice(0, -1)} on this expiry sits at the model's $0.02 floor. There is no grade to give.`}
          />
        ) : (
          <div className="flex flex-col divide-y divide-borderSubtle">
            <AnimatePresence initial={false}>
              {ranked.map(({ c, adjust }, i) => (
                <LottoRow
                  key={c.id}
                  c={c}
                  moc={moc}
                  adjust={adjust}
                  pin={pin}
                  hoursToBell={hoursToBell}
                  best={i === 0}
                  selected={c.id === trackedTicket?.id}
                  onSelect={() => setPickedTicket(c.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </Panel>

      {/* What the ticket has been doing, and what an hour of standing still costs
          it. On a same-session lotto that second half IS the trade: the forward
          curve holds spot at the last close and lets only time run, which is the
          honest picture of a contract whose theta is measured per hour.

          Priced by the same Black-Scholes that graded the row (weighedToPlan
          pins the model), so the line ends on the mid printed beside it. No
          take-profit ladder is drawn, because this desk has none to draw: the
          empty ladder is a first-class state on the plan, and the strike and the
          breakeven are what lane B marks instead. */}
      {acked && trackPlan && (
        <ContractTrack key={trackPlan.key} plan={trackPlan} className="animate-soft-in" />
      )}

      {/* The other side, never interleaved. A call and a put on one underlying
          can no longer sit five rows apart in a single ranking. */}
      {acked && read.side && rankedCounter.length > 0 && (
        <details className="inst-surface rounded-md">
          <summary className="cursor-pointer px-3.5 h-10 flex items-center font-mono text-label font-semibold uppercase tracking-widest text-textSecondary hover:text-textPrimary">
            Against the auction ({rankedCounter.length})
          </summary>
          <div className="border-t border-borderSubtle">
            <p className="px-3.5 py-2.5 font-mono text-label text-textMuted leading-relaxed border-b border-borderSubtle">
              The {sideWord(read.side === 'C' ? 'P' : 'C').toLowerCase()} on the same expiry. They are graded, not ranked into the
              board, because the auction read argues the other way.
            </p>
            <div className="flex flex-col divide-y divide-borderSubtle">
              {rankedCounter.map(({ c, adjust }) => (
                <LottoRow
                  key={c.id}
                  c={c}
                  moc={moc}
                  adjust={adjust}
                  pin={pin}
                  hoursToBell={hoursToBell}
                  best={false}
                  selected={c.id === trackedTicket?.id}
                  onSelect={() => setPickedTicket(c.id)}
                  counter
                />
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Evidence, below the thing it explains. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Gavel className="w-3.5 h-3.5" /> {selectedTicker} auction evidence
          </span>
        }
        subtitle="the day's biggest scheduled forced-flow event"
        tone={mocTone}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`font-mono text-4xl font-bold tnum w-[5ch] text-right ${moc.score >= 0 ? 'text-bull' : 'text-bear'}`}>
              {signed(moc.score)}
            </span>
            <div className="flex flex-col gap-1">
              <SignalBadge tone={mocTone}>{moc.classification}</SignalBadge>
              <span className="font-mono text-label text-textMuted">
                {moc.side} imbalance {fmtUsd(Math.abs(moc.imbalanceUsd))}
              </span>
            </div>
          </div>

          <ScoreGauge score={moc.score} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: 'Norm. imbal', v: `${signed(moc.normalizedZ, 2)}σ` },
              { k: 'Displacement', v: `${signed(moc.displacementZ, 2)}σ` },
              { k: 'Absorbed', v: `${moc.absorptionPct}%` },
              { k: 'Reversal risk', v: `${moc.reversalRisk}%` },
            ].map(x => (
              <div key={x.k} className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
                <div className="font-mono text-micro uppercase tracking-widest text-textMuted">{x.k}</div>
                <div className="mt-1 font-mono text-body font-semibold text-textPrimary tnum leading-5">{x.v}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-borderSubtle pt-3">
            <GrowthRead moc={moc} />
          </div>

          <p className="text-caption text-textSecondary leading-relaxed">{moc.note}</p>
          <p className="flex items-start gap-1.5 font-mono text-micro text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
            <Pin className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
            Dealers are heaviest on {pin} into the close, so that strike is where the auction has to fight for every tick. Read
            growth, indicative displacement and absorption in the 3:53 to 3:57 window before the cross.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default LottoBoard;
