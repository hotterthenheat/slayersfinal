import { futuresPhaseAt, type FuturesPhase } from '../core/calendar';
import { h01, hRange } from '../core/rng';
import { twinFamilyFor, twinMeasureFor, twinPrice } from './indexTwins';
import Simulator from '../core/simulator';

/*
==================================================
  SLAYER TERMINAL - FUTURES (data/futures.ts)

  The front month, the roll, the settlement, and
  the session the cash tape never sees.
==================================================

  WHY THIS EXISTS AT ALL. The desk's whole 0DTE argument is that overnight
  risk decides the open — and the desk could not draw the overnight. Every
  chart starts at 09:30 because the cash tape does, so the eight hours in
  which the gap is actually formed were simply missing.

  THE CONTRACT IS NAMED PROPERLY, because a futures reader checks the code
  before anything else. Equity index futures roll QUARTERLY on the third
  Friday of March, June, September and December, and the code is
  root + month letter + year digit — ESZ26 is the December 2026 E-mini.
  Getting that wrong is the fastest way to look like a toy.

  THE ROLL IS A DATE WITH A COUNTDOWN, not a silent switch. Volume migrates
  to the next contract about a week before expiry, so "front month" is a
  claim with an expiry date on it and the UI says which one it means.

  THE OVERNIGHT SERIES IS SYNTHESISED FROM THE CASH TAPE, deterministically:
  the prior close anchors it, the Globex phases shape its activity (Asia
  thin, Europe livelier, the hour before the cash open liveliest), and the
  basis rides on top. It is a MODEL of a session — the chip says simulated —
  but the SHAPE is right, which is what the overnight high/low and the
  session shading need in order to be built and read now.
*/

export type FuturesRoot = 'ES' | 'NQ' | 'RTY';

export const FUTURES_ROOTS: { root: FuturesRoot; name: string; etf: string; index: string; tick: number; multiplier: number }[] = [
  { root: 'ES', name: 'E-mini S&P 500', etf: 'SPY', index: 'SPX', tick: 0.25, multiplier: 50 },
  { root: 'NQ', name: 'E-mini Nasdaq 100', etf: 'QQQ', index: 'NDX', tick: 0.25, multiplier: 20 },
  { root: 'RTY', name: 'E-mini Russell 2000', etf: 'IWM', index: 'RUT', tick: 0.1, multiplier: 50 },
];

/** CME month codes. Equity index futures list only the quarterlies. */
const MONTH_CODE: Record<number, string> = { 2: 'H', 5: 'M', 8: 'U', 11: 'Z' };

export interface FuturesContract {
  root: FuturesRoot;
  /** e.g. ESZ26 */
  code: string;
  /** Third Friday of the contract month. */
  expiry: Date;
  expiryLabel: string;
  /** Calendar days until expiry. */
  daysToExpiry: number;
  /** Volume migrates about a week out — true once inside that window. */
  rollingSoon: boolean;
}

/** The third Friday of a given month. */
function thirdFriday(year: number, month: number): Date {
  const d = new Date(year, month, 1);
  let fridays = 0;
  while (true) {
    if (d.getDay() === 5) {
      fridays++;
      if (fridays === 3) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

/** The front month and the one behind it, from any date. */
export function contractsFor(root: FuturesRoot, from = new Date()): { front: FuturesContract; next: FuturesContract } {
  const quarters = [2, 5, 8, 11];
  const build = (year: number, month: number): FuturesContract => {
    const expiry = thirdFriday(year, month);
    const days = Math.ceil((expiry.getTime() - from.getTime()) / 86400000);
    return {
      root,
      code: `${root}${MONTH_CODE[month]}${String(year).slice(2)}`,
      expiry,
      expiryLabel: expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      daysToExpiry: days,
      rollingSoon: days <= 8 && days >= 0,
    };
  };
  /* The front month is the first quarterly whose third Friday has not
     passed. Roll happens ON that date, so "today is expiry" is still front. */
  const found: FuturesContract[] = [];
  for (let y = from.getFullYear(); found.length < 2 && y <= from.getFullYear() + 2; y++) {
    for (const m of quarters) {
      const c = build(y, m);
      if (c.daysToExpiry >= 0) found.push(c);
      if (found.length === 2) break;
    }
  }
  return { front: found[0], next: found[1] };
}

export interface FuturesQuote {
  contract: FuturesContract;
  last: number;
  /** Prior session's settlement — the line every futures chart carries. */
  settlement: number;
  changeFromSettle: number;
  changePct: number;
  /** Open interest, contracts. */
  openInterest: number;
  /** Session volume so far. */
  volume: number;
  /** Futures less cash index, in points — the carry premium. */
  basis: number;
  phase: FuturesPhase;
}

export interface OvernightBar {
  /** Minutes since 18:00 ET the previous evening, 0…930 (to the 09:30 open). */
  min: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  phase: FuturesPhase;
}

export interface OvernightSession {
  bars: OvernightBar[];
  high: number;
  low: number;
  /** Where the cash open sits against the overnight range, 0–100. */
  openPositionPct: number | null;
  settlement: number;
}

/** Which Globex phase a minute-offset from 18:00 ET falls in. */
export function phaseAtOffset(min: number): FuturesPhase {
  if (min < 540) return 'GLOBEX_ASIA';      // 18:00 → 03:00
  if (min < 930) return 'GLOBEX_EUROPE';    // 03:00 → 09:30
  return 'RTH';
}

/** The quote for a root, priced off its ETF twin through the measured basis. */
export function quoteFor(root: FuturesRoot, now = new Date()): FuturesQuote | null {
  const spec = FUTURES_ROOTS.find(r => r.root === root);
  if (!spec) return null;
  const fam = twinFamilyFor(spec.etf);
  if (!fam) return null;
  const etfPrice = Simulator.TICKERS[spec.etf]?.currentPrice;
  if (!etfPrice) return null;

  const measure = twinMeasureFor(fam);
  const last = twinPrice(fam, 'futures', etfPrice, measure);
  const cash = twinPrice(fam, 'index', etfPrice, measure);
  const contract = contractsFor(root, now).front;
  const seed = `${contract.code}|${now.toISOString().slice(0, 10)}`;
  /* Settlement is the PRIOR session's — a fixed point the day is measured
     against, so it must not drift with the tick. */
  const settlement = last * (1 - (h01(`${seed}|settle`) - 0.5) * 0.012);

  return {
    contract,
    last,
    settlement,
    changeFromSettle: last - settlement,
    changePct: ((last - settlement) / settlement) * 100,
    openInterest: Math.round(hRange(`${seed}|oi`, 1_400_000, 2_600_000)),
    volume: Math.round(hRange(`${seed}|vol`, 900_000, 2_100_000)),
    basis: last - cash,
    phase: futuresPhaseAt(now),
  };
}

/**
 * The overnight session — 18:00 ET to the 09:30 cash open, in 15-minute bars.
 *
 * Anchored on settlement so the series is comparable to the line the chart
 * draws, and shaped by phase: Asia thin, Europe livelier, the last two hours
 * before the cash open liveliest of all. That shape is the point — a flat
 * random walk would make the overnight high/low meaningless.
 */
export function overnightFor(root: FuturesRoot, dateIso: string, settlement: number): OvernightSession {
  const bars: OvernightBar[] = [];
  const STEP = 15;
  let px = settlement;
  let high = -Infinity, low = Infinity;

  for (let min = 0; min <= 930; min += STEP) {
    const phase = phaseAtOffset(min);
    const seed = `${root}|${dateIso}|${min}`;
    /* Activity by phase, and a lift into the cash open. */
    const base = phase === 'GLOBEX_ASIA' ? 0.28 : phase === 'GLOBEX_EUROPE' ? 0.62 : 1;
    const openLift = min > 780 ? 1 + (min - 780) / 150 : 1;
    const amp = settlement * 0.0011 * base * openLift;
    const drift = (h01(`${seed}|d`) - 0.5) * amp;
    const open = px;
    px = Math.max(0.01, px + drift);
    const wick = amp * (0.4 + h01(`${seed}|w`));
    const hi = Math.max(open, px) + wick * 0.5;
    const lo = Math.min(open, px) - wick * 0.5;
    high = Math.max(high, hi);
    low = Math.min(low, lo);
    bars.push({
      min,
      open,
      high: hi,
      low: lo,
      close: px,
      volume: Math.round(hRange(`${seed}|v`, 200, 9_000) * base * openLift),
      phase,
    });
  }

  const openPx = bars[bars.length - 1]?.close ?? settlement;
  return {
    bars,
    high,
    low,
    openPositionPct: high > low ? ((openPx - low) / (high - low)) * 100 : null,
    settlement,
  };
}

/** A large overnight print — the futures tape's rows. */
export interface FuturesPrint {
  /** Minutes since 18:00 ET. */
  min: number;
  clock: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  phase: FuturesPhase;
}

/** Clock label for a minute-offset from 18:00 ET. */
export function overnightClock(min: number): string {
  const h = Math.floor((18 * 60 + min) / 60) % 24;
  const m = (18 * 60 + min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The session's biggest prints — what a futures tape tab shows. */
export function bigPrints(root: FuturesRoot, session: OvernightSession, dateIso: string, count = 24): FuturesPrint[] {
  const out: FuturesPrint[] = [];
  for (const bar of session.bars) {
    const seed = `${root}|${dateIso}|${bar.min}|p`;
    if (h01(seed) > 0.55) continue;
    out.push({
      min: bar.min,
      clock: overnightClock(bar.min),
      price: Number(bar.close.toFixed(2)),
      size: Math.round(hRange(`${seed}|z`, 40, 1400)),
      side: h01(`${seed}|s`) > 0.5 ? 'ASK' : 'BID',
      phase: bar.phase,
    });
  }
  return out.sort((a, b) => b.size - a.size).slice(0, count);
}
