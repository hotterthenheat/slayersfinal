import { h01, hGauss } from '../core/rng';

/*
==================================================
  SLAYER TERMINAL - SEASONALITY (data/seasonality.ts)
==================================================

  How a name has behaved MONTH BY MONTH across past years — the average and
  median return for each calendar month, and how often it closed the month
  green.

  WHY IT IS HERE. The desk reads today: flow, exposure, the tape. Nothing
  answers "is this a month this name usually does well in", which is the
  question behind every "should I be in this into September" — and it is the
  one reading on the desk that ignores today entirely.

  THE MEDIAN IS THE HEADLINE, NOT THE MEAN. One October crash drags a mean
  through the floor and tells a reader nothing about a typical October. The
  mean is kept beside it precisely so the GAP between them is visible: mean
  far below median means the month's losses are rare and violent, which is
  a different risk from a month that grinds down every year.

  A HIT RATE NEEDS ITS SAMPLE PRINTED. "70% green" off ten Septembers is
  seven of ten, and a reader deserves to see the ten. Every row carries its
  own `years`, and a caller that hides it is hiding the only thing that says
  how much the number is worth.

  SIMULATED, AND IT SAYS SO. These are generated from the ticker's own seed,
  stable per name so a reader who checks twice sees the same history. The
  surface carries `simulated` provenance, and when a real vendor history
  lands the shape of this module does not change — `monthlyReturns` is
  replaced and everything above it keeps working.
*/

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** How many years of history the generator produces. */
export const SEASONALITY_YEARS = 15;

export interface MonthStat {
  /** 0 = January. */
  month: number;
  label: string;
  /** Mean monthly return, percent. */
  meanPct: number;
  /** Median monthly return, percent — the headline. */
  medianPct: number;
  /** Share of years this month closed green, 0–100. */
  positivePct: number;
  /** Years in the sample — a hit rate is worthless without it. */
  years: number;
  /** Best and worst single year, percent. */
  bestPct: number;
  worstPct: number;
}

export interface Seasonality {
  ticker: string;
  months: MonthStat[];
  /** The strongest and weakest month by MEDIAN — the mean would let one
      outlier crown a month that is usually flat. */
  best: MonthStat;
  worst: MonthStat;
  /** The month we are in now, for the "you are here" mark. */
  currentMonth: number;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * One month's returns across the sample, oldest year first.
 *
 * Exported so a caller can draw the raw years under a row rather than only
 * the summary — and so the proof can check the summary against them.
 */
export function monthlyReturns(ticker: string, month: number, years = SEASONALITY_YEARS): number[] {
  /* A per-name, per-month lean so a ticker has a SHAPE across the year
     rather than twelve independent coin flips — that is what makes a
     seasonality chart worth looking at. Bounded, so no month is a
     certainty. */
  const lean = (h01(`${ticker}|seas|${month}`) - 0.5) * 3.4;
  /* Volatility differs by month too: the market's quiet months really are
     quieter, and a flat vol across the year would draw twelve identical
     error bars. */
  const vol = 3.2 + h01(`${ticker}|seasvol|${month}`) * 4.6;
  const out: number[] = [];
  for (let y = 0; y < years; y++) {
    out.push(Number((lean + hGauss(`${ticker}|seas|${month}|${y}`) * vol).toFixed(2)));
  }
  return out;
}

export function buildSeasonality(ticker: string, at: Date = new Date()): Seasonality {
  const months: MonthStat[] = MONTHS.map((label, month) => {
    const rs = monthlyReturns(ticker, month);
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const wins = rs.filter(r => r > 0).length;
    return {
      month,
      label,
      meanPct: Number(mean.toFixed(2)),
      medianPct: Number(median(rs).toFixed(2)),
      positivePct: Number(((wins / rs.length) * 100).toFixed(0)),
      years: rs.length,
      bestPct: Math.max(...rs),
      worstPct: Math.min(...rs),
    };
  });

  /* Ranked on the MEDIAN — see the header. A mean-ranked "best month" can be
     one that is flat eleven years and enormous once. */
  const byMedian = [...months].sort((a, b) => b.medianPct - a.medianPct);
  return {
    ticker,
    months,
    best: byMedian[0],
    worst: byMedian[byMedian.length - 1],
    currentMonth: at.getMonth(),
  };
}

/** The read, in a sentence — what this month has usually done to this name. */
export function seasonalityRead(s: Seasonality): string {
  const m = s.months[s.currentMonth];
  const dir = m.medianPct > 0 ? 'up' : 'down';
  const mag = Math.abs(m.medianPct).toFixed(1);
  const strength =
    m.positivePct >= 70 ? 'and it has been reliable' : m.positivePct <= 30 ? 'and it has been reliably weak' : 'though it is close to a coin flip';
  return `${m.label} has typically closed ${dir} ${mag}% for ${s.ticker} — green in ${m.positivePct}% of ${m.years} years, ${strength}.`;
}

/** Where the mean sits against the median — the tail warning. */
export function tailNote(m: MonthStat): string | null {
  const gap = m.meanPct - m.medianPct;
  if (Math.abs(gap) < 1) return null;
  return gap < 0
    ? 'Mean well below median — this month is usually fine and occasionally very bad.'
    : 'Mean well above median — the average is carried by a few outsized years.';
}
