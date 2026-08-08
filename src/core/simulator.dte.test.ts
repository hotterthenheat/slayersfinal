import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import { yearsToExpiry } from './optionTime';
import { expiryCalendar } from './expiryCalendar';

/**
 * P3.4 — every greek in the chain used to be computed at a hardcoded t = 0.003
 * (0DTE) regardless of the expiry it was labelled with. Time now comes from the
 * ticker's real front expiry, and the strike ladder is ticker-dependent.
 */
describe('P3.4 — real DTE and a ticker-dependent ladder', () => {
  it('a 0DTE and a 30DTE contract at the same strike return materially different gamma', () => {
    const g0 = Simulator.getGreeks(100, 100, yearsToExpiry(0), 0.2).gamma;
    const g30 = Simulator.getGreeks(100, 100, yearsToExpiry(30), 0.2).gamma;
    expect(g0).toBeGreaterThan(0);
    expect(g30).toBeGreaterThan(0);
    // ATM gamma concentrates as expiry nears — the 0DTE value dwarfs the 30DTE one.
    expect(g0 / g30).toBeGreaterThan(2);
  });

  it('the chain prices at its real front expiry, not the old 0.003 hardcode', () => {
    const snap = Simulator.buildSnapshot('IBM'); // a monthlies-only name
    const spot = snap.spot;
    const iv = Simulator.TICKERS['IBM'].iv;
    const atm = snap.chain.reduce((best, n) =>
      Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best
    );
    const frontT = expiryCalendar('IBM')[0].t;
    const gammaAtFront = Simulator.getGreeks(spot, atm.strike, frontT, iv).gamma;
    // The chain's greek equals the pricer at the front expiry's t — proof the
    // time came from the calendar, not from a constant.
    expect(atm.gamma).toBeCloseTo(gammaAtFront, 8);
  });

  it('an index/large-ETF root lists a deeper ladder than a monthly name', () => {
    const spy = Simulator.buildSnapshot('SPY').chain.length; // daily -> widest
    const ibm = Simulator.buildSnapshot('IBM').chain.length; // monthly -> narrower
    expect(spy).toBeGreaterThan(ibm);
  });
});
