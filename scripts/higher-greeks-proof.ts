/*
  Acceptance test for P-11 through P-14's higher-order greeks.

  These are third derivatives of the option price, and the reason they get
  this treatment is that a closed-form third derivative is very easy to get
  subtly wrong and impossible to eyeball: every one of these formulas
  returns a plausible-looking number whether or not it is the derivative it
  claims to be.

  So NOTHING here is asserted against a figure copied out of the
  implementation. Every one of the five is checked against a CENTRAL FINITE
  DIFFERENCE of the greek it differentiates, computed from
  blackScholesGreeks — an independent path through independent code. If a
  formula is wrong, the difference disagrees.

  Proves:
  1. zomma  = ∂gamma/∂σ
  2. speed  = ∂gamma/∂S
  3. color  = ∂gamma/∂t   (calendar time, so −∂/∂τ — charm's convention)
  4. vomma  = ∂vega/∂σ    (RAW vega, per 1.00)
  5. veta   = ∂vega/∂t
  6. The units boundary: these are RAW partials, and the conversion helpers
     are the only sanctioned rescale — asserted so a caller cannot
     double-scale the way P-24D warns about
  7. They read the carry seam, and q genuinely moves them
  8. Signs at the money, where the textbook is unambiguous
  9. Exposure aggregation is dealer-signed, scales with OI, and nets
*/
import { higherGreeks, perVolPoint, perDay, exposureAt, TRADING_DAYS, CONTRACT_MULTIPLIER } from '../src/core/higherGreeks';
import { blackScholesGreeks } from '../src/core/greeks';
import { resetCarry, setCarry } from '../src/core/carry';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
/* Relative closeness: these quantities span many orders of magnitude, so an
   absolute epsilon would be meaningless across the set. */
const close = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(a), Math.abs(b));

resetCarry();
const r = 0.042, q = 0.012;
const RAW_VEGA = (S: number, K: number, t: number, v: number) => blackScholesGreeks(S, K, t, v, r, q).vega * 100;
const GAMMA = (S: number, K: number, t: number, v: number) => blackScholesGreeks(S, K, t, v, r, q).gamma;

/* Several points, not one: a formula can be accidentally right at the money
   and wrong in the wings, which is exactly where these are read. */
const CASES: [number, number, number, number, string][] = [
  [500, 500, 0.25, 0.20, 'at the money'],
  [500, 550, 0.25, 0.20, 'out of the money'],
  [500, 450, 0.25, 0.20, 'in the money'],
  [500, 505, 0.02, 0.45, 'near expiry, high vol'],
  [500, 505, 1.5, 0.12, 'far dated, low vol'],
];

// ── 1+2. the gamma family ─────────────────────────────────────────────────
for (const [S, K, t, v, label] of CASES) {
  const g = higherGreeks(S, K, t, v, r, q);

  const hv = v * 1e-4;
  const numZomma = (GAMMA(S, K, t, v + hv) - GAMMA(S, K, t, v - hv)) / (2 * hv);
  check(`zomma = ∂gamma/∂σ — ${label}`, close(g.zomma, numZomma, 1e-3), `${g.zomma.toExponential(4)} vs ${numZomma.toExponential(4)}`);

  const hs = S * 1e-5;
  const numSpeed = (GAMMA(S + hs, K, t, v) - GAMMA(S - hs, K, t, v)) / (2 * hs);
  check(`speed = ∂gamma/∂S — ${label}`, close(g.speed, numSpeed, 1e-3), `${g.speed.toExponential(4)} vs ${numSpeed.toExponential(4)}`);
}

// ── 3. color, the clock on gamma ──────────────────────────────────────────
for (const [S, K, t, v, label] of CASES) {
  const g = higherGreeks(S, K, t, v, r, q);
  const ht = t * 1e-5;
  /* ∂gamma/∂t = −∂gamma/∂τ. */
  const numColor = -(GAMMA(S, K, t + ht, v) - GAMMA(S, K, t - ht, v)) / (2 * ht);
  check(`color = ∂gamma/∂t — ${label}`, close(g.color, numColor, 1e-3), `${g.color.toExponential(4)} vs ${numColor.toExponential(4)}`);
}

// ── 4+5. the vega family ──────────────────────────────────────────────────
for (const [S, K, t, v, label] of CASES) {
  const g = higherGreeks(S, K, t, v, r, q);

  const hv = v * 1e-4;
  const numVomma = (RAW_VEGA(S, K, t, v + hv) - RAW_VEGA(S, K, t, v - hv)) / (2 * hv);
  check(`vomma = ∂vega/∂σ — ${label}`, close(g.vomma, numVomma, 1e-3), `${g.vomma.toExponential(4)} vs ${numVomma.toExponential(4)}`);

  const ht = t * 1e-5;
  const numVeta = -(RAW_VEGA(S, K, t + ht, v) - RAW_VEGA(S, K, t - ht, v)) / (2 * ht);
  check(`veta = ∂vega/∂t — ${label}`, close(g.veta, numVeta, 1e-3), `${g.veta.toExponential(4)} vs ${numVeta.toExponential(4)}`);
}

// ── 6. the units boundary ─────────────────────────────────────────────────
{
  const g = higherGreeks(500, 505, 0.25, 0.2, r, q);
  check('vomma here is RAW — 100× the per-point figure', close(perVolPoint(g.vomma), g.vomma / 100));
  check('and the per-day helper divides by the TRADING year, not 365', close(perDay(g.veta), g.veta / TRADING_DAYS) && TRADING_DAYS === 252);
  /* The P-24D lesson one level up: vega in greeks.ts is ALREADY per point,
     so the raw vega these are built on is exactly 100× it. Stated here so a
     caller mixing the two files fails this assertion rather than shipping a
     100× error that looks plausible. */
  const perPointVega = blackScholesGreeks(500, 505, 0.25, 0.2, r, q).vega;
  check('the raw vega this file differentiates is 100× greeks.ts vega', close(RAW_VEGA(500, 505, 0.25, 0.2), perPointVega * 100));
}

// ── 7. the carry seam ─────────────────────────────────────────────────────
{
  const withQ = higherGreeks(500, 505, 0.25, 0.2, r, 0.05);
  const noQ = higherGreeks(500, 505, 0.25, 0.2, r, 0);
  check('a dividend yield genuinely moves these', !close(withQ.zomma, noQ.zomma) && !close(withQ.color, noQ.color));

  resetCarry();
  const viaSeam = higherGreeks(500, 505, 0.25, 0.2);
  setCarry({ r: 0.0375, q: 0.0131 });
  const afterSeam = higherGreeks(500, 505, 0.25, 0.2);
  const explicit = higherGreeks(500, 505, 0.25, 0.2, 0.0375, 0.0131);
  check('they read the seam when not handed a rate', close(afterSeam.color, explicit.color, 1e-12));
  check('— and the seam actually changed the answer', !close(viaSeam.color, afterSeam.color));
  resetCarry();
}

// ── 8. signs at the money ─────────────────────────────────────────────────
{
  const g = higherGreeks(500, 500, 0.25, 0.2, r, q);
  /* At the money d1·d2 ≈ 0 − a shade negative, so zomma (∝ d1d2 − 1) is
     negative and vomma (∝ d1d2) is near zero: peak gamma and peak vega are
     right here, so neither grows with vol. */
  check('at the money, zomma is negative — gamma is already at its peak in vol', g.zomma < 0, String(g.zomma));
  check('and an ATM option is losing vega as expiry approaches', g.veta < 0, String(g.veta));
  /* Away from the money, vomma turns positive — vega grows with vol in the
     wings, which is the convexity the surface is for. */
  check('in the wings, vomma turns positive', higherGreeks(500, 600, 0.25, 0.2, r, q).vomma > 0);
  check('and every value is finite at a near-zero clock', Object.values(higherGreeks(500, 500, 1e-9, 0.2, r, q)).every(Number.isFinite));
  check('and at a near-zero vol', Object.values(higherGreeks(500, 500, 0.25, 0, r, q)).every(Number.isFinite));
}

// ── 9. exposure aggregation ───────────────────────────────────────────────
{
  const leg = { callOI: 1_000, putOI: 400 };
  const e = exposureAt(2, leg, -1);
  check('the call side takes the house sign', e.call === 2 * 1_000 * CONTRACT_MULTIPLIER * -1);
  check('the put side takes its opposite', e.put === 2 * 400 * CONTRACT_MULTIPLIER * 1);
  check('and net is their sum', e.net === e.call + e.put);
  check('doubling OI doubles the exposure', exposureAt(2, { callOI: 2_000, putOI: 800 }, -1).net === e.net * 2);
  check('flipping the house sign flips the book', exposureAt(2, leg, 1).net === -e.net);
  check('an empty strike carries no exposure', exposureAt(2, { callOI: 0, putOI: 0 }, -1).net === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
