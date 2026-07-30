import { describe, it, expect } from 'vitest';
import {
  MARKET_HOLIDAYS,
  isTradingDay,
  nextSession,
  sessionsBetween,
  expiryFor,
  isoDate,
} from './calendar';

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
