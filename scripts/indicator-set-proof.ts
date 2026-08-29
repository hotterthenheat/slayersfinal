import type { Candle } from '../src/types/market';
import {
  stochasticSeries, stochRsiSeries, adxSeries, obvSeries, cciSeries,
  williamsRSeries, mfiSeries, keltnerSeries, donchianSeries, supertrendSeries,
  rocSeries, aroonSeries, cmfSeries, parabolicSarSeries, atrBarSeries,
} from '../src/data/indicators';

/*
==================================================
  SLAYER TERMINAL - THE SECOND INDICATOR SET (proof)
==================================================

  WHY THESE ASSERTIONS AND NOT "IT RETURNED AN ARRAY". Every formula here
  type-checks whether or not it is correct, and a wrong indicator does not
  crash — it draws a plausible line that turns at roughly the right places
  and is quietly wrong forever. That is the exact shape of the vol bug this
  build already shipped once, where percent was passed where a decimal was
  wanted and every far-dated greek came back a clean, believable ZERO.

  So each indicator is held to a property that is FALSE if the maths is
  wrong: bounded oscillators must stay inside their bounds on adversarial
  input; Donchian must equal the rolling max/min exactly; OBV must equal
  cumulative signed volume; ROC must match hand arithmetic; Supertrend must
  ratchet; SAR must never be placed inside a bar it would already have been
  stopped out by; ADX must rise on a trend and fall on chop.

  THE FIXTURES ARE SHAPED, NOT RANDOM. A random walk hides directional bugs
  (a sign error averages out over noise), so the series here are a clean
  uptrend, a clean downtrend, a flat line and a sawtooth — each chosen so
  the right answer is known in advance rather than merely self-consistent.
*/

let failed = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL ${m}`); };
const t = (cond: boolean, m: string) => (cond ? ok(m) : bad(m));
const head = (m: string) => console.log(`\n${m}\n`);

const bar = (i: number, o: number, h: number, l: number, c: number, v = 1000): Candle =>
  ({ time: 1_700_000_000 + i * 60, open: o, high: h, low: l, close: c, volume: v });

/** A clean uptrend: every bar higher than the last. */
const up: Candle[] = Array.from({ length: 80 }, (_, i) =>
  bar(i, 100 + i, 100 + i + 0.6, 100 + i - 0.4, 100 + i + 0.5));
/** A clean downtrend. */
const down: Candle[] = Array.from({ length: 80 }, (_, i) =>
  bar(i, 200 - i, 200 - i + 0.4, 200 - i - 0.6, 200 - i - 0.5));
/** Dead flat — every bounded oscillator's divide-by-zero case. */
const flat: Candle[] = Array.from({ length: 80 }, (_, i) => bar(i, 50, 50, 50, 50));
/* CLOSES EXACTLY AT THE HIGH, every bar. The trend fixtures above close
   0.1 BELOW their high, which is realistic and makes "%K pins at 100"
   false — the first cut of this proof asserted that anyway and failed
   itself, not the indicator. A pinning assertion needs a fixture that
   actually pins, so here is one; the same series gives Williams %R its 0. */
const upMarubozu: Candle[] = Array.from({ length: 80 }, (_, i) =>
  bar(i, 100 + i - 1, 100 + i, 100 + i - 1, 100 + i));
const downMarubozu: Candle[] = Array.from({ length: 80 }, (_, i) =>
  bar(i, 200 - i + 1, 200 - i + 1, 200 - i, 200 - i));
/** Sawtooth chop: no trend, plenty of range. */
const chop: Candle[] = Array.from({ length: 80 }, (_, i) => {
  const c = 100 + (i % 2 === 0 ? 1 : -1);
  return bar(i, 100, c + 0.5, c - 0.5, c);
});

const finite = (xs: readonly (number | null)[]) =>
  xs.filter((v): v is number => v !== null);
const within = (xs: readonly (number | null)[], lo: number, hi: number) =>
  finite(xs).every(v => Number.isFinite(v) && v >= lo && v <= hi);
const last = (xs: readonly (number | null)[]) => {
  const f = finite(xs);
  return f[f.length - 1];
};

/* ── bounded oscillators ────────────────────────────────────────────── */
head('the bounded oscillators stay inside their bounds');

const stochUp = stochasticSeries(up);
t(within(stochUp.k, 0, 100) && within(stochUp.d, 0, 100), 'Stochastic %K and %D are inside 0-100');
t(last(stochasticSeries(upMarubozu).k) === 100, 'and %K pins at 100 when every close IS the new high');
t(last(stochasticSeries(downMarubozu).k) === 0, 'and at 0 when every close is the new low');
t((last(stochUp.k) as number) > 90, 'and reads high — but under 100 — when the close sits just below its high');
t(finite(stochasticSeries(flat).k).every(v => v === 50), 'a flat range reads 50, not NaN — no divide by zero');

t(within(stochRsiSeries(up).k, 0, 100), 'StochRSI is inside 0-100');
t(within(williamsRSeries(up), -100, 0), 'Williams %R is inside -100..0');
t(last(williamsRSeries(upMarubozu)) === 0, 'and reads 0 when the close IS the range high');
t(last(williamsRSeries(downMarubozu)) === -100, 'and -100 when it is the range low');
t(within(mfiSeries(up), 0, 100), 'MFI is inside 0-100');
t(last(mfiSeries(up)) === 100, 'and reads 100 when every bar is an up-bar');
t(within(cmfSeries(up), -1, 1), 'CMF is inside -1..1');
t(finite(cmfSeries(flat)).every(v => v === 0), 'a zero-range bar contributes 0 to CMF, not NaN');
t(within(aroonSeries(up).up, 0, 100) && within(aroonSeries(up).down, 0, 100), 'Aroon up and down are inside 0-100');
t(last(aroonSeries(up).up) === 100, 'and Aroon-up is 100 when the newest bar IS the high');

/* ── exact identities ───────────────────────────────────────────────── */
head('the ones with an exact answer match it, not merely track it');

const don = donchianSeries(up, 20);
{
  const i = 60;
  let hh = -Infinity, ll = Infinity;
  for (let k = i - 19; k <= i; k++) { hh = Math.max(hh, up[k].high); ll = Math.min(ll, up[k].low); }
  t(don.upper[i] === hh && don.lower[i] === ll, 'Donchian equals the rolling max high and min low exactly');
  t(don.middle[i] === (hh + ll) / 2, 'and its middle is their midpoint');
}

{
  const obv = obvSeries(up);
  /* Every bar rises, so OBV is cumulative volume from bar 1. */
  t(obv[79] === 79 * 1000, 'OBV equals cumulative signed volume on a pure uptrend');
  t(obvSeries(down)[79] === -79 * 1000, 'and its negation on a pure downtrend');
  t(obvSeries(flat)[79] === 0, 'an unchanged close adds nothing — flat OBV, not drift');
}

{
  const roc = rocSeries(up, 10);
  const i = 40;
  const expect = ((up[i].close - up[i - 10].close) / up[i - 10].close) * 100;
  t(Math.abs((roc[i] as number) - expect) < 1e-9, 'ROC matches hand arithmetic');
}

/* ── the ones with structure ────────────────────────────────────────── */
head('the structural ones hold their structure');

{
  const k = keltnerSeries(up);
  const i = 60;
  t((k.upper[i] as number) > (k.middle[i] as number) && (k.middle[i] as number) > (k.lower[i] as number),
    'Keltner upper > middle > lower');
  const atr = atrBarSeries(up, 10)[i] as number;
  t(Math.abs(((k.upper[i] as number) - (k.middle[i] as number)) - atr * 2) < 1e-9,
    'and its shoulders are exactly ATR x multiplier — ATR, not standard deviation');
}

{
  const st = supertrendSeries(up);
  const idx = st.dir.map((d, i) => (d === 1 ? i : -1)).filter(i => i >= 0);
  let ratchets = true;
  for (let j = 1; j < idx.length; j++) {
    const a = st.line[idx[j - 1]] as number;
    const b = st.line[idx[j]] as number;
    /* Within one continuous up-leg the stop may never fall. */
    if (st.dir[idx[j] - 1] === 1 && b < a - 1e-9) ratchets = false;
  }
  t(ratchets, 'Supertrend RATCHETS — the stop never loosens inside an up-leg');
  t(finite(st.dir).every(d => d === 1 || d === -1), 'and its direction is only ever +1 or -1');
  t((last(supertrendSeries(up).dir)) === 1, 'it reads long on a clean uptrend');
  t((last(supertrendSeries(down).dir)) === -1, 'and short on a clean downtrend');
}

{
  const sar = parabolicSarSeries(up);
  let inside = 0;
  for (let i = 2; i < up.length; i++) {
    const s = sar[i];
    if (s === null) continue;
    /* On a long, the SAR must sit at or below the prior two lows: a stop
       placed above them was already touched before it was placed. */
    if (s > Math.min(up[i - 1].low, up[i - 2].low) + 1e-9) inside++;
  }
  t(inside === 0, 'Parabolic SAR is never placed inside the two bars it trails');
  const flips = parabolicSarSeries(chop);
  t(finite(flips).length > 0, 'and it produces a series on choppy input');
}

/* ── ADX: strength, not direction ───────────────────────────────────── */
head('ADX measures strength and the DIs carry the direction');

{
  const a = adxSeries(up);
  t(within(a.adx, 0, 100) && within(a.plusDi, 0, 100) && within(a.minusDi, 0, 100),
    'ADX, +DI and -DI are all inside 0-100');
  t((last(a.plusDi) as number) > (last(a.minusDi) as number), '+DI is above -DI on an uptrend');
  const d = adxSeries(down);
  t((last(d.minusDi) as number) > (last(d.plusDi) as number), 'and -DI is above +DI on a downtrend');
  /* THE LOAD-BEARING ONE: ADX is directionless. A trend either way must
     read stronger than chop, or the indicator is measuring the wrong thing. */
  const trendAdx = last(a.adx) as number;
  const chopAdx = last(adxSeries(chop).adx) as number;
  t(trendAdx > chopAdx, `a trend reads stronger than chop (${trendAdx.toFixed(1)} vs ${chopAdx.toFixed(1)})`);
  t(Math.abs((last(adxSeries(down).adx) as number) - trendAdx) < 25,
    'and an up-trend and a down-trend read comparably strong — ADX has no sign');
}

/* ── CCI ────────────────────────────────────────────────────────────── */
head('CCI sits where price sits relative to its own mean');

{
  const c = cciSeries(up);
  t((last(c) as number) > 0, 'CCI is positive when price is above its mean');
  t((last(cciSeries(down)) as number) < 0, 'and negative below it');
  t(finite(cciSeries(flat)).every(v => v === 0), 'a flat series has no deviation to divide by — 0, not NaN');
}

/* ── the shared contract ────────────────────────────────────────────── */
head('every series obeys the same alignment contract');

const ALL: Array<[string, (number | null)[]]> = [
  ['stochastic %K', stochUp.k], ['stochastic %D', stochUp.d], ['stochRSI', stochRsiSeries(up).k],
  ['ADX', adxSeries(up).adx], ['+DI', adxSeries(up).plusDi], ['CCI', cciSeries(up)],
  ['Williams %R', williamsRSeries(up)], ['MFI', mfiSeries(up)], ['CMF', cmfSeries(up)],
  ['Keltner upper', keltnerSeries(up).upper], ['Donchian upper', donchianSeries(up).upper],
  ['Supertrend', supertrendSeries(up).line], ['ROC', rocSeries(up)], ['Aroon up', aroonSeries(up).up],
  ['SAR', parabolicSarSeries(up)],
];
for (const [name, series] of ALL) {
  t(series.length === up.length, `${name} is bar-aligned (${series.length} of ${up.length})`);
}
t(ALL.every(([, s]) => finite(s).every(Number.isFinite)), 'and no series contains NaN or Infinity');
/* Warm-up is null, never 0 — most of these cross zero legitimately, so a
   zero-filled warm-up would invent signal where there is none. */
t(cciSeries(up).slice(0, 5).every(v => v === null), 'warm-up is null and not 0, which would be a real reading');

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failing\n`);
process.exit(failed === 0 ? 0 : 1);
