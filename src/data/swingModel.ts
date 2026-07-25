/*
==================================================
  SLAYER TERMINAL - SWING MODEL (swingModel.ts)
  A daily price-estimation model for swings: seeded
  daily candles that END at the live spot, plus the
  read a swing trader draws by hand — the resistance
  and support zones, a rising/falling trend rail, and
  a measured-move projection to the next zone with its
  percent target. Deterministic per ticker.
==================================================
*/

import { hash, hGauss, hRange } from '../core/rng';
import type { Candle } from '../types/market';

export interface SwingZone {
  lo: number;
  hi: number;
  mid: number;
  kind: 'support' | 'resistance';
  /** Signed % from spot to the zone mid */
  pct: number;
}

export interface SwingTrend {
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  dir: 'up' | 'down';
}

export interface SwingProjection {
  /** Bar time the arrow is anchored at */
  time: number;
  from: number;
  to: number;
  /** Signed % of the projected move */
  pct: number;
  dir: 'up' | 'down';
}

export interface SwingModel {
  ticker: string;
  bars: Candle[];
  price: number;
  support: SwingZone;
  resistance: SwingZone;
  trend: SwingTrend;
  projection: SwingProjection;
}

const DAY = 86_400;
const N = 150; // daily bars of history

/** Daily volatility as a fraction of price — indices calmer than single names. */
function dailyVol(ticker: string): number {
  if (/^(SPY|SPX|QQQ|IWM|DIA)$/i.test(ticker)) return 0.011;
  return hRange(`${ticker}-swvol`, 0.02, 0.045);
}

/** Seeded daily OHLC ending exactly at `spot`, generated backward from today. */
function buildDailyBars(ticker: string, spot: number, nowSec: number): Candle[] {
  const seed = `${ticker}-swing`;
  const v = dailyVol(ticker);
  const endDay = Math.floor(nowSec / DAY) * DAY;

  // Backward random walk of closes so the newest close == spot.
  const closes = new Float64Array(N);
  closes[N - 1] = spot;
  for (let i = N - 2; i >= 0; i--) {
    // gentle drift + shock; divide going backward
    const ret = hGauss(`${seed}-r${i}`) * v + (hash(`${seed}-d${i}`) % 7 === 0 ? hGauss(`${seed}-s${i}`) * v * 2 : 0);
    closes[i] = Math.max(1, closes[i + 1] / (1 + ret));
  }

  const bars: Candle[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const close = closes[i];
    const open = i > 0 ? closes[i - 1] : close * (1 - hGauss(`${seed}-o`) * v);
    const body = Math.max(open, close);
    const bodyLo = Math.min(open, close);
    const wickUp = Math.abs(hGauss(`${seed}-wu${i}`)) * v * 0.7;
    const wickDn = Math.abs(hGauss(`${seed}-wd${i}`)) * v * 0.7;
    bars[i] = {
      time: endDay - (N - 1 - i) * DAY,
      open: Number(open.toFixed(2)),
      high: Number((body * (1 + wickUp)).toFixed(2)),
      low: Number((bodyLo * (1 - wickDn)).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(hRange(`${seed}-v${i}`, 4e7, 1.4e8)),
    };
  }
  return bars;
}

/** Highest high / lowest low over a recent window (excludes the last few live bars). */
function windowExtremes(bars: Candle[], lookback: number, pad: number) {
  const end = bars.length - pad;
  const start = Math.max(0, end - lookback);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = start; i < end; i++) {
    if (bars[i].high > hi) hi = bars[i].high;
    if (bars[i].low < lo) lo = bars[i].low;
  }
  return { hi, lo };
}

/** Index of the lowest low within [start, end). */
function lowestIdx(bars: Candle[], start: number, end: number): number {
  let idx = start;
  for (let i = start; i < end; i++) if (bars[i].low < bars[idx].low) idx = i;
  return idx;
}

export function buildSwingModel(ticker: string, spot: number, nowSec: number): SwingModel {
  const bars = buildDailyBars(ticker, spot, nowSec);
  const price = spot;

  // Resistance / support from the recent swing range; band ≈ ±0.35% so the zone
  // reads as a shelf, not a hairline.
  const { hi, lo } = windowExtremes(bars, 70, 2);
  const band = (kind: 'support' | 'resistance', center: number): SwingZone => {
    const w = center * 0.0035;
    return { lo: center - w, hi: center + w, mid: center, kind, pct: ((center - price) / price) * 100 };
  };
  const resistance = band('resistance', hi);
  const support = band('support', lo);

  // Trend rail through the two dominant swing lows (first half → second half).
  const mid = Math.floor(bars.length / 2);
  const i1 = lowestIdx(bars, 4, mid);
  const i2 = lowestIdx(bars, mid, bars.length - 2);
  const trend: SwingTrend = {
    t1: bars[i1].time,
    p1: bars[i1].low,
    t2: bars[i2].time,
    p2: bars[i2].low,
    dir: bars[i2].low >= bars[i1].low ? 'up' : 'down',
  };

  // Measured-move projection: from spot toward whichever zone is further away —
  // above midrange → project down to support; below → project up to resistance.
  const rangeMid = (resistance.mid + support.mid) / 2;
  const projDown = price >= rangeMid;
  const target = projDown ? support.mid : resistance.mid;
  const projection: SwingProjection = {
    // anchor a few bars back from the live edge so the arrow sits in open space
    time: bars[bars.length - 8].time,
    from: price,
    to: target,
    pct: ((target - price) / price) * 100,
    dir: projDown ? 'down' : 'up',
  };

  return { ticker, bars, price, support, resistance, trend, projection };
}
