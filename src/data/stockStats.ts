import type { Candle } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - ROLLING STATISTICS (data/stockStats.ts)
  Part 7.3 — the numbers a screening board is missing.
==================================================

  A screening board ranks names on four sleeves and never says how any of
  them has actually behaved. These are the behaviours: what it returned,
  how much it moved doing it, the worst hole it dug, and how often it
  closed up.

  ── THE WINDOW IS THE CLAIM ───────────────────────────────────────────────

  A 5-session volatility and a 20-session volatility are DIFFERENT NUMBERS
  ABOUT DIFFERENT THINGS, and a panel that lets a reader change the window
  without changing the label is lying to them twice a click. Every reading
  this module returns carries the window it was measured over and the number
  of sessions it actually found, and every caller is expected to print both.

  ── WHAT THE STORE CAN AND CANNOT ANSWER ──────────────────────────────────

  The simulator seeds 22 sessions of one-minute bars per name. That is the
  ceiling, and it is a hard one:

    · 5, 10 and 20 sessions are answerable.
    · 60 sessions, a quarter, a year are NOT, and this module refuses them
      by reason rather than returning a short window under a long label.

  A rolling SERIES needs more than the window itself — it needs one reading
  per step — so a 20-session window over 22 sessions yields a series of
  three points, and that is said rather than drawn as though it were a
  trend. `minSessionsFor` is the arithmetic, in one place.

  ── SESSIONS, FROM MINUTES ────────────────────────────────────────────────

  The bars are one minute apart inside a session and 63,060 seconds apart
  across the overnight gap, so a spacing over two bars starts a new session.
  Measured on a live buffer: 8,580 bars, 8,558 of them 60s apart and 21 at
  63,060 — 22 sessions, exactly what the simulator seeds.
*/

/** Bars inside a session are one minute apart; anything larger is a night. */
const SESSION_GAP_SECONDS = 120;

/** Trading days in a year, for annualising a daily standard deviation. */
const TRADING_YEAR = 252;

export type StatKey = 'return' | 'vol' | 'drawdown' | 'upDays' | 'range';

export interface StatWords {
  key: StatKey;
  label: string;
  /** What one reading of it means, in a reader's words. */
  blurb: string;
  unit: '%' | 'pp';
  /** Which end of the scale is the interesting one, for the default sort. */
  best: 'high' | 'low';
}

export const STATS: Record<StatKey, StatWords> = {
  return: {
    key: 'return',
    label: 'Return',
    blurb: 'the close-to-close move across the whole window',
    unit: '%',
    best: 'high',
  },
  vol: {
    key: 'vol',
    label: 'Volatility',
    blurb: 'the standard deviation of daily returns, annualised — how roughly it got where it went',
    unit: '%',
    best: 'low',
  },
  drawdown: {
    key: 'drawdown',
    label: 'Max drawdown',
    blurb: 'the deepest peak-to-trough fall inside the window — the hole a holder actually sat in',
    unit: '%',
    best: 'low',
  },
  upDays: {
    key: 'upDays',
    label: 'Up days',
    blurb: 'the share of sessions that closed higher than they opened',
    unit: 'pp',
    best: 'high',
  },
  range: {
    key: 'range',
    label: 'Daily range',
    blurb: 'the average high-to-low span of a session, as a percent of its close',
    unit: '%',
    best: 'low',
  },
};

export const STAT_KEYS = Object.keys(STATS) as StatKey[];

/**
 * The windows the store can answer, in sessions.
 *
 * Not a preference — a measurement. The simulator seeds 22 sessions, and a
 * window needs at least one session of history beyond itself to produce a
 * single reading, so 20 is the last one that fits.
 */
export const STAT_WINDOWS = [5, 10, 20] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];

/** Sessions needed for one reading of a window, and for a series of `points`. */
export const minSessionsFor = (window: StatWindow, points = 1): number => window + points;

export interface DailyBar {
  /** Unix seconds of the session's last bar. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Fold one-minute bars into sessions.
 *
 * A session's open is its first bar's open, its close its last bar's close,
 * and its high and low the extremes across it — the ordinary daily bar, built
 * rather than assumed, because the store holds minutes.
 */
export function toDailyBars(candles: Candle[]): DailyBar[] {
  const out: DailyBar[] = [];
  let cur: DailyBar | null = null;
  let prevTime = 0;
  for (const c of candles) {
    const newSession = cur === null || c.time - prevTime > SESSION_GAP_SECONDS;
    prevTime = c.time;
    if (newSession) {
      if (cur) out.push(cur);
      cur = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
      continue;
    }
    cur!.time = c.time;
    cur!.close = c.close;
    if (c.high > cur!.high) cur!.high = c.high;
    if (c.low < cur!.low) cur!.low = c.low;
  }
  if (cur) out.push(cur);
  return out;
}

/** One reading of one statistic over a slice of sessions. */
function measure(key: StatKey, slice: DailyBar[]): number {
  switch (key) {
    case 'return':
      return ((slice[slice.length - 1].close - slice[0].close) / slice[0].close) * 100;
    case 'vol': {
      const rs: number[] = [];
      for (let i = 1; i < slice.length; i++) rs.push(Math.log(slice[i].close / slice[i - 1].close));
      if (rs.length < 2) return 0;
      const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
      /* The SAMPLE deviation — n−1. Over a 5-session window the population
         formula understates by ~11%, which is the difference between two
         names looking alike and one of them being the rougher ride. */
      const varSum = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (rs.length - 1);
      return Math.sqrt(varSum * TRADING_YEAR) * 100;
    }
    case 'drawdown': {
      let peak = slice[0].close;
      let worst = 0;
      for (const b of slice) {
        if (b.close > peak) peak = b.close;
        const dd = ((b.close - peak) / peak) * 100;
        if (dd < worst) worst = dd;
      }
      return worst;
    }
    case 'upDays':
      return (slice.filter(b => b.close > b.open).length / slice.length) * 100;
    case 'range':
      return (slice.reduce((a, b) => a + (b.high - b.low) / b.close, 0) / slice.length) * 100;
  }
}

export interface StatReading {
  key: StatKey;
  window: StatWindow;
  /** The current reading, or null when the store cannot answer. */
  now: number | null;
  /** One reading per step back through the history, oldest first. */
  series: number[];
  /** Sessions actually found for this name. */
  sessions: number;
  /** Why there is no reading — null when there is one. */
  reason: string | null;
}

/**
 * A statistic over a window, and its walk back through the sessions the store
 * holds.
 *
 * `reason` is the whole point of the return shape: a name with eleven
 * sessions asked for a twenty-session volatility gets a sentence naming the
 * shortfall, never a twenty-session label over an eleven-session number.
 */
export function rollingStat(candles: Candle[], key: StatKey, window: StatWindow): StatReading {
  const days = toDailyBars(candles);
  const sessions = days.length;
  const need = minSessionsFor(window);
  if (sessions < need) {
    return {
      key,
      window,
      now: null,
      series: [],
      sessions,
      reason: `${window} sessions needs ${need} in the store; this name has ${sessions}.`,
    };
  }
  const series: number[] = [];
  for (let end = window; end < sessions; end++) series.push(measure(key, days.slice(end - window, end + 1)));
  return { key, window, now: series[series.length - 1] ?? null, series, sessions, reason: null };
}

/** How many readings a series of this window will hold, given the store's depth. */
export function seriesLength(sessions: number, window: StatWindow): number {
  return Math.max(0, sessions - window);
}

/** One name's reading, for the roster ranking. */
export interface StatRow {
  ticker: string;
  now: number;
  sessions: number;
}

/**
 * Rank the names a caller has already measured.
 *
 * This module never reaches for a name's history itself. Warming an unseeded
 * name costs ~360ms of forward simulation — measured, not estimated — so a
 * ranking that pulled the whole universe on mount would freeze the board for
 * ten seconds. The caller decides what it can afford to warm and hands the
 * readings in; the board says how many it has.
 */
export function rankStat(rows: StatRow[], key: StatKey): StatRow[] {
  const best = STATS[key].best;
  return [...rows].sort((a, b) => (best === 'high' ? b.now - a.now : a.now - b.now));
}

/** The reading, printed the way its unit wants. */
export function fmtStat(key: StatKey, v: number | null): string {
  if (v === null) return '—';
  const s = STATS[key];
  if (s.unit === 'pp') return `${Math.round(v)}%`;
  return `${v > 0 && key === 'return' ? '+' : ''}${v.toFixed(key === 'vol' ? 1 : 2)}%`;
}
