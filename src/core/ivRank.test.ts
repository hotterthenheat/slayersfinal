import { describe, it, expect } from 'vitest';
import { ivRankFor, ivRankFromSeries } from './ivRank';
import { dayKey } from './rng';
import { buildVolLab } from '../data/vollab';
import { buildVolComplex } from '../data/volComplex';
import Simulator from './simulator';

describe('P2.1 — one IV rank, shared by every desk', () => {
  it('ivRankFor is deterministic per (ticker, day) and stays in range', () => {
    const a = ivRankFor('MSFT', '2026-08-07');
    expect(a).toEqual(ivRankFor('MSFT', '2026-08-07'));
    expect(a.rank).toBeGreaterThanOrEqual(0);
    expect(a.rank).toBeLessThanOrEqual(100);
    expect(a.percentile).toBeGreaterThanOrEqual(0);
    expect(a.percentile).toBeLessThanOrEqual(100);
  });

  it('ivRankFromSeries ranks current within its series', () => {
    expect(ivRankFromSeries([10, 20, 30, 40, 50], 30)).toEqual({ rank: 50, percentile: 60 });
    expect(ivRankFromSeries([10, 20, 30, 40, 50], 50)).toEqual({ rank: 100, percentile: 100 });
    expect(ivRankFromSeries([], 30)).toEqual({ rank: 50, percentile: 50 });
  });

  it('the Vol Lab and the Vol Complex read the identical rank for a name', () => {
    /*
      TWO independent readers, deliberately. The invariant this file names is
      that ONE rank is shared, and a single witness cannot show sharing — it
      only shows that one caller agrees with the source.

      The second witness used to be the Earnings Hub, which read the same rank
      across its whole slate. That desk was removed (no earnings calendar on any
      feed tier), so the Vol Complex takes its place: it is a separate engine,
      on a separate desk, resolving the rank through the same ivRankFor.
    */
    const day = dayKey();
    expect(buildVolLab('MSFT', 448, 0.2).term.stats.ivRank).toBe(ivRankFor('MSFT', day).rank);
    Simulator.ensureTicker('MSFT');
    const cfg = Simulator.TICKERS.MSFT;
    expect(buildVolComplex('MSFT', cfg.currentPrice, cfg.iv, Simulator.getCandles('MSFT')).ivRank).toBe(
      ivRankFor('MSFT', day).rank
    );
  });
});
