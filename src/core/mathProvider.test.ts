import { describe, it, expect, afterEach } from 'vitest';
import Simulator from './simulator';
import {
  SNAPSHOT_MATH,
  isSnapshotMath,
  math,
  mathSourceId,
  resetMathProvider,
  setMathProvider,
} from './mathProvider';
import { blackScholes } from './contractScore';
import { ivRankFromSeries } from './ivRank';
import { makeSetup } from '../data/compass';
import { bsPriceAtT } from '../components/compass/contractTrackModel';
import { enrichPrint } from '../data/flowtape';
import { buildGammaTape } from '../data/gammatape';
import { realizedVolFromCandles } from '../data/volComplex';
import type { TapeOrder, Candle } from '../types/market';

/*
  THE NO-BYPASS PROOF.

  The math seam is only worth anything if registering a model actually reaches
  EVERY surface. Before the seam this app carried seven copies of the normal CDF
  and four Black-Scholes implementations, so overriding one would have moved a
  quarter of the terminal and left the rest quoting the old model — two panels on
  one screen disagreeing, the exact failure the coherence suites exist to catch.

  This file registers a SENTINEL model whose outputs cannot occur naturally, then
  asserts each dependent surface reports the sentinel. A future contributor who
  reintroduces a private pricer will fail here rather than in production.
*/

const SENTINEL_PRICE = 7.77;
const SENTINEL_GREEKS = { delta: 0.123, gamma: 0.456, theta: -0.789, vega: 1.5, rho: 0.25 };
const SENTINEL_GAMMA_DOLLARS = 1_000;

afterEach(() => {
  // Registry is module state; leaking it would poison every later test.
  resetMathProvider();
});

const bar = (i: number, close: number): Candle => ({ time: i, open: close, high: close, low: close, close, volume: 1 });

describe('math seam — registry mechanics', () => {
  it('ships on the snapshot model and reports it honestly', () => {
    expect(mathSourceId()).toBe('snapshot');
    expect(isSnapshotMath()).toBe(true);
  });

  it('a registered model takes over and is named', () => {
    setMathProvider({ id: 'house-model', optionPrice: () => SENTINEL_PRICE });
    expect(mathSourceId()).toBe('house-model');
    expect(isSnapshotMath()).toBe(false);
  });

  it('MERGES a partial model — unnamed primitives keep the snapshot', () => {
    setMathProvider({ id: 'partial', optionPrice: () => SENTINEL_PRICE });
    expect(math.optionPrice(500, 500, 0.2, 0.1, 'C')).toBe(SENTINEL_PRICE);
    // Untouched primitives still answer with the shipped math.
    expect(math.normCdf(0)).toBeCloseTo(SNAPSHOT_MATH.normCdf(0), 12);
    expect(math.gammaDollars(0.01, 10, 100)).toBe(SNAPSHOT_MATH.gammaDollars(0.01, 10, 100));
  });

  it('reset restores the shipped math', () => {
    setMathProvider({ id: 'x', optionPrice: () => SENTINEL_PRICE });
    resetMathProvider();
    expect(isSnapshotMath()).toBe(true);
    expect(math.optionPrice(500, 500, 0.2, 0.1, 'C')).not.toBe(SENTINEL_PRICE);
  });

  it('is LATE-BOUND — modules that already loaded still see the override', () => {
    // blackScholes was imported at the top of this file, long before this call.
    // If it had captured the pricer at import time this would still be snapshot.
    const before = blackScholes(500, 500, 0.2, 7, 'C').price;
    setMathProvider({ id: 'late', optionPrice: () => SENTINEL_PRICE });
    expect(blackScholes(500, 500, 0.2, 7, 'C').price).toBe(SENTINEL_PRICE);
    expect(before).not.toBe(SENTINEL_PRICE);
  });
});

describe('math seam — every pricing surface obeys the registered model', () => {
  it('the ONE pricer routes price and greeks through the seam', () => {
    setMathProvider({ id: 's', optionPrice: () => SENTINEL_PRICE, optionGreeks: () => SENTINEL_GREEKS });
    const bs = blackScholes(500, 500, 0.2, 7, 'C');
    expect(bs.price).toBe(SENTINEL_PRICE);
    expect(bs.delta).toBe(SENTINEL_GREEKS.delta);
    expect(bs.thetaDay).toBe(SENTINEL_GREEKS.theta);
  });

  it('the compass setups board quotes the registered model', () => {
    Simulator.ensureTicker('SPY');
    const cfg = Simulator.TICKERS.SPY;
    setMathProvider({ id: 's', optionPrice: () => SENTINEL_PRICE });
    const setup = makeSetup('SPY', cfg.currentPrice, cfg.currentPrice, 'C', 'top-setups', cfg.iv, true);
    expect(setup.mid).toBe(SENTINEL_PRICE);
  });

  it('the contract track forward curve prices on the registered model', () => {
    setMathProvider({ id: 's', optionPrice: () => SENTINEL_PRICE });
    expect(bsPriceAtT(500, 500, 0.2, 0.05, 'C')).toBe(SENTINEL_PRICE);
  });

  it('trade-stamped greeks on the tape come from the registered model', () => {
    setMathProvider({ id: 's', optionGreeks: () => SENTINEL_GREEKS });
    const order: TapeOrder = {
      time: '10:00:00', ticker: 'SPY', strike: '500.00', type: 'C',
      size: 50, orderType: 'BLOCK', side: 'ASK',
    };
    const print = enrichPrint(order, 1);
    expect(print.greeks?.gamma).toBe(SENTINEL_GREEKS.gamma);
    expect(print.greeks?.delta).toBe(SENTINEL_GREEKS.delta);
  });

  it('the Gamma Tape dealer book uses the registered greeks AND unit convention', () => {
    setMathProvider({
      id: 's',
      optionGreeks: () => SENTINEL_GREEKS,
      gammaDollars: () => SENTINEL_GAMMA_DOLLARS,
    });
    const order: TapeOrder = {
      time: '10:00:00', ticker: 'SPY', strike: '500.00', type: 'C',
      size: 50, orderType: 'BLOCK', side: 'ASK',
    };
    const view = buildGammaTape([enrichPrint(order, 1)], 'SPY');
    // Customer lifted the ask -> dealer short -> negative gamma of the registered size.
    expect(view.prints[0].dGamma).toBe(-SENTINEL_GAMMA_DOLLARS);
  });

  it('IV rank comes from the registered model', () => {
    setMathProvider({ id: 's', ivRank: () => ({ rank: 99, percentile: 98 }) });
    expect(ivRankFromSeries([1, 2, 3], 2)).toEqual({ rank: 99, percentile: 98 });
  });

  it('realized vol comes from the registered model', () => {
    setMathProvider({ id: 's', realizedVol: () => 42.5 });
    const candles = Array.from({ length: 30 }, (_, i) => bar(i, 100 + i));
    expect(realizedVolFromCandles(candles)).toBe(42.5);
  });

  it('the DTE->years convention is itself overridable', () => {
    setMathProvider({ id: 's', yearsToExpiry: () => 1 });
    // A 0DTE priced as though it had a full year is worth far more than the
    // snapshot's half-session floor would ever produce.
    const asYear = blackScholes(500, 500, 0.2, 0, 'C').price;
    resetMathProvider();
    const asSnapshot = blackScholes(500, 500, 0.2, 0, 'C').price;
    expect(asYear).toBeGreaterThan(asSnapshot * 10);
  });
});

describe('math seam — the shipped snapshot stays internally consistent', () => {
  it('prices a call and a put that satisfy put-call parity', () => {
    const spot = 500;
    const strike = 495;
    const t = 0.25;
    const iv = 0.2;
    const c = SNAPSHOT_MATH.optionPrice(spot, strike, iv, t, 'C');
    const p = SNAPSHOT_MATH.optionPrice(spot, strike, iv, t, 'P');
    const parity = spot - strike * Math.exp(-SNAPSHOT_MATH.riskFreeRate * t);
    expect(c - p).toBeCloseTo(parity, 6);
  });

  it('call delta and put delta differ by exactly one', () => {
    const c = SNAPSHOT_MATH.optionGreeks(500, 495, 0.2, 0.25, 'C');
    const p = SNAPSHOT_MATH.optionGreeks(500, 495, 0.2, 0.25, 'P');
    expect(c.delta - p.delta).toBeCloseTo(1, 10);
    // Gamma and vega are right-independent.
    expect(c.gamma).toBeCloseTo(p.gamma, 12);
    expect(c.vega).toBeCloseTo(p.vega, 12);
  });

  it('degenerates to intrinsic at zero time instead of NaN', () => {
    expect(SNAPSHOT_MATH.optionPrice(500, 495, 0.2, 0, 'C')).toBe(5);
    expect(SNAPSHOT_MATH.optionPrice(500, 505, 0.2, 0, 'C')).toBe(0);
    expect(SNAPSHOT_MATH.optionPrice(500, 505, 0.2, 0, 'P')).toBe(5);
    const g = SNAPSHOT_MATH.optionGreeks(500, 495, 0.2, 0, 'C');
    for (const v of [g.delta, g.gamma, g.theta, g.vega, g.rho]) expect(Number.isFinite(v)).toBe(true);
  });

  it('never returns NaN on degenerate inputs', () => {
    const cases: [number, number, number, number][] = [
      [0, 500, 0.2, 0.1],
      [500, 0, 0.2, 0.1],
      [500, 500, 0, 0.1],
      [500, 500, 0.2, -1],
    ];
    for (const [s, k, iv, t] of cases) {
      expect(Number.isFinite(SNAPSHOT_MATH.optionPrice(s, k, iv, t, 'C'))).toBe(true);
      const g = SNAPSHOT_MATH.optionGreeks(s, k, iv, t, 'C');
      expect(Number.isFinite(g.delta)).toBe(true);
      expect(Number.isFinite(g.gamma)).toBe(true);
    }
  });
});
