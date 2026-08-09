/*
==================================================
  SLAYER TERMINAL - CONTRACT WEIGHER (contractScore.ts)
  Compass's scale. For weeklies, swings and LEAPS it
  prices real candidates (Black-Scholes), then weighs
  the math (breakeven vs expected move, theta burden),
  the tape (flow + dark-pool posture), and the story
  into one composite: what's worth buying
  and what isn't — with the reason attached.
==================================================
*/

/*
  `dayKey`/`hRange` used to be imported here and this module has stopped needing
  them: its only two hashed quantities were the base IV and the IV rank, and
  both were numbers the reader was told were measurements. Nothing else on the
  Weigher is drawn — every factor comes off the chain, the tape, the dark-pool
  view.
*/
import Simulator from './simulator';
import { expiryFor } from './calendar';
import { yearsToExpiry } from './optionTime';
import { math } from './mathProvider';
import { buildDarkPoolView } from '../data/darkpool';
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
  /**
   * What this contract's vol costs relative to the name's own baseline, in
   * percent: `+30` is paying 30% more vol than the ticker usually carries,
   * `-20` is paying 20% less.
   *
   * This replaced `ivRank`, which was a daily hash in 12–92 with no connection
   * to the IV printed beside it. With the pricing IV anchored to the name, the
   * two sat three inches apart and disagreed out loud — a header reading
   * "IV 12%" under a factor row reading "IV rank 82 — premium is expensive".
   * A percentile also needs a distribution over time to be a percentile, and
   * this engine has no IV history to take one from; a ratio against the name's
   * baseline is a quantity it can actually compute.
   */
  ivPremiumPct: number;
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
    blurb: '2–6 week holds — the balanced sleeve: math and flow both get a vote.',
  },
  {
    key: 'LEAPS',
    label: 'LEAPS',
    blurb: '12+ months out — buy volatility cheap and the story right; decay barely votes.',
  },
];

// ---- Black-Scholes ------------------------------------------------------------

export interface BsOut {
  price: number;
  delta: number;
  /** Per-day theta, absolute dollars */
  thetaDay: number;
}

/**
 * The ONE option pricer the desks quote through — now a thin adapter over the
 * MATH SEAM (core/mathProvider.ts) rather than its own copy of Black-Scholes.
 *
 * data/compass.ts (the setups board and the chain) used to carry a normal-shaped
 * estimator that disagreed with this by up to ~2× on the same contract;
 * estimatePremium delegates here, so every surface quotes one mid
 * (compassCoherence.test.ts). The two also floored a 0DTE differently, which is
 * settled in core/optionTime.ts and now expressed as math.yearsToExpiry.
 *
 * What stays HERE rather than in the seam: the $0.02 quote floor. That is a
 * market convention (an option does not quote below a penny-ish tick), not a
 * property of the model, so replacing the math must not silently remove it.
 */
export const QUOTE_FLOOR = 0.02;

export function blackScholes(spot: number, strike: number, ivAnnual: number, dte: number, right: 'C' | 'P'): BsOut {
  const t = math.yearsToExpiry(dte);
  const g = math.optionGreeks(spot, strike, ivAnnual, t, right);
  return {
    price: Math.max(math.optionPrice(spot, strike, ivAnnual, t, right), QUOTE_FLOOR),
    delta: g.delta,
    thetaDay: g.theta,
  };
}

// ---- candidate generation --------------------------------------------------------

const HORIZON_SHAPE: Record<Horizon, { dtes: number[]; otm: number[] }> = {
  // % OTM offsets per horizon — lottos hug spot on 0–1 DTE, LEAPS reach for cheap deltas
  LOTTO: { dtes: [0, 1], otm: [0, 0.003, 0.006, 0.011] },
  WEEKLIES: { dtes: [2, 5, 7], otm: [0, 0.01, 0.02, 0.035] },
  SWINGS: { dtes: [21, 30, 45], otm: [0, 0.02, 0.045, 0.07] },
  LEAPS: { dtes: [365, 480], otm: [-0.15, -0.07, 0, 0.08] },
};

const WEIGHTS: Record<Horizon, Record<string, number>> = {
  // 0DTE: the math is a coin-flip, so the tape (flow) and decay/liquidity carry the vote
  // The news lean is gone (no news wire on any feed tier). Each horizon's
  // remaining five weights are renormalised to sum to 1 so the composite still
  // spans 0-100 — the news weight is not dropped as dead weight, it is
  // redistributed proportionally across the survivors.
  LOTTO: { math: 0.17, decay: 0.255, vol: 0.106, flow: 0.299, liq: 0.17 },
  WEEKLIES: { math: 0.261, decay: 0.283, vol: 0.087, flow: 0.239, liq: 0.13 },
  SWINGS: { math: 0.262, decay: 0.167, vol: 0.167, flow: 0.238, liq: 0.166 },
  LEAPS: { math: 0.231, decay: 0.051, vol: 0.359, flow: 0.154, liq: 0.205 },
};

// Theta scored against a horizon-realistic ceiling — 0DTE burns a huge % of
// premium per day, so it needs its own scale or every lotto reads as a zero.
const DECAY_CEILING: Record<Horizon, number> = { LOTTO: 250, WEEKLIES: 30, SWINGS: 3.5, LEAPS: 0.8 };

function expiryLabel(dte: number): string {
  return expiryFor(dte).label;
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
  /** The name's own volatility — the reference every vol read on the desk is against. */
  nameIv: number;
  baseIv: number;
  trendUp: boolean;
  rsi: number;
  step: number;
}

function buildScoreCtx(snapshot: MarketSnapshot): ScoreCtx {
  const { ticker, spot, chain, indicators } = snapshot;
  const dp = buildDarkPoolView(snapshot);
  /*
    The level options are priced at is the NAME's, not this module's opinion of
    it.

    This read `0.18 + (squeeze ? -0.03 : 0.02) + hRange(ticker-day-iv, 0, 0.25)`
    — a daily hash in 0.20–0.45 that never looked at the ticker the snapshot
    came from. Every other pricer in the app reads `Simulator.TICKERS[t].iv`
    (0.15 on SPY, 0.35 on NVDA), so the Weigher and the board were quoting the
    same contract off two different volatilities, and the gap moved with the
    calendar rather than with anything a reader could see.

    Measured on 2026-08-05, SPY 500C 0DTE with spot at 500.06: the board said
    $1.40 and the Weigher $3.39 — a 2.4× disagreement between two panels on one
    screen. `compassCoherence.test.ts` bounds that ratio at 0.5–2, and this is
    the day the hash drifted far enough to trip it; the defect was there on every
    other day too, just inside the band.

    The squeeze term is left exactly as it was. It is a real signal about
    compressed range and it is not what was wrong — only the level was. It stays
    additive, which means it is worth proportionally more on a low-IV name than
    a high-IV one; that is a separate question and not one this fix should
    answer silently.
  */
  const nameIv = Simulator.TICKERS[ticker]?.iv ?? 0.25;
  const baseIv = Math.max(0.12, chain.length > 0 ? nameIv + (indicators.squeeze ? -0.03 : 0.02) : nameIv);
  const trendUp = indicators.ema9 >= indicators.ema21;
  const rsi = indicators.rsi;
  // Strike increment from the chain grid — candidates stay on listed strikes
  // even past the chain window's edge (LEAPS reach further OTM than it holds).
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const step = sorted.length > 1 ? Math.abs(sorted[1].strike - sorted[0].strike) : Math.max(spot * 0.005, 0.5);
  return { dp, nameIv, baseIv, trendUp, rsi, step };
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
  const { dp, nameIv, baseIv, trendUp, rsi, step } = ctx;

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
  const baseOi = node ? (right === 'C' ? node.callOI.value : node.putOI.value) : 500;
  const oiCount = Math.max(50, Math.round(baseOi * Math.exp((-Math.abs(strike - (node?.strike ?? strike)) / spot) * 24)));
  const spreadPct = clamp((6 - Math.log10(Math.max(oiCount, 10)) * 1.4) * (dte > 180 ? 1.5 : 1), 0.4, 6);

  // Time floors at half a SESSION so a 0DTE still carries a real 1σ move —
  // one convention, shared with the scan engine. See core/optionTime.ts.
  const tYears = yearsToExpiry(dte);
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

  /*
    What you are paying for volatility, against what this name normally carries.

    `iv` here is the priced volatility — the name's baseline, plus the squeeze
    adjustment, plus the strike's skew — so on the money it is roughly the
    baseline and out on the wings it is meaningfully above it. Dividing by the
    baseline gives a number the panel can defend: `-20` means this contract's
    vol is a fifth cheaper than the name's own, `+45` means you are paying
    nearly half again for the wing.

    The old form was `100 - ivRank`, and `ivRank` was `hRange(ticker-day-ivr,
    12, 92)` — a hash. It moved with the date and with nothing on screen, and
    once the pricing IV was anchored to the name it started contradicting the
    header out loud: "IV 12%" three inches above "IV rank 82 — premium is
    expensive". The `LEAPS ? 0 : 18` term is inherited unchanged and not
    re-derived here; it is not what was wrong.
  */
  // One rounding, used by the sentence below and by the field the card renders,
  // so the prose and the number can never disagree about the same IV.
  const ivPct = Number((iv * 100).toFixed(1));
  const ivPremiumPct = Math.round((iv / nameIv - 1) * 100);
  const volScore = Math.round(clamp(62 - ivPremiumPct * 0.9 + (horizon === 'LEAPS' ? 0 : 18), 4, 96));
  const volDetail =
    ivPremiumPct >= 25
      ? `${ivPct}% IV is ${ivPremiumPct}% over what ${ticker} normally carries — you're paying up for this strike, and vol crush works against longs.`
      : ivPremiumPct <= -8
        ? `${ivPct}% IV is ${Math.abs(ivPremiumPct)}% under ${ticker}'s own — you're not overpaying for volatility here.`
        : `${ivPct}% IV is within a few points of what ${ticker} normally carries — vol is neither the reason to take this nor the reason to skip it.`;

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
    ivPct,
    ivPremiumPct,
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
      const dte = shape.dtes[oi % shape.dtes.length];
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
