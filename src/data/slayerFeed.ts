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
import type { BookBar, ChainNow, SlayerFeed } from './pine/feed';
import type { Candle } from '../types/market';

/**
 * The book behind a run, indexed by the run's own bar index.
 *
 * Returns null when there is no history at all for the symbol — the caller
 * then hands the engine no feed, and a `slayer.*` script fails loudly rather
 * than drawing an empty chart.
 */
export function buildSlayerFeed(ticker: string, bars: readonly Candle[], barMinutes: number): SlayerFeed | null {
  const sym = Simulator.ensureTicker(ticker);
  const snaps = Simulator.getGexHistory(sym);
  if (!snaps || snaps.length === 0 || bars.length === 0) return null;

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

  return { book, now: chainNow(sym) };
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
