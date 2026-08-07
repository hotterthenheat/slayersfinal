import { describe, it, expect } from 'vitest';
import { ivRankFor, ivRankFromSeries } from './ivRank';
import { dayKey } from './rng';
import { buildVolLab } from '../data/vollab';
import { buildEarningsCalendar } from '../data/earnings';

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

  it('the Vol Lab and the Earnings Hub read the identical rank for a name', () => {
    const day = dayKey();
    // Vol Lab
    expect(buildVolLab('MSFT', 448, 0.2).term.stats.ivRank).toBe(ivRankFor('MSFT', day).rank);
    // Earnings Hub — every record on the slate equals the shared source
    for (const e of buildEarningsCalendar()) {
      expect(e.ivRank).toBe(ivRankFor(e.ticker, day).rank);
    }
  });
});
