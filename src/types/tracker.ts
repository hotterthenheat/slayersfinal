/*
==================================================
  SLAYER TERMINAL - TRACKER TYPES (tracker.ts)
  Bookmarked setups for live monitoring on the
  dedicated Tracker page.
==================================================
*/

import type { OptionRight, ScannerKey, SleeveKey, Verdict } from './compass';

/** A setup the user has bookmarked for ongoing tracking. */
export interface TrackedSetup {
  id: string;                // reuse Setup.id
  contract: string;          // e.g. "SPY 515C"
  ticker: string;
  strike: number;
  right: OptionRight;
  scanner: ScannerKey;       // which scanner found it
  /**
   * The horizon the setup was found on, and the reason a tracked LEAP stays a
   * LEAP. Tracker rebuilds every row through makeSetup, which defaults to
   * same-session when it is not told otherwise, so without this field a 365DTE
   * contract came back priced as 0DTE and could be marked closed the next day.
   */
  sleeve: SleeveKey;
  trackedAt: number;         // Date.now() timestamp
  scoreAtTrack: number;      // score when user clicked "Track"
  verdictAtTrack: Verdict;   // verdict when tracked
}
