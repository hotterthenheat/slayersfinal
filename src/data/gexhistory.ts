/*
==================================================
  SLAYER TERMINAL - GEX HISTORY (gexhistory.ts)
  Replays how the session's structural levels — call
  wall, put wall, gamma flip, king strike and net GEX
  — actually moved, read off the simulator's recorded
  net-GEX-per-strike snapshots. Every point is a book
  that existed at a bar; nothing here invents a level.
==================================================
*/

import Simulator from '../core/simulator';
import { buildLevels } from './gex';
import { levelsOfProfile } from './vannacharm';
import type { MarketSnapshot } from '../types/market';

export interface LevelPoint {
  t: number;
  time: string;
  spot: number;
  callWall: number;
  putWall: number;
  flip: number;
  king: number;
  netGex: number;
}

export interface LevelShift {
  label: string;
  from: number;
  to: number;
  deltaPct: number;
}

export interface GexHistoryView {
  points: LevelPoint[];
  now: LevelPoint;
  open: LevelPoint;
  shifts: LevelShift[];
  netGexFlips: number;
  flipCrosses: number;
  widthNow: number;
  widthOpen: number;
}

const SESSION_BARS = 390; // one 6.5h session of the store's 1-minute bars
const MAX_POINTS = 46; // a scrubbable timeline, not one row per minute

/** HH:MM off the bar's own timestamp — the moment that was recorded, not an
    index mapped onto a nominal 09:30–16:00 clock. */
function barClock(sec: number): string {
  const d = new Date(sec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The session's level migration, sampled from the recorded book.
 *
 * The simulator keeps a net-GEX-per-strike snapshot beside every candle
 * (`Simulator.getGexHistory`), so "where was the call wall at 11:40" is a
 * question the engine can answer rather than one this module has to guess at.
 * Each sampled bar's whole profile goes through `levelsOfProfile` — the same
 * wall / flip / king rules `buildLevels` applies to today's chain, which
 * levels.test.ts pins to each other — so the line the chart draws at 11:40 is
 * the number the rail would have printed at 11:40.
 *
 * What this replaced: mean-reverting Gaussian walks around today's closing
 * levels, plus a `netGex` ramp of `now × (0.35 … 1.0)`. The shape was
 * plausible, and the page counts sign flips and flip crosses off it and prints
 * them as "N sign flips today" — a measurement of noise. Reading the store
 * costs the same and the counts become real.
 *
 * Returns null when nothing is recorded yet; the page shows its reconstructing
 * state rather than a session drawn from numbers no bar produced.
 */
export function buildGexHistory(snapshot: MarketSnapshot): GexHistoryView | null {
  const { ticker, chain } = snapshot;
  const candles = Simulator.getCandles(ticker);
  const snaps = Simulator.getGexHistory(ticker);
  const bars = Math.min(SESSION_BARS, candles?.length ?? 0, snaps?.length ?? 0);
  if (bars < 2) return null;

  // The two stores are appended together, so their tails line up bar for bar.
  const firstCandle = candles.length - bars;
  const firstSnap = snaps.length - bars;

  // Even stride, plus the final bar unconditionally: the right edge of this
  // chart is "now" and the shift table measures open → now across it, so a
  // stride that stops short would date the session's last reading.
  const stride = Math.max(1, Math.ceil(bars / MAX_POINTS));
  const sampled: number[] = [];
  for (let i = 0; i < bars; i += stride) sampled.push(i);
  if (sampled[sampled.length - 1] !== bars - 1) sampled.push(bars - 1);

  const points: LevelPoint[] = sampled.map((i, t) => {
    const recorded = snaps[firstSnap + i];
    const sp = candles[firstCandle + i].close;
    const { callWall, putWall, flip, king } = levelsOfProfile(recorded.levels, sp);
    return {
      t,
      time: barClock(recorded.time),
      spot: Number(sp.toFixed(2)),
      callWall,
      putWall,
      flip,
      king,
      netGex: recorded.levels.reduce((a, l) => a + l.value, 0),
    };
  });

  // The last row is the rail's reading, not the last capture. The store only
  // refreshes the forming bar for the ticker on screen, so a background name's
  // newest snapshot can be minutes stale — and this page sits on the same
  // screen as the key-levels rail, which must never name a different wall for
  // the same instrument. Taken unrounded so the row IS the rail's number rather
  // than a re-formatted copy of it.
  const levels = buildLevels(snapshot);
  const now: LevelPoint = {
    ...points[points.length - 1],
    spot: levels.spot,
    callWall: levels.callWall,
    putWall: levels.putWall,
    flip: levels.flip,
    king: levels.king,
    netGex: chain.reduce((a, n) => a + n.netGex, 0),
  };
  points[points.length - 1] = now;
  const open = points[0];

  const pct = (from: number, to: number) => ((to - from) / from) * 100;
  const shifts: LevelShift[] = [
    { label: 'Call Wall', from: open.callWall, to: now.callWall, deltaPct: pct(open.callWall, now.callWall) },
    { label: 'Put Wall', from: open.putWall, to: now.putWall, deltaPct: pct(open.putWall, now.putWall) },
    { label: 'Gamma Flip', from: open.flip, to: now.flip, deltaPct: pct(open.flip, now.flip) },
    { label: 'King Strike', from: open.king, to: now.king, deltaPct: pct(open.king, now.king) },
  ];

  // Counted over the sampled series the page draws, so the badge, the event
  // markers on the scrubber and the line on the chart can never disagree.
  let netGexFlips = 0;
  let flipCrosses = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.sign(points[i].netGex) !== Math.sign(points[i - 1].netGex)) netGexFlips++;
    const wasAbove = points[i - 1].spot >= points[i - 1].flip;
    const isAbove = points[i].spot >= points[i].flip;
    if (wasAbove !== isAbove) flipCrosses++;
  }

  return {
    points,
    now,
    open,
    shifts,
    netGexFlips,
    flipCrosses,
    widthNow: now.callWall - now.putWall,
    widthOpen: open.callWall - open.putWall,
  };
}
