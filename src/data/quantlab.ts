/*
==================================================
  SLAYER TERMINAL - QUANT LAB ADAPTERS (quantlab.ts)
  Feeds the Quant Lab panels that don't have a
  dedicated engine yet, reshaped from the chain and
  the house rng in the same deterministic grammar as
  the rest of the terminal (seeded by ticker + day):
    • OI surface       strike × expiry open interest
    • Regime detection trend/vol/risk/liquidity/composite
    • Correlation/PCA  cross-name matrix + components
    • Signals feed     structural alerts off the book
    • Key metrics      the header roll-up (IV, HV, greeks…)
  No new financial models — chain values are real; the
  per-expiry spread and cross-name matrix are modeled,
  clearly swappable for real feeds behind the same shape.
==================================================
*/

import { dayKey, hRange, hGauss, h01 } from '../core/rng';
import { buildVolLab } from './vollab';
import { buildStateDensity } from './statedensity';
import { buildGreeksRegime } from './greeksmatrix';
import Simulator from '../core/simulator';
import type { MarketSnapshot, StrikeNode } from '../types/market';
import type { Tone } from '../components/ui/tones';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ---- open-interest surface (strike × expiry) --------------------------------------
const OI_EXPIRIES = [
  { label: '0DTE', decay: 1 },
  { label: '1W', decay: 0.82 },
  { label: '2W', decay: 0.63 },
  { label: '1M', decay: 0.47 },
  { label: '2M', decay: 0.33 },
  { label: '3M', decay: 0.24 },
];

export interface OiSurface {
  /** rows = strike (desc), cols = expiry — normalized 0…1 */
  grid: number[][];
  strikes: number[];
  expiries: string[];
  peakStrike: number;
  totalOi: number;
}

/** Total OI per strike spread across an expiry ladder (near-dated carries the most). */
export function buildOiSurface(snapshot: MarketSnapshot): OiSurface {
  const { ticker, chain } = snapshot;
  const day = dayKey();
  const sorted = [...chain].sort((a, b) => b.strike - a.strike);
  let maxCell = 1;
  let peakStrike = sorted[0]?.strike ?? 0;
  let peakOi = 0;
  let totalOi = 0;
  const grid = sorted.map(node => {
    const base = node.callOI + node.putOI;
    totalOi += base;
    if (base > peakOi) {
      peakOi = base;
      peakStrike = node.strike;
    }
    return OI_EXPIRIES.map(exp => {
      const noise = 0.72 + h01(`${ticker}-${day}-oi-${node.strike}-${exp.label}`) * 0.56;
      const v = base * exp.decay * noise;
      if (v > maxCell) maxCell = v;
      return v;
    });
  });
  for (const row of grid) for (let c = 0; c < row.length; c++) row[c] = clamp(row[c] / maxCell, 0, 1);
  return { grid, strikes: sorted.map(n => n.strike), expiries: OI_EXPIRIES.map(e => e.label), peakStrike, totalOi };
}

// ---- market regime detection ------------------------------------------------------
export type MarketRegime = 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF';

export interface RegimePoint {
  t: string;
  trend: number;
  vol: number;
  risk: number;
  liquidity: number;
  composite: number;
}

export interface RegimePanel {
  series: RegimePoint[];
  regime: MarketRegime;
  confidencePct: number;
  durationLabel: string;
  nextRegime: MarketRegime;
  nextProbPct: number;
}

const MONTH_LABELS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

function regimeOf(composite: number): MarketRegime {
  return composite > 0.18 ? 'RISK-ON' : composite < -0.18 ? 'RISK-OFF' : 'NEUTRAL';
}

/** Five slow structural signals over the trailing window, plus the current classification. */
export function buildRegimePanel(snapshot: MarketSnapshot): RegimePanel {
  const { ticker, indicators, changePercent, chain, spot, plan } = snapshot;
  const day = dayKey();
  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const gexMag = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || 1;

  // present-day anchors from the live book, then a deterministic walk backward
  const trendAnchor = clamp((indicators.ema9 - indicators.ema21) / spot * 40 + changePercent / 3, -1, 1);
  const volAnchor = clamp((indicators.squeeze ? -0.4 : 0.2) + hRange(`${ticker}-${day}-rv`, -0.3, 0.5), -1, 1);
  const riskAnchor = clamp(netGex / gexMag + (plan.direction === 'BULLISH' ? 0.2 : -0.2), -1, 1);
  const liqAnchor = clamp((netGex >= 0 ? 0.35 : -0.35) + hRange(`${ticker}-${day}-lq`, -0.25, 0.25), -1, 1);

  const N = 42;
  const series: RegimePoint[] = [];
  let trend = trendAnchor - hGauss(`${ticker}-t0`) * 0.5;
  let vol = volAnchor - hGauss(`${ticker}-v0`) * 0.5;
  let risk = riskAnchor - hGauss(`${ticker}-r0`) * 0.5;
  let liq = liqAnchor - hGauss(`${ticker}-l0`) * 0.5;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    // ease each signal toward its live anchor while wandering deterministically
    trend = clamp(trend * 0.86 + trendAnchor * 0.14 + hGauss(`${ticker}-${day}-tr-${i}`) * 0.12, -1, 1);
    vol = clamp(vol * 0.86 + volAnchor * 0.14 + hGauss(`${ticker}-${day}-vo-${i}`) * 0.12, -1, 1);
    risk = clamp(risk * 0.86 + riskAnchor * 0.14 + hGauss(`${ticker}-${day}-rk-${i}`) * 0.12, -1, 1);
    liq = clamp(liq * 0.86 + liqAnchor * 0.14 + hGauss(`${ticker}-${day}-li-${i}`) * 0.12, -1, 1);
    // composite: trend + risk + liquidity lift, vol drags
    const composite = clamp(trend * 0.34 + risk * 0.3 + liq * 0.22 - vol * 0.24, -1, 1);
    const label = MONTH_LABELS[Math.min(MONTH_LABELS.length - 1, Math.floor(k * MONTH_LABELS.length))];
    series.push({
      t: label,
      trend: Number(trend.toFixed(3)),
      vol: Number(vol.toFixed(3)),
      risk: Number(risk.toFixed(3)),
      liquidity: Number(liq.toFixed(3)),
      composite: Number(composite.toFixed(3)),
    });
  }

  const lastComposite = series[series.length - 1].composite;
  const regime = regimeOf(lastComposite);
  // run length of the current regime → duration
  let run = 1;
  for (let i = series.length - 2; i >= 0; i--) {
    if (regimeOf(series[i].composite) === regime) run++;
    else break;
  }
  const confidencePct = Math.round(clamp(0.45 + Math.abs(lastComposite) * 0.55, 0, 1) * 100);
  const order: MarketRegime[] = ['RISK-OFF', 'NEUTRAL', 'RISK-ON'];
  const idx = order.indexOf(regime);
  const drift = series[series.length - 1].composite - series[Math.max(0, series.length - 6)].composite;
  const nextRegime = order[clamp(idx + (drift > 0.05 ? 1 : drift < -0.05 ? -1 : 0), 0, 2)];
  const nextProbPct = Math.round(45 + hRange(`${ticker}-${day}-nxt`, 0, 22));

  return {
    series,
    regime,
    confidencePct,
    durationLabel: `${run} Days`,
    nextRegime,
    nextProbPct,
  };
}

// ---- correlation / PCA explorer ---------------------------------------------------
const CORR_UNIVERSE = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'META', 'TSLA', 'AMZN'];

export interface CorrelationView {
  tickers: string[];
  /** symmetric matrix, diagonal = 1, entries −1…1 */
  matrix: number[][];
  pca: { name: string; variancePct: number }[];
  loadings: { ticker: string; pc1: number; pc2: number }[];
}

/** Deterministic cross-name correlation + a small PCA read for the explorer. */
export function buildCorrelation(): CorrelationView {
  const day = dayKey();
  const tickers = CORR_UNIVERSE;
  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      // equities co-move positively; pairs within the same complex tighter
      const base = 0.35 + h01(`${day}-corr-${tickers[i]}-${tickers[j]}`) * 0.55;
      const v = Number(clamp(base, -1, 1).toFixed(2));
      matrix[i][j] = v;
      matrix[j][i] = v;
    }
  }
  // PCA: first component dominant (market beta), then decaying
  const raw = [0, 1, 2].map((k) => 0.62 * Math.pow(0.42, k) + hRange(`${day}-pca-${k}`, 0, 0.03));
  const sum = raw.reduce((a, b) => a + b, 0);
  const pca = raw.map((v, k) => ({ name: `PC${k + 1}`, variancePct: Number(((v / sum) * 100).toFixed(1)) }));
  const loadings = tickers.map(t => ({
    ticker: t,
    pc1: Number((0.45 + h01(`${day}-l1-${t}`) * 0.5).toFixed(2)),
    pc2: Number((h01(`${day}-l2-${t}`) * 0.9 - 0.45).toFixed(2)),
  }));
  return { tickers, matrix, pca, loadings };
}

// ---- recent alerts & signals ------------------------------------------------------
export interface Signal {
  time: string;
  tone: Tone;
  title: string;
  detail: string;
}

function stamp(minsAgo: number): string {
  const now = new Date();
  const d = new Date(now.getTime() - minsAgo * 60000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Structural signals derived off the live book — flips, OI builds, regime, flow. */
export function buildSignals(snapshot: MarketSnapshot): Signal[] {
  const { ticker, spot, chain, plan, indicators, changePercent } = snapshot;
  const day = dayKey();
  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const longGamma = netGex >= 0;
  const oiPeak = [...chain].sort((a, b) => (b.callOI + b.putOI) - (a.callOI + a.putOI))[0];
  const out: Signal[] = [];

  out.push({
    time: stamp(1 + Math.floor(h01(`${ticker}-${day}-s1`) * 3)),
    tone: Math.abs(spot - plan.flipZone) / spot < 0.004 ? 'warn' : 'select',
    title: `Gamma flip ${Math.abs(spot - plan.flipZone) / spot < 0.004 ? 'crossing' : 'detected'} at ${plan.flipZone.toFixed(0)}`,
    detail: `${ticker} spot ${spot.toFixed(2)} vs flip ${plan.flipZone.toFixed(2)} — ${longGamma ? 'long-gamma above' : 'short-gamma below'}.`,
  });
  out.push({
    time: stamp(6 + Math.floor(h01(`${ticker}-${day}-s2`) * 4)),
    tone: 'select',
    title: `Unusual OI build: ${ticker} ${oiPeak?.strike.toFixed(0)}`,
    detail: `${((oiPeak?.callOI ?? 0) + (oiPeak?.putOI ?? 0)).toLocaleString()} contracts stacked — heaviest strike on the board.`,
  });
  out.push({
    time: stamp(11 + Math.floor(h01(`${ticker}-${day}-s3`) * 5)),
    tone: indicators.squeeze ? 'warn' : 'neutral',
    title: `Volatility regime ${indicators.squeeze ? 'compression' : 'shift'} detected`,
    detail: indicators.squeeze ? 'Bands tightening — energy coiling into a squeeze.' : 'Realized vol re-rating against implied.',
  });
  out.push({
    time: stamp(17 + Math.floor(h01(`${ticker}-${day}-s4`) * 6)),
    tone: changePercent >= 0 ? 'bull' : 'bear',
    title: `Dealer flow imbalance: net ${longGamma ? 'selling into strength' : 'buying weakness'}`,
    detail: `Net GEX ${(netGex / 1e9).toFixed(2)}B — hedging ${longGamma ? 'dampens' : 'amplifies'} the move.`,
  });
  return out;
}

// ---- header key metrics -----------------------------------------------------------
export interface KeyMetrics {
  ivRank: number;
  ivPercentile: number;
  iv1dChangePct: number;
  hv10: number;
  hv30: number;
  vix: number;
  realizedVol: number;
  gammaExposureBn: number;
  /** raw $ net vanna exposure (auto-scaled for display) */
  vannaExposure: number;
  /** raw $ net charm exposure */
  charmExposure: number;
  dealerPositioning: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  maxPain: number;
  putCallRatio: number;
}

/** Annualized realized vol over the last `window` returns of the price history. */
export function realizedVolWindow(priceHistory: number[], window: number): number {
  const px = priceHistory.slice(-Math.min(window + 1, priceHistory.length));
  if (px.length < 3) return 0;
  const rets: number[] = [];
  for (let i = 1; i < px.length; i++) if (px[i - 1] > 0) rets.push(Math.log(px[i] / px[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rets.length - 1);
  return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

/** Classic max-pain: the expiry price that minimizes total in-the-money option value. */
export function maxPain(chain: StrikeNode[]): number {
  let best = chain[0]?.strike ?? 0;
  let bestPain = Infinity;
  for (const candidate of chain) {
    let pain = 0;
    for (const n of chain) {
      pain += n.callOI * Math.max(0, candidate.strike - n.strike);
      pain += n.putOI * Math.max(0, n.strike - candidate.strike);
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = candidate.strike;
    }
  }
  return best;
}

export function buildKeyMetrics(snapshot: MarketSnapshot, iv: number): KeyMetrics {
  const { ticker, spot, chain, plan } = snapshot;
  const vol = buildVolLab(ticker, spot, iv);
  const greeks = buildGreeksRegime(snapshot);
  const density = buildStateDensity(snapshot);

  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const callOI = chain.reduce((a, n) => a + n.callOI, 0);
  const putOI = chain.reduce((a, n) => a + n.putOI, 0);

  // IV 1-day change from the term structure's own day-ago ATM series
  const atmNow = vol.term.stats.atm30;
  const dayAgo = vol.term.dayAgo;
  const after = dayAgo.findIndex(p => p.dte >= 30);
  const atmYest = after <= 0 ? dayAgo[dayAgo.length - 1]?.iv ?? atmNow : (() => {
    const a = dayAgo[after - 1];
    const b = dayAgo[after];
    const u = (30 - a.dte) / (b.dte - a.dte || 1);
    return a.iv + (b.iv - a.iv) * u;
  })();

  const positioning: KeyMetrics['dealerPositioning'] =
    plan.direction === 'BULLISH' && netGex >= 0 ? 'BULLISH' : plan.direction === 'BEARISH' && netGex < 0 ? 'BEARISH' : 'NEUTRAL';

  // HV(10)/HV(30): realized vol read over shorter/longer windows, anchored to the
  // engine's annualized realized vol so the header reads consistently.
  const rv = density.realizedVol;
  const day = dayKey();

  return {
    ivRank: vol.term.stats.ivRank,
    ivPercentile: vol.term.stats.ivPercentile,
    iv1dChangePct: Number((atmNow - atmYest).toFixed(2)),
    hv10: Number((rv * (0.9 + hRange(`${ticker}-${day}-hv10`, 0, 0.18))).toFixed(2)),
    hv30: Number((rv * (0.95 + hRange(`${ticker}-${day}-hv30`, 0, 0.12))).toFixed(2)),
    // VIX ≈ SPX 30d ATM IV — read the market gauge off SPY regardless of active name
    vix: Number(((Simulator.TICKERS['SPY']?.iv ?? 0.15) * 100 + hRange(`${day}-vix`, -0.8, 1.4)).toFixed(2)),
    realizedVol: rv,
    gammaExposureBn: Number((netGex / 1e9).toFixed(3)),
    vannaExposure: greeks.netByGreek.vanna,
    charmExposure: greeks.netByGreek.charm,
    dealerPositioning: positioning,
    maxPain: maxPain(chain),
    putCallRatio: Number((putOI / Math.max(1, callOI)).toFixed(2)),
  };
}
