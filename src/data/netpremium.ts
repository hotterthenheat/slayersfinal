/*
==================================================
  SLAYER TERMINAL - NET PREMIUM TIDE (netpremium.ts)
  Cumulative net call premium vs net put premium across
  the live session, next to price — the Bullflow-style
  "who is paying up" read. Derived deterministically from
  the session's bars: up-bars lean call-premium positive,
  down-bars lean put-premium positive, sized by traded
  notional with seeded microstructure noise.
==================================================
*/

import Simulator from '../core/simulator';
import { h01 } from '../core/rng';

export interface NetPremiumPoint {
  minute: number;
  /** unix sec of the bar */
  time: number;
  /** cumulative net call premium, $ */
  call: number;
  /** cumulative net put premium, $ */
  put: number;
  price: number;
}

export interface NetPremiumView {
  points: NetPremiumPoint[];
  lastCall: number;
  lastPut: number;
  /** symmetric premium axis bound, $ */
  maxAbs: number;
}

const SESSION_BARS = 390;

export function buildNetPremium(ticker: string): NetPremiumView | null {
  const candles = Simulator.getCandles(ticker) ?? [];
  if (!candles.length) return null;
  // Trailing session-sized window — a modulo window would collapse to a
  // couple of bars once live bars start rolling in.
  const bars = candles.slice(-SESSION_BARS);
  const spot = bars[bars.length - 1].close;

  const points: NetPremiumPoint[] = [];
  let call = 0;
  let put = 0;
  let maxAbs = 1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const up = b.close >= b.open;
    const notional = b.volume * spot;
    // premium flow ≈ a small options-tape fraction of the bar's stock notional
    const kc = 0.0045 * (0.6 + 0.8 * h01(`${ticker}-npc-${i}`));
    const kp = 0.0045 * (0.6 + 0.8 * h01(`${ticker}-npp-${i}`));
    call += notional * kc * (up ? 1 : -0.6);
    put += notional * kp * (up ? -0.55 : 1);
    maxAbs = Math.max(maxAbs, Math.abs(call), Math.abs(put));
    points.push({ minute: i, time: b.time, call, put, price: b.close });
  }

  return { points, lastCall: call, lastPut: put, maxAbs };
}
