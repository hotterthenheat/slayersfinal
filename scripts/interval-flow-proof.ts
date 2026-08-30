/*
  Acceptance test for interval flow.

  Proves:
  1. It buckets by CONTRACT, not by time — which is the whole difference
     from flowBars. Many small prints into one strike become one heavy row
  2. The right is part of the key: calls and puts at one strike never merge
  3. The ask share is PREMIUM-weighted — ten small bids and one large lift
     is a contract being bought, and print-counting would call it selling
  4. vol/OI is null when the tape carried no OI, never zero
  5. The assembly ratio finds size that arrived in pieces — the thing a
     feed sorted by print size cannot see
*/
import { buildIntervalFlow, assemblyRatio, assembled } from '../src/data/intervalFlow';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NOW = 1_760_000_000_000;
const MIN = 60_000;
const P = (o: {
  strike?: number; right?: 'C' | 'P'; size?: number; fill?: number;
  side?: 'BID' | 'ASK' | 'MID'; ago?: number; ticker?: string; oi?: number; expiry?: string;
}): FlowPrint & { at: number } =>
  ({
    ticker: o.ticker ?? 'SPY',
    expiry: o.expiry ?? '09/19/2026',
    strike: o.strike ?? 470,
    right: o.right ?? 'C',
    dte: 20,
    size: o.size ?? 100,
    fill: o.fill ?? 1,
    side: o.side ?? 'ASK',
    oi: o.oi,
    at: NOW - (o.ago ?? MIN),
  } as unknown as FlowPrint & { at: number });

// ── 1. by contract, not by time ───────────────────────────────────────────
{
  /* Forty 25-lots into one strike: invisible print-by-print, a 1,000-lot
     row here. */
  const tape = Array.from({ length: 40 }, (_, i) => P({ size: 25, ago: (i % 5) * MIN }));
  const f = buildIntervalFlow(tape, 'SPY', 10 * MIN, 40, NOW);
  check('forty prints into one contract are ONE row', f.rows.length === 1, `${f.rows.length} rows`);
  check('— carrying all the size', f.rows[0].contracts === 1000, String(f.rows[0].contracts));
  check('— and saying how many prints it took', f.rows[0].prints === 40, String(f.rows[0].prints));
  check('the largest single print is remembered', f.rows[0].largestPrint === 25, String(f.rows[0].largestPrint));
  check('rows rank by premium', buildIntervalFlow([P({ size: 10 }), P({ strike: 480, size: 900 })], 'SPY', 10 * MIN, 40, NOW).rows[0].strike === 480);
}

// ── 2. the right is part of the key ───────────────────────────────────────
{
  const f = buildIntervalFlow([P({ strike: 470, right: 'C', size: 500 }), P({ strike: 470, right: 'P', size: 500 })], 'SPY', 10 * MIN, 40, NOW);
  check('calls and puts at one strike are two rows', f.rows.length === 2, `${f.rows.length}`);
  check('— never summed into "a thousand of nothing"', f.rows.every(r => r.contracts === 500));
  const exp = buildIntervalFlow([P({ expiry: '09/19/2026' }), P({ expiry: '10/17/2026' })], 'SPY', 10 * MIN, 40, NOW);
  check('and two expiries are two contracts', exp.rows.length === 2);
}

// ── 3. premium-weighted pressure ──────────────────────────────────────────
{
  /* Ten 10-lot bids against one 900-lot lift: by print count this is
     selling 10:1; by premium it is overwhelmingly bought. */
  const tape = [
    ...Array.from({ length: 10 }, () => P({ size: 10, side: 'BID' as const })),
    P({ size: 900, side: 'ASK' }),
  ];
  const r = buildIntervalFlow(tape, 'SPY', 10 * MIN, 40, NOW).rows[0];
  check('ten small bids and one large lift reads as BOUGHT', r.askPct === 90, `${r.askPct}%`);
  check('— which print-counting would have called selling', r.prints === 11);
}

// ── 4. vol/OI is honest about not knowing ─────────────────────────────────
{
  const none = buildIntervalFlow([P({ size: 100 })], 'SPY', 10 * MIN, 40, NOW).rows[0];
  check('no OI on the tape means null, not zero', none.volOverOi === null);
  const some = buildIntervalFlow([P({ size: 300, oi: 1000 })], 'SPY', 10 * MIN, 40, NOW).rows[0];
  check('with OI it is volume over it', some.volOverOi === 0.3, String(some.volOverOi));
  /* The LARGEST OI seen wins — a stale smaller figure would overstate the
     ratio, which is the number a reader leans on hardest. */
  const mixed = buildIntervalFlow([P({ size: 100, oi: 200 }), P({ size: 100, oi: 1000 })], 'SPY', 10 * MIN, 40, NOW).rows[0];
  check('a stale low OI cannot overstate the ratio', mixed.volOverOi === 0.2, String(mixed.volOverOi));
}

// ── 5. assembly ───────────────────────────────────────────────────────────
{
  const pieces = buildIntervalFlow(Array.from({ length: 20 }, () => P({ size: 25 })), 'SPY', 10 * MIN, 40, NOW);
  check('size built out of pieces has a high assembly ratio', assemblyRatio(pieces.rows[0]) === 20, String(assemblyRatio(pieces.rows[0])));
  check('— and is surfaced as assembled', assembled(pieces).length === 1);
  const oneShot = buildIntervalFlow([P({ size: 500 })], 'SPY', 10 * MIN, 40, NOW);
  check('one big print is not assembly', assemblyRatio(oneShot.rows[0]) === 1 && assembled(oneShot).length === 0);
}

// ── the filters ───────────────────────────────────────────────────────────
{
  check('a print outside the window is out', buildIntervalFlow([P({ ago: 30 * MIN })], 'SPY', 5 * MIN, 40, NOW).rows.length === 0);
  const mixed = [P({ ticker: 'SPY' }), P({ ticker: 'QQQ' })];
  check('the ticker filter bites', buildIntervalFlow(mixed, 'SPY', 10 * MIN, 40, NOW).rows.length === 1);
  check('null is market-wide', buildIntervalFlow(mixed, null, 10 * MIN, 40, NOW).rows.length === 2);
  check('an empty tape is empty', buildIntervalFlow([], null, 10 * MIN, 40, NOW).rows.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
