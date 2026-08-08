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

/**
 * A fill the operator recorded by hand — the half of a tracked idea that
 * `TrackedSetup` never carried.
 *
 * Deliberately the smallest set that makes a P&L arithmetic rather than a
 * guess. What is NOT here is as considered as what is: no MFE, no MAE, no
 * capture ratio, because the path between entry and exit is unrecorded and
 * those three cannot be derived from two endpoints. data/positionBook.ts
 * carries that reasoning and the `pathUnknown` flag that makes the absence
 * visible instead of silent.
 *
 * Local to one browser, stored beside the status and notes in the Tracker's
 * journal. It is not a brokerage link and must never be described as one.
 */
export interface TrackedFill {
  /** Premium per contract actually paid, in dollars — not the mid it was quoted at. */
  entryPrice: number;
  /** Contracts. The 100-share multiplier is applied when marking, not here. */
  size: number;
  /** Epoch ms of the entry. */
  entryAt: number;
  /** Premium per contract received on exit. Absent while the position is open. */
  exitPrice?: number;
  /** Epoch ms of the exit. Absent while the position is open. */
  exitAt?: number;
  /** Commissions and fees for the round trip, in dollars. */
  fees?: number;
}
