/*
==================================================
  SLAYER TERMINAL - CONTRACT WEIGHER (contractScore.ts)
  Compass's scale. For weeklies, swings and LEAPS it
  prices real candidates (Black-Scholes), then weighs
  the math (breakeven vs expected move, theta burden),
  the tape (flow + dark-pool posture), and the story
  (news lean) into one composite: what's worth buying
  and what isn't — with the reason attached.
==================================================
*/

import { dayKey, hRange } from './rng';
import { buildDarkPoolView } from '../data/darkpool';
import { tickerSentiment } from '../data/news';
import type { MarketSnapshot } from '../types/market';

export type Horizon = 'LOTTO' | 'WEEKLIES' | 'SWINGS' | 'LEAPS';

export interface FactorScore {
  key: string;
  label: string;
  /** 0–100 */
  score: number;
  /** Horizon weight, sums to 1 across factors */
  weight: number;
  detail: string;
}

export type ContractVerdict = 'BUY' | 'WATCH' | 'FADE';

export interface WeighedContract {
  id: string;
  ticker: string;
  right: 'C' | 'P';
  strike: number;
  dte: number;
  expiryLabel: string;
  mid: number;
  delta: number;
  ivPct: number;
  ivRank: number;
  /** Daily decay as % of premium (negative burden expressed positive) */
  thetaPerDayPct: number;
  spreadPct: number;
  oi: number;
  /** Move needed at expiry to break even, % of spot (signed toward the trade) */
  breakevenMovePct: number;
  /** One-sigma move to expiry, % */
  expectedMovePct: number;
  factors: FactorScore[];
  composite: number;
  verdict: ContractVerdict;
  edge: string;
  risk: string;
}

export const HORIZONS: { key: Horizon; label: string; blurb: string }[] = [
  {
    key: 'WEEKLIES',
    label: 'Weeklies',
    blurb: 'Days, not weeks — theta is the landlord. Only tapes with flow behind them are worth renting.',
  },
  {
    key: 'SWINGS',
    label: 'Swings',
    blurb: '2–6 week holds — the balanced sleeve: math, flow and news all get a vote.',
  },
  {
    key: 'LEAPS',
    label: 'LEAPS',
    blurb: '12+ months out — buy volatility cheap and the story right; decay barely votes.',
  },
];

// ---- Black-Scholes ------------------------------------------------------------

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return 0.5 * (1 + Math.sign(x) * erf);
}

interface BsOut {
  price: number;
  delta: number;
  /** Per-day theta, absolute dollars */
  thetaDay: number;
}

function blackScholes(spot: number, strike: number, ivAnnual: number, dte: number, right: 'C' | 'P'): BsOut {
  const T = Math.max(dte, 0.5) / 365;
  const r = 0.045;
  const sq = ivAnnual * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + (ivAnnual * ivAnnual) / 2) * T) / sq;
  const d2 = d1 - sq;
  const pdf = Math.exp(-(d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const disc = Math.exp(-r * T);

  if (right === 'C') {
    const price = spot * normCdf(d1) - strike * disc * normCdf(d2);
    const theta = (-(spot * pdf * ivAnnual) / (2 * Math.sqrt(T)) - r * strike * disc * normCdf(d2)) / 365;
    return { price: Math.max(price, 0.02), delta: normCdf(d1), thetaDay: theta };
  }
  const price = strike * disc * normCdf(-d2) - spot * normCdf(-d1);
  const theta = (-(spot * pdf * ivAnnual) / (2 * Math.sqrt(T)) + r * strike * disc * normCdf(-d2)) / 365;
  return { price: Math.max(price, 0.02), delta: normCdf(d1) - 1, thetaDay: theta };
}

// ---- candidate generation --------------------------------------------------------

const HORIZON_SHAPE: Record<Horizon, { dtes: number[]; otm: number[] }> = {
  // % OTM offsets per horizon — lottos hug spot on 0–1 DTE, LEAPS reach for cheap deltas
  LOTTO: { dtes: [0, 1], otm: [0, 0.003, 0.006, 0.011] },
  WEEKLIES: { dtes: [2, 5, 7], otm: [0, 0.01, 0.02, 0.035] },
  SWINGS: { dtes: [21, 30, 45], otm: [0, 0.02, 0.045, 0.07] },
  LEAPS: { dtes: [365, 480], otm: [0, 0.05, 0.1, 0.18] },
};

const WEIGHTS: Record<Horizon, Record<string, number>> = {
  // 0DTE: the math is a coin-flip, so the tape (flow) and decay/liquidity carry the vote
  LOTTO: { math: 0.16, decay: 0.24, vol: 0.1, flow: 0.28, news: 0.06, liq: 0.16 },
  WEEKLIES: { math: 0.24, decay: 0.26, vol: 0.08, flow: 0.22, news: 0.08, liq: 0.12 },
  SWINGS: { math: 0.22, decay: 0.14, vol: 0.14, flow: 0.2, news: 0.16, liq: 0.14 },
  LEAPS: { math: 0.18, decay: 0.04, vol: 0.28, flow: 0.12, news: 0.22, liq: 0.16 },
};

// Theta scored against a horizon-realistic ceiling — 0DTE burns a huge % of
// premium per day, so it needs its own scale or every lotto reads as a zero.
const DECAY_CEILING: Record<Horizon, number> = { LOTTO: 60, WEEKLIES: 9, SWINGS: 3.5, LEAPS: 0.8 };

function expiryLabel(dte: number): string {
  const d = new Date(Date.now() + dte * 86400000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Which sleeve a given DTE belongs to — drives weights when weighing a
    single searched contract (0-1d = lotto, ≤10d = weeklies, ≤90d = swings). */
export function horizonForDte(dte: number): Horizon {
  return dte <= 1 ? 'LOTTO' : dte <= 10 ? 'WEEKLIES' : dte <= 90 ? 'SWINGS' : 'LEAPS';
}

/** Shared per-name context — one read per build, reused across every candidate. */
interface ScoreCtx {
  dp: ReturnType<typeof buildDarkPoolView>;
  news: number;
  ivRank: number;
  baseIv: number;
  trendUp: boolean;
  rsi: number;
  step: number;
}

function buildScoreCtx(snapshot: MarketSnapshot): ScoreCtx {
  const { ticker, spot, chain, indicators } = snapshot;
  const day = dayKey();
  const dp = buildDarkPoolView(snapshot);
  const news = tickerSentiment(ticker);
  const ivRank = Math.round(hRange(`${ticker}-${day}-ivr`, 12, 92));
  const baseIv = Math.max(0.12, chain.length > 0 ? 0.18 + (indicators.squeeze ? -0.03 : 0.02) + hRange(`${ticker}-${day}-iv`, 0, 0.25) : 0.25);
  const trendUp = indicators.ema9 >= indicators.ema21;
  const rsi = indicators.rsi;
  // Strike increment from the chain grid — candidates stay on listed strikes
  // even past the chain window's edge (LEAPS reach further OTM than it holds).
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const step = sorted.length > 1 ? Math.abs(sorted[1].strike - sorted[0].strike) : Math.max(spot * 0.005, 0.5);
  return { dp, news, ivRank, baseIv, trendUp, rsi, step };
}

/** Weigh one concrete contract with the full factor stack. This is the single
    scoring path both the setups scan and the searched-contract weigher run — so
    a contract you type in is graded on the exact same math as the top picks. */
function scoreCandidate(
  snapshot: MarketSnapshot,
  ctx: ScoreCtx,
  horizon: Horizon,
  right: 'C' | 'P',
  strikeInput: number,
  dte: number
): WeighedContract {
  const { ticker, spot, chain } = snapshot;
  const weights = WEIGHTS[horizon];
  const { dp, news, ivRank, baseIv, trendUp, rsi, step } = ctx;

  const strike = Math.max(step, Math.round(strikeInput / step) * step);
  const node = chain.reduce(
    (best, n) => (Math.abs(n.strike - strike) < Math.abs(best.strike - strike) ? n : best),
    chain[0]
  );
  const moneyness = (strike - spot) / spot;

  // Skew: wings pay up
  const iv = baseIv * (1 + Math.abs(moneyness) * 1.6);
  const bs = blackScholes(spot, strike, iv, dte, right);
  const mid = Number(bs.price.toFixed(2));
  const thetaPerDayPct = (Math.abs(bs.thetaDay) / mid) * 100;
  // OI thins out the further the strike sits past the chain window
  const baseOi = node ? (right === 'C' ? node.callOI : node.putOI) : 500;
  const oiCount = Math.max(50, Math.round(baseOi * Math.exp((-Math.abs(strike - (node?.strike ?? strike)) / spot) * 24)));
  const spreadPct = clamp(6 - Math.log10(Math.max(oiCount, 10)) * 1.4, 0.4, 6) * (dte > 180 ? 1.5 : 1);

  // Effective time floors at half a day so 0DTE still carries a real 1σ move
  const tYears = Math.max(dte, 0.5) / 365;
  const expectedMovePct = iv * Math.sqrt(tYears) * 100;
  const beMove = right === 'C' ? (strike + mid) / spot - 1 : 1 - (strike - mid) / spot;
  const breakevenMovePct = beMove * 100;

  // ---- factor scores ------------------------------------------------------
  const coverage = expectedMovePct / Math.max(breakevenMovePct, 0.05);
  const mathScore = Math.round(clamp(coverage * 62, 4, 98));
  const mathDetail =
    coverage >= 1
      ? `1σ move (${expectedMovePct.toFixed(1)}%) clears the ${breakevenMovePct.toFixed(1)}% breakeven — the math works without a miracle.`
      : `Needs ${breakevenMovePct.toFixed(1)}% by expiry but 1σ is only ${expectedMovePct.toFixed(1)}% — you're paying for a tail.`;

  const decayCeiling = DECAY_CEILING[horizon];
  const decayScore = Math.round(clamp(100 - (thetaPerDayPct / decayCeiling) * 100, 2, 98));
  const decayDetail =
    decayScore >= 55
      ? `Theta ${thetaPerDayPct.toFixed(1)}%/day is carryable for the holding window.`
      : `Theta ${thetaPerDayPct.toFixed(1)}%/day — the clock beats you unless the move comes fast.`;

  const volScore = Math.round(clamp(100 - ivRank + (horizon === 'LEAPS' ? 0 : 18), 4, 96));
  const volDetail =
    ivRank >= 65
      ? `IV rank ${ivRank} — premium is expensive; vol crush works against longs.`
      : `IV rank ${ivRank} — you're not overpaying for volatility here.`;

  const dirSign = right === 'C' ? 1 : -1;
  const flowAlign = dp.netPosturePct * dirSign;
  const tapeAlign = (trendUp ? 1 : -1) * dirSign;
  const flowScore = Math.round(clamp(50 + flowAlign * 0.45 + tapeAlign * 12, 4, 96));
  const flowDetail =
    flowScore >= 60
      ? `Dark pool ${dp.posture.toLowerCase()} and the tape lean the same way as this contract.`
      : flowScore <= 40
        ? `Smart-money flow leans against ${right === 'C' ? 'calls' : 'puts'} here — you'd be fading the desks.`
        : 'Flow is mixed — no institutional wind either way.';

  const newsScore = Math.round(clamp(50 + news * 48 * dirSign, 4, 96));
  const newsDetail =
    Math.abs(news) < 0.12
      ? 'Quiet tape on the name — news is a non-factor.'
      : newsScore >= 55
        ? 'The headline tape supports the direction.'
        : 'Headline risk points the other way.';

  const liqScore = Math.round(clamp(100 - spreadPct * 13 + Math.log10(Math.max(oiCount, 10)) * 6, 4, 98));
  const liqDetail =
    liqScore >= 55
      ? `${spreadPct.toFixed(1)}% spread on ${oiCount.toLocaleString()} OI — in and out without paying a toll.`
      : `${spreadPct.toFixed(1)}% spread — the market maker wins twice on this one.`;

  // RSI sanity nudges the math sleeve at extremes (chasing into 80 RSI weeklies etc.)
  const rsiPenalty = (right === 'C' && rsi > 74) || (right === 'P' && rsi < 26) ? 8 : 0;

  const factors: FactorScore[] = [
    { key: 'math', label: 'The math', score: Math.max(2, mathScore - rsiPenalty), weight: weights.math, detail: mathDetail },
    { key: 'decay', label: 'Theta burden', score: decayScore, weight: weights.decay, detail: decayDetail },
    { key: 'vol', label: 'Vol pricing', score: volScore, weight: weights.vol, detail: volDetail },
    { key: 'flow', label: 'Flow & dark pool', score: flowScore, weight: weights.flow, detail: flowDetail },
    { key: 'news', label: 'News lean', score: newsScore, weight: weights.news, detail: newsDetail },
    { key: 'liq', label: 'Liquidity', score: liqScore, weight: weights.liq, detail: liqDetail },
  ];

  const composite = Math.round(factors.reduce((a, f) => a + f.score * f.weight, 0));
  const verdict: ContractVerdict = composite >= 70 ? 'BUY' : composite >= 52 ? 'WATCH' : 'FADE';
  const ranked = [...factors].sort((a, b) => b.score - a.score);

  return {
    id: `${ticker}-${right}-${strike}-${dte}`,
    ticker,
    right,
    strike,
    dte,
    expiryLabel: expiryLabel(dte),
    mid,
    delta: Number(bs.delta.toFixed(2)),
    ivPct: Number((iv * 100).toFixed(1)),
    ivRank,
    thetaPerDayPct: Number(thetaPerDayPct.toFixed(2)),
    spreadPct: Number(spreadPct.toFixed(1)),
    oi: oiCount,
    breakevenMovePct: Number(breakevenMovePct.toFixed(2)),
    expectedMovePct: Number(expectedMovePct.toFixed(2)),
    factors,
    composite,
    verdict,
    edge: ranked[0].detail,
    risk: ranked[ranked.length - 1].detail,
  };
}

export function weighContracts(snapshot: MarketSnapshot, horizon: Horizon): WeighedContract[] {
  const { spot } = snapshot;
  const shape = HORIZON_SHAPE[horizon];
  const ctx = buildScoreCtx(snapshot);
  const out: WeighedContract[] = [];

  (['C', 'P'] as const).forEach(right => {
    shape.otm.forEach((otm, oi) => {
      const dte = shape.dtes[(oi + (right === 'P' ? 1 : 0)) % shape.dtes.length];
      const rawStrike = right === 'C' ? spot * (1 + otm) : spot * (1 - otm);
      out.push(scoreCandidate(snapshot, ctx, horizon, right, rawStrike, dte));
    });
  });

  // Two offsets can land on the same listed contract — keep one of each
  const seen = new Set<string>();
  return out
    .filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort((a, b) => b.composite - a.composite);
}

/** Weigh a single contract the user searched — same engine as the setups scan. */
export function weighContract(
  snapshot: MarketSnapshot,
  right: 'C' | 'P',
  strike: number,
  dte: number
): WeighedContract {
  const ctx = buildScoreCtx(snapshot);
  return scoreCandidate(snapshot, ctx, horizonForDte(dte), right, strike, dte);
}

/**
 * Given a weighed contract, scan its sleeve for the best same-direction
 * alternative and return it when it clears the searched one on both score and
 * reward-to-risk (1σ ÷ breakeven). Null when nothing beats what they've got.
 */
export function betterAlternative(
  snapshot: MarketSnapshot,
  target: WeighedContract
): WeighedContract | null {
  const horizon = horizonForDte(target.dte);
  const rr = (c: WeighedContract) => c.expectedMovePct / Math.max(c.breakevenMovePct, 0.05);
  const targetRr = rr(target);
  const candidate = weighContracts(snapshot, horizon)
    .filter(c => c.right === target.right && c.id !== target.id)
    .sort((a, b) => b.composite - a.composite)[0];
  if (!candidate) return null;
  const better = candidate.composite >= target.composite + 5 && rr(candidate) >= targetRr;
  return better ? candidate : null;
}
