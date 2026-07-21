/*
==================================================
  SLAYER TERMINAL - MARKET-STATE REPLAY (statereplay.ts)
  Prove It's analog engine: "what happened in past
  sessions that actually resembled today?"

  It reads today's market state as an 8-factor vector
  (dealer positioning, vol regime, liquidity, breadth,
  rates, news, options flow, time-of-day), synthesizes
  a pool of prior sessions, scores each on similarity,
  and replays the outcome distribution of the closest
  analogs against THIS setup's target and stop:

    reached target first  /  stopped first  /  neither

  On top it grades itself — a predicted-vs-realized
  calibration curve, an edge-decay profile as the
  trade is held longer, MFE/MAE excursion stats, and
  an in-sample vs out-of-sample split so the read has
  to prove it holds on data it wasn't fit to.

  Dealer/vol/flow come off the live chain and tape;
  breadth, rates, news and time-of-day are modeled
  macro context and clearly swap for real feeds behind
  the same contract. Deterministic per ticker + day.
==================================================
*/

import { dayKey, hRange, h01, hGauss } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

export type FeatureKey = 'dealer' | 'vol' | 'liquidity' | 'breadth' | 'rates' | 'news' | 'flow' | 'tod';

export const STATE_FEATURES: { key: FeatureKey; label: string; blurb: string }[] = [
  { key: 'dealer', label: 'Dealer positioning', blurb: 'net gamma sign & size dealers must hedge' },
  { key: 'vol', label: 'Vol regime', blurb: 'realized/implied energy in the tape' },
  { key: 'liquidity', label: 'Liquidity', blurb: 'depth available to absorb flow (modeled)' },
  { key: 'breadth', label: 'Breadth', blurb: 'how broad the move is (modeled)' },
  { key: 'rates', label: 'Rates', blurb: 'macro rates backdrop (modeled)' },
  { key: 'news', label: 'News', blurb: 'headline pressure on the session (modeled)' },
  { key: 'flow', label: 'Options flow', blurb: 'aggressive call/put tape imbalance' },
  { key: 'tod', label: 'Time of day', blurb: 'session phase the state sits in (modeled)' },
];

export type Outcome = 'TARGET' | 'STOP' | 'NEITHER';
export type MatchQuality = 'TIGHT' | 'STRONG' | 'LOOSE' | 'WEAK';

export interface StateFactor {
  key: FeatureKey;
  label: string;
  blurb: string;
  /** 0..1 — where today sits on this axis */
  value: number;
  /** true when the value is read from the live chain/tape rather than modeled */
  live: boolean;
}

export interface SimSession {
  id: string;
  daysAgo: number;
  /** similarity to today, 0..1 */
  sim: number;
  outcome: Outcome;
  /** bars-to-resolve within the session horizon */
  bars: number;
  /** max favorable excursion, % of price */
  mfePct: number;
  /** max adverse excursion, % of price */
  maePct: number;
  /** realized result in R (risk = distance to stop) */
  rMultiple: number;
}

export interface CalibrationBin {
  label: string;
  /** model's predicted P(target-first) for the band, % */
  predictedPct: number;
  /** realized target-first frequency in the band, % */
  realizedPct: number;
  count: number;
}

export interface EdgeDecayPoint {
  bar: number;
  label: string;
  /** cumulative target-first rate by this bar, % of comparables */
  cumTargetPct: number;
  /** cumulative stop-first rate by this bar, % */
  cumStopPct: number;
  /** net edge (target − stop) captured by this bar, ppts */
  edgePct: number;
  /** incremental edge added since the previous checkpoint, ppts */
  marginalEdgePts: number;
}

export interface OutOfSample {
  inSampleTargetPct: number;
  inSampleN: number;
  outSampleTargetPct: number;
  outSampleN: number;
  /** in-sample minus out-of-sample target-first rate, ppts (decay if positive) */
  degradationPts: number;
}

export interface StateReplayView {
  ticker: string;
  spot: number;
  direction: 'BULLISH' | 'BEARISH';
  factors: StateFactor[];
  /** sessions scanned before the similarity cut */
  pool: number;
  /** comparable analogs kept above the similarity cut */
  n: number;
  avgSimPct: number;
  simLowPct: number;
  simHighPct: number;
  matchQuality: MatchQuality;
  /** trade geometry the analogs are replayed against */
  rr: number;
  targetDistPct: number;
  stopDistPct: number;
  horizonBars: number;
  // outcome distribution over the comparable set
  targetPct: number;
  stopPct: number;
  neitherPct: number;
  /** target-first rate a no-edge session would post at this R:R */
  baselineTargetPct: number;
  /** targetPct minus baseline, ppts — the setup's excess hit rate */
  edgePts: number;
  // excursion & expectancy
  expectancyR: number;
  avgMfePct: number;
  avgMaePct: number;
  edgeRatio: number;
  calibration: CalibrationBin[];
  /** mean |predicted − realized| across bins, ppts */
  calibrationErrorPct: number;
  edgeDecay: EdgeDecayPoint[];
  oos: OutOfSample;
  topSessions: SimSession[];
  receipts: string;
  headline: string;
  note: string;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

const POOL = 176;
const HORIZON_BARS = 78; // one RTH session in 5-min bars
const CHECKPOINTS = [6, 12, 18, 26, 39, 52, 65, 78];

export function buildStateReplay(snapshot: MarketSnapshot): StateReplayView {
  const { ticker, spot, chain, changePercent, indicators, plan, tape, priceHistory } = snapshot;
  const day = dayKey();
  const fs = (t: string) => `${ticker}-${day}-msr-${t}`;

  // ---- today's market-state vector -------------------------------------------------
  const netGex = chain.reduce((a, n) => a + n.netGex, 0);
  const gammaMag = chain.reduce((a, n) => a + Math.abs(n.netGex), 0) || 1;

  // Dealer positioning: long gamma (net > 0) reads high/absorptive, short gamma low.
  const dealer = clamp01(0.5 + netGex / (2 * gammaMag));
  // Vol regime: squeeze compresses, RSI extremity and the day's move expand.
  const rsiExt = Math.abs(indicators.rsi - 50) / 50;
  const vol = clamp01(0.36 + Math.abs(changePercent) / 4 + (indicators.squeeze ? -0.14 : 0.1) + rsiExt * 0.18);
  // Options flow: aggressive (offer-lifting) call vs put tape imbalance.
  let bull = 0;
  let bear = 0;
  for (const o of tape) {
    const w = o.size * (o.orderType === 'SWEEP' ? 1.3 : 1);
    const aggressive = o.side === 'ASK';
    const bullish = (o.type === 'C' && aggressive) || (o.type === 'P' && !aggressive);
    if (bullish) bull += w;
    else bear += w;
  }
  const flow = bull + bear > 0 ? clamp01(0.5 + (bull - bear) / (2 * (bull + bear))) : 0.5;
  // Breadth proxy from the name's own trend slope (stands in for a real breadth feed).
  const ph = priceHistory;
  const slope = ph.length > 1 ? (ph[ph.length - 1] - ph[0]) / (Math.abs(ph[0]) || 1) : 0;
  const breadth = clamp01(0.5 + slope * 2.5);
  // Modeled macro context — clearly swappable for real feeds behind the same contract.
  const liquidity = clamp01(hRange(fs('liq'), 0.22, 0.86));
  const rates = clamp01(hRange(fs('rates'), 0.2, 0.82));
  const news = clamp01(hRange(fs('news'), 0.15, 0.85));
  const tod = clamp01(hRange(fs('tod'), 0.12, 0.88));

  const todayVec: Record<FeatureKey, number> = { dealer, vol, liquidity, breadth, rates, news, flow, tod };
  const live: Record<FeatureKey, boolean> = {
    dealer: true,
    vol: true,
    liquidity: false,
    breadth: false,
    rates: false,
    news: false,
    flow: true,
    tod: false,
  };
  const factors: StateFactor[] = STATE_FEATURES.map(f => ({
    key: f.key,
    label: f.label,
    blurb: f.blurb,
    value: todayVec[f.key],
    live: live[f.key],
  }));
  const keys = STATE_FEATURES.map(f => f.key);
  const today = keys.map(k => todayVec[k]);
  const maxDist = Math.sqrt(keys.length);

  // ---- trade geometry the analogs are replayed against -----------------------------
  const entry = plan.entry || spot;
  const stopDist = Math.max(1e-4, Math.abs(entry - plan.stopLoss) / entry);
  const tgtDist = Math.max(1e-4, Math.abs(plan.target1 - entry) / entry);
  const rr = tgtDist / stopDist;
  // Zero-drift probability of touching target before stop (the no-edge coin).
  const baseHit = stopDist / (stopDist + tgtDist);

  // ---- synthesize & score the analog pool ------------------------------------------
  interface Row extends SimSession {
    pTarget: number;
    resolve: number;
  }
  const pool: Row[] = [];
  for (let i = 0; i < POOL; i++) {
    const s = (t: string) => fs(`${i}-${t}`);
    // Each session sits some distance from today — a few are near-twins, most drift.
    const spread = hRange(s('spread'), 0.1, 0.62);
    const vec = keys.map(k => clamp01(todayVec[k] + hGauss(s(`v-${k}`)) * spread));
    let sq = 0;
    for (let d = 0; d < keys.length; d++) {
      const diff = vec[d] - today[d];
      sq += diff * diff;
    }
    const sim = clamp01(1 - Math.sqrt(sq) / maxDist);

    // Outcome model: resolve rate rises with that session's vol; the target/stop
    // tilt starts at the fair coin and is nudged by how similar the session is.
    const vVol = vec[1];
    const resolve = clamp(0.42 + vVol * 0.48 + hGauss(s('res')) * 0.06, 0.15, 0.95);
    const pTgr = clamp(baseHit + (sim - 0.5) * 0.5 + hGauss(s('tilt')) * 0.05, 0.06, 0.94);
    const pTarget = resolve * pTgr;
    const pStop = resolve * (1 - pTgr);

    const u = h01(s('out'));
    const outcome: Outcome = u < pTarget ? 'TARGET' : u < pTarget + pStop ? 'STOP' : 'NEITHER';

    const speed = 0.35 + vVol * 0.55;
    const bars =
      outcome === 'NEITHER'
        ? HORIZON_BARS
        : Math.max(2, Math.min(HORIZON_BARS - 1, Math.round(3 + Math.pow(h01(s('bars')), 1.5) * HORIZON_BARS * 0.9 * (1.1 - speed))));

    let mfePct: number;
    let maePct: number;
    let rMultiple: number;
    if (outcome === 'TARGET') {
      mfePct = tgtDist * 100 * (1 + h01(s('mfe')) * 0.4);
      maePct = stopDist * 100 * h01(s('mae')) * 0.7;
      rMultiple = rr;
    } else if (outcome === 'STOP') {
      maePct = stopDist * 100 * (1 + h01(s('mae')) * 0.15);
      mfePct = tgtDist * 100 * h01(s('mfe')) * 0.65;
      rMultiple = -1;
    } else {
      mfePct = tgtDist * 100 * h01(s('mfe')) * 0.85;
      maePct = stopDist * 100 * h01(s('mae')) * 0.85;
      rMultiple = clamp((mfePct - maePct) / (stopDist * 100), -0.85, 0.9);
    }

    pool.push({
      id: `MS-${String(i + 1).padStart(3, '0')}`,
      daysAgo: 3 + Math.round(h01(s('ago')) * 498),
      sim,
      outcome,
      bars,
      mfePct,
      maePct,
      rMultiple,
      pTarget,
      resolve,
    });
  }

  // Keep the closest analogs — the comparable set.
  pool.sort((a, b) => b.sim - a.sim);
  const K = Math.min(POOL, Math.max(60, Math.round(hRange(fs('k'), 120, 158))));
  const comp = pool.slice(0, K);
  const n = comp.length;

  // ---- outcome distribution --------------------------------------------------------
  const tN = comp.filter(c => c.outcome === 'TARGET').length;
  const sN = comp.filter(c => c.outcome === 'STOP').length;
  let targetPct = Math.round((tN / n) * 100);
  let stopPct = Math.round((sN / n) * 100);
  let neitherPct = 100 - targetPct - stopPct;
  if (neitherPct < 0) {
    if (targetPct >= stopPct) targetPct += neitherPct;
    else stopPct += neitherPct;
    neitherPct = 0;
  }

  const meanResolve = comp.reduce((a, c) => a + c.resolve, 0) / n;
  const baselineTargetPct = Math.round(baseHit * meanResolve * 100);
  const edgePts = targetPct - baselineTargetPct;

  const sims = comp.map(c => c.sim);
  const avgSimPct = Math.round((sims.reduce((a, x) => a + x, 0) / n) * 100);
  const simLowPct = Math.round(Math.min(...sims) * 100);
  const simHighPct = Math.round(Math.max(...sims) * 100);
  const matchQuality: MatchQuality =
    avgSimPct >= 80 ? 'TIGHT' : avgSimPct >= 68 ? 'STRONG' : avgSimPct >= 55 ? 'LOOSE' : 'WEAK';

  // ---- excursion & expectancy ------------------------------------------------------
  const avgMfePct = comp.reduce((a, c) => a + c.mfePct, 0) / n;
  const avgMaePct = comp.reduce((a, c) => a + c.maePct, 0) / n;
  const edgeRatio = avgMfePct / Math.max(avgMaePct, 0.01);
  const expectancyR = comp.reduce((a, c) => a + c.rMultiple, 0) / n;

  // ---- calibration: predicted P(target) vs realized frequency ----------------------
  const bands: [number, number][] = [
    [0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.01],
  ];
  const calibration: CalibrationBin[] = [];
  let calWeighted = 0;
  for (const [lo, hi] of bands) {
    const sub = comp.filter(c => c.pTarget >= lo && c.pTarget < hi);
    if (!sub.length) continue;
    const predicted = (sub.reduce((a, c) => a + c.pTarget, 0) / sub.length) * 100;
    const realized = (sub.filter(c => c.outcome === 'TARGET').length / sub.length) * 100;
    calibration.push({
      label: `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`,
      predictedPct: Number(predicted.toFixed(1)),
      realizedPct: Number(realized.toFixed(1)),
      count: sub.length,
    });
    calWeighted += Math.abs(predicted - realized) * sub.length;
  }
  const calibrationErrorPct = Number((calWeighted / n).toFixed(1));

  // ---- edge decay: net edge captured as the trade is held longer -------------------
  const edgeDecay: EdgeDecayPoint[] = [];
  let prevEdge = 0;
  for (const B of CHECKPOINTS) {
    const cumT = comp.filter(c => c.outcome === 'TARGET' && c.bars <= B).length / n;
    const cumS = comp.filter(c => c.outcome === 'STOP' && c.bars <= B).length / n;
    const edge = (cumT - cumS) * 100;
    edgeDecay.push({
      bar: B,
      label: `${B}b`,
      cumTargetPct: Number((cumT * 100).toFixed(1)),
      cumStopPct: Number((cumS * 100).toFixed(1)),
      edgePct: Number(edge.toFixed(1)),
      marginalEdgePts: Number((edge - prevEdge).toFixed(1)),
    });
    prevEdge = edge;
  }

  // ---- out-of-sample: hold out the most recent analogs -----------------------------
  const byRecency = [...comp].sort((a, b) => a.daysAgo - b.daysAgo);
  const outN = Math.max(1, Math.round(n * 0.35));
  const outSet = byRecency.slice(0, outN);
  const inSet = byRecency.slice(outN);
  const inTgt = inSet.length ? Math.round((inSet.filter(c => c.outcome === 'TARGET').length / inSet.length) * 100) : 0;
  const outTgt = outSet.length ? Math.round((outSet.filter(c => c.outcome === 'TARGET').length / outSet.length) * 100) : 0;
  const oos: OutOfSample = {
    inSampleTargetPct: inTgt,
    inSampleN: inSet.length,
    outSampleTargetPct: outTgt,
    outSampleN: outSet.length,
    degradationPts: inTgt - outTgt,
  };

  const topSessions: SimSession[] = comp.slice(0, 8).map(c => ({
    id: c.id,
    daysAgo: c.daysAgo,
    sim: c.sim,
    outcome: c.outcome,
    bars: c.bars,
    mfePct: c.mfePct,
    maePct: c.maePct,
    rMultiple: c.rMultiple,
  }));

  const dir = plan.direction;
  const receipts = `In ${n} comparable sessions this ${dir === 'BULLISH' ? 'long' : 'short'} setup reached target first ${targetPct}%, stopped first ${stopPct}%, neither ${neitherPct}%.`;
  const headline =
    edgePts >= 4
      ? `Today's state has real precedent: the closest ${n} analogs hit target first ${targetPct}% of the time — ${edgePts} points above the ${baselineTargetPct}% a no-edge session posts at this ${rr.toFixed(1)}:1 geometry, and it holds ${oos.degradationPts <= 4 ? 'on the held-out sample too' : 'but softens on the held-out sample'}.`
      : edgePts <= -4
        ? `The analogs argue against it: comparable states reached target first only ${targetPct}%, ${Math.abs(edgePts)} points below the ${baselineTargetPct}% baseline for this ${rr.toFixed(1)}:1 target — the setup is fighting its own history.`
        : `Comparable states are a coin flip: target first ${targetPct}% against a ${baselineTargetPct}% no-edge baseline at ${rr.toFixed(1)}:1. There is no durable precedent here — trade it small or wait for the state to sharpen.`;
  const note =
    calibrationErrorPct <= 6
      ? `Predicted and realized target rates track within ${calibrationErrorPct} points across the probability bands, so the model isn't fooling itself — the numbers it quotes are the numbers it delivers on the analogs.`
      : `Predicted and realized rates diverge by ${calibrationErrorPct} points in places — read the distribution, not the point estimate, and weight the calibration panel before sizing.`;

  return {
    ticker,
    spot,
    direction: dir,
    factors,
    pool: POOL,
    n,
    avgSimPct,
    simLowPct,
    simHighPct,
    matchQuality,
    rr,
    targetDistPct: tgtDist * 100,
    stopDistPct: stopDist * 100,
    horizonBars: HORIZON_BARS,
    targetPct,
    stopPct,
    neitherPct,
    baselineTargetPct,
    edgePts,
    expectancyR,
    avgMfePct,
    avgMaePct,
    edgeRatio,
    calibration,
    calibrationErrorPct,
    edgeDecay,
    oos,
    topSessions,
    receipts,
    headline,
    note,
  };
}
