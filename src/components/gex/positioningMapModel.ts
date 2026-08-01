import type { StrikeExposure } from '../../types/gex';

/*
  Pure derivations behind the dealer positioning map.

  The map stopped being a stacked ladder of fixed-height rows: rows are what
  gave it a ~508px intrinsic height, and two of its three hosts give it under
  400. Strikes are now placed on a continuous price axis as tiled bands, so the
  same 21 strikes fit 190px or 520px with nothing elided and nothing scrolling.

  Everything here is geometry and arithmetic over data the component already
  receives, kept out of the component so it can be reasoned about (and tested)
  without a DOM.
*/

export interface BandGeom {
  strike: number;
  top: number;
  height: number;
  center: number;
}

export interface PriceScale {
  step: number;
  hi: number;
  lo: number;
  /** Distance from the plot top for a price, in the units of the `plotH` passed. */
  yOf: (price: number) => number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The price axis the bands live on. `plotH` defaults to 1, which yields the
 * normalized 0..1 form; pass the measured plot height for pixels.
 */
export function priceScale(strikes: StrikeExposure[], plotH = 1): PriceScale {
  const step = strikes.length > 1 ? Math.abs(strikes[0].strike - strikes[1].strike) || 1 : 1;
  const hi = (strikes[0]?.strike ?? 0) + step / 2;
  const lo = (strikes[strikes.length - 1]?.strike ?? 0) - step / 2;
  const span = hi - lo || 1;
  return { step, hi, lo, yOf: (price: number) => clamp01((hi - price) / span) * plotH };
}

/**
 * One band per strike, centered on it, spanning to the midpoint of each
 * neighbour. That midpoint is exactly how the flip is defined upstream — the
 * plan places it halfway between the two strikes the smoothed net-GEX profile
 * crosses zero across (simulator.ts `generateTradePlan`, surfaced by gex.ts
 * `buildLevels`) — so the boundary where the fill changes colour IS the engine's
 * flip: no synthetic vertex, no interpolant, no second opinion about where the
 * regime turns.
 *
 * Edges come from the neighbours rather than a single `step`, so an uneven
 * strike chain still tiles exactly instead of opening seams; on the even chains
 * the engine actually emits, the two are identical.
 */
export function bands(strikes: StrikeExposure[], plotH: number): BandGeom[] {
  if (strikes.length === 0) return [];
  const { step, yOf } = priceScale(strikes, plotH);
  const edge = (i: number): number => {
    if (i === 0) return strikes[0].strike + step / 2;
    if (i === strikes.length) return strikes[strikes.length - 1].strike - step / 2;
    return (strikes[i - 1].strike + strikes[i].strike) / 2;
  };
  return strikes.map((row, i) => {
    const top = yOf(edge(i));
    // Rounding must never leave a hairline of canvas under the last band.
    const bottom = i === strikes.length - 1 ? plotH : yOf(edge(i + 1));
    const height = Math.max(0, bottom - top);
    return { strike: row.strike, top, height, center: top + height / 2 };
  });
}

/**
 * The honest bar ceiling. `maxAbs.gex` is max(|put|, |call|, |net|), which is
 * right for the panels that draw the legs and wrong here: the map draws only
 * `net`, the cancellation of two opposite-signed legs, so every bar was scaled
 * against a ceiling roughly twice the tallest thing on screen.
 */
export function netMaxOf(strikes: StrikeExposure[]): number {
  let m = 1;
  for (const s of strikes) m = Math.max(m, Math.abs(s.gex.net));
  return m;
}

/*
  There is deliberately no king derivation here.

  This module only ever sees `StrikeExposure[]` — a WINDOWED, expiry-decayed,
  per-strike-jittered view of the book — so an argmax over it answers "the
  biggest bar currently drawn", which is a different question from "the book's
  king" and moves when the panel is resized. The two disagreed on 8 of 32
  ticker × expiry combinations, and the map crowned one strike while the levels
  rail above it named another.

  `ExposureLevels.king` carries the book's answer from gex.ts `buildLevels`, and
  PositioningMap.tsx reads it. If the king falls outside the rendered window, no
  row is crowned — the honest outcome, and the one the type makes easy.
*/

/**
 * Net gamma accumulated between the anchor and each strike, the anchor's own
 * side exclusive:
 *   k > anchor: sum of net over strikes j with anchor < j <= k
 *   k < anchor: sum of net over strikes j with k <= j < anchor
 * Zero at the anchor by construction, so the curve is pinned to the spine there.
 */
export function cumulative(strikes: StrikeExposure[], anchor: number): Map<number, number> {
  const asc = [...strikes].sort((a, b) => a.strike - b.strike);
  const out = new Map<number, number>();
  let run = 0;
  for (const s of asc) {
    if (s.strike > anchor) {
      run += s.gex.net;
      out.set(s.strike, run);
    }
  }
  run = 0;
  for (let i = asc.length - 1; i >= 0; i--) {
    const s = asc[i];
    if (s.strike < anchor) {
      run += s.gex.net;
      out.set(s.strike, run);
    }
  }
  for (const s of asc) if (s.strike === anchor) out.set(s.strike, 0);
  return out;
}

/**
 * One fixed half-width denominator that fits the curve at EVERY anchor. A scale
 * that moves under the cursor is unreadable, and selection re-anchors the
 * ribbon.
 *
 * Every value `cumulative` can produce is a difference of two ascending prefix
 * sums, so the prefix range bounds all of them. Deriving it from the
 * spot-anchored map instead would under-fit: the downward branch accumulates
 * positively rather than negating, so that map is not an affine image of the
 * prefix sums and its own range can be smaller than another anchor's reach.
 */
export function cumHalfOf(strikes: StrikeExposure[]): number {
  const asc = [...strikes].sort((a, b) => a.strike - b.strike);
  let run = 0;
  let hi = 0;
  let lo = 0;
  for (const s of asc) {
    run += s.gex.net;
    if (run > hi) hi = run;
    if (run < lo) lo = run;
  }
  return Math.max(1, hi - lo);
}

/**
 * Contiguous runs only. `priorScaled` skips strikes whose raw current value is
 * zero, and a single path across a hole would draw a straight line through
 * prices it has no reading for.
 */
export function ghostRuns(bandList: BandGeom[], prior: Map<number, number>): BandGeom[][] {
  const runs: BandGeom[][] = [];
  let run: BandGeom[] = [];
  for (const b of bandList) {
    if (prior.has(b.strike)) run.push(b);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

export type Tier = 'MICRO' | 'COMPACT' | 'FULL';

const MICRO_MAX = 240;
const COMPACT_MAX = 360;
/** A one-pixel wobble mid-drag must not retier a workspace tile. */
const HYSTERESIS = 12;

export function tierFor(height: number, prev: Tier): Tier {
  const loEdge = prev === 'MICRO' ? MICRO_MAX + HYSTERESIS : MICRO_MAX;
  const hiEdge = prev === 'FULL' ? COMPACT_MAX - HYSTERESIS : COMPACT_MAX;
  if (height < loEdge) return 'MICRO';
  if (height < hiEdge) return 'COMPACT';
  return 'FULL';
}
