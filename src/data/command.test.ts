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
