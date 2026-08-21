/*
==================================================
  SLAYER TERMINAL - DEALER BOOK CONVENTION (core/dealerBook.ts)
  The assumption every exposure surface rests on, in one place, named.

  Black-Scholes gamma is IDENTICAL and POSITIVE for a call and a put at the same
  strike — a direct consequence of put-call parity. So the call-versus-put sign
  in a gamma-exposure figure is not a property of the greek. It is an assumption
  about who is holding which side, and nothing in the entitled data identifies
  the holder of a contract: OPRA carries no account-type flag, and open interest
  is a count with no owner attached.

  The consequence is the reason this file exists rather than two literals inside
  a pricing loop. Flip the convention and the whole regime inverts — long-gamma /
  range-bound becomes short-gamma / trending, support becomes acceleration — while
  every magnitude on screen looks exactly as correct as it did before. A reader
  cannot see the assumption in the output, so it has to be visible in the source
  and stated on the surface.

  The default is the industry-standard book: customers overwrite calls so dealers
  absorb them (net long calls), and customers buy downside hedges so dealers are
  short puts. Long-call gamma supports price; short-put gamma amplifies moves.

  Weights are deliberately unequal and neither sign is structurally locked: the
  BOOK TOTAL's sign follows the day's pivot, so a pivot below spot gives a
  call-supported, net-positive book and a pivot above gives a put-dominated,
  net-negative one.

  WHEN THIS BECOMES A CONTROL. The figure it feeds is baked into the snapshot at
  simulation time, so a user-facing toggle means recomputing the chain — engine
  work, not a view change. Everything a toggle needs is already here: change
  these two numbers and every desk restates itself coherently, because they all
  read the same snapshot. Until then the honest move is the label, which is what
  `OI_PROXY_NOTE` is for.
==================================================
*/

export interface DealerBookConvention {
  /** Dealer's net position in calls. Positive = long. */
  readonly call: number;
  /** Dealer's net position in puts. Negative = short. */
  readonly put: number;
  /** Short name for the convention, for a label or a future picker. */
  readonly label: string;
}

export const DEALER_BOOK: DealerBookConvention = {
  call: 0.5,
  put: -0.6,
  label: 'Dealers long calls, short puts',
};

/**
 * What an OI-derived exposure surface may claim about itself.
 *
 * Not "dealer positioning". Open interest is a count of contracts outstanding
 * with no owner attached, published once a day for the prior close, so a surface
 * built on it is a PROXY under a stated assumption — never an observation of a
 * dealer's book. Two honest products can disagree here and both be right,
 * because the disagreement is in the assumption, not the arithmetic.
 */
export const oiProxyNote = (book: DealerBookConvention = DEALER_BOOK): string =>
  `OI-proxy positioning · assumes ${book.label.toLowerCase()}`;

/**
 * The note for the DEFAULT book.
 *
 * Kept for surfaces that cannot be re-conventioned, and deliberately NOT used by
 * ones that can. It shipped as a bare constant first and the Levels desk read it
 * while offering a convention toggle, so flipping to the short-calls book left
 * the positioning panel still saying "assumes dealers long calls, short puts"
 * over a surface drawn the other way. Caught by driving the toggle in a browser
 * and reading the panel back. A disclosure that describes the wrong assumption
 * is worse than none: it converts an honest caveat into a false statement.
 */
export const OI_PROXY_NOTE = oiProxyNote();
