import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCommandView } from './command';

/**
 * P3.3 — a cash index has no share volume by definition, so the volume-derived
 * session profile must report unavailable rather than fabricate one. An ETF
 * keeps a populated block.
 */
describe('P3.3 — cash indices emit no share volume', () => {
  it('classifies index symbols and ETFs correctly', () => {
    expect(Simulator.isIndex('SPX')).toBe(true);
    expect(Simulator.isIndex('vix')).toBe(true); // case-insensitive
    expect(Simulator.isIndex('SPY')).toBe(false);
    expect(Simulator.isIndex('AAPL')).toBe(false);
  });

  it('an index session profile is unavailable and empty', () => {
    const view = buildCommandView(Simulator.buildSnapshot('SPX'));
    expect(view.sessionProfile.available).toBe(false);
    expect(view.sessionProfile.volumeByPrice).toHaveLength(0);
    expect(view.sessionProfile.sessionVolume).toBe(0);
  });

  it('an ETF session profile stays available and measures its own bars', () => {
    const view = buildCommandView(Simulator.buildSnapshot('SPY'));
    const p = view.sessionProfile;
    expect(p.available).toBe(true);
    expect(p.volumeByPrice.length).toBeGreaterThan(0);
    expect(p.sessionVolume).toBeGreaterThan(0);
    // The profile's buckets ARE the session volume: a bucket set that does not
    // sum to the total means volume was dropped or double-counted on the way in.
    const summed = p.volumeByPrice.reduce((a, r) => a + r.volume, 0);
    expect(summed).toBeCloseTo(p.sessionVolume, 6);
    // High price first, so the panel reads top-down like a price axis.
    for (let i = 1; i < p.volumeByPrice.length; i++) {
      expect(p.volumeByPrice[i].price).toBeLessThan(p.volumeByPrice[i - 1].price);
    }
    // The point of control is the bucket that actually carried the most.
    const heaviest = p.volumeByPrice.reduce((a, r) => (r.volume > a.volume ? r : a));
    expect(p.poc).toBeCloseTo(heaviest.price, 6);
  });

  /*
    The panel no longer carries a signed-flow field, and must not grow one back.

    Cumulative delta, delta-by-price and buy/sell volume all required the
    aggressor side of each trade, which needs tick-level trade-and-quote data
    this product does not receive. They were derived from the bar BODY instead.
    Nothing about the plumbing stops someone reintroducing the same proxy, so
    the absence is asserted rather than assumed.
  */
  it('carries no signed-flow field, because no bar knows its aggressor', () => {
    const p = buildCommandView(Simulator.buildSnapshot('SPY')).sessionProfile as unknown as Record<string, unknown>;
    for (const banned of ['cumulativeDelta', 'deltaByPrice', 'buyVolume', 'sellVolume', 'netDelta']) {
      expect(p[banned], `${banned} is back — see SessionProfileData`).toBeUndefined();
    }
  });
});

/**
 * P4.4 — share flow stays unavailable for a cash index, but the options book is
 * not: deltaEquiv restates it as an underlying-equivalent delta, so the panel
 * shows a real measure instead of a bare unavailable state.
 */
describe('P4.4 — cash indices carry delta-equivalent flow', () => {
  it('provides options delta-equivalent flow that reconciles across strikes', () => {
    const snap = Simulator.buildSnapshot('SPX');
    const de = buildCommandView(snap).sessionProfile.deltaEquiv;
    expect(de).toBeTruthy();
    /*
      net = call + put, and the per-strike profile sums to the net — both to a
      RELATIVE tolerance, because these are ten-figure dollar sums.

      `toBeCloseTo(x, 0)` asks for agreement within 50c on ~$10.2bn, which is
      about one part in 2e10 — past what summing thousands of per-strike terms
      in two different groupings can promise, and the sweep duly found dates
      where the two landed a dollar apart. The line below already carried slack
      for exactly this, so the assertion above was the odd one out rather than
      the strict one.

      A part in a billion still catches any real reconciliation break: the
      failure this guards is a side going missing or double-counted, which moves
      the total by percent, not by a dollar.
    */
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);
    expect(rel(de!.netDollars, de!.callDollars + de!.putDollars)).toBeLessThan(1e-9);
    const sum = de!.byStrike.reduce((a, r) => a + r.value, 0);
    expect(rel(sum, de!.netDollars)).toBeLessThan(1e-6); // per-strike rounding
    // Calls are long delta, puts short — the two sides carry opposite signs.
    expect(de!.callDollars).toBeGreaterThan(0);
    expect(de!.putDollars).toBeLessThan(0);
    // netShares is the net restated at spot.
    expect(de!.netShares).toBeCloseTo(de!.netDollars / snap.spot, -1);
  });

  it('an ETF reports real share flow and no delta-equivalent stand-in', () => {
    const view = buildCommandView(Simulator.buildSnapshot('SPY'));
    expect(view.sessionProfile.available).toBe(true);
    expect(view.sessionProfile.deltaEquiv ?? null).toBeNull();
  });
});
