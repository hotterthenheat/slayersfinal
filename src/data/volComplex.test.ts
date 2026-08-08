import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildVolComplex, realizedVolFromCandles } from './volComplex';
import { ivRankFor } from '../core/ivRank';
import { dayKey } from '../core/rng';
import type { Candle } from '../types/market';

const bar = (i: number, close: number): Candle => ({ time: i, open: close, high: close, low: close, close, volume: 1 });

describe('What-Else — volatility complex', () => {
  it('realized vol is zero on a flat tape and positive on a moving one', () => {
    const flat = Array.from({ length: 50 }, (_, i) => bar(i, 100));
    expect(realizedVolFromCandles(flat)).toBe(0);
    const moving = Array.from({ length: 200 }, (_, i) => bar(i, 100 * Math.exp((i % 2 ? 1 : -1) * 0.001)));
    expect(realizedVolFromCandles(moving)).toBeGreaterThan(0);
  });

  it('synthesizes a coherent complex for a name', () => {
    Simulator.ensureTicker('NVDA');
    const cfg = Simulator.TICKERS.NVDA;
    const v = buildVolComplex('NVDA', cfg.currentPrice, cfg.iv, Simulator.getCandles('NVDA'));

    // Term regime agrees with the slope sign, and slope is back − front.
    expect(v.slope).toBeCloseTo(v.backIv - v.frontIv, 6);
    if (v.slope > 0.5) expect(v.termRegime).toBe('CONTANGO');
    else if (v.slope < -0.5) expect(v.termRegime).toBe('BACKWARDATION');
    else expect(v.termRegime).toBe('FLAT');

    // The vol risk premium is implied minus REALIZED, not a guess.
    expect(v.vrp).toBeCloseTo(v.frontIv - v.realizedVol, 2);

    // IV rank is the ONE shared rank (P2.1) — the Vol Lab reads it too.
    expect(v.ivRank).toBe(ivRankFor('NVDA', dayKey()).rank);

    expect(v.termCurve.length).toBeGreaterThan(3);
    expect(v.read.length).toBeGreaterThan(40);
  });

  it('classifies rich/cheap consistently with its own rule', () => {
    for (const t of ['SPY', 'QQQ', 'NVDA', 'AAPL']) {
      Simulator.ensureTicker(t);
      const cfg = Simulator.TICKERS[t];
      const v = buildVolComplex(t, cfg.currentPrice, cfg.iv, Simulator.getCandles(t));
      if (v.richCheap === 'RICH') {
        expect(v.vrp).toBeGreaterThanOrEqual(3);
        expect(v.ivRank).toBeGreaterThanOrEqual(40);
      }
      if (v.richCheap === 'CHEAP') expect(v.vrp <= 0 || v.ivRank <= 25).toBe(true);
    }
  });

  it('is deterministic per (ticker, spot)', () => {
    const candles = Simulator.getCandles('SPY');
    const a = buildVolComplex('SPY', 500, 0.15, candles);
    const b = buildVolComplex('SPY', 500, 0.15, candles);
    expect(a).toEqual(b);
  });
});
