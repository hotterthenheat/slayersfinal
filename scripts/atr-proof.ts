/*
  Acceptance test for T-19's distance scales. Runs the ACTUAL engine against
  staged sessions where every true range is computable by hand.

  Proves:
  1. Wilder's ATR exactly, seed and smoothing, on hand-built sessions —
     including the overnight-gap term (|high − prevClose|), which is the
     whole reason true range exists over plain high−low
  2. The still-forming session is off the ruler: a wild partial day changes
     nothing
  3. Warmup honesty: fewer than period+1 completed sessions is null
  4. σ is one trading day of the quoted annualized vol — spot·iv·√(1/252),
     pinned by choosing iv = √252 so the answer is exactly spot
  5. fmtDistance words every unit and renders an em-dash, never a number,
     when a ruler is null
*/
import { fmtDistance, impliedDaySigma, sessionAtr, TRADING_DAYS } from '../src/data/atr';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps;

/* One bar per session (a bar 86400s from its neighbour is its own session
   under the gap cut) — each carries that session's whole OHLC. */
const T0 = 1_760_000_000;
const S = (d: number, high: number, low: number, close: number): Candle => ({
  time: T0 + d * 86400, open: close, high, low, close, volume: 1,
});

// ── 1. Wilder, by hand ────────────────────────────────────────────────────
{
  /*
    period 2. Completed sessions:
      S0 close 100
      S1 h105 l99 c104 → TR = max(6, |105−100|, |99−100|)   = 6
      S2 h104 l95 c96  → TR = max(9, |104−104|, |95−104|)   = 9
      S3 h110 l108 c109 (gap up over c96)
                       → TR = max(2, |110−96|, |108−96|)    = 14  ← the gap term
    seed = (6+9)/2 = 7.5 · then (7.5·1 + 14)/2 = 10.75
    S4 is the forming session, excluded.
  */
  const bars = [S(0, 101, 99, 100), S(1, 105, 99, 104), S(2, 104, 95, 96), S(3, 110, 108, 109), S(4, 500, 1, 200)];
  check('Wilder ATR, seed then smooth, exactly by hand', near(sessionAtr(bars, 2), 10.75), String(sessionAtr(bars, 2)));

  /* Period 3, because period 2 cannot tell Wilder from a plain running
     average — (atr·(p−1)+tr)/p and (atr+tr)/2 coincide at p=2, and the
     first cut of this proof let exactly that mutation live.
       seed(3) = (6+9+14)/3 = 29/3
       S4 h111 l107 c108 over c109 → TR = max(4, 2, 2) = 4
       atr = (29/3 · 2 + 4)/3 = 70/9
  */
  const bars3 = [S(0, 101, 99, 100), S(1, 105, 99, 104), S(2, 104, 95, 96), S(3, 110, 108, 109), S(4, 111, 107, 108), S(5, 108.1, 107.9, 108)];
  check('Wilder at period 3 — the (p−1)/p structure itself', near(sessionAtr(bars3, 3), 70 / 9), String(sessionAtr(bars3, 3)));

  /* 2. The wild S4 above was already ignored; replace it with a quiet one
     and nothing moves. */
  const quiet = [...bars.slice(0, 4), S(4, 109.1, 108.9, 109)];
  check('the forming session is off the ruler', sessionAtr(quiet, 2) === sessionAtr(bars, 2));
}

// ── 3. warmup honesty ─────────────────────────────────────────────────────
{
  const bars = [S(0, 101, 99, 100), S(1, 105, 99, 104), S(2, 104, 95, 96)];
  check('period+1 completed sessions is the floor — under it, null', sessionAtr(bars, 2) === null);
  const enough = [...bars, S(3, 104, 96, 100)];
  check('and exactly at the floor it measures', sessionAtr(enough, 2) !== null);
  check('an empty tape is null, not zero', sessionAtr([], 2) === null);
}

// ── 4. σ, pinned ──────────────────────────────────────────────────────────
{
  check('σ = spot·iv·√(1/252): iv of √252 makes it exactly spot', near(impliedDaySigma(100, Math.sqrt(TRADING_DAYS)), 100));
  check('half the vol, half the σ', near(impliedDaySigma(100, Math.sqrt(TRADING_DAYS) / 2), 50));
  check('no vol, no ruler', impliedDaySigma(100, 0) === null && impliedDaySigma(0, 0.2) === null);
}

// ── 5. the words ──────────────────────────────────────────────────────────
{
  const scales = { atr: 5, sigma: 10 };
  check('dollars', fmtDistance(12.5, 500, '$', scales) === '+$12.50');
  check('percent', fmtDistance(-12.5, 500, '%', scales) === '−2.50%');
  check('ATR distance', fmtDistance(2, 500, 'ATR', scales) === '+0.40 ATR');
  check('σ distance, signed', fmtDistance(-21.5, 500, 'σ', scales) === '−2.15σ');
  check('a null ruler renders absence, never a number', fmtDistance(2, 500, 'ATR', { atr: null, sigma: null }) === '— ATR' && fmtDistance(2, 500, 'σ', { atr: null, sigma: null }) === '— σ');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
