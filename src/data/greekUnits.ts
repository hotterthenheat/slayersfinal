/*
==================================================
  SLAYER TERMINAL - WHAT ONE UNIT OF EACH GREEK IS
  (data/greekUnits.ts)
==================================================

  A GREEK WITHOUT ITS CONVENTION IS NOT A NUMBER, it is a number times an
  unstated constant, and this codebase carries a live example of why that
  matters: `core/greeks.ts` reports vega PER 1 POINT of vol (it divides the
  raw partial by 100), while `core/higherGreeks.ts` deliberately keeps the RAW
  partial, per 1.00 of vol, because volga and vanna are defined against it.

  Both are correct. They differ by a factor of a hundred. Until now the UI
  labelled both of them "Vega", which means a reader comparing a chain vega
  against a higher-greek surface was comparing two different quantities with
  the same name — and nothing on screen would have told them.

  So the unit travels with the label. These are the strings the UI appends,
  and they are short on purpose: a label that costs a column its width will be
  dropped by the next person who needs the space.
*/

export type GreekName =
  | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho'
  | 'vanna' | 'charm' | 'volga' | 'speed' | 'zomma';

/** The per-what, in the fewest words that remove the ambiguity. */
export const GREEK_UNITS: Record<GreekName, string> = {
  delta: 'per $1',
  gamma: 'per $1²',
  theta: 'per day',
  vega: 'per 1% vol',
  rho: 'per 1% rate',
  vanna: 'per 1% vol × $1',
  charm: 'per day × $1',
  volga: 'per 1% vol²',
  speed: 'per $1³',
  zomma: 'per 1% vol × $1²',
};

/** The sentence for a tooltip, where there is room for one. */
export const GREEK_UNIT_NOTES: Record<GreekName, string> = {
  delta: 'Change in option price per $1 move in the underlying.',
  gamma: 'Change in delta per $1 move in the underlying.',
  theta: 'Change in option price per calendar day.',
  vega: 'Change in option price per ONE POINT of implied vol — the raw partial divided by 100.',
  rho: 'Change in option price per one point of interest rate.',
  vanna: 'Change in delta per point of vol, or equivalently vega per $1 of spot.',
  charm: 'Change in delta per calendar day.',
  volga: 'Change in vega per point of vol.',
  speed: 'Change in gamma per $1 move in the underlying.',
  zomma: 'Change in gamma per point of vol.',
};

/**
 * THE RAW CONVENTION, for the surfaces that use it. `higherGreeks.ts` works in
 * per-1.00 vol because the second-order definitions are cleaner there; a
 * surface reading from it must say so rather than borrow the chain's label.
 */
export const GREEK_UNITS_RAW: Partial<Record<GreekName, string>> = {
  vega: 'per 1.00 vol',
  volga: 'per 1.00 vol²',
  vanna: 'per 1.00 vol × $1',
};

/** "Vega (per 1% vol)" — the label the UI should actually render. */
export const greekLabel = (name: GreekName, raw = false): string => {
  const unit = (raw && GREEK_UNITS_RAW[name]) || GREEK_UNITS[name];
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return `${title} (${unit})`;
};
