import type { Candle } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - INDICATOR SERIES (data/indicators.ts)

  The two curves the tape draws, as plain numbers.
==================================================

  WHY THEY LEFT THE CHART.

  Both were written inside `StrikeChart`'s indicator effect, as a closure over
  the bars it had just aggregated. That was fine while the chart was the only
  thing that had an opinion about them. T-12's confluence strip has to say
  whether price is above its EMA21 and its VWAP on five timeframes at once,
  and a second copy of these formulas would be a strip that can disagree with
  the lines it is summarising — the same "written twice, and the copies
  disagreed" that `core/walls.ts` exists because of.

  So: one generator, and the chart maps the numbers onto its own series.
  Nothing here knows about charts, so `npm test` can hold both to a fixture.

  ALIGNED TO `bars`, one value per bar, no leading nulls. Both are seeded
  rather than warmed up, which is a real property and is asserted rather than
  hidden: `emaSeries` starts at the first close, so early values are closer to
  price than a settled EMA would be, and a caller that needs a settled one has
  to say how many bars it wants behind it. `WARMUP_BARS` is that number.
*/

/**
 * How many bars an EMA needs behind it before its value is the EMA rather
 * than the seed still washing out. One period: after `period` steps the seed's
 * weight is `(1 - 2/(period+1))^period`, which is about 13% at 21 and falls
 * from there — small enough that the curve is the data's, large enough that
 * calling it settled before then would be a claim the numbers do not support.
 */
export const emaWarmup = (period: number): number => period;

/**
 * Exponential moving average of closes, seeded at the first close.
 *
 * Seeded rather than started from an SMA of the first `period` bars, because
 * that is what the tape has always drawn and the two differ visibly on the
 * left edge. Changing it here would move a line readers have been reading.
 */
export function emaSeries(bars: readonly Candle[], period: number): number[] {
  if (bars.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = bars[0].close;
  return bars.map(b => {
    ema = b.close * k + ema * (1 - k);
    return ema;
  });
}

/**
 * WHERE A SESSION STARTS — index 0, and every bar that follows a gap.
 *
 * A GAP is a step between bar times of more than 1.5× the bar's own length,
 * which is how a session boundary shows up in a series that only holds RTH
 * bars: 09:30 follows 15:59 by seventeen and a half hours. `barMinutes` has
 * to be the interval these bars were AGGREGATED to, not the base interval —
 * pass 1m bars a `barMinutes` of 15 and every bar looks like a new session.
 *
 * ONE RULE, because two things now need it: the VWAP re-anchors here, and
 * T-6's session levels cut the prior day here. Two copies would be a prior
 * high taken from a different day than the VWAP was anchored to.
 */
export function sessionStarts(bars: readonly Candle[], barMinutes: number): number[] {
  if (bars.length === 0) return [];
  const gap = barMinutes * 60 * 1.5;
  const out = [0];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time - bars[i - 1].time > gap) out.push(i);
  }
  return out;
}

/**
 * Session-anchored VWAP: cumulative typical×volume over cumulative volume,
 * reset at every session start.
 *
 * Falls back to the close on a bar with no volume behind it, so the series is
 * a price throughout rather than dropping to zero on a dead open.
 */
export function vwapSeries(bars: readonly Candle[], barMinutes: number): number[] {
  const starts = new Set(sessionStarts(bars, barMinutes));
  const out: number[] = [];
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    /* `i > 0` because index 0 is a session start too and there is nothing to
       reset before the first bar — resetting there is a no-op, but saying so
       keeps this loop reading the same as it did before the rule moved out. */
    if (i > 0 && starts.has(i)) {
      pv = 0;
      vol = 0;
    }
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
    out.push(vol > 0 ? pv / vol : b.close);
  }
  return out;
}
