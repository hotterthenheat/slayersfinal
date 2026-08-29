import { estimatePremium } from './compass';
import type { Candle } from '../types/market';
import type { OptionRight } from '../types/compass';

/*
==================================================
  SLAYER TERMINAL - CONTRACT CANDLES (data/contractCandles.ts)

  An option's own OHLC, derived from the underlying's.
==================================================

  THE SIMULATOR KEEPS NO PER-BAR TAPE FOR A CONTRACT — it holds a chain and
  a spot, not a print history per strike. But premium is MONOTONIC in spot
  (rising for a call, falling for a put), so pricing the contract at a bar's
  own open, high, low and close gives that bar's true premium extremes: the
  max of the four IS the premium high and the min IS the premium low,
  whichever right, because a monotone map cannot reorder them.

  So nothing here is invented beyond what the estimator already claims. It
  is the underlying's real bar, seen through the pricing model.

  WHY IT IS A MODULE. This lived inside the Weigher's premium pane, and the
  Compass now draws the same candles for its campaign chart. Two copies of
  "premium is monotone in spot, so O/H/L/C map through" is two places for
  the right-hand rule to be got wrong, and only one of them would be found.
*/

export interface ContractBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Reprice a run of underlying bars as the contract's own candles.
 *
 * `tYears` is FIXED across the run rather than decayed bar by bar: the chart
 * answers "what has this contract been worth as the stock moved", and letting
 * theta run backwards through the history would mix two different questions
 * into one line. The forward decay is the campaign rail's job.
 */
export function contractCandles(
  bars: readonly Candle[],
  strike: number,
  right: OptionRight,
  iv: number,
  tYears: number
): ContractBar[] {
  const px = (spot: number) => estimatePremium(spot, strike, right, iv, tYears);
  const out: ContractBar[] = [];
  for (const b of bars) {
    const o = px(b.open);
    const c = px(b.close);
    const a = px(b.high);
    const z = px(b.low);
    if (![o, c, a, z].every(Number.isFinite)) continue;
    out.push({
      time: b.time,
      open: Number(o.toFixed(2)),
      close: Number(c.toFixed(2)),
      /* Max/min of all four, not of `a`/`z` — for a PUT the underlying's high
         prices the LOWEST premium, so taking px(high) as the premium high
         would invert every bar on half the book. */
      high: Number(Math.max(o, c, a, z).toFixed(2)),
      low: Number(Math.min(o, c, a, z).toFixed(2)),
    });
  }
  return out;
}
