/*
==================================================
  SLAYER TERMINAL - TRACKER TYPES (tracker.ts)
  Bookmarked setups for live monitoring on the
  dedicated Tracker page.
==================================================
*/

import type { OptionRight, ScannerKey, Verdict } from './skyvision';

/** A setup the user has bookmarked for ongoing tracking. */
export interface TrackedSetup {
  id: string;                // reuse Setup.id
  contract: string;          // e.g. "SPY 515C"
  ticker: string;
  strike: number;
  right: OptionRight;
  scanner: ScannerKey;       // which scanner found it
  trackedAt: number;         // Date.now() timestamp
  scoreAtTrack: number;      // score when user clicked "Track"
  verdictAtTrack: Verdict;   // verdict when tracked
}
