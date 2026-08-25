import type {
  Candle,
  GexSnapshot,
  Indicators,
  MarketSnapshot,
  TapeOrder,
  TickerConfig,
  TradePlan,
} from '../types/market';
import type { UniverseQuote } from '../types/compass';
import RECORDED_TAPE from '../data/recorded/tape.json';
import { RECORDED } from '../data/recorded/manifest';

/*
==================================================
  SLAYER TERMINAL - THE MARKET FEED SEAM (core/feed.ts)

  The one module the whole product reads the market
  through. Everything above it — 74 files across every
  desk — asks this and nothing else.

  WHY IT EXISTS. Until now the terminal computed its own
  market: a random-walk price simulator, a Black-Scholes
  chain, a hash-seeded generator behind every desk. That
  is being removed. What replaces it, for now, is a
  RECORDING (src/data/recorded/) played back.

  A recording is the honest interim. It is inspectable,
  it cannot invent a different number on refresh, and
  every figure on screen traces to a file you can open.

  THE SWAP. When the real feeds land — Options Advanced,
  Stocks Advanced, Futures Advanced, API Advanced — they
  replace the body of THIS FILE and nothing else. The
  eleven members below are the entire contract:

      TICKERS  WATCHLIST  snapshotFor  ensureTicker
      setActiveTicker  getActiveTicker  getCandles
      peekCandles  getGexHistory  tick  universeQuotes

  Keep those eleven and no caller changes. That is the
  whole point of the file.

  WHAT PLAYBACK IS AND IS NOT. Advancing an index into a
  recorded array is not a model. Price moves because the
  next recorded bar says so. Nothing here draws a random
  number, fits a curve or prices an option — if a future
  edit needs to do any of those, it belongs in the real
  feed implementation, not here.

  THE ONE THING HELD STILL. Price replays; the BOOK does
  not. Each name carries one recorded chain, indicators
  and plan. That is deliberate and it is what "snapshot"
  means here: the chain is the slow half of the picture
  and price is the fast half, so recording one book and
  replaying price against it costs a fraction of the size
  of a chain per bar and stays truthful about what it is.
  Surfaces reading the chain therefore show the book as
  it stood at capture. They are not lying; they are a
  snapshot, and the recording's own index.json carries
  the capture timestamp.
==================================================
*/

/** [time, open, high, low, close, volume] — the recording's flat bar tuple. */
type BarTuple = [number, number, number, number, number, number];

interface Recording {
  ticker: string;
  basePrice: number;
  iv: number;
  step: number;
  bars: BarTuple[];
  snapshot: MarketSnapshot;
}

/*
  Eager, not lazy.

  The eleven members above are all synchronous, and every one of them is called
  during render. Making the recording arrive asynchronously would push a loading
  state into all 74 call sites to save bundle bytes on scaffolding that is
  deleted the moment a real feed exists. So the whole recording (~1.17 MB across
  22 names) ships in the bundle, deliberately, and goes away with this file.

  Imported through a hand-written manifest rather than `import.meta.glob`: the
  glob is a Vite transform and does not exist under plain Node, so every
  headless script that reached the feed died on module init before its first
  assertion.
*/

/*
  Validated by SHAPE, not trusted by name.

  The manifest is hand-maintained, so the thing that goes wrong is somebody
  adding an entry that is not a per-name recording. That already nearly
  happened: an earlier version globbed the directory, which swept up
  `tape.json` (a flat array of prints) as a ticker called "tape" and would have
  thrown on `rec.bars[...]` during module init — before first paint, taking the
  whole app down. TypeScript cannot catch it; the JSON import's type is an
  assertion, not a check. So every entry proves it has bars before it is used.
*/
const RECORDINGS: Record<string, Recording> = {};
for (const [name, value] of Object.entries(RECORDED)) {
  const rec = value as Recording;
  if (Array.isArray(rec?.bars) && rec.bars.length > 0) RECORDINGS[name] = rec;
}

/** The four the charts open on — the recording's long series. */
export const WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'NVDA'].filter(t => t in RECORDINGS);

/*
  Where playback starts, as a share of each recording.

  0.8 leaves the chart four sessions of history behind the playhead — enough to
  fill 1m through 1h and to aggregate a week of dailies — and one full session
  of bars ahead of it. At one bar per tick that is roughly ten minutes of
  forward runway, after which the playhead HOLDS on the last bar rather than
  looping. Holding is the truthful end state: the recording ran out. Looping
  would send the chart backwards in time and quietly restate prices the reader
  had already seen move on.
*/
const START_SHARE = 0.8;

const playhead: Record<string, number> = {};
const startIndex = (rec: Recording) =>
  Math.max(1, Math.min(rec.bars.length - 1, Math.floor(rec.bars.length * START_SHARE)));

/**
 * TICKERS is a live object the UI reads directly (17 call sites), so it is
 * mutated in place as the playhead advances rather than replaced.
 */
export const TICKERS: Record<string, TickerConfig> = {};
for (const [sym, rec] of Object.entries(RECORDINGS)) {
  playhead[sym] = startIndex(rec);
  TICKERS[sym] = {
    basePrice: rec.basePrice,
    currentPrice: rec.bars[playhead[sym]][4],
    iv: rec.iv,
    step: rec.step,
  };
}

let activeTicker = WATCHLIST[0] ?? Object.keys(RECORDINGS)[0] ?? 'SPY';

const toCandle = (b: BarTuple): Candle => ({
  time: b[0],
  open: b[1],
  high: b[2],
  low: b[3],
  close: b[4],
  volume: b[5],
});

/**
 * A name with no recording.
 *
 * The old simulator answered an unknown symbol by hashing it into a price and
 * forward-simulating a month of bars. This does not invent a market it does not
 * have: the name resolves to nothing and callers see it missing, which is the
 * honest answer and the same one a real feed gives for an unlisted symbol.
 */
const known = (sym: string) => sym.toUpperCase() in RECORDINGS;

export function ensureTicker(symbolRaw: string): string {
  const sym = symbolRaw.toUpperCase();
  return known(sym) ? sym : activeTicker;
}

export function setActiveTicker(t: string): string {
  activeTicker = ensureTicker(t);
  return activeTicker;
}

export function getActiveTicker(): string {
  return activeTicker;
}

/** Bars up to and including the playhead — the chart grows as playback runs. */
export function getCandles(sym: string): Candle[] {
  const key = ensureTicker(sym);
  const rec = RECORDINGS[key];
  if (!rec) return [];
  return rec.bars.slice(0, playhead[key] + 1).map(toCandle);
}

/** Bars WITHOUT resolving to the active ticker — null for a name not recorded. */
export function peekCandles(sym: string): Candle[] | null {
  const rec = RECORDINGS[sym.toUpperCase()];
  if (!rec) return null;
  return rec.bars.slice(0, playhead[sym.toUpperCase()] + 1).map(toCandle);
}

/**
 * Exposure snapshots parallel to the bar series.
 *
 * The recording holds ONE book per name, so this returns that book stamped at
 * the times the visible bars carry. Eleven call sites read it — the positioning
 * map's hover card among them — and every one wants a series, so returning a
 * single element would dark-fire four pages. The levels do not move because the
 * recording did not record them moving; when the real exposure feed lands, its
 * cadence decides what this returns.
 */
export function getGexHistory(sym: string): GexSnapshot[] {
  const key = ensureTicker(sym);
  const rec = RECORDINGS[key];
  if (!rec) return [];
  const levels = (rec.snapshot.chain ?? []).map(n => ({ strike: n.strike, value: n.netGex }));
  const from = Math.max(0, playhead[key] - 59);
  return rec.bars.slice(from, playhead[key] + 1).map(b => ({ time: b[0], levels }));
}

/*
  ── THE TAPE ──────────────────────────────────────────────────────────────

  1,013 recorded prints across the four watchlist names, revealed a few at a
  time so the tape streams rather than arriving all at once.

  THE TIMESTAMPS ARE SESSION TIMES, ASSIGNED. The capture wrote `new Date()`
  into every print, so all 1,013 came out stamped 11:20:31 or 11:20:32 PM — a
  whole session's tape claiming to have crossed inside two seconds, at an hour
  the market is shut, in a TIME column that is the first thing the eye lands
  on. It also disagreed with the dark-pool panel beside it, which prints ET
  session times.

  They are now spread 09:30:00 to 15:59:37 in replay order, evenly, which is
  the only thing the column can honestly mean for a recording: where in the
  session this print arrives. Even spacing is not a claim about clustering —
  a real tape is heavier at the open and the close, and pretending otherwise
  here would be inventing structure the recording does not have.

  `tick` is the only thing that serves them, and it serves each print EXACTLY
  ONCE, because LiveTape treats `marketData.tape` as "what is new this tick"
  and accumulates (LiveTape.tsx:990). `snapshotFor` therefore returns an empty
  tape — same contract the old generator documented, for the same reason: a
  caller asking "what is this name doing" must not silently consume prints out
  from under the tape that is rendering them.

  A note on what this recording is NOT. Every print carries a size, a side and
  a SWEEP/BLOCK label, and none of the three was measured — the generator drew
  them. Under the confirmed entitlements the side becomes real (trades held
  together with quotes give the aggressor), but SWEEP/BLOCK stays a
  classification rule that has to be written and calibrated; no options feed
  delivers it as a field. Treat the labels here as placeholder shape, not as a
  read.
*/
const TAPE = RECORDED_TAPE as TapeOrder[];

/** Prints revealed per tick — 1,013 over the 260 ticks they were recorded on. */
const TAPE_PER_TICK = 4;
let tapeCursor = 0;

export function snapshotFor(symbolRaw: string): MarketSnapshot {
  const sym = ensureTicker(symbolRaw);
  const rec = RECORDINGS[sym];
  const cfg = TICKERS[sym];
  const spot = cfg.currentPrice;
  const bars = rec.bars.slice(0, playhead[sym] + 1);

  return {
    ...rec.snapshot,
    ticker: sym,
    spot,
    // Two recorded numbers over one another. Presentation arithmetic, not a model.
    changePercent: ((spot - cfg.basePrice) / cfg.basePrice) * 100,
    priceHistory: bars.map(b => b[4]),
    chain: rec.snapshot.chain,
    indicators: rec.snapshot.indicators as Indicators,
    plan: rec.snapshot.plan as TradePlan,
    // Empty by contract — only  serves prints, and only once each.
    tape: [],
  };
}

/**
 * Advance playback one bar and hand the caller the active name's snapshot.
 *
 * EVERY recorded name advances, not just the active one, so a board pinned to
 * four different tickers stays on one clock. A per-name playhead that only moved
 * when you looked at it would make two widgets on the same desk disagree about
 * what time it is.
 */
export function tick(cb: (data: MarketSnapshot) => void): void {
  for (const [sym, rec] of Object.entries(RECORDINGS)) {
    if (playhead[sym] < rec.bars.length - 1) playhead[sym] += 1;
    TICKERS[sym].currentPrice = rec.bars[playhead[sym]][4];
  }
  const fresh = TAPE.slice(tapeCursor, tapeCursor + TAPE_PER_TICK);
  tapeCursor = Math.min(tapeCursor + TAPE_PER_TICK, TAPE.length);
  cb({ ...snapshotFor(activeTicker), tape: fresh });
}

/** True once every recording has played out — the UI may want to say so. */
export function atEnd(): boolean {
  return Object.entries(RECORDINGS).every(([s, r]) => playhead[s] >= r.bars.length - 1);
}

export function universeQuotes(active: string): UniverseQuote[] {
  const names = Array.from(new Set([active.toUpperCase(), ...Object.keys(RECORDINGS)]));
  return names
    .filter(known)
    .map(t => ({ ticker: t, price: TICKERS[t].currentPrice, iv: TICKERS[t].iv, step: TICKERS[t].step }));
}

const Feed = {
  TICKERS,
  WATCHLIST,
  snapshotFor,
  ensureTicker,
  setActiveTicker,
  getActiveTicker,
  getCandles,
  peekCandles,
  getGexHistory,
  tick,
  universeQuotes,
  atEnd,
};

export default Feed;
