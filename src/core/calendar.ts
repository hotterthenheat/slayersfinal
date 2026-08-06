/**
 * Market calendar — one source of truth for "is the market open that day", and
 * for turning a horizon in days into a REAL expiry.
 *
 * Six places used to answer this question and three of them answered it wrong:
 * `new Date(Date.now() + dte * 86400000)` happily lists contracts that expire on
 * a Saturday. The other three skipped weekends by hand but knew nothing about
 * holidays, and silently redefined `dte` as *trading* days while the pricing
 * math around them divided by 365. Anything that names an expiry comes through
 * here now, and `Expiry` carries both numbers so a caller never has to guess
 * which one it holds.
 */

/** US equity market holidays. Weekend-falling holidays are listed on their
    observed weekday (e.g. Jul 4 2026 is a Saturday → observed Fri Jul 3). */
export const MARKET_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  // 2028 — New Year's Day falls on a Saturday and is NOT pulled back to the
  // preceding Friday, which is the one case the observed-weekday rule skips.
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19',
  '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25',
  // 2029-2031 — every one of these falls on a weekday already, so the
  // observed-weekday rule never fires across the three years.
  '2029-01-01', '2029-01-15', '2029-02-19', '2029-03-30', '2029-05-28',
  '2029-06-19', '2029-07-04', '2029-09-03', '2029-11-22', '2029-12-25',
  '2030-01-01', '2030-01-21', '2030-02-18', '2030-04-19', '2030-05-27',
  '2030-06-19', '2030-07-04', '2030-09-02', '2030-11-28', '2030-12-25',
  '2031-01-01', '2031-01-20', '2031-02-17', '2031-04-11', '2031-05-26',
  '2031-06-19', '2031-07-04', '2031-09-01', '2031-11-27', '2031-12-25',
]);

/**
 * Scheduled half-days: the regular session ends at 13:00 ET, not 16:00.
 *
 * Same year range as the holiday table above, and the dates are computed from
 * the three NYSE rules rather than typed from memory — the day after
 * Thanksgiving; July 3 when both it and the 4th are weekdays; December 24 when
 * both it and the 25th are weekdays. The gaps are the point: 2027 has neither
 * a July nor a December half-day because those dates land on a weekend, and
 * 2026's July 3 is a full holiday rather than a half-day because the 4th is a
 * Saturday. Guessing the rule instead of listing the days gets those wrong.
 */
export const EARLY_CLOSES = new Set([
  '2026-11-27', '2026-12-24',
  '2027-11-26',
  '2028-07-03', '2028-11-24',
  '2029-07-03', '2029-11-23', '2029-12-24',
  '2030-07-03', '2030-11-29', '2030-12-24',
  '2031-07-03', '2031-11-28', '2031-12-24',
]);

/**
 * The last year the table above covers. `contractQuery` reads its own copy off
 * the same set, and drops every ladder rung past it rather than counting
 * Thanksgiving as a session — so when this table runs out, the expiry picker
 * silently gets shorter instead of getting wrong. Silent is the problem: the
 * only thing that notices is `calendar.test.ts`, which fails on lead time
 * while there are still years left to act on it.
 */
export const CALENDAR_THROUGH = Math.max(...[...MARKET_HOLIDAYS].map(k => Number(k.slice(0, 4))));

const DAY_MS = 86400000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const p2 = (n: number) => String(n).padStart(2, '0');

/** Local-date ISO key. NOT toISOString — that shifts across the UTC boundary. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Midnight local — dates used as calendar keys must not carry a time. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parsed once — `sessionsBetween` subtracts from this instead of re-parsing. */
const HOLIDAY_DATES: Date[] = [...MARKET_HOLIDAYS]
  .map(k => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  })
  .sort((a, b) => a.getTime() - b.getTime());

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export function isTradingDay(d: Date): boolean {
  return !isWeekend(d) && !MARKET_HOLIDAYS.has(isoDate(d));
}

export function today(): Date {
  return atMidnight(new Date());
}

/** Walk in `step` days until a session is found. Bounded — never spins. The
    longest real closure is a holiday Friday plus the weekend, so 10 is slack. */
function walkToSession(from: Date, step: 1 | -1): Date {
  const d = new Date(from);
  for (let i = 0; i < 10 && !isTradingDay(d); i++) d.setDate(d.getDate() + step);
  return d;
}

/** The next date the market is open — today included if today is a session. */
export function nextSession(from: Date = today()): Date {
  return walkToSession(atMidnight(from), 1);
}

/**
 * Trading days in `(from, to]`. Every 7 consecutive days hold exactly 5
 * weekdays, so whole weeks are arithmetic and only the remainder is walked —
 * this runs per scored contract, and LEAPS are 480 days out.
 */
export function sessionsBetween(from: Date, to: Date): number {
  const a = atMidnight(from);
  const b = atMidnight(to);
  if (b <= a) return 0;

  const days = Math.round((b.getTime() - a.getTime()) / DAY_MS);
  const weeks = Math.floor(days / 7);
  let n = weeks * 5;

  const cur = new Date(a);
  cur.setDate(cur.getDate() + weeks * 7);
  while (cur < b) {
    cur.setDate(cur.getDate() + 1);
    if (!isWeekend(cur)) n++;
  }

  for (const h of HOLIDAY_DATES) {
    if (h > b) break;
    if (h > a && !isWeekend(h)) n--;
  }
  return n;
}

export interface Expiry {
  /** The real expiry — always a trading day. */
  date: Date;
  /** MM/DD/YY */
  label: string;
  /** Weekday name, e.g. "Fri" — the tell that makes a bad date obvious. */
  weekday: string;
  /** CALENDAR days to that date. What a trader means by "45 DTE". */
  dte: number;
  /** TRADING sessions left. The number that actually decays the contract. */
  sessions: number;
}

/** MM/DD/YY */
export function fmtExpiry(d: Date): string {
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${String(d.getFullYear()).slice(2)}`;
}

/** MM/DD */
export function fmtExpiryShort(d: Date): string {
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}`;
}

/** MM/DD/YYYY */
export function fmtExpiryLong(d: Date): string {
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}`;
}

/** yy-mm-dd */
export function fmtExpiryIso(d: Date): string {
  return `${p2(d.getFullYear() % 100)}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** "Jul 24" */
export function fmtMonthDay(d: Date): string {
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Resolve a horizon in CALENDAR days to a real expiry.
 *
 * Prefer walking BACK off a closed day — a "7 day" weekly is that Friday, not
 * the Saturday after it. Backward alone has a hole though: two days out from a
 * Friday is Sunday, and stepping back from there lands on the Friday you are
 * standing on, turning a 2-day request into a same-day contract. So when the
 * backward walk reaches today or earlier, go FORWARD from the target instead.
 *
 * `dte` 0 is its own case: it means today when the market is open, and the next
 * session when it is not — asking for a same-day contract on a Saturday.
 */
export function expiryFor(dte: number, from: Date = today()): Expiry {
  const base = atMidnight(from);
  const want = Math.max(0, Math.round(dte));

  const target = new Date(base);
  target.setDate(target.getDate() + want);

  let date: Date;
  if (want === 0) {
    date = nextSession(base);
  } else {
    date = walkToSession(target, -1);
    if (date <= base) date = walkToSession(target, 1);
  }

  return {
    date,
    label: fmtExpiry(date),
    weekday: WEEKDAY[date.getDay()],
    dte: Math.round((date.getTime() - base.getTime()) / DAY_MS),
    sessions: sessionsBetween(base, date),
  };
}

// ---- market clock --------------------------------------------------------

/** Where the session is, right now. */
export type MarketPhase = 'pre' | 'open' | 'after' | 'closed' | 'weekend' | 'holiday';

export interface MarketClock {
  /** HH:MM:SS in New York, whatever zone the viewer is in. */
  time: string;
  /** The ET calendar day, as a holiday-table key. */
  day: string;
  phase: MarketPhase;
  /** Short caption for the phase, for rendering beside the time. */
  label: string;
}

/**
 * One formatter, built once. `hourCycle: 'h23'` rather than `hour12: false`,
 * which renders midnight as "24" on some engines.
 */
const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});

const PHASE_LABEL: Record<MarketPhase, string> = {
  pre: 'Pre-market',
  open: 'Open',
  after: 'After hours',
  closed: 'Closed',
  weekend: 'Weekend',
  holiday: 'Holiday',
};

/**
 * The market clock, in Eastern time, with the session it is in.
 *
 * The top bar used to show `new Date().toLocaleTimeString()` — the VIEWER's
 * wall clock, with nothing saying so. Measured at one instant: 03:01 in New
 * York, 08:01 in London, 16:01 in Tokyo. Sitting flush against a SPY quote in a
 * terminal, an unlabelled clock reads as market time, which is the convention it
 * was borrowing without honouring.
 *
 * Derived from the ET calendar day, not the viewer's: east of New York the
 * local date is already tomorrow for part of every session, so a holiday lookup
 * on the local date answers for the wrong day.
 */
export function marketClock(now: Date = new Date()): MarketClock {
  const p: Record<string, string> = {};
  for (const { type, value } of ET.formatToParts(now)) p[type] = value;
  const day = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}:${p.second}`;
  const mins = Number(p.hour) * 60 + Number(p.minute);
  // Half-days end at 13:00. Reading 16:00 for every session reported "Open"
  // for three hours after the bell on the Friday after Thanksgiving.
  const close = EARLY_CLOSES.has(day) ? 13 * 60 : 16 * 60;

  const phase: MarketPhase =
    p.weekday === 'Sat' || p.weekday === 'Sun'
      ? 'weekend'
      : MARKET_HOLIDAYS.has(day)
        ? 'holiday'
        : mins >= 9 * 60 + 30 && mins < close
          ? 'open'
          : mins >= 4 * 60 && mins < 9 * 60 + 30
            ? 'pre'
            : mins >= close && mins < 20 * 60
              ? 'after'
              : 'closed';

  return { time, day, phase, label: PHASE_LABEL[phase] };
}

/**
 * `HH:MM:SS` in New York for any instant.
 *
 * Every desk timestamp in the app used to be `toLocaleTimeString()` — the
 * VIEWER's wall clock — under headers that say ET, on a page rendering a US
 * session. The top bar was fixed to read New York and the desks were not, so
 * the shell and the panel under it disagreed by the reader's UTC offset: in
 * London a print stamped 14:32 sat beneath a clock reading 09:32, and nothing
 * on screen said which one was the market's.
 *
 * Same `Intl` formatter as `marketClock`, so there is one ET in the codebase
 * and not two that can drift.
 */
export const etTime = (ms: number): string => marketClock(new Date(ms)).time;

/** `HH:MM` in New York — axes and tick labels, where seconds are noise. */
export const etHm = (ms: number): string => etTime(ms).slice(0, 5);
