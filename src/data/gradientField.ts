/*
==================================================
  SLAYER TERMINAL - DEALER GRADIENT FIELD (gradientField.ts)
  The VS3D-style "gradient chart": a TIME x PRICE field of
  dealer exposure across the live session, rendered behind
  the tape. Two metrics:

  - GAMMA: interpolated straight from the simulator's
    per-bar net-GEX-per-strike snapshots (gexHistory) —
    real recorded history, one column per minute bar.
  - CHARM: Black-Scholes charm at each (price, bar-close)
    cell, weighted by the same dealer book skew the chain
    uses (long calls above the pivot, short puts below),
    so the field shows where delta bleed pushes hedging.

  Values are percentile-normalized to [-1, 1] so one
  monster cell can't wash out the day's structure.
==================================================
*/

import Simulator from '../core/simulator';
import type { Candle } from '../types/market';

export type GradientMetric = 'gamma' | 'charm';

export interface GradientField {
  rows: number;
  cols: number;
  priceMin: number;
  priceMax: number;
  /** Bar times per column (unix sec) — for the time axis */
  times: number[];
  /** Bar closes per column — the tape overlay */
  closes: number[];
  /** cols x rows, index = col * rows + row; row 0 = priceMin; range [-1, 1] */
  values: Float32Array;
  /** Raw $ magnitude at |value| = 1 (for the hover readout) */
  scale: number;
}

const SESSION_BARS = 390;
const ROWS = 150;

/** Percentile-normalize a signed field to [-1, 1] (anchor = P99 of |v|). */
function normalize(values: Float32Array): number {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > max) max = a;
  }
  if (max <= 0) return 1;
  const BINS = 256;
  const hist = new Uint32Array(BINS);
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a <= 0) continue;
    n++;
    hist[Math.min(BINS - 1, (a / max) * BINS) | 0]++;
  }
  let acc = 0;
  let p = max;
  for (let b = 0; b < BINS; b++) {
    acc += hist[b];
    if (acc >= n * 0.99) {
      p = ((b + 1) / BINS) * max;
      break;
    }
  }
  const inv = 1 / (p || max);
  for (let i = 0; i < values.length; i++) {
    values[i] = Math.max(-1, Math.min(1, values[i] * inv));
  }
  return p || max;
}

export function buildGradientField(ticker: string, metric: GradientMetric): GradientField | null {
  const candles: Candle[] = Simulator.getCandles(ticker) ?? [];
  if (!candles.length) return null;
  // Trailing session-sized window. NOT length % SESSION_BARS — live bars roll
  // in one at a time, and a modulo window would collapse to a couple of bars
  // the minute after load, flattening the whole field.
  const bars = candles.slice(-SESSION_BARS);

  // price window: the session's traded range with breathing room above/below
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b.low < lo) lo = b.low;
    if (b.high > hi) hi = b.high;
  }
  const spot = bars[bars.length - 1].close;
  const pad = spot * 0.0035;
  const priceMin = lo - pad;
  const priceMax = hi + pad;
  const span = priceMax - priceMin || 1;

  const cols = bars.length;
  const rows = ROWS;
  const values = new Float32Array(cols * rows);
  const times = bars.map(b => b.time);
  const closes = bars.map(b => b.close);

  if (metric === 'gamma') {
    // one recorded net-GEX snapshot per bar, parallel to the candle series
    const snaps = Simulator.getGexHistory(ticker) ?? [];
    if (!snaps.length) return null;
    const win = snaps.slice(-cols);
    const offset = cols - win.length; // history can be shorter than the session
    for (let c = 0; c < win.length; c++) {
      const levels = win[c].levels; // ascending strikes
      if (!levels.length) continue;
      const base = (c + offset) * rows;
      let k = 0;
      for (let r = 0; r < rows; r++) {
        const p = priceMin + (r / (rows - 1)) * span;
        while (k < levels.length - 2 && levels[k + 1].strike < p) k++;
        const a = levels[k];
        const b = levels[Math.min(k + 1, levels.length - 1)];
        const f = b.strike === a.strike ? 0 : Math.max(0, Math.min(1, (p - a.strike) / (b.strike - a.strike)));
        values[base + r] = a.value + (b.value - a.value) * f;
      }
    }
  } else {
    // net charm at each cell — positive (delta bleeding toward the strike)
    // below the tape, negative above, so the field reads as the classic
    // two-tone charm bleed map hugging price
    const cfg = Simulator.TICKERS[ticker];
    const iv = cfg?.iv ?? 0.2;
    const t = 0.003; // 0DTE horizon
    for (let c = 0; c < cols; c++) {
      const s = closes[c];
      const base = c * rows;
      for (let r = 0; r < rows; r++) {
        const p = priceMin + (r / (rows - 1)) * span;
        const g = Simulator.getGreeks(s, p, t, iv);
        values[base + r] = g.charmCall * s;
      }
    }
  }

  const scale = normalize(values);
  return { rows, cols, priceMin, priceMax, times, closes, values, scale };
}
