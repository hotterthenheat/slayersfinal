import {
  SUB_PANE_SPEC, subPaneLegend, OSC_LEVELS, OSC_BOUNDS, SUB_PANE_ORDER,
  INDICATOR_PANE_KIND,
} from '../src/components/gex/StrikeChart';
import type { ChartIndicators } from '../src/components/gex/StrikeChart';
import {
  rsiSeries, stochasticSeries, stochRsiSeries, adxSeries, cciSeries,
  williamsRSeries, mfiSeries, cmfSeries, rocSeries, aroonSeries, macdSeries,
} from '../src/data/indicators';
import type { Candle } from '../src/types/market';

/*
==================================================
  SLAYER TERMINAL - SUB-PANE LEGENDS AND RAILS (proof)
==================================================

  TWO FAILURES, AND NEITHER OF THEM THROWS.

  A LEGEND THAT LIES. The band says "RSI 14" and the series was built with a
  different period. Nothing crashes, nothing looks wrong, and the reader is
  told a number that is not the one on screen. That used to be possible
  because the string and the call site each held their own literal; the spec
  is now the single source, so this file's job is to hold the rest — that
  every sub-pane HAS a legend, that no overlay has one, and that the periods
  are the conventional defaults a reader arriving from another terminal
  expects rather than whatever was typed.

  A RAIL OUTSIDE ITS OWN OSCILLATOR. This is the one that nearly happened.
  Williams %R runs 0 down to -100 — the stochastic's mirror — so copying the
  stochastic's 20/80 onto it draws two lines the series can never reach. The
  pane renders perfectly: two rails at the top of an empty region and a line
  that never goes near them. So every declared level is checked against the
  range its OWN function actually produces, on a fixture built to saturate
  it, rather than against a range asserted here.
*/

let failed = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL ${m}`); };
const t = (c: boolean, m: string) => (c ? ok(m) : bad(m));
const head = (m: string) => console.log(`\n${m}\n`);

/*
  A FIXTURE WITH THREE REGIMES, and each one is there for a reason.

  A clean rally and a clean selloff SATURATE the bounded oscillators: a
  random walk leaves a stochastic hovering mid-range, and a rail outside the
  range would pass unnoticed against it.

  The CHOP between them is for the ADX, and it was added because this proof
  caught its own fixture. Two clean legs never let a trend-strength reading
  fall — ADX bottomed at 48.6 — so the 20 and 25 rails read as unreachable
  when they are the two numbers that pane exists to be read against. A
  fixture that only trends cannot say anything about a rail below a trend.
*/
const fixture = (): Candle[] => {
  /* Deterministic, and irregular on purpose. The first cut chopped by
     alternating +0.5/-0.5 with a fixed wick, which makes every bar's LOW
     identical — so Wilder's downMove is zero on every bar of the chop,
     -DI collapses to zero, and DX pins at 100. The pane was fine; the
     fixture was a straight line wearing a zigzag. Irregular steps and
     irregular wicks are what a chop actually is. */
  let seed = 20260829;
  const u = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < 310; i++) {
    const drift = i < 90 ? 0.75 + u() * 0.3 : i < 220 ? (u() - 0.5) * 2.2 : -(0.75 + u() * 0.3);
    const open = price;
    price += drift;
    const close = price;
    const wick = 0.08 + u() * 0.4;
    out.push({
      time: 1_700_000_000 + i * 60,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - (0.08 + u() * 0.4),
      close,
      volume: 800 + Math.round(u() * 900),
    });
  }
  return out;
};

const BARS = fixture();
const live = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null && Number.isFinite(v));

/* ── the legends ─────────────────────────────────────────────────────── */
head('every band names itself, and only the bands do');

const subKeys = (Object.keys(INDICATOR_PANE_KIND) as (keyof ChartIndicators)[])
  .filter(k => INDICATOR_PANE_KIND[k] === 'sub');
t(subKeys.length >= 13, `PREMISE: there are sub-pane indicators to label — ${subKeys.length}`);

const missing = subKeys.filter(k => !subPaneLegend(k));
t(missing.length === 0, `every sub-pane carries a legend${missing.length ? ` — missing ${missing.join(', ')}` : ''}`);

const strays = (Object.keys(SUB_PANE_SPEC) as (keyof ChartIndicators)[])
  .filter(k => INDICATOR_PANE_KIND[k] !== 'sub');
t(strays.length === 0, `and no OVERLAY carries one${strays.length ? ` — ${strays.join(', ')}` : ''}`);

t(SUB_PANE_ORDER.length === subKeys.length && SUB_PANE_ORDER.every(k => subKeys.includes(k)),
  `the allocation order covers exactly the sub-pane set — ${SUB_PANE_ORDER.length} of ${subKeys.length}`);

head('the legend renders the periods it was given');

t(subPaneLegend('rsi') === 'RSI 14', `rsi reads "${subPaneLegend('rsi')}"`);
t(subPaneLegend('stochRsi') === 'Stoch RSI 14 14 3 3', `stochRsi reads "${subPaneLegend('stochRsi')}"`);
/* OBV takes no period, and "OBV 0" or a trailing space would both be wrong. */
t(subPaneLegend('obv') === 'OBV', `a period-less indicator prints its bare name — "${subPaneLegend('obv')}"`);
t(subPaneLegend('ema9') === null, 'an overlay has no legend at all');

head('the periods are the conventional defaults, not whatever was typed');

const EXPECTED: Partial<Record<keyof ChartIndicators, number[]>> = {
  rsi: [14], macd: [12, 26, 9], atrPane: [14], stoch: [14, 3, 3],
  stochRsi: [14, 14, 3, 3], adx: [14], cci: [20], williamsR: [14],
  mfi: [14], obv: [], cmf: [20], roc: [12], aroon: [25],
};
for (const k of subKeys) {
  const got = SUB_PANE_SPEC[k]?.params ?? null;
  const want = EXPECTED[k];
  t(!!got && !!want && got.length === want.length && got.every((v, i) => v === want[i]),
    `${k}: ${JSON.stringify(got)}`);
}

/* ── the rails ───────────────────────────────────────────────────────── */
head('every rail sits inside the range its own oscillator produces');

/* Computed, not asserted: each entry runs the SHIPPING function with the
   SHIPPING periods, so a rail is checked against the numbers the pane will
   actually draw. */
const p = (k: keyof ChartIndicators) => SUB_PANE_SPEC[k]!.params;
const OBSERVED: Partial<Record<keyof ChartIndicators, number[]>> = {
  rsi: live(rsiSeries(BARS, p('rsi')[0])),
  stoch: live(stochasticSeries(BARS, p('stoch')[0], p('stoch')[1], p('stoch')[2]).k),
  stochRsi: live(stochRsiSeries(BARS, p('stochRsi')[0], p('stochRsi')[1], p('stochRsi')[2], p('stochRsi')[3]).k),
  adx: live(adxSeries(BARS, p('adx')[0]).adx),
  cci: live(cciSeries(BARS, p('cci')[0])),
  williamsR: live(williamsRSeries(BARS, p('williamsR')[0])),
  mfi: live(mfiSeries(BARS, p('mfi')[0])),
  cmf: live(cmfSeries(BARS, p('cmf')[0])),
  roc: live(rocSeries(BARS, p('roc')[0])),
  aroon: live(aroonSeries(BARS, p('aroon')[0]).up),
  macd: live(macdSeries(BARS, p('macd')[0], p('macd')[1], p('macd')[2]).macd),
};

for (const [key, levels] of Object.entries(OSC_LEVELS) as [keyof ChartIndicators, { price: number }[]][]) {
  const obs = OBSERVED[key];
  if (!obs || obs.length === 0) { bad(`${key}: PREMISE — the fixture produced no values to check against`); continue; }
  const lo = Math.min(...obs);
  const hi = Math.max(...obs);
  /* A rail must be a line the series can REACH. Outside the observed span
     it is decoration in an empty region — which is exactly what 20/80 on a
     0..-100 oscillator would have been. */
  const outside = levels.filter(l => l.price < lo - 1e-9 || l.price > hi + 1e-9);
  t(outside.length === 0,
    `${key}: rails ${levels.map(l => l.price).join('/')} all fall inside its own ${lo.toFixed(1)}..${hi.toFixed(1)}`);
}

head('and the bounded oscillators really are bounded where the rails assume');

/* THE SHIPPING TABLE, not a copy of it. `OSC_BOUNDS` is what the pane's
   axis is actually pinned to, so pinning Williams %R to 0..100 — the shape
   of the mistake this file exists to catch — fails here rather than
   printing an axis the series can never reach. */
for (const [key, [lo, hi]] of Object.entries(OSC_BOUNDS) as [keyof ChartIndicators, [number, number]][]) {
  const obs = OBSERVED[key];
  if (!obs || obs.length === 0) { bad(`${key}: PREMISE — no values to check the pinned axis against`); continue; }
  t(obs.every(v => v >= lo - 1e-9 && v <= hi + 1e-9),
    `${key} is pinned to ${lo}..${hi} and every value it produces fits — ${Math.min(...obs).toFixed(1)}..${Math.max(...obs).toFixed(1)}`);
  /* And the pin must not be so wide it is meaningless: a 0..1e6 range on an
     oscillator would pass the test above and draw a flat line. */
  t(hi - lo <= 200, `${key}: and the pin is tight enough to read — span ${hi - lo}`);
}
/* An unbounded indicator must NOT be pinned — a fixed ceiling on a CCI or a
   MACD is an invented one, and the series would clip against it. */
for (const k of ['cci', 'macd', 'roc', 'obv', 'atrPane'] as (keyof ChartIndicators)[]) {
  t(!OSC_BOUNDS[k], `${k} is left to autoscale — it has no real ceiling to pin`);
}
/* The fixture has to actually push a stochastic to its ends, or "inside the
   observed range" is a claim about a narrow band rather than about the
   oscillator. */
{
  const st = OBSERVED.stoch!;
  t(Math.max(...st) > 95 && Math.min(...st) < 5,
    `PREMISE: the fixture saturates the stochastic — ${Math.min(...st).toFixed(1)}..${Math.max(...st).toFixed(1)}`);
  const wr = OBSERVED.williamsR!;
  t(Math.min(...wr) < -90, `and drives Williams %R to its floor — ${Math.min(...wr).toFixed(1)}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failing\n`);
process.exit(failed === 0 ? 0 : 1);
