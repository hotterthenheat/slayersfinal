/*
==================================================
  SLAYER TERMINAL - VOLATILITY LAB MODEL (vollab.ts)
  IV surface, term structure, risk-neutral density &
  vol-regime series, synthesized deterministically per
  ticker. Placeholder — swaps for the real vol engine.
==================================================
*/

import type {
  IvSurfaceData,
  RegimeData,
  RegimeSlice,
  RndData,
  TermPoint,
  TermStructureData,
  VolLabData,
  VolRegime,
} from '../types/gex';

// ---- deterministic RNG ------------------------------------------------------
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function h01(seed: string): number {
  return (hash(seed) % 1000) / 1000;
}

// ---- IV surface ---------------------------------------------------------------
const SURFACE_DTE = [5, 10, 15, 20, 30, 45, 60];
const SURFACE_MONEYNESS: number[] = [];
for (let m = 0.6; m <= 1.401; m += 0.05) SURFACE_MONEYNESS.push(Number(m.toFixed(2)));

function buildSurface(ticker: string, spot: number, baseIv: number): IvSurfaceData {
  const base = baseIv * 100;
  let min = Infinity;
  let max = -Infinity;

  const cells = SURFACE_DTE.map(t =>
    SURFACE_MONEYNESS.map(m => {
      // Put wing steeper than call wing; smile flattens with time
      const wing =
        m < 1
          ? (1 - m) * 2.4 + Math.pow(1 - m, 2) * 4.2
          : (m - 1) * 0.4 + Math.pow(m - 1, 2) * 2.4;
      const termFlatten = 0.55 + 0.45 * Math.exp(-t / 32);
      const noise = (h01(`${ticker}-ivs-${t}-${m}`) - 0.5) * 1.6;
      const iv = base * (0.92 + wing * termFlatten) * (1 - 0.12 * (1 - Math.exp(-t / 45))) + noise;
      if (iv < min) min = iv;
      if (iv > max) max = iv;
      return Number(iv.toFixed(2));
    })
  );

  return { moneyness: SURFACE_MONEYNESS, dte: SURFACE_DTE, cells, min, max, forward: Number((spot * 1.002).toFixed(2)) };
}

// ---- term structure -------------------------------------------------------------
const TERM_DTE = [7, 14, 21, 30, 45, 60, 90, 120, 180, 270, 360];

function termCurve(ticker: string, baseIv: number, shortMult: number, longMult: number, tag: string): TermPoint[] {
  const short = baseIv * 100 * shortMult;
  const long = baseIv * 100 * longMult;
  return TERM_DTE.map(t => {
    const noise = (h01(`${ticker}-term-${tag}-${t}`) - 0.5) * 0.8;
    return { dte: t, iv: Number((long + (short - long) * Math.exp(-t / 55) + noise).toFixed(2)) };
  });
}

function ivAt(curve: TermPoint[], dte: number): number {
  const after = curve.findIndex(p => p.dte >= dte);
  if (after <= 0) return curve[Math.max(0, after)]?.iv ?? curve[curve.length - 1].iv;
  const a = curve[after - 1];
  const b = curve[after];
  const u = (dte - a.dte) / (b.dte - a.dte || 1);
  return a.iv + (b.iv - a.iv) * u;
}

function buildTerm(ticker: string, baseIv: number): TermStructureData {
  const current = termCurve(ticker, baseIv, 2.25, 0.95, 'cur');
  const dayAgo = termCurve(ticker, baseIv, 2.32, 0.96, 'd1');
  const weekAgo = termCurve(ticker, baseIv, 2.5, 0.99, 'w1');
  const monthAgo = termCurve(ticker, baseIv, 1.9, 0.9, 'm1');

  const atm30 = Number(ivAt(current, 30).toFixed(2));
  return {
    current,
    dayAgo,
    weekAgo,
    monthAgo,
    stats: {
      atm30,
      iv1m: Number(ivAt(current, 30).toFixed(2)),
      iv3m: Number(ivAt(current, 90).toFixed(2)),
      iv6m: Number(ivAt(current, 180).toFixed(2)),
      iv1y: Number(ivAt(current, 360).toFixed(2)),
      ivRank: Math.round(25 + h01(`${ticker}-ivrank`) * 45),
      ivPercentile: Math.round(20 + h01(`${ticker}-ivpct`) * 50),
    },
  };
}

// ---- risk-neutral distribution ----------------------------------------------------
function buildRnd(ticker: string, spot: number, atm30: number): RndData {
  const forward = spot * 1.002;
  const sigmaAbs = (atm30 / 100) * Math.sqrt(29 / 365) * forward;

  // Negative skew: fatter left tail via asymmetric sigmas
  const sigL = sigmaAbs * 1.28;
  const sigR = sigmaAbs * 0.86;

  const N = 81;
  const lo = forward - sigmaAbs * 4.2;
  const hi = forward + sigmaAbs * 3.4;
  const prices: number[] = [];
  const density: number[] = [];
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const x = lo + ((hi - lo) * i) / (N - 1);
    const s = x < forward ? sigL : sigR;
    const z = (x - forward) / s;
    const d = Math.exp((-z * z) / 2);
    prices.push(Number(x.toFixed(2)));
    density.push(d);
    if (d > peak) peak = d;
  }
  for (let i = 0; i < N; i++) density[i] = Number((density[i] / (peak || 1)).toFixed(4));

  return {
    prices,
    density,
    forward: Number(forward.toFixed(2)),
    sigma1: [Number((forward - sigmaAbs).toFixed(2)), Number((forward + sigmaAbs).toFixed(2))],
    sigma2: [Number((forward - 2 * sigmaAbs).toFixed(2)), Number((forward + 2 * sigmaAbs).toFixed(2))],
    stats: {
      expMoveAbs: Number(sigmaAbs.toFixed(2)),
      expMovePct: Number(((sigmaAbs / forward) * 100).toFixed(2)),
      skew: Number((-(0.25 + h01(`${ticker}-skew`) * 0.3)).toFixed(2)),
      kurtosis: Number((3.3 + h01(`${ticker}-kurt`) * 0.7).toFixed(2)),
      pAbove2: Number((1.7 + h01(`${ticker}-p2u`) * 0.9).toFixed(2)),
      pBelow2: Number((2.1 + h01(`${ticker}-p2d`) * 1.1).toFixed(2)),
      riskReversal: Number((-(1.8 + h01(`${ticker}-rr`) * 1.6)).toFixed(2)),
      butterfly: Number((0.8 + h01(`${ticker}-fly`) * 0.7).toFixed(2)),
    },
  };
}

// ---- regime detection ----------------------------------------------------------------
const MONTHS = 24;

function buildRegime(ticker: string): RegimeData {
  const now = new Date();
  const series: RegimeSlice[] = [];

  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', ' ');
    const idx = MONTHS - 1 - i;
    // Three slow deterministic signals → softmax-ish probabilities
    const sLow = Math.sin(idx * 0.42 + h01(`${ticker}-rlow`) * 6) * 0.9 + 0.1;
    const sNorm = Math.sin(idx * 0.23 + h01(`${ticker}-rnorm`) * 6) * 0.5 + 1.15;
    const sHigh = Math.sin(idx * 0.57 + h01(`${ticker}-rhigh`) * 6) * 0.85 - 0.15;
    const eLow = Math.exp(sLow);
    const eNorm = Math.exp(sNorm);
    const eHigh = Math.exp(sHigh);
    const sum = eLow + eNorm + eHigh;
    series.push({
      month,
      low: Number((eLow / sum).toFixed(3)),
      normal: Number((eNorm / sum).toFixed(3)),
      high: Number((eHigh / sum).toFixed(3)),
    });
  }

  const last = series[series.length - 1];
  const current: VolRegime = last.low >= last.normal && last.low >= last.high ? 'LOW VOL' : last.high >= last.normal ? 'HIGH VOL' : 'NORMAL';
  const key: 'low' | 'normal' | 'high' = current === 'LOW VOL' ? 'low' : current === 'HIGH VOL' ? 'high' : 'normal';

  // Walk back to find when this regime became dominant
  let sinceIdx = series.length - 1;
  while (sinceIdx > 0) {
    const s = series[sinceIdx - 1];
    const dominant = s.low >= s.normal && s.low >= s.high ? 'low' : s.high >= s.normal ? 'high' : 'normal';
    if (dominant !== key) break;
    sinceIdx--;
  }

  return {
    series,
    current,
    prob: Math.round(last[key] * 100),
    since: series[sinceIdx].month,
    avgDurationDays: Math.round(55 + h01(`${ticker}-rdur`) * 45),
    nextLow: Math.round(12 + h01(`${ticker}-rnl`) * 22),
    nextHigh: Math.round(12 + h01(`${ticker}-rnh`) * 24),
  };
}

// ---- top-level assembly ------------------------------------------------------------
export function buildVolLab(ticker: string, spot: number, baseIv: number): VolLabData {
  const surface = buildSurface(ticker, spot, baseIv);
  const term = buildTerm(ticker, baseIv);
  const rnd = buildRnd(ticker, spot, term.stats.atm30);
  const regime = buildRegime(ticker);
  return { surface, term, rnd, regime };
}
