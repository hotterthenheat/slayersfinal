/*
==================================================
  SLAYER TERMINAL - SIGN SPLIT (charts/signSplit.ts)
  Split a signed series into an above-zero and a below-zero series so a chart
  can colour each half by what it MEANS, instead of painting the whole path one
  colour picked from the last value.

  This is not cosmetic. A cumulative dealer-gamma path that spends the morning
  long and the afternoon short, drawn entirely in the short colour because that
  is where it closed, tells the reader the book was short all session — directly
  contradicting the panel's own "long above the line / short below it" legend.
  The render pass caught exactly that on the Gamma Tape.

  The split inserts a synthetic point at each zero crossing, LINEARLY
  INTERPOLATED between the two straddling samples, so the two coloured segments
  meet exactly on the axis rather than overshooting past it or leaving a gap.
  Synthetic points carry `src: null`, which is how a tooltip knows it is sitting
  on a crossing rather than on a real observation.
==================================================
*/

export interface SignSplitRow<T> {
  /** Fractional position along the original sequence. Integers are real samples. */
  x: number;
  /** The signed value at x. */
  v: number;
  /** The value when it is at or above zero, else null (breaks the line). */
  pos: number | null;
  /** The value when it is at or below zero, else null. */
  neg: number | null;
  /** The source datum, or null at an interpolated zero crossing. */
  src: T | null;
}

/**
 * `items` in plot order (oldest first). `value` reads the signed quantity.
 * Returns a series ready for two recharts Areas/Lines with `connectNulls={false}`:
 * one on `pos`, one on `neg`.
 */
export function splitBySign<T>(items: T[], value: (d: T) => number): SignSplitRow<T>[] {
  const out: SignSplitRow<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    const v = value(items[i]);
    if (i > 0) {
      const prev = value(items[i - 1]);
      if (prev !== 0 && v !== 0 && Math.sign(prev) !== Math.sign(v)) {
        // Where the straight segment from prev to v crosses zero, as a fraction
        // of the step. prev - v is non-zero here because the signs differ.
        const u = prev / (prev - v);
        out.push({ x: i - 1 + u, v: 0, pos: 0, neg: 0, src: null });
      }
    }
    // A sample sitting exactly on zero belongs to both halves, so neither line
    // is left with a one-point gap at the axis.
    out.push({ x: i, v, pos: v >= 0 ? v : null, neg: v <= 0 ? v : null, src: items[i] });
  }
  return out;
}
