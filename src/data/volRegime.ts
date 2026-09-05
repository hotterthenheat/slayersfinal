/*
==================================================
  SLAYER TERMINAL - VOL REGIME (data/volRegime.ts)
  Part 14 · "VIX term structure, realized vol, IV
  rank, variance risk premium, risk-reversal skew.
  Feeds Compass eligibility."
==================================================

  FIVE THINGS WERE ASKED FOR AND THEY DO NOT ALL EXIST. What follows is
  what was measured before any of it was drawn, because a vol dashboard is
  the single easiest place in a terminal to print a confident number that
  means nothing.

  ── WHAT IS REAL ─────────────────────────────────────────────────────────

  REALIZED VOL is real and it is the only figure here computed from price
  rather than from a model. Close-to-close log returns over the session
  closes the engine actually holds, annualised at 252. Measured over the
  four names that carry a full candle history: SPY 10.4%, QQQ 11.4%,
  AAPL 13.1%, NVDA 20.3% at twenty sessions. Those separate properly and
  they track the names' character, which is the test.

  ATM IMPLIED VOL is real for all 22 names in the roster — the engine has a
  per-name level and `skewIv` gives the surface around it. Measured at 30
  days: 16.3% to 59.6% across the roster.

  THE VARIANCE RISK PREMIUM is implied minus realized and is therefore real
  exactly where BOTH are. Measured: SPY +5.8, QQQ +8.1, AAPL +8.6,
  NVDA +17.7 points. Positive everywhere, which is what the premium does in
  a real market too, and it scales with the name.

  THE RISK REVERSAL — 25-delta put IV minus 25-delta call IV — is real and,
  to my surprise when I measured it, NAME-DIFFERENTIATED. `skewIv`'s
  steepness is a function of tenor alone, so I expected a constant once
  divided by ATM. It is not: a high-vol name's 25-delta strikes sit much
  further from spot, so the quadratic wing contributes differently. Measured
  at 30 days: 0.35 to 4.81 vol points, and 0.022 to 0.081 normalised —
  a spread of nearly 4x. That is a live read, not a decoration.

  ── WHAT IS NOT REAL, AND IS THEREFORE NOT DRAWN AS THOUGH IT WERE ───────

  IV RANK — the 52-week one, "where does today's IV sit in its own year" —
  CANNOT BE COMPUTED HERE and no amount of arranging the available data
  changes that. The engine holds 22 sessions of price history and ONE
  implied level per name per tenor; there is no IV time series to take a
  percentile of. A rank computed off what exists would be a rank over the
  calendar, since the only thing moving ATM IV through a session is the
  term-structure lift as days-to-expiry shrinks. So `IV_RANK_UNAVAILABLE`
  names the missing feed and the tile prints that instead of a number.

  WHAT REPLACES IT IS A DIFFERENT STATISTIC HONESTLY LABELLED. A
  CROSS-SECTIONAL percentile — where this name's IV sits among the 22 names
  TODAY — is computable, is genuinely useful, and is not the same question.
  It is called `crossSectionalIvPct` and the surface says "vs the roster",
  never "IV rank".

  THE TERM STRUCTURE is computable and is deliberately NOT given a regime
  verdict. `skewIv`'s term lift is `1 + 0.35·e^(−12t)`, which carries no
  name in it: measured, the front/back ratio is 1.3074 on all 22 names, to
  four decimals, always. A "backwardation" chip driven by that would light
  identically on every name forever — a tile that cannot disagree with
  itself is not reporting, it is decoration. The slope is still exposed,
  because it is true and a reader comparing tenors wants it; it just does
  not vote.

  ── WHAT THE REGIME VERDICT IS BUILT FROM ────────────────────────────────

  Only the two figures that both exist and differentiate: realized vol and
  the premium over it. A name whose realized vol is high AND whose premium
  is thin is a different market from one that is quiet with a fat premium,
  and that difference is what a Compass eligibility gate actually wants.
*/

import Simulator from '../core/simulator';
import { blackScholesGreeks } from '../core/greeks';
import { skewIv } from './optionChain';
/* The desk's own year, taken from core rather than restated: atr.ts and
   higherGreeks.ts already divide by it, and a third private 252 is how the
   annualisations here quietly stop matching the ones on the chart. */
import { TRADING_DAYS } from '../core/higherGreeks';

/** One RTH session of one-minute bars — the stride between daily closes. */
const BARS_PER_SESSION = 390;

/*
  A realized-vol window needs enough returns for the estimate to mean
  anything. Ten is the floor the literature uses for a "short" window and
  is where the standard error of a vol estimate stops being larger than the
  differences it is meant to detect. Below it, `realizedVol` returns null
  rather than a number with a wide invisible error bar around it.
*/
export const MIN_RETURNS = 10;

/** Windows the desk reads, in sessions. */
export const RV_WINDOWS = [5, 10, 20] as const;
export type RvWindow = (typeof RV_WINDOWS)[number];

/** Why the 52-week rank is absent — printed, not hidden. */
export const IV_RANK_UNAVAILABLE =
  'A 52-week IV rank needs a year of daily implied levels. This desk holds one implied level per tenor and 22 sessions of price, so a rank over it would be a rank over the calendar. The percentile beside it is across the roster today, which is a different question.';

/**
 * Daily closes from the intraday bars — the last bar of each session.
 *
 * Walked BACKWARDS from the most recent bar so the newest close is always a
 * real session end. Walking forwards from bar zero would drop the partial
 * session at the front and, worse, put the boundary in a different place on
 * every name depending on how much history it happens to hold.
 */
export function dailyCloses(ticker: string): number[] {
  const bars = Simulator.peekCandles(ticker);
  if (!bars || bars.length === 0) return [];
  const out: number[] = [];
  for (let i = bars.length - 1; i >= 0; i -= BARS_PER_SESSION) out.unshift(bars[i].close);
  return out;
}

/**
 * Annualised close-to-close realized vol over `sessions` sessions.
 *
 * Null when the history is too short — which is the ORDINARY case here, not
 * the exception: 18 of the 22 roster names are quoted without a seeded
 * candle history (the engine seeds a name on first open, deliberately, so
 * the terminal does not forward-simulate twenty books at load). A surface
 * reading this must handle null on most rows.
 */
export function realizedVol(ticker: string, sessions: RvWindow = 20): number | null {
  const closes = dailyCloses(ticker);
  if (closes.length < 2) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (!(closes[i] > 0) || !(closes[i - 1] > 0)) continue;
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const w = rets.slice(-sessions);
  if (w.length < MIN_RETURNS) return null;
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  /* Sample variance (n−1). With ten to twenty returns the population
     divisor understates vol by a few percent, which is exactly the size of
     the differences this is meant to show. */
  const varr = w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1);
  return Math.sqrt(varr * TRADING_DAYS);
}

/** ATM implied vol at a tenor, in decimal. */
export function atmIv(spot: number, baseIv: number, dte: number): number {
  return skewIv(baseIv, spot, spot, Math.max(dte, 0.35) / TRADING_DAYS);
}

/*
  THE STRIKE AT A TARGET DELTA, found by scan rather than by inversion.

  Delta is monotone in strike, so a bisection would be faster — but the IV
  at each strike comes from the smile, which means the function being
  inverted is delta(K, σ(K)) and its monotonicity is a property of the smile
  rather than of Black-Scholes. A scan cannot be tripped by a smile steep
  enough to un-monotone it; it just returns the closest strike, which is the
  honest answer to "which strike is nearest 25 delta" either way.

  The grid is 0.2% of spot, so the strike is located to well inside a real
  board's increment on every name in the roster.
*/
function strikeAtDelta(spot: number, baseIv: number, t: number, target: number, put: boolean): number {
  let best = spot;
  let bestD = Infinity;
  const step = spot * 0.002;
  for (let k = spot * 0.4; k <= spot * 1.8; k += step) {
    const g = blackScholesGreeks(spot, k, t, skewIv(baseIv, spot, k, t));
    const d = put ? Math.abs(Math.abs(g.deltaPut) - target) : Math.abs(g.deltaCall - target);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** The delta the wings are read at — the market's own convention. */
export const RR_DELTA = 0.25;

/**
 * 25-delta risk reversal, in VOL POINTS: put wing minus call wing.
 *
 * Positive is the equity-index normal — downside bid over upside. The sign
 * convention is stated because the FX market quotes the opposite one and a
 * reader who brings that habit here would read every name backwards.
 */
export function riskReversal(spot: number, baseIv: number, dte: number): number {
  const t = Math.max(dte, 0.35) / TRADING_DAYS;
  const kp = strikeAtDelta(spot, baseIv, t, RR_DELTA, true);
  const kc = strikeAtDelta(spot, baseIv, t, RR_DELTA, false);
  return skewIv(baseIv, spot, kp, t) - skewIv(baseIv, spot, kc, t);
}

/** Front tenor over back tenor. See the header: true, but it does not vote. */
export function termSlope(spot: number, baseIv: number, frontDte = 1, backDte = 60): number {
  return atmIv(spot, baseIv, frontDte) / atmIv(spot, baseIv, backDte);
}

export type RegimeVerdict = 'quiet' | 'ordinary' | 'strained' | 'unknown';

export interface VolRegimeRow {
  ticker: string;
  spot: number;
  /** ATM implied at the read tenor, decimal. */
  iv: number;
  /** Realized over each window — null where the history is too short. */
  rv: Record<RvWindow, number | null>;
  /** iv − rv[20], null when rv is. */
  premium: number | null;
  /** 25Δ put IV − 25Δ call IV, vol points. */
  rr: number;
  /** Front/back ATM ratio. Informational only. */
  slope: number;
  /** Where this name's IV sits among the roster TODAY, 0–100. Not a rank. */
  crossSectionalIvPct: number;
  verdict: RegimeVerdict;
}

/*
  THE THRESHOLDS, AND WHY THEY ARE RATIOS RATHER THAN LEVELS.

  A fixed "20% realized is high" is wrong on both ends of this roster: it
  calls NVDA strained on an ordinary day and could never call SPY strained
  at all. What actually separates a strained tape from a quiet one is
  realized vol RELATIVE TO WHAT IS IMPLIED — the same premium the desk is
  already computing.

  A premium near zero or negative means the market is realising everything
  it is being charged for and more, which is the strained state; a fat
  premium means the opposite.

  AND THE BAND IS SET TO A REAL MARKET, NOT TO THIS DEMO. Measured, the
  four names with a history land at premium ratios of 0.36 (SPY), 0.42
  (QQQ), 0.39 (AAPL) and 0.47 (NVDA) — every one inside the ordinary band,
  so ON TODAY'S ENGINE THE VERDICT IS 'ordinary' EVERYWHERE IT CAN BE
  COMPUTED. That is stated rather than fixed. The reason is structural: the
  simulator's realized vol is a fairly fixed fraction of the implied level
  it was generated from (measured 0.53 to 0.64 across the four), so the
  premium ratio cannot travel far by construction.

  Widening or moving the cuts until the demo showed three colours would be
  tuning a market read to make a screenshot livelier — the thresholds would
  then mean nothing when a real feed arrived. So they stay where a real
  market puts them, the code is exercised at every branch by the proof, and
  the surface says what would have to happen for the read to change.
*/
export const STRAINED_RATIO = 0.15;
export const QUIET_RATIO = 0.55;

export function verdictFor(iv: number, rv: number | null): RegimeVerdict {
  if (rv === null || !(iv > 0)) return 'unknown';
  const ratio = (iv - rv) / iv;
  if (ratio <= STRAINED_RATIO) return 'strained';
  if (ratio >= QUIET_RATIO) return 'quiet';
  return 'ordinary';
}

export const VERDICT_WORDS: Record<RegimeVerdict, { label: string; note: string }> = {
  quiet: {
    label: 'Quiet',
    note: 'Realized vol is running well under what options are charging. Premium sellers are being paid; a breakout has to overcome a market that is not moving.',
  },
  ordinary: {
    label: 'Ordinary',
    note: 'Implied sits over realized by about the usual margin. Nothing here argues for or against a directional idea.',
  },
  strained: {
    label: 'Strained',
    note: 'Realized vol has caught up with implied — the market is delivering everything it is being charged for. Structure breaks more easily here.',
  },
  unknown: {
    label: 'No read',
    note: 'This name has no session history on the desk yet, so realized vol cannot be measured against implied. Open it once and the read fills in.',
  },
};

/*
  COMPASS ELIGIBILITY, which is the reason the checklist put this line in
  Part 14 rather than filing it as another chart.

  A setup graded on structure alone is graded in a vacuum: the same wall
  means something different when the tape is realising 20% than when it is
  realising 10. The gate is deliberately NARROW — it refuses only the
  strained state, and it refuses nothing at all when the regime is unknown.

  A gate that blocks on a missing measurement would silently disqualify the
  eighteen roster names with no seeded history, which is a data-coverage
  fact masquerading as a market judgement. Absence of evidence closes no
  door here.
*/
export function regimeAllows(verdict: RegimeVerdict): boolean {
  return verdict !== 'strained';
}

export function regimeGateNote(verdict: RegimeVerdict): string {
  if (verdict === 'strained') {
    return 'Setups are held back while realized vol is at implied — the levels are the least reliable they get in this state.';
  }
  if (verdict === 'unknown') {
    return 'No regime read on this name yet, so nothing is held back. A missing measurement is not a reason to refuse a setup.';
  }
  return 'The regime is not standing in the way of anything.';
}

/**
 * The whole board, one row per roster name.
 *
 * The cross-sectional percentile is computed over the rows built here, so
 * it always describes the set the reader is looking at rather than some
 * wider universe they cannot see.
 */
export function buildVolRegime(active = 'SPY', dte = 30): VolRegimeRow[] {
  const quotes = Simulator.universeQuotes(active);
  const partial = quotes.map(q => {
    const iv = atmIv(q.price, q.iv, dte);
    const rv = {
      5: realizedVol(q.ticker, 5),
      10: realizedVol(q.ticker, 10),
      20: realizedVol(q.ticker, 20),
    } as Record<RvWindow, number | null>;
    return {
      ticker: q.ticker,
      spot: q.price,
      iv,
      rv,
      premium: rv[20] === null ? null : iv - rv[20],
      rr: riskReversal(q.price, q.iv, dte),
      slope: termSlope(q.price, q.iv),
      verdict: verdictFor(iv, rv[20]),
    };
  });

  const ivs = partial.map(r => r.iv).sort((a, b) => a - b);
  return partial.map(r => ({
    ...r,
    /* The share of the roster strictly below this name, as a percentage.
       Strictly, so the lowest name reads 0 rather than an arbitrary
       fraction and the reader can see the bottom of the range is real. */
    crossSectionalIvPct: (ivs.filter(v => v < r.iv).length / Math.max(1, ivs.length - 1)) * 100,
  }));
}
