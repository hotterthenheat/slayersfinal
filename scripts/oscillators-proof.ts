/*
  Acceptance test for T-4's indicator engines. Runs the ACTUAL module against
  staged closes where every value is computable by hand.

  Proves:
  1. RSI is Wilder's — seed at the window's completion, then (p−1)/p
     smoothing — with the boundary conventions pinned (lossless 100,
     gainless 0, flat 50) and null through the seed window
  2. MACD is the difference of the SAME seeded EMAs the tape draws, nulled
     through the slow warmup, with the signal nulled through ITS warmup on
     top and the histogram their difference
  3. Bollinger is SMA ± k·population-σ over one window, null before it
  4. SMA and its warmup
  5. The VWAP σ re-anchors at every session exactly as the VWAP does, and a
     one-session hand case lands exactly
  6. Bar-ATR is Wilder on displayed bars with the gap term
*/
import {
  atrBarSeries, bollingerSeries, emaSeries, emaWarmup, macdSeries, rsiSeries, smaSeries, vwapSigmaSeries,
} from '../src/data/indicators';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null | undefined, b: number, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

const T0 = 1_760_000_000;
const C = (i: number, close: number, high = close, low = close, volume = 1): Candle => ({
  time: T0 + i * 60, open: close, high, low, close, volume,
});
const closes = (...vals: number[]) => vals.map((v, i) => C(i, v));

// ── 1. RSI by hand ────────────────────────────────────────────────────────
{
  /* period 2, closes 10 11 10 11 10:
     changes +1 −1 +1 −1 · seed g=.5 l=.5 → RSI 50 at index 2
     i3: g=(.5+1)/2=.75 l=.25 → RS 3 → 75 · i4: g=.375 l=.625 → 37.5 */
  const r = rsiSeries(closes(10, 11, 10, 11, 10), 2);
  check('null through the seed window', r[0] === null && r[1] === null);
  check('seed lands ON the completing bar', near(r[2], 50));
  check('then Wilder smooths — 75 by hand', near(r[3], 75), String(r[3]));
  check('and 37.5', near(r[4], 37.5), String(r[4]));
  /* Period 3, because period 2 cannot tell Wilder from a running average —
     the same identity the ATR proof documents. Closes 10 11 10 11 10 11:
     seed at i3: g=2/3 l=1/3 → 66.6̄ · i4 (ch −1): g=4/9 l=5/9 → 44.4̄ */
  const r3 = rsiSeries(closes(10, 11, 10, 11, 10, 11), 3);
  check('Wilder at period 3 — the (p−1)/p structure itself', near(r3[3], 200 / 3) && near(r3[4], 400 / 9), `${r3[3]} · ${r3[4]}`);

  const up = rsiSeries(closes(1, 2, 3, 4), 2);
  check('a lossless window reads 100', near(up[2], 100) && near(up[3], 100));
  const dn = rsiSeries(closes(4, 3, 2, 1), 2);
  check('a gainless one reads 0', near(dn[2], 0));
  const flat = rsiSeries(closes(5, 5, 5), 2);
  check('a flat one reads 50, not a division by nothing', near(flat[2], 50));
}

// ── 2. MACD off the seeded EMAs ───────────────────────────────────────────
{
  const bars = closes(3, 6, 9, 12, 15, 18);
  const m = macdSeries(bars, 1, 2, 1);
  /* fast=1 is the close itself; slow=2 is the seeded EMA the tape draws.
     macd valid from emaWarmup(2)=2; signal(1) = macd itself, valid from
     2 + emaWarmup(1) = 3. */
  const ef = emaSeries(bars, 1);
  const es = emaSeries(bars, 2);
  check('macd is null through the slow warmup', m.macd[0] === null && m.macd[1] === null && m.macd[2] !== null);
  check('and IS fastEMA − slowEMA thereafter', near(m.macd[3], ef[3] - es[3]) && near(m.macd[5], ef[5] - es[5]));
  check('the signal waits out its own warmup on top', m.signal[2] === null && m.signal[3] !== null);
  check('signal(1) equals the macd it smooths', near(m.signal[4], m.macd[4] as number));
  check('and the histogram is their difference', near(m.hist[4], 0) && m.hist[2] === null);
}

// ── 3. Bollinger by hand ──────────────────────────────────────────────────
{
  /* closes 1 2 3, period 3, k 2: mid 2, σ = √(2/3). */
  const b = bollingerSeries(closes(1, 2, 3), 3, 2);
  const sd = Math.sqrt(2 / 3);
  check('null before a full window', b.basis[0] === null && b.basis[1] === null);
  check('SMA basis', near(b.basis[2], 2));
  check('± k·population σ', near(b.upper[2], 2 + 2 * sd) && near(b.lower[2], 2 - 2 * sd));
}

// ── 4. SMA ────────────────────────────────────────────────────────────────
{
  const s = smaSeries(closes(2, 4, 6, 8), 2);
  check('SMA warms up then averages the window', s[0] === null && near(s[1], 3) && near(s[2], 5) && near(s[3], 7));
}

// ── 5. VWAP σ ─────────────────────────────────────────────────────────────
{
  /* One session, unit volumes, typicals 10 and 20:
     bar0: vwap 10, σ 0 · bar1: vwap 15, σ = √(250−225) = 5. */
  const bars = [C(0, 10), C(1, 20)];
  const sg = vwapSigmaSeries(bars, 1);
  check('first bar of a session has σ 0 — one print, no spread', near(sg[0], 0));
  check('two prints, σ 5 by hand', near(sg[1], 5), String(sg[1]));
  /* A second session re-anchors: same two bars after a gap read the same. */
  const twoSessions = [C(0, 99), { ...C(1, 10), time: T0 + 86400 }, { ...C(2, 20), time: T0 + 86400 + 60 }];
  const sg2 = vwapSigmaSeries(twoSessions, 1);
  check('the σ re-anchors at the session exactly as the VWAP does', near(sg2[1], 0) && near(sg2[2], 5));
  const noVol = vwapSigmaSeries([{ ...C(0, 10), volume: 0 }], 1);
  check('no volume yet is null, not zero-width certainty', noVol[0] === null);
}

// ── 6. bar-ATR ────────────────────────────────────────────────────────────
{
  /* period 2 over bars whose TRs are 6, 9, then a gap TR of 14 — the same
     hand numbers the session-ATR proof pins, here on displayed bars. */
  const bars = [
    C(0, 100, 101, 99), C(1, 104, 105, 99), C(2, 96, 104, 95), C(3, 109, 110, 108),
  ];
  const a = atrBarSeries(bars, 2);
  check('null through the seed window', a[0] === null && a[1] === null);
  check('seed = mean of the first period TRs', near(a[2], 7.5), String(a[2]));
  check('then Wilder, gap term included — 10.75 by hand', near(a[3], 10.75), String(a[3]));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
