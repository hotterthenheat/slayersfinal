/*
==================================================
  SLAYER TERMINAL - WHAT THE PRICE SCALE FRAMES
  (gex/priceFrame.ts)

  How much room the candles keep when the structural
  levels want to be on screen too.

  THE BUG THIS EXISTS FOR. The strike chart used to widen
  its price range to include the put wall, the call wall and
  the king strike unconditionally — "so several strike-node
  bands are on screen, not just the couple around spot",
  which is a real thing to want. What it cost was never
  bounded. Measured on SPY: a session that traded 500.30 to
  501.60 (a range of $1.30) with a put wall at 495.00 framed
  the pane from 493.50 to 504.50, so the candles — the
  actual price action, the reason the chart is there — got
  12% of the vertical and rendered as a flat scribble. On a
  quiet day the walls sit further out and it is worse.

  The two wants are in direct conflict and neither wins
  outright, so the rule is a BUDGET rather than a
  preference: the candles are guaranteed a minimum share of
  the pane, and levels are admitted nearest-first until
  admitting the next one would break that guarantee. A wall
  close enough to matter is always on screen; a king strike
  4% away does not get to flatten the session.

  A level that does not fit is not lost — it keeps its price
  line and its axis pill, and the reader can zoom out to it.
  It simply stops dictating the frame.
==================================================
*/

export interface PriceRange {
  minValue: number;
  maxValue: number;
}

export interface FrameOptions {
  /**
   * The least of the pane the candles may be squeezed into, 0..1.
   *
   * 0.55 is the default: just over half. Below about a half the wick detail
   * that makes a candle chart worth reading stops being resolvable, and above
   * about two thirds almost no level ever fits, which throws away the whole
   * point of drawing them.
   */
  minCandleShare?: number;
  /** Breathing room added to each side, as a share of the final span. */
  pad?: number;
}

const DEFAULTS = { minCandleShare: 0.55, pad: 0.08 };

/** How far a price sits outside a range. Zero when it is inside. */
const distanceOutside = (v: number, lo: number, hi: number): number =>
  v < lo ? lo - v : v > hi ? v - hi : 0;

/**
 * The range the price scale should show.
 *
 * `candles` is what the series itself measured — `null` when there are no bars
 * yet, in which case the levels are all there is to frame.
 *
 * Levels are admitted NEAREST FIRST, which is the order that matters: if only
 * one of the call wall and the king strike can fit, it should be whichever is
 * closer to the money, because that is the one price is actually near.
 */
export function frameRange(
  candles: PriceRange | null,
  levels: readonly number[],
  options: FrameOptions = {}
): PriceRange {
  /*
    `Math.max` is not a guard against NaN — `Math.max(0.05, NaN)` is NaN, and a
    NaN budget makes every `span > budget` comparison false, which admits every
    level and produces exactly the unbounded frame this function exists to
    prevent. The check has to be for finiteness before any clamping.
  */
  const minCandleShare = Number.isFinite(options.minCandleShare)
    ? Math.min(1, Math.max(0.05, options.minCandleShare as number))
    : DEFAULTS.minCandleShare;
  const pad = Number.isFinite(options.pad) ? Math.max(0, options.pad as number) : DEFAULTS.pad;
  const finite = levels.filter(Number.isFinite);

  // No bars: the levels are the only thing to frame, and there is no candle
  // share to protect.
  if (!candles) {
    if (finite.length === 0) return { minValue: 0, maxValue: 1 };
    const lo = Math.min(...finite);
    const hi = Math.max(...finite);
    const span = Math.max(hi - lo, Math.max(Math.abs(hi) * 0.001, 0.01));
    return { minValue: lo - span * pad, maxValue: hi + span * pad };
  }

  let lo = candles.minValue;
  let hi = candles.maxValue;
  // A flat session still needs a span to divide by, and to be a denominator for
  // the budget below.
  const span = Math.max(hi - lo, Math.max(Math.abs(hi) * 0.0005, 0.01));
  // The whole point: `minCandleShare` of the pane belongs to the candles, so
  // the pane may be at most their span divided by that share. The share was
  // already clamped and finiteness-checked above.
  const budget = span / minCandleShare;

  for (const level of [...finite].sort(
    (a, b) =>
      distanceOutside(a, candles.minValue, candles.maxValue) -
      distanceOutside(b, candles.minValue, candles.maxValue)
  )) {
    const nextLo = Math.min(lo, level);
    const nextHi = Math.max(hi, level);
    if (nextHi - nextLo > budget) continue;
    lo = nextLo;
    hi = nextHi;
  }

  /*
    The 0.01 floor is for a degenerate span — a session that has not moved yet
    still needs a pane with height. It is NOT a minimum a caller can be given
    against their will: `pad: 0` means zero, and a test asking for an exact
    edge should get the edge.
  */
  const p = pad > 0 ? Math.max((hi - lo) * pad, 0.01) : 0;
  return { minValue: lo - p, maxValue: hi + p };
}

/**
 * The levels `frameRange` could not fit, for a caller that wants to say so.
 *
 * Derived by asking the frame rather than re-deriving the rule: a second copy
 * of the admission logic is a second answer to the same question, and the two
 * would drift the first time the budget changed.
 */
export function offScaleLevels(frame: PriceRange, levels: readonly number[]): number[] {
  return levels.filter(
    v => Number.isFinite(v) && (v < frame.minValue || v > frame.maxValue)
  );
}
