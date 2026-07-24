/*
==================================================
  SLAYER TERMINAL - FLOW SWEEPS (flowSweeps.ts)
  Big options-sweep prints to pin on the liquidity
  chart ("$1.5M Call Sweep"). Derived from the volume
  spikes in the candle series — a sweep IS a burst of
  aggressive volume — so the pills land on real bars.
  Deterministic per ticker + session day (same hash
  family as the rest of the app).
==================================================
*/

import { hash, hRange, dayKey } from '../core/rng';
import type { Candle } from '../types/market';

export interface FlowSweep {
  /** Unix seconds — the candle the sweep printed on */
  time: number;
  /** Price to anchor the pill at (wick extreme on the aggressor side) */
  price: number;
  side: 'C' | 'P';
  /** Premium in dollars */
  premium: number;
}

/**
 * Pick the biggest volume bars in the recent window as sweep prints, spaced out
 * so the pills don't stack. Side leans with the candle's direction (calls into
 * strength, puts into weakness) with the occasional contrarian print.
 */
export function buildFlowSweeps(ticker: string, bars: Candle[], windowBars = 220, count = 6): FlowSweep[] {
  if (!bars.length) return [];
  const key = `${ticker}-flow-${dayKey()}`;
  const start = Math.max(0, bars.length - windowBars);
  const win = bars.slice(start);
  const minGap = Math.max(6, Math.floor(win.length / (count * 2)));

  // Leave a margin at the live edge so a pill never clips against the price axis.
  const rightEdge = win.length - 8;
  const byVol = win.map((_, i) => i).sort((a, b) => win[b].volume - win[a].volume);
  const chosen: number[] = [];
  for (const i of byVol) {
    if (chosen.length >= count) break;
    if (i > rightEdge) continue;
    if (chosen.some(c => Math.abs(c - i) < minGap)) continue;
    chosen.push(i);
  }
  chosen.sort((a, b) => a - b);

  return chosen.map(i => {
    const b = win[i];
    const up = b.close >= b.open;
    const contrarian = hash(`${key}-side-${i}`) % 5 === 0;
    const side: 'C' | 'P' = (contrarian ? !up : up) ? 'C' : 'P';
    // premium skewed toward the low end with an occasional whale, like a real tape
    const roll = hRange(`${key}-prem-${i}`, 0, 1);
    const premium = 180_000 + Math.pow(roll, 2.1) * 4_200_000;
    return { time: b.time, price: side === 'C' ? b.high : b.low, side, premium };
  });
}
