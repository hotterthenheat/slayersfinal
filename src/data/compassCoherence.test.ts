import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildCompass, makeSetup, resetCompassCache, scannerExpiry } from './compass';
import { SCANNERS, type ImpactMetric, type ImpactRow } from '../types/compass';

/*
  Two panels, one moment, one set of numbers.

  Every defect this file pins was the same shape: a number computed correctly
  against its own spec and wrong against the thing rendered beside it. None of
  them was reachable by reading either side on its own, which is why they lived
  so long — and why the assertions here are all cross-panel rather than
  per-function.
*/

const EPOCH = 1_800_000_000;

const snap = () => {
  Simulator.ensureTicker('SPY');
  return Simulator.buildSnapshot('SPY');
};

describe('the contract chain and the board it sits beside quote the same session', () => {
  it('every preset prices its chain on the expiry it stamps on its setups', () => {
    /*
      The chain used to hardcode 1DTE regardless of the preset. On the four
      same-session presets that put next-day premiums next to a same-day board:
      measured on BAC 41.50P, the monitor header read $0.16 while the chain cell
      for the identical contract read $0.47.
    */
    const s = snap();
    for (const scanner of SCANNERS) {
      resetCompassCache();
      const data = buildCompass(s, scanner.key, { epoch: EPOCH });
      expect(data.chain.expiry, scanner.key).toBe(scannerExpiry(scanner.key));

      const iv = Simulator.TICKERS.SPY.iv;
      for (const row of data.chain.rows) {
        for (const right of ['C', 'P'] as const) {
          const cell = right === 'C' ? row.call : row.put;
          const asSetup = makeSetup('SPY', s.spot, row.strike, right, scanner.key, iv, true);
          expect(cell.premium, `${scanner.key} ${row.strike}${right}`).toBeCloseTo(asSetup.mid, 2);
        }
      }
    }
  });

  it('a same-session chain is cheaper than a next-day one, on every strike', () => {
    // The direction of the bug, held as an invariant: less time cannot be worth
    // more. If the chain ever stops taking the preset's clock this flips.
    const s = snap();
    resetCompassCache();
    const sameDay = buildCompass(s, 'top-setups', { epoch: EPOCH }).chain;
    resetCompassCache();
    const nextDay = buildCompass(s, 'discounted', { epoch: EPOCH }).chain;

    expect(sameDay.expiry).toBe('0DTE');
    expect(nextDay.expiry).toBe('1DTE');
    let strictlyCheaper = 0;
    for (let i = 0; i < sameDay.rows.length; i++) {
      expect(sameDay.rows[i].strike).toBe(nextDay.rows[i].strike);
      expect(sameDay.rows[i].call.premium).toBeLessThanOrEqual(nextDay.rows[i].call.premium);
      if (sameDay.rows[i].call.premium < nextDay.rows[i].call.premium) strictlyCheaper++;
    }
    expect(strictlyCheaper).toBeGreaterThan(0);
  });
});

describe('the impact leaderboard ranks the field, not a pre-selection', () => {
  /** The panel's own comparator, verbatim from ImpactLeaderboard.tsx. */
  const metricValue = (row: ImpactRow, metric: ImpactMetric): number =>
    metric === 'gamma'
      ? row.gamma
      : metric === 'volume'
        ? row.volume
        : metric === 'notional'
          ? row.deltaNotional
          : row.openInterest;

  it('hands over every contract in the chain rather than a top eight', () => {
    /*
      The engine used to sort by gamma and slice to eight, and the panel then
      offered four "rank by" metrics over those eight — so Volume, Notional and
      Open Int each showed the largest-by-GAMMA contracts in a different order,
      which is not the question any of those three controls asks.
    */
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    expect(impact.length).toBe(s.chain.length * 2);
    expect(impact.length).toBeGreaterThan(8);
  });

  it("each metric's top row is that metric's true maximum", () => {
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    for (const metric of ['gamma', 'volume', 'notional', 'oi'] as ImpactMetric[]) {
      const top = [...impact].sort((a, b) => metricValue(b, metric) - metricValue(a, metric))[0];
      const max = Math.max(...impact.map(r => metricValue(r, metric)));
      expect(metricValue(top, metric), metric).toBe(max);
    }
  });

  it('delta notional is exposure, not open interest in different units', () => {
    /*
      It was `oi * 100 * spot * 0.5` — a flat half-delta on every strike and both
      sides. Spot is constant across rows, so the column was a strictly monotone
      transform of open interest and the two could never rank differently. A
      column headed DEX has to disagree with OI somewhere, or it is one number
      printed twice.
    */
    const s = snap();
    resetCompassCache();
    const { impact } = buildCompass(s, 'top-setups', { epoch: EPOCH });
    const byOi = [...impact].sort((a, b) => b.openInterest - a.openInterest).map(r => r.contract);
    const byDex = [...impact].sort((a, b) => b.deltaNotional - a.deltaNotional).map(r => r.contract);
    expect(byDex).not.toEqual(byOi);

    // And it is a real delta: a deep-ITM call carries more exposure per unit of
    // open interest than a far-OTM one.
    const calls = impact.filter(r => r.contract.endsWith('C') && r.openInterest > 0);
    const perOi = calls.map(r => r.deltaNotional / r.openInterest);
    expect(Math.max(...perOi)).toBeGreaterThan(Math.min(...perOi) * 1.5);
  });
});
