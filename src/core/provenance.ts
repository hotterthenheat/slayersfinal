import type { Knowability } from '../components/ui/knowability';

/*
==================================================
  SLAYER TERMINAL - PROVENANCE (core/provenance.ts)
  How a number is known, carried in its TYPE.

  This generalizes a pattern the codebase already proved. `core/openInterest.ts`
  wraps every OI figure so a panel physically cannot render a bare count without
  knowing which session it belongs to, and that single decision is why nobody has
  ever drawn intraday OI as if it were measured. Nothing else in the app has that
  protection.

  The reason it needs one: `data/hedgeimpact.ts` opens with an honest comment
  saying its liquidity denominator is modeled rather than measured — and shipped a
  seeded hash to the screen anyway, under a heading that reads as a market fact,
  for as long as the file has existed. An accurate comment is documentation for a
  maintainer. It is not a label on the screen and it stops nothing. A type is
  read by the compiler on every build.

  So: a figure that reaches a chart, a stat card or a table cell arrives wrapped,
  and the wrapper is not optional.
==================================================
*/

export interface Stamped<T> {
  readonly value: T;
  /**
   * How directly this is known.
   *
   * Deliberately the SAME closed set as `ui/knowability.ts`, not a new one. That
   * file names the three neighbouring axes it must never be merged with —
   * `OpenInterestFreshness` (which session), `compass/Freshness` (which clock),
   * `ScanCoverage` (how much of the universe) — and a fourth vocabulary for the
   * same question would be the drift those distinctions exist to prevent.
   */
  readonly knowability: Knowability;
  /** ISO instant the underlying observation belongs to — not when we rendered it. */
  readonly asOf: string;
  /**
   * One short clause naming the source, in the module's own words: "chain ATM IV
   * at the matching tenor", "trailing 15m consolidated prints".
   *
   * Never a number, and in particular never a confidence percentage.
   * `ui/knowability.ts` argues that case in its own header and it is right: the
   * app already shipped a seeded hash as "Confidence 57%" once. A percentage
   * claims a resolution that does not exist, and the whole point of the stamp is
   * that the quantity is not measurable.
   */
  readonly basis: string;
}

/**
 * Stamp a figure at the point it is DERIVED — inside `src/data/` or `src/core/`.
 *
 * Never at render. If a component has to decide what a number's provenance is,
 * the provenance was lost somewhere upstream and the component is guessing.
 */
export function stamp<T>(
  value: T,
  knowability: Knowability,
  asOf: string,
  basis: string
): Stamped<T> {
  return { value, knowability, asOf, basis };
}

/** Read the figure. Named so a call site that unwraps is greppable. */
export const unstamp = <T>(s: Stamped<T>): T => s.value;

/**
 * The weakest of several stamps — for a figure derived from more than one input.
 *
 * A quantity is exactly as knowable as its least knowable ingredient: a measured
 * numerator over an assumed denominator is assumed, not measured. That is the
 * arithmetic HEX got wrong.
 */
export function weakest(...tiers: Knowability[]): Knowability {
  if (tiers.includes('assumed')) return 'assumed';
  if (tiers.includes('estimated')) return 'estimated';
  return 'observed';
}
