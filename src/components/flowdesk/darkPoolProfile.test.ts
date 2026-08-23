import { describe, expect, it } from 'vitest';
import { buildDarkPoolProfile } from './darkPoolProfile';
import type { DarkPoolLevel, DarkPoolPrint } from '../../types/darkpool';

/*
==================================================
  The profile is the dark-pool desk's headline picture, so
  the two things it must never do are the two things a
  histogram silently does wrong:

    1. Lose dollars. A bin boundary that drops the print
       sitting exactly on it, or a top edge that indexes off
       the end of the array, removes money from a chart
       captioned with a total. Nobody notices, because the
       bars still look like bars.

    2. Say something with height. Rows are drawn at equal
       height, which is only proportional if every bin spans
       an equal PRICE width. Unequal bins would make a tall
       row mean "wide price range" while the reader reads it
       as "more dollars".
==================================================
*/

const print = (id: number, price: number, notional: number): DarkPoolPrint => ({
  id,
  // A fixed instant: this suite bins by PRICE and never reads the clock, so a
  // real timestamp would only make the fixture look time-dependent.
  at: Date.UTC(2026, 0, 2, 14, 30) + id * 1000,
  time: '09:30',
  ticker: 'SPY',
  price,
  size: Math.round(notional / price),
  notional,
  venue: 'CONDITIONAL ATS',
  vsSpotPct: 0,
  atLevel: false,
  intent: 'ROTATION',
  execution: 'BLOCK CROSS',
  clips: 1,
  atMid: false,
  reportLagSec: 10,
  conviction: 60,
  read: '',
});

const level = (price: number): DarkPoolLevel => ({
  price,
  notional: 1,
  prints: 1,
  sharePct: 1,
  role: 'PIVOT',
  defended: 0,
  distPct: 0,
  usage: '',
});

describe('dark-pool price profile', () => {
  it('accounts for every dollar that crossed', () => {
    const prints = [print(1, 100, 5_000), print(2, 101, 3_000), print(3, 110, 12_000)];
    const p = buildDarkPoolProfile(prints, [], 105, 20);
    expect(p.total).toBe(20_000);
    expect(p.bins.reduce((a, b) => a + b.notional, 0)).toBe(20_000);
    expect(p.bins.reduce((a, b) => a + b.prints, 0)).toBe(3);
  });

  it('keeps the print sitting exactly on a bin edge', () => {
    /*
      With a snapped axis, a round print price lands exactly ON an edge — and a
      price equal to the range top indexes one past the last bin. Without the
      clamp that either throws on an undefined bin or, worse, writes to a fresh
      object nothing renders: the largest print in the session, gone from the
      chart with no error anywhere.
    */
    const prints = [print(1, 100, 1_000), print(2, 110, 9_000)];
    const p = buildDarkPoolProfile(prints, [], 105, 10);
    expect(p.total).toBe(10_000);
    expect(p.max).toBe(9_000);
    // The 110 print is in the topmost band that holds anything.
    expect(p.bins.find(b => b.notional === 9_000)!.hi).toBeGreaterThanOrEqual(110);
  });

  it('cuts the axis on round prices, not on artefacts of the bin count', () => {
    /*
      The gutter IS the price axis. Dividing 100-110 into exactly 30 parts gives
      centres like 100.17, 100.50, 100.83 — numbers at which nobody traded and
      against which no shelf price can be matched by eye.
    */
    const p = buildDarkPoolProfile([print(1, 100.07, 1), print(2, 109.93, 1)], [], 105, 20);
    expect(p.step).toBe(0.5);
    for (const b of p.bins) {
      expect(Math.round(b.lo / p.step)).toBeCloseTo(b.lo / p.step, 9);
    }
    expect(p.lo).toBeCloseTo(100, 9);
    expect(p.hi).toBeCloseTo(110, 9);
  });

  it('divides the range into equal price widths', () => {
    /*
      Rows are drawn at equal HEIGHT. That is only proportional if every bin
      spans an equal PRICE width — otherwise a tall row means "wide price range"
      while the reader reads it as "more dollars".
    */
    const prints = [print(1, 100, 1), print(2, 130, 1)];
    const p = buildDarkPoolProfile(prints, [], 115, 15);
    const widths = p.bins.map(b => b.hi - b.lo);
    for (const w of widths) expect(w).toBeCloseTo(widths[0], 9);
    // …and the widths tile the range with no gap and no overlap.
    const sorted = [...p.bins].sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].lo).toBeCloseTo(sorted[i - 1].hi, 9);
    expect(sorted[0].lo).toBeLessThanOrEqual(100);
    expect(sorted[sorted.length - 1].hi).toBeGreaterThanOrEqual(130);
  });

  it('orders bins high price first, so the plot reads like a price axis', () => {
    const p = buildDarkPoolProfile([print(1, 100, 1), print(2, 200, 1)], [], 150, 8);
    for (let i = 1; i < p.bins.length; i++) expect(p.bins[i].mid).toBeLessThan(p.bins[i - 1].mid);
  });

  it('always contains spot, and places it as a fraction from the top', () => {
    const p = buildDarkPoolProfile([print(1, 100, 1), print(2, 200, 1)], [], 175, 10);
    expect(p.spotFrac).toBeCloseTo((p.hi - 175) / (p.hi - p.lo), 9);
    expect(p.spotFrac).toBeGreaterThan(0);
    expect(p.spotFrac).toBeLessThan(1);

    /*
      Spot far outside the printed range is the case that used to return null and
      leave the rule undrawn. On this desk every bar is read AGAINST spot, so a
      picture that can omit it is a picture that quietly stops answering the
      question. The range widens instead; the empty bands between are themselves
      the finding — nothing crossed up there.
    */
    const far = buildDarkPoolProfile([print(1, 100, 1), print(2, 110, 1)], [], 400, 10);
    expect(far.lo).toBeLessThanOrEqual(100);
    expect(far.hi).toBeGreaterThanOrEqual(400);
    expect(far.spotFrac).toBeGreaterThanOrEqual(0);
    expect(far.spotFrac).toBeLessThanOrEqual(1);
    expect(far.total).toBe(2);
  });

  it('never drops a shelf, even one outside the printed range', () => {
    // Levels are derived before this binning exists, so a shelf can sit beyond
    // the extreme print — and that is precisely the shelf a reader came for. The
    // range grows to hold it rather than the picture losing it.
    const prints = [print(1, 100, 1), print(2, 110, 1)];
    const p = buildDarkPoolProfile(prints, [level(105), level(99.5), level(110.4)], 105, 10);
    const attached = p.bins.filter(b => b.shelf).map(b => b.shelf!.price).sort((a, b) => a - b);
    expect(attached).toEqual([99.5, 105, 110.4]);
  });

  it('keeps the shelf nearest a band centre when two share one', () => {
    // Otherwise the label depends on the order data/darkpool.ts happens to emit
    // levels in, which is not a property of the market.
    const prints = [print(1, 100, 1), print(2, 130, 1)];
    const p = buildDarkPoolProfile(prints, [level(114.9), level(112.6)], 115, 15);
    const band = p.bins.find(b => b.shelf && b.lo <= 114.9 && b.hi > 114.9)!;
    expect(band.shelf!.price).toBe(114.9);
  });

  it('survives a session that crossed at one price', () => {
    const p = buildDarkPoolProfile([print(1, 100, 7_000), print(2, 100, 3_000)], [], 100, 12);
    expect(p.bins.every(b => Number.isFinite(b.lo) && Number.isFinite(b.hi))).toBe(true);
    expect(p.bins.length).toBeGreaterThan(0);
    expect(p.total).toBe(10_000);
    expect(p.max).toBe(10_000);
  });

  it('survives an empty tape without inventing a range', () => {
    const p = buildDarkPoolProfile([], [level(100)], 100, 12);
    expect(p.bins).toEqual([]);
    expect(p.max).toBe(0);
    expect(p.total).toBe(0);
  });
});
