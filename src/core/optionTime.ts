/*
==================================================
  SLAYER TERMINAL - OPTION TIME (optionTime.ts)
  The single bridge from a day count to the year
  fraction every pricer squares the root of.
==================================================
*/

/**
 * TWO CLOCKS, and mixing them is the defect this module exists to prevent.
 *
 * A DTE in this codebase is always a CALENDAR day count, because that is what
 * `core/calendar.ts` resolves an expiry from — `expiryFor(45)` walks 45 calendar
 * days forward and lands on the session at or before it. Pricing runs in years.
 * The bridge is therefore /365 and only /365: dividing a calendar day count by
 * 252 prices the contract as though the weekends were not there, which is about
 * 20% too much time on a swing and far worse on a LEAP.
 *
 * The two engines had drifted apart on exactly this. `core/contractScore.ts`
 * divided by 365 and `data/compass.ts` by 252, and both rendered on the Weigher
 * at once — the headline mid from one, the take-profit targets beneath it from
 * the other — so the same contract carried two prices three inches apart with no
 * signal that two models were involved.
 */
const DAYS_PER_YEAR = 365;

/** Trading sessions in a year — used ONLY for the floor below. */
const SESSIONS_PER_YEAR = 252;

/**
 * The least time a contract may be priced with: half a trading SESSION.
 *
 * A same-session contract cannot carry zero time or the pricer divides by zero,
 * so it needs a floor, and the floor is the one place sessions legitimately
 * appear. It is half a session rather than half a calendar day because an
 * option that dies at the bell draws its time value from trading hours: at any
 * random moment in the session roughly half of them remain. Half a calendar day
 * would be 0.00137 years against this 0.00198 — a 45% disagreement about how
 * much time a 0DTE has, which is precisely the gap that separated the two
 * engines.
 */
export const MIN_YEARS = 0.5 / SESSIONS_PER_YEAR;

/**
 * Year fraction for a calendar-day count, floored at half a session.
 *
 * Both pricers come through here so a 0DTE is worth the same amount of time
 * whichever one quotes it.
 */
export function yearsToExpiry(dte: number): number {
  return Math.max(dte / DAYS_PER_YEAR, MIN_YEARS);
}
