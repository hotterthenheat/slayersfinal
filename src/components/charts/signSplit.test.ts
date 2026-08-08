import { describe, it, expect } from 'vitest';
import { splitBySign } from './signSplit';

/*
  The sign split exists so a signed path is coloured by the regime it is IN at
  each point rather than by the regime it happens to end in. These tests pin the
  two properties that makes true: the halves are disjoint, and they meet exactly
  on zero.
*/

const v = (x: number) => x;

describe('splitBySign', () => {
  it('keeps a wholly positive series in one half and leaves the other empty', () => {
    const out = splitBySign([1, 2, 3], v);
    expect(out).toHaveLength(3);
    expect(out.map(r => r.pos)).toEqual([1, 2, 3]);
    expect(out.map(r => r.neg)).toEqual([null, null, null]);
  });

  it('keeps a wholly negative series in the other half', () => {
    const out = splitBySign([-1, -2], v);
    expect(out.map(r => r.neg)).toEqual([-1, -2]);
    expect(out.map(r => r.pos)).toEqual([null, null]);
  });

  it('inserts an interpolated zero at each crossing so the halves meet on the axis', () => {
    // +2 -> -2 crosses exactly halfway between index 0 and index 1.
    const out = splitBySign([2, -2], v);
    expect(out).toHaveLength(3);
    const cross = out[1];
    expect(cross.src).toBeNull();
    expect(cross.x).toBeCloseTo(0.5, 10);
    expect(cross.v).toBe(0);
    // The crossing belongs to BOTH halves — that is what makes the positive
    // segment end on the axis and the negative segment start there, instead of
    // one overshooting past zero or a gap opening between them.
    expect(cross.pos).toBe(0);
    expect(cross.neg).toBe(0);
  });

  it('places the crossing proportionally, not at the midpoint', () => {
    // +3 -> -1: the zero is three quarters of the way across the step.
    const [, cross] = splitBySign([3, -1], v);
    expect(cross.x).toBeCloseTo(0.75, 10);
  });

  it('finds every crossing in a path that flips more than once', () => {
    const out = splitBySign([1, -1, 1, -1], v);
    const crossings = out.filter(r => r.src === null);
    expect(crossings).toHaveLength(3);
    // Strictly increasing x — a crossing can never be emitted out of order.
    for (let i = 1; i < out.length; i++) expect(out[i].x).toBeGreaterThan(out[i - 1].x);
  });

  it('treats a sample sitting exactly on zero as belonging to both halves', () => {
    // Touching zero and returning to the same side is not a crossing, so no
    // synthetic point is added — but the sample must not break either line.
    const out = splitBySign([1, 0, 1], v);
    expect(out).toHaveLength(3);
    expect(out[1].pos).toBe(0);
    expect(out[1].neg).toBe(0);
    expect(out.every(r => r.src !== null)).toBe(true);
  });

  it('never emits a point that is in neither half', () => {
    const out = splitBySign([5, -3, 0, 2, -8, -1], v);
    for (const r of out) expect(r.pos !== null || r.neg !== null).toBe(true);
  });

  it('handles empty and single-point inputs', () => {
    expect(splitBySign([], v)).toEqual([]);
    expect(splitBySign([7], v)).toEqual([{ x: 0, v: 7, pos: 7, neg: null, src: 7 }]);
  });
});
