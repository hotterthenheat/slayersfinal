import { describe, it, expect } from 'vitest';
import Simulator from './simulator';
import { lookup } from '../data/universe';

/*
  Regression guard for the dual-price-universe bug: the live simulator feed and
  the research universe must agree on a ticker's reference price. Before the fix
  the simulator hard-coded AAPL=190 / NVDA=120 while the research desks read
  AAPL=232.4 / NVDA=138.6 from universe.ts, so the same name showed two prices.

  READ THIS BEFORE TRUSTING THE FILENAME. Everything below is about `basePrice`,
  the REFERENCE. It is not about `currentPrice`, which is the number actually on
  the screen — and for a long time those two coherences were not the same fact.
  Reference prices agreed here while the scan board and the desk it opened showed
  different SPOTS, because the board walked the reference forward with a cosine
  and the simulator walked it forward with a hundred coin flips. This suite was
  green throughout. `core/priceWalk.test.ts` is the guard for the visible number;
  a change to how prices move belongs there, not here.
*/
describe('price coherence: simulator ↔ research universe', () => {
  it('core equity base prices are sourced from the shared universe', () => {
    expect(Simulator.TICKERS.AAPL.basePrice).toBe(lookup('AAPL')!.px);
    expect(Simulator.TICKERS.NVDA.basePrice).toBe(lookup('NVDA')!.px);
  });

  it('AAPL is priced off the universe (~232), not the retired 190', () => {
    expect(Simulator.TICKERS.AAPL.basePrice).toBeGreaterThan(200);
  });

  it('a dynamically requested universe name inherits the universe reference price', () => {
    // MSFT is not a core ticker; requesting it registers a config on demand.
    Simulator.buildSnapshot('MSFT');
    expect(Simulator.TICKERS.MSFT.basePrice).toBe(lookup('MSFT')!.px);
  });

  it('ETFs outside the equity universe keep their own reference', () => {
    expect(lookup('SPY')).toBeUndefined();
    expect(Simulator.TICKERS.SPY.basePrice).toBe(500);
  });
});
