import { dayKey, h01, hPick, hRange } from '../core/rng';
import { isTradingDay } from '../core/calendar';

/*
==================================================
  SLAYER TERMINAL - THE IPO CALENDAR (data/ipo.ts)
==================================================

  Section 9.3. A new listing is the one instrument on this desk that can
  exist as a NAME before it exists as anything a trader can act on, and the
  gap is where the interface can mislead.

  TWO STATES DO THE WORK, and both are about refusing:

  · STATUS IS NOT A DATE. "Upcoming", "priced", "withdrawn" and "postponed"
    are different facts about a deal, and a withdrawn one has a date in the
    past that a calendar sorted by date will happily show among next week's.
    The checklist's instruction is exact — "a withdrawn deal must never read
    as upcoming" — and it is a warning about the failure mode of every
    calendar ever built: the row survives, the reason it is dead does not.

  · A NEW LISTING HAS NO OPTIONS. Not "few" — none. The exchanges do not
    list options on a new issue for days to weeks, so every options surface
    on this desk is unavailable for it, and a link that navigates to an
    empty Weigher is worse than a link that says why it cannot. `hasChain`
    is the gate and `chainEta` is the reason.

  Deterministic per session day, like everything else here.
*/

export type IpoStatus = 'upcoming' | 'priced' | 'withdrawn' | 'postponed';

export const IPO_STATUS_WORDS: Record<IpoStatus, string> = {
  upcoming: 'upcoming',
  priced: 'priced',
  withdrawn: 'withdrawn',
  postponed: 'postponed',
};

export const IPO_STATUS_NOTES: Record<IpoStatus, string> = {
  upcoming: 'Filed and scheduled. The range is an intention, not a price — deals reprice, and some never trade at all.',
  priced: 'Priced and trading. The figure is what the deal actually came at, which is frequently outside the range it filed.',
  withdrawn: 'PULLED. The issuer has withdrawn the filing; this deal is not happening on this date or any other. Kept on the calendar because a deal that vanishes from a list is a deal a reader assumes they missed.',
  postponed: 'Delayed with no new date. Distinct from withdrawn — the filing stands and the deal may return, but nothing is scheduled.',
};

/** Which statuses are still ahead of the reader. Everything else is a
    record of something that already resolved, and must not be tinted,
    sorted or counted as though it were pending. */
export function isPending(s: IpoStatus): boolean {
  return s === 'upcoming';
}

/** A dead deal — the reader's answer is "nothing is going to happen here". */
export function isDead(s: IpoStatus): boolean {
  return s === 'withdrawn';
}

/*
  HOW LONG AFTER A LISTING OPTIONS APPEAR. The exchanges' own rule requires
  a seasoning period plus volume and float tests, so it is days to weeks
  and never same-day. Five sessions is the optimistic end and the number is
  named here rather than guessed at each call site.
*/
export const OPTIONS_SEASONING_SESSIONS = 5;

export interface IpoDeal {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  status: IpoStatus;
  /** ISO date. For a withdrawn deal this is when it WAS scheduled. */
  date: string;
  /** Sessions from today. Negative for a date already passed. */
  daysOut: number;
  /** Filed range, per share. Null once withdrawn — a pulled deal has no
      live range and printing one invites a reader to price it. */
  rangeLow: number | null;
  rangeHigh: number | null;
  /** What it actually came at. Only ever set for a priced deal. */
  pricedAt: number | null;
  /** Raise at the range midpoint, dollars. */
  raiseUsd: number;
  exchange: 'NYSE' | 'NASDAQ';
  /** True once options are listed. A brand-new issue is always false. */
  hasChain: boolean;
  /** Sessions until options may list. Null when they already have, or when
      the deal will never trade. */
  chainEta: number | null;
}

const NAMES: { ticker: string; name: string; sector: string }[] = [
  { ticker: 'ARBR', name: 'Arbor Compute', sector: 'Technology' },
  { ticker: 'HLIX', name: 'Helix Bio', sector: 'Healthcare' },
  { ticker: 'VNTR', name: 'Venture Grid', sector: 'Industrials' },
  { ticker: 'CRSL', name: 'Carousel Retail', sector: 'Consumer' },
  { ticker: 'NMBS', name: 'Nimbus Data', sector: 'Technology' },
  { ticker: 'OKRA', name: 'Okra Foods', sector: 'Consumer' },
  { ticker: 'PTRN', name: 'Pattern Security', sector: 'Technology' },
  { ticker: 'QLST', name: 'Quicklist Logistics', sector: 'Industrials' },
  { ticker: 'RVLT', name: 'Rivulet Energy', sector: 'Energy' },
  { ticker: 'SNDR', name: 'Sunder Materials', sector: 'Materials' },
  { ticker: 'TIDL', name: 'Tidal Payments', sector: 'Financials' },
  { ticker: 'WLLW', name: 'Willow Health', sector: 'Healthcare' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Step `n` trading days from `from`, forward or back. */
function shiftSessions(from: Date, n: number): Date {
  const d = new Date(from);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isTradingDay(d)) left -= 1;
  }
  return d;
}

let cache: { key: string; deals: IpoDeal[] } | null = null;

export function buildIpoCalendar(today: Date = new Date()): IpoDeal[] {
  const day = dayKey();
  if (cache?.key === day) return cache.deals;

  const base = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const deals: IpoDeal[] = NAMES.map((n, i) => {
    const s = (tag: string) => `${day}-ipo-${n.ticker}-${tag}`;
    /* Spread across a fortnight either side of today: some already
       trading, some ahead. A calendar showing only the future cannot
       demonstrate the state that matters — a resolved deal beside a
       pending one. */
    const daysOut = Math.round(hRange(s('d'), -9, 12));
    const roll = h01(s('st'));
    /* A date in the past cannot be "upcoming" — that is the bug this
       section is about, and it is prevented at the source rather than
       filtered in the view. */
    const status: IpoStatus =
      daysOut <= 0
        ? roll < 0.82 ? 'priced' : roll < 0.93 ? 'withdrawn' : 'postponed'
        : roll < 0.78 ? 'upcoming' : roll < 0.9 ? 'postponed' : 'withdrawn';

    const lo = Number(hRange(s('lo'), 9, 42).toFixed(0));
    const hi = Number((lo + hRange(s('hi'), 2, 7)).toFixed(0));
    const withdrawn = status === 'withdrawn';
    const priced = status === 'priced';

    /* Deals price outside their range often enough that showing the range
       and the print as the same kind of number would be a lie of omission
       — so a priced deal keeps both and the surface can show the gap. */
    const pricedAt = priced ? Number((lo + hRange(s('px'), -2.5, 6)).toFixed(2)) : null;
    const shares = Math.round(hRange(s('sh'), 4e6, 38e6));

    const sessionsSinceList = priced ? Math.max(0, -daysOut) : 0;
    const hasChain = priced && sessionsSinceList >= OPTIONS_SEASONING_SESSIONS;

    return {
      id: `ipo-${day}-${i}`,
      ticker: n.ticker,
      name: n.name,
      sector: n.sector,
      status,
      date: iso(shiftSessions(base, daysOut)),
      daysOut,
      // A pulled deal has no live range; printing one invites pricing it.
      rangeLow: withdrawn ? null : lo,
      rangeHigh: withdrawn ? null : hi,
      pricedAt,
      raiseUsd: Math.round(((lo + hi) / 2) * shares),
      exchange: hPick(s('ex'), ['NYSE', 'NASDAQ'] as const),
      hasChain,
      /* Null when options already list, and null when the deal is never
         going to trade — an ETA on a withdrawn filing is a countdown to
         nothing. */
      chainEta: hasChain || withdrawn || status === 'postponed'
        ? null
        : priced
          ? Math.max(1, OPTIONS_SEASONING_SESSIONS - sessionsSinceList)
          : daysOut + OPTIONS_SEASONING_SESSIONS,
    };
  });

  /* Pending first and soonest-first inside it, then everything resolved by
     recency. Sorting the whole list by date puts a withdrawn deal from
     last week between two live ones. */
  deals.sort((a, b) => {
    const ap = isPending(a.status) ? 0 : 1;
    const bp = isPending(b.status) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return ap === 0 ? a.daysOut - b.daysOut : b.daysOut - a.daysOut;
  });

  cache = { key: day, deals };
  return deals;
}

/** Why an options surface cannot open for this deal — null when it can. */
export function chainBlockedReason(deal: IpoDeal): string | null {
  if (deal.hasChain) return null;
  if (deal.status === 'withdrawn') return 'This deal was withdrawn — there is no listing and there will be no chain.';
  if (deal.status === 'postponed') return 'This deal is postponed with no date, so there is nothing to list options against yet.';
  if (deal.status === 'upcoming') return `Not listed yet. Options cannot appear until the shares trade, and then not for about ${OPTIONS_SEASONING_SESSIONS} sessions.`;
  return `No options chain yet — a new listing seasons for about ${OPTIONS_SEASONING_SESSIONS} sessions before options appear${deal.chainEta ? `, roughly ${deal.chainEta} more` : ''}.`;
}
