/*
  Acceptance test for the cumulative premium drift. Runs the ACTUAL module.

  Proves:
  1. The lines are running totals — the last point IS the session's premium
  2. Neither leg ever goes down
  3. A QUIET BAR HOLDS THE TOTAL FLAT rather than being skipped — the one
     behaviour that separates a cumulative line from the flow histogram
  4. The ticker filter and the unknown-right rule survive the sum
  5. An empty tape draws nothing, never a zero line
  6. Every point is bar-aligned and strictly ascending

  Run: npx tsx scripts/drift-series-proof.ts
*/
import { cumulativeDrift, driftPeak, type DriftPoint } from '../src/data/driftSeries';
import type { FlowPrint } from '../src/types/trace';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const MIN = 60_000;
/*
  Floored to a whole FIVE minutes, not one, and the extra alignment was earned.

  A one-minute base passed every 1m assertion and then failed the 5m block:
  1_699_999_980_000 sits 180s into its own 5m bucket, so two prints three
  minutes apart straddled a boundary and landed in different bars. The module
  was right; the fixture had quietly started mid-bucket. Aligning to the
  COARSEST clock any test here uses keeps every finer one aligned too, and both
  alignments are asserted so a future test on a coarser bar cannot inherit the
  same trap silently.
*/
const BASE = Math.floor(1_700_000_000_000 / (5 * MIN)) * (5 * MIN);
check('the fixture clock is bar-aligned on 1m', BASE % MIN === 0, `${BASE}`);
check('and on 5m — the coarsest clock tested below', BASE % (5 * MIN) === 0, `${BASE % (5 * MIN)}`);

type P = FlowPrint & { at: number };
let seq = 0;
const print = (minute: number, right: 'C' | 'P' | 'X', premium: number, ticker = 'SPY'): P =>
  ({
    id: `p${seq++}`,
    ticker,
    right,
    premium,
    at: BASE + minute * MIN + 1_000,
  }) as unknown as P;

const drift = (prints: P[], ticker?: string) => cumulativeDrift(prints, { barSec: 60, ticker });
const last = (pts: DriftPoint[]) => pts[pts.length - 1];

// ---- 1. the last point is the session total ----------------------------------
{
  const pts = drift([print(0, 'C', 100), print(1, 'C', 250), print(1, 'P', 400)]);
  check('the closing call total is every call dollar', last(pts).calls === 350, `${last(pts).calls}`);
  check('the closing put total is every put dollar', last(pts).puts === 400, `${last(pts).puts}`);
  check('the FIRST point holds only what had printed by then', pts[0].calls === 100 && pts[0].puts === 0, JSON.stringify(pts[0]));
  check('driftPeak is the larger of the two closes', driftPeak(pts) === 400, `${driftPeak(pts)}`);
}

// ---- 2. neither leg ever goes down --------------------------------------------
{
  const prints: P[] = [];
  for (let m = 0; m < 40; m++) {
    prints.push(print(m, m % 3 === 0 ? 'P' : 'C', 10 + (m % 7) * 3));
  }
  const pts = drift(prints);
  let monotone = true;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].calls < pts[i - 1].calls || pts[i].puts < pts[i - 1].puts) monotone = false;
  }
  check('both legs are non-decreasing across 40 bars', monotone, `${pts.length} points`);
}

// ---- 3. a quiet bar HOLDS, it is not skipped ------------------------------------
{
  /* Prints at minute 0 and minute 5 only. A histogram emits two bars; a
     cumulative line must emit SIX, holding 100 flat through the four silent
     ones — otherwise the chart draws premium arriving smoothly through a gap
     in which nothing traded. */
  const pts = drift([print(0, 'C', 100), print(5, 'C', 900)]);
  check('a four-bar gap is filled, not jumped', pts.length === 6, `${pts.length} points`);
  const quiet = pts.slice(1, 5);
  check('and every filled bar holds the running total flat', quiet.every(p => p.calls === 100 && p.puts === 0), JSON.stringify(quiet.map(p => p.calls)));
  check('the total still lands on the last bar', last(pts).calls === 1000 && last(pts).time === BASE / 1000 + 5 * 60, JSON.stringify(last(pts)));
  /* The fill must not invent premium: the sum of the STEPS equals the total. */
  let stepped = 0;
  for (let i = 0; i < pts.length; i++) stepped += pts[i].calls - (i ? pts[i - 1].calls : 0);
  check('the filled bars add nothing to the total', stepped === 1000, `${stepped}`);
}

// ---- 4. the filters survive the sum ---------------------------------------------
{
  const pts = drift([print(0, 'C', 100, 'SPY'), print(0, 'C', 5_000, 'QQQ')], 'SPY');
  check('another symbol never reaches the total', last(pts).calls === 100, `${last(pts).calls}`);

  const leaky = drift([print(0, 'X', 7_777)]);
  check('an unknown right reaches NEITHER leg', leaky.length === 0, JSON.stringify(leaky));
  const mixed = drift([print(0, 'C', 100), print(0, 'X', 7_777)]);
  const leaked = last(mixed).calls + last(mixed).puts - 100;
  check('and it is not quietly added to the other one', leaked === 0, `${leaked} leaked`);
}

// ---- 5. an empty tape draws nothing ----------------------------------------------
{
  check('an empty tape yields no points', drift([]).length === 0);
  check('a tape of unusable prints yields no points', drift([print(0, 'C', 0)]).length === 0);
  check('driftPeak of nothing is zero, not NaN', driftPeak([]) === 0);
  /* A zero line would assert a session in which nobody traded. Absence says
     "we have nothing", which is the true statement on a cold load. */
  const noStamp = cumulativeDrift([{ ticker: 'SPY', right: 'C', premium: 100 } as unknown as P], { barSec: 60 });
  check('a print with no instant is dropped, not parked at the epoch', noStamp.length === 0, `${noStamp.length}`);
}

// ---- 6. the axis can take it ------------------------------------------------------
{
  const pts = drift([print(0, 'C', 1), print(3, 'P', 1), print(9, 'C', 1)]);
  let ascending = true;
  let aligned = true;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].time % 60 !== 0) aligned = false;
    if (i > 0 && pts[i].time <= pts[i - 1].time) ascending = false;
  }
  check('every point is bar-aligned', aligned);
  check('and strictly ascending', ascending, `${pts.length} points`);
  check('the span is exactly first-to-last bar', pts.length === 10, `${pts.length}`);
}

// ---- 7. a coarser clock buckets coarsely -------------------------------------------
{
  /* Same prints, 5m bars: minutes 0 and 3 collapse into one bucket. */
  const prints = [print(0, 'C', 100), print(3, 'C', 100), print(7, 'C', 100)];
  const pts = cumulativeDrift(prints, { barSec: 300 });
  check('a 5m clock folds the first two prints into one bar', pts.length === 2, `${pts.length}`);
  check('the first 5m bar carries both', pts[0].calls === 200, `${pts[0].calls}`);
  check('and the total is unchanged by the clock', last(pts).calls === 300, `${last(pts).calls}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
