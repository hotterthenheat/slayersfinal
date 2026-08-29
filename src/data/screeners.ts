import { h01, hRange, dayKey } from '../core/rng';
import { buildFundamentals, coveredTickers } from './fundamentals';

/*
==================================================
  SLAYER TERMINAL - SCREENERS (data/screeners.ts)

  Nine ways to ask the universe a question.
==================================================

  WHAT THIS IS FOR. A reader arriving at a terminal does not always have a
  name in mind — sometimes the question is "what is moving", "what reports
  this fortnight", "what is expensive to own". Every desk here answers a
  question about ONE ticker; nothing answered a question about all of them.

  EVERY NUMBER IS SIMULATED, and says so where it is shown. The owner's
  call (2026-08-29): build the whole board now on the simulator and swap the
  source later, so the UI is settled before a feed is wired. That means two
  of these — the analyst rating and the dividend yield — are OUR invention
  rather than a vendor's, and the surfaces carry a `model` chip rather than
  a `measured` one so nobody mistakes a seeded opinion for a street one.

  DETERMINISTIC PER DAY, like everything else on this desk. A screener that
  reshuffles on every render is not a screener, it is a slot machine: a
  reader who scrolls away and back must find the same board, and two panes
  asking the same question must agree. So every field is a pure function of
  (ticker, day) through the house hash, never of Math.random or the clock.

  THE RANK IS THE PRODUCT, and it is computed from the whole universe every
  time rather than cached: twenty-two names is nothing, and a cache here
  would be a second source of truth for "what is top of the board".
*/

export type ScreenerKey =
  | 'gainers' | 'losers' | 'earnings' | 'analyst' | 'iv'
  | 'optionsVolume' | 'dividend' | 'high52' | 'low52';

export interface ScreenerRow {
  ticker: string;
  name: string;
  price: number;
  /** Session move, percent. Signed. */
  changePct: number;
  /** The column this screener is SORTED BY, already formatted. */
  metric: string;
  /** The same value unformatted, so a caller can sort or scale by it. */
  metricValue: number;
  /** One line on why this row is here, in a reader's words. */
  note: string;
}

export interface Screener {
  key: ScreenerKey;
  label: string;
  blurb: string;
  /** The heading over the metric column. */
  metricLabel: string;
  /** Which way the metric reads — used for the ink, not the sort. */
  tone: 'up' | 'down' | 'neutral';
}

export const SCREENERS: Screener[] = [
  { key: 'gainers', label: 'Daily price jumps', blurb: 'The biggest gains in the session so far', metricLabel: 'Change', tone: 'up' },
  { key: 'losers', label: 'Daily price dips', blurb: 'The biggest falls in the session so far', metricLabel: 'Change', tone: 'down' },
  { key: 'earnings', label: 'Upcoming earnings', blurb: 'Names reporting inside the next two weeks', metricLabel: 'Reports', tone: 'neutral' },
  { key: 'analyst', label: 'Analyst picks', blurb: 'Where the modelled consensus sits at buy or better', metricLabel: 'Rating', tone: 'up' },
  { key: 'iv', label: 'Highest implied volatility', blurb: 'What the options market charges for a move', metricLabel: 'IV', tone: 'neutral' },
  { key: 'optionsVolume', label: 'Highest options volume', blurb: 'Where the contracts are actually trading', metricLabel: 'Contracts', tone: 'neutral' },
  { key: 'dividend', label: 'Highest dividend yield', blurb: 'Trailing yield above 2% — income, not momentum', metricLabel: 'Yield', tone: 'neutral' },
  { key: 'high52', label: 'New 52-week highs', blurb: 'Trading through the top of their own year', metricLabel: 'From high', tone: 'up' },
  { key: 'low52', label: 'New 52-week lows', blurb: 'Trading through the bottom of their own year', metricLabel: 'From low', tone: 'down' },
];

export const screenerByKey = (key: string): Screener | null =>
  SCREENERS.find(s => s.key === key) ?? null;

/** Where a name sits in its own 52-week range, 0 at the low and 1 at the high. */
export function yearPosition(ticker: string, day = dayKey()): number {
  return h01(`${ticker}|${day}|52w`);
}

/** The session's move, percent. Signed, and the same all day for a name. */
export function sessionChangePct(ticker: string, day = dayKey()): number {
  return hRange(`${ticker}|${day}|chg`, -6.5, 6.5);
}

/** Contracts traded today, in thousands of contracts. */
export function optionsVolume(ticker: string, day = dayKey()): number {
  /* Scaled by how liquid the name is: the index ETFs trade orders of
     magnitude more paper than a mid-cap, and a board that ranked them
     evenly would be lying about what "highest volume" means. */
  const liquidity = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL'].includes(ticker) ? 8 : 1;
  return hRange(`${ticker}|${day}|ovol`, 4, 180) * liquidity;
}

export type AnalystRating = 'Strong buy' | 'Buy' | 'Hold' | 'Sell';
const RATING_RANK: Record<AnalystRating, number> = {
  'Strong buy': 4, Buy: 3, Hold: 2, Sell: 1,
};

/**
 * The modelled consensus. OURS, not the street's — there is no vendor
 * behind it, and every surface that shows it says so.
 */
export function analystRating(ticker: string, day = dayKey()): AnalystRating {
  const r = h01(`${ticker}|${day}|rating`);
  return r > 0.82 ? 'Strong buy' : r > 0.5 ? 'Buy' : r > 0.2 ? 'Hold' : 'Sell';
}

/** Trading days until this name reports. Null when nothing is scheduled. */
export function daysToEarnings(ticker: string, day = dayKey()): number | null {
  const r = h01(`${ticker}|${day}|earn`);
  /* Not everything reports in any given fortnight, and a board that
     pretended otherwise would be useless in exactly the week it matters. */
  if (r > 0.45) return null;
  return Math.floor(hRange(`${ticker}|${day}|earnd`, 1, 14));
}

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/**
 * Run one screener across the whole universe.
 *
 * `limit` caps the board, but the RANK is computed over everything first —
 * a screener that sorted only its own first ten would be answering a
 * different question from the one on its label.
 */
export function runScreener(key: ScreenerKey, limit = 12, day = dayKey()): ScreenerRow[] {
  const rows: ScreenerRow[] = [];
  for (const ticker of coveredTickers()) {
    const f = buildFundamentals(ticker);
    if (!f) continue;
    /* DERIVED, not read: CompanyProfile carries no price field, and market
       cap is defined as price x shares, so this is exact rather than an
       approximation. The first cut read `f.profile.price` — a field that
       does not exist — and typecheck caught it. */
    const price = f.profile.marketCap / f.profile.sharesOutstanding;
    const change = sessionChangePct(ticker, day);
    const base = { ticker, name: f.profile.name, price, changePct: change };

    switch (key) {
      case 'gainers':
      case 'losers': {
        rows.push({ ...base, metric: fmtPct(change), metricValue: change, note: `${f.profile.sector} · ${f.profile.industry}` });
        break;
      }
      case 'earnings': {
        const d = daysToEarnings(ticker, day);
        if (d === null) continue;
        rows.push({ ...base, metric: d === 1 ? 'tomorrow' : `in ${d}d`, metricValue: -d, note: 'Expect the move to be priced already' });
        break;
      }
      case 'analyst': {
        const r = analystRating(ticker, day);
        if (RATING_RANK[r] < 3) continue;
        rows.push({ ...base, metric: r, metricValue: RATING_RANK[r] + h01(`${ticker}|${day}|tie`), note: 'Modelled here — no analyst was consulted' });
        break;
      }
      case 'iv': {
        /* Seeded outright rather than off a beta the profile does not
           expose. Wide band on purpose: an IV board where everything reads
           within two points of everything else ranks nothing. */
        const iv = hRange(`${ticker}|${day}|iv`, 12, 78);
        rows.push({ ...base, metric: `${iv.toFixed(1)}%`, metricValue: iv, note: 'What the chain charges for a move' });
        break;
      }
      case 'optionsVolume': {
        const v = optionsVolume(ticker, day);
        rows.push({ ...base, metric: `${v.toFixed(0)}k`, metricValue: v, note: 'Contracts traded in the session' });
        break;
      }
      case 'dividend': {
        const y = f.ratios.dividendYieldPct;
        if (y < 2) continue;
        rows.push({ ...base, metric: `${y.toFixed(2)}%`, metricValue: y, note: 'Trailing, on the last four quarters paid' });
        break;
      }
      case 'high52': {
        const pos = yearPosition(ticker, day);
        /* 0.94, not 0.97. The tighter cut was measured against the live
           universe and left this board EMPTY on a normal day — an honest
           empty state, but a "new highs" board that never has anything in
           it answers nothing. The top 6% of the year's range is still a
           name pressing its high, not a name merely up a bit. */
        if (pos < 0.94) continue;
        rows.push({ ...base, metric: `${((1 - pos) * 100).toFixed(1)}% off`, metricValue: pos, note: 'Through the top of its own year' });
        break;
      }
      case 'low52': {
        const pos = yearPosition(ticker, day);
        if (pos > 0.06) continue;   // the mirror of the 0.94 above
        rows.push({ ...base, metric: `${(pos * 100).toFixed(1)}% up`, metricValue: -pos, note: 'Through the bottom of its own year' });
        break;
      }
    }
  }

  /* Losers sort ASCENDING — the biggest fall is the most negative number,
     and sorting it like every other board would put the smallest dip top. */
  rows.sort((a, b) => (key === 'losers' ? a.metricValue - b.metricValue : b.metricValue - a.metricValue));
  return rows.slice(0, limit);
}

/** Every board at once, for the index page's counts. */
export function screenerCounts(day = dayKey()): Record<ScreenerKey, number> {
  const out = {} as Record<ScreenerKey, number>;
  for (const s of SCREENERS) out[s.key] = runScreener(s.key, 99, day).length;
  return out;
}
