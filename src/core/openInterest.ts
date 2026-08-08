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
 * Wrap a raw open-interest count as a SETTLED figure. There is no intraday OI
 * estimator anywhere in the terminal (that is a later phase), so every OI it
 * emits is the prior session's settled value and says so.
 * Source: ThetaData daily open_interest.
 */
export function settledOI(value: number): OpenInterest {
  return { value, asOf: OI_SETTLED_ASOF, freshness: 'SETTLED' };
}
