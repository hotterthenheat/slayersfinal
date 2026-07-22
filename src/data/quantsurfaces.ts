/*
==================================================
  SLAYER TERMINAL - QUANT SURFACES (quantsurfaces.ts)
  Turns the terminal's existing engines into readable
  3D surfaces for the immersive world — no new data,
  just reshaped into normalized height grids:
    • gamma  — dealer net GEX by strike × expiry
    • vol    — implied vol by moneyness × DTE
    • mc     — Monte-Carlo price density over time (the cone)
    • rnd    — risk-neutral density term structure (BS lognormal
               from the vol-lab ATM term vols)
  Each grid is rows × cols, normalized (gamma −1…1, the
  others 0…1) so one mesh renders them all.
==================================================
*/

import { buildGexView } from './gex';
import { buildVolLab } from './vollab';
import { runMonteCarlo } from '../core/quant';
import type { MarketSnapshot } from '../types/market';

export type SurfaceRamp = 'gamma' | 'vol' | 'density';
export type SurfaceKey = 'gamma' | 'vol' | 'mc' | 'rnd';

export interface QuantSurfaceData {
  key: SurfaceKey;
  label: string;
  caption: string;
  ramp: SurfaceRamp;
  /** rows × cols, normalized (gamma −1…1; vol/density 0…1) */
  grid: number[][];
  /** Whether heights are diverging (peaks + valleys) or sequential (rise only) */
  diverging: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Dealer net GEX by strike × expiry, normalized against the window's max |GEX|. */
function gammaSurface(snapshot: MarketSnapshot): QuantSurfaceData {
  const m = buildGexView(snapshot, 'GEX', 10).matrix;
  const norm = m.maxAbs || 1;
  const grid = m.cells.map(row => row.map(cell => clamp(cell.value / norm, -1, 1)));
  return {
    key: 'gamma',
    label: 'Dealer Gamma',
    caption: 'Net dealer GEX by strike × expiry. Green ridges are long-gamma support; red troughs are short-gamma, where hedging amplifies the move.',
    ramp: 'gamma',
    grid,
    diverging: true,
  };
}

/** Implied vol by moneyness × DTE, normalized across the surface. */
function volSurface(snapshot: MarketSnapshot, iv: number): QuantSurfaceData {
  const s = buildVolLab(snapshot.ticker, snapshot.spot, iv).surface;
  const span = s.max - s.min || 1;
  const grid = s.cells.map(row => row.map(v => clamp((v - s.min) / span, 0, 1)));
  return {
    key: 'vol',
    label: 'Vol Surface',
    caption: 'Implied volatility by moneyness × expiry. The smile curls up in the wings; the term structure runs into the distance.',
    ramp: 'vol',
    grid,
    diverging: false,
  };
}

/** Monte-Carlo price density over time — the cone, rebuilt as a smooth per-step
    distribution from the run's own percentiles (clean widening bell, not a noisy
    90-path histogram). Tall/narrow near-term → low/wide at the horizon. */
function mcSurface(snapshot: MarketSnapshot, iv: number): QuantSurfaceData {
  const mc = runMonteCarlo(snapshot, iv, 30);
  const steps = mc.cone.p50.length;
  if (steps < 2) {
    return { key: 'mc', label: 'Monte Carlo Cone', caption: '', ramp: 'density', grid: [[0]], diverging: false };
  }
  const ROWS = Math.min(40, steps);
  const COLS = 48;
  // price envelope from the full-run cone (widest p5…p95 across every step)
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < steps; i++) {
    if (mc.cone.p5[i] < lo) lo = mc.cone.p5[i];
    if (mc.cone.p95[i] > hi) hi = mc.cone.p95[i];
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    lo = snapshot.spot * 0.85;
    hi = snapshot.spot * 1.15;
  }
  const pad = (hi - lo) * 0.04; // a touch of headroom so tails don't clip the walls
  lo -= pad;
  hi += pad;
  const span = hi - lo;
  const grid: number[][] = [];
  let gmax = 1e-9;
  for (let r = 0; r < ROWS; r++) {
    const step = Math.round((r / (ROWS - 1)) * (steps - 1));
    const mid = mc.cone.p50[step];
    // per-step stdev from the 5–95 spread (≈1.645σ each side)
    const sigma = Math.max((mc.cone.p95[step] - mc.cone.p5[step]) / 3.29, span * 0.008);
    const row = new Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const px = lo + (c / (COLS - 1)) * span;
      const z = (px - mid) / sigma;
      const pdf = Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
      row[c] = pdf;
      if (pdf > gmax) gmax = pdf;
    }
    grid.push(row);
  }
  // global normalize → smaller early sigma = taller peak, wider late sigma = lower: the cone
  for (const row of grid) for (let c = 0; c < row.length; c++) row[c] = clamp(row[c] / gmax, 0, 1);
  return {
    key: 'mc',
    label: 'Monte Carlo Cone',
    caption: 'The modeled price distribution spreading over 30 sessions. Tall and narrow now; low and wide at the horizon — the cone of outcomes.',
    ramp: 'density',
    grid,
    diverging: false,
  };
}

/** Risk-neutral density term structure — BS lognormal density per DTE from the
    vol-lab ATM term vols. price × DTE × density. */
function rndSurface(snapshot: MarketSnapshot, iv: number): QuantSurfaceData {
  const term = buildVolLab(snapshot.ticker, snapshot.spot, iv).term.current;
  const fwd = snapshot.spot;
  const rows = term.filter(t => t.dte >= 1).slice(0, 12);
  const COLS = 46;
  // price grid: ±3σ of the longest-dated vol
  const maxSig = Math.max(...rows.map(t => (t.iv / 100) * Math.sqrt(t.dte / 365)), 0.05);
  const lo = fwd * Math.exp(-3 * maxSig);
  const hi = fwd * Math.exp(3 * maxSig);
  const grid: number[][] = [];
  let gmax = 1e-9;
  for (const t of rows) {
    const sig = (t.iv / 100) * Math.sqrt(Math.max(t.dte, 0.5) / 365); // total stdev of ln
    const row = new Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const s = lo + (c / (COLS - 1)) * (hi - lo);
      const z = (Math.log(s / fwd) + 0.5 * sig * sig) / sig;
      const pdf = Math.exp(-0.5 * z * z) / (s * sig * Math.sqrt(2 * Math.PI)); // BS lognormal RN density
      row[c] = pdf;
      if (pdf > gmax) gmax = pdf;
    }
    grid.push(row);
  }
  for (const row of grid) for (let c = 0; c < row.length; c++) row[c] = clamp(row[c] / gmax, 0, 1);
  return {
    key: 'rnd',
    label: 'Risk-Neutral Density',
    caption: 'The market-implied price distribution across expiries — reconstructed from the vol term structure. Near-dated is sharp; far-dated flattens as uncertainty grows.',
    ramp: 'density',
    grid: grid.length ? grid : [[0]],
    diverging: false,
  };
}

export function buildQuantSurfaces(snapshot: MarketSnapshot, iv: number): QuantSurfaceData[] {
  return [gammaSurface(snapshot), volSurface(snapshot, iv), mcSurface(snapshot, iv), rndSurface(snapshot, iv)];
}
