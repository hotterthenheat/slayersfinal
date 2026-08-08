/*
==================================================
  SLAYER TERMINAL - FLOW DESK TYPES (flowdesk.ts)
  Rich options-flow prints for the live tape.
==================================================
*/

import type { ContractGreeks, OpenInterest, TradeQuoteContext } from './market';

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
  /** Open interest with its staleness. Prior-session settled value for now. */
  oi: OpenInterest;
  /** OI change vs prior session (value may be 0 when unchanged/unknown), carried
      with the same freshness as `oi`. */
  deltaOI: OpenInterest;
  spot: number;
  /** % */
  iv: number;
  volOverOI: number;
  strat: StratTag;
  sweep: boolean;
  // ---- ThetaData vendor fields (P0.1, additive) --------------------------
  /** IV implied from the bid — low leg of the vol bid/ask pair. The current
      single `iv` above is effectively the mid. Source: ThetaData `quote`. */
  bidIv?: number;
  /** IV implied from the ask — high leg of the vol bid/ask pair.
      Source: ThetaData `quote`. */
  askIv?: number;
  /** Raw OPRA trade condition codes on this print; the exchange-reported
      aggressor (145/146), sweeps (95), multi-leg (130-134) and delta-hedged
      (124, 135-143) flags all live here. Predicates in
      src/types/conditions.ts (P0.2) read these. Source: ThetaData `trade`. */
  conditions?: number[];
  /** Reporting exchange code. Source: ThetaData `trade` (exch). */
  exchange?: string;
  /** Trade sequence number. Source: ThetaData `trade` (sequence). */
  sequence?: number;
  /** Greeks stamped at the instant of this print — the input to per-print
      dealer-inventory change. Source: ThetaData `trade_greeks`. */
  greeks?: ContractGreeks;
  /** NBBO at execution plus the two post-trade quote updates, for measured
      market impact. Source: ThetaData `trade_quote`. */
  tradeQuote?: TradeQuoteContext;
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
  /** Premium from single-leg, un-hedged prints — the only flow the bias reads. */
  directionalPremium: number;
  /** Premium from multi-leg legs and delta-hedged prints — spreads and hedges
      with no standalone direction, excluded from the bull/bear net (P4.2). */
  structurePremium: number;
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
