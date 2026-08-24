/*
==================================================
  SLAYER TERMINAL - BLACK-SCHOLES GREEKS (greeks.ts)
  Pure math, no state, no clock. Extracted from the
  simulator so the SCORING engine can price greeks
  without importing the simulator at all — a replay
  process that pulls in core/simulator boots the
  whole synthetic market (seeded history, timers,
  Math.random), which is exactly what a backtest
  must never do.

  The simulator now imports THIS, so live and replay
  price greeks with byte-identical code.
==================================================
*/

import type { Greeks } from '../types/market';

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp((-x * x) / 2);
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - d * p : d * p;
}

function normalPDF(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes greeks. S spot, K strike, t years to expiry, v IV, r rate. */
export function blackScholesGreeks(S: number, K: number, t: number, v: number, r = 0.05): Greeks {
  if (t <= 0) t = 0.0001; // Avoid division by zero
  if (v <= 0) v = 0.01;

  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);

  const Nd1 = normalCDF(d1);
  const Np_d1 = normalPDF(d1);

  // Delta
  const deltaCall = Nd1;
  const deltaPut = Nd1 - 1;

  // Gamma (same for call/put)
  const gamma = Np_d1 / (S * v * Math.sqrt(t));

  // Vega (same for call/put)
  const vega = (S * Math.sqrt(t) * Np_d1) / 100; // Divided by 100 to show price change per 1% vol change

  // Vanna
  const vanna = (-Np_d1 * d2) / v;

  // Charm (Delta decay)
  const charmCall = -Np_d1 * (r / (v * Math.sqrt(t)) - d2 / (2 * t));
  const charmPut = charmCall + r * Math.exp(-r * t);

  return { deltaCall, deltaPut, gamma, vega, vanna, charmCall, charmPut };
}
