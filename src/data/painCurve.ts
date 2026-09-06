/*
==================================================
  SLAYER TERMINAL - THE PAIN CURVE (data/painCurve.ts)
  Part 5.6 · "P&L-at-spot curve with the flip spot marked."
==================================================

  NOT MAX PAIN. Classic max pain asks where the OPEN INTEREST pays out
  least at expiry — every contract ever written, whoever holds it, at
  whatever price. It is a settlement statistic and it says nothing about
  who is hurting now.

  This asks a different question of a different population: the people
  who BOUGHT options aggressively today — lifted the offer, paid up — and
  the price they paid. Their P&L is a function of spot right now, not at
  expiry, and the curve is what it would be at every spot the chain
  covers. The place it crosses zero nearest the market is the FLIP SPOT:
  above it (for a call-heavy tape) today's buyers are winning, below it
  they are underwater, and a tape that is underwater sells into strength
  to get out while one that is winning presses. That is the read; max
  pain cannot give it.

  Each (strike, right) population is the one buildStrikeBasis measures —
  same tape, same tolerance — priced at the candidate spot with the desk's
  own pricer at the same tenor and vol the basis was marked at.
*/

import { blackScholesPrice } from '../core/greeks';
import { CONTRACT_MULTIPLIER, buildStrikeBasis, type StrikeBasis } from './costBasis';
import type { FlowPrint } from '../types/trace';

export interface PainPoint {
  spot: number;
  /** Today's aggressive buyers' unrealized P&L if spot were here, dollars. */
  pnl: number;
}

export interface PainCurve {
  points: PainPoint[];
  /** The zero crossing nearest the current spot — null when the curve never crosses. */
  flipSpot: number | null;
  /** P&L at the current spot. */
  now: number;
  /** Contracts behind the curve, both rights. */
  contracts: number;
  /** The populations the curve is made of. */
  legs: StrikeBasis[];
}

/**
 * The curve over the chain's strikes.
 *
 * @param strikes every strike on the chain, any order
 * @param points  how many spots to price between the lowest and highest
 */
export function buildPainCurve(prints: readonly FlowPrint[], strikes: readonly number[], spot: number, dteYears: number, iv: number, points = 61, tolerance = 0.005): PainCurve {
  const empty: PainCurve = { points: [], flipSpot: null, now: 0, contracts: 0, legs: [] };
  if (strikes.length === 0 || !(spot > 0)) return empty;
  const legs: StrikeBasis[] = [];
  for (const k of [...new Set(strikes)]) {
    for (const right of ['C', 'P'] as const) {
      const b = buildStrikeBasis(prints, k, right, spot, dteYears, iv, tolerance);
      if (b.basis !== null && b.contracts > 0) legs.push(b);
    }
  }
  if (legs.length === 0) return empty;

  const lo = Math.min(...strikes);
  const hi = Math.max(...strikes);
  const n = Math.max(3, points);
  const pnlAt = (s: number) => legs.reduce((a, l) => a + l.contracts * (blackScholesPrice(s, l.strike, dteYears, iv, l.right) - (l.basis ?? 0)) * CONTRACT_MULTIPLIER, 0);
  const curve: PainPoint[] = [];
  for (let i = 0; i < n; i++) {
    const s = lo + ((hi - lo) * i) / (n - 1);
    curve.push({ spot: s, pnl: pnlAt(s) });
  }

  /* The crossing nearest spot, by linear interpolation between the two
     sampled points that bracket it. */
  let flipSpot: number | null = null;
  let best = Infinity;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if ((a.pnl <= 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl <= 0)) {
      const t = a.pnl === b.pnl ? 0 : a.pnl / (a.pnl - b.pnl);
      const x = a.spot + t * (b.spot - a.spot);
      if (Math.abs(x - spot) < best) {
        best = Math.abs(x - spot);
        flipSpot = x;
      }
    }
  }

  return {
    points: curve,
    flipSpot,
    now: pnlAt(spot),
    contracts: legs.reduce((a, l) => a + l.contracts, 0),
    legs,
  };
}

/** The sentence under the curve — what it is, and what it is not. */
export function painWords(c: PainCurve, spot: number): string {
  if (c.legs.length === 0) return 'No aggressive buying on the tape yet — nobody has paid up for an option today, so there is no one to be in pain.';
  const side = c.now >= 0 ? 'in profit' : 'underwater';
  const dollars = Math.abs(c.now) >= 1e6 ? `$${(Math.abs(c.now) / 1e6).toFixed(1)}M` : `$${(Math.abs(c.now) / 1e3).toFixed(0)}K`;
  const flip = c.flipSpot === null ? 'and no spot on the chain flips them' : `and they flip at ${c.flipSpot.toFixed(2)} — ${c.flipSpot > spot ? 'above' : 'below'} the market`;
  return `Today’s buyers are ${dollars} ${side} at ${spot.toFixed(2)}, ${flip}. This is their P&L now, not the open interest’s payout at expiry — it is not max pain.`;
}
