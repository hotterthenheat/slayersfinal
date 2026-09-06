import { blackScholesPrice } from '../core/greeks';
import type { FlowPrint } from '../types/trace';

/*
==================================================
  SLAYER TERMINAL - WHAT HAPPENED AFTER THE PRINT
  (data/followThrough.ts)
==================================================

  Section 6.1 calls this the iron rule, and it is:

    "The live score may only use what existed at detection; follow-through
     goes in a separate confirmed score. The UI must never blend them."

  WHY IT IS IRON. A tape's whole claim is that it flags a print AS IT
  LANDS. The moment a ranking is allowed to see what happened afterwards,
  every historical row looks brilliant — the ones that worked float to the
  top because they worked — and the reader draws the conclusion the desk
  wanted them to draw: that the flag was good. It is the purest form of
  hindsight bias a trading interface can commit, it is invisible in a
  screenshot, and it is flattering, which is why it survives.

  So there are two numbers here and they never touch:

    · THE LIVE SCORE (data/tape.ts, rankNotable) is premium, size, OTM
      distance and aggression. Every one of those is stamped on the print
      at the moment it prints. That function is not imported here and this
      module's output is never fed back into it — the separation is a
      dependency direction, not a convention.

    · THE CONFIRMED READ is this file, and it exists only for prints old
      enough to have an answer. It is never a ranking input, never a
      default sort, and never merges into the live column.

  HOW FOLLOW-THROUGH IS MEASURED. The print names a contract. Value that
  contract at the spot it printed at, value it again at the spot now, and
  the difference is what the market and the clock did to it — read from THE
  AGGRESSOR'S SIDE, which is the only side with a view. An ASK print bought
  it, so a richer contract confirms; a BID print sold it, so a cheaper one
  does. A MID print has no aggressor and therefore no thesis, and gets no
  verdict ever rather than a coin flip.

  IT IS MODEL TO MODEL, not fill to model, and the note beside the
  arithmetic explains what that cost to learn.

  THE REFUSALS ARE THE POINT. A print two minutes old has not been proved
  or disproved by anything, and a verdict on it is noise with a badge. So
  `too-fresh` is a first-class state, it is the DEFAULT, and the threshold
  is stated on the surface rather than buried.
*/

/** Long enough for the market to have said something. */
export const CONFIRM_AFTER_MIN = 20;

/** Below this the position has not really moved — a 1% wiggle in an option
    is the spread breathing, not a market answering. */
export const CONFIRM_BAND_PCT = 8;

export type ConfirmState = 'too-fresh' | 'no-thesis' | 'working' | 'faded' | 'flat';

export const CONFIRM_WORDS: Record<ConfirmState, string> = {
  'too-fresh': 'too fresh',
  'no-thesis': 'no side',
  working: 'working',
  faded: 'faded',
  flat: 'flat',
};

export const CONFIRM_NOTES: Record<ConfirmState, string> = {
  'too-fresh': `Landed less than ${CONFIRM_AFTER_MIN} minutes ago. Nothing has had time to happen, so there is nothing to report — this is not a weak reading, it is the absence of one.`,
  'no-thesis': 'Printed at the mid, so no side was the aggressor. There is no position here to be right or wrong about.',
  working: 'The contract is worth more to the side that took it than it paid. This is what has happened since, not a judgment of the print when it landed.',
  faded: 'The contract has moved against the side that took it. Same caveat: this is the follow-through, not a verdict on the flag.',
  flat: 'The contract is roughly where it printed. The market has not answered yet.',
};

export interface FollowThrough {
  state: ConfirmState;
  /** Percent change in the contract's value FROM THE AGGRESSOR'S SIDE.
      Null whenever there is no verdict — never 0 standing in for unknown. */
  movePct: number | null;
  /** The contract's value now, at the current spot. Null when not priced. */
  markNow: number | null;
  /** Minutes since the print landed. */
  ageMin: number;
}

/**
 * Re-price the print's own contract at today's spot.
 *
 * Deliberately uses the print's OWN implied vol rather than a current
 * surface: the question is what this contract is worth now given the move
 * in the underlying, and refitting vol at the same time would mix two
 * different answers into one number and let a vol crush read as a wrong
 * call about direction.
 */
export function followThrough(
  print: FlowPrint & { at: number },
  spotNow: number,
  now = Date.now()
): FollowThrough {
  const ageMin = Math.max(0, (now - print.at) / 60_000);

  if (print.side === 'MID') return { state: 'no-thesis', movePct: null, markNow: null, ageMin };
  if (ageMin < CONFIRM_AFTER_MIN) return { state: 'too-fresh', movePct: null, markNow: null, ageMin };
  if (!(spotNow > 0) || !(print.spot > 0)) return { state: 'too-fresh', movePct: null, markNow: null, ageMin };

  /* Time decays too, and pretending it does not would credit every long
     with the theta it actually paid. The remaining life is the print's DTE
     less the minutes elapsed, floored just above zero so an expiring
     contract prices as intrinsic rather than dividing by nothing. */
  const yearsLeft = Math.max(1 / (365 * 24 * 60), print.dte / 365 - ageMin / (60 * 24 * 365));
  const markNow = blackScholesPrice(spotNow, print.strike, yearsLeft, print.iv / 100, print.right);

  /* MODEL TO MODEL, NOT FILL TO MODEL — and this was a real bug, caught by
     the proof asserting that an unmoved market reads flat. It did not: it
     read +19% "working" on a spot that had moved five cents.

     The reason is that a fill is not the model's price. Prints trade above
     and below theoretical all day — spread, size, urgency — so comparing a
     later MODEL value against the FILL folds that gap into the reading and
     leaves it there forever. Every print that got a good fill would show a
     permanent phantom gain and every print that paid up a permanent
     phantom loss, on a column whose entire job is to say what the market
     did afterwards.

     Valuing the same contract at the print's own spot and again at now,
     with the same vol, isolates exactly the two things that did happen:
     the underlying moved, and the clock ran. Execution quality is a real
     thing and a different question, and it does not belong in this column
     pretending to be follow-through. */
  const markThen = blackScholesPrice(print.spot, print.strike, Math.max(1 / (365 * 24 * 60), print.dte / 365), print.iv / 100, print.right);
  if (!Number.isFinite(markNow) || !Number.isFinite(markThen) || !(markThen > 0)) {
    return { state: 'too-fresh', movePct: null, markNow: null, ageMin };
  }

  const raw = ((markNow - markThen) / markThen) * 100;
  // The aggressor's side is the only side with a view: ASK bought, BID sold.
  const movePct = print.side === 'ASK' ? raw : -raw;

  const state: ConfirmState =
    Math.abs(movePct) < CONFIRM_BAND_PCT ? 'flat' : movePct > 0 ? 'working' : 'faded';
  return { state, movePct: Number(movePct.toFixed(1)), markNow: Number(markNow.toFixed(2)), ageMin };
}

/** True for the states that carry a real reading. Everything else is the
    desk declining to answer, and must render as a refusal rather than a
    neutral-looking zero. */
export function hasVerdict(s: ConfirmState): boolean {
  return s === 'working' || s === 'faded' || s === 'flat';
}

/**
 * The session's follow-through, counted — for the tape's summary strip.
 *
 * Reported as counts and never as a hit RATE, and the distinction is not
 * pedantry. A percentage invites "the tape is 63% accurate", which this
 * cannot support: the population is whatever prints happen to be in the
 * buffer, the horizon is however long each has been sitting, and nobody
 * closed any of these positions. Counts say what was counted.
 */
export function tallyFollowThrough(
  prints: readonly (FlowPrint & { at: number })[],
  spotFor: (ticker: string) => number,
  now = Date.now()
): Record<ConfirmState, number> {
  const out: Record<ConfirmState, number> = {
    'too-fresh': 0, 'no-thesis': 0, working: 0, faded: 0, flat: 0,
  };
  for (const p of prints) out[followThrough(p, spotFor(p.ticker), now).state] += 1;
  return out;
}
