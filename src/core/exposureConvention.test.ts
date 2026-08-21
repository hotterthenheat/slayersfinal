import { describe, expect, it } from 'vitest';
import Simulator from './simulator';
import { DEALER_BOOK } from './dealerBook';
import { CONVENTIONS, INVERTED_BOOK, netGammaOf, withConvention } from './exposureConvention';

/*
==================================================
  SLAYER TERMINAL - THE CONVENTION IS A SWITCH (exposureConvention.test.ts)

  The claim this file has to make good on is the sharp one: flipping the dealer
  book INVERTS the regime while leaving every magnitude exactly where it was.
  If the sign does not flip, the switch is decorative. If the magnitudes move,
  it is not a convention change — it is a different calculation, and the reader
  is being shown two unrelated numbers rather than one number under two
  assumptions.
==================================================
*/

const snap = () => {
  Simulator.ensureTicker('SPY');
  return Simulator.buildSnapshot('SPY');
};

describe('re-conventioning the chain', () => {
  it('inverts net gamma', () => {
    const s = snap();
    const base = netGammaOf(s.chain);
    const flipped = netGammaOf(withConvention(s, INVERTED_BOOK).chain);
    expect(Math.abs(base), 'the fixture has no gamma to invert').toBeGreaterThan(0);
    expect(Math.sign(flipped), 'flipping the book must flip the regime').toBe(-Math.sign(base));
  });

  it('leaves every magnitude untouched', () => {
    // The whole argument for showing the toggle: the numbers look equally
    // authoritative either way, which is why the assumption has to be visible.
    const s = snap();
    const flipped = withConvention(s, INVERTED_BOOK);
    for (let i = 0; i < s.chain.length; i++) {
      expect(Math.abs(flipped.chain[i].netGex)).toBeCloseTo(Math.abs(s.chain[i].netGex), 6);
      expect(Math.abs(flipped.chain[i].callGex)).toBeCloseTo(Math.abs(s.chain[i].callGex), 6);
      expect(Math.abs(flipped.chain[i].putGex)).toBeCloseTo(Math.abs(s.chain[i].putGex), 6);
      expect(Math.abs(flipped.chain[i].netVex)).toBeCloseTo(Math.abs(s.chain[i].netVex), 6);
    }
  });

  it('does not touch delta exposure', () => {
    /*
      `netDex` is built on the delta-weighted-OI DISPLAY convention — call delta
      positive, put delta negative — with no dealer-direction overlay. It carries
      no inventory assumption, so there is nothing to flip and flipping it would
      invent one.
    */
    const s = snap();
    const flipped = withConvention(s, INVERTED_BOOK);
    for (let i = 0; i < s.chain.length; i++) {
      expect(flipped.chain[i].netDex).toBe(s.chain[i].netDex);
      expect(flipped.chain[i].callDex).toBe(s.chain[i].callDex);
      expect(flipped.chain[i].putDex).toBe(s.chain[i].putDex);
    }
  });

  it('leaves strikes, OI and gamma alone', () => {
    // A convention decides which way inventory points. It does not move the
    // book, and a transform that changed OI would be rewriting the market.
    const s = snap();
    const flipped = withConvention(s, INVERTED_BOOK);
    for (let i = 0; i < s.chain.length; i++) {
      expect(flipped.chain[i].strike).toBe(s.chain[i].strike);
      expect(flipped.chain[i].gamma).toBe(s.chain[i].gamma);
      expect(flipped.chain[i].callOI.value).toBe(s.chain[i].callOI.value);
      expect(flipped.chain[i].putOI.value).toBe(s.chain[i].putOI.value);
    }
  });

  it('is identity on the convention the chain was built with', () => {
    // Same object, not a deep copy: the default path must allocate nothing so a
    // memo upstream keeps its identity and the desks do not re-render per tick.
    const s = snap();
    expect(withConvention(s, DEALER_BOOK)).toBe(s);
  });

  it('round-trips', () => {
    const s = snap();
    const there = withConvention(s, INVERTED_BOOK);
    const back = withConvention(there, DEALER_BOOK);
    // `withConvention` is relative to DEALER_BOOK, so going back from an already
    // flipped chain is identity on THAT chain — the flip is its own inverse and
    // must be applied to the original.
    expect(back).toBe(there);
    expect(netGammaOf(withConvention(s, INVERTED_BOOK).chain)).toBeCloseTo(-netGammaOf(s.chain), 6);
  });

  it('offers exactly two books, opposed on both legs', () => {
    expect(CONVENTIONS).toHaveLength(2);
    expect(Math.sign(CONVENTIONS[0].call)).toBe(-Math.sign(CONVENTIONS[1].call));
    expect(Math.sign(CONVENTIONS[0].put)).toBe(-Math.sign(CONVENTIONS[1].put));
    expect(CONVENTIONS[0].label).not.toBe(CONVENTIONS[1].label);
  });
});
