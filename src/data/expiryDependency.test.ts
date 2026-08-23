import { describe, expect, it } from 'vitest';
import Simulator from '../core/simulator';
import { buildExpiryDependency } from './expiryDependency';
import { aggregateChain } from '../core/chainAggregate';
import { readStructure } from '../core/chainStructure';

/*
==================================================
  SLAYER TERMINAL - THE SUBTRACTION IS REAL (data/expiryDependency.test.ts)

  The defect this guards is the one the engine was built to escape, and it is
  invisible from the output: when the per-expiry surface was a PROJECTION of the
  aggregate, removing an expiry returned a rescaled copy of the same curve. The
  numbers looked fine. Every level moved a plausible amount. They were a property
  of the decay function, not of the book.

  So the checks here are about PROVENANCE rather than plausibility — that what
  comes back is genuinely the chain minus one book, read by the same function
  that read the whole one.
==================================================
*/

describe('expiry dependency', () => {
  it('reports one contribution per listed expiry', () => {
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    expect(view.contributions).toHaveLength(snap.chainByExpiry.length);
    expect(view.contributions.length).toBeGreaterThan(1);
    expect(view.contributions.map(c => c.dte)).toEqual(snap.chainByExpiry.map(b => b.expiry.dte));
  });

  it('each removed structure is the fold of the OTHER books, not a rescale', () => {
    /*
      Recomputed here from the books directly. If the engine ever went back to
      scaling the aggregate, this is where it shows: a scaled copy cannot equal
      an independent fold of the remaining books.
    */
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    const step = Simulator.TICKERS['SPY'].step;

    view.contributions.forEach((c, i) => {
      const expected = readStructure(
        aggregateChain(snap.chainByExpiry.filter((_, j) => j !== i)),
        snap.spot,
        step
      );
      expect(c.without.netGex).toBeCloseTo(expected.netGex, 6);
      expect(c.without.flip).toBeCloseTo(expected.flip, 10);
      expect(c.without.callWall).toBeCloseTo(expected.callWall, 10);
      expect(c.without.putWall).toBeCloseTo(expected.putWall, 10);
    });
  });

  it('the own-gamma of every expiry adds up to the whole chain', () => {
    // Conservation. If the books did not partition the chain, this is where an
    // expiry double-counted or went missing.
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    const summed = view.contributions.reduce((a, c) => a + c.ownGex, 0);
    expect(summed).toBeCloseTo(view.full.netGex, 4);
  });

  it('gross shares are fractions that sum to one', () => {
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    for (const c of view.contributions) {
      expect(c.grossShare).toBeGreaterThan(0);
      expect(c.grossShare).toBeLessThan(1);
    }
    expect(view.contributions.reduce((a, c) => a + c.grossShare, 0)).toBeCloseTo(1, 10);
  });

  it('removing an expiry always leaves less gross gamma than the whole chain', () => {
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    const step = Simulator.TICKERS['SPY'].step;
    view.contributions.forEach((_, i) => {
      const rest = aggregateChain(snap.chainByExpiry.filter((_, j) => j !== i));
      const gross = rest.reduce((a, n) => a + Math.abs(n.netGex), 0);
      expect(gross).toBeLessThan(view.grossGex);
      // ...and it is still a readable chain, not an empty one.
      expect(readStructure(rest, snap.spot, step).netGex).not.toBeNaN();
    });
  });

  it('calls an expiry regime-critical only when the sign really inverts', () => {
    /*
      Checked against a recomputation from the books rather than against the
      engine's own field, because the field IS the claim. `Math.sign` on both
      sides so a chain that nets exactly zero is never reported as an inversion —
      it has no regime to invert.
    */
    const snap = Simulator.buildSnapshot('IBM');
    const view = buildExpiryDependency(snap);
    const step = Simulator.TICKERS['IBM'].step;

    view.contributions.forEach((c, i) => {
      const rest = readStructure(
        aggregateChain(snap.chainByExpiry.filter((_, j) => j !== i)),
        snap.spot,
        step
      );
      const inverts =
        Math.sign(rest.netGex) !== 0 &&
        Math.sign(view.full.netGex) !== 0 &&
        Math.sign(rest.netGex) !== Math.sign(view.full.netGex);
      expect(c.regimeCritical).toBe(inverts);
    });
  });

  it('names the nearest regime-critical expiry, and names nothing when none is', () => {
    for (const t of ['SPY', 'IBM', 'NVDA']) {
      const view = buildExpiryDependency(Simulator.buildSnapshot(t));
      const critical = view.contributions.filter(c => c.regimeCritical);
      if (!critical.length) {
        expect(view.loadBearing, `${t} has no critical expiry but named one`).toBeNull();
      } else {
        // Nearest = first, because contributions are nearest-first.
        expect(view.loadBearing).toBe(critical[0]);
        expect(view.loadBearing!.regimeCritical).toBe(true);
      }
    }
  });

  it('keeps "heaviest" a separate claim from "load-bearing"', () => {
    /*
      The two answer different questions — size versus dependency — and the whole
      point of reporting both is that they need not agree. This pins that
      `heaviest` is decided by share alone and never quietly becomes the
      load-bearing one.
    */
    const view = buildExpiryDependency(Simulator.buildSnapshot('SPY'));
    const maxShare = Math.max(...view.contributions.map(c => c.grossShare));
    expect(view.heaviest).not.toBeNull();
    expect(view.heaviest!.grossShare).toBe(maxShare);
  });

  it('publishes no 0-100 score', () => {
    /*
      Enforced structurally, not by review. The contract grade was removed from
      this codebase for compressing hand-weighted factors into an unlabelled
      0-100, and a structural measure does the same thing under a new name. Every
      number here has to stay the quantity it is: a fraction, a dollar move, a
      contract count, a DTE.
    */
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency(snap);
    const suspicious = Object.keys(view.contributions[0]).filter(k => /score|grade|rating|rank/i.test(k));
    // The view itself, not only a row — a headline score would land here.
    expect(Object.keys(view).filter(k => /score|grade|rating|rank/i.test(k))).toEqual([]);
    expect(
      suspicious,
      'a score-shaped field appeared on ExpiryContribution — publish the quantity, not a grade'
    ).toEqual([]);
  });
});

describe('an empty calendar', () => {
  it('reports no heaviest expiry rather than throwing', () => {
    /*
      `contributions.reduce((a, b) => …)` carried no initial value. A root with
      no listed expiries — or a snapshot read before the chain populates — made
      it throw "Reduce of empty array with no initial value", which is not a
      degraded desk, it is the whole Dependency route gone. Every other
      degenerate path in this file's neighbourhood returns a fallback
      (`readStructure` has `degenerate()`, `buildDarkPoolProfile` returns empty
      bins); this one now does too.
    */
    const snap = Simulator.buildSnapshot('SPY');
    const view = buildExpiryDependency({ ...snap, chainByExpiry: [] });
    expect(view.contributions).toEqual([]);
    expect(view.heaviest).toBeNull();
    expect(view.loadBearing).toBeNull();
  });
});
