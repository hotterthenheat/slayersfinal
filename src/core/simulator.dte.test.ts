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

  it('each book prices at ITS OWN expiry, not the old 0.003 hardcode', () => {
    /*
      This assertion used to live on `snap.chain`, and it had to move rather than
      be relaxed. The chain is the FOLD of the per-expiry books now
      (core/chainAggregate.ts), so its ATM gamma is an open-interest-weighted
      blend across the calendar and equals no single expiry's greek by
      construction. Asserting it against the front month would have been asking
      the aggregate to be the front book — the exact conflation the fold exists
      to end.

      The original claim — time comes from the calendar, not from a constant —
      is unchanged and now checked where it is actually true: on every book.
    */
    const snap = Simulator.buildSnapshot('IBM'); // a monthlies-only name
    const spot = snap.spot;
    const iv = Simulator.TICKERS['IBM'].iv;
    const nearestTo = (nodes: typeof snap.chain) =>
      nodes.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best));

    expect(snap.chainByExpiry.length).toBe(expiryCalendar('IBM').length);
    for (const book of snap.chainByExpiry) {
      const atm = nearestTo(book.nodes);
      expect(
        atm.gamma,
        `the ${book.expiry.dte}DTE book is not priced at its own t`
      ).toBeCloseTo(Simulator.getGreeks(spot, atm.strike, book.expiry.t, iv).gamma, 8);
    }
  });

  it('the aggregate is a real blend — strictly inside the range of its books', () => {
    /*
      The property that proves the fold happened. A blend of gammas cannot exceed
      the largest or fall below the smallest, and — because more than one expiry
      carries open interest — it must not EQUAL either end either. If the chain
      were still one book restated, ATM gamma would sit exactly on the front
      month's and this fails.
    */
    const snap = Simulator.buildSnapshot('IBM');
    const spot = snap.spot;
    const nearestTo = (nodes: typeof snap.chain) =>
      nodes.reduce((best, n) => (Math.abs(n.strike - spot) < Math.abs(best.strike - spot) ? n : best));

    const perBook = snap.chainByExpiry.map(b => nearestTo(b.nodes).gamma);
    const blended = nearestTo(snap.chain).gamma;

    expect(blended).toBeLessThan(Math.max(...perBook));
    expect(blended).toBeGreaterThan(Math.min(...perBook));
  });

  it('an index/large-ETF root lists a deeper ladder than a monthly name', () => {
    const spy = Simulator.buildSnapshot('SPY').chain.length; // daily -> widest
    const ibm = Simulator.buildSnapshot('IBM').chain.length; // monthly -> narrower
    expect(spy).toBeGreaterThan(ibm);
  });
});
