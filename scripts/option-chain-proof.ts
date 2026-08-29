/*
  Acceptance test for §3's multi-expiry chain. Runs the ACTUAL engine.

  The claim this file has to defend is that expiries genuinely DIFFER in
  shape — because the thing it replaces (one synthetic surface re-weighted
  by a scalar) could not produce that, and a chain that only differed by a
  multiplier would be the same lie with more rows.

  Proves:
  1. The listed set is a real board: dense at the front, sparse behind it,
     every date a trading day, no duplicates
  2. τ comes from SESSIONS over 252 — the desk's own year, the one T-1, T-9
     and T-19 already divide by
  3. Expiries differ in SHAPE, not by a multiplier: ATM gamma falls and ATM
     vega rises with time, and the ratio between them is not constant
  4. The smile is a curve — wings over ATM, downside bid over upside, and
     flatter at 90 days than at 0DTE
  5. Put-call parity holds on the marks, which is what proves the two legs
     were priced off one surface rather than generated independently
  6. Deltas are bounded and signed correctly; ATM delta sits near ±0.5
  7. ITM is a fact about spot, not a guess; bid never exceeds ask
  8. Deterministic per (ticker, expiry, strike)
*/
import { buildChain, listExpiries, skewIv, strikeStep } from '../src/data/optionChain';
import { getCarry } from '../src/core/carry';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

const FROM = new Date('2026-08-31T12:00:00'); // a Monday
const SPOT = 500, IV = 0.18; // DECIMAL, like the greeks engine
const exps = listExpiries(FROM);

// ── 1. the board ──────────────────────────────────────────────────────────
{
  check('PREMISE: a listed board, not a range', exps.length >= 8, `${exps.length} expiries`);
  check('every expiry is a trading day', exps.every(e => { const d = e.date.getDay(); return d !== 0 && d !== 6; }),
    exps.slice(0, 4).map(e => `${e.weekday} ${e.label}`).join(' '));
  check('no duplicate dates', new Set(exps.map(e => e.label)).size === exps.length);
  check('sorted, nearest first', exps.every((e, i) => i === 0 || exps[i - 1].dte <= e.dte));
  /* Dense at the front, sparse behind — the shape the Expiry Ladder's
     question depends on. */
  const gapsFront = exps.slice(1, 4).map((e, i) => e.dte - exps[i].dte);
  /* `a - b?.c ?? 0` parses as `(a - b?.c) ?? 0` — subtraction binds tighter
     than ??, so the fallback is unreachable and an out-of-range index yields
     NaN instead of 0. TS2869 flags exactly this. Read the neighbour first. */
  const gapsBack = exps.slice(-2).map((e, i) => {
    const prev = exps[exps.length - 3 + i];
    return prev ? e.dte - prev.dte : 0;
  });
  check('the front is dense and the back is sparse',
    Math.max(...gapsFront) <= 4 && Math.max(...gapsBack) >= 30,
    `front gaps ${gapsFront.join(',')} · back gap ${gapsBack.join(',')}`);
}

// ── 2+3. τ, and the SHAPE difference ──────────────────────────────────────
{
  const d0 = buildChain('SPY', SPOT, IV, exps[0]);
  const far = buildChain('SPY', SPOT, IV, exps[exps.length - 1]);
  check('τ is sessions over 252 — the desk\'s own year',
    near(d0.t, Math.max(exps[0].sessions, 0.35) / 252, 1e-12), `${d0.t}`);

  const atm0 = d0.rows.find(r => r.atm)!;
  const atmFar = far.rows.find(r => r.atm)!;
  check('PREMISE: both chains have an ATM strike', !!atm0 && !!atmFar);

  /* The whole argument: a 30-day option is NOT a 0DTE option scaled. */
  check('ATM gamma FALLS with time to expiry', atmFar.call.gamma < atm0.call.gamma,
    `0DTE ${atm0.call.gamma} vs far ${atmFar.call.gamma}`);
  check('ATM vega RISES with time to expiry', atmFar.call.vega > atm0.call.vega * 3,
    `0DTE ${atm0.call.vega} vs far ${atmFar.call.vega}`);
  check('per-day theta is SMALLER on the far date', Math.abs(atmFar.call.theta) < Math.abs(atm0.call.theta),
    `0DTE ${atm0.call.theta} vs far ${atmFar.call.theta}`);
  /* And the killer: if one chain were the other times a constant, every
     ratio would agree. They must not. */
  const rG = atmFar.call.gamma / atm0.call.gamma;
  const rV = atmFar.call.vega / atm0.call.vega;
  check('the two are not one surface times a scalar', Math.abs(rG - rV) > 0.5,
    `gamma ratio ${rG.toFixed(3)} vs vega ratio ${rV.toFixed(3)}`);
}

// ── 4. the smile ──────────────────────────────────────────────────────────
{
  const t0 = 1 / 252, tFar = 90 / 252;
  const atm = skewIv(IV, SPOT, SPOT, t0);
  const down = skewIv(IV, SPOT, SPOT * 0.9, t0);
  const up = skewIv(IV, SPOT, SPOT * 1.1, t0);
  /* A SMIRK, not a symmetric smile: my first cut of this assertion demanded
     both wings over ATM, which is a currency's shape. An equity index bids
     the downside hard and leaves the near-money upside at or under the
     money — only the far upside wing turns back up. */
  check('the downside is bid well over the money', down > atm * 1.05, `${down.toFixed(3)} vs atm ${atm.toFixed(3)}`);
  check('near-money upside sits at or under it — the smirk', up <= atm * 1.02, `${up.toFixed(3)} vs atm ${atm.toFixed(3)}`);
  const farUp = skewIv(IV, SPOT, SPOT * 1.35, t0);
  check('but the far upside wing does turn back up', farUp > atm, `${farUp.toFixed(3)} vs atm ${atm.toFixed(3)}`);
  check('downside is bid over upside — the equity put skew', down > up, `${down.toFixed(3)} vs ${up.toFixed(3)}`);
  const steep0 = skewIv(IV, SPOT, SPOT * 0.9, t0) / skewIv(IV, SPOT, SPOT, t0);
  const steepFar = skewIv(IV, SPOT, SPOT * 0.9, tFar) / skewIv(IV, SPOT, SPOT, tFar);
  check('the smile is FLATTER further out', steepFar < steep0, `${steep0.toFixed(3)} → ${steepFar.toFixed(3)}`);
  check('vol never goes non-positive at the extremes', skewIv(IV, SPOT, SPOT * 0.3, t0) > 0 && skewIv(IV, SPOT, SPOT * 3, t0) > 0);
}

// ── 5. parity — the proof both legs came off ONE surface ──────────────────
{
  const c = buildChain('SPY', SPOT, IV, exps[4]);
  const carry = getCarry();
  const t = c.t;
  let worst = 0, at = 0;
  for (const r of c.rows) {
    /* C − P = S·e^(−qτ) − K·e^(−rτ) */
    const lhs = r.call.mark - r.put.mark;
    const rhs = SPOT * Math.exp(-carry.q * t) - r.strike * Math.exp(-carry.r * t);
    const err = Math.abs(lhs - rhs);
    if (err > worst) { worst = err; at = r.strike; }
  }
  /* The marks are rounded to cents and the spread model is symmetric about
     theo, so parity holds to rounding — not exactly, and not loosely. */
  check('put-call parity holds on every strike, to rounding', worst < 0.02, `worst ${worst.toFixed(4)} at ${at}`);
}

// ── 6+7. the legs are sane ────────────────────────────────────────────────
{
  const c = buildChain('SPY', SPOT, IV, exps[3]);
  check('call deltas are 0…1 and put deltas −1…0',
    c.rows.every(r => r.call.delta >= 0 && r.call.delta <= 1 && r.put.delta >= -1 && r.put.delta <= 0));
  const atm = c.rows.find(r => r.atm)!;
  check('ATM delta sits near ±0.5', Math.abs(atm.call.delta - 0.5) < 0.12 && Math.abs(atm.put.delta + 0.5) < 0.12,
    `${atm.call.delta} / ${atm.put.delta}`);
  check('deep ITM calls approach delta 1', c.rows[0].call.delta > 0.9, String(c.rows[0].call.delta));
  check('bid never exceeds ask', c.rows.every(r => r.call.bid <= r.call.ask && r.put.bid <= r.put.ask));
  check('bids never go negative', c.rows.every(r => r.call.bid >= 0 && r.put.bid >= 0));
  check('ITM is a fact about spot, not a guess',
    c.rows.every(r => r.call.itm === (r.strike < SPOT) && r.put.itm === (r.strike > SPOT)));
  check('exactly one ATM row', c.rows.filter(r => r.atm).length === 1);
  check('strike spacing matches the price', strikeStep(500) === 5 && strikeStep(150) === 2.5 && strikeStep(40) === 1);
}

// ── 8. determinism ────────────────────────────────────────────────────────
{
  const a = buildChain('SPY', SPOT, IV, exps[2]);
  const b = buildChain('SPY', SPOT, IV, exps[2]);
  check('the same book builds the same twice', JSON.stringify(a) === JSON.stringify(b));
  const q = buildChain('QQQ', SPOT, IV, exps[2]);
  check('and a different ticker is a different book', JSON.stringify(q.rows) !== JSON.stringify(a.rows));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
