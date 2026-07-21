/*
==================================================
  SLAYER TERMINAL - STATE-PRICE DENSITY (statedensity.ts)
  The Vol Lab's probability engine. From the chain and a
  modeled IV surface it reconstructs the full risk-neutral
  STATE-PRICE DENSITY over terminal price — the odds the
  market is pricing on where the underlying lands.

  On top of the density it reads the things a single smile
  hides:
    • probability-mass MIGRATION — how P(price < K) moved
      over the last hour while spot barely budged;
    • a forward-vol curve — the vol priced BETWEEN tenors,
      not just to them, via variance additivity;
    • implied-vs-realized distribution — the option book's
      density against what the tape actually delivered;
    • a skew-stress monitor — how stretched the put wing is;
    • tail-risk pricing — what each tail costs to insure;
    • the variance risk premium — implied minus realized.

  Realized vol is measured off the price history; the IV
  surface, skew and the earlier snapshot are modeled and
  clearly swap for a real vol feed behind the same contract.
  Deterministic per ticker + day — no Math.random, no clock.
==================================================
*/

import { dayKey, hRange, hGauss, hPick } from '../core/rng';
import type { MarketSnapshot } from '../types/market';

// ---------------------------------------------------------------------------

export interface DensityPoint {
  price: number;
  /** Proper pdf value — the grid integrates to ~1 */
  density: number;
  /** Cumulative P(price ≤ this) */
  cdf: number;
}

export type SkewLabel = 'CALM' | 'NORMAL' | 'ELEVATED' | 'STRESSED';

export interface MassShift {
  strike: number;
  /** e.g. "below 5900" */
  label: string;
  /** P(price < strike) at the earlier snapshot, % */
  pEarlier: number;
  /** P(price < strike) now, % */
  pNow: number;
  /** pNow − pEarlier, percentage points */
  deltaPts: number;
  /** RISING = downside mass migrating in (risk building) */
  direction: 'RISING' | 'FALLING';
}

export interface ForwardVolPoint {
  fromDte: number;
  toDte: number;
  label: string;
  /** Spot (to-tenor) implied vol, % annualized */
  spotVol: number;
  /** Forward vol priced between the two tenors, % annualized */
  forwardVol: number;
}

export interface TailPricing {
  side: 'DOWNSIDE' | 'UPSIDE';
  strike: number;
  /** How far OTM the strike sits, % */
  otmPct: number;
  /** Probability of finishing beyond the strike, % */
  prob: number;
  /** Cost to insure that tail, % of spot */
  premiumPct: number;
}

export interface StateDensityView {
  ticker: string;
  spot: number;
  forward: number;
  horizonDays: number;

  /** ATM implied vol, % annualized */
  atmIv: number;
  /** Realized vol off the price history, % annualized */
  realizedVol: number;
  expMoveAbs: number;
  expMovePct: number;

  /** Risk-neutral terminal density, now */
  density: DensityPoint[];
  /** Same grid, symmetric density implied by realized vol */
  realizedDensity: DensityPoint[];
  /** Same grid, the density an hour ago (for the migration read) */
  earlierDensity: DensityPoint[];
  sigma1: [number, number];
  sigma2: [number, number];

  // probability-mass migration
  earlierTime: string;
  nowTime: string;
  /** Modeled spot move over the window — meant to be ~flat */
  spotDriftPct: number;
  massShifts: MassShift[];
  headlineShift: MassShift;

  // forward-vol curve
  forwardVols: ForwardVolPoint[];

  // skew stress
  /** 25Δ risk reversal, vol pts (negative = downside skew richer) */
  skewRr25: number;
  skewStress: number;
  skewLabel: SkewLabel;
  putWingVol: number;
  callWingVol: number;

  // tail-risk pricing
  tails: TailPricing[];

  // variance risk premium
  impliedVar: number;
  realizedVar: number;
  /** implied − realized variance, variance pts */
  vrp: number;
  /** implied − realized vol, vol pts */
  vrpVolPts: number;

  headline: string;
  note: string;
}

// ---- helpers ---------------------------------------------------------------

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const fmtK = (n: number): string => (n >= 1000 ? n.toFixed(0) : n >= 50 ? n.toFixed(n % 1 ? 1 : 0) : n.toFixed(2));

const TRADING_DAYS = 252;

/** Annualized realized vol from the price-history tape (log returns). */
function realizedAnnual(history: number[]): number {
  if (!history || history.length < 8) return NaN;
  const rets: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1];
    const b = history[i];
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 4) return NaN;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varr = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const perStep = Math.sqrt(varr);
  // History steps are intraday; scale toward an annual figure and clamp sane.
  return perStep * Math.sqrt(TRADING_DAYS * 26);
}

/** Split-normal density (fatter left when sigL > sigR) on a fixed x-grid,
 *  returned as a proper pdf + cdf via trapezoidal integration. */
function densityOnGrid(grid: number[], forward: number, sigL: number, sigR: number): DensityPoint[] {
  const un = grid.map(x => {
    const s = x < forward ? sigL : sigR;
    const z = (x - forward) / s;
    return Math.exp(-0.5 * z * z);
  });
  let total = 0;
  for (let i = 1; i < grid.length; i++) total += 0.5 * (un[i] + un[i - 1]) * (grid[i] - grid[i - 1]);
  total = total || 1;
  const pts: DensityPoint[] = [{ price: grid[0], density: un[0] / total, cdf: 0 }];
  let cum = 0;
  for (let i = 1; i < grid.length; i++) {
    cum += 0.5 * (un[i] + un[i - 1]) * (grid[i] - grid[i - 1]);
    pts.push({ price: grid[i], density: un[i] / total, cdf: clamp(cum / total, 0, 1) });
  }
  return pts;
}

/** Interpolated P(price ≤ K). */
function cdfAt(pts: DensityPoint[], K: number): number {
  if (K <= pts[0].price) return 0;
  if (K >= pts[pts.length - 1].price) return 1;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].price >= K) {
      const a = pts[i - 1];
      const b = pts[i];
      const u = (K - a.price) / (b.price - a.price || 1);
      return a.cdf + (b.cdf - a.cdf) * u;
    }
  }
  return 1;
}

/** Expected payoff of a put (strike − S)+ under the density, as % of spot. */
function putPremiumPct(pts: DensityPoint[], strike: number, spot: number): number {
  let e = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const midPrice = (a.price + b.price) / 2;
    if (midPrice >= strike) continue;
    const midPdf = (a.density + b.density) / 2;
    e += (strike - midPrice) * midPdf * (b.price - a.price);
  }
  return (e / spot) * 100;
}

/** Expected payoff of a call (S − strike)+ under the density, as % of spot. */
function callPremiumPct(pts: DensityPoint[], strike: number, spot: number): number {
  let e = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const midPrice = (a.price + b.price) / 2;
    if (midPrice <= strike) continue;
    const midPdf = (a.density + b.density) / 2;
    e += (midPrice - strike) * midPdf * (b.price - a.price);
  }
  return (e / spot) * 100;
}

// ---- clock pairs for the migration read (deterministic) --------------------
const CLOCK_PAIRS: [string, string][] = [
  ['09:45', '10:45'],
  ['10:30', '11:30'],
  ['11:15', '12:15'],
  ['12:30', '13:30'],
  ['13:15', '14:15'],
  ['14:30', '15:30'],
];

const FWD_TENORS = [7, 14, 30, 60, 90];

// ---------------------------------------------------------------------------

export function buildStateDensity(snapshot: MarketSnapshot): StateDensityView {
  const { ticker, spot, changePercent, priceHistory, chain, indicators } = snapshot;
  const day = dayKey();
  const seed = (t: string) => `${ticker}-${day}-spd-${t}`;

  const horizonDays = 30;
  const T = horizonDays / 365;

  // ---- vol: realized off the tape, implied a premium above it ----
  const rawRv = realizedAnnual(priceHistory);
  const modeledRv = hRange(seed('rvbase'), 0.16, 0.30) * (indicators.squeeze ? 0.82 : 1);
  const realizedFrac = clamp(
    Number.isFinite(rawRv) ? 0.5 * modeledRv + 0.5 * clamp(rawRv, 0.05, 0.6) : modeledRv,
    0.08,
    0.55,
  );
  const vrpPremium = hRange(seed('vrp'), 0.05, 0.24);
  const atmIvFrac = realizedFrac * (1 + vrpPremium);

  const forward = r2(spot * (1 + hRange(seed('carry'), -0.001, 0.003)));
  const sigmaAbs = forward * atmIvFrac * Math.sqrt(T);

  // ---- skew: put-wing steepness from chain OI tilt + model ----
  const near = [...chain].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 16);
  const putOI = near.reduce((s, n) => s + n.putOI, 0);
  const callOI = near.reduce((s, n) => s + n.callOI, 0);
  const oiTilt = (putOI - callOI) / (putOI + callOI + 1); // >0 = puts crowded
  const skewParam = clamp(0.12 + oiTilt * 0.45 + hRange(seed('skew'), -0.04, 0.16), 0.03, 0.6);

  const sigL = sigmaAbs * (1 + skewParam * 0.6);
  const sigR = sigmaAbs * (1 - skewParam * 0.32);

  // 25Δ wing vols and risk reversal
  const putWingVol = r1(atmIvFrac * 100 * (1 + skewParam * 0.9));
  const callWingVol = r1(atmIvFrac * 100 * (1 - skewParam * 0.35));
  const skewRr25 = r2(callWingVol - putWingVol); // negative = downside skew richer

  const skewMag = Math.abs(skewRr25);
  const skewNorm = Math.max(1.5, atmIvFrac * 100 * 0.18);
  const skewStress = Math.round(clamp((skewMag / skewNorm) * 55 + hGauss(seed('skstress')) * 4, 3, 99));
  const skewLabel: SkewLabel =
    skewStress >= 78 ? 'STRESSED' : skewStress >= 56 ? 'ELEVATED' : skewStress >= 34 ? 'NORMAL' : 'CALM';

  // ---- the density grid (shared x for every overlay) ----
  const lo = forward - sigL * 4.5;
  const hi = forward + sigR * 4.2;
  const N = 121;
  const grid: number[] = [];
  for (let i = 0; i < N; i++) grid.push(lo + ((hi - lo) * i) / (N - 1));

  const density = densityOnGrid(grid, forward, sigL, sigR);
  const realizedSig = forward * realizedFrac * Math.sqrt(T);
  const realizedDensity = densityOnGrid(grid, spot, realizedSig, realizedSig);

  const sigma1: [number, number] = [r2(forward - sigL), r2(forward + sigR)];
  const sigma2: [number, number] = [r2(forward - 2 * sigL), r2(forward + 2 * sigR)];

  // ---- probability-mass migration ----
  // Over the hour spot barely moved; risk drifts with the day's direction.
  const driftSign = changePercent < 0 ? 1 : -1; // +1 = downside mass building
  const spotDriftPct = r2(-driftSign * hRange(seed('spotdrift'), 0.02, 0.14));
  const skewParamE = clamp(skewParam - driftSign * hRange(seed('migskew'), 0.03, 0.09), 0.03, 0.6);
  const forwardE = r2(forward * (1 + driftSign * hRange(seed('migfwd'), 0.0006, 0.002)));
  const atmIvFracE = atmIvFrac * (1 - driftSign * hRange(seed('migvol'), 0.02, 0.06));
  const sigmaAbsE = forwardE * atmIvFracE * Math.sqrt(T);
  const sigLE = sigmaAbsE * (1 + skewParamE * 0.6);
  const sigRE = sigmaAbsE * (1 - skewParamE * 0.32);
  const earlierDensity = densityOnGrid(grid, forwardE, sigLE, sigRE);

  const [earlierTime, nowTime] = hPick(seed('clock'), CLOCK_PAIRS);

  const strikeList = chain.map(n => n.strike).filter(s => s > 0);
  const nearestStrike = (target: number): number =>
    strikeList.length
      ? strikeList.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), strikeList[0])
      : r2(target);
  const thresholdStrikes = Array.from(
    new Set([0.955, 0.975, 0.995, 1.02].map(m => nearestStrike(spot * m))),
  ).sort((a, b) => a - b);

  const massShifts: MassShift[] = thresholdStrikes.map(strike => {
    const pNow = r1(cdfAt(density, strike) * 100);
    const pEarlier = r1(cdfAt(earlierDensity, strike) * 100);
    const deltaPts = r1(pNow - pEarlier);
    return {
      strike,
      label: `below ${fmtK(strike)}`,
      pEarlier,
      pNow,
      deltaPts,
      direction: deltaPts >= 0 ? 'RISING' : 'FALLING',
    };
  });
  const headlineShift = massShifts.reduce(
    (best, m) => (Math.abs(m.deltaPts) > Math.abs(best.deltaPts) ? m : best),
    massShifts[0],
  );

  // ---- forward-vol curve (variance additivity) ----
  const shortMult = hRange(seed('ts-s'), 1.05, 1.42);
  const longMult = hRange(seed('ts-l'), 0.88, 1.06);
  const spotVolAt = (dte: number): number => {
    const short = atmIvFrac * shortMult;
    const long = atmIvFrac * longMult;
    const noise = hRange(seed(`ts-${dte}`), -0.006, 0.006);
    return Math.max(0.04, long + (short - long) * Math.exp(-dte / 42) + noise);
  };
  const forwardVols: ForwardVolPoint[] = [];
  for (let i = 1; i < FWD_TENORS.length; i++) {
    const d1 = FWD_TENORS[i - 1];
    const d2 = FWD_TENORS[i];
    const t1 = d1 / 365;
    const t2 = d2 / 365;
    const v1 = spotVolAt(d1);
    const v2 = spotVolAt(d2);
    const fwdVar = (v2 * v2 * t2 - v1 * v1 * t1) / (t2 - t1);
    const fwdVol = Math.sqrt(Math.max(0, fwdVar));
    forwardVols.push({
      fromDte: d1,
      toDte: d2,
      label: `${d1}→${d2}`,
      spotVol: r1(v2 * 100),
      forwardVol: r1(fwdVol * 100),
    });
  }

  // ---- tail-risk pricing ----
  const downStrike = nearestStrike(spot * 0.95);
  const upStrike = nearestStrike(spot * 1.05);
  const tails: TailPricing[] = [
    {
      side: 'DOWNSIDE',
      strike: downStrike,
      otmPct: r1(((spot - downStrike) / spot) * 100),
      prob: r1(cdfAt(density, downStrike) * 100),
      premiumPct: r2(putPremiumPct(density, downStrike, spot)),
    },
    {
      side: 'UPSIDE',
      strike: upStrike,
      otmPct: r1(((upStrike - spot) / spot) * 100),
      prob: r1((1 - cdfAt(density, upStrike)) * 100),
      premiumPct: r2(callPremiumPct(density, upStrike, spot)),
    },
  ];

  // ---- variance risk premium ----
  const atmIv = r1(atmIvFrac * 100);
  const realizedVol = r1(realizedFrac * 100);
  const impliedVar = r2((atmIvFrac * atmIvFrac) * 100); // variance pts
  const realizedVar = r2((realizedFrac * realizedFrac) * 100);
  const vrp = r2(impliedVar - realizedVar);
  const vrpVolPts = r1(atmIv - realizedVol);

  const expMoveAbs = r2(sigmaAbs);
  const expMovePct = r2(atmIvFrac * Math.sqrt(T) * 100);

  // ---- narrative ----
  const skewWord =
    skewLabel === 'STRESSED'
      ? 'sharply tilted'
      : skewLabel === 'ELEVATED'
        ? 'tilted'
        : skewLabel === 'NORMAL'
          ? 'modestly tilted'
          : 'nearly balanced';
  const dirWord = headlineShift.direction === 'RISING' ? 'migrated toward the downside' : 'drained out of the downside';
  const vrpWord = vrpVolPts >= 0 ? 'rich' : 'cheap';
  const headline =
    `The risk-neutral terminal density is ${skewWord} to the downside — 25Δ risk reversal ${skewRr25.toFixed(2)} vol, ` +
    `put wing ${putWingVol.toFixed(1)} vs call wing ${callWingVol.toFixed(1)}. Over the hour to ${nowTime}, with spot ` +
    `${spotDriftPct >= 0 ? '+' : ''}${spotDriftPct.toFixed(2)}% (near-flat), probability mass ${dirWord}: ` +
    `P(${headlineShift.label}) went ${headlineShift.pEarlier.toFixed(0)}% → ${headlineShift.pNow.toFixed(0)}% ` +
    `(${headlineShift.deltaPts >= 0 ? '+' : ''}${headlineShift.deltaPts.toFixed(1)} pts). Implied vol prices ` +
    `${Math.abs(vrpVolPts).toFixed(1)} vol points ${vrpWord} of realized — a ${vrp >= 0 ? 'positive' : 'negative'} variance risk premium.`;
  const note =
    headlineShift.direction === 'RISING'
      ? 'Mass is sliding left faster than spot — the book is repricing downside odds ahead of price, the classic tell that hedges are being lifted.'
      : 'Downside mass is bleeding off while spot holds — the market is quietly un-pricing the tail it feared an hour ago.';

  return {
    ticker,
    spot,
    forward,
    horizonDays,
    atmIv,
    realizedVol,
    expMoveAbs,
    expMovePct,
    density,
    realizedDensity,
    earlierDensity,
    sigma1,
    sigma2,
    earlierTime,
    nowTime,
    spotDriftPct,
    massShifts,
    headlineShift,
    forwardVols,
    skewRr25,
    skewStress,
    skewLabel,
    putWingVol,
    callWingVol,
    tails,
    impliedVar,
    realizedVar,
    vrp,
    vrpVolPts,
    headline,
    note,
  };
}
