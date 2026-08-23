import { describe, expect, it } from 'vitest';
import Simulator from './simulator';
import { aggregateChain, chainWithout } from './chainAggregate';
import type { ExpiryBook, StrikeNode } from '../types/market';
import { settledOI } from './openInterest';

/*
==================================================
  SLAYER TERMINAL - THE FOLD (core/chainAggregate.test.ts)

  Two failure modes, both silent.

  1. SUMMING AN INTENSIVE GREEK. `gamma`, `vanna` and `charm` are per-CONTRACT
     numbers. Add a 0DTE gamma of 0.08 to a 60-day gamma of 0.01 and report 0.09
     and you have described no contract that exists — and worse, the figure now
     scales with how many expiries the calendar happens to return, so listing a
     seventh column silently inflates every gamma on the terminal. Nothing
     throws; the numbers merely become wrong by a factor no reader can see.

  2. AVERAGING AN EXTENSIVE ONE. The mirror image: mean the dollar exposures and
     a chain holding $6M of gamma across six expiries reports $1M.

  Both are caught here by construction rather than by example — a book is folded
  against hand-computed expectations, and the live simulator chain is checked
  against the identity that the fold must satisfy.
==================================================
*/

const node = (strike: number, callOI: number, putOI: number, gamma: number, gex: number): StrikeNode => ({
  strike,
  callOI: settledOI(callOI),
  putOI: settledOI(putOI),
  gamma,
  vanna: gamma * 2,
  charm: gamma * 3,
  callGex: gex,
  putGex: gex,
  netGex: gex * 2,
  callDex: gex,
  putDex: -gex,
  netDex: 0,
  callVex: gex,
  putVex: gex,
  netVex: gex * 2,
});

const book = (dte: number, nodes: StrikeNode[]): ExpiryBook => ({
  expiry: { date: new Date(2026, 0, 1 + dte), dte, sessions: dte, t: dte / 365 },
  nodes,
});

describe('folding the expiry books', () => {
  it('sums the dollars and weights the greeks', () => {
    // Two books at one strike. Book A holds 300 contracts at gamma 0.08;
    // book B holds 100 at gamma 0.01.
    const folded = aggregateChain([
      book(0, [node(100, 200, 100, 0.08, 1_000_000)]),
      book(30, [node(100, 60, 40, 0.01, 250_000)]),
    ]);

    expect(folded).toHaveLength(1);
    const n = folded[0];

    // Extensive — dollars and contracts add.
    expect(n.callOI.value).toBe(260);
    expect(n.putOI.value).toBe(140);
    expect(n.netGex).toBe(2_500_000);
    expect(n.netVex).toBe(2_500_000);

    // Intensive — open-interest-weighted, NOT summed (0.09) and NOT a plain
    // mean (0.045). 300 contracts at 0.08 and 100 at 0.01 average 0.0625.
    expect(n.gamma).toBeCloseTo((300 * 0.08 + 100 * 0.01) / 400, 12);
    expect(n.gamma).toBeCloseTo(0.0625, 12);
    expect(n.vanna).toBeCloseTo(0.0625 * 2, 12);
    expect(n.charm).toBeCloseTo(0.0625 * 3, 12);
  });

  it('keeps a strike only one book lists, carrying only that book', () => {
    const folded = aggregateChain([
      book(0, [node(100, 10, 10, 0.05, 100)]),
      book(30, [node(100, 10, 10, 0.05, 100), node(105, 8, 2, 0.02, 50)]),
    ]);
    expect(folded.map(n => n.strike)).toEqual([100, 105]);
    // The 105 rung exists on one expiry, so it carries one expiry's exposure and
    // one expiry's greek — not a blend with a book that never listed it.
    const wing = folded[1];
    expect(wing.netGex).toBe(100);
    expect(wing.gamma).toBeCloseTo(0.02, 12);
  });

  it('does not divide by zero on a strike with no open interest', () => {
    const folded = aggregateChain([
      book(0, [node(100, 0, 0, 0.05, 0)]),
      book(30, [node(100, 0, 0, 0.03, 0)]),
    ]);
    expect(Number.isFinite(folded[0].gamma)).toBe(true);
    expect(folded[0].gamma).toBeCloseTo(0.04, 12); // plain mean, the only defensible read
  });

  it('returns ascending strikes whatever order the books arrive in', () => {
    const folded = aggregateChain([
      book(30, [node(105, 1, 1, 0.01, 1), node(95, 1, 1, 0.01, 1)]),
      book(0, [node(100, 1, 1, 0.01, 1)]),
    ]);
    expect(folded.map(n => n.strike)).toEqual([95, 100, 105]);
  });
});

describe('the live chain satisfies the fold', () => {
  it('is exactly the fold of its own books', () => {
    /*
      The invariant that keeps `chain` and `chainByExpiry` from drifting into two
      independent derivations of the same book — which is the bug this whole
      change exists to remove, one level up.
    */
    const snap = Simulator.buildSnapshot('SPY');
    const refolded = aggregateChain(snap.chainByExpiry);
    expect(refolded).toHaveLength(snap.chain.length);
    for (let i = 0; i < refolded.length; i++) {
      expect(refolded[i].strike).toBe(snap.chain[i].strike);
      expect(refolded[i].netGex).toBeCloseTo(snap.chain[i].netGex, 6);
      expect(refolded[i].gamma).toBeCloseTo(snap.chain[i].gamma, 12);
      expect(refolded[i].callOI.value).toBe(snap.chain[i].callOI.value);
    }
  });

  it('spreads one strike’s open interest across the calendar rather than multiplying it', () => {
    /*
      The load-bearing property of the OI weights. If they did not sum to one,
      building six books instead of one would multiply every open-interest and
      dollar figure on the terminal by roughly six — a change that looks like a
      market move and is an accounting error.

      Checked as a RATIO against the front book rather than an absolute, because
      the absolute is simulator shaping and may legitimately change; what may not
      change is that the whole is a distribution of a strike, not a copy per
      expiry.
    */
    const snap = Simulator.buildSnapshot('SPY');
    const spot = snap.spot;
    const nearest = (nodes: StrikeNode[]) =>
      nodes.reduce((b, n) => (Math.abs(n.strike - spot) < Math.abs(b.strike - spot) ? n : b));

    const total = nearest(snap.chain).callOI.value;
    const front = nearest(snap.chainByExpiry[0].nodes).callOI.value;

    expect(snap.chainByExpiry.length).toBeGreaterThan(1);
    // The front book is a SHARE of the strike, so it is strictly less than the
    // total — and, being the front of a decaying weight, it is the largest share.
    expect(front).toBeLessThan(total);
    expect(front).toBeGreaterThan(0);
    for (const b of snap.chainByExpiry.slice(1)) {
      expect(nearest(b.nodes).callOI.value).toBeLessThanOrEqual(total);
    }
  });

  it('removing an expiry changes the structure, and removing none changes nothing', () => {
    const snap = Simulator.buildSnapshot('SPY');
    const gexOf = (c: StrikeNode[]) => c.reduce((a, n) => a + n.netGex, 0);

    const untouched = chainWithout(snap.chainByExpiry, () => false);
    expect(gexOf(untouched)).toBeCloseTo(gexOf(snap.chain), 6);

    const front = snap.chainByExpiry[0];
    const withoutFront = chainWithout(snap.chainByExpiry, b => b.expiry.dte === front.expiry.dte);

    /*
      This is the assertion the whole refactor was for. When the per-expiry
      matrix was a PROJECTION of the aggregate, removing an expiry returned a
      rescaled copy of the same curve. Now the books are primary, so what comes
      back is the whole book MINUS that expiry's own exposure — exactly.

      IT USED TO ASSERT |WITHOUT| < |FULL|, WHICH IS NOT TRUE AND NOT WHAT THE
      PARAGRAPH ABOVE CLAIMS. Net gamma is a SIGNED sum, and the near expiries
      routinely oppose the far ones: measured on SPY, the 1DTE book carried
      +$84.9M against −$60.5M across every other expiry, for a whole-chain net
      of +$24.4M. Removing the front leaves −$60.5M, whose magnitude is larger
      than the full chain's, and the guard failed on arithmetic that was
      working correctly. It passed for as long as it did only because the front
      book usually dominates AND shares the rest's sign; the day it did not,
      the test called the engine broken.

      AND IT DID NOT EVEN GUARD ITS OWN CLAIM. Reintroducing the projection —
      `aggregateChain(books)` rescaled by the share of books kept — leaves the
      old assertion GREEN, because a scale below 1 shrinks |sum| and shrinking
      |sum| was the whole test. It failed on correct arithmetic and passed on
      the exact regression it was written for.

      The identity below is the real invariant. It holds whatever the signs, it
      is what "the books are primary" actually means, and it fails on that
      projection — checked, along with dropping the wrong expiry and dropping
      none at all.
    */
    expect(gexOf(withoutFront)).toBeCloseTo(gexOf(snap.chain) - gexOf(front.nodes), 6);

    // And the removal genuinely moved the book: a projection would hand back
    // the same curve at a different scale, which for a front book this size
    // cannot land on the full chain's own total.
    expect(gexOf(withoutFront)).not.toBeCloseTo(gexOf(snap.chain), 6);
    expect(withoutFront.length).toBeGreaterThan(0);
  });
});
