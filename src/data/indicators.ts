import type { Candle } from '../types/market';

/*
==================================================
  SLAYER TERMINAL - INDICATOR SERIES (data/indicators.ts)

  Every indicator the tape draws, as plain numbers.
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

/*
  ──────────────────────────────────────────────────────────────────────────
  THE T-4 SET. Two conventions live in this file now, and the difference is
  deliberate:

  · emaSeries / vwapSeries are SEEDED — full-length, no nulls — because that
    is what the tape has always drawn and moving those lines would move
    something readers already read.
  · Everything below is WARMED UP — null until the window it claims to
    summarise actually exists. An RSI printed off three bars is a number the
    app cannot source, and the chart maps a null to whitespace, not to zero.
  ──────────────────────────────────────────────────────────────────────────
*/

/**
 * Wilder's RSI. Null through index `period` − the first value sits ON the
 * bar that completes the seed window (period changes need period+1 bars).
 * A lossless window reads 100 and a gainless one 0, per Wilder.
 */
export function rsiSeries(bars: readonly Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period < 1 || bars.length <= period) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    if (ch >= 0) g += ch;
    else l -= ch;
  }
  g /= period;
  l /= period;
  const rsiOf = () => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[period] = rsiOf();
  for (let i = period + 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    g = (g * (period - 1) + Math.max(0, ch)) / period;
    l = (l * (period - 1) + Math.max(0, -ch)) / period;
    out[i] = rsiOf();
  }
  return out;
}

export interface MacdSeries {
  macd: (number | null)[];
  signal: (number | null)[];
  /** macd − signal, the bars under the lines. */
  hist: (number | null)[];
}

/**
 * MACD off the SAME seeded EMAs the tape draws (emaSeries), nulled through
 * each part's own warmup: the macd line until the slow EMA has settled
 * (emaWarmup(slow)), the signal until its own EMA of the macd has settled on
 * top of that. Two warmups, because the signal cannot be older than the line
 * it smooths.
 */
export function macdSeries(bars: readonly Candle[], fast = 12, slow = 26, signal = 9): MacdSeries {
  const n = bars.length;
  const macd: (number | null)[] = new Array(n).fill(null);
  const sig: (number | null)[] = new Array(n).fill(null);
  const hist: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return { macd, signal: sig, hist };
  const ef = emaSeries(bars, fast);
  const es = emaSeries(bars, slow);
  const from = emaWarmup(slow);
  const k = 2 / (signal + 1);
  let s: number | null = null;
  for (let i = from; i < n; i++) {
    const m = ef[i] - es[i];
    macd[i] = m;
    s = s === null ? m : m * k + s * (1 - k);
    if (i >= from + emaWarmup(signal)) {
      sig[i] = s;
      hist[i] = m - s;
    }
  }
  return { macd, signal: sig, hist };
}

export interface BollingerSeries {
  basis: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

/**
 * Bollinger bands: SMA(period) ± k·σ, population σ over the same window.
 * Null until a full window exists.
 */
export function bollingerSeries(bars: readonly Candle[], period = 20, k = 2): BollingerSeries {
  const n = bars.length;
  const basis: (number | null)[] = new Array(n).fill(null);
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    const mid = sum / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (bars[j].close - mid) ** 2;
    const sd = Math.sqrt(v / period);
    basis[i] = mid;
    upper[i] = mid + k * sd;
    lower[i] = mid - k * sd;
  }
  return { basis, upper, lower };
}

/** Plain SMA of closes, null until a full window exists. */
export function smaSeries(bars: readonly Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * The volume-weighted σ around the session VWAP, per bar — the ruler the
 * VWAP bands are k of. Same anchor rule as the VWAP itself (sessionStarts),
 * computed off the same typical prices, so the band and its centre line
 * cannot disagree about where the session began. σ is null on a bar with no
 * volume behind it yet — a band of width zero would claim certainty, not
 * absence.
 */
export function vwapSigmaSeries(bars: readonly Candle[], barMinutes: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length === 0) return out;
  const starts = new Set(sessionStarts(bars, barMinutes));
  let cumV = 0;
  let cumPV = 0;
  let cumP2V = 0;
  for (let i = 0; i < bars.length; i++) {
    if (starts.has(i)) {
      cumV = 0;
      cumPV = 0;
      cumP2V = 0;
    }
    const typ = (bars[i].high + bars[i].low + bars[i].close) / 3;
    cumV += bars[i].volume;
    cumPV += typ * bars[i].volume;
    cumP2V += typ * typ * bars[i].volume;
    if (cumV > 0) {
      const vwap = cumPV / cumV;
      out[i] = Math.sqrt(Math.max(0, cumP2V / cumV - vwap * vwap));
    }
  }
  return out;
}

/**
 * Wilder's ATR over the DISPLAYED bars — the sub-pane's line, in this
 * pane's own interval, distinct from data/atr.ts's session ATR (T-19's
 * ruler): a 5-minute pane's ATR sub-pane answers "how big are 5-minute
 * bars lately", the ruler answers "how big is a day". Null through the
 * seed window.
 */
export function atrBarSeries(bars: readonly Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period < 1 || bars.length <= period) return out;
  const tr = (i: number) =>
    Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr(i);
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr(i)) / period;
    out[i] = atr;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   THE SECOND SET (2026-08-29).

   The eight above cover trend and a little momentum. What a reader coming
   from TradingView reaches for and did not find here: the oscillators that
   bound themselves (Stochastic, CCI, Williams %R, MFI), the trend-STRENGTH
   family that answers "is this move worth trading" rather than "which way"
   (ADX/DMI, Aroon), the volume-confirmation pair (OBV, CMF), and the
   channel/stop family a plan is actually built on (Keltner, Donchian,
   Supertrend, Parabolic SAR).

   TWO RULES THIS SET KEEPS, both of which are easy to get wrong.

   WILDER SMOOTHING IS NOT AN SMA, and ADX, MFI's cousins and ATR all want
   Wilder's. The recurrence is `next = (prev*(n-1) + x)/n`, seeded with a
   simple mean of the first n. Substituting an SMA gives a curve that looks
   plausible, tracks the same turns, and is wrong by a few percent forever —
   the kind of error nobody catches by eye, so `rma` exists once here rather
   than being re-derived per indicator.

   NULL MEANS "NOT YET", NEVER ZERO. Every series is bar-aligned with nulls
   through its warm-up. A zero would be a legitimate reading for most of
   these (CCI, ROC, OBV and CMF all cross zero), so filling warm-up with 0
   invents signal at exactly the moment there is none.
   ═══════════════════════════════════════════════════════════════════════ */

/** Wilder's running mean — the recurrence behind ATR, ADX and RSI. */
function rma(values: readonly (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let acc = 0;
  let seeded = -1;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    if (seeded < 0) {
      acc += v;
      count++;
      if (count === period) {
        acc /= period;
        out[i] = acc;
        seeded = i;
      }
    } else {
      acc = (acc * (period - 1) + v) / period;
      out[i] = acc;
    }
  }
  return out;
}

const highest = (bars: readonly Candle[], i: number, n: number) => {
  let h = -Infinity;
  for (let k = i - n + 1; k <= i; k++) if (bars[k].high > h) h = bars[k].high;
  return h;
};
const lowest = (bars: readonly Candle[], i: number, n: number) => {
  let l = Infinity;
  for (let k = i - n + 1; k <= i; k++) if (bars[k].low < l) l = bars[k].low;
  return l;
};

export interface StochasticSeries {
  k: (number | null)[];
  d: (number | null)[];
}

/**
 * Stochastic oscillator — where the close sits inside the recent range,
 * 0-100. %D is the smoothing of %K that the crossover is read from.
 */
export function stochasticSeries(
  bars: readonly Candle[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): StochasticSeries {
  const raw: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    const hh = highest(bars, i, period);
    const ll = lowest(bars, i, period);
    /* A FLAT RANGE IS 50, NOT A DIVIDE BY ZERO. hh === ll happens on a
       halted or thinly-printed name; the close is neither high nor low in
       its range because the range has no width, and 50 says exactly that. */
    raw[i] = hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100;
  }
  const k = smaOf(raw, smoothK);
  const d = smaOf(k, smoothD);
  return { k, d };
}

/** Simple mean over a nullable series, null until it has `period` values. */
function smaOf(values: readonly (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period < 1) return out;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let k = i - period + 1; k <= i; k++) {
      if (k < 0) break;
      const v = values[k];
      if (v === null) break;
      sum += v;
      n++;
    }
    if (n === period) out[i] = sum / period;
  }
  return out;
}

/** Stochastic RSI — the stochastic OF the RSI, not of price. 0-100. */
export function stochRsiSeries(
  bars: readonly Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  smoothK = 3,
  smoothD = 3,
): StochasticSeries {
  const rsi = rsiSeries(bars, rsiPeriod);
  const raw: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (rsi[i] === null) continue;
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let k = i - stochPeriod + 1; k <= i; k++) {
      if (k < 0) { ok = false; break; }
      const v = rsi[k];
      if (v === null) { ok = false; break; }
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    if (!ok) continue;
    raw[i] = hh === ll ? 50 : ((rsi[i] as number) - ll) / (hh - ll) * 100;
  }
  const k = smaOf(raw, smoothK);
  const d = smaOf(k, smoothD);
  return { k, d };
}

export interface AdxSeries {
  adx: (number | null)[];
  plusDi: (number | null)[];
  minusDi: (number | null)[];
}

/**
 * ADX with its DMI pair. ADX is DIRECTIONLESS — it says how strong the move
 * is, not which way; +DI over −DI is the direction. Reading ADX alone as
 * bullish is the classic misuse, so both DIs are returned with it.
 */
export function adxSeries(bars: readonly Candle[], period = 14): AdxSeries {
  const n = bars.length;
  const empty = (): (number | null)[] => new Array(n).fill(null);
  if (n < 2) return { adx: empty(), plusDi: empty(), minusDi: empty() };

  const tr: (number | null)[] = empty();
  const plusDm: (number | null)[] = empty();
  const minusDm: (number | null)[] = empty();
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    /* ONLY THE LARGER MOVE COUNTS, AND ONLY IF IT IS POSITIVE. A bar that
       is both higher-high and lower-low is an expansion, not a direction. */
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
  }
  const trN = rma(tr, period);
  const plusN = rma(plusDm, period);
  const minusN = rma(minusDm, period);

  const plusDi = empty();
  const minusDi = empty();
  const dx: (number | null)[] = empty();
  for (let i = 0; i < n; i++) {
    const t = trN[i];
    if (t === null || t === 0 || plusN[i] === null || minusN[i] === null) continue;
    const p = ((plusN[i] as number) / t) * 100;
    const m = ((minusN[i] as number) / t) * 100;
    plusDi[i] = p;
    minusDi[i] = m;
    dx[i] = p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
  }
  return { adx: rma(dx, period), plusDi, minusDi };
}

/**
 * On-Balance Volume — volume signed by the close's direction. The LEVEL is
 * meaningless (it depends where the series started); only its slope and its
 * divergence from price carry information.
 */
export function obvSeries(bars: readonly Candle[]): number[] {
  const out = new Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    out[i] = out[i - 1] + (d > 0 ? bars[i].volume : d < 0 ? -bars[i].volume : 0);
  }
  return out;
}

/** Commodity Channel Index — typical price against its own mean deviation. */
export function cciSeries(bars: readonly Candle[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  const tp = bars.map(b => (b.high + b.low + b.close) / 3);
  for (let i = period - 1; i < bars.length; i++) {
    let mean = 0;
    for (let k = i - period + 1; k <= i; k++) mean += tp[k];
    mean /= period;
    let dev = 0;
    for (let k = i - period + 1; k <= i; k++) dev += Math.abs(tp[k] - mean);
    dev /= period;
    /* 0.015 is Lambert's constant, chosen so roughly 70-80% of readings fall
       inside ±100. It is a convention, not a derivation. */
    out[i] = dev === 0 ? 0 : (tp[i] - mean) / (0.015 * dev);
  }
  return out;
}

/** Williams %R — the stochastic's mirror, 0 at the high to −100 at the low. */
export function williamsRSeries(bars: readonly Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    const hh = highest(bars, i, period);
    const ll = lowest(bars, i, period);
    out[i] = hh === ll ? -50 : ((hh - bars[i].close) / (hh - ll)) * -100;
  }
  return out;
}

/** Money Flow Index — RSI weighted by volume. 0-100. */
export function mfiSeries(bars: readonly Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  const tp = bars.map(b => (b.high + b.low + b.close) / 3);
  for (let i = period; i < bars.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let k = i - period + 1; k <= i; k++) {
      const flow = tp[k] * bars[k].volume;
      if (tp[k] > tp[k - 1]) pos += flow;
      else if (tp[k] < tp[k - 1]) neg += flow;
    }
    /* NO NEGATIVE FLOW IS 100, the same convention RSI uses for no losses:
       the ratio is undefined, and the reading it stands for is "entirely
       one-sided". */
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export interface BandSeries {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/** Keltner Channels — an EMA with ATR shoulders, not standard deviations. */
export function keltnerSeries(
  bars: readonly Candle[],
  period = 20,
  atrPeriod = 10,
  mult = 2,
): BandSeries {
  const mid = emaSeries(bars, period);
  const atr = atrBarSeries(bars, atrPeriod);
  const upper: (number | null)[] = new Array(bars.length).fill(null);
  const lower: (number | null)[] = new Array(bars.length).fill(null);
  const middle: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (atr[i] === null) continue;
    middle[i] = mid[i];
    upper[i] = mid[i] + (atr[i] as number) * mult;
    lower[i] = mid[i] - (atr[i] as number) * mult;
  }
  return { upper, middle, lower };
}

/** Donchian Channels — the plain high/low envelope breakouts are read off. */
export function donchianSeries(bars: readonly Candle[], period = 20): BandSeries {
  const upper: (number | null)[] = new Array(bars.length).fill(null);
  const lower: (number | null)[] = new Array(bars.length).fill(null);
  const middle: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    const hh = highest(bars, i, period);
    const ll = lowest(bars, i, period);
    upper[i] = hh;
    lower[i] = ll;
    middle[i] = (hh + ll) / 2;
  }
  return { upper, middle, lower };
}

export interface SupertrendSeries {
  /** The stop line itself. */
  line: (number | null)[];
  /** +1 while the trend is up, −1 while down, null before it starts. */
  dir: (number | null)[];
}

/**
 * Supertrend — an ATR stop that only ever moves in the trend's favour and
 * flips when price closes through it. The RATCHET is the whole indicator:
 * a band recomputed from scratch each bar would loosen on a quiet bar and
 * hand back ground the trade already earned.
 */
export function supertrendSeries(bars: readonly Candle[], period = 10, mult = 3): SupertrendSeries {
  const n = bars.length;
  const atr = atrBarSeries(bars, period);
  const line: (number | null)[] = new Array(n).fill(null);
  const dir: (number | null)[] = new Array(n).fill(null);
  let upper = 0;
  let lower = 0;
  let trend = 1;
  let started = false;
  for (let i = 0; i < n; i++) {
    if (atr[i] === null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    const a = (atr[i] as number) * mult;
    const rawUpper = mid + a;
    const rawLower = mid - a;
    if (!started) {
      upper = rawUpper;
      lower = rawLower;
      trend = 1;
      started = true;
    } else {
      upper = rawUpper < upper || bars[i - 1].close > upper ? rawUpper : upper;
      lower = rawLower > lower || bars[i - 1].close < lower ? rawLower : lower;
      if (trend === 1 && bars[i].close < lower) trend = -1;
      else if (trend === -1 && bars[i].close > upper) trend = 1;
    }
    dir[i] = trend;
    line[i] = trend === 1 ? lower : upper;
  }
  return { line, dir };
}

/** Rate of Change — percent move over `period` bars. Crosses zero. */
export function rocSeries(bars: readonly Candle[], period = 12): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    const prev = bars[i - period].close;
    out[i] = prev === 0 ? 0 : ((bars[i].close - prev) / prev) * 100;
  }
  return out;
}

export interface AroonSeries {
  up: (number | null)[];
  down: (number | null)[];
}

/** Aroon — how recently the window's high and low were made, as 0-100. */
export function aroonSeries(bars: readonly Candle[], period = 25): AroonSeries {
  const up: (number | null)[] = new Array(bars.length).fill(null);
  const down: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    let hiAt = i;
    let loAt = i;
    for (let k = i - period; k <= i; k++) {
      if (bars[k].high >= hi) { hi = bars[k].high; hiAt = k; }
      if (bars[k].low <= lo) { lo = bars[k].low; loAt = k; }
    }
    up[i] = ((period - (i - hiAt)) / period) * 100;
    down[i] = ((period - (i - loAt)) / period) * 100;
  }
  return up.length ? { up, down } : { up, down };
}

/** Chaikin Money Flow — where the close sat in each bar, volume-weighted. */
export function cmfSeries(bars: readonly Candle[], period = 20): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let mfv = 0;
    let vol = 0;
    for (let k = i - period + 1; k <= i; k++) {
      const range = bars[k].high - bars[k].low;
      /* A ZERO-RANGE BAR CONTRIBUTES NOTHING rather than dividing by zero:
         the close was simultaneously at the high and the low, which carries
         no information about who won the bar. */
      const m = range === 0 ? 0 : ((bars[k].close - bars[k].low) - (bars[k].high - bars[k].close)) / range;
      mfv += m * bars[k].volume;
      vol += bars[k].volume;
    }
    out[i] = vol === 0 ? 0 : mfv / vol;
  }
  return out;
}

/**
 * Parabolic SAR. The acceleration factor is the fiddly part: it steps up
 * only when the extreme point makes a NEW extreme, caps at `maxAf`, and
 * resets on every flip. Letting it step every bar makes a SAR that catches
 * up to price and flips constantly.
 */
export function parabolicSarSeries(bars: readonly Candle[], step = 0.02, maxAf = 0.2): (number | null)[] {
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < 2) return out;
  let up = bars[1].close >= bars[0].close;
  let sar = up ? bars[0].low : bars[0].high;
  let ep = up ? bars[1].high : bars[1].low;
  let af = step;
  out[1] = sar;
  for (let i = 2; i < n; i++) {
    sar = sar + af * (ep - sar);
    /* The SAR may never sit inside the last two bars' range — that would be
       a stop already touched before it was placed. */
    if (up) sar = Math.min(sar, bars[i - 1].low, bars[i - 2].low);
    else sar = Math.max(sar, bars[i - 1].high, bars[i - 2].high);

    if (up && bars[i].low < sar) {
      up = false; sar = ep; ep = bars[i].low; af = step;
    } else if (!up && bars[i].high > sar) {
      up = true; sar = ep; ep = bars[i].high; af = step;
    } else if (up && bars[i].high > ep) {
      ep = bars[i].high; af = Math.min(af + step, maxAf);
    } else if (!up && bars[i].low < ep) {
      ep = bars[i].low; af = Math.min(af + step, maxAf);
    }
    out[i] = sar;
  }
  return out;
}
