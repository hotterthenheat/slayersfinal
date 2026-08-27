/*
  Acceptance test for the multi-timeframe confluence strip (T-12) and for the
  two indicator curves it and the tape now share. Runs the ACTUAL modules —
  no browser, no React, no chart.

  Proves:
  1. The EMA and VWAP are the SAME numbers the tape draws — asserted against
     the formulas as they were written inside StrikeChart, so the extraction
     cannot have moved a line
  2. VWAP re-anchors at a session gap, and `barMinutes` is what decides where
     a gap is
  3. The rule is the whole rule: above both is up, below both is down, one of
     each is flat — with no threshold anywhere
  4. Too little history is `null`, never `flat` — a strip that reports a
     measurement it did not make is worse than one that says so
  5. Every timeframe in the strip gets a row, in the strip's order
*/
import {
  CONFLUENCE_EMA,
  CONFLUENCE_TFS,
  TREND_GLYPH,
  buildConfluence,
  trendWords,
} from '../src/data/confluence';
import { emaSeries, emaWarmup, vwapSeries } from '../src/data/indicators';
import { aggregateCandles, tfMinutes } from '../src/data/timeframe';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000; // a fixed epoch — nothing here reads a clock

/** `n` one-minute bars walking from `from` to `to`, with volume. */
const ramp = (n: number, from: number, to: number, vol = 1000, start = T0): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = n === 1 ? to : from + ((to - from) * i) / (n - 1);
    return { time: start + i * 60, open: c, high: c + 0.05, low: c - 0.05, close: c, volume: vol };
  });

// ── 1. the curves are the ones the tape drew ──────────────────────────────
/*
  The reference implementations, transcribed from StrikeChart's indicator
  effect exactly as it stood before the extraction. If `data/indicators.ts`
  ever drifts from these, a line on the chart moved.
*/
{
  const bars = ramp(200, 400, 430);

  const refEma = (bs: Candle[], period: number) => {
    const k = 2 / (period + 1);
    let ema = bs[0].close;
    return bs.map(b => {
      ema = b.close * k + ema * (1 - k);
      return ema;
    });
  };
  const refVwap = (bs: Candle[], mins: number) => {
    const out: number[] = [];
    let pv = 0, vol = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (i > 0 && b.time - bs[i - 1].time > mins * 60 * 1.5) { pv = 0; vol = 0; }
      const typical = (b.high + b.low + b.close) / 3;
      pv += typical * b.volume;
      vol += b.volume;
      out.push(vol > 0 ? pv / vol : b.close);
    }
    return out;
  };

  for (const period of [9, 21, 50]) {
    const mine = emaSeries(bars, period);
    const ref = refEma(bars, period);
    check(
      `EMA${period} matches the curve the tape drew, bar for bar`,
      mine.length === ref.length && mine.every((v, i) => Math.abs(v - ref[i]) < 1e-12),
      `${mine.length} bars, last ${mine[mine.length - 1].toFixed(6)}`
    );
  }
  const v = vwapSeries(bars, 1);
  const vr = refVwap(bars, 1);
  check(
    'VWAP matches the curve the tape drew, bar for bar',
    v.length === vr.length && v.every((x, i) => Math.abs(x - vr[i]) < 1e-12),
    `last ${v[v.length - 1].toFixed(6)}`
  );
  check('an empty series produces an empty curve rather than throwing', emaSeries([], 21).length === 0 && vwapSeries([], 1).length === 0);
}

// ── 2. VWAP re-anchors at a session gap ───────────────────────────────────
{
  /* Two "sessions" of flat but different price, separated by an hour. */
  const a = ramp(30, 100, 100, 1000, T0);
  const b = ramp(30, 200, 200, 1000, T0 + 30 * 60 + 3600);
  const both = [...a, ...b];
  const anchored = vwapSeries(both, 1);
  const last = anchored[anchored.length - 1];
  check(
    'VWAP re-anchors after an overnight gap rather than averaging across it',
    Math.abs(last - 200) < 0.01,
    `last ${last.toFixed(4)} (a blended one would be near 150)`
  );
  /* The SAME bars called 1h bars have no gap in them — 3600s is not more than
     1.5 × 3600 — so the whole thing is one session and the average blends. */
  const asHourly = vwapSeries(both, 60);
  check(
    'and barMinutes is what decides where a gap is',
    Math.abs(asHourly[asHourly.length - 1] - 150) < 1,
    `same bars at 60m: ${asHourly[asHourly.length - 1].toFixed(4)}`
  );
  check('a bar with no volume behind it reports a price, not zero', vwapSeries(ramp(3, 50, 50, 0), 1).every(x => x === 50));
}

// ── 3 & 4. the rule, and the state that is not a measurement ──────────────
{
  const rows = buildConfluence(ramp(2000, 300, 400));
  check('every timeframe in the strip gets a row, in the strip’s order', rows.length === CONFLUENCE_TFS.length && rows.every((r, i) => r.tf === CONFLUENCE_TFS[i]), rows.map(r => r.tf).join(' · '));

  /* A long, monotone climb is above both curves on every timeframe that has
     enough bars — the unambiguous UP case. */
  const decided = rows.filter(r => r.state !== null);
  check('a monotone climb reads up on every timeframe that has a view', decided.length > 0 && decided.every(r => r.state === 'up'), rows.map(r => `${r.tf}:${r.state ?? '—'}`).join(' '));

  const down = buildConfluence(ramp(2000, 400, 300)).filter(r => r.state !== null);
  check('a monotone fall reads down on every timeframe that has a view', down.length > 0 && down.every(r => r.state === 'down'), down.map(r => `${r.tf}:${r.state}`).join(' '));

  /*
    FLAT IS ONE OF EACH, and this is the case a threshold would have hidden.
    A long climb followed by a short pullback puts price BELOW the fast EMA
    while it is still ABOVE the session VWAP the climb built.
  */
  const pullback = [...ramp(400, 300, 400), ...ramp(40, 400, 386, 1000, T0 + 400 * 60)];
  const oneM = buildConfluence(pullback).find(r => r.tf === '1m');
  {
    const bars = aggregateCandles(pullback, 1);
    const e = emaSeries(bars, CONFLUENCE_EMA);
    const v = vwapSeries(bars, 1);
    const i = bars.length - 1;
    const above = bars[i].close > v[i];
    const below = bars[i].close < e[i];
    check(
      'PREMISE: the pullback really does sit below the EMA and above the VWAP',
      above && below,
      `close ${bars[i].close.toFixed(2)} · ema ${e[i].toFixed(2)} · vwap ${v[i].toFixed(2)}`
    );
    check('and one of each reads flat', oneM?.state === 'flat', String(oneM?.state));
  }

  /* Too little history — reported, never guessed at. */
  const thin = buildConfluence(ramp(30, 100, 110));
  const daily = thin.find(r => r.tf === '1D');
  check('a timeframe with too little history reports no view at all', daily?.state === null, `1D: ${daily?.state ?? 'null'} on ${daily?.bars} bar(s)`);
  check('and says how little it had', trendWords(daily!).includes('not enough history'), trendWords(daily!));
  const fast = thin.find(r => r.tf === '1m');
  check('while a timeframe on the same data that DOES have the bars still answers', fast?.state !== null, `1m: ${fast?.state} on ${fast?.bars} bars`);
  check(`the bar floor is the EMA's own period (${CONFLUENCE_EMA})`, emaWarmup(CONFLUENCE_EMA) === CONFLUENCE_EMA);

  check('no data at all is every row with no view, rather than a throw', buildConfluence([]).every(r => r.state === null && r.bars === 0));
}

// ── the glyphs, and the words ─────────────────────────────────────────────
check('every state has a glyph', Object.keys(TREND_GLYPH).length === 3 && TREND_GLYPH.up !== TREND_GLYPH.down && TREND_GLYPH.flat !== TREND_GLYPH.up);
check('the words name both references, so the rule is readable off the strip', trendWords({ tf: '5m', state: 'up', bars: 99 }).includes(`EMA${CONFLUENCE_EMA}`) && trendWords({ tf: '5m', state: 'up', bars: 99 }).includes('VWAP'), trendWords({ tf: '5m', state: 'up', bars: 99 }));
check('and the timeframes named are ones the desk actually has', CONFLUENCE_TFS.every(tf => tfMinutes(tf) > 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
