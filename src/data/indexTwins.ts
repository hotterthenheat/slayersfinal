/*
==================================================
  SLAYER TERMINAL - INDEX PRICE TWINS (indexTwins.ts)
  One market, three prices: the ETF our sim quotes,
  the cash index (ETF × family ratio) and the
  futures (index + a carry basis). The instrument
  LENS re-denominates GEX surfaces so the map reads
  in the instrument you actually trade — the
  overnight ES-vs-nodes read without a TradingView
  detour (Noah, 2026-08-18, the Discord complaint).

  SIM-ERA CONTRACT: ratios are fixed and the basis
  drifts deterministically off the rounded spot —
  replay-safe, no wall clock in data code.
==================================================

  THE SWAP PLAN, RE-POINTED 2026-08-26. This block named
  ThetaData as the source for the cash indices.
  ThetaData is out. The measured feed is:

    cash indices (SPX / NDX / RUT)  → MKT Indices
    futures (ES / NQ / RTY)         → a futures feed,
      which also carries settlement and open interest

  Corrected here rather than in a planning document
  because this comment is what the next reader of this
  file will act on, and chasing a subscription that was
  never bought is the kind of afternoon a stale header
  costs someone.

  THE RATIOS ARE MEASURED NOW — T-17's second half.
  The fixed numbers below are SEEDS, not the lens: the
  sim synthesises a coherent pair series (ratio drifting
  the way dividends drift it, basis mean-reverting the
  way carry does), and `measureTwins` reads the ratio
  and the basis OFF THE SERIES as medians over the last
  hour. The widgets print how much tape the measurement
  stands on; a series too short to measure falls back to
  the seeds and says `inferred`. When MKT Indices and
  Futures land, `twinMeasureFor` points at their series
  and every number downstream is already measured.

  ENTITLEMENT NOTE, so nobody chases it: the Indices
  add-on covers SPX, VIX and RUT — THERE IS NO NDX FEED.
  QQQ's index lens stays synthesised/inferred after the
  swap until an NDX source is actually bought.
*/

export type TwinLensKey = 'etf' | 'index' | 'futures';

export interface TwinFamily {
  etf: string;
  index: string;
  futures: string;
  /** Cash index ≈ ETF × ratio (fixed in sim; measured live later). */
  ratio: number;
  /** Typical carry premium of the futures over cash, in index points. */
  baseBasis: number;
}

const FAMILIES: Record<string, TwinFamily> = {
  SPY: { etf: 'SPY', index: 'SPX', futures: 'ES', ratio: 10, baseBasis: 12 },
  QQQ: { etf: 'QQQ', index: 'NDX', futures: 'NQ', ratio: 41, baseBasis: 45 },
  IWM: { etf: 'IWM', index: 'RUT', futures: 'RTY', ratio: 10, baseBasis: 6 },
};

export const twinFamilyFor = (ticker: string): TwinFamily | null => FAMILIES[ticker.toUpperCase()] ?? null;

// eslint-disable-next-line import/no-cycle -- the same seam every data module reads
import Simulator from '../core/simulator';

/** The live measurement for a family, off the seam's own series — the last
    hour of pairs, or the seeds marked inferred while the tape is short. */
export function twinMeasureFor(fam: TwinFamily): TwinMeasure {
  const bars = Simulator.getCandles(fam.etf) ?? [];
  return measureTwins(synthTwinPairs(fam, bars)) ?? inferredMeasure(fam);
}

// Tiny local hash — deterministic drift needs no import from gex.ts.
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface TwinPair {
  time: number;
  etf: number;
  index: number;
  futures: number;
}

/** What the lens stands on: the measured ratio and basis, and how many
    paired samples stand behind them. `sampled: 0` = the seeds, inferred. */
export interface TwinMeasure {
  ratio: number;
  basis: number;
  sampled: number;
}

/** Below this many pairs a median is a coin toss wearing a number. */
export const MIN_TWIN_SAMPLES = 12;
/** How much tape the measurement reads, in 1-minute pairs. */
export const TWIN_WINDOW = 60;

/*
  SIM-ERA SERIES. The pair series the measurement reads is synthesised from
  the ETF's own bars: the ratio drifts a few tenths of a percent across days
  (dividends accrue and pay), the basis mean-reverts around the seed with a
  small per-bar wiggle (carry). Deterministic off bar TIMES — a replay
  reproduces it exactly, and no wall clock enters data code. When the real
  feed lands, `twinMeasureFor` reads its series instead and this function
  retires.
*/
export function synthTwinPairs(fam: TwinFamily, etfBars: readonly { time: number; close: number }[], window = TWIN_WINDOW): TwinPair[] {
  const tail = etfBars.slice(-window);
  return tail.map(b => {
    const day = Math.floor(b.time / 86400);
    const ratioWiggle = (hash01(`${fam.index}-ratio-${day}`) * 2 - 1) * 0.003;
    const ratio = fam.ratio * (1 + ratioWiggle);
    const basisDay = fam.baseBasis * (0.85 + hash01(`${fam.futures}-carry-${day}`) * 0.3);
    const basisWiggle = (hash01(`${fam.futures}-b-${b.time}`) * 2 - 1) * fam.baseBasis * 0.04;
    const index = b.close * ratio;
    return { time: b.time, etf: b.close, index, futures: index + basisDay + basisWiggle };
  });
}

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * The measurement itself — MEDIANS over the paired series, because one bad
 * print in either leg should move the lens by nothing, not by its error
 * over n. Null under MIN_TWIN_SAMPLES: too little tape is not a reading.
 */
export function measureTwins(pairs: readonly TwinPair[]): TwinMeasure | null {
  const good = pairs.filter(p => p.etf > 0 && p.index > 0);
  if (good.length < MIN_TWIN_SAMPLES) return null;
  return {
    ratio: median(good.map(p => p.index / p.etf)),
    basis: median(good.map(p => p.futures - p.index)),
    sampled: good.length,
  };
}

/** The seeds, worn openly as the fallback — `sampled: 0` is the `inferred`
    flag every caller renders. */
export const inferredMeasure = (fam: TwinFamily): TwinMeasure => ({ ratio: fam.ratio, basis: fam.baseBasis, sampled: 0 });

/** A price in the chosen instrument's terms, off a measurement. Futures
    round to their quarter-point tick, the way the board actually prints
    them. */
export function twinPrice(fam: TwinFamily, lens: TwinLensKey, etfPrice: number, measure: TwinMeasure): number {
  if (lens === 'etf') return etfPrice;
  const idx = etfPrice * measure.ratio;
  if (lens === 'index') return idx;
  return Math.round((idx + measure.basis) * 4) / 4;
}

export const twinLabel = (fam: TwinFamily, lens: TwinLensKey): string =>
  lens === 'etf' ? fam.etf : lens === 'index' ? fam.index : fam.futures;

/** Index/futures prices print with thousands separators, no dollar sign. */
export const fmtTwin = (v: number): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
