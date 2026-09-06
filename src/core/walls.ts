/*
==================================================
  SLAYER TERMINAL - NAMING THE WALLS (core/walls.ts)

  Which strike is THE call wall, and which is THE
  put wall. One rule, in one place, because it was
  written twice and the two copies disagreed.
==================================================
*/

/** Anything carrying a strike. The exposure is read through an accessor
    because the two callers spell the SAME NUMBER differently: the GEX
    snapshot's levels call it `value`, the option chain's nodes call it
    `netGex`, and `computeGexSnapshot` is literally
    `chain.map(n => ({ strike: n.strike, value: n.netGex }))` (simulator.ts).
    An accessor makes that identity visible at each call site and costs no
    per-tick array to convert between the two spellings. */
export interface Struck {
  readonly strike: number;
}

/**
 * The heaviest CALL-dominant shelf above spot, and the heaviest PUT-dominant
 * shelf below it.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SIGN IS CHECKED, AND WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * The original rule was |value| plus SIDE OF SPOT. Side of spot is only a
 * PROXY for option side. It holds for a fresh OI profile (simulator.ts seeds
 * calls above spot, puts below) and deliberately does NOT hold for the live
 * book, which is sticky by design (BOOK_BLEND, ~1h half-life: "walls persist,
 * get tested, and fade for real instead of shadowing price"). So a shelf keeps
 * its option side while price walks past it and its side of spot flips.
 *
 * Measured on SPY at spot 505.17: strike 505 carried -$436.8M — CALL-dominant
 * — and was named the PUT wall, so the strike rail printed a red PW tag on a
 * row sitting ABOVE its own flip rule at 504.50. A put wall on the call side
 * of the flip is not a thing that can exist.
 *
 * The sign IS the measured option side. `netGex = callGex + putGex` with
 * `dealerCallDirection = -0.55` and `dealerPutDirection = -0.53 * -1`
 * (simulator.ts), so NEGATIVE is call-dominant and POSITIVE is put-dominant.
 * Every other surface already reads it that way: the heat ramps, the strike
 * field's `put: l.value >= 0`, and the rail's own bar colour.
 *
 * ---------------------------------------------------------------------------
 * AND WHY IT IS SHARED RATHER THAN FIXED TWICE
 * ---------------------------------------------------------------------------
 * This rule existed in two places — `buildLevelsFor` (data/gex.ts) and
 * `generateTradePlan` (core/simulator.ts) — over the same numbers. Only the
 * first was fixed. The second kept feeding `plan.resistanceWall` /
 * `plan.supportWall` into three more surfaces: the GEX matrix's highlighted
 * wall rows, `readHeatPattern`'s prose, and the Pulse board. Terrain read the
 * corrected rule while the GEX page read the broken one, off one book.
 *
 * The FLIP had already been noticed and hand-synced across the same two
 * functions ("Matches data/gex.ts buildLevelsFor", simulator.ts) — a comment
 * asking the next reader to keep two copies in step. The walls are the case
 * where that did not survive. So the rule moved here instead.
 *
 * @param points  strikes to consider; order does not matter
 * @param spot    the price the sides are measured from
 * @param valueOf net dealer exposure at a strike — negative call-dominant,
 *                positive put-dominant
 * @returns each wall, or `null` where NOTHING on that side qualifies —
 *          "no call wall overhead" is a real state of the book, and callers
 *          disagree about how to render it, so the choice of fallback stays
 *          with them rather than being invented here.
 */
export function pickWalls<T extends Struck>(
  points: readonly T[],
  spot: number,
  valueOf: (p: T) => number
): { callWall: number | null; putWall: number | null } {
  let callWall: number | null = null;
  let cwAbs = 0;
  let putWall: number | null = null;
  let pwAbs = 0;

  for (const p of points) {
    const v = valueOf(p);
    const a = Math.abs(v);
    // Same magnitude comparison as before, restricted to the half of the book
    // the name actually claims. No new arithmetic.
    if (p.strike > spot && v < 0 && a > cwAbs) {
      cwAbs = a;
      callWall = p.strike;
    }
    if (p.strike < spot && v > 0 && a > pwAbs) {
      pwAbs = a;
      putWall = p.strike;
    }
  }

  return { callWall, putWall };
}

/**
 * The gamma flip: the sign-change midpoint NEAREST SPOT.
 *
 * ---------------------------------------------------------------------------
 * THE WALLS' STORY, A SECOND TIME — caught before it finished happening
 * ---------------------------------------------------------------------------
 * This rule was written four times: `buildExposureProfile` (data/exposure.ts),
 * `buildLevelsFor` (data/gex.ts), `generateTradePlan` (core/simulator.ts) —
 * all three nearest-to-spot, hand-synced by comments asking the next reader to
 * keep them in step — and `levelsFrom` (data/vannacharm.ts), which walked up
 * the chain and BROKE ON THE FIRST crossing it met.
 *
 * First-from-the-bottom is the exact bug the other three were unified to fix
 * (2026-08-18): a noisy book can carry a jitter crossing deep in the put tail,
 * and breaking on the first hit names THAT the regime border while the
 * structural flip sits at spot. Every migration map, level-shift row and wall
 * drift timeline read the divergent copy, so the flip the Vanna & Charm page
 * projected could disagree with the flip the Exposure page drew, off one book.
 *
 * The fourth copy was found when P-4 needed a FIFTH reader of the rule. Same
 * decision as the walls above: the rule moves here, every caller points at it,
 * and the next surface that needs a flip cannot write its own.
 *
 * @returns the crossing nearest spot, or `null` when the field never changes
 *          sign — a one-sided book has no flip, and "no flip" is a real state
 *          the caller has to render deliberately rather than inherit as spot.
 */
export function pickFlip<T extends Struck>(
  points: readonly T[],
  spot: number,
  valueOf: (p: T) => number
): number | null {
  let flip: number | null = null;
  let flipDist = Infinity;
  for (const mid of flipCrossings(points, valueOf)) {
    const d = Math.abs(mid - spot);
    if (d < flipDist) {
      flipDist = d;
      flip = mid;
    }
  }
  return flip;
}

/**
 * EVERY sign change on the grid, ascending — not just the one nearest spot.
 *
 * P-5.1 asks for a fallback state when the field never crosses zero, so that
 * "no flip" cannot be mistaken for a real one. Measured across all 22 names:
 * no book fails to cross, and every one crosses exactly once. The desk's
 * single flip line is unqualified and correct.
 *
 * This exists so a surface CAN say otherwise the day that stops being true.
 * A flip that is the only crossing and a flip that is one of three are
 * different facts, and the second deserves a word — `readFlip` supplies it,
 * and says nothing at all in the ordinary case, which is the only way a
 * qualifier keeps its meaning.
 */
export function flipCrossings<T extends Struck>(
  points: readonly T[],
  valueOf: (p: T) => number
): number[] {
  const asc = [...points].sort((a, b) => a.strike - b.strike);
  const out: number[] = [];
  /* ZERO IS NOT A THIRD SIGN, and this is not a hypothetical.

     `Math.sign(0)` is 0, which differs from both +1 and -1, so the naive
     pairwise test reports TWO crossings wherever the field touches zero and
     carries on the same way — and on a book quantised to the cent, exact
     zeros are common in the tails where OI thins out.

     I measured the universe with the naive test before writing this and
     read "three crossings on every name", concluded the flip was
     ambiguous, and said so. It was not: with zeros handled, all 22 books
     cross exactly once. The desk's single flip line was right all along.
     The bug was in the measurement, and the fix is to carry the last
     NON-ZERO sign forward rather than to compare adjacent pairs. */
  let prev: { strike: number; sign: number } | null = null;
  for (const p of asc) {
    const v = valueOf(p);
    if (v === 0) continue;                 // a touch, not a turn
    const sign = Math.sign(v);
    if (prev && sign !== prev.sign) out.push((prev.strike + p.strike) / 2);
    prev = { strike: p.strike, sign };
  }
  return out;
}

/** The strike where the field comes closest to zero without crossing — the
    place a flip WOULD be if the book had one. Only meaningful when there is
    no crossing at all, which is why it is separate from `pickFlip` rather
    than folded into it as a silent fallback. */
export function nearestToZero<T extends Struck>(
  points: readonly T[],
  valueOf: (p: T) => number
): number | null {
  let best: number | null = null;
  let bestAbs = Infinity;
  for (const p of points) {
    const v = Math.abs(valueOf(p));
    if (v < bestAbs) { bestAbs = v; best = p.strike; }
  }
  return best;
}

export type FlipKind = 'sole' | 'nearest-of-several' | 'no-crossing';

export const FLIP_KIND_WORDS: Record<FlipKind, string> = {
  sole: '',
  'nearest-of-several': 'nearest of several',
  'no-crossing': 'no crossing',
};

export const FLIP_KIND_NOTES: Record<FlipKind, string> = {
  sole: 'The book changes sign exactly once. This line is the regime border, without qualification.',
  'nearest-of-several':
    'The book changes sign more than once — the far crossings are usually jitter in the tails rather than regime borders, so the desk shows the one nearest spot. It is a choice, and this is the desk saying so.',
  'no-crossing':
    'The book never changes sign on this grid, so there is no flip. The line shown is where net exposure comes CLOSEST to zero — the place a flip would be, not a flip.',
};

export interface FlipRead {
  /** The line to draw. Null only when the grid is empty. */
  strike: number | null;
  kind: FlipKind;
  /** Every crossing on the grid, ascending. Empty for `no-crossing`. */
  crossings: number[];
}

/**
 * The flip, with the honesty the single number could not carry.
 *
 * `pickFlip` stays exactly as it was — five surfaces call it and it is
 * right — and this wraps it for the surfaces that draw the line and can
 * afford a word beside it.
 */
export function readFlip<T extends Struck>(
  points: readonly T[],
  spot: number,
  valueOf: (p: T) => number
): FlipRead {
  const crossings = flipCrossings(points, valueOf);
  if (crossings.length === 0) {
    return { strike: nearestToZero(points, valueOf), kind: 'no-crossing', crossings };
  }
  return {
    strike: pickFlip(points, spot, valueOf),
    kind: crossings.length === 1 ? 'sole' : 'nearest-of-several',
    crossings,
  };
}
