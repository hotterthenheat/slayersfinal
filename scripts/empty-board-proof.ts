/*
  Acceptance test for Part 3's empty state.

  "Scan empty state that names the binding filter."

  Three choices can empty a board — tenor, lens, ticker filter — and an
  empty board is always one of them binding. Each case below builds the
  counts a page would have and checks that the read names THAT cut and
  no other, with the way back in the same sentence.
*/
import { emptyBoardRead } from '../src/components/compass/emptyBoard';
import { SCANNERS, isScannerEligible } from '../src/types/compass';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const OLD = /nothing cleared the bar on this sweep/i;

// ---- the ticker filter is binding ---------------------------------------------
{
  const r = emptyBoardRead({
    scanner: 'top-setups',
    sleeve: 'weekly',
    tickerFilter: 'NVDA',
    counts: { 'top-setups': 7, discounted: 3, all: 10 },
    unfilteredCount: 7,
  });
  check('the ticker filter is named as the cut', r.cause === 'ticker');
  check('the headline carries the ticker, the lens and the tenor', /NVDA/.test(r.headline) && /Top Setups/.test(r.headline) && /Weekly/.test(r.headline));
  check('the action says how many come back when it is cleared', /7 setups/.test(r.action) && /clear/i.test(r.action));
  check('and it is not the old sentence', !OLD.test(r.headline) && !OLD.test(r.action));
}

// ---- a ticker filter that is NOT binding does not get blamed -------------------------
{
  const r = emptyBoardRead({
    scanner: 'top-setups',
    sleeve: 'weekly',
    tickerFilter: 'NVDA',
    counts: { 'top-setups': 0, discounted: 3, rebounds: 1, all: 4 },
    unfilteredCount: 0,
  });
  check('with nothing behind the filter, the LENS is the cut', r.cause === 'lens');
  check('and the filter is not mentioned as the reason', !/filter/i.test(r.headline));
}

// ---- the lens is binding ---------------------------------------------------------------
{
  const r = emptyBoardRead({
    scanner: 'whale-sweeps',
    sleeve: 'swing',
    tickerFilter: null,
    counts: { 'top-setups': 2, discounted: 5, rebounds: 1, 'whale-sweeps': 0, all: 8 },
    unfilteredCount: 0,
  });
  check('the lens is named as the cut', r.cause === 'lens');
  check('the headline names the lens and tenor', /Whale Sweeps/.test(r.headline) && /Swing/.test(r.headline));
  check('the action lists the lenses that have setups, fullest first', /Discounted 5 · Top Setups 2 · Rebounds 1/.test(r.action), r.action);
  check('"All" is never offered as an alternative lens — it is the sum, not a lens', !/\bAll \d/.test(r.action));
}

// ---- the tenor is binding ----------------------------------------------------------------
{
  const r = emptyBoardRead({
    scanner: 'all',
    sleeve: 'leaps',
    tickerFilter: null,
    counts: { 'top-setups': 0, discounted: 0, 'whale-sweeps': 0, all: 0 },
    unfilteredCount: 0,
  });
  check('with nothing on any lens the TENOR is the cut', r.cause === 'tenor');
  check('the headline says so on any lens', /LEAPS/.test(r.headline) && /any lens/i.test(r.headline));
  check('the action points at the tenor row', /tenor/i.test(r.action));
}

// ---- an ineligible lens explains itself ------------------------------------------------
{
  check('the fixture is really ineligible', !isScannerEligible('quick-scalp', 'leaps'));
  const r = emptyBoardRead({
    scanner: 'quick-scalp',
    sleeve: 'leaps',
    tickerFilter: 'SPY',
    counts: { 'top-setups': 4, all: 4 },
    unfilteredCount: 0,
  });
  check('an ineligible lens is its own cause — ahead of the ticker filter', r.cause === 'ineligible');
  check('it says the lens is not offered on the tenor', /Quick Scalp is not offered on LEAPS/.test(r.headline));
  const offered = SCANNERS.filter(s => s.key !== 'all' && isScannerEligible(s.key, 'leaps')).map(s => s.label);
  check('and lists what IS offered there', offered.every(l => r.action.includes(l)), r.action);
  check('without listing the one that is not', !/Rebounds/.test(r.action));
}

// ---- every read has both halves --------------------------------------------------------
{
  const reads = [
    emptyBoardRead({ scanner: 'top-setups', sleeve: 'odte', tickerFilter: 'AAPL', counts: { all: 3, 'top-setups': 3 }, unfilteredCount: 3 }),
    emptyBoardRead({ scanner: 'discounted', sleeve: 'odte', tickerFilter: null, counts: { all: 3, 'top-setups': 3, discounted: 0 }, unfilteredCount: 0 }),
    emptyBoardRead({ scanner: 'all', sleeve: 'odte', tickerFilter: null, counts: { all: 0 }, unfilteredCount: 0 }),
  ];
  check('every read has a headline and an action', reads.every(r => r.headline.length > 10 && r.action.length > 10));
  check('the three causes are three different sentences', new Set(reads.map(r => r.headline)).size === 3);
  check('one setup is singular', /1 setup /.test(emptyBoardRead({ scanner: 'top-setups', sleeve: 'odte', tickerFilter: 'AAPL', counts: { all: 1, 'top-setups': 1 }, unfilteredCount: 1 }).action));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
