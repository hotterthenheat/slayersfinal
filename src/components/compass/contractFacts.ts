/*
==================================================
  SLAYER TERMINAL - CONTRACT FACTS (contractFacts.ts)
  What a contract costs, what it has to do, and what
  the clock takes. Derived, never drawn.
==================================================
*/

import type { Setup } from '../../types/compass';

/**
 * Shares per equity option contract. It was declared privately in both
 * SetupCompare and ContractWeigher; one definition now, since every dollar
 * figure on this desk is a premium multiplied by it.
 */
export const CONTRACT_MULTIPLIER = 100;

/*
  This replaced a confidence percentage, and the reason is worth keeping.

  `Setup.confidence` is `clamp((score - 55) * 2.1, 5, 98)` — a linear function of
  the score with no second input. Rendered as a meter at the top of the Read
  panel it looked like a model's independent opinion, so a user reading "score
  97, confidence 88%" believed two things agreed when they were one thing said
  twice. SetupScanCard had already worked this out and deliberately omitted it,
  which left the desk both featuring and excluding the same number depending on
  which pane you were in.

  Everything below is a fact about the contract that the score does not contain:
  what it costs, where it starts making money, how much of what you paid is
  already real, what one session takes, and what the book charges to get in and
  out. None of it is an opinion, and none of it can be recovered from the score.
*/

export interface ContractFact {
  label: string;
  value: string;
  /** One line of plain English, only where the number needs one. */
  note?: string;
  /** Amber where the fact is a cost or a risk worth pausing on. Never green. */
  warn?: boolean;
}

/** Underlying price at which the contract breaks even at expiry. */
export function breakevenPrice(setup: Setup): number {
  return setup.right === 'C' ? setup.strike + setup.mid : setup.strike - setup.mid;
}

/** Dollars of the premium that are already exercise value. */
export function intrinsicOf(setup: Setup, spot: number): number {
  return Math.max(0, setup.right === 'C' ? spot - setup.strike : setup.strike - spot);
}

const usd = (v: number): string => (Math.abs(v) >= 100 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`);

/**
 * The read on a contract, as facts.
 *
 * `spot` is the underlying the setup was priced against — pass the same number
 * the engine used, not a fresher one, or the breakeven distance disagrees with
 * the premium sitting beside it.
 */
export function contractFacts(setup: Setup, spot: number): ContractFact[] {
  const be = breakevenPrice(setup);
  const intrinsic = intrinsicOf(setup, spot);
  const extrinsic = Math.max(0, setup.mid - intrinsic);
  // Distance to breakeven, always expressed as a journey the underlying has to
  // make rather than a signed offset — a put whose breakeven is BELOW spot still
  // needs price to travel, and a minus sign there reads as "already there".
  const beMovePct = ((setup.right === 'C' ? be - spot : spot - be) / spot) * 100;
  // greeks.theta is premium per contract-unit per session; ×100 is the contract.
  const thetaDay = Math.abs(setup.greeks.theta) * CONTRACT_MULTIPLIER;
  const spreadCost = Math.max(0, setup.ask - setup.bid) * CONTRACT_MULTIPLIER;
  const cost = setup.mid * CONTRACT_MULTIPLIER;
  const extrinsicShare = setup.mid > 0 ? extrinsic / setup.mid : 0;
  const thetaShare = extrinsic > 0 ? thetaDay / (extrinsic * CONTRACT_MULTIPLIER) : 0;

  return [
    {
      label: 'Cost',
      value: usd(cost),
      note: `${usd(setup.mid)} mid × ${CONTRACT_MULTIPLIER} shares · the whole of it is at risk`,
    },
    {
      label: 'Breakeven',
      value: `$${be.toFixed(2)}`,
      note:
        beMovePct <= 0
          ? `${setup.ticker} is already through it`
          : `${setup.ticker} has to travel ${beMovePct.toFixed(2)}% to reach it`,
      // The contract needs more than a one-sigma move just to get to flat.
      warn: beMovePct > setup.expectedMovePct,
    },
    {
      label: 'Time value',
      value: usd(extrinsic * CONTRACT_MULTIPLIER),
      note:
        intrinsic > 0
          ? `${usd(intrinsic * CONTRACT_MULTIPLIER)} of the price is exercise value and survives expiry`
          : 'none of the price is exercise value — all of it expires',
      warn: extrinsicShare > 0.95,
    },
    {
      label: 'Decay',
      value: `${usd(thetaDay)}/session`,
      note:
        thetaShare > 0
          ? `${(thetaShare * 100).toFixed(0)}% of the time value, per session held`
          : 'no time value left to lose',
      warn: thetaShare > 0.25,
    },
    {
      label: 'Delta',
      value: Math.abs(setup.greeks.delta).toFixed(2),
      // Delta is NOT probability. It is a hedge ratio the market prices, and it
      // approximates the odds of finishing in the money — stated as an
      // approximation, because calling it a probability is a claim the model
      // does not support.
      // The DIRECTION has to be in the sentence. A put's delta is negative and
      // the magnitude alone reads as "gains when the underlying rises", which is
      // the opposite of the trade.
      note: `gains ${usd(Math.abs(setup.greeks.delta) * CONTRACT_MULTIPLIER)} per $1 ${setup.right === 'C' ? 'rise' : 'fall'} in ${setup.ticker} · roughly the market's odds it finishes in the money`,
    },
    {
      label: 'Spread',
      value: usd(spreadCost),
      note: `round trip across the book · ${setup.liquidityLabel.toLowerCase()} at ${setup.liquiditySpread}`,
      warn: cost > 0 && spreadCost / cost > 0.05,
    },
  ];
}
