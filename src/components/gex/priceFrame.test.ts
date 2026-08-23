import { describe, expect, it } from 'vitest';
import { frameRange, offScaleLevels } from './priceFrame';

/*
==================================================
  SLAYER TERMINAL - THE CANDLES KEEP THE PANE
  (gex/priceFrame.test.ts)

  The regression this suite exists for is not a crash and
  not an exception: it is a chart that renders perfectly
  while showing the reader nothing. The old provider widened
  the range to reach every structural level unconditionally,
  so a $1.30 session with a wall $5 away drew its candles as
  a flat line across 12% of the pane — a picture that looks
  fine and answers no question.

  Every number below is a share of a pane, so the assertions
  are about what a reader can actually see.
==================================================
*/

/** The share of the frame the candles occupy. */
const share = (frame: { minValue: number; maxValue: number }, lo: number, hi: number) =>
  (hi - lo) / (frame.maxValue - frame.minValue);

describe('the price frame', () => {
  // The measured case: SPY traded $1.30 with a put wall $5.30 below.
  const SESSION = { minValue: 500.3, maxValue: 501.6 };
  const LEVELS = [495, 502, 496.5, 505];

  it('keeps the candles over half the pane when the walls are far away', () => {
    const frame = frameRange(SESSION, LEVELS);
    expect(share(frame, SESSION.minValue, SESSION.maxValue)).toBeGreaterThan(0.5);
  });

  it('is the fix — the old unconditional widening is what it replaces', () => {
    /*
      What the previous provider did, spelled out: take the union of the candle
      range and every level, pad 8%. Stated as an assertion so the number that
      justified this file cannot quietly stop being true.
    */
    const lo = Math.min(SESSION.minValue, ...LEVELS);
    const hi = Math.max(SESSION.maxValue, ...LEVELS);
    const padded = (hi - lo) * 1.16;
    expect(1.3 / padded, 'the old frame gave the candles this much').toBeLessThan(0.12);

    const frame = frameRange(SESSION, LEVELS);
    expect(share(frame, SESSION.minValue, SESSION.maxValue)).toBeGreaterThan(0.5);
  });

  it('admits levels nearest first, so the ones price is at win the room', () => {
    /*
      The levels have to be on OPPOSITE sides for this to test anything.

      The first version of this used 502 and 505, both above the session, and it
      passed with the sort reversed — because on one side the far level simply
      does not fit and the greedy skip handles it whatever the order. Order only
      decides an outcome when admitting one level uses up the room the other
      needed, which requires them to pull the frame in opposite directions.

      Session 500.30–501.60, budget 1.30 / 0.55 = 2.36. Below sits 499.80 (0.50
      out), above sits 502.50 (0.90 out). Either fits alone; together they span
      2.70 and do not. Nearest-first takes 499.80 and the frame ends at 501.60.
      Furthest-first would take 502.50 instead.
    */
    const frame = frameRange(SESSION, [502.5, 499.8], { minCandleShare: 0.55, pad: 0 });
    expect(frame.minValue).toBeCloseTo(499.8, 6);
    expect(frame.maxValue).toBeCloseTo(501.6, 6);
  });

  it('always keeps a level that is already inside the session', () => {
    const frame = frameRange(SESSION, [501], { pad: 0 });
    expect(frame.minValue).toBeLessThanOrEqual(501);
    expect(frame.maxValue).toBeGreaterThanOrEqual(501);
  });

  it('takes every level when they all fit inside the budget', () => {
    const frame = frameRange({ minValue: 100, maxValue: 200 }, [95, 205], { pad: 0 });
    expect(frame.minValue).toBe(95);
    expect(frame.maxValue).toBe(205);
  });

  it('honours a caller that wants the candles to keep more or less', () => {
    const greedy = frameRange(SESSION, LEVELS, { minCandleShare: 0.9, pad: 0 });
    const loose = frameRange(SESSION, LEVELS, { minCandleShare: 0.2, pad: 0 });
    expect(share(greedy, SESSION.minValue, SESSION.maxValue)).toBeGreaterThan(
      share(loose, SESSION.minValue, SESSION.maxValue)
    );
    expect(share(greedy, SESSION.minValue, SESSION.maxValue)).toBeGreaterThanOrEqual(0.89);
  });

  it('cannot be handed an infinite budget by a nonsense share', () => {
    for (const minCandleShare of [0, -1, Number.NaN]) {
      const frame = frameRange(SESSION, [1, 100000], { minCandleShare, pad: 0 });
      expect(Number.isFinite(frame.minValue) && Number.isFinite(frame.maxValue)).toBe(true);
      expect(frame.maxValue - frame.minValue, `share ${minCandleShare}`).toBeLessThan(100);
    }
  });

  it('frames the levels alone when there are no bars yet', () => {
    const frame = frameRange(null, [495, 505]);
    expect(frame.minValue).toBeLessThan(495);
    expect(frame.maxValue).toBeGreaterThan(505);
  });

  it('returns a usable range with nothing at all to frame', () => {
    const frame = frameRange(null, []);
    expect(frame.maxValue).toBeGreaterThan(frame.minValue);
  });

  it('gives a flat session a span rather than a zero-height pane', () => {
    const frame = frameRange({ minValue: 500, maxValue: 500 }, [500]);
    expect(frame.maxValue).toBeGreaterThan(frame.minValue);
  });

  it('ignores non-finite levels instead of poisoning the frame', () => {
    const frame = frameRange(SESSION, [Number.NaN, Infinity, 502]);
    expect(Number.isFinite(frame.minValue) && Number.isFinite(frame.maxValue)).toBe(true);
  });

  it('names the levels it could not fit', () => {
    const frame = frameRange(SESSION, LEVELS);
    const off = offScaleLevels(frame, LEVELS);
    expect(off).toContain(495);
    expect(off).not.toContain(502);
    // Nothing inside the frame is ever reported as off it.
    for (const v of off) {
      expect(v < frame.minValue || v > frame.maxValue).toBe(true);
    }
  });
});
