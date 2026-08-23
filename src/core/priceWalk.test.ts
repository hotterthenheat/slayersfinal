import { describe, expect, it, afterEach, vi } from 'vitest';
import Simulator from './simulator';
import { SCAN_EPOCH_MS, scanEpoch, sessionPrice, walkPct, walkPhases } from './priceWalk';
import { resetScanUniverse, scanNameFor } from './scanUniverse';
import { UNIVERSE } from '../data/universe';

/*
==================================================
  SLAYER TERMINAL - SESSION WALK (core/priceWalk.test.ts)

  THE DEFECT THIS PINS, stated so it cannot come back
  by accident.

  Two independent generators answered "what is this
  name trading at". scanUniverse.ts priced the ~190
  names the simulator does not hold with a closed-form
  cosine walk around their reference. simulator.ts
  priced the names it does hold by walking 100 random
  steps from the same reference and keeping wherever
  the coin flips left it. Both started at basePrice.
  Nothing else connected them.

  Opening a name off the scan board runs ensureTicker,
  which seeds that random tail — so the price under the
  cursor CHANGED at the moment of the click, by
  whatever the two walks happened to differ by. Every
  name in the field except the four the simulator ships
  with took that path.

  The fix is not "make the numbers close". It is that
  seedHistory now ties its walk down onto sessionPrice,
  so the two are the SAME NUMBER by construction. That
  is what the promotion test below asserts: not a
  tolerance, an identity.
==================================================
*/

/** A frozen epoch on a 10s boundary, so seedHistory and the assertions agree. */
const T = 1_800_000_000_000;

afterEach(() => {
  vi.useRealTimers();
  resetScanUniverse();
});

describe('the session walk', () => {
  it('is a pure function of ticker, iv and epoch', () => {
    for (const t of ['AMD', 'KO', 'XOM']) {
      const a = sessionPrice(100, t, 0.3, 4242);
      const b = sessionPrice(100, t, 0.3, 4242);
      expect(a).toBe(b);
    }
    // Different names never trace the same path — the phases are hashed apart.
    expect(sessionPrice(100, 'AMD', 0.3, 4242)).not.toBe(sessionPrice(100, 'KO', 0.3, 4242));
  });

  it('stays inside the band its vol buys it', () => {
    // amp = iv * 5.5, and the two cosine weights sum to 1, so |walk| <= amp.
    for (const iv of [0.15, 0.3, 0.6]) {
      const w = walkPhases('AMD', iv);
      for (let e = 0; e < 400; e++) expect(Math.abs(walkPct(w, e))).toBeLessThanOrEqual(iv * 5.5 + 1e-9);
    }
  });

  it('rounds in exactly one place', () => {
    /*
      The scanner and the simulator compare this number against each other. If
      each rounded its own copy, a half-cent would land them on different sides
      and reintroduce the disagreement one cent at a time — so the rounding is
      inside sessionPrice, and this asserts the output is already at 2dp rather
      than trusting the call sites to do it.
    */
    for (let e = 0; e < 200; e++) {
      const p = sessionPrice(437.19, 'AMD', 0.42, e);
      expect(Number(p.toFixed(2))).toBe(p);
    }
  });

  it('quantises the clock to the scanner cadence', () => {
    expect(scanEpoch(T)).toBe(scanEpoch(T + SCAN_EPOCH_MS - 1));
    expect(scanEpoch(T + SCAN_EPOCH_MS)).toBe(scanEpoch(T) + 1);
  });
});

describe('promotion to live', () => {
  /**
   * Names the simulator does not ship with, so registering them inside the test
   * is what exercises the seam. Chosen off the shared universe rather than typed
   * so they are real rows with real reference prices.
   */
  const candidates = UNIVERSE.map(u => u.ticker)
    .filter(t => !Simulator.WATCHLIST.includes(t as never))
    .filter(t => !Simulator.TICKERS[t]);

  it('has names to test with', () => {
    expect(candidates.length).toBeGreaterThan(20);
  });

  it('does not move the price', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    resetScanUniverse();

    /*
      Ten names, not the whole field. Registering one costs ~600ms (22 sessions x
      390 bars plus six sessions of per-strike GEX), so a full sweep here would
      add two minutes to every run to re-assert the same identity. Ten distinct
      hashes across ten distinct reference prices is enough to catch a tie-down
      that is off by a rounding step; the identity is exact, so a sample that
      finds nothing is meaningful rather than merely lucky.
    */
    const sample = candidates.slice(0, 10);
    const moved: string[] = [];

    for (const t of sample) {
      const before = scanNameFor(t, scanEpoch(T));
      expect(before.live).toBe(false);

      Simulator.ensureTicker(t);

      const after = scanNameFor(t, scanEpoch(T));
      expect(after.live).toBe(true);

      // The identity. Not toBeCloseTo — the same number, to the cent.
      if (after.spot !== before.spot) moved.push(`${t}: ${before.spot} -> ${after.spot}`);
    }

    expect(moved, 'opening a scanned name must not change its price').toEqual([]);
  });

  it('leaves the session change consistent with the price it publishes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    resetScanUniverse();

    for (const t of candidates.slice(10, 15)) {
      const before = scanNameFor(t, scanEpoch(T));
      Simulator.ensureTicker(t);
      const after = scanNameFor(t, scanEpoch(T));
      expect(after.changePct).toBe(before.changePct);
      // changePct is derived from currentPrice once live; the base is shared, so
      // the two derivations must land on the same figure as well as the spot.
      const cfg = Simulator.TICKERS[t];
      expect(Number((((cfg.currentPrice - cfg.basePrice) / cfg.basePrice) * 100).toFixed(2)) + 0).toBe(
        after.changePct
      );
    }
  });

  it('keeps the seeded history anchored at the reference and ending on the walk', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    resetScanUniverse();

    const t = candidates[15];
    Simulator.ensureTicker(t);
    const cfg = Simulator.TICKERS[t];

    // The tie-down pins the TERMINUS. The interior keeps the random walk's shape
    // and the correction is spread linearly, so point 0 is still within one
    // step's noise of the reference it started from.
    expect(cfg.currentPrice).toBe(sessionPrice(cfg.basePrice, t, cfg.iv, scanEpoch(T)));
    const hist = Simulator.buildSnapshot(t).priceHistory;
    expect(hist.length).toBeGreaterThan(50);
    expect(Math.abs(hist[0] - cfg.basePrice)).toBeLessThan(cfg.step);
  });
});
