/*
==================================================
  SLAYER TERMINAL - THE LEAPS READ (core/leaps.ts)
  Part 4 · "LEAPS: early-exercise flag UI, PV(dividend)
  vs extrinsic comparison, theta carry, stock-
  replacement efficiency."
==================================================

  A LEAPS CONTRACT IS NOT A LONG WEEKLY. The four questions that decide it
  are questions no shorter tenor asks: is someone going to take this
  contract away from me early, what is the clock going to cost me over a
  year if nothing moves, and — the reason most LEAPS get bought at all — how
  much stock exposure am I renting per dollar, and at what rent. None of
  those figures existed on the desk. The Weigher scored a LEAPS on the same
  factors as a same-day ticket, which is grading a mortgage on its
  intraday spread.

  ── EARLY EXERCISE, AND WHY THE FLAG IS APPROXIMATE ───────────────────────

  The desk prices with a CONTINUOUS dividend yield (core/carry.ts), which
  stands in for the discrete ex-dates a real payer has. That is the right
  model for a delta and the wrong one for an exercise decision, which is
  made just before ONE ex-date against the extrinsic left at THAT moment.
  So the flag here is the standing condition — the present value of the
  yield over the contract's remaining life against its extrinsic today —
  and it is labelled as a warning rather than a verdict. Note also the
  direction: with the rate above the yield, an American call's carry
  benefit usually beats the dividend loss, and this flag rarely fires for
  calls at the desk's defaults. That is correct, not a bug.

  For a put the pull is INTEREST, not dividends: a deep in-the-money put is
  worth more exercised today than held, once the interest the strike would
  earn over the remaining life exceeds what is left of the extrinsic.

  ── THETA CARRY IS A CEILING, NOT A FORECAST ─────────────────────────────

  Today's theta times the days remaining overstates the bill — theta is
  not constant, and a contract cannot lose more extrinsic than it has. The
  figure is capped at the extrinsic and presented as "if nothing moves",
  which is the question a LEAPS holder is actually asking about the clock.

  ── STOCK REPLACEMENT ────────────────────────────────────────────────────

  The trade most LEAPS calls are: control the delta of a hundred shares for
  a fraction of the capital. Three numbers say whether that is a good
  rent. What notional the contract controls (delta × 100 × spot), what it
  costs (mid × 100), and the DRAG — the extrinsic, annualised, as a
  percentage of the notional it controls. That last one is the rate you
  are paying to not own the stock, and it is the number to hold against
  the yield you are forgoing and the margin rate you are avoiding.
*/

import { getCarry } from './carry';
import { blackScholesGreeks, blackScholesPrice } from './greeks';
import { TRADING_DAYS } from './higherGreeks';
import { CONTRACT_MULTIPLIER } from './contractScore';

export type EarlyExercisePull = 'none' | 'dividend' | 'interest';

export interface LeapsRead {
  right: 'C' | 'P';
  dte: number;
  /** Per share. */
  intrinsic: number;
  extrinsic: number;
  /** PV of the continuous yield over the remaining life, per share. */
  pvDividends: number;
  /** K(1 − e^(−rT)) — the interest a put's strike would earn if exercised now. */
  pvInterestOnStrike: number;
  earlyExercise: EarlyExercisePull;
  earlyExerciseNote: string;
  /** Per share per session, negative. Finite-differenced off the desk's own pricer. */
  thetaDay: number;
  /** Extrinsic the clock takes over the remaining life if nothing moves — capped at extrinsic. */
  thetaCarry: number;
  thetaCarryPctOfPremium: number;
  /** |delta| — the share of a hundred shares this contract moves like. */
  deltaAbs: number;
  notionalControlled: number;
  cost: number;
  leverage: number;
  /** What owning the shares outright would tie up, minus what this costs. */
  capitalFreed: number;
  /** Extrinsic annualised, as a % of the notional controlled — the rent. */
  carryDragPctPerYear: number;
}

/** The desk's chain floors tenor at a third of a session; so does this. */
const yearsOf = (dte: number) => Math.max(dte, 0.35) / TRADING_DAYS;

/**
 * Everything the Weigher needs to say about a LEAPS, from the same pricer
 * and carry every other greek on the desk reads.
 *
 * `carry` can be handed in so a proof can move the yield without touching
 * the desk-wide seam; the desk itself passes nothing and reads the seam.
 */
export function leapsRead(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  right: 'C' | 'P',
  mid: number,
  carry: { r: number; q: number } = getCarry()
): LeapsRead {
  const T = yearsOf(dte);
  const { r, q } = carry;
  const g = blackScholesGreeks(spot, strike, T, iv, r, q);
  const deltaAbs = Math.abs(right === 'C' ? g.deltaCall : g.deltaPut);

  const intrinsic = Math.max(0, right === 'C' ? spot - strike : strike - spot);
  const extrinsic = Math.max(0, mid - intrinsic);

  const pvDividends = spot * (1 - Math.exp(-q * T));
  const pvInterestOnStrike = strike * (1 - Math.exp(-r * T));

  let earlyExercise: EarlyExercisePull = 'none';
  let earlyExerciseNote = 'Nothing is pulling this contract to an early exercise — the extrinsic is worth more than what exercising would capture.';
  if (right === 'C' && intrinsic > 0 && pvDividends > extrinsic) {
    earlyExercise = 'dividend';
    earlyExerciseNote = `The dividends left in the life (${pvDividends.toFixed(2)}/sh) exceed the extrinsic (${extrinsic.toFixed(2)}/sh). A holder captures more by exercising before an ex-date than by keeping the option — expect it to be taken early, and treat the yield as part of the return.`;
  } else if (right === 'P' && intrinsic > 0 && pvInterestOnStrike > extrinsic) {
    earlyExercise = 'interest';
    earlyExerciseNote = `Interest on the strike over the remaining life (${pvInterestOnStrike.toFixed(2)}/sh) exceeds the extrinsic (${extrinsic.toFixed(2)}/sh). A deep put is worth more exercised now than held — expect early assignment if short, and a truncated life if long.`;
  }

  /* Theta by finite difference off the same pricer — one session forward,
     not a third formula for the same quantity. */
  const priceNow = blackScholesPrice(spot, strike, T, iv, right, r, q);
  const priceNext = blackScholesPrice(spot, strike, Math.max(0.35 / TRADING_DAYS, T - 1 / TRADING_DAYS), iv, right, r, q);
  const thetaDay = Math.min(0, priceNext - priceNow);
  const thetaCarry = Math.min(extrinsic, Math.abs(thetaDay) * Math.max(0, dte));
  const thetaCarryPctOfPremium = mid > 0 ? (thetaCarry / mid) * 100 : 0;

  const notionalControlled = deltaAbs * CONTRACT_MULTIPLIER * spot;
  const cost = Math.max(0, mid) * CONTRACT_MULTIPLIER;
  const leverage = cost > 0 ? notionalControlled / cost : 0;
  const capitalFreed = CONTRACT_MULTIPLIER * spot - cost;
  const carryDragPctPerYear =
    notionalControlled > 0 && dte > 0 ? ((extrinsic * CONTRACT_MULTIPLIER * (TRADING_DAYS / dte)) / notionalControlled) * 100 : 0;

  return {
    right,
    dte,
    intrinsic,
    extrinsic,
    pvDividends,
    pvInterestOnStrike,
    earlyExercise,
    earlyExerciseNote,
    thetaDay,
    thetaCarry,
    thetaCarryPctOfPremium,
    deltaAbs,
    notionalControlled,
    cost,
    leverage,
    capitalFreed,
    carryDragPctPerYear,
  };
}

export const EARLY_EXERCISE_WORDS: Record<EarlyExercisePull, { label: string; tone: 'neutral' | 'warn' }> = {
  none: { label: 'No early-exercise pull', tone: 'neutral' },
  dividend: { label: 'Dividend pull — may be exercised early', tone: 'warn' },
  interest: { label: 'Interest pull — may be assigned early', tone: 'warn' },
};
