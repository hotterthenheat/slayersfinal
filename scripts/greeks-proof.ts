/*
  Acceptance test for P-24A — the carry seam, the generalized greeks, the BS
  inversion, and the scaling convention every feed ingest depends on.

  The directive is explicit that P-11 through P-14 cannot be built until this
  file is right, because third-order greeks amplify first-order error. So
  these assertions are RELATIONSHIPS the model must satisfy, not numbers
  copied out of the implementation: parity, the definitional links between a
  greek and the thing it differentiates, and the limits.

  Proves:
  1. Put-call parity with a dividend yield: C − P = S·e^{−qt} − K·e^{−rt}
  2. Delta obeys the same carry — a call's delta is e^{−qt}N(d1), so raising
     q LOWERS it, and the call/put deltas differ by exactly e^{−qt}
  3. Gamma and vega are shared by both rights; vanna carries its sign
  4. CHARM IS THE DELTAS' OWN TIME-DERIVATIVE — verified numerically against
     a finite difference of delta, and the call/put pair differs by exactly
     q·e^{−qt}, which at q = 0 makes them EQUAL. The old code had them
     differing by r·e^{−rt}; this is the assertion that keeps it gone
  5. Rho is positive for calls, negative for puts, and both are per POINT
  6. THE VEGA SCALING TRAP (P-24D): vega is per 1 vol POINT — a 1-point vol
     bump moves the model price by vega, within a hair
  7. The inversion round-trips: price at a known vol, invert, get it back —
     and returns null rather than a number for prices no vol can produce
  8. The carry seam validates: NaN and absurd inputs are rejected and leave
     the last good carry standing; the source label says which it is
*/
import { blackScholesGreeks, blackScholesPrice, impliedVolFromPrice } from '../src/core/greeks';
import { DEFAULT_Q, DEFAULT_R, carrySource, getCarry, resetCarry, setCarry } from '../src/core/carry';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const S = 500, K = 505, t = 0.25, v = 0.20, r = 0.042, q = 0.012;

// ── 1. parity ─────────────────────────────────────────────────────────────
{
  const c = blackScholesPrice(S, K, t, v, 'C', r, q);
  const p = blackScholesPrice(S, K, t, v, 'P', r, q);
  const lhs = c - p;
  const rhs = S * Math.exp(-q * t) - K * Math.exp(-r * t);
  /* The CDF here is Abramowitz-Stegun, good to ~7.5e-8 absolute; parity
     inherits that on both legs. */
  check('put-call parity holds with a dividend yield', near(lhs, rhs, 1e-4), `${lhs.toFixed(6)} vs ${rhs.toFixed(6)}`);
  const c0 = blackScholesPrice(S, K, t, v, 'C', r, 0);
  const p0 = blackScholesPrice(S, K, t, v, 'P', r, 0);
  check('and at q = 0 it degenerates to the textbook form', near(c0 - p0, S - K * Math.exp(-r * t), 1e-4));
}

// ── 2. delta and the carry ────────────────────────────────────────────────
{
  const g = blackScholesGreeks(S, K, t, v, r, q);
  const gNoQ = blackScholesGreeks(S, K, t, v, r, 0);
  check('a dividend yield LOWERS call delta', g.deltaCall < gNoQ.deltaCall, `${g.deltaCall.toFixed(5)} < ${gNoQ.deltaCall.toFixed(5)}`);
  check('call and put deltas differ by exactly e^{−qt}', near(g.deltaCall - g.deltaPut, Math.exp(-q * t)), String(g.deltaCall - g.deltaPut));
  check('— and by exactly 1 when nothing is paid out', near(gNoQ.deltaCall - gNoQ.deltaPut, 1));
}

// ── 3. the shared greeks ──────────────────────────────────────────────────
{
  const g = blackScholesGreeks(S, K, t, v, r, q);
  check('gamma is positive', g.gamma > 0);
  check('vega is positive', g.vega > 0);
  /* An OTM call's vanna is positive under this sign convention (d2 < 0);
     the point is that it is signed at all, not merely a magnitude. */
  check('vanna carries a sign', Number.isFinite(g.vanna) && g.vanna !== 0);
}

// ── 4. charm really is the deltas' time-derivative ────────────────────────
{
  const g = blackScholesGreeks(S, K, t, v, r, q);
  /* charm = −∂Δ/∂τ. Central difference in τ, small enough to be a
     derivative and large enough to clear the CDF's own noise. */
  const h = 1e-5;
  const up = blackScholesGreeks(S, K, t + h, v, r, q);
  const dn = blackScholesGreeks(S, K, t - h, v, r, q);
  const numCall = -(up.deltaCall - dn.deltaCall) / (2 * h);
  const numPut = -(up.deltaPut - dn.deltaPut) / (2 * h);
  check('call charm matches a finite difference of call delta', near(g.charmCall, numCall, 1e-2), `${g.charmCall.toFixed(5)} vs ${numCall.toFixed(5)}`);
  check('put charm matches a finite difference of put delta', near(g.charmPut, numPut, 1e-2), `${g.charmPut.toFixed(5)} vs ${numPut.toFixed(5)}`);
  /* THE REGRESSION GUARD. The pair differs by the DIVIDEND term. The old
     code had them differing by r·e^{−rt}, which at q = 0 wrongly made the
     put charm differ from the call's. */
  check('the charm pair differs by exactly q·e^{−qt}', near(g.charmCall - g.charmPut, q * Math.exp(-q * t)), String(g.charmCall - g.charmPut));
  const g0 = blackScholesGreeks(S, K, t, v, r, 0);
  check('so with no dividend the two charms are EQUAL', near(g0.charmCall, g0.charmPut), `${g0.charmCall.toFixed(6)} vs ${g0.charmPut.toFixed(6)}`);
}

// ── 5. rho ────────────────────────────────────────────────────────────────
{
  const g = blackScholesGreeks(S, K, t, v, r, q);
  check('call rho is positive, put rho negative', g.rhoCall > 0 && g.rhoPut < 0, `${g.rhoCall.toFixed(4)} / ${g.rhoPut.toFixed(4)}`);
  /*
    Per POINT, like vega — stated as the DERIVATIVE it is, not as a finite
    bump. Measured: a full 1-point bump moves the call 0.59304 against a rho
    of 0.58756, and the 0.0055 gap is the price's own convexity in r over
    that bump, not an error in the formula. A central difference scaled to
    one point tests the convention without inheriting the curvature.
  */
  const h = 1e-6;
  const dPdr = (blackScholesPrice(S, K, t, v, 'C', r + h, q) - blackScholesPrice(S, K, t, v, 'C', r - h, q)) / (2 * h);
  check('rho is ∂price/∂r scaled to one POINT of rate', near(dPdr * 0.01, g.rhoCall, 1e-4), `${(dPdr * 0.01).toFixed(6)} vs ${g.rhoCall.toFixed(6)}`);
  const dPdrPut = (blackScholesPrice(S, K, t, v, 'P', r + h, q) - blackScholesPrice(S, K, t, v, 'P', r - h, q)) / (2 * h);
  check('and the put side likewise', near(dPdrPut * 0.01, g.rhoPut, 1e-4), `${(dPdrPut * 0.01).toFixed(6)} vs ${g.rhoPut.toFixed(6)}`);
}

// ── 6. THE VEGA SCALING TRAP (P-24D) ──────────────────────────────────────
{
  const g = blackScholesGreeks(S, K, t, v, r, q);
  const bumped = blackScholesPrice(S, K, t, v + 0.01, 'C', r, q);
  const basePx = blackScholesPrice(S, K, t, v, 'C', r, q);
  check(
    'vega is per one POINT of vol — a 1-point bump moves the price by vega',
    near(bumped - basePx, g.vega, 5e-3),
    `Δprice ${(bumped - basePx).toFixed(5)} vs vega ${g.vega.toFixed(5)}`
  );
  /* Said the other way, so an ingest that divides again fails here: the raw
     partial is 100× this number, and THAT is what a per-1.00 feed quotes. */
  const d1 = (Math.log(S / K) + (r - q + (v * v) / 2) * t) / (v * Math.sqrt(t));
  const phi = Math.exp((-d1 * d1) / 2) / Math.sqrt(2 * Math.PI);
  const raw = S * Math.exp(-q * t) * Math.sqrt(t) * phi;
  check('and the raw per-1.00 partial is exactly 100× it — divide ONCE, on ingest', near(raw / 100, g.vega, 1e-9), `${(raw / 100).toFixed(8)} vs ${g.vega.toFixed(8)}`);
}

// ── 7. the inversion ──────────────────────────────────────────────────────
{
  for (const trueVol of [0.08, 0.2, 0.65, 1.4]) {
    const px = blackScholesPrice(S, K, t, trueVol, 'C', r, q);
    const back = impliedVolFromPrice(px, S, K, t, 'C', r, q);
    check(`the inversion round-trips at ${trueVol}`, back !== null && near(back, trueVol, 1e-4), String(back));
  }
  const putPx = blackScholesPrice(S, K, t, 0.33, 'P', r, q);
  const putBack = impliedVolFromPrice(putPx, S, K, t, 'P', r, q);
  check('and on the put side too', putBack !== null && near(putBack, 0.33, 1e-4), String(putBack));
  check('a price no vol can produce reports null, not a number', impliedVolFromPrice(S * 2, S, K, t, 'C', r, q) === null);
  check('and so does a nonsense input', impliedVolFromPrice(-1, S, K, t, 'C') === null && impliedVolFromPrice(5, S, K, 0, 'C') === null);
}

// ── 8. the seam ───────────────────────────────────────────────────────────
{
  resetCarry();
  check('the default carry is the documented assumption', getCarry().r === DEFAULT_R && getCarry().q === DEFAULT_Q);
  check('and it says so, so a surface can caveat honestly', carrySource().kind === 'assumed' && /assumed/.test(carrySource().note));
  check('a NaN from a feed is refused', setCarry({ r: NaN }) === false && getCarry().r === DEFAULT_R);
  check('so is a percent handed over where a fraction was meant', setCarry({ r: 42 }) === false && getCarry().r === DEFAULT_R);
  check('a real figure is taken, and relabelled', setCarry({ r: 0.0375, q: 0.0131 }) === true && getCarry().r === 0.0375 && carrySource().kind === 'feed');
  /* And the greeks follow the seam without being told. */
  const viaSeam = blackScholesGreeks(S, K, t, v);
  const explicit = blackScholesGreeks(S, K, t, v, 0.0375, 0.0131);
  check('greeks read the seam when not handed a rate', near(viaSeam.deltaCall, explicit.deltaCall, 1e-12));
  resetCarry();
  check('and a reset puts the assumption back', getCarry().r === DEFAULT_R && carrySource().kind === 'assumed');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
