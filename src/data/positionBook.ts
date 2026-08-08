/*
==================================================
  SLAYER TERMINAL - POSITION BOOK (positionBook.ts)
  WHAT A TRACKED IDEA COST, AND WHAT IT DID. Arithmetic only.

  ---------------------------------------------------------------------------
  WHY THIS EXISTS
  ---------------------------------------------------------------------------
  types/tracker.ts `TrackedSetup` carried id, contract, ticker, strike, right,
  scanner, sleeve, trackedAt, scoreAtTrack, verdictAtTrack — and no entry price,
  no size, no exit, no P&L. It was a bookmark with a note on it.

  Meanwhile data/edgeledger.ts computes expectancy by setup type, MFE/MAE, exit
  quality, the better-contract counterfactual and edge decay by vol regime — the
  most differentiated idea in the product — over a book it GENERATES, and says
  so in its own header and in the copy on every surface that quotes a number.

  This is the missing half: the place a real fill goes. It needs no market data
  and no backend. Every number below is arithmetic on figures the operator typed
  in, which is why it can ship while the tape is still a simulator.

  ---------------------------------------------------------------------------
  WHAT THIS DELIBERATELY DOES NOT COMPUTE
  ---------------------------------------------------------------------------
  MFE and MAE — the best and worst the position ever got to — are the two
  figures a review actually turns on, and they are NOT DERIVABLE from an entry
  and an exit. They need the path in between, sampled at least per minute, and
  nothing in this app records it for a position the user holds.

  They are therefore absent rather than approximated. An MFE guessed from two
  endpoints is not a weak measurement, it is a different quantity wearing the
  name of the one a trader would act on. `PositionMark.pathUnknown` states this
  so a panel can render the gap instead of quietly omitting a column.

  The same applies to expectancy, win rate and profit factor: those are
  statistics, and a statistic over three trades is a number with no content.
  `MIN_BOOK_FOR_STATS` is the gate, and it exists so a panel refuses out loud.

  ---------------------------------------------------------------------------
  ARITHMETIC, NOT A MODEL
  ---------------------------------------------------------------------------
  Nothing here prices anything, and nothing here is overridable through
  core/mathProvider — there is no model to override. Cost is premium times size
  times the contract multiplier; P&L is a difference of two premiums the user
  supplied. When the real math files land they change every OTHER number on the
  Tracker and cannot change these, which is the same property
  flowdesk/PayoffLadder.tsx was built to have.
==================================================
*/

import { CONTRACT_MULTIPLIER } from '../components/compass/contractFacts';
import type { TrackedFill } from '../types/tracker';

/**
 * How many recorded trades before per-setup statistics mean anything.
 *
 * Not a rounding of "enough". A win rate over fewer than this is dominated by
 * which way the last trade went, and edgeledger.ts's own modelled book uses
 * two trades per setup x four vol regimes = 48 precisely so its expectancy is
 * a signal rather than a coin flip. The real book gets held to a floor for the
 * same reason, and the UI says which side of it the operator is on.
 */
export const MIN_BOOK_FOR_STATS = 20;

/** Whether a recorded position is still open, and how it closed if not. */
export type PositionState = 'OPEN' | 'CLOSED';

export interface PositionMark {
  state: PositionState;
  /** Dollars paid to open: premium x contracts x 100. */
  costBasis: number;
  /**
   * Dollars the position is worth right now, marked at `mark` per contract.
   * Present only while OPEN — a closed position is worth what it sold for.
   */
  marketValue?: number;
  /**
   * Unrealized P&L in dollars, OPEN only.
   *
   * Marked against the desk's CURRENT mid, which on this build comes from the
   * simulator — so it is a real subtraction over a number that is not a market
   * price. layout/FeedBadge says so globally; a panel quoting this should not
   * repeat the disclaimer, but it must not call it a market value either.
   */
  openPnl?: number;
  /** Realized P&L in dollars, net of fees. CLOSED only. */
  realizedPnl?: number;
  /** Realized P&L as a share of cost basis, e.g. 0.42 for +42%. CLOSED only. */
  realizedPct?: number;
  /** Calendar days the position was held. CLOSED only. */
  heldDays?: number;
  /**
   * ALWAYS TRUE, and the point of the field.
   *
   * The excursion between entry and exit is unrecorded, so MFE, MAE, capture
   * ratio and exit quality cannot be computed for this position at all. A panel
   * reads this and renders the absence rather than leaving a reader to assume
   * the columns simply did not apply.
   */
  pathUnknown: true;
}

/** True when a fill is complete enough to mark. Guards partial hand entry. */
export function isUsableFill(fill: TrackedFill | undefined): fill is TrackedFill {
  return (
    !!fill &&
    Number.isFinite(fill.entryPrice) &&
    fill.entryPrice > 0 &&
    Number.isFinite(fill.size) &&
    fill.size > 0
  );
}

const DAY_MS = 86_400_000;

/**
 * Mark one recorded fill.
 *
 * `mark` is the current premium per contract — only read while the position is
 * open, and ignored once an exit price exists.
 */
export function markPosition(fill: TrackedFill, mark: number): PositionMark {
  const costBasis = fill.entryPrice * fill.size * CONTRACT_MULTIPLIER;
  const fees = Number.isFinite(fill.fees) ? (fill.fees as number) : 0;

  if (fill.exitPrice != null && Number.isFinite(fill.exitPrice)) {
    const gross = (fill.exitPrice - fill.entryPrice) * fill.size * CONTRACT_MULTIPLIER;
    const realizedPnl = gross - fees;
    return {
      state: 'CLOSED',
      costBasis,
      realizedPnl,
      realizedPct: costBasis > 0 ? realizedPnl / costBasis : 0,
      heldDays: fill.exitAt != null ? Math.max(0, Math.round((fill.exitAt - fill.entryAt) / DAY_MS)) : undefined,
      pathUnknown: true,
    };
  }

  const marketValue = mark * fill.size * CONTRACT_MULTIPLIER;
  return {
    state: 'OPEN',
    costBasis,
    marketValue,
    // Fees are charged against the round trip, so an open position has not
    // paid the exit half yet. Subtracting all of them here would understate a
    // live winner every time the operator entered a full round-trip estimate.
    openPnl: marketValue - costBasis,
    pathUnknown: true,
  };
}

export interface BookTotals {
  /** Positions with a usable fill recorded. */
  recorded: number;
  open: number;
  closed: number;
  /** Sum of realized P&L across CLOSED positions, net of fees. */
  realizedPnl: number;
  /** Sum of unrealized P&L across OPEN positions, marked at the current mid. */
  openPnl: number;
  /** Capital currently committed: cost basis of the open positions. */
  committed: number;
  /**
   * False until `closed` reaches MIN_BOOK_FOR_STATS. While false, no win rate,
   * expectancy or profit factor may be shown off this book — see the header.
   */
  statsReady: boolean;
}

/** Roll a set of marks into the totals a panel can honestly print. */
export function bookTotals(marks: readonly PositionMark[]): BookTotals {
  let realizedPnl = 0;
  let openPnl = 0;
  let committed = 0;
  let open = 0;
  let closed = 0;
  for (const m of marks) {
    if (m.state === 'CLOSED') {
      closed += 1;
      realizedPnl += m.realizedPnl ?? 0;
    } else {
      open += 1;
      openPnl += m.openPnl ?? 0;
      committed += m.costBasis;
    }
  }
  return {
    recorded: marks.length,
    open,
    closed,
    realizedPnl,
    openPnl,
    committed,
    statsReady: closed >= MIN_BOOK_FOR_STATS,
  };
}
