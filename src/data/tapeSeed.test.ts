import { describe, expect, it } from 'vitest';
import Simulator from '../core/simulator';
import { seedSessionTape } from './tapeSeed';

/**
 * The opening tape is the fix for a cold start, so what it has to guarantee is
 * depth, order and reproducibility — not a particular print.
 */
describe('seedSessionTape', () => {
  it('fills the requested depth', () => {
    expect(seedSessionTape(400)).toHaveLength(400);
  });

  it('is newest first — the order LiveTape prepends live prints in', () => {
    const tape = seedSessionTape(120);
    const secs = tape.map(o => new Date(`1970-01-01 ${o.time}`).getTime());
    for (let i = 1; i < secs.length; i++) expect(secs[i]).toBeLessThanOrEqual(secs[i - 1]);
  });

  it('replays identically for the same session', () => {
    // `time` is stamped off the wall clock and legitimately differs between two
    // calls a second apart; the print itself must not.
    const strip = (t: ReturnType<typeof seedSessionTape>) =>
      t.map(o => `${o.ticker} ${o.strike}${o.type} ${o.size} ${o.orderType} ${o.side}`);
    expect(strip(seedSessionTape(200))).toEqual(strip(seedSessionTape(200)));
  });

  it('prints only watchlist symbols, on their own strike grid', () => {
    const symbols = new Set([Simulator.getActiveTicker(), ...Simulator.WATCHLIST]);
    for (const o of seedSessionTape(300)) {
      expect(symbols.has(o.ticker)).toBe(true);
      const step = Simulator.TICKERS[o.ticker].step;
      expect(Math.abs((Number(o.strike) / step) % 1)).toBeLessThan(1e-6);
      expect(o.size).toBeGreaterThanOrEqual(10);
    }
  });

  it('holds the strike within tick()’s ±3-step band of the session path', () => {
    for (const o of seedSessionTape(300)) {
      const cfg = Simulator.TICKERS[o.ticker];
      const bars = Simulator.getCandles(o.ticker);
      const lo = Math.min(...bars.slice(-16).map(b => b.close)) - cfg.step * 3.5;
      const hi = Math.max(...bars.slice(-16).map(b => b.close)) + cfg.step * 3.5;
      expect(Number(o.strike)).toBeGreaterThanOrEqual(lo);
      expect(Number(o.strike)).toBeLessThanOrEqual(hi);
    }
  });
});
