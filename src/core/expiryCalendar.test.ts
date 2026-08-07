import { describe, it, expect } from 'vitest';
import { expiryCalendar, listingConvention } from './expiryCalendar';
import { isTradingDay } from './calendar';
import { MIN_YEARS } from './optionTime';

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
