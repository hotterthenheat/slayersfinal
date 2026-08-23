/*
==================================================
  SLAYER TERMINAL - OPEN INTEREST FRESHNESS (openInterest.ts)
  Open interest is the one field on an option chain that is NOT live. OPRA
  publishes it once a day, around 06:30 ET, for the PRIOR session's close — so
  every OI figure the terminal shows is settled, and stamping it with the
  session it actually belongs to is the difference between a number and a claim.

  This lives on its own rather than inside the simulator because two very
  different callers need it and neither should reach through the other:

    - core/simulator.ts stamps the OI it emits on the chain, and
    - data/flowtape.ts stamps the OI it carries on each print.

  The provider seam (core/marketDataProvider.ts) is deliberately narrow and says
  so in its own header: the simulator's conveniences are NOT part of the
  contract, and nothing outside core/ should import them. flowtape was importing
  `settledOI` straight off the simulator, which is exactly the reach the seam
  exists to prevent — the day a real ThetaData feed replaces the simulator, that
  import would have broken a desk rather than a boundary.

  A real feed keeps this module: the OPRA publication schedule is a fact about
  the market, not about the simulator.
==================================================
*/

import { today, isTradingDay, isoDate } from './calendar';
import type { OpenInterest } from '../types/market';

/**
 * The session date settled open interest represents: the last trading day
 * strictly before today. Holiday-aware through core/calendar. Computed once.
 */
export const OI_SETTLED_ASOF: string = (() => {
  const d = today();
  do {
    d.setDate(d.getDate() - 1);
  } while (!isTradingDay(d));
  return isoDate(d);
})();

/**
 * Wrap a raw open-interest count as a SETTLED figure — the prior session's
 * published close, which is the only OI figure OPRA actually publishes.
 * Source: ThetaData daily open_interest.
 */
export function settledOI(value: number): OpenInterest {
  return { value, asOf: OI_SETTLED_ASOF, freshness: 'SETTLED' };
}

/**
 * TODAY'S OPEN INTEREST, ESTIMATED — settled plus the session's signed volume.
 *
 * docs/DATA-FEASIBILITY.md, P1 #4: "OI is T+1, so professionals estimate today's
 * position change from signed volume and print classification. Surfacing
 * 'estimated OI change since the open, by strike' — clearly marked as an
 * estimate — is the honest, professional answer to a limitation everyone else
 * either ignores or lies about."
 *
 * WHAT THE ESTIMATE ASSUMES, STATED PLAINLY BECAUSE IT IS NOT SAFE. The tape
 * reports a trade, a size and an aggressor. It does NOT report whether either
 * side was opening or closing. The convention here is the standard one — a
 * buyer-initiated print tends to open interest, a seller-initiated one tends to
 * close it — and it is wrong a meaningful fraction of the time: a buy can be a
 * short being covered, a sell can be a long being written. That is precisely why
 * the result is stamped ESTIMATED and dated TODAY rather than folded into the
 * settled figure, and why `OiFreshness` paints it amber wherever it appears.
 *
 * NOTHING THAT DRAWS A GAMMA WALL READS THIS. The same document is explicit:
 * "Never draw an intraday gamma wall as if it were measured." GEX stays on the
 * settled book; this is a separate read, beside it, that says what today's flow
 * has probably done to the book — not a replacement for the book.
 */
export function estimatedOI(settled: number, signedVolume: number): OpenInterest {
  return {
    // Open interest cannot go negative. More closing volume than there were
    // contracts means the classification was wrong, not that the book inverted.
    value: Math.max(0, Math.round(settled + signedVolume)),
    asOf: isoDate(today()),
    freshness: 'ESTIMATED',
  };
}
