import { describe, it, expect } from 'vitest';
import Simulator from '../core/simulator';
import { buildSkyVision, makeSetup, resetSkyVisionCache, scannerExpiry } from './skyvision';
import { dteOfBucket } from '../components/compass/setupHorizon';
import { SCANNERS } from '../types/skyvision';

/*
  "Quick scalps for what? 0dte, 1dte, 2dte" — a fair question, and the answer is
  that four of the six presets are same-day and two are next-day. The strip says
  so on every tab now, and this file is the reason that label is allowed to exist.

  SCANNERS lives in types/ and PROFILES in data/. A horizon copied into the type
  would be a second table, free to drift from the one the engine actually selects,
  and a label that lies about DTE is worse than no label. So the strip reads
  `scannerExpiry`, and what follows pins that accessor to what a built setup
  actually carries — on the accessor, on one setup, and on a whole sweep.
*/

const EPOCH = 1_800_000_000;

describe('scanner horizons: the tab strip cannot drift from the engine', () => {
  it('scannerExpiry is the expiry makeSetup stamps, on every preset', () => {
    Simulator.ensureTicker('SPY');
    const cfg = Simulator.TICKERS.SPY;
    for (const s of SCANNERS) {
      for (const right of ['C', 'P'] as const) {
        for (const k of [-2, 0, 3]) {
          const strike = Math.round(cfg.currentPrice / cfg.step) * cfg.step + k * cfg.step;
          const setup = makeSetup('SPY', cfg.currentPrice, strike, right, s.key, cfg.iv, true);
          expect(setup.expiry, `${s.key} ${strike}${right}`).toBe(scannerExpiry(s.key));
        }
      }
    }
  });

  it("every contract a preset puts on the board carries that preset's expiry", () => {
    Simulator.ensureTicker('SPY');
    const snap = Simulator.buildSnapshot('SPY');
    for (const s of SCANNERS) {
      resetSkyVisionCache();
      const rows = buildSkyVision(snap, s.key, { epoch: EPOCH }).groups.flatMap(g => g.setups);
      expect(rows.length, `${s.key} put nothing on the board`).toBeGreaterThan(0);
      const stamped = new Set(rows.map(r => r.expiry));
      expect([...stamped], s.key).toEqual([scannerExpiry(s.key)]);
    }
  });

  it('every stamp is a horizon a screen can read back', () => {
    for (const s of SCANNERS) {
      const bucket = scannerExpiry(s.key);
      expect(bucket, s.key).toMatch(/^\d+DTE$/);
      expect(`${dteOfBucket(bucket)}DTE`).toBe(bucket);
    }
  });

  it('the presets do not all share one horizon', () => {
    // The reason the label is on the tab rather than said once above the strip.
    // If the profiles ever converge on a single expiry this fails, and the right
    // response is to lift the horizon out of the tabs, not to widen this test.
    const horizons = new Set(SCANNERS.map(s => scannerExpiry(s.key)));
    expect(horizons.size).toBeGreaterThan(1);
  });
});
