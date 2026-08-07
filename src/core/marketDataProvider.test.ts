import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import type { MarketDataProvider } from './marketDataProvider';

/*
  P5.1 — the provider seam. The compile-time conformance proof lives in
  simulator.ts (`export default Simulator satisfies MarketDataProvider`). This
  proves the same at runtime AND from the consumer's side: the app only ever
  holds the interface, never the concrete simulator, so everything a desk needs
  has to be reachable through this narrowed handle. A real feed built to this
  interface serves the whole terminal.
*/
describe('P5.1 — MarketDataProvider seam', () => {
  // The app sees the feed only through the interface, never the concrete type.
  const provider: MarketDataProvider = Simulator;

  it('exposes the full market-data surface the desks consume', () => {
    const methods = [
      'ensureTicker',
      'setActiveTicker',
      'getActiveTicker',
      'isIndex',
      'getCandles',
      'getGexHistory',
      'buildSnapshot',
      'buildSnapshotAt',
      'tick',
      'getGreeks',
    ] as const;
    for (const m of methods) expect(typeof provider[m]).toBe('function');
    expect(provider.TICKERS).toBeTruthy();
    expect(Array.isArray(provider.WATCHLIST)).toBe(true);
  });

  it('builds a well-formed snapshot through the interface handle', () => {
    const snap = provider.buildSnapshot('SPY');
    expect(snap.ticker).toBe('SPY');
    expect(snap.spot).toBeGreaterThan(0);
    expect(snap.chain.length).toBeGreaterThan(0);
    // The pinned snapshot is reproducible for the same (symbol, spot, regime).
    const a = provider.buildSnapshotAt('SPY', 500, 20000);
    const b = provider.buildSnapshotAt('SPY', 500, 20000);
    expect(a.chain.length).toBe(b.chain.length);
    expect(a.chain[0].strike).toBe(b.chain[0].strike);
  });

  it('classifies indices and prices greeks through the seam', () => {
    expect(provider.isIndex('SPX')).toBe(true);
    expect(provider.isIndex('SPY')).toBe(false);
    const g = provider.getGreeks(500, 500, 0.05, 0.15);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.deltaCall).toBeGreaterThan(0);
    expect(g.deltaPut).toBeLessThan(0);
  });
});
