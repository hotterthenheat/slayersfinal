/*
==================================================
  SLAYER TERMINAL - DEFINED-RISK STRUCTURES
  Multi-leg positions whose worst case is arithmetic
  rather than a stop: verticals, condors, butterflies
  and the two straddle-family trades.
==================================================
*/

import { yearsToExpiry } from './optionTime';
import { expiryFor } from './calendar';
import { math } from './mathProvider';
import Simulator from './simulator';
import type { MarketSnapshot } from '../types/market';
import type { OptionRight } from '../types/compass';

/*
  Why this exists as its own engine.

  Every other board on Compass ranks ONE contract, and the whole risk question
  there is "how much of the premium can the clock take". A structure is a
  different instrument: the legs pay for each other, the worst case is known
  before the trade rather than enforced by an exit, and the number that decides
  it is the ratio between what you can lose and what you can make — not a score.

  So nothing here reuses the setup scoring, and none of it is expressed as a
  grade out of 99. What a structure has instead is arithmetic: a debit or a
  credit, a maximum loss, a maximum profit, the breakevens, and the share of the
  terminal distribution that finishes between them. Those are facts, they are
  checkable against the payoff diagram beside them, and they are what the board
  ranks on.
*/

export type StructureKind =
  | 'bull-call'
  | 'bear-put'
  | 'bull-put'
  | 'bear-call'
  | 'iron-condor'
  | 'iron-butterfly'
  | 'long-straddle'
  | 'long-strangle';

export interface StructureLeg {
  right: OptionRight;
  strike: number;
  /** +1 long, -1 short. */
  qty: 1 | -1;
  premium: number;
}

export interface Structure {
  id: string;
  kind: StructureKind;
  label: string;
  ticker: string;
  expiryLabel: string;
  dte: number;
  legs: StructureLeg[];
  /** Positive = you pay. Negative = you are paid. Per contract, in dollars. */
  netDebit: number;
  /** Worst case at expiry, per contract, always a positive number of dollars. */
  maxLoss: number;
  /** Best case at expiry. Infinity for the unbounded straddle family. */
  maxProfit: number;
  /** Underlying prices at which the structure breaks even at expiry. */
  breakevens: number[];
  /** Share of the modelled terminal distribution that finishes in profit, 0-1. */
  probProfit: number;
  /** maxProfit / maxLoss. Infinity where the upside is unbounded. */
  rewardRisk: number;
  /**
   * The volatility every leg was priced at — the name's own, from the
   * simulator. Carried on the structure rather than left implicit because the
   * board states it, and a claim about how something was priced should be
   * inspectable from the thing it priced.
   */
  iv: number;
  /** What the structure needs the underlying to do, in one clause. */
  thesis: string;
  /** The cost that decides it, in one clause. */
  cost: string;
}

/** Shares per contract. */
const MULT = 100;

// ---- pricing --------------------------------------------------------------

/**
 * Leg pricing, from the MATH SEAM (core/mathProvider.ts). Structures are built
 * out of legs, so a spread board that priced on a private copy would disagree
 * with the single-leg board beside it the moment a house model landed. This
 * module carried its own normal CDF and pricer; both are gone.
 */
function bs(spot: number, strike: number, iv: number, dte: number, right: OptionRight): number {
  return Math.max(0.02, math.optionPrice(spot, strike, iv, math.yearsToExpiry(dte), right));
}

/** The seam's normal CDF — the one copy, shared with every other desk. */
const normCdf = (x: number): number => math.normCdf(x);

/**
 * Probability the underlying finishes between `lo` and `hi`, under a lognormal
 * terminal distribution with the same vol and clock the legs were priced on.
 *
 * This is the one number on the board that is a probability, and it is the
 * model's own — not a confidence, not a score wearing a percent sign. An
 * unbounded side is passed as ±Infinity and integrates to the tail.
 */
function probBetween(spot: number, lo: number, hi: number, iv: number, dte: number): number {
  const T = yearsToExpiry(dte);
  const sd = iv * Math.sqrt(T);
  if (sd <= 0) return spot > lo && spot < hi ? 1 : 0;
  const drift = -0.5 * iv * iv * T;
  const z = (k: number) => (Math.log(k / spot) - drift) / sd;
  const below = Number.isFinite(hi) ? normCdf(z(hi)) : 1;
  const above = Number.isFinite(lo) && lo > 0 ? normCdf(z(lo)) : 0;
  return Math.max(0, Math.min(1, below - above));
}

/** Value of the whole structure at expiry, with the underlying at `s`. */
function payoffAt(legs: StructureLeg[], s: number): number {
  return legs.reduce((a, l) => {
    const intrinsic = l.right === 'C' ? Math.max(0, s - l.strike) : Math.max(0, l.strike - s);
    return a + l.qty * intrinsic;
  }, 0);
}

/** Net premium paid (positive) or received (negative), per contract. */
function netPremium(legs: StructureLeg[]): number {
  return legs.reduce((a, l) => a + l.qty * l.premium, 0) * MULT;
}

/**
 * Profit at expiry across a price grid — the payoff diagram, and the source of
 * max loss, max profit and the breakevens.
 *
 * Solving each structure's extremes in closed form would be six special cases
 * that can disagree with the curve drawn beside them. Sampling the same payoff
 * function the chart draws cannot: what the board claims and what the diagram
 * shows are the same array.
 */
export interface PayoffPoint {
  spot: number;
  profit: number;
}

export function payoffCurve(st: Structure, spot: number, points = 121): PayoffPoint[] {
  const lo = spot * 0.75;
  const hi = spot * 1.25;
  const out: PayoffPoint[] = [];
  for (let i = 0; i < points; i++) {
    const s = lo + ((hi - lo) * i) / (points - 1);
    out.push({ spot: s, profit: payoffAt(st.legs, s) * MULT - st.netDebit });
  }
  return out;
}

// ---- construction ---------------------------------------------------------

const KIND_LABEL: Record<StructureKind, string> = {
  'bull-call': 'Bull call spread',
  'bear-put': 'Bear put spread',
  'bull-put': 'Bull put spread',
  'bear-call': 'Bear call spread',
  'iron-condor': 'Iron condor',
  'iron-butterfly': 'Iron butterfly',
  'long-straddle': 'Long straddle',
  'long-strangle': 'Long strangle',
};

function assemble(
  kind: StructureKind,
  ticker: string,
  spot: number,
  iv: number,
  dte: number,
  legs: StructureLeg[]
): Structure {
  const netDebit = Number(netPremium(legs).toFixed(2));

  /*
    Extremes at the KNOTS, breakevens by scan.

    The payoff of a position built from options is piecewise linear, and its only
    kinks are at the strikes. So every maximum and minimum sits on a strike or at
    the far end of the range — evaluating there is exact, where sampling a grid
    is off by however much the grid misses the corner. Measured on an iron
    butterfly whose credit was $1,102: a 2,001-point scan reported a maximum
    profit of $1,092, because the peak lives exactly on the middle strike and
    the grid stepped past it. A headline number that is $10 short of the credit
    the same panel prints two lines above is the kind of disagreement this whole
    pass exists to remove.

    Breakevens still come from the scan, because a zero crossing genuinely falls
    BETWEEN knots and is interpolated rather than landed on.
  */
  const lo = spot * 0.5;
  const hi = spot * 1.5;
  const knots = [lo, ...legs.map(l => l.strike), hi].filter(k => k >= lo && k <= hi);
  const atKnot = knots.map(k => payoffAt(legs, k) * MULT - netDebit);
  const maxProfit = Math.max(...atKnot);
  const maxLoss = Math.min(...atKnot);

  const N = 2001;
  const breakevens: number[] = [];
  let prev: { s: number; p: number } | null = null;
  for (let i = 0; i < N; i++) {
    const s = lo + ((hi - lo) * i) / (N - 1);
    const p = payoffAt(legs, s) * MULT - netDebit;
    if (prev && ((prev.p < 0 && p >= 0) || (prev.p > 0 && p <= 0))) {
      // Linear crossing between the two samples.
      const t = Math.abs(prev.p) / (Math.abs(prev.p) + Math.abs(p) || 1);
      breakevens.push(Number((prev.s + (s - prev.s) * t).toFixed(2)));
    }
    prev = { s, p };
  }

  // The straddle family has no ceiling: its long leg keeps paying past the grid.
  const unbounded = kind === 'long-straddle' || kind === 'long-strangle';
  const profitCap = unbounded ? Infinity : Number(maxProfit.toFixed(2));
  const loss = Number(Math.abs(Math.min(0, maxLoss)).toFixed(2));

  /*
    Probability of profit, from the terminal distribution rather than a guess.

    A structure with two breakevens profits BETWEEN them when the payoff is a
    tent (condors, butterflies, credit spreads) and OUTSIDE them when it is a
    valley (the straddle family). Which one it is comes from the payoff at spot,
    not from the kind — so a structure that is reshaped later cannot desync.
  */
  const atSpot = payoffAt(legs, spot) * MULT - netDebit;
  let probProfit: number;
  if (breakevens.length >= 2) {
    const inner = probBetween(spot, breakevens[0], breakevens[breakevens.length - 1], iv, dte);
    probProfit = atSpot >= 0 ? inner : 1 - inner;
  } else if (breakevens.length === 1) {
    const upper = probBetween(spot, breakevens[0], Infinity, iv, dte);
    probProfit = payoffAt(legs, breakevens[0] * 1.05) * MULT - netDebit >= 0 ? upper : 1 - upper;
  } else {
    probProfit = atSpot >= 0 ? 1 : 0;
  }

  const rewardRisk = loss > 0 && Number.isFinite(profitCap) ? profitCap / loss : Infinity;

  return {
    id: `${ticker}-${kind}-${dte}`,
    kind,
    label: KIND_LABEL[kind],
    ticker,
    expiryLabel: expiryFor(dte).label,
    dte,
    legs,
    netDebit,
    maxLoss: loss,
    maxProfit: profitCap,
    breakevens,
    probProfit: Number(probProfit.toFixed(4)),
    rewardRisk: Number.isFinite(rewardRisk) ? Number(rewardRisk.toFixed(2)) : Infinity,
    iv,
    thesis: thesisFor(kind, ticker, breakevens),
    cost: costFor(kind, netDebit, loss),
  };
}

function thesisFor(kind: StructureKind, ticker: string, be: number[]): string {
  const lo = be[0]?.toFixed(2) ?? '—';
  const hi = be[be.length - 1]?.toFixed(2) ?? '—';
  switch (kind) {
    case 'bull-call':
      return `${ticker} above ${lo} by expiry, and the gain stops at the short strike.`;
    case 'bear-put':
      return `${ticker} below ${hi} by expiry, and the gain stops at the short strike.`;
    case 'bull-put':
      return `${ticker} anywhere above ${lo} at expiry. You keep the credit for being right about a floor.`;
    case 'bear-call':
      return `${ticker} anywhere below ${hi} at expiry. You keep the credit for being right about a ceiling.`;
    case 'iron-condor':
      return `${ticker} finishes between ${lo} and ${hi}. You are paid for the range holding, not for a direction.`;
    case 'iron-butterfly':
      return `${ticker} finishes near the middle strike. The tightest range on the board and the largest credit for it.`;
    case 'long-straddle':
      return `${ticker} moves far enough either way to clear ${lo} or ${hi}. Direction does not matter; size of move does.`;
    case 'long-strangle':
      return `${ticker} moves past ${lo} or ${hi}. Cheaper than the straddle and it needs more.`;
  }
}

function costFor(kind: StructureKind, netDebit: number, maxLoss: number): string {
  if (netDebit < 0) {
    // You are PAID. "Paid $1,102 up front" read as money going out on a
    // structure that collects it.
    return `Collects $${Math.abs(netDebit).toFixed(0)} up front against $${maxLoss.toFixed(0)} of risk — the credit is the whole of the profit.`;
  }
  if (kind === 'long-straddle' || kind === 'long-strangle') {
    return `$${netDebit.toFixed(0)} of premium, all of it at risk, and both legs decay at once.`;
  }
  return `$${netDebit.toFixed(0)} up front, which is also the most you can lose.`;
}

/**
 * Every structure worth showing on one name and expiry.
 *
 * Widths are a share of spot rather than a fixed strike count, for the same
 * reason the scan ladder is: a $2 wing is a third of a cheap name and noise on
 * an expensive one.
 */
export function buildStructures(snapshot: MarketSnapshot, dte: number): Structure[] {
  const { ticker, spot, chain } = snapshot;
  const sorted = [...chain].sort((a, b) => a.strike - b.strike);
  const strikes = sorted.map(r => r.strike);
  if (strikes.length < 4) return [];

  /*
    Legs come off the listed chain, not off a percentage rounded to the grid.

    Rounding a share of spot to the strike increment produces a strike that is
    correctly shaped and does not exist. Measured on the default snapshots: SPY
    lists 489 through 519, and the bear call spread was selling a 529C while the
    iron condor priced both a 479P and a 529C — so two of the eight cards
    derived their risk, reward, breakevens and profit probability from contracts
    nobody can trade. QQQ and AAPL had the same three. Only NVDA, whose grid
    happens to be wide enough, was clean.

    The wings clamp to the widest listed strike now, which is what a desk would
    actually do: take the furthest wing the chain offers.
  */
  const nearestListed = (raw: number): number =>
    strikes.reduce((best, k) => (Math.abs(k - raw) < Math.abs(best - raw) ? k : best), strikes[0]);

  /*
    Volatility is the name's, not a number derived from its price.

    This was `0.18 + |spot % 7| / 100`, which is a shape that looks like an IV
    and is not one: NVDA is configured at 35% and priced at 23.3%, SPY at 15%
    and priced at 24.9%, and the value stepped discontinuously every time spot
    crossed a multiple of seven. Every premium, breakeven, risk/reward figure
    and profit probability on the board hangs off it.
  */
  const iv = Simulator.TICKERS[ticker]?.iv ?? 0.25;

  const atm = nearestListed(spot);
  const near = nearestListed(spot * 1.025);
  const far = nearestListed(spot * 1.05);
  const nearDown = nearestListed(spot * 0.975);
  const farDown = nearestListed(spot * 0.95);

  const leg = (right: OptionRight, strike: number, qty: 1 | -1): StructureLeg => ({
    right,
    strike,
    qty,
    premium: Number(bs(spot, strike, iv, dte, right).toFixed(2)),
  });

  /*
    Clamping to the listed grid can collapse two anchors onto one strike when a
    name's chain is narrow — and a vertical whose legs share a strike is not a
    vertical, it is two contracts that cancel. Those are dropped rather than
    drawn as a flat line with zero width and an infinite reward-to-risk.
  */
  const make = (kind: StructureKind, legs: StructureLeg[], distinct: number[]): Structure | null => {
    if (new Set(distinct).size !== distinct.length) return null;
    return assemble(kind, ticker, spot, iv, dte, legs);
  };

  return [
    make('bull-call', [leg('C', atm, 1), leg('C', near, -1)], [atm, near]),
    make('bear-put', [leg('P', atm, 1), leg('P', nearDown, -1)], [atm, nearDown]),
    make('bull-put', [leg('P', nearDown, 1), leg('P', atm, -1)], [nearDown, atm]),
    make('bear-call', [leg('C', near, -1), leg('C', far, 1)], [near, far]),
    make(
      'iron-condor',
      [leg('P', farDown, 1), leg('P', nearDown, -1), leg('C', near, -1), leg('C', far, 1)],
      [farDown, nearDown, near, far]
    ),
    make(
      'iron-butterfly',
      [leg('P', nearDown, 1), leg('P', atm, -1), leg('C', atm, -1), leg('C', near, 1)],
      [nearDown, atm, near]
    ),
    make('long-straddle', [leg('C', atm, 1), leg('P', atm, 1)], [atm]),
    make('long-strangle', [leg('C', near, 1), leg('P', nearDown, 1)], [near, nearDown]),
  ].filter((s): s is Structure => s !== null);
}
