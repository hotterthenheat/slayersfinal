/*
  Acceptance test for the flow pane's bucketing. Runs the ACTUAL module — no
  browser, no React, no simulator.

  Proves:
  1. Prints land in the bar they happened in, by FLOOR not round
  2. Calls and puts are summed separately and both stay positive magnitudes
  3. A print with no usable instant is DROPPED, never parked at the epoch
  4. The ticker filter is exact and case-insensitive
  5. Empty buckets are absent rather than zero
  6. The scale is taken across BOTH legs, so the two sides stay comparable
  7. Bars come back ascending whatever order the prints arrived in

  Run: npx tsx scripts/flow-bars-proof.ts
*/
import { bucketFlow, flowMaxLeg, type FlowBar } from '../src/data/flowBars';
import type { FlowPrint } from '../src/types/trace';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* A print with only the fields this module reads. The rest of FlowPrint is
   irrelevant here and casting keeps the fixture honest about that. */
const print = (o: {
  at?: number;
  right?: 'C' | 'P' | string;
  premium?: number;
  ticker?: string;
}): FlowPrint & { at?: number } =>
  ({
    at: o.at,
    right: (o.right ?? 'C') as 'C' | 'P',
    premium: o.premium ?? 1000,
    ticker: o.ticker ?? 'SPY',
  }) as unknown as FlowPrint & { at?: number };

/*
  A BAR-ALIGNED instant, and the alignment is asserted rather than assumed.

  The first draft used 1_700_000_000_000, which is divisible by 1000 but NOT by
  60_000 — it sits 20s into its own minute. Two assertions below duly failed,
  and the module was right both times: a print 59s later belonged to the NEXT
  bucket, not the same one. A fixture that quietly starts mid-bucket turns every
  boundary test into a test of something else, so the alignment is checked here
  and the whole run stops if it ever stops being true.
*/
const T0 = 1_699_999_980_000; // epoch ms, exactly on a 60s boundary
const T0_SEC = T0 / 1000;
if (T0_SEC % 60 !== 0) {
  console.log('FAIL  the fixture instant is not bar-aligned — every boundary test below is meaningless');
  process.exit(1);
}

// ---- 1. flooring -------------------------------------------------------------
{
  const bars = bucketFlow(
    [
      print({ at: T0 + 1_000, premium: 100 }), // 1s into the bucket
      print({ at: T0 + 59_000, premium: 200 }), // 59s in — SAME bucket
      print({ at: T0 + 60_000, premium: 400 }), // exactly the next bucket
    ],
    { barSec: 60 }
  );
  check('a bar holds every print inside its own 60s', bars.length === 2, `${bars.length} bars`);
  check('and sums them', bars[0]?.callPrem === 300, `first bar ${bars[0]?.callPrem}`);
  check(
    'the boundary print starts the NEXT bar, it does not round back',
    bars[1]?.time === T0_SEC + 60 && bars[1]?.callPrem === 400
  );
  /* Rounding instead of flooring would put everything past the bar's halfway
     mark into the following bar — the defect this asserts against. */
  const rounded = Math.round((T0 + 59_000) / 1000 / 60) * 60;
  check(
    'and rounding would have been wrong — it moves the 59s print a bar forward',
    rounded !== bars[0].time,
    `round ${rounded} vs floor ${bars[0].time}`
  );
}

// ---- 2. the two legs ---------------------------------------------------------
{
  const bars = bucketFlow(
    [
      print({ at: T0, right: 'C', premium: 500 }),
      print({ at: T0 + 1000, right: 'P', premium: 900 }),
      print({ at: T0 + 2000, right: 'P', premium: 100 }),
    ],
    { barSec: 60 }
  );
  const b = bars[0];
  check('calls and puts are summed apart', b.callPrem === 500 && b.putPrem === 1000);
  check('the put leg is a MAGNITUDE, not pre-negated', b.putPrem > 0, `putPrem ${b.putPrem}`);
  check('the bucket counts both sides', b.count === 3, `count ${b.count}`);
}

// ---- 3. a print with no instant is dropped -----------------------------------
{
  const bars = bucketFlow(
    [
      print({ at: undefined, premium: 999_999 }),
      print({ at: Number.NaN, premium: 999_999 }),
      print({ at: 0, premium: 999_999 }),
      print({ at: -5, premium: 999_999 }),
      print({ at: T0, premium: 10 }),
    ],
    { barSec: 60 }
  );
  check('an unusable instant is dropped, not parked at the epoch', bars.length === 1, `${bars.length} bars`);
  check('and the real print survives it', bars[0]?.callPrem === 10);
  /* Defaulting a missing `at` to 0 would put a bucket at 1970 and stretch the
     series across fifty years — the whole pane would render as one spike. */
  check('no bucket sits at the epoch', bars.every(b => b.time > 1_000_000_000));
}

// ---- 4. the ticker filter ----------------------------------------------------
{
  const src = [
    print({ at: T0, ticker: 'SPY', premium: 100 }),
    print({ at: T0, ticker: 'spy', premium: 50 }),
    print({ at: T0, ticker: 'QQQ', premium: 700 }),
    print({ at: T0, ticker: 'SPYG', premium: 700 }),
  ];
  const spy = bucketFlow(src, { barSec: 60, ticker: 'SPY' });
  check('the filter is case-insensitive', spy[0]?.callPrem === 150, `got ${spy[0]?.callPrem}`);
  check('and EXACT — SPYG is not SPY', spy[0]?.callPrem === 150);
  const all = bucketFlow(src, { barSec: 60 });
  check('omitting the filter takes every print', all[0]?.callPrem === 1550, `got ${all[0]?.callPrem}`);
}

// ---- 5. empty buckets are absent ---------------------------------------------
{
  const bars = bucketFlow(
    [print({ at: T0, premium: 10 }), print({ at: T0 + 600_000, premium: 20 })],
    { barSec: 60 }
  );
  check(
    'a ten-minute gap yields two bars, not eleven',
    bars.length === 2,
    `${bars.length} bars`
  );
  /* A zero bar asserts "the tape was quiet here". On a tape that only starts
     accumulating when the app opens, an empty bar usually means "we were not
     listening yet", which is a different claim. */
  check('no zero-premium bar is invented', bars.every(b => b.callPrem + b.putPrem > 0));
}

// ---- 6. one scale across both legs -------------------------------------------
{
  const bars: FlowBar[] = [
    { time: T0_SEC, callPrem: 10_000, putPrem: 0, count: 1 },
    { time: T0_SEC + 60, callPrem: 0, putPrem: 10_000_000, count: 1 },
  ];
  check('the scale is the heaviest leg anywhere', flowMaxLeg(bars) === 10_000_000);
  /* Scaling each leg to its own max would draw the $10k call bucket exactly as
     tall as the $10M put bucket — the one thing a two-sided histogram must
     never do. */
  const perLegMax = Math.max(...bars.map(b => b.callPrem));
  check('and NOT the call leg alone', flowMaxLeg(bars) !== perLegMax, `call-only max ${perLegMax}`);
  check('an empty series scales to zero rather than throwing', flowMaxLeg([]) === 0);
}

// ---- 7. order and window -----------------------------------------------------
{
  const bars = bucketFlow(
    [
      print({ at: T0 + 120_000, premium: 3 }),
      print({ at: T0, premium: 1 }),
      print({ at: T0 + 60_000, premium: 2 }),
    ],
    { barSec: 60 }
  );
  check(
    'bars come back ascending whatever order they arrived',
    bars.map(b => b.callPrem).join(',') === '1,2,3',
    bars.map(b => b.callPrem).join(',')
  );
  const windowed = bucketFlow(
    [print({ at: T0, premium: 1 }), print({ at: T0 + 120_000, premium: 3 })],
    { barSec: 60, fromMs: T0 + 60_000 }
  );
  check('fromMs drops what is left of the chart', windowed.length === 1 && windowed[0].callPrem === 3);
}

// ---- 8. degenerate inputs ----------------------------------------------------
{
  check('no prints yields no bars', bucketFlow([], { barSec: 60 }).length === 0);
  check('a zero bar width does not divide by zero', bucketFlow([print({ at: T0 })], { barSec: 0 }).length === 1);
  const noPrem = bucketFlow([print({ at: T0, premium: 0 }), print({ at: T0, premium: -5 })], { barSec: 60 });
  check('a print with no premium contributes nothing', noPrem.length === 0);
  /*
    NEITHER leg, and the first version of this only said "not a call".

    Mutation-tested: making an unknown right fall through to `putPrem` left this
    assertion GREEN, because a print counted as a put does indeed have
    callPrem === 0. A guard that names one wrong outcome permits the other one.
    It has to assert the print contributed nothing at all.
  */
  const badRight = bucketFlow([print({ at: T0, right: 'X', premium: 100 })], { barSec: 60 });
  const leaked = badRight.reduce((n, b) => n + b.callPrem + b.putPrem + b.count, 0);
  check('an unknown right reaches NEITHER leg', leaked === 0, `leaked ${leaked}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
