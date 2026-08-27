/*
  Acceptance test for T-9's expected-move cone. Runs the ACTUAL engine against
  staged sessions where every width is computable by hand.

  Proves:
  1. The envelope is √t: four times the elapsed time doubles the width, and a
     full YEAR_MINUTES of elapsed time yields exactly S·σ — the annual claim
  2. Zero width at the open, symmetric about it, and ±2σ is exactly twice ±1σ
  3. Crossings are TRANSITIONS of the close across ±1σ: the first bar never
     marks one (a zero-width band at the open is degenerate, not an exit),
     staying outside marks once, re-entry re-arms, and the marked edge is the
     band's own edge at that bar with the direction of the exit
  4. The forward cone re-anchors at the LAST close, follows the same √t, lands
     its tip exactly ON the bell (fractional remainders included), and
     collapses to a single zero-width point when nothing remains
  5. Degenerate inputs — no bars, no vol, a broken open — yield EMPTY, never
     a cone invented from nothing
*/
import { buildExpectedMoveCone } from '../src/data/expectedMove';
import { YEAR_MINUTES } from '../src/data/measure';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000;
/** A staged 1-minute bar i minutes after the open. Only time/open/close matter here. */
const bar = (i: number, close: number, open = close): Candle => ({
  time: T0 + i * 60, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 0,
});
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── 1. the envelope is √t ─────────────────────────────────────────────────
{
  const bars = [bar(0, 100), bar(1, 100), bar(4, 100), bar(YEAR_MINUTES, 100)];
  const cone = buildExpectedMoveCone(bars, 0.25, 0);
  const w = (i: number) => cone.past[i].up1 - 100;
  check('PREMISE: four staged bars produce four envelope points', cone.past.length === 4);
  check('4× the elapsed time is 2× the width', near(w(2), 2 * w(1)), `${w(2).toFixed(6)} vs 2×${w(1).toFixed(6)}`);
  check('a full trading year of elapsed time claims exactly S·σ', near(w(3), 100 * 0.25), w(3).toFixed(6));
}

// ── 2. anchored at the open, symmetric, 2σ = 2·1σ ─────────────────────────
{
  const bars = [bar(0, 500.4, 500), bar(9, 501), bar(16, 499)];
  const cone = buildExpectedMoveCone(bars, 0.2, 0);
  const p0 = cone.past[0];
  check('zero width at the open — both edges ARE the open print', p0.up1 === 500 && p0.dn1 === 500 && p0.up2 === 500 && p0.dn2 === 500);
  check('the anchor is the OPEN of the first bar, not its close', cone.openPrice === 500 && cone.openTime === T0);
  const p = cone.past[2];
  check('symmetric about the open', near(p.up1 - 500, 500 - p.dn1) && near(p.up2 - 500, 500 - p.dn2));
  check('±2σ is exactly twice ±1σ', near(p.up2 - 500, 2 * (p.up1 - 500)));
}

// ── 3. crossings are transitions ──────────────────────────────────────────
{
  /* iv chosen so the 1σ width at t minutes is exactly √t dollars:
     100·iv·√(t/YEAR_MINUTES) = √t  ⇒  iv = √YEAR_MINUTES / 100. */
  const iv = Math.sqrt(YEAR_MINUTES) / 100;
  const w = (t: number) => Math.sqrt(t); // the band's half-width by hand

  /* Leaves at bar 2, stays out at 3, back inside at 4, leaves DOWN at 6. */
  const bars = [
    bar(0, 100), //                         inside (zero width, close == open)
    bar(1, 100.5), //                       inside: |0.5| < w(1)=1
    bar(2, 100 + w(2) + 0.01), //           exit up — the crossing
    bar(3, 100 + w(3) + 0.01), //           still out — no second mark
    bar(4, 100), //                         re-entry re-arms
    bar(5, 100.3), //                       inside
    bar(6, 100 - w(6) - 0.01), //           exit down — second crossing
  ];
  const cone = buildExpectedMoveCone(bars, iv, 0);
  check('two exits mark exactly two crossings', cone.crossings.length === 2, cone.crossings.map(c => c.dir).join(','));
  const [c1, c2] = cone.crossings;
  check('the first is the bar-2 exit, upward, ON the band edge', c1.time === T0 + 120 && c1.dir === 'up' && near(c1.edge, 100 + w(2)), `edge ${c1.edge?.toFixed(4)}`);
  check('the second is the bar-6 exit, downward', c2.time === T0 + 360 && c2.dir === 'down' && near(c2.edge, 100 - w(6)));

  /* A session that GAPS outside on its first print: the zero-width band at
     the open makes "outside" degenerate there, so bar 0 counts as inside and
     the first real bar still outside IS the exit. */
  const gapped = buildExpectedMoveCone([bar(0, 103, 100), bar(1, 103)], iv, 0);
  check('a gap-open session still marks its exit at the first real bar', gapped.crossings.length === 1 && gapped.crossings[0].time === T0 + 60, `${gapped.crossings.length} marked`);

  /* And one that never leaves marks nothing. */
  const quiet = buildExpectedMoveCone([bar(0, 100), bar(1, 100.2), bar(2, 100.4)], iv, 0);
  check('a session that never leaves the band marks nothing', quiet.crossings.length === 0);
}

// ── 4. the forward cone ───────────────────────────────────────────────────
{
  const iv = 0.2;
  const bars = [bar(0, 100), bar(1, 104)]; // spot re-anchors at 104
  const cone = buildExpectedMoveCone(bars, iv, 30);
  const tip = cone.forward[cone.forward.length - 1];
  check('the forward cone re-anchors at the LAST close', cone.forward[0].up1 === 104 && cone.forward[0].dn1 === 104);
  check('its tip lands exactly ON the bell', tip.minutesAhead === 30);
  check('and claims spot·σ·√(remaining/year)', near(tip.up1 - 104, 104 * iv * Math.sqrt(30 / YEAR_MINUTES)));
  const at4 = cone.forward.find(p => p.minutesAhead === 4);
  const at1 = cone.forward.find(p => p.minutesAhead === 1);
  check('forward width follows the same √t', at4 !== undefined && at1 !== undefined && near(at4.up1 - 104, 2 * (at1.up1 - 104)));

  /* A fractional remainder — 12.5 minutes on 5-minute bars — still puts the
     tip on the bell, not one stride short of it. */
  const frac = buildExpectedMoveCone(bars, iv, 12.5, 5);
  const fTip = frac.forward[frac.forward.length - 1];
  check('a fractional remainder still tips on the bell (12.5m on 5m bars)', fTip.minutesAhead === 12.5, String(fTip.minutesAhead));
  check('with the stride points before it', frac.forward.map(p => p.minutesAhead).join(',') === '0,5,10,12.5');

  /* Less than one stride left: the loop alone would leave only the anchor. */
  const sliver = buildExpectedMoveCone(bars, iv, 3, 15);
  check('less than one bar left still reaches the bell', sliver.forward.length === 2 && sliver.forward[1].minutesAhead === 3);

  /* The bell itself: the claim collapses to a zero-width point at spot —
     correct behaviour on 0DTE, not a bug (the directive's own failure mode). */
  const bell = buildExpectedMoveCone(bars, iv, 0);
  check('at the bell the forward cone is one zero-width point at spot', bell.forward.length === 1 && bell.forward[0].up1 === 104 && bell.forward[0].dn2 === 104);
}

// ── 5. degenerate inputs are EMPTY, not invented ──────────────────────────
{
  const none = buildExpectedMoveCone([], 0.2, 60);
  check('no bars yields the empty cone', none.past.length === 0 && none.forward.length === 0 && none.openTime === null);
  const noVol = buildExpectedMoveCone([bar(0, 100)], 0, 60);
  const nanVol = buildExpectedMoveCone([bar(0, 100)], NaN, 60);
  check('zero or unquoted vol yields the empty cone', noVol.past.length === 0 && nanVol.past.length === 0);
  const brokenOpen = buildExpectedMoveCone([bar(0, 100, 0)], 0.2, 60);
  check('a broken open print yields the empty cone', brokenOpen.past.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
