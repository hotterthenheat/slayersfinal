import { describe, it, expect } from 'vitest';
import Simulator from '../../core/simulator';
import { makeSetup } from '../../data/skyvision';
import { weighContracts, type Horizon } from '../../core/contractScore';
import {
  BS_FLOOR,
  PREMIUM_FLOOR,
  bsPriceAtT,
  buildTrack,
  premiumAtT,
  sessionsForExpiry,
  setupToPlan,
  spotForPremium,
  weighedToPlan,
} from './contractTrack';
import type { OptionRight, ScannerKey } from '../../types/skyvision';

/*
  The chart's copy of core/priceCoherence.test.ts. The regression class is "the
  same thing showed two prices": a line whose last point is not the number
  printed beside it is exactly the failure the derived series exists to avoid.

  Tests 4a/4b are the load-bearing ones. `premiumAtT` and `bsPriceAtT` in
  contractTrack.ts are the UNCAPPED cores of `estimatePremium` (data/skyvision.ts)
  and `blackScholes` (core/contractScore.ts) — copies, because neither engine
  exports its core today. Feeding the clamped time back in must reproduce the
  engine's own output exactly, so any change to either engine that this file does
  not follow fails here rather than drawing a quietly wrong line.

  The permanent fix is a pure extraction in each engine (`bsAtT` / `premiumAtT`
  taking T as an argument, with the existing clamped wrapper kept byte-identical
  for every current caller); once those exist, delete the copies here and import
  them. These tests keep passing either way.
*/

const SCANNERS: ScannerKey[] = ['top-setups', 'quick-scalp', 'discounted', 'rebounds', 'whale-sweeps'];

/**
 * How far a Black-Scholes reprice may legitimately miss `WeighedContract.mid`.
 *
 * Nothing here is model error. Two lossy stores sit between the engine's own
 * price and what a screen can read back: `mid` is `toFixed(2)` (±0.005) and
 * `ivPct` is `toFixed(1)`, so recovering iv costs at most 0.0005 — and a wrong
 * iv costs vega dollars. Vega peaks at spot·√T·φ(0), so the bound grows with
 * the square root of the horizon: sub-cent on a lotto, ~10c on a LEAPS. A flat
 * tolerance would either pass a broken lotto or fail a healthy LEAPS.
 */
function ivRoundingBound(spot: number, dte: number): number {
  const T = Math.max(dte, 0.5) / 365;
  const vegaMax = spot * Math.sqrt(T) * 0.3989;
  return 0.005 + vegaMax * 0.0005;
}

function setupFor(ticker: string, offset: number, right: OptionRight, scanner: ScannerKey) {
  Simulator.ensureTicker(ticker);
  const cfg = Simulator.TICKERS[ticker];
  const strike = Math.round((cfg.currentPrice + offset * cfg.step) / cfg.step) * cfg.step;
  return makeSetup(ticker, cfg.currentPrice, strike, right, scanner, cfg.iv, true);
}

describe('contract track: the last point IS the printed mid', () => {
  const cases: [string, number, OptionRight, ScannerKey][] = [
    ['SPY', 0, 'C', 'top-setups'], // 0DTE call
    ['SPY', 1, 'P', 'quick-scalp'], // 0DTE put
    ['NVDA', -1, 'C', 'discounted'], // 1DTE call
    ['NVDA', 2, 'P', 'rebounds'], // 1DTE put
    ['QQQ', 0, 'C', 'whale-sweeps'],
  ];

  it.each(cases)('%s %d %s / %s pins past and forward to setup.mid', (ticker, k, right, scanner) => {
    const setup = setupFor(ticker, k, right, scanner);
    const track = buildTrack(setupToPlan(setup), Simulator.getCandles(ticker));

    const last = track.past[track.past.length - 1];
    expect(Number(last.premium.toFixed(2))).toBe(setup.mid);
    // and it is exact, not merely rounded to the same cent
    expect(last.premium).toBe(setup.mid);
    // no seam at NOW
    expect(track.forward[0].premium).toBe(last.premium);
    expect(last.bar).toBe(0);
    expect(track.forward[0].bar).toBe(0);
  });

  it('the unpinned reprice already lands on the printed mid to the cent', () => {
    // The pin is enforced, not relied on: strip it and the model still agrees,
    // because the engine quoted this contract off this very bar close.
    let worst = 0;
    for (const ticker of ['SPY', 'QQQ', 'AAPL', 'NVDA']) {
      const bars = Simulator.getCandles(ticker);
      const close = bars[bars.length - 1].close;
      for (const scanner of SCANNERS) {
        for (const k of [-2, 0, 2]) {
          for (const right of ['C', 'P'] as OptionRight[]) {
            const setup = setupFor(ticker, k, right, scanner);
            const plan = setupToPlan(setup);
            worst = Math.max(worst, Math.abs(plan.priceAt(close, plan.sessionsLeft) - setup.mid));
          }
        }
      }
    }
    // 0.005 is Number(x.toFixed(2)) in makeSetup and nothing else.
    expect(worst).toBeLessThanOrEqual(0.005);
  });
});

describe('contract track: weigher adapter', () => {
  it.each(['LOTTO', 'WEEKLIES', 'SWINGS'] as Horizon[])('%s reprices WeighedContract.mid', horizon => {
    const snap = Simulator.buildSnapshot('SPY');
    const candidates = weighContracts(snap, horizon);
    expect(candidates.length).toBeGreaterThan(0);
    for (const w of candidates) {
      const plan = weighedToPlan(w);
      const re = plan.priceAt(snap.spot, plan.sessionsLeft);
      expect(Math.abs(re - w.mid)).toBeLessThanOrEqual(ivRoundingBound(snap.spot, w.dte));
    }
  });

  it('carries contractScore time in sessions, exactly', () => {
    const snap = Simulator.buildSnapshot('SPY');
    for (const w of weighContracts(snap, 'SWINGS')) {
      const plan = weighedToPlan(w);
      expect(plan.sessionsLeft / 252).toBeCloseTo(Math.max(w.dte, 0.5) / 365, 12);
    }
  });

  it('produces no ladder and no invalidation, because the engine has neither', () => {
    const snap = Simulator.buildSnapshot('SPY');
    const plan = weighedToPlan(weighContracts(snap, 'LOTTO')[0]);
    expect(plan.rungs).toEqual([]);
    expect(plan.invalidation).toBeNull();
    expect(plan.spotMarks.map(m => m.label)).toContain('BREAKEVEN');

    const track = buildTrack(plan, Simulator.getCandles('SPY'));
    expect(track.rungs).toEqual([]);
    expect(track.dockedRungs).toEqual([]);
    expect(track.invalidationCurve).toBeNull();
  });
});

describe('contract track: the uncapped cores reproduce the engines', () => {
  it('premiumAtT at the clamped time equals the skyvision mid on a grid', () => {
    // estimatePremium is not exported, so the engine is probed through its only
    // consumer: makeSetup rounds to 2dp, which is the whole tolerance.
    for (const ticker of ['SPY', 'NVDA']) {
      Simulator.ensureTicker(ticker);
      const cfg = Simulator.TICKERS[ticker];
      for (const scanner of SCANNERS) {
        for (const k of [-4, -1, 0, 3]) {
          for (const right of ['C', 'P'] as OptionRight[]) {
            const setup = setupFor(ticker, k, right, scanner);
            const sessions = sessionsForExpiry(setup.expiry);
            const re = premiumAtT(
              cfg.currentPrice,
              setup.strike,
              right,
              setup.greeks.iv / 100,
              Math.max(0.5, sessions) / 252
            );
            expect(Number(re.toFixed(2))).toBe(setup.mid);
          }
        }
      }
    }
  });

  it('bsPriceAtT at the clamped time equals the weigher mid on a grid', () => {
    const snap = Simulator.buildSnapshot('QQQ');
    for (const horizon of ['LOTTO', 'WEEKLIES', 'SWINGS', 'LEAPS'] as Horizon[]) {
      for (const w of weighContracts(snap, horizon)) {
        const re = bsPriceAtT(snap.spot, w.strike, w.ivPct / 100, Math.max(w.dte, 0.5) / 365, w.right);
        expect(Math.abs(re - w.mid)).toBeLessThanOrEqual(ivRoundingBound(snap.spot, w.dte));
      }
    }
  });

  it('both cores converge at expiry instead of hanging on a floor', () => {
    // ITM lands on intrinsic; ATM/OTM land on the model's own clamp.
    expect(premiumAtT(500, 498, 'C', 0.15, 0)).toBeCloseTo(2, 10);
    expect(premiumAtT(500, 501, 'C', 0.15, 0)).toBeCloseTo(PREMIUM_FLOOR, 10);
    expect(bsPriceAtT(500, 498, 0.15, 0, 'C')).toBeCloseTo(2, 10);
    expect(bsPriceAtT(500, 501, 0.15, 0, 'C')).toBeCloseTo(BS_FLOOR, 10);
    // and puts, which invert
    expect(premiumAtT(500, 502, 'P', 0.15, 0)).toBeCloseTo(2, 10);
    expect(bsPriceAtT(500, 502, 0.15, 0, 'P')).toBeCloseTo(2, 10);
  });
});

describe('contract track: the forward half', () => {
  it('is monotonically non-increasing and terminates at max(intrinsic, floor)', () => {
    const setup = setupFor('SPY', 3, 'C', 'top-setups'); // OTM
    const plan = setupToPlan(setup);
    const track = buildTrack(plan, Simulator.getCandles('SPY'));
    for (let i = 1; i < track.forward.length; i++) {
      expect(track.forward[i].premium).toBeLessThanOrEqual(track.forward[i - 1].premium + 1e-9);
    }
    const intrinsic = Math.max(track.spotNow - setup.strike, 0);
    expect(track.forward[track.forward.length - 1].premium).toBeCloseTo(
      Math.max(intrinsic, PREMIUM_FLOOR),
      6
    );
    expect(track.atFloor).toBe(true);
  });

  it('spans the contract’s whole remaining life, to a hard expiry edge', () => {
    const plan = setupToPlan(setupFor('SPY', 0, 'C', 'top-setups'));
    const track = buildTrack(plan, Simulator.getCandles('SPY'));
    expect(track.xMax).toBe(Math.round(plan.sessionsLeft * 390));
    expect(track.xMin).toBeLessThanOrEqual(0);
    expect(track.forward[track.forward.length - 1].bar).toBeCloseTo(track.xMax, 6);
  });
});

describe('contract track: inverting the pricer into spot space', () => {
  it('round-trips every rung, both rights, to within a cent', () => {
    for (const right of ['C', 'P'] as OptionRight[]) {
      for (const scanner of SCANNERS) {
        const setup = setupFor('SPY', right === 'C' ? 1 : -1, right, scanner);
        const plan = setupToPlan(setup);
        const track = buildTrack(plan, Simulator.getCandles('SPY'));
        let solved = 0;
        for (const rung of track.rungs) {
          if (rung.spotNeeded == null) continue;
          solved++;
          expect(plan.priceAt(rung.spotNeeded, plan.sessionsLeft)).toBeCloseTo(rung.premium, 2);
        }
        expect(solved).toBeGreaterThan(0);
      }
    }
  });

  it('moves the needed spot the right way for each right', () => {
    for (const right of ['C', 'P'] as OptionRight[]) {
      const plan = setupToPlan(setupFor('SPY', right === 'C' ? 1 : -1, right, 'top-setups'));
      const track = buildTrack(plan, Simulator.getCandles('SPY'));
      const needs = track.rungs.map(r => r.spotNeeded).filter((s): s is number => s != null);
      for (let i = 1; i < needs.length; i++) {
        if (right === 'C') expect(needs[i]).toBeGreaterThan(needs[i - 1]);
        else expect(needs[i]).toBeLessThan(needs[i - 1]);
      }
    }
  });

  it('returns null rather than a number it cannot justify', () => {
    const plan = setupToPlan(setupFor('SPY', 0, 'C', 'top-setups'));
    const spot = Simulator.TICKERS.SPY.currentPrice;
    // Above the bracket: intrinsic alone can't get there inside a +/-60% move.
    expect(spotForPremium(spot * 2, 'C', plan.priceAt, plan.sessionsLeft, spot)).toBeNull();
    // Below it: the model floors at 0.05, so nothing prices at a cent.
    expect(spotForPremium(0.01, 'C', plan.priceAt, plan.sessionsLeft, spot)).toBeNull();
  });
});

describe('contract track: rung status comes from the path, not a coin flip', () => {
  it('every HIT rung was actually reached by the modeled path', () => {
    for (const ticker of ['SPY', 'QQQ', 'NVDA']) {
      for (const scanner of SCANNERS) {
        for (const right of ['C', 'P'] as OptionRight[]) {
          const plan = setupToPlan(setupFor(ticker, 0, right, scanner));
          const track = buildTrack(plan, Simulator.getCandles(ticker));
          const pathMax = Math.max(...track.past.map(p => p.premium));
          for (const rung of track.rungs) {
            if (rung.status === 'HIT') expect(pathMax).toBeGreaterThanOrEqual(rung.premium);
            else expect(pathMax).toBeLessThan(rung.premium);
          }
          // At most one rung is in flight, and it is the lowest unreached one.
          const progress = track.rungs.filter(r => r.status === 'IN PROGRESS');
          expect(progress.length).toBeLessThanOrEqual(1);
          if (progress.length === 1) {
            expect(track.rungs.indexOf(progress[0])).toBe(track.rungs.findIndex(r => r.status !== 'HIT'));
          }
        }
      }
    }
  });

  it('keeps the series out of the docked rungs’ shadow', () => {
    // The ceiling is the load-bearing layout decision: with all four rungs in
    // the domain the path that the chart exists to show collapses into the
    // bottom fifth of the frame.
    const plan = setupToPlan(setupFor('SPY', 0, 'C', 'top-setups'));
    const track = buildTrack(plan, Simulator.getCandles('SPY'));
    expect(track.yMax).toBeGreaterThanOrEqual(track.pathMax);
    expect(track.pathMax / track.yMax).toBeGreaterThan(0.5);
    for (const r of track.dockedRungs) expect(r.premium).toBeGreaterThan(track.yMax);
  });
});

describe('contract track: degenerate inputs', () => {
  it('never emits a non-finite coordinate', () => {
    const plan = setupToPlan(setupFor('SPY', 0, 'C', 'top-setups'));
    const track = buildTrack(plan, Simulator.getCandles('SPY'));
    for (const p of [...track.past, ...track.forward]) expect(Number.isFinite(p.premium)).toBe(true);
    for (const p of track.past) expect(Number.isFinite(p.spot)).toBe(true);
    for (const v of [track.yMax, track.spotLo, track.spotHi, track.xMin, track.xMax]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('a single bar renders a valid future rather than an empty chart', () => {
    const plan = setupToPlan(setupFor('SPY', 0, 'C', 'top-setups'));
    const bars = Simulator.getCandles('SPY');
    const track = buildTrack(plan, bars.slice(-1));
    expect(track.past).toHaveLength(1);
    expect(track.past[0].premium).toBe(plan.entry);
    expect(track.xMin).toBe(0);
    expect(track.forward.length).toBeGreaterThan(1);
  });
});
