import { describe, it, expect } from 'vitest';
import { axisUsd, paddedDomain, symmetricDomain, symmetricTicks, zeroAnchoredDomain, niceTicks } from './chartTheme';

/*
  The domain and tick helpers decide what a reader can actually read off an
  axis, so their edge cases are pinned rather than eyeballed. Two of these exist
  because the render pass caught the alternative failing: a symmetric axis that
  gave 40% of its height to a range the data never visits, and evenly-divided
  ticks that produced a scale reading 37.8 / 31.6 / 21.6 / 11.6 / 1.6.
*/

describe('axisUsd', () => {
  it('abbreviates by magnitude and keeps the sign', () => {
    expect(axisUsd(0)).toBe('$0');
    expect(axisUsd(950)).toBe('$950');
    expect(axisUsd(8_400)).toBe('$8.4K');
    expect(axisUsd(124_000)).toBe('$124K');
    expect(axisUsd(8_400_000)).toBe('$8.4M');
    expect(axisUsd(84_000_000)).toBe('$84M');
    expect(axisUsd(1_240_000_000)).toBe('$1.2B');
    expect(axisUsd(-8_400_000)).toBe('-$8.4M');
  });

  it('drops the decimal once two significant digits are in front of it', () => {
    // An axis tick has about six characters before it collides with its
    // neighbour, so "$12K" is preferred over "$12.4K" — the extra digit costs
    // more than it tells at tick resolution.
    expect(axisUsd(12_400)).toBe('$12K');
    expect(axisUsd(84_000_000)).toBe('$84M');
  });
});

describe('paddedDomain', () => {
  it('pads a range by a fraction of its own span', () => {
    const [lo, hi] = paddedDomain([10, 20], 0.1);
    expect(lo).toBeCloseTo(9, 10);
    expect(hi).toBeCloseTo(21, 10);
  });

  it('gives a flat series room rather than a zero-height plot', () => {
    const [lo, hi] = paddedDomain([5, 5, 5], 0.1);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(5);
  });

  it('ignores non-finite values and survives an empty series', () => {
    expect(paddedDomain([])).toEqual([0, 1]);
    const [lo, hi] = paddedDomain([1, NaN, 3, Infinity], 0);
    expect(lo).toBe(1);
    expect(hi).toBe(3);
  });
});

describe('symmetricDomain / symmetricTicks', () => {
  it('centres on zero using the larger side', () => {
    const [lo, hi] = symmetricDomain([-2, 8], 1);
    expect(lo).toBe(-8);
    expect(hi).toBe(8);
  });

  it('always puts a tick on zero', () => {
    expect(symmetricTicks(10)).toEqual([-10, -5, 0, 5, 10]);
  });
});

describe('zeroAnchoredDomain', () => {
  it('contains zero without centring on it', () => {
    // The Gamma Tape case: a book running −$9M to +$21M. Symmetric would give
    // ±$21M and waste 40% of the plot; this keeps zero on the axis and lets the
    // data fill the height it earned.
    const [lo, hi] = zeroAnchoredDomain([-9, 21], 0.1);
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(21);
    expect(Math.abs(lo)).toBeLessThan(hi); // NOT symmetric
    expect(hi - 21).toBeCloseTo(3, 10); // padded by 10% of the 30-wide span
  });

  it('does not pad past zero on a wholly positive series', () => {
    const [lo, hi] = zeroAnchoredDomain([4, 9], 0.1);
    expect(lo).toBe(0); // the floor reads $0, not a negative the data never reaches
    expect(hi).toBeGreaterThan(9);
  });

  it('does not pad past zero on a wholly negative series', () => {
    const [lo, hi] = zeroAnchoredDomain([-9, -4], 0.1);
    expect(hi).toBe(0);
    expect(lo).toBeLessThan(-9);
  });

  it('survives empty and all-zero input', () => {
    expect(zeroAnchoredDomain([])).toEqual([0, 1]);
    const [lo, hi] = zeroAnchoredDomain([0, 0]);
    expect(hi).toBeGreaterThanOrEqual(lo);
  });
});

describe('niceTicks', () => {
  it('produces round values, not an even division of the domain', () => {
    // The Vol Complex case: a padded domain of 1.6 to 37.8 auto-divided into
    // 37.8 / 31.6 / 21.6 / 11.6 / 1.6 — a scale nobody can read a value off.
    const ticks = niceTicks(1.6, 37.8);
    expect(ticks.length).toBeGreaterThan(2);
    for (const t of ticks) {
      // Every tick is a whole multiple of a 1/2/5 x power-of-ten step.
      expect(Number.isInteger(t / 10) || Number.isInteger(t / 5) || Number.isInteger(t)).toBe(true);
    }
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(1.6);
      expect(t).toBeLessThanOrEqual(37.8);
    }
  });

  it('includes zero whenever the domain spans it', () => {
    expect(niceTicks(-9e6, 23e6)).toContain(0);
    expect(niceTicks(-1, 1)).toContain(0);
  });

  it('stays inside the domain and stays ascending', () => {
    const ticks = niceTicks(-9_900_000, 23_100_000);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    expect(ticks[0]).toBeGreaterThanOrEqual(-9_900_000);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(23_100_000);
  });

  it('does not leak float noise into a label', () => {
    // Repeated addition of a 0.2 step accumulates error; a tick rendered as
    // 0.30000000000000004 is a visible bug.
    for (const t of niceTicks(0, 1)) {
      expect(String(t)).not.toMatch(/\d{10,}/);
    }
  });

  it('returns nothing for a degenerate or invalid domain', () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(9, 1)).toEqual([]);
    expect(niceTicks(NaN, 10)).toEqual([]);
  });
});
