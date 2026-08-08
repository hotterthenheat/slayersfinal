/*
==================================================
  SLAYER TERMINAL - MARKET DATA PROVIDER SEAM (marketDataProvider.ts)  [P5.1]
  The one interface the whole terminal depends on for market data.

  Every desk is built the same way: a pure `(snapshot) => view` builder over a
  MarketSnapshot, and that snapshot comes from exactly one place. This is the
  shape of that place. The simulator implements it today; the entire build queue
  before this reshaped the simulator's output — condition codes, trade greeks,
  OI freshness, real expiry calendars, index handling — so that the day a real
  ThetaData-backed feed implements THIS interface, it drops in at
  context/MarketDataContext and not a single view builder, panel, or test has to
  change.

  Deliberately narrow. Only the market-data surface the app consumes lives here.
  The simulator's own conveniences (settledOI, the seeded RNG, the internal
  chain/greeks math) are NOT part of the seam — a real feed would not have them,
  and nothing outside core/ should reach for them. This is a pure type module: it
  imports no runtime code, so importing the interface never pulls the simulator
  into a bundle.

  The conformance proof lives in core/simulator.ts, which declares
  `export default Simulator satisfies MarketDataProvider` — so a method that
  drifts from this contract fails the typecheck here, not in a panel three desks
  away.
==================================================
*/

import type { Candle, GexSnapshot, Greeks, MarketSnapshot, TickerConfig } from '../types/market';

export interface MarketDataProvider {
  /** Per-symbol reference config: base/current price, ATM IV, strike step. */
  readonly TICKERS: Record<string, TickerConfig>;
  /** The default symbols the desks poll. */
  readonly WATCHLIST: string[];

  /** Register a symbol on demand; returns its canonical (upper-cased) key. */
  ensureTicker(sym: string): string;
  /** Switch the active symbol; returns the canonical key. */
  setActiveTicker(sym: string): string;
  /** The symbol the chrome currently follows. */
  getActiveTicker(): string;

  /** True for a cash index (SPX/NDX/RUT/VIX…) — no share volume, so
      volume-derived views null out or fall back to delta-equivalent flow. */
  isIndex(sym: string): boolean;

  /** Live intraday OHLC bars for a symbol (mutated in place each tick — read-only). */
  getCandles(sym: string): Candle[];
  /** Net-GEX-per-strike history parallel to the candle series (read-only). */
  getGexHistory(sym: string): GexSnapshot[];

  /** A full LIVE MarketSnapshot for any symbol — the single contract every view
      builder consumes. Reads current price and draws a tape slice, so two calls
      a tick apart differ (right for a live desk). */
  buildSnapshot(sym: string): MarketSnapshot;
  /** A REPRODUCIBLE snapshot pinned to a supplied spot — no tape, no RNG draw,
      no mutation. `regimeDay` pins the positioning regime; omit for today's. */
  buildSnapshotAt(sym: string, spot: number, regimeDay?: number): MarketSnapshot;

  /** Advance the feed one step. The optional callback receives the active
      symbol's fresh snapshot — how context/MarketDataContext drives the desks. */
  tick(callback?: (data: MarketSnapshot) => void): void;

  /** Black-Scholes greeks for one contract, at spot/strike/time/vol (r optional). */
  getGreeks(spot: number, strike: number, t: number, iv: number, r?: number): Greeks;
}
