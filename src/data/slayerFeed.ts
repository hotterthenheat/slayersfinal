/*
==================================================
  SLAYER TERMINAL - THE BOOK, ALIGNED TO A SCRIPT'S BARS (data/slayerFeed.ts)
==================================================

  `data/pine/feed.ts` is the shape. This is where it is filled: the app side
  of the seam, the only file that knows the dealer book comes from the
  simulator's minute-by-minute snapshots.

  ─────────────────────────────────────────────────────────────────────────
  ALIGNMENT IS THE WHOLE JOB, and it follows a rule already settled here.

  The book is recorded once a minute. A script may be running on 5-minute or
  15-minute bars. Each of those bars is served THE LAST SNAPSHOT THAT HAD
  ALREADY BEEN TAKEN WHEN THE BAR CLOSED — the identical rule
  `Interp.security` uses for a higher-timeframe fetch, and for the identical
  reason: a level that appears at 10:05 must be one that existed at 10:05.
  Serving the snapshot from the middle of a forming bar would let a script
  fire on gamma that had not been written down yet.

  A bar earlier than the first snapshot gets `null`, and every `slayer.*`
  series reads `na` there. It does NOT carry the first known book backwards,
  which would draw a wall across a stretch of chart where nobody knows what
  the book was.

  ─────────────────────────────────────────────────────────────────────────
  ONE BOOK, ONE CANON.

  The walls, the flip and the supreme strike are read through
  `readExposureNow`, which is what the rail beside the chart reads and what
  `core/walls.ts` defines. A second implementation here would drift: a
  script would draw a call wall at one strike while the rail printed another,
  and both would look right on their own. That is the exact failure
  `core/walls.ts` exists to prevent, and this file is one more caller of it.
*/

import Simulator from '../core/simulator';
import { readExposureNow } from './gex';
import { buildPins } from './pins';
import { bucketFlow } from './flowBars';
import { realizedVol } from './volDrift';
import { sessionVolumeProfile } from './volumeProfile';
import { buildSessionLevels } from './sessionLevels';
import { buildExpectedMoveCone } from './expectedMove';
import type { BookBar, ChainNow, DeskBar, DeskLevels, SlayerFeed } from './pine/feed';
import type { Candle } from '../types/market';
import type { FlowPrint } from '../types/trace';

/** The option tape, if the caller has one. Absent on a run with no desk. */
export interface DeskInputs {
  prints?: readonly (FlowPrint & { at?: number })[];
}

/**
 * The book behind a run, indexed by the run's own bar index.
 *
 * Returns null when there is no history at all for the symbol — the caller
 * then hands the engine no feed, and a `slayer.*` script fails loudly rather
 * than drawing an empty chart.
 */
/*
  THE FEED IS MEMOISED, and it has to be.

  The chart re-runs enabled scripts live, and this is built once per run.
  Measured cold at 161ms over 1,738 bars — the volume profile and the
  realised-vol walk between them — which on a pane refreshing every few
  hundred milliseconds is most of the frame budget spent recomputing an
  answer that only changes when a bar closes.

  The key is what the answer depends on: the symbol, the interval, how many
  bars there are, when the last one is, what it closed at, and how many
  prints the tape holds. A new bar, a new tick or a new print all change it;
  nothing else does. One entry, because a pane looks at one thing at a time
  and holding a map of them would keep whole tapes alive after a symbol
  change.
*/
let feedCache: { key: string; feed: SlayerFeed } | null = null;

export function buildSlayerFeed(
  ticker: string,
  bars: readonly Candle[],
  barMinutes: number,
  inputs: DeskInputs = {}
): SlayerFeed | null {
  const sym = Simulator.ensureTicker(ticker);
  const snaps = Simulator.getGexHistory(sym);
  if (!snaps || snaps.length === 0 || bars.length === 0) return null;

  const last = bars[bars.length - 1];
  const key = `${sym}|${barMinutes}|${bars.length}|${last.time}|${last.close}|${inputs.prints?.length ?? 0}|${snaps.length}`;
  if (feedCache && feedCache.key === key) return feedCache.feed;

  const barSec = Math.max(60, barMinutes * 60);
  const book: (BookBar | null)[] = new Array(bars.length).fill(null);

  /* Both series ascend, so one walk pairs them. `j` is the count of
     snapshots taken at or before this bar's close, so `j - 1` is the last
     one that existed — the same index arithmetic as the fetch aligner. */
  let j = 0;
  for (let i = 0; i < bars.length; i++) {
    const closeAt = bars[i].time + barSec;
    while (j < snaps.length && snaps[j].time <= closeAt) j += 1;
    if (j === 0) continue;
    const snap = snaps[j - 1];
    if (snap.levels.length === 0) continue;
    /*
      SPOT FOR THE WALL READ IS THIS BAR'S CLOSE.

      `pickWalls` and `pickFlip` are both relative to spot — the call wall is
      the heaviest positive strike ABOVE it. Using the live price for a bar
      three hours old would walk the whole historical series of walls around
      today's spot, which is not what happened.
    */
    const read = readExposureNow(snap.levels, bars[i].close);
    book[i] = {
      netGex: read.netGex,
      callWall: read.callWall,
      putWall: read.putWall,
      flip: read.flip,
      supreme: read.supreme,
      step: read.step,
      strikes: snap.levels.map(l => ({
        strike: l.strike,
        value: l.value,
        callOI: l.callOI,
        putOI: l.putOI,
      })),
    };
  }

  const desk = buildDeskBars(sym, bars, barMinutes, inputs);
  const feed: SlayerFeed = {
    book,
    now: chainNow(sym),
    desk: desk.lanes,
    levels: buildDeskLevels(sym, bars),
    flowFromBar: desk.flowFromBar,
  };
  feedCache = { key, feed };
  return feed;
}

/**
 * THE TAPE, THE VOLATILITY AND THE EVENTS, per bar.
 *
 * Three lanes that share one walk because they share one alignment: the bar
 * index the script is running on.
 *
 * WHY FLOW IS MOSTLY NULL, and why that is the right answer. The option tape
 * accumulates from the moment the app opens and keeps roughly four hours of
 * it; a chart showing six hundred fifteen-minute bars covers a week. Filling
 * the rest with zero would say "nothing traded there", which is a claim about
 * the market that nobody here is in a position to make. Null says "we were
 * not listening", the engine reports `na`, and the first bar the tape does
 * reach is handed back so a run can tell the reader where its flow begins.
 */
function buildDeskBars(
  sym: string,
  bars: readonly Candle[],
  barMinutes: number,
  inputs: DeskInputs
): { lanes: DeskBar[]; flowFromBar: number | null } {
  const barSec = Math.max(60, barMinutes * 60);
  const lanes: DeskBar[] = bars.map(() => ({ callPrem: null, putPrem: null, rv: null, event: false }));

  /* ── the option tape ── */
  let flowFromBar: number | null = null;
  const prints = inputs.prints ?? [];
  if (prints.length > 0) {
    const buckets = bucketFlow(prints, { barSec, ticker: sym });
    const byTime = new Map<number, { call: number; put: number }>();
    for (const b of buckets) byTime.set(b.time, { call: b.callPrem, put: b.putPrem });
    for (let i = 0; i < bars.length; i++) {
      const hit = byTime.get(Math.floor(bars[i].time / barSec) * barSec);
      if (!hit) continue;
      lanes[i].callPrem = hit.call;
      lanes[i].putPrem = hit.put;
      if (flowFromBar === null) flowFromBar = i;
    }
  }

  /* ── realised volatility, from the same bars the script is drawn on ── */
  const rv = realizedVol(bars, barSec);
  if (rv.length > 0) {
    const byRvTime = new Map<number, number>();
    for (const p of rv) byRvTime.set(p.time, p.value);
    for (let i = 0; i < bars.length; i++) {
      const v = byRvTime.get(bars[i].time);
      if (typeof v === 'number' && Number.isFinite(v)) lanes[i].rv = v;
    }
  }

  return { lanes, flowFromBar };
}

/**
 * The session's own levels, computed once.
 *
 * ALL OF THESE ARE READ FROM THE DESK'S OWN CANON rather than recomputed
 * here — the volume profile from `volumeProfile.ts`, the session levels from
 * `sessionLevels.ts`, the band from `expectedMove.ts`. A second
 * implementation would drift, and a script drawing a point of control one
 * cent from the one the chart's own profile draws is the failure
 * `core/walls.ts` exists to prevent, in a new place.
 */
function buildDeskLevels(sym: string, bars: readonly Candle[]): DeskLevels {
  const empty: DeskLevels = {
    vpoc: null, vah: null, val: null,
    em1Hi: null, em1Lo: null, em2Hi: null, em2Lo: null,
    pdh: null, pdl: null, pdc: null,
    orHi: null, orLo: null, ibHi: null, ibLo: null,
    iv: null,
  };
  if (bars.length === 0) return empty;

  /* The profile and the session levels are cut from MINUTE bars — both walk
     session boundaries by bar gap, and a fifteen-minute series has too few
     bars in a session for either to mean much. */
  const minute = Simulator.getCandles(sym) ?? [];
  const src = minute.length > bars.length ? minute : bars;

  const profile = sessionVolumeProfile(src);
  const levels = buildSessionLevels(src, 15);
  const byKey = new Map(levels.levels.map(l => [l.key, l.price] as const));

  /* The band the options priced this morning. `minutesToClose` is not known
     to this file, and the SIZE of the band is what a script wants rather than
     how much of the day is left, so it is asked for at the close: the full
     day's move. */
  /* Today's implied, read from the same quote the rest of the desk reads. */
  const quote = Simulator.universeQuotes(sym).find(q => q.ticker === sym) ?? null;
  const iv = quote && typeof quote.iv === 'number' && quote.iv > 0 ? quote.iv : null;
  let em1Hi: number | null = null;
  let em1Lo: number | null = null;
  let em2Hi: number | null = null;
  let em2Lo: number | null = null;
  if (iv !== null) {
    /* One session's worth of minute bars, and the band asked for at the
       close: a script wants the DAY'S implied move, not how much of it is
       left at the moment the script happens to run. */
    const cone = buildExpectedMoveCone(src.slice(-390), iv, 390, 1);
    const last = cone.past[cone.past.length - 1];
    if (last) {
      em1Hi = last.up1;
      em1Lo = last.dn1;
      em2Hi = last.up2;
      em2Lo = last.dn2;
    }
  }

  return {
    vpoc: profile.vpoc,
    vah: profile.vah,
    val: profile.val,
    em1Hi, em1Lo, em2Hi, em2Lo,
    pdh: byKey.get('prevHigh') ?? null,
    pdl: byKey.get('prevLow') ?? null,
    pdc: byKey.get('prevClose') ?? null,
    orHi: levels.orComplete ? (byKey.get('orHigh') ?? null) : null,
    orLo: levels.orComplete ? (byKey.get('orLow') ?? null) : null,
    ibHi: levels.ibComplete ? (byKey.get('ibHigh') ?? null) : null,
    ibLo: levels.ibComplete ? (byKey.get('ibLow') ?? null) : null,
    iv: iv === null ? null : iv * 100,
  };
}

/**
 * Today's chain as totals — one reading, no history.
 *
 * Everything here is a number about RIGHT NOW. The engine reports each one
 * it is asked for, because a flat line across a chart is indistinguishable
 * from a level that held all day.
 */
function chainNow(sym: string): ChainNow | null {
  const { chain, spot } = Simulator.chainFor(sym);
  if (chain.length === 0) return null;
  let netDex = 0;
  let netVex = 0;
  let netVanna = 0;
  let netCharm = 0;
  for (const n of chain) {
    netDex += n.netDex;
    netVex += n.netVex;
    netVanna += n.netVanna;
    netCharm += n.netCharm;
  }
  const pins = buildPins(chain, spot);
  return { netDex, netVex, netVanna, netCharm, maxPain: pins.maxPain, gammaPin: pins.gammaPin };
}
