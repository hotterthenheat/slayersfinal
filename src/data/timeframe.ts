/*
  Timeframe aggregation — rolls the simulator's 1-minute base bars (and the
  parallel GEX snapshots) up to the selected interval. Both keep bar-aligned,
  matching timestamps so the on-chart node overlay stays pinned to price/time.
*/

import type { Candle, GexSnapshot } from '../types/market';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W';

export const TIMEFRAMES: { value: Timeframe; label: string; minutes: number }[] = [
  { value: '1m', label: '1m', minutes: 1 },
  { value: '5m', label: '5m', minutes: 5 },
  { value: '15m', label: '15m', minutes: 15 },
  { value: '30m', label: '30m', minutes: 30 },
  { value: '1h', label: '1h', minutes: 60 },
  { value: '1D', label: '1D', minutes: 1440 },
  { value: '1W', label: '1W', minutes: 10080 },
];

/** Node overlay is an intraday feature — hidden at daily/weekly. */
export const INTRADAY_MAX_MINUTES = 60;

export function tfMinutes(tf: Timeframe): number {
  return TIMEFRAMES.find(t => t.value === tf)?.minutes ?? 1;
}

/** Aggregate 1m OHLC bars into buckets of `minutes`. */
export function aggregateCandles(base: Candle[], minutes: number): Candle[] {
  if (minutes <= 1 || base.length === 0) return base;
  const bucketSec = minutes * 60;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curBucket = -1;

  for (const b of base) {
    const bucket = Math.floor(b.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      curBucket = bucket;
    } else if (cur) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** One snapshot per bucket — the last (most recent) GEX in each, re-stamped to the bucket start. */
export function aggregateSnapshots(base: GexSnapshot[], minutes: number): GexSnapshot[] {
  if (base.length === 0) return base;
  const bucketSec = minutes * 60;
  const out: GexSnapshot[] = [];
  let curBucket = -1;

  for (const snap of base) {
    const bucket = minutes <= 1 ? snap.time : Math.floor(snap.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      out.push({ time: bucket, levels: snap.levels });
      curBucket = bucket;
    } else {
      out[out.length - 1] = { time: bucket, levels: snap.levels };
    }
  }
  return out;
}

/** Largest |value| across all snapshot levels, for normalizing node intensity. */
export function snapshotsMaxAbs(snaps: GexSnapshot[]): number {
  let max = 1;
  for (const s of snaps) {
    for (const l of s.levels) {
      const a = Math.abs(l.value);
      if (a > max) max = a;
    }
  }
  return max;
}
