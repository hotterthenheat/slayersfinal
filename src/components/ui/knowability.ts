/*
==================================================
  SLAYER TERMINAL - KNOWABILITY (ui/knowability.ts)
  HOW DIRECTLY A NUMBER IS KNOWN. Not how strong it is, not how fresh it is.

  This vocabulary was invented on the Fracture desk, where it was the right
  answer to a hard problem: that page shows forced flow for five participants,
  and dealer hedging is read off the live chain while margin liquidation can
  only be guessed from thresholds. Printing both as plain numbers in one column
  would have said they were equally knowable. They are not, so the desk tagged
  each one and said why.

  It lived as a local `type Tier` and a hand-rolled chip inside a 1,100-line
  page. Every other desk that needed the same statement either went without or
  reached for a percentage — which is how the app ended up rendering a seeded
  hash as "Confidence 57%" on Trace, and the Compass score with a percent sign
  glued to it on the landing page. A number is the one shape this idea must not
  take: the whole point is that the quantity is not measurable, and a percentage
  claims a resolution that does not exist.

  ---------------------------------------------------------------------------
  WHAT THIS IS NOT
  ---------------------------------------------------------------------------
  Three other vocabularies in this app answer NEIGHBOURING questions, and none
  of them is this one. They are deliberately not merged:

    types/market.ts OpenInterestFreshness   WHEN — settled, estimated, absent
    compass/Freshness.tsx FreshnessKind     WHICH CLOCK — tick, sweep, held
    core/scanUniverse.ts ScanCoverage       HOW MUCH UNIVERSE is behind it

  A figure can be perfectly fresh and barely knowable (an intraday dealer
  position), or stale and directly observed (yesterday's settled open
  interest). Collapsing the axes would lose exactly the distinction each one
  was built to carry.

  ---------------------------------------------------------------------------
  THE COLOUR RULE
  ---------------------------------------------------------------------------
  Neutral ink only — textPrimary, textSecondary, textMuted, and a dot meter.
  compass/setupState.ts states the rule once for the whole app: green and red
  are the market's own language, so nothing that is merely a PROCESS may borrow
  them. Knowability is not a direction and not a verdict. It also spends no
  hue, so lib/palette.test.ts's HUE_BUDGET is untouched by design rather than
  by luck.
==================================================
*/

/**
 * How directly a figure is known.
 *
 * Closed set, ordered most to least knowable. If a number does not fit one of
 * these three, it does not belong on screen — `workspace/DataUnavailablePanel`
 * is the honest answer for a module with no source at all, and it refuses at
 * the panel rather than tagging a figure that should not exist.
 */
export type Knowability = 'observed' | 'estimated' | 'assumed';

/** Most to least knowable. Sort order for any column that ranks by this. */
export const KNOWABILITY_ORDER: Knowability[] = ['observed', 'estimated', 'assumed'];

export interface KnowabilityMeta {
  /** Chip text. Title case — it is a label, not a verdict, so it does not shout. */
  label: string;
  /** Filled dots out of three. The meter IS the scale; there is no percentage. */
  dots: number;
  /** Why this tier, in the tooltip, when the caller supplies no specific basis. */
  hint: string;
  /** Ink for the label. Descends with knowability so the eye ranks them unread. */
  text: string;
}

export const KNOWABILITY: Record<Knowability, KnowabilityMeta> = {
  observed: { label: 'Observed', dots: 3, hint: 'grounded in chain and tape data', text: 'text-textPrimary' },
  estimated: { label: 'Estimated', dots: 2, hint: 'inferred from proxies', text: 'text-textSecondary' },
  assumed: { label: 'Assumed', dots: 1, hint: 'inferred from assumptions', text: 'text-textMuted' },
};

/**
 * The tooltip for a chip: the tier, then the reason.
 *
 * `basis` is the caller's own sentence about THIS figure — "inferred from the
 * current option-chain gamma" reads better than the generic hint and is the
 * reason the Fracture desk's version was worth promoting. Falls back to the
 * tier's hint when a caller has nothing more specific to say.
 */
export function knowabilityTitle(tier: Knowability, basis?: string): string {
  const m = KNOWABILITY[tier];
  return `${m.label} — ${basis ?? m.hint}`;
}
