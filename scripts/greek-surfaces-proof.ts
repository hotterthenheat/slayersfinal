/*
  Acceptance test for P-12/P-13/P-14's surfaces — the five higher greeks
  aggregated to dealer exposure by strike.

  The engine underneath is already proved against finite differences
  (higher-greeks-proof). What THIS file guards is the boundary, which is
  where five new greeks become five new chances to flip a sign nobody
  notices or to rescale a number twice:

  1. The house dealer sign is the one every other surface uses — the call
     side carries the negative — and it is not re-decided per lens
  2. Exposure scales with open interest and with the contract multiplier
  3. THE UNIT CONVERSION HAPPENS EXACTLY ONCE: vol lenses are per POINT and
     clock lenses per TRADING DAY, each exactly the raw partial divided by
     its own constant — so a second rescale anywhere fails here
  4. Rows descend by strike like every other ladder, and the bar scale is
     the largest |net|
  5. Every lens has a label, a unit and a question — a number whose unit is
     not on screen cannot be read
  6. The book read is signed correctly per lens, and vomma's negative case
     says the thing that matters
  7. Degenerate books produce an empty surface, not a throw
*/
import { buildGreekSurface, surfaceWords, GREEK_LENSES, LENS_META } from '../src/data/greekSurfaces';
import { higherGreeks, perDay, perVolPoint, CONTRACT_MULTIPLIER, TRADING_DAYS } from '../src/core/higherGreeks';
import type { StrikeNode } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(a), Math.abs(b));

const node = (strike: number, callOI: number, putOI: number): StrikeNode =>
  ({ strike, callOI, putOI, netGex: 0 } as unknown as StrikeNode);

const SPOT = 500, IV = 0.2, T = 1 / 12;

// ── 1+2+3. the boundary: sign, scale, and the ONE conversion ──────────────
{
  const chain = [node(505, 1_000, 0)];
  for (const lens of GREEK_LENSES) {
    const s = buildGreekSurface(chain, SPOT, IV, lens, T);
    const g = higherGreeks(SPOT, 505, T, IV);
    /* The expected per-contract figure, converted here independently of the
       implementation — this is what makes a double-rescale detectable. */
    const expected =
      lens === 'color' || lens === 'veta'
        ? g[lens] / TRADING_DAYS
        : lens === 'vomma' || lens === 'zomma'
          ? g[lens] / 100
          : g.speed;
    const want = expected * 1_000 * CONTRACT_MULTIPLIER * -1; // call side, house sign
    check(`${lens}: the call side carries the house NEGATIVE sign, scaled once`, close(s.rows[0].call, want), `${s.rows[0].call} vs ${want}`);
  }

  /* Put side takes the opposite sign. */
  const puts = buildGreekSurface([node(505, 0, 1_000)], SPOT, IV, 'vomma', T);
  const calls = buildGreekSurface([node(505, 1_000, 0)], SPOT, IV, 'vomma', T);
  check('the put side is the exact opposite of the call side', close(puts.rows[0].put, -calls.rows[0].call), `${puts.rows[0].put} vs ${-calls.rows[0].call}`);
  check('and net is call + put', close(calls.rows[0].net, calls.rows[0].call + calls.rows[0].put));

  /* Scale with OI. */
  const doubled = buildGreekSurface([node(505, 2_000, 0)], SPOT, IV, 'color', T);
  const single = buildGreekSurface([node(505, 1_000, 0)], SPOT, IV, 'color', T);
  check('doubling open interest doubles the exposure', close(doubled.rows[0].net, single.rows[0].net * 2));

  /* The helpers agree with the divisors asserted above — so a change to one
     constant cannot pass by changing both sides of the same equation. */
  const g = higherGreeks(SPOT, 505, T, IV);
  check('perDay divides by the TRADING year', close(perDay(g.color), g.color / 252) && TRADING_DAYS === 252);
  check('perVolPoint divides by 100', close(perVolPoint(g.vomma), g.vomma / 100));
}

// ── 4. shape ──────────────────────────────────────────────────────────────
{
  const chain = [node(495, 900, 900), node(505, 1_000, 400), node(500, 2_000, 2_000)];
  const s = buildGreekSurface(chain, SPOT, IV, 'color', T);
  check('rows descend by strike', s.rows.every((r, i, a) => i === 0 || r.strike < a[i - 1].strike), s.rows.map(r => r.strike).join(','));
  check('the bar scale is the largest |net|', close(s.maxAbs, Math.max(...s.rows.map(r => Math.abs(r.net)))));
  check('the book total is the rows summed', close(s.net, s.rows.reduce((a, r) => a + r.net, 0)));
}

// ── 5. every lens is legible ──────────────────────────────────────────────
{
  check('every lens has a label, a unit and a question', GREEK_LENSES.every(l => {
    const m = LENS_META[l];
    return m && m.label.length > 0 && m.unit.length > 0 && m.question.length > 20;
  }));
  check('the vol lenses say per POINT', /point/.test(LENS_META.vomma.unit) && /point/.test(LENS_META.zomma.unit));
  check('the clock lenses say per DAY', /day/.test(LENS_META.color.unit) && /day/.test(LENS_META.veta.unit));
  check('and speed says per dollar', /\$1/.test(LENS_META.speed.unit));
}

// ── 6. the book read ──────────────────────────────────────────────────────
{
  /* Force a negative net vomma book — the regime that matters. */
  const chain = [node(600, 5_000, 0), node(400, 5_000, 0)];
  const s = buildGreekSurface(chain, SPOT, IV, 'vomma', T);
  const words = surfaceWords(s);
  check(
    'a negative net vomma book names the self-feeding vol regime',
    s.net < 0 ? /feeds on itself/.test(words) : /damps a spike/.test(words),
    `net ${s.net.toExponential(3)} — ${words.slice(0, 70)}`
  );
  check('every lens produces a sentence', GREEK_LENSES.every(l => surfaceWords(buildGreekSurface(chain, SPOT, IV, l, T)).length > 30));
}

// ── 7. degenerate ─────────────────────────────────────────────────────────
{
  check('an empty chain is an empty surface', buildGreekSurface([], SPOT, IV, 'color', T).rows.length === 0);
  check('no vol is an empty surface, not a throw', buildGreekSurface([node(500, 1, 1)], SPOT, 0, 'color', T).rows.length === 0);
  check('and it says there is no book', surfaceWords(buildGreekSurface([], SPOT, IV, 'color', T)) === 'No book to read');
  check('a strike with no OI carries no exposure', buildGreekSurface([node(500, 0, 0)], SPOT, IV, 'color', T).rows[0].net === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
