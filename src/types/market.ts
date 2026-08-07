/*
==================================================
  SLAYER TERMINAL - SHARED DOMAIN TYPES (market.ts)
  Options chain, dealer exposure, trade plan & ledger models
==================================================
*/

/** Any listed symbol. Core sim tickers are seeded; others are synthesized on demand. */
export type TickerSymbol = string;

export interface TickerConfig {
  basePrice: number;
  currentPrice: number;
  iv: number;
  step: number;
}

export interface Greeks {
  deltaCall: number;
  deltaPut: number;
  gamma: number;
  vega: number;
  vanna: number;
  charmCall: number;
  charmPut: number;
}

export interface Candle {
  /** Unix seconds, strictly increasing, bar-aligned */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GexLevel {
  strike: number;
  /** Net GEX at this strike (summed across expiries), signed dollars */
  value: number;
}

/** Net GEX across strikes captured at one bar-aligned moment. */
export interface GexSnapshot {
  time: number;
  levels: GexLevel[];
}

export interface Indicators {
  rsi: number;
  ema9: number;
  ema21: number;
  ema50: number;
  squeeze: boolean;
}

export interface StrikeNode {
  strike: number;
  callOI: number;
  putOI: number;
  gamma: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callDex: number;
  putDex: number;
  netDex: number;
  callVex: number;
  putVex: number;
  netVex: number;
  vanna: number;
  charm: number;
}

export type TradeDirection = 'BULLISH' | 'BEARISH';

export interface TradePlan {
  ticker: TickerSymbol;
  direction: TradeDirection;
  score: number;
  confidence: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  flipZone: number;
  supportWall: number;
  resistanceWall: number;
}

export interface TapeOrder {
  time: string;
  ticker: TickerSymbol;
  strike: string;
  type: 'C' | 'P';
  size: number;
  orderType: 'SWEEP' | 'BLOCK';
  side: 'ASK' | 'BID';
  /** Raw OPRA/CTA trade condition codes for this print. Semantic predicates
      live in src/types/conditions.ts (P0.2). Source: ThetaData `trade`. */
  conditions?: number[];
}

export interface MarketSnapshot {
  ticker: TickerSymbol;
  spot: number;
  changePercent: number;
  priceHistory: number[];
  chain: StrikeNode[];
  indicators: Indicators;
  plan: TradePlan;
  tape: TapeOrder[];
}

export type TradeStatus = 'OPEN' | 'WIN' | 'LOSS';

export interface TradeRecord {
  id: string;
  ticker: string;
  direction: TradeDirection;
  entryPrice: number;
  stopLoss: number;
  target: number;
  exitPrice?: number;
  status: TradeStatus;
  pnl: number;
  accuracy: number;
  time: string;
}

export interface LedgerStats {
  winRate: number;
  profitFactor: number;
  avgAccuracy: number;
  totalPnL: number;
  count: number;
}

export interface ExecuteResult {
  success: boolean;
  message?: string;
  trade?: TradeRecord;
}

/*
==================================================
  THETADATA VENDOR CONTRACT PRIMITIVES (P0.1)
  Additive homes for per-contract fields the live
  OPRA/CTA feed delivers that the simulator does not
  yet fill. Every new field is optional at the call
  site until the provider (or an honest simulator
  pass) supplies it, so nothing that constructs these
  objects today is forced to change.
==================================================
*/

/**
 * Top-of-book NBBO for a single option contract.
 * ThetaData delivers a *pair* of implied vols — one implied from the bid and
 * one from the ask — not a single mid IV. The gap between them is the
 * volatility bid/ask spread, a direct read on per-contract vol uncertainty
 * that the current single-`iv` model discards.
 * Source: ThetaData `option` bulk `quote` (and the NBBO leg of `trade_quote`).
 */
export interface OptionQuote {
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  /** IV implied from the bid — low leg of the vol pair. Source: ThetaData `quote`. */
  bidIv?: number;
  /** IV implied from the ask — high leg of the vol pair. Source: ThetaData `quote`. */
  askIv?: number;
}

/**
 * Full vendor greek vector for one contract, computed under Black-Scholes.
 * ThetaData supplies 1st, 2nd and 3rd order. Orders beyond the 1st are
 * optional until the provider fills them; `veta` and `zomma` in particular
 * are not modelled anywhere today.
 * Source: ThetaData `greeks`, `greeks_second_order`, `greeks_third_order`
 * (and `trade_greeks` / `all_trade_greeks` when stamped at a trade).
 */
export interface ContractGreeks {
  // 1st order — Source: ThetaData `greeks`
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  // 2nd order — Source: ThetaData `greeks_second_order`
  /** dΔ/dσ */
  vanna?: number;
  /** dΔ/dt */
  charm?: number;
  /** dVega/dσ */
  vomma?: number;
  /** dVega/dt — vega decay. Not modelled today. */
  veta?: number;
  // 3rd order — Source: ThetaData `greeks_third_order`
  /** dΓ/dS */
  speed?: number;
  /** dΓ/dσ — gamma sensitivity to vol. Not modelled today. */
  zomma?: number;
  /** dΓ/dt */
  color?: number;
  /** dVomma/dσ */
  ultima?: number;
}

/**
 * The NBBO prevailing at an execution plus the two post-trade quote updates
 * ThetaData returns alongside every trade. The post-trade quotes are what
 * make realised market impact — how far the quote moved after the print —
 * measurable per trade.
 * Source: ThetaData `trade_quote` (24 fields).
 */
export interface TradeQuoteContext {
  /** NBBO at the instant of execution. */
  nbboAtTrade: OptionQuote;
  /** The two quote updates published immediately after the trade. */
  postTrade: OptionQuote[];
}
