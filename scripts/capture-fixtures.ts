/*
  Freeze the generated market to disk, once, so the UI can render from a
  recording instead of from an engine.

  WHY THIS EXISTS. Everything the terminal shows is currently computed at
  runtime: a random-walk price simulator, a Black-Scholes chain, a hash-seeded
  generator behind every desk. That math is being removed — the real
  implementations live elsewhere and will be dropped in later. Until then the
  UI needs something to draw, and a RECORDING is the honest form of that: it is
  inspectable, it never invents a new number on refresh, and swapping it for
  real data is one module change rather than a rewrite.

  WHAT IT RECORDS, and why that shape:

  - `bars` — the full OHLCV series per name, as flat number tuples rather than
    objects. `{time,open,high,low,close,volume}` costs about twice its own
    data in key names, repeated tens of thousands of times.

  - `snapshot` — ONE book per name (chain, indicators, plan). The option chain
    is the slow-moving part of the picture; price is the fast part. Recording
    one book and replaying price against it is what "snapshot" means here, and
    it is why this file does not try to store a chain per bar.

  Run: npx tsx scripts/capture-fixtures.ts
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Simulator from '../src/core/simulator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'recorded');

/** Cents for prices, whole units for volume — the resolution the UI renders. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** [time, open, high, low, close, volume] */
type BarTuple = [number, number, number, number, number, number];

interface RecordedName {
  ticker: string;
  basePrice: number;
  iv: number;
  step: number;
  bars: BarTuple[];
  snapshot: unknown;
}

/*
  The names worth a long recording are the ones a chart can actually be opened
  on. Everything else in the app reaches names through a quote, not a series.

  Five sessions, not the twenty-two the simulator seeds. The full span costs
  2.34 MB across all names, and 2.2 MB of that is four names' worth of
  one-minute bars nobody scrolls back to: the intraday timeframes render the
  last session or two, and the daily and weekly views aggregate — so the
  twentieth session back is paid for on every load and drawn as a fifth of one
  weekly candle. Five sessions still fills 1m through 1h, leaves a week of
  daily bars, and leaves four sessions of replay runway ahead of the start
  index.
*/
const NATIVE: string[] = [...Simulator.WATCHLIST];
const NATIVE_SESSION_BARS = 390 * 5;

/*
  Roster names get one session rather than the full span: they appear as scan
  cards and sparklines, never as the main chart, so a month of one-minute bars
  per name would be paid for and never drawn.
*/
const ROSTER_SESSION_BARS = 390;

function record(sym: string, keepBars: number | null): RecordedName {
  Simulator.ensureTicker(sym);
  const cfg = Simulator.TICKERS[sym];
  const all = Simulator.getCandles(sym);
  const bars = (keepBars ? all.slice(-keepBars) : all).map(
    (b): BarTuple => [b.time, r2(b.open), r2(b.high), r2(b.low), r2(b.close), Math.round(b.volume)]
  );
  return {
    ticker: sym,
    basePrice: r2(cfg.basePrice),
    iv: cfg.iv,
    step: cfg.step,
    bars,
    snapshot: Simulator.snapshotFor(sym),
  };
}

const quotes = Simulator.universeQuotes(NATIVE[0]);
const rosterNames = Array.from(new Set(quotes.map(q => q.ticker))).filter(
  t => !NATIVE.includes(t)
);

const out: Record<string, RecordedName> = {};
for (const sym of NATIVE) out[sym] = record(sym, NATIVE_SESSION_BARS);
for (const sym of rosterNames) out[sym] = record(sym, ROSTER_SESSION_BARS);

mkdirSync(OUT, { recursive: true });

/*
  Written as one file per name. A single bundle would be one import that pulls
  every recorded series into the first chunk that touches any of them; per-name
  files let the bundler keep a name's series out of the build until something
  asks for that name.
*/
let totalBytes = 0;
for (const [sym, rec] of Object.entries(out)) {
  const json = JSON.stringify(rec);
  writeFileSync(path.join(OUT, `${sym}.json`), json);
  totalBytes += json.length;
}

const index = {
  captured: new Date().toISOString(),
  native: NATIVE,
  roster: rosterNames,
  barsPerNative: out[NATIVE[0]].bars.length,
  barsPerRoster: ROSTER_SESSION_BARS,
};
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`recorded ${Object.keys(out).length} names -> ${OUT}`);
console.log(`  native  ${NATIVE.length} x ${index.barsPerNative} bars`);
console.log(`  roster  ${rosterNames.length} x ${ROSTER_SESSION_BARS} bars`);
console.log(`  total   ${(totalBytes / 1024 / 1024).toFixed(2)} MB of JSON`);
