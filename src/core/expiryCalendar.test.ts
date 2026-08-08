import { describe, it, expect } from 'vitest';
import { expiryCalendar, listingConvention, isMonthlyExpiry, monthlyExpiryFor } from './expiryCalendar';
import { isTradingDay } from './calendar';
import { MIN_YEARS } from './optionTime';

describe('monthly (OPEX) expiry identification', () => {
  it('identifies an ordinary third Friday', () => {
    // May 2030: Fridays are 3, 10, 17, 24, 31 — the third is the 17th, and it
    // is not a holiday.
    expect(isMonthlyExpiry(new Date(2030, 4, 17))).toBe(true);
    expect(isMonthlyExpiry(new Date(2030, 4, 10))).toBe(false);
    expect(isMonthlyExpiry(new Date(2030, 4, 24))).toBe(false);
  });

  it('rolls a holiday third Friday back to Thursday — the case the open-coded test got backwards', () => {
    // April 2030: Fridays are 5, 12, 19, 26. The third Friday is the 19th,
    // which IS Good Friday 2030 (in core/calendar's holiday table), so the
    // monthly settles Thursday the 18th.
    //
    // The predicate this replaced was `day === Friday && 15 <= date <= 21`. On
    // this month it returned TRUE for the 19th (a day the market is shut, so
    // nothing expires) and FALSE for the 18th (the day the monthly actually
    // settles) — inverting the answer on both dates, and dropping the OI
    // concentration off the largest rung on the board.
    expect(isTradingDay(new Date(2030, 3, 19))).toBe(false);
    expect(isMonthlyExpiry(new Date(2030, 3, 19))).toBe(false);

    expect(isTradingDay(new Date(2030, 3, 18))).toBe(true);
    expect(isMonthlyExpiry(new Date(2030, 3, 18))).toBe(true);
    expect(monthlyExpiryFor(new Date(2030, 3, 1)).getDate()).toBe(18);
  });

  it('agrees with the ladder the calendar itself builds', () => {
    // Every monthly rung a monthly-listing root returns must pass the test —
    // if the two ever disagree, one of them is lying about the same date.
    for (const e of expiryCalendar('ZZZZ')) {
      expect(isMonthlyExpiry(e.date)).toBe(true);
    }
  });
});

describe('expiry calendar (P3.2)', () => {
  it('classifies roots by listing convention', () => {
    expect(listingConvention('SPY')).toBe('daily');
    expect(listingConvention('SPX')).toBe('daily');
    expect(listingConvention('AAPL')).toBe('weekly');
    expect(listingConvention('NVDA')).toBe('weekly');
    // An obscure name not on either list falls through to monthlies.
    expect(listingConvention('ZZZZ')).toBe('monthly');
  });

  it('returns strictly-increasing, holiday-correct expiries with time from optionTime', () => {
    for (const t of ['SPY', 'AAPL', 'ZZZZ']) {
      const cal = expiryCalendar(t);
      expect(cal.length).toBeGreaterThan(0);
      for (let i = 0; i < cal.length; i++) {
        const e = cal[i];
        expect(isTradingDay(e.date)).toBe(true);
        expect(e.dte).toBeGreaterThanOrEqual(0);
        expect(e.sessions).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeGreaterThanOrEqual(MIN_YEARS);
        if (i > 0) expect(e.date.getTime()).toBeGreaterThan(cal[i - 1].date.getTime());
      }
    }
  });

  it('two tickers with different conventions render different column sets', () => {
    const daily = expiryCalendar('SPY').map(e => e.dte);
    const monthly = expiryCalendar('ZZZZ').map(e => e.dte);
    // A daily root front-loads near-term expiries; a monthly root does not — the
    // nearest monthly is weeks out, so the two column sets cannot coincide.
    expect(daily).not.toEqual(monthly);
    expect(daily[0]).toBeLessThan(monthly[monthly.length - 1]);
    // The daily root reaches a nearer front expiry than the monthly root.
    expect(daily[0]).toBeLessThanOrEqual(monthly[0]);
  });
});
