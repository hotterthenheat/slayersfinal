/*
==================================================
  SLAYER TERMINAL - EXECUTION QUALITY (executionQuality.ts)

  What crossing the spread actually cost, per print and per
  session.

  WHY THIS DESK EXISTS AND WHY NOBODY ELSE HAS ONE.
  docs/DATA-FEASIBILITY.md names it P0: "You have every
  quote. Effective spread, quoted spread, price improvement
  vs NBBO, where in the spread each print landed, spread
  cost by strike and expiry. Retail platforms never show
  this because they don't want you to see it." The options
  entitlement carries the full OPRA trade stream AND the
  NBBO, and having both at the same instant is the whole
  requirement — a trade without the quote beside it cannot
  be scored, and a quote without the trade is just a price.

  NOTHING HERE IS A MODEL. Every figure below is arithmetic
  on four measured fields — bid, ask, fill, size — under
  the standard TCA definitions a regulator would recognise:

    mid                 (bid + ask) / 2
    quoted spread       ask − bid
    effective spread    2 × |fill − mid|
    E/Q ratio           effective / quoted
    price improvement   (quoted / 2) − |fill − mid|
    spread cost         |fill − mid| × size × 100

  E/Q is the one number to read. 1.0 means the print paid
  the full half-spread — it took the quote. 0 means it
  crossed at the midpoint. Above 1.0 means it filled
  OUTSIDE the NBBO, which on a real feed is either a late
  print or a genuinely poor fill.

  PRICE IMPROVEMENT IS SIGNED AGAINST THE HALF-SPREAD, not
  against the near touch, and that choice matters. Measuring
  a buy against the ask and a sell against the bid produces
  two numbers on two scales that cannot be summed, and it
  scores a midpoint cross as a full half-spread of
  improvement on one side and zero on the other for the
  identical trade. Against the midpoint both sides are one
  quantity, positive when the fill beat the touch and
  negative when it did not, and the session total is the sum
  of what every print saved or paid.

  WEIGHTING. Read the note on `sessionRates` before changing
  an aggregate. Dollars sum; RATES DO NOT. A plain mean of
  spread-percent across prints is dominated by five-cent
  contracts whose spread is a third of their price, and
  describes no trade anyone did.
==================================================
*/

import type { FlowPrint } from '../types/flowdesk';

/** One print, scored. Every field is derived; none is stored upstream. */
export interface PrintExecution {
  print: FlowPrint;
  /** (bid + ask) / 2 — the benchmark every other figure is measured against. */
  mid: number;
  /** ask − bid, dollars per contract. */
  quotedSpread: number;
  /** Quoted spread as a percentage of mid. The comparable form across names. */
  quotedSpreadPct: number;
  /** 2 × |fill − mid|, dollars per contract. */
  effectiveSpread: number;
  /**
   * effective / quoted. 1 = paid the full half-spread, 0 = midpoint cross,
   * >1 = filled outside the NBBO. Zero when the quote is crossed or locked,
   * which a real feed does produce and which no ratio can describe.
   */
  effectiveOverQuoted: number;
  /** (quoted / 2) − |fill − mid|, dollars per contract. Positive beat the touch. */
  priceImprovement: number;
  /** Dollars this print paid to cross: |fill − mid| × size × 100. */
  spreadCost: number;
  /** Dollars it would have saved by crossing at the midpoint instead. */
  improvementDollars: number;
}

export type ExecutionGradeKey = 'MID_OR_BETTER' | 'INSIDE' | 'AT_TOUCH' | 'OUTSIDE';

/**
 * Four bands over the E/Q ratio, because a continuous ratio is not a finding.
 *
 * The cuts are the ones the measure itself defines rather than round numbers
 * chosen to look balanced: 0 is the midpoint, 1 is the touch, and everything
 * above 1 is outside the quote. `INSIDE` is the only band with a judgement in
 * it — a fill closer to the mid than to the touch — and it is stated as a
 * position, not as a grade.
 */
export const EXECUTION_GRADE: Record<ExecutionGradeKey, { label: string; note: string }> = {
  MID_OR_BETTER: { label: 'At mid', note: 'Crossed at the midpoint or better — paid no spread' },
  INSIDE: { label: 'Inside', note: 'Filled closer to the midpoint than to the touch' },
  AT_TOUCH: { label: 'At touch', note: 'Filled at or near the quote — paid the half-spread' },
  OUTSIDE: { label: 'Outside', note: 'Filled outside the NBBO at the time of the print' },
};

export function gradeOf(eq: number): ExecutionGradeKey {
  if (eq <= 0.05) return 'MID_OR_BETTER';
  if (eq < 0.5) return 'INSIDE';
  if (eq <= 1.02) return 'AT_TOUCH';
  return 'OUTSIDE';
}

/** One band of the fill-position histogram. */
export interface SpreadBucket {
  /** Inclusive low edge of the E/Q band. */
  lo: number;
  hi: number;
  prints: number;
  /** Premium that crossed in this band, dollars. */
  premium: number;
  /** Spread dollars paid by prints in this band. */
  cost: number;
}

/** A cut of the session — by expiry bucket or by moneyness. */
export interface ExecutionCut {
  key: string;
  prints: number;
  premium: number;
  cost: number;
  /** Premium-weighted E/Q for the cut. */
  eq: number;
  /** Spread cost as basis points of premium. */
  bps: number;
}

export interface ExecutionQualityView {
  ticker: string;
  rows: PrintExecution[];
  prints: number;
  /** Total premium across the scored prints, dollars. */
  premium: number;
  /** Total dollars paid to cross, summed. Extensive — a true sum. */
  spreadCost: number;
  /** Spread cost as basis points of premium traded. */
  costBps: number;
  /** Premium-weighted quoted spread, % of mid. */
  quotedSpreadPct: number;
  /** Premium-weighted E/Q ratio. */
  effectiveOverQuoted: number;
  /** Share of PREMIUM that crossed at the midpoint or better, 0-100. */
  midSharePct: number;
  /** Share of PREMIUM that filled outside the NBBO, 0-100. */
  outsideSharePct: number;
  /** Net dollars saved (positive) or given up (negative) against the half-spread. */
  improvementDollars: number;
  buckets: SpreadBucket[];
  byExpiry: ExecutionCut[];
  bySide: ExecutionCut[];
  /** The single worst print by dollars paid to cross. */
  worst: PrintExecution | null;
}

/** Score one print. Exported so a row detail can show its own arithmetic. */
export function scorePrint(print: FlowPrint): PrintExecution {
  const mid = (print.bid + print.ask) / 2;
  const quotedSpread = Math.max(0, print.ask - print.bid);
  const half = quotedSpread / 2;
  const distance = Math.abs(print.fill - mid);
  const effectiveSpread = 2 * distance;

  return {
    print,
    mid,
    quotedSpread,
    quotedSpreadPct: mid > 0 ? (quotedSpread / mid) * 100 : 0,
    effectiveSpread,
    // A crossed or locked quote has no half-spread to measure against, and a
    // ratio over zero is Infinity, which formats as "∞%" on a desk about cost.
    effectiveOverQuoted: quotedSpread > 0 ? effectiveSpread / quotedSpread : 0,
    priceImprovement: half - distance,
    spreadCost: distance * print.size * 100,
    improvementDollars: (half - distance) * print.size * 100,
  };
}

/** Ten equal bands from midpoint to the touch, plus everything beyond it. */
const BUCKET_EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, Infinity];

const EXPIRY_CUTS: { key: string; max: number }[] = [
  { key: '0DTE', max: 0 },
  { key: '1-7d', max: 7 },
  { key: '8-30d', max: 30 },
  { key: '31-90d', max: 90 },
  { key: '90d+', max: Infinity },
];

/*
  BY AGGRESSOR SIDE, NOT BY MONEYNESS.

  Moneyness was the obvious second cut and it was the wrong one HERE: the tape's
  strikes sit within ±0.6% of spot, so every band but "near ATM" came back empty
  and the panel rendered a one-row distribution — a shape that says "this is a
  breakdown" while breaking nothing down. That is a property of the seeded tape
  (the seeder works ±3 strikes off spot), not of the measure, and it will change
  the day a real chain feed hands over the full ladder. It is not a reason to
  ship an empty panel until then.

  Side is the cut a transaction-cost report leads with anyway, and it is the one
  that carries the finding: lifting an offer, hitting a bid and negotiating a
  midpoint cross are three different decisions, and this is what each of them
  cost.
*/
const SIDE_CUTS: { key: string; side: FlowPrint['side'] }[] = [
  { key: 'Lifted offer', side: 'ASK' },
  { key: 'Hit bid', side: 'BID' },
  { key: 'Crossed mid', side: 'MID' },
];

/**
 * Aggregate a set of scored prints into one cut.
 *
 * PREMIUM-WEIGHTED, NOT AVERAGED. `eq` and `bps` are RATES, and a rate has no
 * meaning summed or plain-averaged across prints of wildly different size. A
 * five-cent contract quoted 0.03/0.08 has a 100% quoted spread and a 1.0 E/Q on
 * a $50 trade; averaged flat against a $2M block that crossed at the mid it
 * takes half the answer. Weighting by premium says what the session's DOLLARS
 * experienced, which is the only version of the question a trader asks.
 */
function cutOf(key: string, rows: PrintExecution[]): ExecutionCut {
  let premium = 0;
  let cost = 0;
  let eqWeighted = 0;
  for (const r of rows) {
    premium += r.print.premium;
    cost += r.spreadCost;
    eqWeighted += r.effectiveOverQuoted * r.print.premium;
  }
  return {
    key,
    prints: rows.length,
    premium,
    cost,
    eq: premium > 0 ? eqWeighted / premium : 0,
    bps: premium > 0 ? (cost / premium) * 10_000 : 0,
  };
}

export function buildExecutionQuality(prints: FlowPrint[], ticker: string): ExecutionQualityView {
  /*
    Scoped here rather than by the caller, matching buildInformedFlow and
    buildGammaTape: three desks read the one session tape and each answers about
    one name, so the filter belongs beside the arithmetic that depends on it.
  */
  const scoped = prints.filter(p => p.ticker === ticker);

  /*
    Only prints with a real two-sided quote are scored, and the desk says how
    many it dropped rather than scoring them at zero. A print with no spread
    around it is not a free fill; it is a print this measure cannot speak about,
    and folding it in as `cost 0` would drag every session average toward zero
    in proportion to how much of the tape is unquotable.
  */
  const rows = scoped.filter(p => p.ask > p.bid && p.bid > 0).map(scorePrint);

  let premium = 0;
  let spreadCost = 0;
  let eqWeighted = 0;
  let quotedWeighted = 0;
  let midPremium = 0;
  let outsidePremium = 0;
  let improvementDollars = 0;

  for (const r of rows) {
    premium += r.print.premium;
    spreadCost += r.spreadCost;
    eqWeighted += r.effectiveOverQuoted * r.print.premium;
    quotedWeighted += r.quotedSpreadPct * r.print.premium;
    improvementDollars += r.improvementDollars;
    const g = gradeOf(r.effectiveOverQuoted);
    if (g === 'MID_OR_BETTER') midPremium += r.print.premium;
    if (g === 'OUTSIDE') outsidePremium += r.print.premium;
  }

  const buckets: SpreadBucket[] = [];
  for (let i = 0; i < BUCKET_EDGES.length - 1; i++) {
    const lo = BUCKET_EDGES[i];
    const hi = BUCKET_EDGES[i + 1];
    const inBand = rows.filter(r => r.effectiveOverQuoted >= lo && (hi === Infinity ? true : r.effectiveOverQuoted < hi));
    buckets.push({
      lo,
      hi,
      prints: inBand.length,
      premium: inBand.reduce((a, r) => a + r.print.premium, 0),
      cost: inBand.reduce((a, r) => a + r.spreadCost, 0),
    });
  }

  const byExpiry = EXPIRY_CUTS.map((cut, i) => {
    const min = i === 0 ? -Infinity : EXPIRY_CUTS[i - 1].max;
    return cutOf(
      cut.key,
      rows.filter(r => r.print.dte > min && r.print.dte <= cut.max)
    );
  }).filter(c => c.prints > 0);

  const bySide = SIDE_CUTS.map(cut =>
    cutOf(
      cut.key,
      rows.filter(r => r.print.side === cut.side)
    )
  ).filter(c => c.prints > 0);

  return {
    ticker,
    rows,
    prints: rows.length,
    premium,
    spreadCost,
    costBps: premium > 0 ? (spreadCost / premium) * 10_000 : 0,
    quotedSpreadPct: premium > 0 ? quotedWeighted / premium : 0,
    effectiveOverQuoted: premium > 0 ? eqWeighted / premium : 0,
    midSharePct: premium > 0 ? (midPremium / premium) * 100 : 0,
    outsideSharePct: premium > 0 ? (outsidePremium / premium) * 100 : 0,
    improvementDollars,
    buckets,
    byExpiry,
    bySide,
    worst: rows.length ? rows.reduce((a, b) => (b.spreadCost > a.spreadCost ? b : a)) : null,
  };
}
