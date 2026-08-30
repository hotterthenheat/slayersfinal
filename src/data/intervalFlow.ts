import type { FlowPrint } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - INTERVAL FLOW (data/intervalFlow.ts)
==================================================

  What ACCUMULATED into a single contract over the last few minutes,
  rather than what printed in one go.

  THE GAP THIS FILLS, and it is not the one flowBars fills. `flowBars`
  buckets the tape by TIME so a chart can draw premium under the candles;
  every contract in a bucket is summed together. This buckets by CONTRACT:
  forty 25-lots into the same strike over eight minutes is a thousand-lot
  position being built quietly, and in a flat tape it is forty unremarkable
  rows that nobody reads. Size that arrives in pieces is invisible to a feed
  sorted by print size, which is exactly why someone building a position
  sends it in pieces.

  ONE ROW PER CONTRACT, not per print. The key is the whole contract —
  ticker, expiry, strike and right — because 500 calls at the 470 strike and
  500 puts at the same strike are opposite trades, and a key that ignored
  the right would add them together and report a thousand of nothing.

  THE PRESSURE IS PREMIUM-WEIGHTED, NOT PRINT-COUNTED. Ten small bids and
  one large lift is a contract being BOUGHT, and counting prints would call
  it selling ten to one. `askPct` is the share of the contract's premium
  that paid the offer.

  VOLUME AGAINST OPEN INTEREST is what separates a new position from a
  busy one. It is only reported when the tape actually carried an OI for
  the contract — `volOverOi` is null otherwise, and null is drawn as an
  em-dash rather than as a zero, because "we do not know" is not "none".
*/

export interface IntervalRow {
  /** Stable key — ticker|expiry|strike|right. */
  key: string;
  ticker: string;
  expiry: string;
  strike: number;
  right: 'C' | 'P';
  dte: number;
  /** Contracts accumulated in the window. */
  contracts: number;
  /** Premium in dollars. */
  premium: number;
  /** How many separate prints it took — the accumulation tell. */
  prints: number;
  /** Largest single print's contracts — small next to `contracts` means
      the size was assembled rather than sent. */
  largestPrint: number;
  /** Share of premium that lifted the offer, 0–100. */
  askPct: number;
  /** Window volume over the contract's open interest, or null when the
      tape carried no OI for it. */
  volOverOi: number | null;
}

export interface IntervalFlow {
  rows: IntervalRow[];
  /** Contracts touched in the window. */
  contracts: number;
  /** Every print counted. */
  prints: number;
  windowMs: number;
}

const EMPTY: IntervalFlow = { rows: [], contracts: 0, prints: 0, windowMs: 0 };

const premiumOf = (p: FlowPrint): number => {
  const size = Number.isFinite(p.size) ? p.size : 0;
  const fill = Number.isFinite(p.fill) ? p.fill : 0;
  return size * fill * 100;
};

/**
 * Accumulation by contract over a rolling window.
 *
 * @param tape     prints with an `at` stamp
 * @param ticker   null for every name
 * @param windowMs the interval — 5 to 10 minutes is the reference product's
 *                 range, and the point is that it is SHORT
 * @param limit    rows kept, ranked by premium
 */
export function buildIntervalFlow(
  tape: readonly (FlowPrint & { at: number })[],
  ticker: string | null,
  windowMs: number,
  limit = 40,
  now: number = Date.now()
): IntervalFlow {
  if (tape.length === 0 || !(windowMs > 0)) return EMPTY;
  const cutoff = now - windowMs;

  const byContract = new Map<
    string,
    IntervalRow & { askPremium: number; oi: number | null }
  >();
  let prints = 0;

  for (const p of tape) {
    if (p.at < cutoff) continue;
    if (ticker && p.ticker !== ticker) continue;
    const size = Number.isFinite(p.size) ? p.size : 0;
    const prem = premiumOf(p);
    if (size <= 0 || prem <= 0) continue;

    /* The RIGHT is part of the key — calls and puts at one strike are
       opposite trades, and merging them reports a thousand of nothing. */
    const key = `${p.ticker}|${p.expiry}|${p.strike}|${p.right}`;
    let r = byContract.get(key);
    if (!r) {
      r = {
        key,
        ticker: p.ticker,
        expiry: p.expiry,
        strike: p.strike,
        right: p.right,
        dte: p.dte,
        contracts: 0,
        premium: 0,
        prints: 0,
        largestPrint: 0,
        askPct: 0,
        volOverOi: null,
        askPremium: 0,
        oi: null,
      };
      byContract.set(key, r);
    }
    r.contracts += size;
    r.premium += prem;
    r.prints += 1;
    if (size > r.largestPrint) r.largestPrint = size;
    if (p.side === 'ASK') r.askPremium += prem;
    /* OI rides the print when the tape carries it. Taking the LARGEST seen
       rather than the last: a print mid-session may carry a stale figure,
       and under-reporting OI would overstate vol/OI, which is the number a
       reader leans on hardest. */
    const oi = (p as FlowPrint & { oi?: number }).oi;
    if (typeof oi === 'number' && oi > 0) r.oi = Math.max(r.oi ?? 0, oi);
    prints += 1;
  }

  const rows: IntervalRow[] = [...byContract.values()]
    .map(r => ({
      key: r.key,
      ticker: r.ticker,
      expiry: r.expiry,
      strike: r.strike,
      right: r.right,
      dte: r.dte,
      contracts: r.contracts,
      premium: r.premium,
      prints: r.prints,
      largestPrint: r.largestPrint,
      askPct: r.premium > 0 ? Number(((r.askPremium / r.premium) * 100).toFixed(0)) : 0,
      volOverOi: r.oi && r.oi > 0 ? Number((r.contracts / r.oi).toFixed(2)) : null,
    }))
    .sort((a, b) => b.premium - a.premium)
    .slice(0, limit);

  return { rows, contracts: byContract.size, prints, windowMs };
}

/**
 * How assembled a row is: 1 means it arrived in one print, higher means it
 * was built out of pieces. This is the reading the whole surface exists for.
 */
export function assemblyRatio(r: IntervalRow): number {
  if (r.largestPrint <= 0) return 1;
  return Number((r.contracts / r.largestPrint).toFixed(1));
}

/** Rows that were ASSEMBLED rather than sent — quiet size. */
export function assembled(f: IntervalFlow, minPrints = 4, minRatio = 3): IntervalRow[] {
  return f.rows.filter(r => r.prints >= minPrints && assemblyRatio(r) >= minRatio);
}
