/*
==================================================
  SLAYER TERMINAL - THE ODDS (core/outcomes.ts)
  Part 4 · "EV, POP, and tail-aware utility shown as
  distinct numbers with distinct meanings — the fixture
  proof shows utility can reject a +EV trade; the UI
  must make that legible." And for same-day: "total-loss
  probability as the PRIMARY readout, EV secondary,
  position cap shown."
==================================================

  FOUR NUMBERS, FOUR QUESTIONS. They are computed from ONE distribution so
  they can never disagree with each other, and each answers something the
  others do not:

    P(total loss)  how often the contract expires worthless
    POP            how often it is worth more than you paid, at expiry
    EV             what it pays on average, in dollars per contract
    Utility        EV minus the average loss WHEN it loses — the number
                   that can say no to a trade EV says yes to

  ── THE DISTRIBUTION, AND WHY EV NEEDS A VIEW ──────────────────────────────

  Spot at expiry is lognormal at the contract's own implied vol, over the
  contract's own calendar life, with the same rate the Weigher prices with.
  That is the market's distribution — the one the premium was set against —
  and under it a long option's expected value is, by construction, about
  zero less the friction of getting out. That is not a bug in the engine; it
  is what "fairly priced" means. So at the market's own odds the EV line
  reads negative for every contract on the desk, and it should.

  The Weigher has a VIEW: the six-factor weigh. Its verdict is a claim that
  the tape, the flow and the news lean one way. The desk turns that lean
  into a TILT of the distribution's centre — at most ±MAX_TILT_SIGMA of one
  expected move, in the trade's direction when the weigh is strong and
  against it when the weigh is weak — and the EV is computed there. The tilt
  is printed beside the EV, and the at-market EV beside it, so a reader can
  see that every dollar of positive EV is the view's doing.

  ── UTILITY IS THE ONE THAT CAN SAY NO ───────────────────────────────────

  The partner's v1 utility is EV − 1.0 × ES, both in dollars, where ES is the
  expected loss over the losing outcomes. A long option loses its whole
  premium often, so ES sits near the premium and utility is negative for
  most tickets — which is the honest read on buying lottery-shaped payoffs:
  the average win has to be large enough to pay for the average loss, not
  just to nudge the mean above zero. When EV is positive and utility is not,
  the desk says so in words; that gap is the whole reason the number exists.

  ── EVERYTHING IS CLOSED FORM ────────────────────────────────────────────

  With a lognormal terminal price every figure here is a Black–Scholes-
  shaped expectation, so nothing is integrated numerically: a step function
  under a quadrature rule is wrong by a grid cell at the strike, and the
  first version of this file was, by half a percent. With G(x) the expected
  payoff of the same option struck at x, discounted to today's dollars, and
  Kw the breakeven strike:

    POP        = P(S_T beyond Kw)
    E[win]     = G(Kw)                       (profit over the paying outcomes)
    E[loss]    = allIn − G(K) + G(Kw)         (loss over the losing outcomes)
    EV         = G(K) − allIn  = E[win] − E[loss]

  Discounting matters on a year-out contract: undiscounted, a fairly priced
  LEAPS shows a few hundred dollars of "EV" that is only the interest on
  the premium. In today's dollars a fair price has EV of exactly minus the
  exit friction, which is the sentence the desk prints.

  ── THE DISTRIBUTION IS CALIBRATED TO THE PREMIUM ────────────────────────

  The IV the desk prints is rounded to a tenth of a point and the mid to a
  cent, and on a same-day contract those two roundings are worth more than
  the exit friction. Read at the printed IV, a fairly priced ticket showed
  "+$1 at market", which is noise wearing a sign. So the vol the odds are
  read at is SOLVED from the mid — the σ at which this model's own expected
  payoff, discounted, is the premium — and the at-market EV is then minus
  the friction to the cent, by construction rather than by luck. The printed
  IV seeds the search and is the fallback when no σ can reproduce the mid
  (a price under intrinsic, which the desk's chain never produces).

  ── THE SAME-DAY CAP ─────────────────────────────────────────────────────

  A same-day ticket goes to zero more often than not. The cap is a sizing
  rule, not a forecast: risk no more than SAMEDAY_RISK_FRACTION of the book
  on one ticket, so that the run of total losses the odds promise cannot
  take the book with it. It is read against the book size in Settings; with
  no book size set it is printed per $10,000 of book, which is a rate, not a
  guess.

  ── WHAT IS NOT HERE ─────────────────────────────────────────────────────

  Fat tails, vol clustering, jumps. The lognormal under-counts exactly the
  moves an option buyer pays for, so every tail figure here is too tight.
  The read says so where it is shown.
*/

import { CONTRACT_MULTIPLIER, normCdf, type ContractVerdict } from './contractScore';

/** The desk's rate — the one contractScore prices with. */
const R = 0.045;

/** How far the weigh may move the distribution's centre, in σ. */
export const MAX_TILT_SIGMA = 0.35;

/** Same-day tickets: at most this share of the book on one contract. */
export const SAMEDAY_RISK_FRACTION = 0.01;

/** The rate the cap is printed at when no book size is set. */
export const BOOK_UNIT = 10_000;

export interface OutcomeRead {
  right: 'C' | 'P';
  /** Years, floored at half a day the way the pricer floors it. */
  years: number;
  /** The vol the odds were read at — solved from the mid (see header). */
  ivUsed: number;
  /** σ√T — one expected move, as a fraction of spot. */
  sigmaMove: number;
  /** The view, in σ. Positive is in the trade's favour. */
  tiltSigma: number;
  /** Exit friction per share — half the round-trip spread. */
  exitCost: number;
  /** Per share: what you pay plus what it costs to get out. */
  allIn: number;
  pTotalLoss: number;
  pop: number;
  /** Dollars per contract, under the desk's tilted view. */
  ev: number;
  /** Dollars per contract, with no tilt — the market's own odds. */
  evAtMarket: number;
  /** Expected loss over the losing outcomes, dollars per contract. */
  es: number;
  utility: number;
  /** EV says yes and utility says no. */
  utilityRejects: boolean;
  /** Average payout when it pays, dollars per contract. */
  avgWin: number;
}

/** The weigh's lean, in σ. Symmetric about a middling weigh; a verdict of
    FADE never tilts in the trade's favour, whatever the composite says. */
export function tiltFor(composite: number, verdict: ContractVerdict): number {
  const lean = Math.max(-1, Math.min(1, (composite - 50) / 50));
  const tilt = lean * MAX_TILT_SIGMA;
  return verdict === 'FADE' ? Math.min(0, tilt) : tilt;
}

/* ln(S_T / S) ~ N(mu, s²). The two primitives everything else is built from. */

/** P(S_T ≤ x). */
function below(spot: number, x: number, mu: number, s: number): number {
  if (x <= 0) return 0;
  return normCdf((Math.log(x / spot) - mu) / s);
}

/** E[(S_T − x)⁺] for a call, E[(x − S_T)⁺] for a put — per share. */
function expectedPayoff(spot: number, x: number, right: 'C' | 'P', mu: number, s: number): number {
  if (x <= 0) return right === 'C' ? spot * Math.exp(mu + (s * s) / 2) : 0;
  const d2 = (mu - Math.log(x / spot)) / s;
  const d1 = d2 + s;
  const forward = spot * Math.exp(mu + (s * s) / 2);
  return right === 'C' ? forward * normCdf(d1) - x * normCdf(d2) : x * normCdf(-d2) - forward * normCdf(-d1);
}

function odds(
  spot: number,
  strike: number,
  right: 'C' | 'P',
  mu: number,
  s: number,
  allIn: number,
  disc: number
): { pTotalLoss: number; pop: number; ev: number; es: number; avgWin: number } {
  const breakeven = right === 'C' ? strike + allIn : strike - allIn;
  const pTotalLoss = right === 'C' ? below(spot, strike, mu, s) : 1 - below(spot, strike, mu, s);
  const pop = right === 'C' ? 1 - below(spot, breakeven, mu, s) : below(spot, breakeven, mu, s);
  const gK = disc * expectedPayoff(spot, strike, right, mu, s);
  const gW = disc * expectedPayoff(spot, breakeven, right, mu, s);
  const ev = gK - allIn;
  const expectedLoss = Math.max(0, allIn - gK + gW);
  const pLoss = 1 - pop;
  return {
    pTotalLoss,
    pop,
    ev: ev * CONTRACT_MULTIPLIER,
    es: pLoss > 1e-12 ? (expectedLoss / pLoss) * CONTRACT_MULTIPLIER : 0,
    avgWin: pop > 1e-12 ? (gW / pop) * CONTRACT_MULTIPLIER : 0,
  };
}

/**
 * The σ at which the model's discounted expected payoff equals the mid.
 * Bisection on [0.01, 5]; `seed` is returned when the mid is not
 * reproducible (under discounted intrinsic, or no premium at all).
 */
export function impliedSigma(spot: number, strike: number, right: 'C' | 'P', years: number, mid: number, seed: number): number {
  if (!(mid > 0)) return seed;
  const disc = Math.exp(-R * years);
  const priceAt = (iv: number) => disc * expectedPayoff(spot, strike, right, (R - (iv * iv) / 2) * years, iv * Math.sqrt(years));
  let lo = 0.01,
    hi = 5;
  if (priceAt(lo) > mid || priceAt(hi) < mid) return seed;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (priceAt(m) < mid) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * The odds on one long contract, from the Weigher's own inputs.
 *
 * `dte` is CALENDAR days (what the Weigher prices with), `iv` a fraction,
 * `spreadPct` the round-trip spread as a % of the premium, `tilt` in σ
 * (see `tiltFor`).
 */
export function outcomeRead(
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  right: 'C' | 'P',
  mid: number,
  spreadPct: number,
  tilt: number
): OutcomeRead {
  const years = Math.max(dte, 0.5) / 365;
  const ivUsed = impliedSigma(spot, strike, right, years, mid, iv);
  const sigmaMove = ivUsed * Math.sqrt(years);
  const exitCost = (mid * spreadPct) / 200;
  const allIn = mid + exitCost;
  const drift = (R - (ivUsed * ivUsed) / 2) * years;
  const disc = Math.exp(-R * years);
  const direction = right === 'C' ? 1 : -1;

  const view = odds(spot, strike, right, drift + direction * tilt * sigmaMove, sigmaMove, allIn, disc);
  const market = odds(spot, strike, right, drift, sigmaMove, allIn, disc);

  const utility = view.ev - 1.0 * view.es;
  return {
    right,
    years,
    ivUsed,
    sigmaMove,
    tiltSigma: tilt,
    exitCost,
    allIn,
    pTotalLoss: view.pTotalLoss,
    pop: view.pop,
    ev: view.ev,
    evAtMarket: market.ev,
    es: view.es,
    utility,
    utilityRejects: view.ev > 0 && utility < 0,
    avgWin: view.avgWin,
  };
}

/** The total-loss probability written out the textbook way — N(−d2) for a
    call — so a proof can hold the engine's primitives against it. */
export function totalLossClosedForm(spot: number, strike: number, dte: number, iv: number, right: 'C' | 'P'): number {
  const years = Math.max(dte, 0.5) / 365;
  const sq = iv * Math.sqrt(years);
  const d2 = (Math.log(spot / strike) + (R - (iv * iv) / 2) * years) / sq;
  return right === 'C' ? normCdf(-d2) : normCdf(d2);
}

export interface PositionCap {
  /** Dollars the rule allows on this ticket. */
  riskDollars: number;
  contracts: number;
  /** Whether it was read against a real book or the $10k unit. */
  perUnit: boolean;
}

/** Same-day sizing: SAMEDAY_RISK_FRACTION of the book, in whole contracts. */
export function samedayCap(mid: number, book: number | null): PositionCap {
  const base = book && book > 0 ? book : BOOK_UNIT;
  const riskDollars = base * SAMEDAY_RISK_FRACTION;
  const perContract = Math.max(0.01, mid) * CONTRACT_MULTIPLIER;
  return { riskDollars, contracts: Math.floor(riskDollars / perContract), perUnit: !(book && book > 0) };
}

/** One sentence that puts EV and utility side by side, in words. */
export function oddsSentence(o: OutcomeRead): string {
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  if (o.utilityRejects) {
    return `Positive on average, negative after the tail: it pays ${pct(o.pop)} of the time, but the average loss when it loses is bigger than the average gain justifies. Size it small or pass — this is the case utility exists to catch.`;
  }
  if (o.ev <= 0) {
    return `The desk's view does not lift this above the market's own odds — it pays ${pct(o.pop)} of the time and loses money on average once you pay to get out.`;
  }
  return `Pays ${pct(o.pop)} of the time and clears the tail: the average win covers the average loss with room. Positive on both readings.`;
}
