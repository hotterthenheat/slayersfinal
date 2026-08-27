/*
  Acceptance test for the two lists a Terrain key steps along. Runs the ACTUAL
  module — no browser, no React, no simulator, no chart.

  Proves:
  1. The interval step CLAMPS at both ends — one keypress on a 1m chart can
     never produce a weekly chart
  2. The symbol step WRAPS at both ends — the opposite decision, on a list of
     peers rather than a scale
  3. The ring is the watchlist in its own order, then the reader's own symbols
     alphabetically, deduped and upper-cased
  4. The ring does not reorder itself as it is walked — the property an
     ordered-by-`seen` ring would not have
  5. A symbol that is not on the ring enters at the end it was walked towards,
     so ↑ and ↓ never do the same thing
  6. Degenerate rings (empty, one entry) return a symbol rather than undefined
*/
import { flipRing, stepSymbol, stepTf } from '../src/pages/terrain/paneKeys';
import { TIMEFRAMES } from '../src/data/timeframe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const FIRST_TF = TIMEFRAMES[0].value;
const LAST_TF = TIMEFRAMES[TIMEFRAMES.length - 1].value;

// ── 1. the interval list clamps ────────────────────────────────────────────
check('the interval step clamps at the fast end', stepTf(FIRST_TF, -1) === FIRST_TF, `${FIRST_TF} → ${stepTf(FIRST_TF, -1)}`);
check('the interval step clamps at the slow end', stepTf(LAST_TF, 1) === LAST_TF, `${LAST_TF} → ${stepTf(LAST_TF, 1)}`);
check('the interval step moves one place in between', stepTf('15m', 1) === '30m' && stepTf('15m', -1) === '5m');
/* The clamp is what stops ONE keypress crossing from an intraday instrument to
   a weekly one. Asserted as the round trip a reader would actually make. */
check(
  'walking off the fast end and back reaches the second interval, not the last',
  stepTf(stepTf(FIRST_TF, -1), 1) === TIMEFRAMES[1].value
);

// ── 2 & 3. the ring, and how it is built ───────────────────────────────────
const WATCH = ['SPY', 'QQQ', 'AAPL', 'NVDA'];

check(
  'the ring is the watchlist alone when nothing has been configured',
  JSON.stringify(flipRing(WATCH, [])) === JSON.stringify(WATCH)
);

{
  const ring = flipRing(WATCH, ['TSLA', 'amd', 'SPY', 'META']);
  check(
    'configured names follow the watchlist, alphabetically, deduped and upper-cased',
    JSON.stringify(ring) === JSON.stringify(['SPY', 'QQQ', 'AAPL', 'NVDA', 'AMD', 'META', 'TSLA']),
    JSON.stringify(ring)
  );
  check('a configured name already on the watchlist is not repeated', ring.filter(t => t === 'SPY').length === 1);
}

check('blank and whitespace entries are dropped rather than becoming an empty rung', JSON.stringify(flipRing(['SPY', '', '   '], [])) === JSON.stringify(['SPY']));

// ── the symbol step wraps, unlike the interval step ────────────────────────
{
  const ring = flipRing(WATCH, []);
  check('the symbol step moves one place', stepSymbol(ring, 'QQQ', 1) === 'AAPL' && stepSymbol(ring, 'QQQ', -1) === 'SPY');
  check('the symbol step wraps off the end', stepSymbol(ring, 'NVDA', 1) === 'SPY', `NVDA → ${stepSymbol(ring, 'NVDA', 1)}`);
  check('the symbol step wraps off the front', stepSymbol(ring, 'SPY', -1) === 'NVDA', `SPY → ${stepSymbol(ring, 'SPY', -1)}`);
  check('the symbol step is case-insensitive on the way in', stepSymbol(ring, 'spy', 1) === 'QQQ');

  // ── 4. a full lap returns to where it started, in order ─────────────────
  /* This is the assertion an ordered-by-`seen` ring would fail: walking it
     restamps the entries it lands on, so the list reorders under the walk and
     the lap never closes. The ring is built once from data that the walk does
     not write to, and this is what says so. */
  const lap: string[] = [];
  let cur = 'SPY';
  for (let i = 0; i < ring.length; i++) {
    lap.push(cur);
    cur = stepSymbol(ring, cur, 1);
  }
  check('a full lap visits every name once and closes', JSON.stringify(lap) === JSON.stringify(ring) && cur === 'SPY', JSON.stringify(lap));

  // ── 5. a symbol that is not on the ring ─────────────────────────────────
  check('an off-ring symbol enters at the front going down', stepSymbol(ring, 'IWM', 1) === ring[0]);
  check('an off-ring symbol enters at the back going up', stepSymbol(ring, 'IWM', -1) === ring[ring.length - 1]);
  check('so ↑ and ↓ never agree on an off-ring symbol', stepSymbol(ring, 'IWM', 1) !== stepSymbol(ring, 'IWM', -1));
}

// ── 6. degenerate rings ────────────────────────────────────────────────────
check('an empty ring returns the symbol it was given', stepSymbol([], 'spy', 1) === 'SPY');
check('a one-entry ring returns that entry in both directions', stepSymbol(['SPY'], 'SPY', 1) === 'SPY' && stepSymbol(['SPY'], 'SPY', -1) === 'SPY');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
