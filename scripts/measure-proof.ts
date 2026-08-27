/*
  Acceptance test for T-1's measure. Runs the ACTUAL module — no browser, no
  React, no chart, no clock.

  Proves:
  1. Δ$ and Δ% are the move, signed by TIME rather than by drag direction
  2. Bars are bars, and a drag inside one bar is zero of them
  3. The annualization is TRADING time — a span across a weekend is not
     divided by the weekend
  4. It is dimensionally right: the same move over four times the trading time
     annualizes to half the rate
  5. A span with no elapsed time reports no rate rather than infinity
  6. Elapsed reads in sessions, so it agrees with the bar count beside it
*/
import { YEAR_MINUTES, TRADING_DAYS, fmtElapsed, measureSpan } from '../src/data/measure';
import { RTH_MINUTES } from '../src/core/calendar';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── 1. the move, and whose sign it is ─────────────────────────────────────
{
  const up = measureSpan(T0, 100, T0 + 60 * 60, 110, 1);
  check('Δ$ is the move', near(up.deltaAbs, 10), String(up.deltaAbs));
  check('Δ% is the move against the FROM price', near(up.deltaPct, 10), `${up.deltaPct}%`);

  /* Dragged right-to-left across the same rally: same rise. */
  const dragged = measureSpan(T0 + 60 * 60, 110, T0, 100, 1);
  check(
    'dragging backwards through a rally still reports a rise',
    near(dragged.deltaAbs, 10) && near(dragged.deltaPct, 10),
    `${dragged.deltaAbs} / ${dragged.deltaPct}%`
  );
  const down = measureSpan(T0, 110, T0 + 60 * 60, 100, 1);
  check('and a fall reports a fall', down.deltaAbs < 0 && down.deltaPct < 0, `${down.deltaAbs} / ${down.deltaPct.toFixed(3)}%`);
  check('the two directions agree on the elapsed time', dragged.elapsedSec === up.elapsedSec && dragged.bars === up.bars);
}

// ── 2. bars are bars ──────────────────────────────────────────────────────
{
  check('sixty 1m bars is sixty bars', measureSpan(T0, 100, T0 + 60 * 60, 100, 1).bars === 60);
  check('the same hour on 15m bars is four', measureSpan(T0, 100, T0 + 60 * 60, 100, 15).bars === 4);
  check('a drag inside one bar is zero bars, not one', measureSpan(T0, 100, T0 + 20, 101, 1).bars === 0, `${measureSpan(T0, 100, T0 + 20, 101, 1).bars}`);
  check('and trading minutes follow the bars', measureSpan(T0, 100, T0 + 60 * 60, 100, 15).tradingMin === 60);
  /* T-14/T-15 — the fractional and the absent clock. */
  check('a minute of 15s bars is FOUR bars, not one (0.25 taken as given)', measureSpan(T0, 100, T0 + 60, 100, 0.25).bars === 4);
  const noClock = measureSpan(T0, 100, T0 + 90, 101, 0);
  check('no bar clock counts no bars', noClock.bars === 0);
  check('— but the stamps still carry the time', Math.abs(noClock.tradingMin - 1.5) < 1e-9, String(noClock.tradingMin));
}

// ── 3. the annualization is TRADING time ──────────────────────────────────
{
  /*
    THE CASE THIS FILE EXISTS FOR. Friday's close to Monday's open: three 1m
    bars of trading, about 65 hours of wall clock. Annualizing on the clock
    would divide the move by the weekend the market spent shut.
  */
  const WEEKEND = 65 * 3600;
  const overWeekend = measureSpan(T0, 100, T0 + WEEKEND, 101, 1);
  check('PREMISE: the wall clock across a weekend really is ~65 hours', overWeekend.elapsedSec === WEEKEND, `${(overWeekend.elapsedSec / 3600).toFixed(1)}h`);

  /* Same move, same THREE bars, taken inside one session. */
  const threeBars = measureSpan(T0, 100, T0 + 3 * 60, 101, 1);
  check(
    'a three-bar move annualizes off the three bars, not the calendar',
    threeBars.annualizedPct !== null && threeBars.tradingMin === 3,
    `${threeBars.tradingMin} trading minutes, ${threeBars.annualizedPct?.toFixed(0)}% annualized`
  );
  /* And the elapsed the reader SEES is the trading time too, so the bar count
     and the duration beside it cannot tell different stories. */
  check('and the reported elapsed follows the bars rather than the clock', fmtElapsed(threeBars.tradingMin) === '3m', fmtElapsed(threeBars.tradingMin));

  /* A year of trading time annualizes to the move itself. */
  const oneYear = measureSpan(T0, 100, T0 + YEAR_MINUTES * 60, 110, 1);
  check(
    'a full trading year of it annualizes to the move itself',
    oneYear.annualizedPct !== null && near(oneYear.annualizedPct, 10, 1e-6),
    `${oneYear.annualizedPct?.toFixed(6)}% against a 10% move`
  );
  check(`a year is ${TRADING_DAYS} sessions of ${RTH_MINUTES} minutes`, YEAR_MINUTES === TRADING_DAYS * RTH_MINUTES, `${YEAR_MINUTES} minutes`);
}

// ── 4. it scales as a volatility, not as a rate ───────────────────────────
{
  const short = measureSpan(T0, 100, T0 + 60 * 60, 101, 1);
  const long = measureSpan(T0, 100, T0 + 4 * 60 * 60, 101, 1);
  check(
    'the same move over four times the trading time annualizes to half the rate',
    short.annualizedPct !== null && long.annualizedPct !== null && near(short.annualizedPct / long.annualizedPct, 2, 1e-9),
    `${short.annualizedPct?.toFixed(1)}% vs ${long.annualizedPct?.toFixed(1)}% — ratio ${(short.annualizedPct! / long.annualizedPct!).toFixed(4)}`
  );
  /* √t, not t: a rate would have given four. */
  check(
    'and it is the square root of time, not time',
    short.annualizedPct !== null && long.annualizedPct !== null && !near(short.annualizedPct / long.annualizedPct, 4, 0.01)
  );
  /* A bigger move at the same horizon scales straight through. */
  const twice = measureSpan(T0, 100, T0 + 60 * 60, 102, 1);
  check(
    'twice the move at the same horizon is twice the annualized figure',
    twice.annualizedPct !== null && near(twice.annualizedPct / short.annualizedPct!, 2, 1e-9),
    `${twice.annualizedPct?.toFixed(1)}% vs ${short.annualizedPct?.toFixed(1)}%`
  );
  check('the annualized figure is unsigned — it is a size, not a direction', measureSpan(T0, 100, T0 + 3600, 99, 1).annualizedPct! > 0);
}

// ── 5. the states that are not measurements ───────────────────────────────
{
  const same = measureSpan(T0, 100, T0, 105, 1);
  check('a span with no elapsed time reports no rate rather than infinity', same.annualizedPct === null, String(same.annualizedPct));
  check('but still reports the move it can see', near(same.deltaAbs, 5) && near(same.deltaPct, 5), `${same.deltaAbs} / ${same.deltaPct}%`);
  /* Half a bar, which is the case that caught `Math.round` counting a bar
     that had not finished. */
  const inBar = measureSpan(T0, 100, T0 + 30, 101, 1);
  check('a drag that has not left its bar reports no rate either', inBar.annualizedPct === null && inBar.bars === 0, `${inBar.bars} bars`);
  const almost = measureSpan(T0, 100, T0 + 119, 101, 1);
  check('and one bar plus a bit is one bar, not two', almost.bars === 1, `${almost.bars} bars`);
  const zero = measureSpan(T0, 0, T0 + 3600, 10, 1);
  check('a zero FROM price does not produce Infinity percent', Number.isFinite(zero.deltaPct), String(zero.deltaPct));
}

// ── 6. elapsed reads in sessions ──────────────────────────────────────────
{
  check('minutes', fmtElapsed(12) === '12m', fmtElapsed(12));
  check('hours and minutes', fmtElapsed(3 * 60 + 24) === '3h 24m', fmtElapsed(3 * 60 + 24));
  check('a whole hour drops the minutes', fmtElapsed(120) === '2h', fmtElapsed(120));
  check('a day is a SESSION, not 24 hours', fmtElapsed(RTH_MINUTES) === '1d', fmtElapsed(RTH_MINUTES));
  check('and it counts them', fmtElapsed(RTH_MINUTES * 2 + 60) === '2d 1h', fmtElapsed(RTH_MINUTES * 2 + 60));
  check('nothing elapsed reads as nothing', fmtElapsed(0) === '0m' && fmtElapsed(-5) === '0m');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
