/*
  Timeframe aggregation — rolls the simulator's 1-minute base bars (and the
  parallel GEX snapshots) up to the selected interval. Both keep bar-aligned,
  matching timestamps so the on-chart node overlay stays pinned to price/time.
*/

import type { Candle, GexSnapshot } from '../types/market';

export type Timeframe = '15s' | '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W';

/*
  T-14 — SUB-MINUTE, honestly. `minutes` goes FRACTIONAL below one minute
  (15s = 0.25) so every consumer that multiplies by 60 keeps working in
  seconds without a second unit system. The 15s row is served from the
  simulator's live-only seconds tape (one tick = one quarter-bar), never by
  resampling 1m history — a sub-minute label on resampled minutes would be
  a different instrument wearing the same name, the exact thing the
  directive rules out. The region before the app connected is EMPTY and the
  pane says so.

  1s AND 5s WAIT FOR THE FEED, deliberately: the seam's finest real
  observation is one tick per quarter-minute, so a 1s row today would be
  invention, and this desk does not ship pickers whose data cannot exist.
  When the per-second WebSocket lands they are one row each here.
*/
export const TIMEFRAMES: { value: Timeframe; label: string; minutes: number }[] = [
  { value: '15s', label: '15s', minutes: 0.25 },
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

/*
  1.2 · "Timeframe selector states with disabled reasons where history is
  short."

  A 1W chart of a name with twenty-two sessions of history is five bars.
  Five bars is not a chart; it is five rectangles, and a reader who picks
  1W and gets them concludes the desk is broken rather than that the
  history is short. The honest control refuses the pick and SAYS WHY.

  TEN IS THE FLOOR, and it is a reading floor rather than a rendering one:
  the chart will happily draw three bars. Ten is roughly where a reader can
  tell a trend from noise — where the eye has enough to compare against —
  and below it the timeframe is answering a question the history cannot.

  COUNTED BY AGGREGATING, NOT BY DIVIDING. `historyMinutes / 1440` says a
  day is 1,440 minutes of bars, and it is not — a session is 390, so that
  arithmetic reports six days where there are twenty-two. The bars a
  timeframe would actually draw are the bars `aggregateCandles` would
  actually produce, so that is what is counted. One pass over the base
  bars per timeframe, memoised by the caller on the history's revision.
*/
export const MIN_BARS = 10;

export type BarCounts = Partial<Record<Timeframe, number>>;

/** How many bars each timeframe would draw from this base history. */
export function barCounts(base: Candle[]): BarCounts {
  const out: BarCounts = {};
  for (const t of TIMEFRAMES) out[t.value] = aggregateCandles(base, t.minutes).length;
  return out;
}

/** Why a timeframe is refused, in words — or null when it is not. */
export function tooShort(counts: BarCounts | undefined, tf: Timeframe): string | null {
  if (!counts) return null;
  const bars = counts[tf];
  /* The seconds tape is its own feed and empties honestly on the chart
     itself; an unknown count must never disable a control. */
  if (bars === undefined || tfMinutes(tf) < 1) return null;
  if (bars >= MIN_BARS) return null;
  return `${bars} bar${bars === 1 ? '' : 's'} of history — a ${tf} chart needs at least ${MIN_BARS}`;
}

export function tfMinutes(tf: Timeframe): number {
  return TIMEFRAMES.find(t => t.value === tf)?.minutes ?? 1;
}

/** Aggregate 1m OHLC bars into buckets of `minutes`. The base contract is
    ONE-MINUTE bars: sub-minute timeframes never come through here — they
    read the seconds tape directly (see the T-14 note above), so `<= 1`
    correctly means "already at or below the base grid". */
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
/*
  ══ CLOSED BUCKETS ARE FINISHED, SO THEY ARE NOT RE-WALKED ═════════════════

  This walked every snapshot in the history on every call — a month of
  minutes times sixty strikes, about half a million steps — and the chart
  calls it once per tick, per pane. Profiled in the browser on an idle
  four-pane desk it was the second-largest cost on the machine, behind only
  the primitive it feeds.

  All but the LAST bucket is closed: the minutes underneath it are already
  in the past and cannot change, so their peaks cannot either. The walk now
  resumes at the first snapshot of the still-forming bucket and the closed
  ones are handed back as they were.

  THE CACHE IS KEYED ON THE ARRAY ITSELF, weakly, because the simulator
  mutates one history array in place rather than handing out a new one — so
  identity is the honest key, and a symbol that stops being drawn takes its
  entry with it. Two guards make a stale hit impossible: the first
  snapshot's time (the history shifts its front when it reaches its limit)
  and the length (a shorter array is a different history, not a longer one).
*/
interface AggState {
  firstTime: number;
  /** Index of the first snapshot in the bucket that was still open. */
  openFrom: number;
  /** Every bucket that was already closed when we stopped. */
  closed: GexSnapshot[];
}
const aggMemo = new WeakMap<GexSnapshot[], Map<number, AggState>>();

export function aggregateSnapshots(base: GexSnapshot[], minutes: number): GexSnapshot[] {
  if (base.length === 0 || minutes <= 1) return base;
  const bucketSec = minutes * 60;
  let perMinutes = aggMemo.get(base);
  if (!perMinutes) aggMemo.set(base, (perMinutes = new Map<number, AggState>()));
  const prev = perMinutes.get(minutes);
  const resumable = prev !== undefined && prev.firstTime === base[0].time && prev.openFrom <= base.length;
  const out: GexSnapshot[] = resumable ? prev!.closed.slice() : [];
  /* The bucket's node is its PEAK minute, per strike — the way a candle
     keeps its high and low, not its average. A mean flattened the ribbon's
     envelope into a smooth band; the jagged amplitude IS the texture
     (Noah, 2026-08-22, against Sovereign's close-ups). The last-minute
     sample before that was worse: a 30-minute node was whatever the strike
     happened to be at minute 30. Signed by the peak's own side. */
  let curBucket = -1;
  let peaks = new Map<number, number>();
  let openFrom = resumable ? prev!.openFrom : 0;
  const flush = () => {
    if (curBucket < 0) return;
    out.push({ time: curBucket, levels: [...peaks.entries()].map(([strike, value]) => ({ strike, value })) });
  };
  for (let i = openFrom; i < base.length; i++) {
    const snap = base[i];
    const bucket = Math.floor(snap.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      flush();
      curBucket = bucket;
      peaks = new Map();
      openFrom = i;
    }
    for (const l of snap.levels) {
      const p = peaks.get(l.strike);
      if (p === undefined || Math.abs(l.value) > Math.abs(p)) peaks.set(l.strike, l.value);
    }
  }
  /* What is handed back includes the open bucket; what is REMEMBERED does
     not, because next tick it will have changed. */
  perMinutes.set(minutes, { firstTime: base[0].time, openFrom, closed: out.slice() });
  flush();
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
