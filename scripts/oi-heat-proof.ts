/*
  Acceptance test for P-8's ΔOI heat.

  Every other exposure surface here is a snapshot; this one is the flow, and
  a flow surface has two ways to lie that a snapshot does not. It can read
  ABSENCE as zero — a snapshot with no OI on it looking like a quiet strike
  — and it can read a strike that was built and unwound inside one bucket as
  activity when the net was nothing. Both are staged below.

  Proves:
  1. Cells carry CHANGE, not level: a strike parked at a constant OI all day
     reads as zero everywhere, however large that OI is
  2. Building reads positive, unwinding negative, and the calls/puts split
     is carried rather than summed away
  3. A bucket's value is its NET: built then unwound inside one bucket is
     nothing, not twice something
  4. A strike that appears mid-session is kept — that is the building this
     surface exists to show, not a row to drop for missing snapshot one
  5. TODAY ONLY, by the bars' own session cut — yesterday's changes are not
     in the grid
  6. ABSENCE IS NOT ZERO: snapshots with no OI report hasOi false and no
     rows, rather than a grid of quiet cells
  7. The FLEX field is null, never 0 — "we cannot see transfers" is not the
     same claim as "no transfers happened"
  8. The heat scale is the largest |cell|, so building and unwinding are
     read on one symmetric ruler
*/
import { buildOiHeat, rowWords } from '../src/data/oiHeat';
import type { Candle, GexSnapshot } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_760_000_000 - (1_760_000_000 % 60);
/* Two sessions a day apart, 20 one-minute bars each. */
const bars: Candle[] = [];
for (let d = 0; d < 2; d++)
  for (let i = 0; i < 20; i++)
    bars.push({ time: T0 + d * 86400 + i * 60, open: 100, high: 100, low: 100, close: 100, volume: 1 });
const todayAt = (i: number) => T0 + 86400 + i * 60;

const snap = (time: number, entries: [number, number, number][]): GexSnapshot => ({
  time,
  levels: entries.map(([strike, callOI, putOI]) => ({ strike, value: 0, callOI, putOI })),
});

// ── 1+2+8. change, not level ──────────────────────────────────────────────
{
  const snaps = [
    snap(todayAt(0), [[100, 40_000, 40_000], [101, 1_000, 1_000], [102, 5_000, 5_000]]),
    snap(todayAt(9), [[100, 40_000, 40_000], [101, 3_000, 1_500], [102, 2_000, 5_000]]),
    snap(todayAt(19), [[100, 40_000, 40_000], [101, 6_000, 2_000], [102, 500, 5_000]]),
  ];
  const heat = buildOiHeat(snaps, bars, 4);
  check('PREMISE: a grid builds', heat.rows.length === 3 && heat.columns.length === 4, `${heat.rows.length} rows`);

  const parked = heat.rows.find(r => r.strike === 100)!;
  check(
    'a strike parked at 80,000 contracts reads zero everywhere — level is not change',
    parked.cells.every(c => c.deltaOi === 0) && parked.netToday === 0
  );

  const built = heat.rows.find(r => r.strike === 101)!;
  check('a shelf being added to reads positive', built.netToday > 0, String(built.netToday));
  check('and its calls/puts split is carried, not summed away', built.cells.some(c => c.deltaCall !== 0 && c.deltaPut !== 0));
  check('the split sums to the total', built.cells.every(c => c.deltaCall + c.deltaPut === c.deltaOi));

  const bleeding = heat.rows.find(r => r.strike === 102)!;
  check('a shelf bleeding reads negative', bleeding.netToday < 0, String(bleeding.netToday));
  check('the words name which it is', /being added to/.test(rowWords(built)) && /bleeding/.test(rowWords(bleeding)));
  check('and an unchanged row says so', rowWords(parked) === 'unchanged today');

  const biggest = Math.max(...heat.rows.flatMap(r => r.cells.map(c => Math.abs(c.deltaOi))));
  check('the heat scale is the largest |cell| — one symmetric ruler', heat.maxAbs === biggest, String(heat.maxAbs));
}

// ── 3. net inside a bucket ────────────────────────────────────────────────
{
  /* Built to 9,000 then back to 1,000 inside ONE bucket: net zero. */
  const snaps = [
    snap(todayAt(0), [[101, 1_000, 0]]),
    snap(todayAt(1), [[101, 9_000, 0]]),
    snap(todayAt(2), [[101, 1_000, 0]]),
  ];
  const heat = buildOiHeat(snaps, bars, 1);
  check('built and unwound inside one bucket is NOTHING, not twice something', heat.rows[0].cells[0].deltaOi === 0, String(heat.rows[0].cells[0].deltaOi));
}

// ── 4. a strike that arrives mid-session ──────────────────────────────────
{
  const snaps = [
    snap(todayAt(0), [[100, 1_000, 1_000]]),
    snap(todayAt(10), [[100, 1_000, 1_000], [105, 4_000, 0]]),
    snap(todayAt(19), [[100, 1_000, 1_000], [105, 9_000, 0]]),
  ];
  const heat = buildOiHeat(snaps, bars, 4);
  check('a strike that appears mid-session is kept', heat.rows.some(r => r.strike === 105));
  check('— and its building is what the grid shows', (heat.rows.find(r => r.strike === 105)?.netToday ?? 0) > 0);
}

// ── 5. today only ─────────────────────────────────────────────────────────
{
  const snaps = [
    snap(T0 + 60, [[101, 1_000, 0]]),            // yesterday
    snap(T0 + 19 * 60, [[101, 90_000, 0]]),      // a huge build, yesterday
    snap(todayAt(0), [[101, 90_000, 0]]),
    snap(todayAt(19), [[101, 91_000, 0]]),
  ];
  const heat = buildOiHeat(snaps, bars, 2);
  check("yesterday's build is not in today's grid", heat.rows[0].netToday === 1_000, String(heat.rows[0].netToday));
  check('and the columns start at today', heat.columns[0] >= todayAt(0));
}

// ── 6+7. absence is not zero ──────────────────────────────────────────────
{
  const noOi: GexSnapshot[] = [
    { time: todayAt(0), levels: [{ strike: 101, value: 5 }] },
    { time: todayAt(19), levels: [{ strike: 101, value: 6 }] },
  ];
  const heat = buildOiHeat(noOi, bars, 4);
  check('snapshots with no OI report hasOi false', heat.hasOi === false);
  check('— and no rows, rather than a grid of quiet cells', heat.rows.length === 0);

  const real = buildOiHeat([snap(todayAt(0), [[101, 1, 1]]), snap(todayAt(19), [[101, 2, 2]])], bars, 2);
  check('a real grid reports hasOi true', real.hasOi === true);
  check('FLEX is null, never 0 — absence is not a claim of zero', real.rows[0].cells.every(c => c.flexTransfer === null));
  check('and hasFlex says the split is not on this account', real.hasFlex === false);
}

// ── degenerate ────────────────────────────────────────────────────────────
{
  check('one snapshot is not a change', buildOiHeat([snap(todayAt(0), [[101, 1, 1]])], bars, 4).rows.length === 0);
  check('no snapshots at all is empty, not a throw', buildOiHeat([], bars, 4).rows.length === 0);
  check('zero buckets is refused', buildOiHeat([snap(todayAt(0), [[101, 1, 1]]), snap(todayAt(9), [[101, 2, 2]])], bars, 0).rows.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
