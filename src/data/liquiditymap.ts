/*
==================================================
  SLAYER TERMINAL - LIQUIDITY MAP (order-book heatmap)
  A Bookmap-style continuous order-book heatmap: a
  time × price field of resting liquidity that forms
  PERSISTENT horizontal bands and evolves smoothly,
  candlesticks tracing price through it, and executed
  trades as proportional bubbles.

  Modelled as a streaming BOOK: next() advances an
  internal price walk one column at a time, so the
  renderer can scroll it right-to-left forever without
  wrap seams. Deterministic per ticker+day (same hash
  family as the rest of the app) — the same book paints
  the same field every session.
==================================================
*/

import { hash, hRange, hGauss, dayKey } from '../core/rng';

export interface LiqTrade {
  row: number; // fractional price row the trade printed at
  size: number;
  buy: boolean; // aggressor side
}

export interface LiqColumn {
  t: number; // absolute column index (time)
  o: number;
  h: number;
  l: number;
  c: number; // candle OHLC as fractional price ROWS
  depth: Float32Array; // resting liquidity per price row, 0…1 normalized
  trades: LiqTrade[];
}

export interface LiquidityBook {
  ticker: string;
  rows: number;
  priceMin: number;
  priceMax: number;
  spotRow: number;
  rowToPrice: (row: number) => number;
  priceToRow: (price: number) => number;
  /** advance the walk one step and return the next column (depths normalized 0…1) */
  next: () => LiqColumn;
}

interface Band {
  row: number;
  base: number;
  width: number;
  drift: number;
  phase: number;
}

interface WalkState {
  priceRow: number;
  vel: number;
  t: number;
}

/** Generate one raw (un-normalized) column, mutating the walk state.
    `rscale` = rows/132 makes the walk, wicks and near-touch book resolution-
    independent, so raising the row count only sharpens the field — it doesn't
    change how price moves or how thick the walls look. */
function makeColumn(key: string, bands: Band[], rows: number, spotRow: number, st: WalkState, rscale: number): LiqColumn {
  const t = st.t++;
  // ---- candle ----
  const shock = hGauss(`${key}-w${t}`) * 1.5 * rscale;
  st.vel = st.vel * 0.86 + shock * 0.5 + (spotRow - st.priceRow) * 0.012; // mild mean reversion
  const open = st.priceRow;
  st.priceRow = Math.max(2, Math.min(rows - 3, st.priceRow + st.vel));
  const close = st.priceRow;
  const wick = (0.6 + Math.abs(hGauss(`${key}-wick${t}`)) * 1.4) * rscale;
  const hi = Math.max(open, close) + wick;
  const lo = Math.min(open, close) - wick;

  // ---- resting liquidity field ----
  const depth = new Float32Array(rows);
  for (let b = 0; b < bands.length; b++) {
    const bd = bands[b];
    // slow temporal modulation → the wall thickens and thins over time (persists)
    const strength =
      bd.base *
      (0.55 + 0.45 * Math.sin(t * 0.018 * bd.drift + bd.phase)) *
      (0.78 + 0.22 * ((hash(`${key}-bt${b}-${t >> 4}`) % 100) / 100));
    const inv2 = 1 / (2 * bd.width * bd.width);
    const loR = Math.max(0, bd.row - Math.ceil(bd.width * 3));
    const hiR = Math.min(rows - 1, bd.row + Math.ceil(bd.width * 3));
    for (let r = loR; r <= hiR; r++) {
      const d = r - bd.row;
      depth[r] += strength * Math.exp(-d * d * inv2);
    }
  }
  // baseline book + a denser near-touch book hugging current price
  const nearVar = rows * rows * 0.0017; // ≈30 at 132 rows — the near-touch σ² in row²
  for (let r = 0; r < rows; r++) {
    const dToPrice = r - close;
    // a soft near-touch book so trades have context, but kept well below the
    // resting walls so the horizontal bands stay the dominant feature
    const near = Math.exp(-(dToPrice * dToPrice) / nearVar) * 0.28;
    const micro = (hash(`${key}-m${r}-${t}`) % 100) / 100;
    depth[r] += 0.05 + near + micro * 0.05;
  }

  // ---- executed trades ----
  const trades: LiqTrade[] = [];
  const nTrades = 1 + (hash(`${key}-nt${t}`) % 4);
  for (let k = 0; k < nTrades; k++) {
    const row = close + hGauss(`${key}-tr${t}-${k}`) * 1.6 * rscale;
    if (row < 0 || row > rows - 1) continue;
    let size = Math.round(hRange(`${key}-ts${t}-${k}`, 1, 60));
    if (hash(`${key}-tb${t}-${k}`) % 11 === 0) size = Math.round(hRange(`${key}-tbb${t}-${k}`, 90, 340));
    const buy = close >= open ? hash(`${key}-td${t}-${k}`) % 3 !== 0 : hash(`${key}-td${t}-${k}`) % 3 === 0;
    trades.push({ row, size, buy });
  }

  return { t, o: open, h: hi, l: lo, c: close, depth, trades };
}

export function createLiquidityBook(ticker: string, spot: number, rows = 208): LiquidityBook {
  const key = `${ticker}-liq-${dayKey()}`;
  const band = spot * 0.014; // ±1.4% price window
  const priceMin = spot - band;
  const priceMax = spot + band;
  const rowToPrice = (row: number) => priceMin + (row / (rows - 1)) * (priceMax - priceMin);
  const priceToRow = (price: number) => ((price - priceMin) / (priceMax - priceMin)) * (rows - 1);
  const spotRow = priceToRow(spot);
  // Everything the walk does is authored against a 132-row reference and scaled,
  // so raising `rows` only refines the field.
  const rscale = rows / 132;

  const BANDS = 9;
  const bands: Band[] = Array.from({ length: BANDS }, (_, i) => ({
    row: Math.round(((hash(`${key}-bandpos${i}`) % 1000) / 1000) * (rows - 1)),
    base: hRange(`${key}-bandstr${i}`, 0.25, 1),
    // wall thickness authored as a fraction of the view so walls read the same
    // regardless of resolution (≈1.2–3.6 rows at the 132-row reference)
    width: hRange(`${key}-bandw${i}`, rows * 0.0091, rows * 0.0273),
    drift: hRange(`${key}-banddr${i}`, 0.6, 2.4),
    phase: hRange(`${key}-bandph${i}`, 0, 6.28),
  }));

  // Probe a stretch of the field to fix a stable normalization max, so the colour
  // of a wall is consistent over time (no adaptive flicker).
  let normMax = 1;
  const probe: WalkState = { priceRow: spotRow, vel: 0, t: 0 };
  for (let i = 0; i < 64; i++) {
    const col = makeColumn(key, bands, rows, spotRow, probe, rscale);
    for (let r = 0; r < rows; r++) if (col.depth[r] > normMax) normMax = col.depth[r];
  }
  const inv = 1 / normMax;

  const st: WalkState = { priceRow: spotRow, vel: 0, t: 0 };
  const next = (): LiqColumn => {
    const col = makeColumn(key, bands, rows, spotRow, st, rscale);
    for (let r = 0; r < rows; r++) col.depth[r] = Math.min(1, col.depth[r] * inv);
    return col;
  };

  return { ticker, rows, priceMin, priceMax, spotRow, rowToPrice, priceToRow, next };
}

/** Thermal colormap: black → blue → cyan → white → yellow → orange → red.
    Weighted toward the blues (extra low-end stops for a smooth, subtle
    deep-blue → cyan gradient) with a sharp white peak before it turns hot —
    the Bookmap read where thick liquidity snaps to white/yellow. */
const THERMAL_STOPS: { s: number; c: [number, number, number] }[] = [
  { s: 0.0, c: [0, 0, 0] },
  { s: 0.06, c: [3, 8, 32] },
  { s: 0.14, c: [8, 20, 74] },
  { s: 0.24, c: [16, 40, 128] },
  { s: 0.34, c: [18, 70, 172] },
  { s: 0.44, c: [20, 110, 200] },
  { s: 0.53, c: [46, 168, 224] },
  { s: 0.61, c: [104, 220, 238] },
  { s: 0.68, c: [190, 240, 248] },
  { s: 0.73, c: [248, 252, 240] },
  { s: 0.8, c: [255, 226, 88] },
  { s: 0.9, c: [250, 150, 44] },
  { s: 1.0, c: [234, 44, 44] },
];

export function thermal(v: number, out: [number, number, number]): void {
  const x = v <= 0 ? 0 : v >= 1 ? 1 : v;
  let i = 0;
  while (i < THERMAL_STOPS.length - 1 && x > THERMAL_STOPS[i + 1].s) i++;
  const a = THERMAL_STOPS[i];
  const b = THERMAL_STOPS[Math.min(i + 1, THERMAL_STOPS.length - 1)];
  const span = b.s - a.s || 1;
  const f = (x - a.s) / span;
  out[0] = (a.c[0] + (b.c[0] - a.c[0]) * f) | 0;
  out[1] = (a.c[1] + (b.c[1] - a.c[1]) * f) | 0;
  out[2] = (a.c[2] + (b.c[2] - a.c[2]) * f) | 0;
}
