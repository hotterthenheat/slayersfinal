import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCommandView } from './command';

/**
 * P3.3 — a cash index has no share volume by definition, so the volume-derived
 * order-flow block must report unavailable rather than fabricate one. An ETF
 * keeps a populated block.
 */
describe('P3.3 — cash indices emit no order flow', () => {
  it('classifies index symbols and ETFs correctly', () => {
    expect(Simulator.isIndex('SPX')).toBe(true);
    expect(Simulator.isIndex('vix')).toBe(true); // case-insensitive
    expect(Simulator.isIndex('SPY')).toBe(false);
    expect(Simulator.isIndex('AAPL')).toBe(false);
  });

  it('an index order-flow block is unavailable and empty', () => {
    const view = buildCommandView(Simulator.buildSnapshot('SPX'));
    expect(view.orderFlow.available).toBe(false);
    expect(view.orderFlow.cumulativeDelta).toHaveLength(0);
    expect(view.orderFlow.deltaByPrice).toHaveLength(0);
    expect(view.orderFlow.buyVolume).toBe(0);
    expect(view.orderFlow.sellVolume).toBe(0);
  });

  it('an ETF order-flow block stays available', () => {
    const view = buildCommandView(Simulator.buildSnapshot('SPY'));
    expect(view.orderFlow.available).toBe(true);
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
    const de = buildCommandView(snap).orderFlow.deltaEquiv;
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
    expect(view.orderFlow.available).toBe(true);
    expect(view.orderFlow.deltaEquiv ?? null).toBeNull();
  });
});
