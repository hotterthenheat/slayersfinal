/*
==================================================
  SLAYER TERMINAL - LIQUIDITY BOOK (liquidityField.ts)
  A Bookmap-class liquidity heatmap is a TIME x PRICE
  field: at every bar it shows where limit orders are
  RESTING right then. Shelves appear, persist, get
  pulled, and get eaten when price trades through them
  — the heat must evolve column by column, not be one
  static profile smeared across the chart.

  This builds that field deterministically from the
  workspace's real dealer/flow inputs:
    - strike-grid OI shelves (persistent, wall-boosted)
    - GEX node concentrations folded into their strikes
    - dark-pool shelves that are BORN at a print time
      and rest heavy afterwards
    - ephemeral spoof/pulled levels that appear near
      the path for minutes then vanish (or get consumed
      if price reaches them first)
    - a passive near-touch book hugging price above and
      below the spread gap, breathing with volume
  plus absorption dynamics: a shelf in contact with the
  traded range decays (orders being filled), then slowly
  re-stacks after price leaves.
==================================================
*/

import { hash, h01 } from '../core/rng';
import type { KeyLevels } from '../types/gex';
import type { Candle } from '../types/market';

export interface LiquidityBookArgs {
  ticker: string;
  /** The chart's bars — logical index on the chart == index in this array */
  bars: Candle[];
  spot: number;
  levels: KeyLevels;
  darkPool?: { price: number; notional: number }[];
  oi?: { strike: number; oi: number }[];
  nodes?: { strike: number; value: number }[];
  /** Vertical resolution (price rows) */
  rows?: number;
  /** Bars aggregated per heat column (time resolution) */
  barsPerCol?: number;
}

export interface LiquidityBook {
  rows: number;
  cols: number;
  priceMin: number;
  priceMax: number;
  /** Bar/logical index covered by column 0 */
  firstBar: number;
  barsPerCol: number;
  /** cols x rows intensity, 0..1, index = col * rows + row; row 0 = priceMin */
  intensity: Float32Array;
}

/** One resting-liquidity level with lifetime state. */
interface Shelf {
  price: number;
  /** Base size 0..~1.25 before time noise / absorption */
  amp: number;
  /** First column it exists (0 for the structural book) */
  birth: number;
  /** Last column + 1 it exists (cols for the structural book) */
  death: number;
  /** Ephemeral levels get pulled/consumed; structural ones replenish */
  structural: boolean;
  seed: string;
}

const SESSION_BARS = 390; // one cash session of 1m bars
const SEG = 64; // columns per time-noise knot

// Absorption dynamics: contact with the traded range eats the shelf, distance
// lets it re-stack. Ephemeral levels never replenish — once eaten they're gone.
const EAT = 0.93;
const EAT_FLOOR = 0.15;
const REPLENISH = 0.006;

export function buildLiquidityBook(args: LiquidityBookArgs): LiquidityBook {
  const { ticker, bars, spot, levels } = args;
  const rows = args.rows ?? 520;
  const barsPerCol = args.barsPerCol ?? 2;
  const cols = Math.max(1, Math.ceil(bars.length / barsPerCol));
  const intensity = new Float32Array(cols * rows);

  if (!bars.length || !(spot > 0)) {
    return { rows, cols, priceMin: 0, priceMax: 1, firstBar: 0, barsPerCol, intensity };
  }

  // ---- per-column traded range + volume ----
  const colLo = new Float32Array(cols);
  const colHi = new Float32Array(cols);
  const colClose = new Float32Array(cols);
  const colVol = new Float32Array(cols);
  let maxVol = 0;
  for (let c = 0; c < cols; c++) {
    let lo = Infinity;
    let hi = -Infinity;
    let vol = 0;
    let close = spot;
    for (let b = c * barsPerCol; b < Math.min(bars.length, (c + 1) * barsPerCol); b++) {
      const bar = bars[b];
      if (bar.low < lo) lo = bar.low;
      if (bar.high > hi) hi = bar.high;
      vol += bar.volume;
      close = bar.close;
    }
    colLo[c] = lo;
    colHi[c] = hi;
    colClose[c] = close;
    colVol[c] = vol;
    if (vol > maxVol) maxVol = vol;
  }

  // ---- price window: the traded range plus any structural levels resting just
  // beyond it (walls / dark-pool shelves the market hasn't reached yet) ----
  let lo = Infinity;
  let hi = -Infinity;
  for (let c = 0; c < cols; c++) {
    if (colLo[c] < lo) lo = colLo[c];
    if (colHi[c] > hi) hi = colHi[c];
  }
  const reach = spot * 0.015;
  const pull = (p: number | undefined) => {
    if (p == null || !Number.isFinite(p) || p <= 0) return;
    if (p > lo - reach && p < lo) lo = p;
    if (p < hi + reach && p > hi) hi = p;
  };
  pull(levels.callWall);
  pull(levels.putWall);
  pull(levels.flip);
  for (const d of args.darkPool ?? []) pull(d.price);
  const pad = spot * 0.004;
  const priceMin = lo - pad;
  const priceMax = hi + pad;
  const span = priceMax - priceMin || 1;
  const toRow = (price: number) => ((price - priceMin) / span) * (rows - 1);

  // ---- gaussian kernel: ~a couple of ticks of vertical spread per shelf ----
  const sigma = Math.max(1.4, rows * 0.0032);
  const cutoff = Math.ceil(sigma * 3);
  const kernel = new Float32Array(cutoff * 2 + 1);
  for (let i = -cutoff; i <= cutoff; i++) kernel[i + cutoff] = Math.exp((-i * i) / (2 * sigma * sigma));

  const stamp = (c: number, price: number, amp: number) => {
    if (amp <= 0.015) return;
    const center = toRow(price);
    if (center < -cutoff || center > rows - 1 + cutoff) return;
    const r0 = Math.max(0, Math.ceil(center - cutoff));
    const r1 = Math.min(rows - 1, Math.floor(center + cutoff));
    const base = c * rows;
    for (let r = r0; r <= r1; r++) {
      // nearest-knot kernel lookup — sub-row phase is invisible after smoothing
      const k = kernel[Math.round(r - center) + cutoff];
      intensity[base + r] += amp * k;
    }
  };

  // ---- assemble the structural book: strike OI + GEX nodes + walls ----
  const shelves: Shelf[] = [];
  const strikeAmp = new Map<number, number>();
  const oiList = args.oi ?? [];
  const maxOi = oiList.reduce((m, o) => Math.max(m, o.oi), 0);
  if (maxOi > 0) {
    for (const o of oiList) {
      if (o.strike <= priceMin || o.strike >= priceMax) continue;
      strikeAmp.set(o.strike, 0.16 + 0.66 * Math.pow(o.oi / maxOi, 0.8));
    }
  }
  const nodeList = args.nodes ?? [];
  const maxNode = nodeList.reduce((m, n) => Math.max(m, Math.abs(n.value)), 0);
  if (maxNode > 0) {
    for (const n of nodeList) {
      if (n.strike <= priceMin || n.strike >= priceMax) continue;
      const add = 0.4 * (Math.abs(n.value) / maxNode);
      strikeAmp.set(n.strike, Math.min(1.1, (strikeAmp.get(n.strike) ?? 0.12) + add));
    }
  }
  // walls dominate the book at their strikes; flip carries modest interest
  const strikeStep = spot * 0.0015;
  const boost = (price: number, mult: number) => {
    if (!Number.isFinite(price) || price <= priceMin || price >= priceMax) return;
    let hit = false;
    for (const [strike, amp] of strikeAmp) {
      if (Math.abs(strike - price) <= strikeStep) {
        strikeAmp.set(strike, Math.min(1.25, amp * mult));
        hit = true;
      }
    }
    if (!hit) strikeAmp.set(price, mult >= 1.5 ? 0.85 : 0.4);
  };
  boost(levels.callWall, 1.7);
  boost(levels.putWall, 1.7);
  boost(levels.flip, 1.15);

  for (const [price, amp] of strikeAmp) {
    shelves.push({ price, amp, birth: 0, death: cols, structural: true, seed: `${ticker}|liq|s|${price.toFixed(2)}` });
  }

  // dark-pool shelves: born at a deterministic print column, heavy afterwards
  const dpList = args.darkPool ?? [];
  const maxDp = dpList.reduce((m, d) => Math.max(m, d.notional), 0);
  for (const d of dpList) {
    if (!(maxDp > 0) || d.price <= priceMin || d.price >= priceMax) continue;
    const seed = `${ticker}|liq|dp|${d.price.toFixed(2)}`;
    const birth = Math.floor(h01(seed) * cols * 0.6 + cols * 0.15);
    shelves.push({ price: d.price, amp: 0.5 + 0.65 * (d.notional / maxDp), birth, death: cols, structural: true, seed });
  }

  // ephemeral spoof/pulled levels: a few per session, near where price was then
  const sessions = Math.ceil(bars.length / SESSION_BARS);
  for (let s = 0; s < sessions; s++) {
    const n = 2 + (hash(`${ticker}|liq|e|${s}`) % 3);
    for (let k = 0; k < n; k++) {
      const seed = `${ticker}|liq|e|${s}|${k}`;
      const anchorBar = Math.min(
        bars.length - 1,
        s * SESSION_BARS + Math.floor(h01(seed + '|a') * (SESSION_BARS - 1))
      );
      const side = h01(seed + '|d') > 0.5 ? 1 : -1;
      const offset = 0.0008 + h01(seed + '|o') * 0.0037;
      const price = bars[anchorBar].close * (1 + side * offset);
      if (price <= priceMin || price >= priceMax) continue;
      const birth = Math.floor(anchorBar / barsPerCol);
      const life = 8 + Math.floor(h01(seed + '|l') * 72);
      shelves.push({
        price,
        amp: 0.35 + 0.5 * h01(seed + '|m'),
        birth,
        death: Math.min(cols, birth + life),
        structural: false,
        seed,
      });
    }
  }

  // ---- march every shelf through time: noise, birth ramp, absorption ----
  const knots = Math.ceil(cols / SEG) + 2;
  const eps = spot * 0.0002;
  const lastSessionCol = Math.max(0, cols - Math.ceil(SESSION_BARS / barsPerCol));
  const knotBuf = new Float32Array(knots);
  for (const shelf of shelves) {
    // slow size drift so bands breathe instead of reading as ruled lines —
    // knots hashed once per shelf, interpolated per column
    for (let i = 0; i < knots; i++) knotBuf[i] = 0.78 + 0.27 * h01(`${shelf.seed}|n${i}`);
    let m = 1; // absorption state
    for (let c = shelf.birth; c < shelf.death; c++) {
      const contact = colLo[c] - eps <= shelf.price && shelf.price <= colHi[c] + eps;
      if (contact) {
        m = Math.max(EAT_FLOOR, m * EAT);
        if (!shelf.structural && m <= EAT_FLOOR * 1.4) break; // consumed — never comes back
      } else if (shelf.structural) {
        m += (1 - m) * REPLENISH;
      }
      const ki = Math.min(knots - 2, Math.floor(c / SEG));
      const kf = (c - ki * SEG) / SEG;
      const noise = knotBuf[ki] * (1 - kf) + knotBuf[ki + 1] * kf;
      // OI keeps building through the live session
      const build =
        shelf.structural && c >= lastSessionCol
          ? 0.94 + 0.06 * ((c - lastSessionCol) / Math.max(1, cols - lastSessionCol))
          : 1;
      const ramp = Math.min(1, (c - shelf.birth + 1) / (shelf.structural ? 25 : 4));
      stamp(c, shelf.price, shelf.amp * noise * m * build * ramp);
    }
  }

  // ---- passive near-touch book: bids just under price, offers just over, a
  // spread gap between — breathing with traded volume ----
  const gap = Math.max(spot * 0.0006, (span / rows) * 2);
  const volKnots = new Float32Array(knots);
  for (let i = 0; i < knots; i++) volKnots[i] = 0.7 + 0.6 * h01(`${ticker}|liq|v${i}`);
  for (let c = 0; c < cols; c++) {
    const ki = Math.min(knots - 2, Math.floor(c / SEG));
    const kf = (c - ki * SEG) / SEG;
    const breathe = volKnots[ki] * (1 - kf) + volKnots[ki + 1] * kf;
    const vol = maxVol > 0 ? 0.7 + 0.5 * (colVol[c] / maxVol) : 1;
    const amp = 0.55 * breathe * vol;
    stamp(c, colClose[c] + gap, amp);
    stamp(c, colClose[c] - gap, amp * 0.92);
  }

  // ---- percentile normalize + contrast: anchoring on the 99.5th percentile
  // (not the absolute max) keeps one freak hotspot — a wall stacked on a dark-
  // pool shelf under the path — from crushing every ordinary shelf to a whisper.
  // The top half-percent clamps to full brightness. ----
  let max = 0;
  for (let i = 0; i < intensity.length; i++) if (intensity[i] > max) max = intensity[i];
  if (max > 0) {
    const BINS = 512;
    const hist = new Uint32Array(BINS);
    let nonzero = 0;
    for (let i = 0; i < intensity.length; i++) {
      const t = intensity[i];
      if (t <= 0) continue;
      nonzero++;
      hist[Math.min(BINS - 1, (t / max) * BINS) | 0]++;
    }
    let acc = 0;
    let p = max;
    const target = nonzero * 0.995;
    for (let b = 0; b < BINS; b++) {
      acc += hist[b];
      if (acc >= target) {
        p = ((b + 1) / BINS) * max;
        break;
      }
    }
    const inv = 1 / (p || max);
    for (let i = 0; i < intensity.length; i++) {
      intensity[i] = Math.pow(Math.min(1, intensity[i] * inv), 1.25);
    }
  }

  return { rows, cols, priceMin, priceMax, firstBar: 0, barsPerCol, intensity };
}

/* ---- liquidity colormap ------------------------------------------------------
   Resting liquidity glows amber/gold — a warm hue that pops on the dark inset and
   never collides with the silver/purple candles, the green/red walls or the teal
   dark-pool lines (and echoes the gold+purple dealer-flow palette). Reads as
   glowing horizontal shelves: near-invisible in the gaps, rising through amber to
   a bright gold at the densest levels. */
const LIQ_STOPS: { s: number; c: [number, number, number] }[] = [
  { s: 0.0, c: [16, 12, 6] }, // ≈ inset background — a weak cell all but vanishes
  { s: 0.2, c: [50, 34, 10] }, // deep amber-brown
  { s: 0.42, c: [110, 74, 16] }, // amber
  { s: 0.62, c: [176, 122, 28] }, // gold
  { s: 0.8, c: [218, 164, 46] }, // bright gold
  { s: 0.92, c: [242, 196, 92] }, // pale gold
  { s: 1.0, c: [255, 226, 150] }, // light gold
];

function liqColor(v: number, out: [number, number, number]): void {
  const x = v <= 0 ? 0 : v >= 1 ? 1 : v;
  let i = 0;
  while (i < LIQ_STOPS.length - 1 && x > LIQ_STOPS[i + 1].s) i++;
  const a = LIQ_STOPS[i];
  const b = LIQ_STOPS[Math.min(i + 1, LIQ_STOPS.length - 1)];
  const f = (x - a.s) / (b.s - a.s || 1);
  out[0] = (a.c[0] + (b.c[0] - a.c[0]) * f) | 0;
  out[1] = (a.c[1] + (b.c[1] - a.c[1]) * f) | 0;
  out[2] = (a.c[2] + (b.c[2] - a.c[2]) * f) | 0;
}

/** 256-entry RGB lookup for the field, gamma-lifted so mid shelves read. */
export function makeLiquidityLUT(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  const rgb: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    liqColor(Math.pow(i / 255, 0.72), rgb);
    lut[i * 3] = rgb[0];
    lut[i * 3 + 1] = rgb[1];
    lut[i * 3 + 2] = rgb[2];
  }
  return lut;
}
