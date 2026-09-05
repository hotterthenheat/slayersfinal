/*
==================================================
  SLAYER TERMINAL - THE DATA SEAMS (data/feeds.ts)
  Part 15's "data-source preferences", and the
  honest home for Part 14's un-buildable surfaces.
==================================================

  WHY THIS IS A REGISTRY AND NOT A SETTINGS PANEL. "Data-source
  preferences" implies a choice, and on this desk there is no choice to
  offer: a surface is either backed by an entitlement on the account or it
  is not, and a dropdown over feeds nobody has bought would be a control
  that changes nothing. What a reader can usefully be given instead is the
  TRUTH — which surfaces are live, which are waiting on which feed, and
  what each one will show the day it lands.

  THE REAL PROBLEM THIS SOLVES. Part 14 lists surfaces that "have no UI at
  all yet and no natural home", and asks for shells. Three of them cannot be
  built as shells without either fabricating data or shipping three empty
  pages into the navigation, where every reader has to learn to skip them
  forever. One page listing them, with what each needs, is more useful than
  three dead routes and is honest about the same facts.

  ── WHY EACH ABSENT ONE IS ABSENT, stated once, in its entry below ───────

  The hardest of these to resist is IMPLIED BORROW. Parity residuals look
  computable from the chain this desk already draws — and they are not, for
  a reason worth writing down: every option here is priced by
  `blackScholesPrice` from the SAME r and q, so put-call parity holds to
  floating-point exactly, by construction. A borrow panel fed from this
  chain would draw a flat line at zero on every name and every strike, and
  a flat line at zero LOOKS like a measurement. It is the shape of the
  answer with none of the content.
*/

/** What a surface is waiting on, in the account's own terms. */
export type FeedState = 'live' | 'not-on-plan' | 'no-endpoint';

export const FEED_STATE_WORDS: Record<FeedState, { label: string; note: string }> = {
  live: {
    label: 'Live',
    note: 'On the account and reaching the desk.',
  },
  'not-on-plan': {
    label: 'Not on this plan',
    note: 'The data exists and this key does not buy it. An add-on turns it on; nothing needs building first.',
  },
  'no-endpoint': {
    label: 'No source',
    note: 'Nothing on any plan we hold publishes this. It needs a different provider, not a different tier.',
  },
};

export interface FeedSeam {
  /** The surface, named as a reader would look for it. */
  surface: string;
  state: FeedState;
  /** The feed or entitlement, in the vendor's own words. */
  needs: string;
  /** What the surface will show once it has that. */
  shows: string;
  /** Where the seam already is, so "nothing else changes" is checkable. */
  seam: string;
  /** Live surfaces only: where to go and look at it. */
  path?: string;
}

export const FEED_SEAMS: FeedSeam[] = [
  /* ---- the live ones, so the list is not only a wishlist -------------- */
  {
    surface: 'Options chain, exposure and greeks',
    state: 'live',
    needs: 'Options entitlement',
    shows: 'Every strike, both sides, with gamma, delta, vega, vanna and charm as dealer exposure.',
    seam: 'core/simulator.ts → generateOptionsChain',
    path: '/pinpoint/exposure-profile',
  },
  {
    surface: 'Equity prices and session bars',
    state: 'live',
    needs: 'Stocks entitlement',
    shows: 'Intraday bars, session levels and everything drawn on them.',
    seam: 'core/simulator.ts → candleHistory',
    path: '/terrain',
  },
  {
    surface: 'Index levels',
    state: 'live',
    needs: 'Three index feeds',
    shows: 'The index quotes the twin lens and the futures desk read against.',
    seam: 'data/indexTwins.ts relates a family to its index; core/simulator.ts quotes the levels.',
    path: '/index-futures',
  },

  /* ---- waiting on an add-on ------------------------------------------- */
  {
    surface: 'Rate curve behind every greek',
    state: 'not-on-plan',
    needs: 'Economic indicators add-on',
    shows: 'A real r per tenor instead of one assumed front-end rate. The carry chip stops saying "assumed".',
    seam: 'core/carry.ts → setCarry, already read by every greek',
  },
  {
    surface: 'Dividend yields',
    state: 'not-on-plan',
    needs: 'Corporate actions feed',
    shows: 'A real q per name. Today one figure stands in for the whole roster, which overstates a zero-yield name deliberately and says so.',
    seam: 'core/carry.ts → setCarry',
  },
  {
    surface: 'FLEX open-interest transfers',
    state: 'not-on-plan',
    needs: 'The daily OI-change endpoint',
    shows: 'The part of a strike’s OI jump that moved between books with no trade behind it — the phantom build nobody else separates out.',
    seam: 'data/oiHeat.ts → OiHeatCell.flexTransfer, null today rather than zero',
    path: '/pinpoint/oi-heat',
  },
  {
    surface: 'Short interest and borrow',
    state: 'not-on-plan',
    needs: 'Shorts endpoints — short interest, FTDs, float, borrow rates',
    shows: 'What is actually short in a name, what it costs to stay short, and where the settlement failures are.',
    seam: 'No consumer yet. Nothing on the desk currently pretends to know this.',
  },
  {
    surface: 'CME futures tape',
    state: 'not-on-plan',
    needs: 'Futures add-on — CONFIRM before designing around it',
    shows: 'ES, NQ and RTY time and sales, candles, settlement and open interest, beside the index they lead.',
    seam: 'data/futures.ts models the phases; the tape itself has no source.',
    path: '/index-futures',
  },

  /* ---- nothing we hold publishes it ----------------------------------- */
  {
    surface: 'Options TCA — execution quality',
    state: 'no-endpoint',
    needs: 'Per-print NBBO at the moment of the fill',
    shows: 'Effective against quoted spread, price improvement per fill, and where a desk is paying up. Institutional-grade, and nothing in the app comes close.',
    seam: 'No seam. A print on this tape carries a price and a size and no quote beside it — the comparison has no second term, so there is nothing to stub.',
  },
  {
    surface: 'Implied borrow and box rates',
    state: 'no-endpoint',
    needs: 'A real quoted chain — two-sided markets, not a model',
    shows: 'Parity residuals as an implied financing rate, which doubles as a live source for q.',
    seam: 'None, and deliberately none: every option here is priced from the SAME r and q, so parity holds exactly and the residual is zero on every strike by construction. A panel fed from this chain would draw a flat zero and look like a measurement.',
  },
];

/** The seams in the state given, in the order declared. */
export function seamsIn(state: FeedState): FeedSeam[] {
  return FEED_SEAMS.filter(s => s.state === state);
}

/*
  ONE LINE FOR A HEADER — how much of the list is actually on.

  Counted rather than claimed: a "3 of 10 live" that drifts from the array
  below it is the kind of small lie that costs a reader their trust in the
  rest of the page.
*/
export function seamSummary(): string {
  const live = seamsIn('live').length;
  return `${live} of ${FEED_SEAMS.length} data classes are on this account.`;
}
