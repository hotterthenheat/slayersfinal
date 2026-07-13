/*
==================================================
  SLAYER TERMINAL - FLOW DESK TYPES (flowdesk.ts)
  Rich options-flow prints for the live tape.
==================================================
*/

export type StratTag = '—' | 'Vertical' | 'Butterfly' | 'Ratio' | 'Custom';

export interface FlowPrint {
  id: number;
  time: string;
  ticker: string;
  /** 1 = single leg; >1 renders the ×N multi-leg marker */
  legs: number;
  strike: number;
  right: 'C' | 'P';
  /** Signed % distance of strike from spot */
  otmPct: number;
  /** MM/DD/YYYY */
  expiry: string;
  dte: number;
  fill: number;
  bid: number;
  ask: number;
  /** Where the fill landed in the spread: 0 = at bid, 1 = at ask */
  fillPos: number;
  side: 'BID' | 'ASK' | 'MID';
  /** −100…+100 aggressor conviction */
  flowScore: number;
  /** e.g. "ASK 61%" / "MID" — dominant execution side for the contract today */
  ratioLabel: string;
  /** Bid-side share of the contract's day, 0–100 */
  ratioBidPct: number;
  size: number;
  /** Total premium of the print, dollars */
  premium: number;
  volume: number;
  oi: number;
  /** vs prior session; 0 = unchanged/unknown */
  deltaOI: number;
  spot: number;
  /** % */
  iv: number;
  volOverOI: number;
  strat: StratTag;
  sweep: boolean;
}

export type PrintSentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface LargestPrint {
  ticker: string;
  strike: number;
  right: 'C' | 'P';
  premium: number;
}

export interface TapeSummary {
  /** All premium on the tape, dollars */
  totalPremium: number;
  /** Bullish-premium minus bearish-premium, dollars */
  netPremium: number;
  bullish: boolean;
  bullPremium: number;
  bearPremium: number;
  callCount: number;
  callPremium: number;
  putCount: number;
  putPremium: number;
  pcRatio: number;
  rvol: number;
  sweeps: number;
  blocks: number;
  largest: LargestPrint | null;
}
