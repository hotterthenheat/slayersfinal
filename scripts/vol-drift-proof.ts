/*
  Acceptance test for the volatility drift pane's math. Runs the ACTUAL module.

  Proves:
  1. A price that does not move has ZERO realised vol — not a small number
  2. A price with a known return series produces the ANALYTIC answer, n-1 and
     annualisation included
  3. Annualisation is right at every timeframe the chart offers, daily and
     weekly included — the regime where a calendar-seconds scaling halves it
  4. The first `window` bars produce no points, so the line never opens on a
     confident 0% taken from a sample of one
  5. An overnight gap is dropped from the sample INTRADAY and NOT dropped on a
     daily clock, where the same step is an ordinary return
  6. The implied line is REPORTED, converted fraction to percent, and absent
     when the feed reports nothing

  Run: npx tsx scripts/vol-drift-proof.ts
*/
import {
  RV_MODEL,
  impliedVolLine,
  periodsPerYear,
  realizedVol,
  volCeiling,
  type VolPoint,
} from '../src/data/volDrift';
import type { Candle } from '../src/types/market';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const T0 = 1_699_999_980;
/** Bars from a list of closes, evenly spaced. Only time and close are read. */
const barsFrom = (closes: number[], barSec = 60, from = T0): Candle[] =>
  closes.map((close, i) => ({ time: from + i * barSec, open: close, high: close, low: close, close, volume: 1 }));

// ---- 1. a flat price has no volatility ---------------------------------------
{
  const flat = realizedVol(barsFrom(new Array(80).fill(100)), 60);
  check('a flat price produces points at all', flat.length > 0, `${flat.length}`);
  check('and every one of them is exactly zero', flat.every(p => p.value === 0), JSON.stringify(flat.slice(0, 2)));
}

// ---- 2. a known return series gives the analytic answer -------------------------
{
  /* Closes alternate A, B, A, B… so log returns alternate +r, -r. Over an even
     window the mean is exactly 0, the sum of squares is window*r^2, and the
     n-1 variance is window*r^2/(window-1). Nothing here is approximate. */
  const r = 0.001;
  const A = 100;
  const B = A * Math.exp(r);
  const closes: number[] = [];
  for (let i = 0; i < 90; i++) closes.push(i % 2 === 0 ? A : B);

  const w = RV_MODEL.window;
  check('the window is even, so the analytic mean really is zero', w % 2 === 0, `window ${w}`);

  const pts = realizedVol(barsFrom(closes), 60);
  const expected = Math.sqrt((w * r * r) / (w - 1)) * Math.sqrt(periodsPerYear(60)) * 100;
  check('realised vol matches the analytic value', near(pts[0].value, expected, 1e-9), `${pts[0].value} vs ${expected}`);

  /* n-1, not n. The two differ by sqrt(30/29) — 1.7% — which a loose tolerance
     would swallow, so this asserts the WRONG answer is actually excluded. */
  const biased = Math.sqrt(r * r) * Math.sqrt(periodsPerYear(60)) * 100;
  check('and it is the n-1 sample deviation, not the n one', !near(pts[0].value, biased, 1e-6), `population would be ${biased}`);

  check('the first point lands on the bar that CLOSES the window', pts[0].time === T0 + w * 60, `${pts[0].time - T0}s in`);
  check('a stationary alternation gives a flat line', pts.every(p => near(p.value, pts[0].value, 1e-9)));
}

// ---- 3. annualisation, every timeframe the chart offers ---------------------------
{
  const barsPerSession = RV_MODEL.sessionSeconds / 60;
  check('a 1m bar annualises on 252 sessions of 390 minutes', near(periodsPerYear(60), RV_MODEL.sessionsPerYear * barsPerSession), `${periodsPerYear(60)}`);
  check('a 5m bar has a fifth as many periods', near(periodsPerYear(300), periodsPerYear(60) / 5), `${periodsPerYear(300)}`);
  check('an hourly bar has a sixtieth', near(periodsPerYear(3600), periodsPerYear(60) / 60), `${periodsPerYear(3600)}`);
  /*
    THE DAILY BAR IS THE ONE THAT BREAKS A NAIVE FORMULA. It spans 86,400
    calendar seconds and ONE session. Scaling by calendar seconds annualises it
    at 252*23400/86400 = 68.25 periods a year, and sqrt(68.25/252) = 0.52 — it
    quotes realised vol at half its true value on the timeframe most readers
    check it on.
  */
  check('a DAILY bar is 252 periods a year, not 68', near(periodsPerYear(86_400), 252), `${periodsPerYear(86_400)}`);
  const calendarNaive = (RV_MODEL.sessionsPerYear * RV_MODEL.sessionSeconds) / 86_400;
  check('and the calendar-seconds answer is excluded', !near(periodsPerYear(86_400), calendarNaive, 1e-6), `naive ${calendarNaive.toFixed(2)}`);
  check('a WEEKLY bar is five sessions — 50.4 a year', near(periodsPerYear(604_800), 252 / 5), `${periodsPerYear(604_800)}`);
  check('periods per year never goes non-positive', [1, 60, 3600, 86_400, 604_800, 1e12].every(s => periodsPerYear(s) > 0));
}

// ---- 4. the line does not open on a sample of one ---------------------------------
{
  const w = RV_MODEL.window;
  check('exactly window bars produce nothing', realizedVol(barsFrom(new Array(w).fill(100)), 60).length === 0);
  check('window+1 bars produce exactly one point', realizedVol(barsFrom(new Array(w + 1).fill(100)), 60).length === 1);
  check('two bars produce nothing at all', realizedVol(barsFrom([100, 101]), 60).length === 0);
  check('an empty series produces nothing', realizedVol([], 60).length === 0);
}

// ---- 5. the overnight gap, and where it does NOT apply -----------------------------
{
  const w = RV_MODEL.window;
  /* 60 one-minute bars, then a 16-hour jump, then 60 more. The step across the
     jump must not enter any sample. */
  const before = barsFrom(new Array(60).fill(0).map((_, i) => 100 + (i % 2)), 60, T0);
  const afterStart = before[before.length - 1].time + 16 * 3600;
  const after = barsFrom(new Array(60).fill(0).map((_, i) => 500 + (i % 2)), 60, afterStart);
  const pts = realizedVol([...before, ...after], 60);
  const worst = Math.max(...pts.map(p => p.value));
  /*
    The 100 -> 500 step is a log return of 1.6, ~160x the ordinary one in this
    fixture. A single window that counted it would read in the thousands of
    percent, so the test is not "is the line small" — it is "is the line an
    ORDER OF MAGNITUDE below what one contaminated window would have produced".
    A bare `< 1000` would pass on a line that had swallowed a smaller gap.
  */
  const contaminated = Math.sqrt((Math.log(5) ** 2) / (w - 1)) * Math.sqrt(periodsPerYear(60)) * 100;
  check('the break never enters a window', worst < contaminated / 10, `worst ${worst.toFixed(1)}% vs ${contaminated.toFixed(0)}% contaminated`);
  /*
    AND THE LINE DOES NOT GO SILENT ACROSS THE BREAK, which is the other half of
    the rule and the half a "no point straddles the break" assertion would have
    demanded wrongly. A window overlapping the gap loses ONE return, not thirty;
    dropping the whole window would blank half an hour of the pane every
    morning. It keeps reporting as long as at least half the sample survives.
  */
  const straddling = pts.filter(p => p.time > afterStart && p.time < afterStart + w * 60);
  check('but the pane keeps reporting through it', straddling.length > 0, `${straddling.length} points in the overlap`);
  check('and those readings stay sane too', straddling.every(p => p.value < contaminated / 10));

  /* On a DAILY clock the same shape is Friday to Monday — an ordinary return
     that must be KEPT, or a fifth of every daily sample vanishes. */
  const daily: Candle[] = [];
  let t = T0;
  for (let i = 0; i < 90; i++) {
    const close = 100 + (i % 2);
    daily.push({ time: t, open: close, high: close, low: close, close, volume: 1 });
    /* Mon-Thu step one day; Friday steps three. */
    t += (i % 5 === 4 ? 3 : 1) * 86_400;
  }
  const dailyPts = realizedVol(daily, 86_400);
  check('a weekend does NOT null out the daily return', dailyPts.length > 0, `${dailyPts.length} points`);
  const flatDaily = realizedVol(barsFrom(new Array(90).fill(0).map((_, i) => 100 + (i % 2)), 86_400), 86_400);
  check('and the weekend series reads the same as an unbroken one', near(dailyPts[0].value, flatDaily[0].value, 1e-9), `${dailyPts[0].value} vs ${flatDaily[0].value}`);
}

// ---- 6. the implied line is reported, never modelled ---------------------------------
{
  const rv = realizedVol(barsFrom(new Array(60).fill(100)), 60);
  const iv = impliedVolLine(0.15, rv);
  check('implied arrives as a fraction and leaves as a percent', iv.every(p => p.value === 15), JSON.stringify(iv[0]));
  check('and it covers exactly the bars realised covers', iv.length === rv.length && iv.every((p, i) => p.time === rv[i].time));
  /*
    FLAT IS THE HONEST ANSWER while the feed reports a constant. This module
    does not smile it, interpolate it, or add drift to make the pane look busy —
    the day a real implied series lands, this function is what it replaces.
  */
  check('a constant feed draws a flat line, not an invented one', new Set(iv.map(p => p.value)).size === 1);
  for (const bad of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    if (impliedVolLine(bad as number, rv).length !== 0) {
      check(`a feed reporting ${String(bad)} draws nothing`, false);
      break;
    }
  }
  check('a feed reporting nothing draws nothing', [null, undefined, 0, -1, Number.NaN].every(b => impliedVolLine(b as number, rv).length === 0));
  check('and with no bars to cover it draws nothing either', impliedVolLine(0.15, []).length === 0);
}

// ---- 7. the shared ceiling -------------------------------------------------------------
{
  const a: VolPoint[] = [{ time: 1, value: 10 }];
  const b: VolPoint[] = [{ time: 1, value: 40 }];
  check('the ceiling clears the taller line', volCeiling(a, b) > 40, `${volCeiling(a, b)}`);
  check('and is taken across BOTH, not the first', volCeiling(a, b) === volCeiling(b, a));
  check('nothing at all ceilings to zero rather than NaN', volCeiling([], []) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
