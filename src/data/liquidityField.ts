/*
==================================================
  SLAYER TERMINAL - LIQUIDITY FIELD (liquidityField.ts)
  Resting-liquidity profile across the PRICE axis, built
  from the real dealer/flow data the workspace already
  computes — dark-pool shelves, open interest, GEX nodes
  and traded delta. Each source is normalized to its own
  peak, Gaussian-spread by ~one strike, then blended and
  fixed-normalized to 0..1 so the heat colour of a shelf
  is stable frame to frame (no adaptive flicker).

  The chart paints this as a horizontal heat field BEHIND
  the candles: bright bands = where liquidity is stacked.
==================================================
*/

import type { KeyLevels } from '../types/gex';

/** A discrete price source contributing to the field. */
interface PriceWeight {
  price: number;
  /** Un-normalized magnitude (notional, OI, |GEX|, |delta|) — must be ≥ 0 */
  weight: number;
}

export interface LiquidityFieldArgs {
  spot: number;
  levels: KeyLevels;
  /** Rows across the price window (vertical resolution of the field) */
  rows?: number;
  darkPool?: { price: number; notional: number }[];
  oi?: { strike: number; oi: number }[];
  nodes?: { strike: number; value: number }[];
  deltaByPrice?: { price: number; value: number }[];
  /** Extra price padding as a fraction of the raw window (default 6%) */
  pad?: number;
}

export interface LiquidityField {
  rows: number;
  priceMin: number;
  priceMax: number;
  rowToPrice: (row: number) => number;
  priceToRow: (price: number) => number;
  /** Blended resting-liquidity intensity per row, 0..1 (fixed peak) */
  intensity: Float32Array;
}

// Each source is normalized to its own max first, so a $200M dark-pool shelf
// and a fat OI strike both land on 0..1 before these relative weights blend
// them. Dark pool leads (it's the cleanest institutional signal), OI and GEX
// nodes fill in the structural shelves, traded delta adds the session's texture.
const WEIGHTS = { darkpool: 1.0, oi: 0.7, node: 0.6, delta: 0.5 } as const;

export function buildLiquidityField(args: LiquidityFieldArgs): LiquidityField {
  const rows = args.rows ?? 240;
  const { spot, levels } = args;

  // ---- price window: hug the structural levels near spot (walls, flip, spot,
  // dark-pool shelves) so the field lines up with the candle chart's action.
  // King and far-OTM GEX node strikes are deliberately NOT window anchors — they
  // can sit percent away and would balloon the range, squashing the candles into
  // a strip; they still light up the field wherever they fall INSIDE the window. ----
  // Always cover at least ±0.9% around spot (comfortably wraps the intraday
  // candles), expanding to include the walls / flip / dark-pool shelves if they
  // sit further out. King and far-OTM node strikes never widen the window — they
  // just light up the field wherever they land inside it. This window is a
  // superset of what the chart auto-scales to, so the heat never leaves a gap.
  const anchors = [spot * 0.991, spot * 1.009, levels.putWall, levels.callWall, levels.flip];
  for (const d of args.darkPool ?? []) anchors.push(d.price);
  const finite = anchors.filter(v => Number.isFinite(v) && v > 0);
  let lo = finite.length ? Math.min(...finite) : spot * 0.98;
  let hi = finite.length ? Math.max(...finite) : spot * 1.02;
  if (!(hi > lo)) {
    lo = spot * 0.98;
    hi = spot * 1.02;
  }
  const pad = (hi - lo) * (args.pad ?? 0.06);
  const priceMin = lo - pad;
  const priceMax = hi + pad;
  const span = priceMax - priceMin || 1;

  const rowToPrice = (row: number) => priceMin + (row / (rows - 1)) * span;
  const priceToRow = (price: number) => ((price - priceMin) / span) * (rows - 1);

  // ~1 strike of spread so a shelf reads as a soft band, not a hairline
  const sigma = Math.max(1.2, rows * 0.012);
  const inv2 = 1 / (2 * sigma * sigma);
  const cutoff = Math.ceil(sigma * 3);

  const intensity = new Float32Array(rows);

  /** Spread one source's points, normalize that source to 0..1, blend by weight. */
  const blend = (points: PriceWeight[], weight: number) => {
    if (!points.length || weight <= 0) return;
    const maxW = points.reduce((m, p) => Math.max(m, p.weight), 0);
    if (maxW <= 0) return;
    const buf = new Float32Array(rows);
    for (const p of points) {
      if (!Number.isFinite(p.price) || p.weight <= 0) continue;
      const center = priceToRow(p.price);
      if (center < -cutoff || center > rows - 1 + cutoff) continue;
      const amp = p.weight / maxW; // 0..1 within this source
      const r0 = Math.max(0, Math.floor(center - cutoff));
      const r1 = Math.min(rows - 1, Math.ceil(center + cutoff));
      for (let r = r0; r <= r1; r++) {
        const d = r - center;
        buf[r] += amp * Math.exp(-d * d * inv2);
      }
    }
    let bmax = 0;
    for (let r = 0; r < rows; r++) if (buf[r] > bmax) bmax = buf[r];
    if (bmax <= 0) return;
    const k = weight / bmax;
    for (let r = 0; r < rows; r++) intensity[r] += buf[r] * k;
  };

  blend((args.darkPool ?? []).map(d => ({ price: d.price, weight: Math.max(0, d.notional) })), WEIGHTS.darkpool);
  blend((args.oi ?? []).map(o => ({ price: o.strike, weight: Math.max(0, o.oi) })), WEIGHTS.oi);
  blend((args.nodes ?? []).map(n => ({ price: n.strike, weight: Math.abs(n.value) })), WEIGHTS.node);
  blend((args.deltaByPrice ?? []).map(d => ({ price: d.price, weight: Math.abs(d.value) })), WEIGHTS.delta);

  // fixed normalize of the blended field so colours are stable over time
  let max = 0;
  for (let r = 0; r < rows; r++) if (intensity[r] > max) max = intensity[r];
  if (max > 0) {
    const inv = 1 / max;
    for (let r = 0; r < rows; r++) intensity[r] *= inv;
  }

  return { rows, priceMin, priceMax, rowToPrice, priceToRow, intensity };
}

/* ---- house liquidity colormap ------------------------------------------------
   Deliberately NOT the electric-blue Bookmap thermal. Liquidity is STRUCTURE,
   so it uses the terminal's silver/steel selection language: near-invisible at
   the low end (recedes into the inset), rising through cool steel to a bright
   holo-silver at the densest shelves. Direction stays green/red on the candles;
   structure stays silver — the same grammar as the rest of the app. */
const LIQ_STOPS: { s: number; c: [number, number, number] }[] = [
  { s: 0.0, c: [10, 11, 15] }, // ≈ inset background — a weak row all but vanishes
  { s: 0.18, c: [30, 35, 46] }, // faint slate
  { s: 0.4, c: [58, 67, 86] }, // dim steel
  { s: 0.62, c: [98, 110, 138] }, // steel
  { s: 0.8, c: [150, 162, 194] }, // light steel
  { s: 0.92, c: [198, 208, 230] }, // silver
  { s: 1.0, c: [228, 232, 244] }, // holo silver (#E4E8F4 family)
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
