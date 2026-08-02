/*
==================================================
  SLAYER TERMINAL - SCAN UNIVERSE (scanUniverse.ts)
  The field the Compass scanner ranks over.

  IMPORT DIRECTION, ONE WAY ONLY. This module reads
  simulator.ts (staticsFor and scanCoverage both touch
  Simulator.TICKERS, and SCAN_UNIVERSE_SIZE is derived
  at module init). simulator.ts must therefore never
  import from here. A cycle does not surface as a type
  error: ES modules resolve one by handing back a
  half-initialised namespace, so it shows up as
  Simulator reading `undefined` during its own init and
  every price in the terminal arriving NaN a layer
  later. If the simulator ever needs a formula that
  lives here, copy it and pin both copies with a test.

  WHY THIS IS NOT THE SIMULATOR. simulator.ts owns a
  handful of *live* names, and registering one costs
  ~70ms of session seeding: 22 sessions x 390 bars, plus
  six sessions of per-strike GEX snapshots. Measured, not
  estimated. Two hundred names down that path is a
  14-second freeze on load, and each one then holds a
  seat in the 1.5s tick loop (~11µs/name/tick, ~2ms a
  tick on top of everything else the desks do). So the
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
  Same epoch in, same universe out.
==================================================
*/

import Simulator from './simulator';
import { hash } from './rng';
import { UNIVERSE, lookup as universeLookup } from '../data/universe';

// ---- coverage ----------------------------------------------------------------

/**
 * How much of a name the terminal can actually put on a screen.
 *
 *   modeled — the simulator holds a session for it: candles, a dealer map, a
 *             chain. Its reference price was set by a person, in a watchlist
 *             config or a universe row, so everything drawn off it traces that
 *             number back to a decision.
 *   covered — universe.ts carries the reference price, the sector and the beta.
 *             The research desks render it today; the simulator has simply not
 *             been asked to model a session for it yet.
 *   listing — the symbol and nothing else. Its price is a hash of its own
 *             letters, and no desk can say anything about it that is not
 *             derived from that hash.
 *
 * READ THIS BEFORE CHANGING THE RULE. The tier describes what EXISTS to show
 * for a name, never whether the simulator happens to be holding it. Opening any
 * symbol calls Simulator.ensureTicker, so registration is a side effect of the
 * user's cursor. If `modeled` meant "registered", a hash-priced ghost would
 * climb to the deepest tier purely by being looked at, and a depth signal that
 * improves when you look at something is worse than no signal: it launders a
 * shallow name into a deep one at the exact moment the user is deciding whether
 * to trust it. Registration promotes `covered` to `modeled` and nothing else,
 * because only there is the simulator modelling a session around a price
 * somebody chose. A name with no reference stays `listing` however many candles
 * get seeded on top of it.
 */
export type ScanCoverage = 'modeled' | 'covered' | 'listing';

/**
 * Render copy for the tiers, kept beside the rule that produces them.
 *
 * The tier keys are only meaningful next to a sentence saying what the terminal
 * can show, and the obvious pill text for the deepest tier is "LIVE" — a claim
 * this desk must never make about a simulator. Writing the copy here means the
 * next screen to surface coverage inherits the honest wording instead of
 * inventing it. Same split as ../components/compass/setupState.ts: the meaning
 * lives with the logic, the tone and the pill live with the component.
 */
export const COVERAGE_META: Record<ScanCoverage, { label: string; note: string }> = {
  modeled: { label: 'MODELED', note: 'Simulated session, chart and dealer map, off a reference price someone set' },
  covered: { label: 'COVERED', note: 'Reference price and sector on file, no simulated session behind it yet' },
  listing: { label: 'LISTING', note: 'Symbol only, every number derived from the symbol itself' },
};

/**
 * Every ticker the terminal holds a reference for: the simulator's hand-written
 * configs plus universe.ts. One set answers three questions that must never
 * disagree — which names are scannable, what scanCoverage calls them, and how
 * wide the field is.
 */
const REFERENCED: readonly string[] = [...new Set([...Simulator.WATCHLIST, ...UNIVERSE.map(u => u.ticker)])];
const REFERENCED_SET: ReadonlySet<string> = new Set(REFERENCED);

/**
 * The tier for any symbol, registered or not. Cheap enough to call per name per
 * sweep, and a screen holding nothing but a ticker string can call it directly.
 */
export function scanCoverage(ticker: string): ScanCoverage {
  if (!REFERENCED_SET.has(ticker)) return 'listing';
  return Simulator.TICKERS[ticker] ? 'modeled' : 'covered';
}

// ---- clock -------------------------------------------------------------------

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

// ---- name pool ---------------------------------------------------------------

/**
 * How many names the scanner ranks over. Coverage IS the cap: the field is
 * exactly the referenced names, so there is no size constant that can drift
 * away from the set it describes. Add a row to universe.ts and the sweep widens
 * by one with nothing else to touch.
 *
 * This is what the field is NOT, and the reason is worth keeping. It used to top
 * up to 520 out of the bundled NASDAQ listing, which carries {symbol, name} and
 * nothing else — no market cap, no listing status, no options flag — so the only
 * screen available was symbol shape plus a blacklist of name substrings. 326 of
 * those 520 came back as names no other desk could open: delisted shells, a
 * SPAC, corporate notes quoted as equity, micro-cap thrifts, each priced off a
 * hash of its own symbol string. A wider field of names the terminal cannot
 * answer a click on is not a wider field, it is a longer list.
 */
export const SCAN_UNIVERSE_SIZE = REFERENCED.length;

let poolCache: string[] | null = null;

/** The ranked field's fixed order: watchlist first, then a seeded sample. */
function namePool(): string[] {
  if (poolCache) return poolCache;

  // The watchlist leads because those are the deepest names on the desk, and a
  // truncated field (buildScanUniverse's size argument) should keep them.
  const lead = new Set(Simulator.WATCHLIST);

  // universe.ts is typed sector by sector, and the sweep's global sort falls
  // through to field order on a tie — so shipping that order would quietly
  // resolve every tie toward whichever sector happened to be typed first. A
  // seeded key breaks the grouping without making the field random: same key,
  // same order, every run, which is what the rest of the terminal promises.
  const rest = REFERENCED.filter(t => !lead.has(t))
    .map(t => ({ t, key: hash(`${t}:scan-rank`) }))
    .sort((a, b) => a.key - b.key || (a.t < b.t ? -1 : 1))
    .map(x => x.t);

  poolCache = [...Simulator.WATCHLIST, ...rest];
  return poolCache;
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
 * scanner showed it with. Reading the live config first is not redundancy: the
 * watchlist four are hand-written rather than synthesised, so SPY's 500 is only
 * findable there.
 *
 * Nothing here depends on registration, which is why coverage is computed per
 * call below rather than cached alongside these.
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

// ---- one name ----------------------------------------------------------------

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
  /** What the terminal can show for this name. See ScanCoverage. */
  coverage: ScanCoverage;
  /**
   * True when simulator.ts is holding this name's price right now, which is the
   * only question the price branch below cares about. Not a synonym for
   * `coverage === 'modeled'`: anything the user opens goes live, including a
   * name with no reference behind it.
   */
  live: boolean;
}

/**
 * The single derivation. buildScanUniverse and scanNameFor both come through
 * here so a sweep and a lookup cannot describe the same ticker two ways.
 */
function makeScanName(ticker: string, epoch: number): ScanName {
  const s = staticsFor(ticker);
  const live = Simulator.TICKERS[ticker];
  const now = walkPct(s, epoch);

  // A live name's price is the simulator's, full stop — one ticker never prints
  // two prices across the terminal.
  const changePct = live ? ((live.currentPrice - s.base) / s.base) * 100 : now;

  return {
    ticker,
    base: s.base,
    spot: live ? live.currentPrice : Number((s.base * (1 + now / 100)).toFixed(2)),
    iv: s.iv,
    step: s.step,
    changePct: Number(changePct.toFixed(2)),
    // Same shape as the candle-based lean the live names use: hour momentum
    // plus half the day's direction.
    trendUp: now - walkPct(s, epoch - HOUR_EPOCHS) + 0.5 * (now - walkPct(s, epoch - SESSION_EPOCHS)) >= 0,
    coverage: scanCoverage(ticker),
    live: Boolean(live),
  };
}

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
  for (let i = 0; i < n; i++) names[i] = makeScanName(pool[i], epoch);

  cache = { epoch, size, names };
  return names;
}

/**
 * One name's scan record. Reaches past the field on purpose: search covers the
 * whole listing and Compass injects whatever the user is looking at into the
 * sweep, so a name outside both reference tiers still gets priced. It just comes
 * back marked `listing`, so nothing downstream can mistake it for a name the
 * terminal has something to say about.
 */
export function scanNameFor(ticker: string, epoch: number = scanEpoch()): ScanName {
  return makeScanName(ticker, epoch);
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
