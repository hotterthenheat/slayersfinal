/*
==================================================
  SLAYER TERMINAL - MATH PROVIDER SEAM (mathProvider.ts)
  THE ONE PLACE THE APP'S QUANT MATH LIVES, AND THE ONE PLACE IT IS REPLACED.

  ---------------------------------------------------------------------------
  READ THIS FIRST IF YOU ARE DROPPING IN THE REAL MATH
  ---------------------------------------------------------------------------
  Everything below is a SNAPSHOT: placeholder formulas that exist so the UI has
  something to render. They are textbook Black-Scholes and they are not claimed
  to be the house model. To replace them, implement any part of MathProvider and
  register it ONCE at app start:

      import { setMathProvider } from './core/mathProvider';
      import { myMath } from './myRealMath';
      setMathProvider(myMath);                 // whole model
      setMathProvider({ optionPrice: myPrice }) // or just one primitive

  The override is a MERGE, so a partial provider replaces only what it names and
  the snapshot covers the rest. It is also LATE-BOUND: every call site reads
  through the `math` accessor at call time, never a captured import, so a
  provider registered after modules load still reaches every consumer.

  ---------------------------------------------------------------------------
  WHY THIS EXISTS (the thing that would otherwise break the handoff)
  ---------------------------------------------------------------------------
  Before this file the app carried SEVEN copies of the normal CDF and FOUR
  separate Black-Scholes implementations (core/contractScore, core/simulator,
  data/flowtape, components/compass/contractTrackModel). Replacing one of them
  would have overridden roughly a quarter of the terminal while the other three
  kept quietly using their own copy — two panels on one screen disagreeing, which
  is the exact failure this codebase's coherence suites exist to prevent.
  Consolidating them here is what makes "override all of it" true rather than
  aspirational. mathProvider.test.ts proves it: it registers a sentinel provider
  and asserts every pricing surface moves, so a future bypass fails the build.

  ---------------------------------------------------------------------------
  SCOPE — what this seam does and does NOT cover
  ---------------------------------------------------------------------------
  COVERED (portable quant primitives — what a real math library provides):
    probability (normCdf/normPdf), the DTE->years convention, option price, the
    greek vector, IV rank, realized vol, and the dealer $-exposure unit
    conventions.

  NOT COVERED (app-side heuristics that CONSUME these primitives — they inherit
  an override automatically, but their own shape stays in src/data/):
    the higher-order greek surface model (data/greeksmatrix.ts), the flow
    information score (data/informedFlow.ts), the gamma roll-off density
    (data/gammaRolloff.ts), and the surface-QC tolerances
    (data/surfaceIntegrity.ts). These are product models, not math primitives;
    they are named here so the boundary is explicit rather than discovered.

  This module imports TYPES ONLY plus core/optionTime, so it can never cycle
  with the engines that depend on it.
==================================================
*/

import type { ContractGreeks } from '../types/market';
import type { IvRank } from './ivRank';
import { yearsToExpiry as defaultYearsToExpiry } from './optionTime';

export type OptionRightCode = 'C' | 'P';

/**
 * The quant surface the terminal computes against. Every method is a pure
 * function: same inputs, same output, no clock and no global state — that is
 * what lets the desks stay reproducible within a tick.
 *
 * Time is TYEARS everywhere, never a day count. The convention that turns a
 * calendar DTE into years is its own overridable knob (`yearsToExpiry`), so a
 * house model can change the day-count basis without touching the pricer.
 */
export interface MathProvider {
  /** Names the active model. Surfaced in the UI so a screen can say which math
      produced it — 'snapshot' is the placeholder set shipped in this file. */
  readonly id: string;

  /** Annualized risk-free rate used for discounting. */
  readonly riskFreeRate: number;

  // ---- probability primitives ----------------------------------------------
  /** Standard normal CDF. */
  normCdf(x: number): number;
  /** Standard normal PDF. */
  normPdf(x: number): number;

  // ---- time convention -----------------------------------------------------
  /** CALENDAR day count -> year fraction, floored so a 0DTE carries real time. */
  yearsToExpiry(dte: number): number;

  // ---- pricing & greeks ----------------------------------------------------
  /** Theoretical price of one contract. `tYears` is already a year fraction. */
  optionPrice(spot: number, strike: number, ivAnnual: number, tYears: number, right: OptionRightCode): number;
  /**
   * The greek vector for one contract.
   * Conventions the UI depends on: `vega` is per ONE vol point (sigma +0.01),
   * `theta` is per CALENDAR day, `rho` is per one percentage point of rate.
   */
  optionGreeks(spot: number, strike: number, ivAnnual: number, tYears: number, right: OptionRightCode): ContractGreeks;

  // ---- volatility ----------------------------------------------------------
  /** Rank and percentile of `current` within its own history. */
  ivRank(series: readonly number[], current: number): IvRank;
  /**
   * Annualized realized volatility (%) from a close series.
   * `barsPerYear` states the bar width explicitly — 252 for daily closes,
   * 252*390 for 1-minute bars — so the annualization can never be silently wrong.
   */
  realizedVol(closes: readonly number[], barsPerYear: number): number;

  // ---- dealer exposure units ----------------------------------------------
  /** $ gamma per 1% underlying move for a position. */
  gammaDollars(gamma: number, contracts: number, spot: number): number;
  /** $ delta for a position. */
  deltaDollars(delta: number, contracts: number, spot: number): number;
}

// ===========================================================================
// SNAPSHOT IMPLEMENTATION — placeholder math, replace via setMathProvider
// ===========================================================================

/** Abramowitz-Stegun 7.1.26. The single copy; there used to be seven. */
function snapshotNormCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return 0.5 * (1 + Math.sign(x) * erf);
}

function snapshotNormPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** Contracts are 100-multiplier; kept as a named constant so a house model that
    prices a different multiplier can override the unit methods coherently. */
const CONTRACT_MULTIPLIER = 100;

const SNAPSHOT_RATE = 0.045;

/** d1/d2 with the degenerate cases handled once, so no caller divides by zero. */
function dPair(spot: number, strike: number, sig: number, tYears: number, r: number) {
  const T = Math.max(tYears, 0);
  const s = Math.max(sig, 1e-9);
  const sqT = Math.sqrt(T);
  const denom = s * sqT;
  if (!(denom > 0) || !(spot > 0) || !(strike > 0)) return null;
  const d1 = (Math.log(spot / strike) + (r + (s * s) / 2) * T) / denom;
  return { d1, d2: d1 - denom, sqT, s, T };
}

export const SNAPSHOT_MATH: MathProvider = {
  id: 'snapshot',
  riskFreeRate: SNAPSHOT_RATE,

  normCdf: snapshotNormCdf,
  normPdf: snapshotNormPdf,

  yearsToExpiry: defaultYearsToExpiry,

  optionPrice(spot, strike, ivAnnual, tYears, right) {
    const intrinsic = right === 'C' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    const d = dPair(spot, strike, ivAnnual, tYears, SNAPSHOT_RATE);
    // At (or below) zero time, or zero vol, the analytic limit IS intrinsic.
    if (!d) return intrinsic;
    const disc = Math.exp(-SNAPSHOT_RATE * d.T);
    return right === 'C'
      ? spot * snapshotNormCdf(d.d1) - strike * disc * snapshotNormCdf(d.d2)
      : strike * disc * snapshotNormCdf(-d.d2) - spot * snapshotNormCdf(-d.d1);
  },

  optionGreeks(spot, strike, ivAnnual, tYears, right) {
    const d = dPair(spot, strike, ivAnnual, tYears, SNAPSHOT_RATE);
    if (!d) {
      const itm = right === 'C' ? spot > strike : strike > spot;
      return { delta: itm ? (right === 'C' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    const { d1, d2, sqT, s, T } = d;
    const disc = Math.exp(-SNAPSHOT_RATE * T);
    const pdf = snapshotNormPdf(d1);
    const gamma = pdf / (spot * s * sqT);
    const vega = (spot * pdf * sqT) / 100;
    const delta = right === 'C' ? snapshotNormCdf(d1) : snapshotNormCdf(d1) - 1;
    const thetaAnnual =
      right === 'C'
        ? -(spot * pdf * s) / (2 * sqT) - SNAPSHOT_RATE * strike * disc * snapshotNormCdf(d2)
        : -(spot * pdf * s) / (2 * sqT) + SNAPSHOT_RATE * strike * disc * snapshotNormCdf(-d2);
    const rho =
      right === 'C'
        ? (strike * T * disc * snapshotNormCdf(d2)) / 100
        : (-strike * T * disc * snapshotNormCdf(-d2)) / 100;
    return {
      delta,
      gamma,
      theta: thetaAnnual / 365,
      vega,
      rho,
      // 2nd order, analytic — same convention the simulator's chain uses.
      vanna: (-pdf * d2) / s,
      charm: -pdf * (SNAPSHOT_RATE / (s * sqT) - d2 / (2 * T)),
      vomma: (vega * d1 * d2) / s,
    };
  },

  ivRank(series, current) {
    if (!series.length) return { rank: 50, percentile: 50 };
    let min = Infinity;
    let max = -Infinity;
    let below = 0;
    for (const v of series) {
      if (v < min) min = v;
      if (v > max) max = v;
      if (v <= current) below += 1;
    }
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const rank = max > min ? ((current - min) / (max - min)) * 100 : 50;
    return {
      rank: Math.round(clamp(rank)),
      percentile: Math.round(clamp((below / series.length) * 100)),
    };
  },

  realizedVol(closes, barsPerYear) {
    if (closes.length < 3) return 0;
    let sumSq = 0;
    let n = 0;
    for (let i = 1; i < closes.length; i++) {
      const a = closes[i - 1];
      const b = closes[i];
      if (a > 0 && b > 0) {
        const r = Math.log(b / a);
        sumSq += r * r;
        n += 1;
      }
    }
    if (n === 0) return 0;
    return Math.sqrt(sumSq / n) * Math.sqrt(barsPerYear) * 100;
  },

  gammaDollars(gamma, contracts, spot) {
    return gamma * contracts * CONTRACT_MULTIPLIER * spot * spot * 0.01;
  },

  deltaDollars(delta, contracts, spot) {
    return delta * contracts * CONTRACT_MULTIPLIER * spot;
  },
};

// ===========================================================================
// REGISTRY — late-bound so an override reaches modules that already loaded
// ===========================================================================

let active: MathProvider = SNAPSHOT_MATH;

/**
 * Install a model. Partial providers MERGE over the snapshot, so a house file
 * that only implements pricing keeps the snapshot's vol and unit helpers.
 * Returns the id now in force.
 */
export function setMathProvider(provider: Partial<MathProvider>): string {
  active = { ...active, ...provider, id: provider.id ?? (provider === SNAPSHOT_MATH ? 'snapshot' : 'custom') };
  return active.id;
}

/** Restore the shipped placeholder math. Used by tests to isolate. */
export function resetMathProvider(): void {
  active = SNAPSHOT_MATH;
}

/** Which model is answering right now — for honest UI labelling. */
export function mathSourceId(): string {
  return active.id;
}

/** True while the app is running on placeholder math rather than a house model. */
export function isSnapshotMath(): boolean {
  return active.id === 'snapshot';
}

/**
 * THE ACCESSOR EVERY CALL SITE USES.
 *
 * Each method forwards to whatever is registered AT CALL TIME. Importing a bare
 * function instead would capture the snapshot at module-load and silently ignore
 * a later override — the one mistake that would make this whole seam a lie.
 */
export const math: MathProvider = {
  get id() {
    return active.id;
  },
  get riskFreeRate() {
    return active.riskFreeRate;
  },
  normCdf: x => active.normCdf(x),
  normPdf: x => active.normPdf(x),
  yearsToExpiry: dte => active.yearsToExpiry(dte),
  optionPrice: (s, k, iv, t, r) => active.optionPrice(s, k, iv, t, r),
  optionGreeks: (s, k, iv, t, r) => active.optionGreeks(s, k, iv, t, r),
  ivRank: (series, current) => active.ivRank(series, current),
  realizedVol: (closes, barsPerYear) => active.realizedVol(closes, barsPerYear),
  gammaDollars: (g, c, s) => active.gammaDollars(g, c, s),
  deltaDollars: (d, c, s) => active.deltaDollars(d, c, s),
};
