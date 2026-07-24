/*
==================================================
  SLAYER TERMINAL - LIQUIDITY MAP TYPES
  Shared shapes for the TradingView-style liquidity
  chart: which overlays are on, and a dark-pool shelf.
  Kept in their own module so the control rail, the
  panel and the chart import one contract.
==================================================
*/

/** Toggle-able layers on the liquidity chart. */
export interface LiqOverlays {
  /** The resting-liquidity heat field painted behind the candles */
  liquidity: boolean;
  /** Call / put wall, flip & king structure lines */
  walls: boolean;
  /** Volume histogram in the lower strip */
  volume: boolean;
  /** Off-exchange shelves as teal reference lines */
  darkpool: boolean;
  /** VWAP & point-of-control reference lines */
  vwap: boolean;
}

export const DEFAULT_OVERLAYS: LiqOverlays = {
  liquidity: true,
  walls: true,
  volume: true,
  darkpool: true,
  vwap: false,
};

/** A dark-pool shelf drawn as a tagged horizontal reference (real data upstream). */
export interface LiqDPLevel {
  price: number;
  notional: number;
}
