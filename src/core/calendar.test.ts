import { describe, it, expect } from 'vitest';
import {
  CALENDAR_THROUGH,
  MARKET_HOLIDAYS,
  etHm,
  etTime,
  isTradingDay,
  nextSession,
  sessionsBetween,
  expiryFor,
  EARLY_CLOSES,
  isoDate,
  marketClock,
  today,
} from './calendar';
import { LADDER_RUNGS, expiryLadder } from './contractQuery';

/** Local-midnight date from a y-m-d triple — never `new Date('2026-07-04')`,
    which parses as UTC and shifts a day in negative-offset zones. */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('MARKET_HOLIDAYS', () => {
  it('never lists a holiday that falls on a weekend', () => {
    for (const key of MARKET_HOLIDAYS) {
      const [y, m, day] = key.split('-').map(Number);
      const dow = d(y, m, day).getDay();
      expect({ key, dow }).toMatchObject({ key, dow: expect.any(Number) });
      expect(dow === 0 || dow === 6).toBe(false);
    }
  });

  it('observes Jul 4 2026 (a Saturday) on the preceding Friday', () => {
    expect(MARKET_HOLIDAYS.has('2026-07-03')).toBe(true);
    expect(MARKET_HOLIDAYS.has('2026-07-04')).toBe(false);
  });
});

describe('isTradingDay', () => {
  it('rejects weekends', () => {
    expect(isTradingDay(d(2026, 7, 25))).toBe(false); // Sat
    expect(isTradingDay(d(2026, 7, 26))).toBe(false); // Sun
  });

  it('rejects holidays', () => {
    expect(isTradingDay(d(2026, 12, 25))).toBe(false); // Christmas, a Friday
  });

  it('accepts an ordinary weekday', () => {
    expect(isTradingDay(d(2026, 7, 29))).toBe(true); // Wed
  });
});

describe('nextSession', () => {
  it('returns the same day when the market is open', () => {
    expect(isoDate(nextSession(d(2026, 7, 29)))).toBe('2026-07-29');
  });

  it('rolls a Saturday forward to Monday', () => {
    expect(isoDate(nextSession(d(2026, 7, 25)))).toBe('2026-07-27');
  });

  it('skips a holiday that opens the week', () => {
    // Sat Jan 17 2026 → Mon Jan 19 is MLK Day → Tue Jan 20
    expect(isoDate(nextSession(d(2026, 1, 17)))).toBe('2026-01-20');
  });
});

describe('sessionsBetween', () => {
  it('is zero for a non-advancing range', () => {
    expect(sessionsBetween(d(2026, 7, 29), d(2026, 7, 29))).toBe(0);
    expect(sessionsBetween(d(2026, 7, 29), d(2026, 7, 28))).toBe(0);
  });

  it('counts a plain Mon→Fri week as 5', () => {
    expect(sessionsBetween(d(2026, 7, 24), d(2026, 7, 31))).toBe(5);
  });

  it('excludes the holiday inside the range', () => {
    // Wed Jul 1 → Wed Jul 8 2026: Thu 2, Fri 3 (holiday), Mon 6, Tue 7, Wed 8
    expect(sessionsBetween(d(2026, 7, 1), d(2026, 7, 8))).toBe(4);
  });

  it('agrees with a naive day-by-day walk over a long LEAPS-length range', () => {
    const from = d(2026, 7, 29);
    const to = d(2027, 11, 22); // ~480 calendar days out
    let naive = 0;
    const cur = new Date(from);
    while (cur < to) {
      cur.setDate(cur.getDate() + 1);
      if (isTradingDay(cur)) naive++;
    }
    expect(sessionsBetween(from, to)).toBe(naive);
  });
});

describe('expiryFor', () => {
  it('never lands on a weekend or holiday, across a full year of horizons', () => {
    const from = d(2026, 7, 29);
    for (let dte = 0; dte <= 365; dte++) {
      const e = expiryFor(dte, from);
      expect({ dte, day: e.weekday, open: isTradingDay(e.date) }).toEqual({
        dte,
        day: e.weekday,
        open: true,
      });
    }
  });

  it('walks a Saturday target back to the Friday', () => {
    // Wed Jul 29 + 3 = Sat Aug 1 → Fri Jul 31
    expect(expiryFor(3, d(2026, 7, 29)).label).toBe('07/31/26');
  });

  it('goes forward when walking back would reach today or earlier', () => {
    // Fri Jul 31 + 2 = Sun Aug 2. Backward lands on Fri Jul 31 (today), so the
    // request must resolve forward to Mon Aug 3 rather than collapse to 0DTE.
    const e = expiryFor(2, d(2026, 7, 31));
    expect(e.label).toBe('08/03/26');
    expect(e.dte).toBe(3);
  });

  it('treats dte 0 as today when the market is open', () => {
    expect(expiryFor(0, d(2026, 7, 29)).dte).toBe(0);
  });

  it('rolls a 0DTE request on a closed day to the next session', () => {
    const e = expiryFor(0, d(2026, 7, 25)); // Saturday
    expect(e.label).toBe('07/27/26');
    expect(e.weekday).toBe('Mon');
  });

  it('reports calendar dte and trading sessions as different numbers', () => {
    const e = expiryFor(30, d(2026, 7, 29));
    expect(e.dte).toBeGreaterThan(e.sessions);
    expect(e.sessions).toBe(sessionsBetween(d(2026, 7, 29), e.date));
  });

  it('clamps a negative horizon rather than walking into the past', () => {
    const e = expiryFor(-5, d(2026, 7, 29));
    expect(e.dte).toBe(0);
  });
});

describe('matrix column horizons resolve to distinct sessions', () => {
  // The GEX matrix asks for [0,1,2,5,7] calendar days. Two horizons can resolve
  // to the same session (from a Thursday, 1d and 2d are both that Friday), which
  // would render two columns under one date. Reproduced here for every weekday
  // start so the de-dup rule in gex.ts can't silently regress.
  const HORIZONS = [0, 1, 2, 5, 7];

  const columns = (from: Date) => {
    const out: Date[] = [];
    let prev: Date | null = null;
    for (const h of HORIZONS) {
      let date = expiryFor(h, from).date;
      if (prev !== null && date <= prev) {
        const after = new Date(prev);
        after.setDate(after.getDate() + 1);
        date = nextSession(after);
      }
      prev = date;
      out.push(date);
    }
    return out;
  };

  it('collides without the de-dup rule (the bug this guards)', () => {
    // Thu Jul 30 2026: 1d -> Fri Jul 31, and 2d -> Sat Aug 1 -> back to Fri Jul 31
    const raw = HORIZONS.map(h => isoDate(expiryFor(h, d(2026, 7, 30)).date));
    expect(new Set(raw).size).toBeLessThan(HORIZONS.length);
  });

  it('yields strictly increasing distinct sessions from every day of a full year', () => {
    const start = d(2026, 7, 1);
    for (let i = 0; i < 365; i++) {
      const from = new Date(start);
      from.setDate(from.getDate() + i);
      const cols = columns(from);
      const keys = cols.map(isoDate);
      expect({ from: isoDate(from), unique: new Set(keys).size }).toEqual({
        from: isoDate(from),
        unique: HORIZONS.length,
      });
      for (let k = 1; k < cols.length; k++) expect(cols[k].getTime()).toBeGreaterThan(cols[k - 1].getTime());
      for (const c of cols) expect(isTradingDay(c)).toBe(true);
    }
  });
});

/**
 * The only tests in this file that read the clock on purpose.
 *
 * Everything above pins a fixed date, because a suite whose inputs move with
 * the wall clock is a suite that goes red on a Tuesday for no reason — this
 * project measured 45 red days out of 121 that way. A holiday table is the one
 * thing here that genuinely expires, though, and nothing else notices when it
 * does: `contractQuery` drops every ladder rung past the table rather than
 * counting Thanksgiving as a session, so the expiry picker gets SHORTER, not
 * wrong. Silent and correct is worse than loud and correct here, because the
 * fix takes an afternoon and the warning has to arrive years early.
 */
describe('the calendar has not run out', () => {
  const LONGEST_RUNG_DAYS = 365;

  it('still covers the longest contract the picker can offer, with two years of lead time', () => {
    const horizon = today();
    horizon.setDate(horizon.getDate() + LONGEST_RUNG_DAYS + 365 * 2);
    const need = horizon.getFullYear();
    expect(
      CALENDAR_THROUGH,
      `MARKET_HOLIDAYS must reach ${need} to keep pricing the 365d rung. Extend the table.`,
    ).toBeGreaterThanOrEqual(need);
  });

  it('drops no rung from today’s expiry ladder', () => {
    /*
      The symptom the lead-time guard exists to pre-empt, asserted directly:
      the year clamp silently `continue`s past any rung the table cannot price.

      This used to read `expect(ladder.length).toBeGreaterThanOrEqual(14)`,
      which is a different claim and a false one. `expiryLadder` drops a rung
      for TWO reasons, and only one of them is the defect. The other is the
      de-dup: from a Friday, 1d/2d/3d all resolve to the following Monday, and
      a holiday inside a horizon collapses another pair. Swept across a year the
      rail is 12 entries once, 13 on 61 days, 14 on 266 and 15 on 37 — so the
      floor of 14 was one weekday's count read off the day it was written, and
      it went red on 62 days in 365 while the calendar was perfectly healthy.

      Comparing against the rungs' own distinct-session count separates the two.
      De-dup moves both sides of the comparison and cancels out; the year clamp
      moves only `ladder`, which is exactly the failure worth waking up for.
      (The de-dup's own behaviour is pinned in contractQuery.test.ts, against a
      FIXED Friday, where counting rungs is a stable thing to do.)
    */
    const ladder = expiryLadder();
    const distinct = new Set(LADDER_RUNGS.map(r => expiryFor(r).label));
    expect(
      ladder.length,
      `${distinct.size - ladder.length} rung(s) fell past MARKET_HOLIDAYS. Extend the table.`,
    ).toBe(distinct.size);
    for (const e of ladder) {
      expect(e.date.getFullYear()).toBeLessThanOrEqual(CALENDAR_THROUGH);
      expect(isTradingDay(e.date)).toBe(true);
    }
  });
});

/**
 * The market clock. Every case passes an explicit instant, so these are the
 * rare assertions in this suite that do NOT read the wall clock — which is the
 * point: the thing under test is that the answer depends on the instant and not
 * on where the reader happens to be sitting.
 */
describe('marketClock', () => {
  // 2026-06-15 is a Monday. 14:30Z is 10:30 in New York during EDT.
  const at = (iso: string) => marketClock(new Date(iso));

  it('reports New York time regardless of the runtime zone', () => {
    expect(at('2026-06-15T14:30:00Z').time).toBe('10:30:00');
    expect(at('2026-06-15T14:30:00Z').day).toBe('2026-06-15');
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // January is EST (UTC-5), June is EDT (UTC-4). Same UTC clock time, one
    // hour apart in New York — a hardcoded offset gets one of these wrong.
    expect(at('2026-01-15T14:30:00Z').time).toBe('09:30:00');
    expect(at('2026-06-15T14:30:00Z').time).toBe('10:30:00');
  });

  it('names each session phase at its boundaries', () => {
    expect(at('2026-06-15T13:29:00Z').phase).toBe('pre'); // 09:29 ET
    expect(at('2026-06-15T13:30:00Z').phase).toBe('open'); // 09:30 ET
    expect(at('2026-06-15T19:59:00Z').phase).toBe('open'); // 15:59 ET
    expect(at('2026-06-15T20:00:00Z').phase).toBe('after'); // 16:00 ET
    expect(at('2026-06-15T23:59:00Z').phase).toBe('after'); // 19:59 ET
    expect(at('2026-06-16T00:00:00Z').phase).toBe('closed'); // 20:00 ET
    expect(at('2026-06-15T07:59:00Z').phase).toBe('closed'); // 03:59 ET
    expect(at('2026-06-15T08:00:00Z').phase).toBe('pre'); // 04:00 ET
  });

  it('knows weekends and holidays', () => {
    expect(at('2026-06-13T14:30:00Z').phase).toBe('weekend'); // Saturday
    expect(at('2026-06-14T14:30:00Z').phase).toBe('weekend'); // Sunday
    // Independence Day observed, and it is in the table this code reads.
    const jul3 = at('2026-07-03T14:30:00Z');
    expect(MARKET_HOLIDAYS.has(jul3.day)).toBe(true);
    expect(jul3.phase).toBe('holiday');
  });

  it('uses the Eastern day for the holiday lookup, not the reader\'s', () => {
    // 2026-07-03T23:00Z is 19:00 on the 3rd in New York but already the 4th in
    // Tokyo. Reading the local date would answer for the wrong day.
    expect(at('2026-07-03T23:00:00Z').day).toBe('2026-07-03');
  });

  it('never renders midnight as hour 24', () => {
    expect(at('2026-06-15T04:00:00Z').time.startsWith('00:')).toBe(true); // 00:00 ET
  });

  it('carries a caption for every phase it can return', () => {
    for (const iso of [
      '2026-06-15T14:30:00Z', '2026-06-15T12:00:00Z', '2026-06-15T21:00:00Z',
      '2026-06-15T02:00:00Z', '2026-06-13T14:30:00Z', '2026-07-03T14:30:00Z',
    ]) {
      expect(at(iso).label).toMatch(/\S/);
    }
  });
});

describe('marketClock on scheduled half-days', () => {
  const at = (iso: string) => marketClock(new Date(iso));

  it('closes the Friday after Thanksgiving at 13:00 ET', () => {
    // 2026-11-27. 18:30Z is 13:30 in New York during EST.
    expect(EARLY_CLOSES.has('2026-11-27')).toBe(true);
    expect(at('2026-11-27T17:59:00Z').phase).toBe('open'); // 12:59 ET
    expect(at('2026-11-27T18:00:00Z').phase).toBe('after'); // 13:00 ET
    expect(at('2026-11-27T18:30:00Z').phase).toBe('after'); // was 'open' for 3 more hours
  });

  it('leaves a normal session open until 16:00', () => {
    // The Monday after, same week, not a half-day.
    expect(EARLY_CLOSES.has('2026-11-30')).toBe(false);
    expect(at('2026-11-30T18:30:00Z').phase).toBe('open'); // 13:30 ET
    expect(at('2026-11-30T21:00:00Z').phase).toBe('after'); // 16:00 ET
  });

  it('does not invent half-days where the date lands on a weekend', () => {
    // 2027 has neither a July nor a December half-day: Jul 3 is a Saturday and
    // Dec 24 is the OBSERVED Christmas holiday, a full close.
    expect([...EARLY_CLOSES].filter(d => d.startsWith('2027'))).toEqual(['2027-11-26']);
    expect(EARLY_CLOSES.has('2026-07-03')).toBe(false); // full holiday, not a half-day
  });

  it('never marks a full holiday as an early close', () => {
    for (const d of EARLY_CLOSES) expect(MARKET_HOLIDAYS.has(d)).toBe(false);
  });

  it('covers the same years as the holiday table', () => {
    const years = new Set([...EARLY_CLOSES].map(d => d.slice(0, 4)));
    for (let y = 2026; y <= CALENDAR_THROUGH; y++) expect(years.has(String(y))).toBe(true);
  });

  it('lands every early close on a weekday', () => {
    for (const d of EARLY_CLOSES) {
      const [y, m, day] = d.split('-').map(Number);
      const dow = new Date(y, m - 1, day).getDay();
      expect(dow).toBeGreaterThan(0);
      expect(dow).toBeLessThan(6);
    }
  });
});

describe('etTime — one Eastern clock for every stamp in the app', () => {
  /*
    Nine sites used to call `toLocaleTimeString()` and print the VIEWER's wall
    clock: both simulator tape builders, the seeded tape, the Compass sweep
    stamp, the Vanna wall-drift axis, the community book, and the "scan HH:MM:SS
    · 10s" line on four Pinpoint views. The top bar had already been fixed to
    read New York, so the shell and the panel under it disagreed by the reader's
    UTC offset — in London a print stamped 14:32 sat beneath a clock reading
    09:32, with nothing on screen saying which was the market's.

    Fixed instants, so this cannot pass by running in a lucky timezone. If the
    process TZ ever leaks into the formatter, the second assertion in each pair
    is what catches it: 21:30 UTC is a different ET hour in August than in
    January, and a local-time implementation would return the same string twice.
  */
  it('returns New York time, not the process timezone', () => {
    // 2026-08-05 is EDT (UTC-4). 16:30 UTC is 12:30 in New York.
    expect(etTime(Date.parse('2026-08-05T16:30:00Z'))).toBe('12:30:00');
    // 2026-01-14 is EST (UTC-5). The same UTC clock time is an hour earlier.
    expect(etTime(Date.parse('2026-01-14T16:30:00Z'))).toBe('11:30:00');
  });

  it('crosses midnight on the ET side, not the UTC side', () => {
    // 03:15 UTC on the 6th is still 23:15 on the 5th in New York.
    expect(etTime(Date.parse('2026-08-06T03:15:42Z'))).toBe('23:15:42');
  });

  it('renders midnight as 00, never 24', () => {
    // `hourCycle: 'h23'`, not `hour12: false` — some engines print "24:07:00".
    expect(etTime(Date.parse('2026-08-06T04:07:00Z'))).toBe('00:07:00');
  });

  it('etHm is etTime without the seconds', () => {
    const ms = Date.parse('2026-08-05T19:59:59Z');
    expect(etTime(ms)).toBe('15:59:59');
    expect(etHm(ms)).toBe('15:59');
  });

  it('agrees with the market clock the top bar renders', () => {
    // The one thing that must never drift: the shell's time and a desk stamp
    // are the same instant through the same formatter.
    const ms = Date.parse('2026-08-05T18:04:33Z');
    expect(etTime(ms)).toBe(marketClock(new Date(ms)).time);
  });
});
