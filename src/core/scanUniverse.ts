/*
==================================================
  SLAYER TERMINAL - SCAN UNIVERSE (scanUniverse.ts)
  The wide field the Compass scanner ranks over.

  WHY THIS IS NOT THE SIMULATOR. simulator.ts owns a
  handful of *live* names, and registering one costs
  ~70ms of session seeding: 22 sessions x 390 bars, plus
  six sessions of per-strike GEX snapshots. Measured, not
  estimated. Five hundred names down that path is a
  36-second freeze on load, and each one then holds a
  seat in the 1.5s tick loop (~11µs/name/tick, so ~6ms
  a tick on top of everything else the desks do). So the
  scanner gets its own price source: a seeded, closed-form
  walk that costs microseconds per name and never enters
  the tick loop at all.

  Names the simulator DOES own (the watchlist, whatever
  the user is looking at) are read straight from it, so
  the scanner and the desks never print two prices for
  one ticker. Names it does not own derive base price,
  IV and strike step from the SAME formulas ensureTicker
  uses, so a name promoted to live keeps its reference.

  Everything here is a pure function of (ticker, epoch).
  Same epoch in, same universe out — the wide field is
  as reproducible as the four-name one it replaces.
==================================================
*/

import Simulator from './simulator';
import { hash } from './rng';
import { UNIVERSE, lookup as universeLookup } from '../data/universe';
import { NASDAQ_TICKERS } from '../data/tickers';

/** One scannable name: enough to build a strike grid and price it. */
export interface ScanName {
  ticker: string;
  /** Reference price the walk oscillates around — matches TickerConfig.basePrice */
  base: number;
  /** Price for this epoch */
  spot: number;
  iv: number;
  step: number;
  /** Session change vs the reference, % — what the sparkline traces */
  changePct: number;
  /** Tape lean: momentum over the last hour plus the day's direction */
  trendUp: boolean;
  /** True when simulator.ts owns this name's price (it is on a live desk) */
  live: boolean;
}

/**
 * The scanner sweeps on a fixed cadence rather than every price tick, so the
 * universe is quantised to the same clock. Compass's own SCAN_INTERVAL_MS is
 * 10s; matching it means a sweep reuses one universe across all six scanner
 * builds instead of rebuilding the field six times.
 */
export const SCAN_EPOCH_MS = 10_000;

export function scanEpoch(now: number = Date.now()): number {
  return Math.floor(now / SCAN_EPOCH_MS);
}

/**
 * How many names the scanner ranks over. Sized against a measured budget, not
 * a guess: see the header note on why this cannot simply be "all of NASDAQ".
 * The curated universe is always in; the rest fills up to this cap from the
 * bundled listing.
 */
export const SCAN_UNIVERSE_SIZE = 520;

// ---- name pool ---------------------------------------------------------------

/**
 * The listing carries warrants, notes, preferred lines and fund share classes
 * alongside common stock. None of those have the kind of options book this
 * desk models, so they are filtered out rather than ranked and discarded.
 */
const NON_EQUITY = [
  'Fund', 'ETF', 'ETN', 'Trust', 'Index', 'Shares', 'Portfolio', 'Notes', 'Preferred',
  'Warrant', 'Depositary', 'Bond', 'Municipal', 'ProShares', 'iShares', 'SPDR',
  'Direxion', 'Invesco', 'VelocityShares', 'Acquisition Corp', 'Capital Corp',
];

const SYMBOL_OK = /^[A-Z]{1,4}$/;

let poolCache: string[] | null = null;

/** The ordered candidate pool: curated names first, then the wider listing. */
function namePool(): string[] {
  if (poolCache) return poolCache;

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string) => {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };

  // Tier 1: whatever the simulator already carries, then the curated universe.
  // These have hand-set prices and sectors, so they anchor the field.
  Simulator.WATCHLIST.forEach(add);
  UNIVERSE.forEach(u => add(u.ticker));

  // Tier 2: the bundled listing, ordered by a stable per-symbol key so the
  // long tail is a fixed sample rather than everything alphabetically before
  // "B". The key is seeded, so the same names are picked on every run.
  const tail = NASDAQ_TICKERS.filter(
    t => SYMBOL_OK.test(t.symbol) && !seen.has(t.symbol) && !NON_EQUITY.some(k => t.name.includes(k))
  ).map(t => ({ sym: t.symbol, key: hash(`${t.symbol}:scan-rank`) }));
  tail.sort((a, b) => a.key - b.key || (a.sym < b.sym ? -1 : 1));
  tail.forEach(t => add(t.sym));

  poolCache = out;
  return out;
}

/** Names in the pool before any size cap — the ceiling on how wide this can go. */
export function scanPoolSize(): number {
  return namePool().length;
}

// ---- per-name statics --------------------------------------------------------

interface NameStatics {
  base: number;
  iv: number;
  step: number;
  /** Phase offsets so two names never trace the same path */
  p1: number;
  p2: number;
  amp: number;
}

const staticsCache = new Map<string, NameStatics>();

/**
 * Base price, IV and strike step. These mirror simulator.ts:ensureTicker exactly
 * — universe reference price where there is one, hashed price otherwise — so a
 * name that later gets promoted onto a live desk keeps the reference the
 * scanner showed it with. priceCoherence.test.ts holds that line.
 */
function staticsFor(ticker: string): NameStatics {
  const hit = staticsCache.get(ticker);
  if (hit) return hit;

  const live = Simulator.TICKERS[ticker];
  const h = hash(ticker);
  const base = live?.basePrice ?? universeLookup(ticker)?.px ?? Number((15 + (h % 58500) / 100).toFixed(2));
  const iv = live?.iv ?? 0.15 + ((h >>> 5) % 45) / 100;
  const step = live?.step ?? (base >= 100 ? 1 : 0.5);

  const s: NameStatics = {
    base,
    iv,
    step,
    p1: ((h % 1000) / 1000) * Math.PI * 2,
    p2: (((h >>> 11) % 1000) / 1000) * Math.PI * 2,
    // Higher-vol names swing wider, same as the simulator's tick sizing
    amp: iv * 5.5,
  };
  staticsCache.set(ticker, s);
  return s;
}

/**
 * Session path, % from base. Two cosine terms with hashed phases: a slow one on
 * roughly an hour and a fast one on roughly six minutes. Closed form, so any
 * epoch — past or future — costs the same and lands on the same number, which
 * is what lets the lean read momentum without replaying a candle buffer.
 */
function walkPct(s: NameStatics, epoch: number): number {
  const slow = Math.cos(epoch / 57.3 + s.p1);
  const fast = Math.cos(epoch / 9.7 + s.p2);
  return (slow * 0.72 + fast * 0.28) * s.amp;
}

const HOUR_EPOCHS = 360; // 3600s / SCAN_EPOCH_MS
const SESSION_EPOCHS = 2340; // 6.5h

// ---- universe build ----------------------------------------------------------

let cache: { epoch: number; size: number; names: ScanName[] } | null = null;

/**
 * The scan universe for one epoch. Cached: six scanner builds inside a sweep
 * share one field. This is the SLOW path — the strike grids and scores built on
 * top of it are the fast one.
 */
export function buildScanUniverse(epoch: number = scanEpoch(), size: number = SCAN_UNIVERSE_SIZE): ScanName[] {
  if (cache && cache.epoch === epoch && cache.size === size) return cache.names;

  const pool = namePool();
  const n = Math.min(size, pool.length);
  const names: ScanName[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const ticker = pool[i];
    const s = staticsFor(ticker);
    const live = Simulator.TICKERS[ticker];

    const now = walkPct(s, epoch);
    const hourAgo = walkPct(s, epoch - HOUR_EPOCHS);
    const dayAgo = walkPct(s, epoch - SESSION_EPOCHS);

    // A live name's price is the simulator's, full stop — one ticker never
    // prints two prices across the terminal.
    const spot = live ? live.currentPrice : Number((s.base * (1 + now / 100)).toFixed(2));
    const changePct = live ? ((live.currentPrice - s.base) / s.base) * 100 : now;

    names[i] = {
      ticker,
      base: s.base,
      spot,
      iv: s.iv,
      step: s.step,
      changePct: Number(changePct.toFixed(2)),
      // Same shape as the candle-based lean the live names use: hour momentum
      // plus half the day's direction.
      trendUp: now - hourAgo + 0.5 * (now - dayAgo) >= 0,
      live: Boolean(live),
    };
  }

  cache = { epoch, size, names };
  return names;
}

/** One name's scan record, built off the same statics as the full sweep. */
export function scanNameFor(ticker: string, epoch: number = scanEpoch()): ScanName {
  const s = staticsFor(ticker);
  const live = Simulator.TICKERS[ticker];
  const now = walkPct(s, epoch);
  return {
    ticker,
    base: s.base,
    spot: live ? live.currentPrice : Number((s.base * (1 + now / 100)).toFixed(2)),
    iv: s.iv,
    step: s.step,
    changePct: Number((live ? ((live.currentPrice - s.base) / s.base) * 100 : now).toFixed(2)),
    trendUp: now - walkPct(s, epoch - HOUR_EPOCHS) + 0.5 * (now - walkPct(s, epoch - SESSION_EPOCHS)) >= 0,
    live: Boolean(live),
  };
}

/**
 * A name's recent session path, for the feed's sparkline. Same closed-form walk
 * sampled backwards, so the line and the price agree by construction rather
 * than by a second random draw.
 */
export function scanSparkline(ticker: string, spot: number, epoch: number = scanEpoch(), points = 24): number[] {
  const s = staticsFor(ticker);
  const out: number[] = new Array(points + 1);
  const stride = Math.round(SESSION_EPOCHS / points);
  for (let i = 0; i < points; i++) {
    const e = epoch - (points - i) * stride;
    out[i] = Number((s.base * (1 + walkPct(s, e) / 100)).toFixed(2));
  }
  out[points] = spot;
  return out;
}

/** Drops the memoised universe. Tests use it to re-derive from a clean slate. */
export function resetScanUniverse(): void {
  cache = null;
  staticsCache.clear();
}
