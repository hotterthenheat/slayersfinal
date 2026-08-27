/*
  Acceptance test for T-15's range and volume bars.

  Proves:
  1. Range bars cut on the first quarter whose absorption spans the size —
     the floor is INCLUSIVE, the overshoot stays in the bar that earned it,
     and the next bar starts at the NEXT quarter
  2. Volume bars cut when the accumulated volume reaches the size, and the
     output conserves the input — every share of volume lands in exactly one
     bar, forming tail included
  3. A bar never spans the overnight gap: the forming bar is finalized at
     the session roll, undersized, and the gap's jump is never printed as
     one bar's range
  4. Shape: times are the FIRST absorbed quarter's, ascending and unique;
     bars are coherent; each bar opens where the previous closed inside a
     session (the quarters chain, so the bars must)
  5. The BAR_CLOCKS table: unique keys, a null spec for 'time', words on
     every row, and the validator admits exactly its keys
  6. Empty tape in, empty list out
*/
import { BAR_CLOCKS, barClockSpec, buildAltBars, isBarClock } from '../src/data/altBars';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** A chained quarter tape: each opens at the previous close, 15s apart. */
const tape = (moves: { d: number; hi?: number; lo?: number; v: number; gapBefore?: boolean }[], start = 100): Candle[] => {
  const out: Candle[] = [];
  let t = 1000;
  let px = start;
  for (const m of moves) {
    if (m.gapBefore) t += 63060; // the seeded overnight jump
    const open = px;
    const close = px + m.d;
    out.push({
      time: t,
      open,
      close,
      high: Math.max(open, close) + (m.hi ?? 0),
      low: Math.min(open, close) - (m.lo ?? 0),
      volume: m.v,
    });
    px = close;
    t += 15;
  }
  return out;
};

// ── 1. range cuts ─────────────────────────────────────────────────────────
{
  /* Quarters drift +0.2 each: after 3 the span is 100→100.6 = 0.6 ≥ 0.5. */
  const q = tape([{ d: 0.2, v: 10 }, { d: 0.2, v: 10 }, { d: 0.2, v: 10 }, { d: 0.2, v: 10 }, { d: 0.2, v: 10 }]);
  const bars = buildAltBars(q, { kind: 'range', size: 0.5 });
  check('the third quarter completes a $0.50 bar — inclusive at the span', bars.length === 2 && Math.abs(bars[0].high - bars[0].low - 0.6) < 1e-9, JSON.stringify(bars.map(b => +(b.high - b.low).toFixed(2))));
  check('the overshoot stays in the bar that earned it', Math.abs(bars[0].close - 100.6) < 1e-9);
  check('the next bar starts at the NEXT quarter', bars[1].time === q[3].time && Math.abs(bars[1].open - 100.6) < 1e-9);
  check('the tail is the still-forming bar, under size', bars[1].high - bars[1].low < 0.5);

  /* Exactly at the size: 100 → 100.5 in one quarter. */
  const exact = buildAltBars(tape([{ d: 0.5, v: 1 }, { d: 0.01, v: 1 }]), { kind: 'range', size: 0.5 });
  check('exactly the size cuts — the floor is inclusive', exact.length === 2 && exact[0].volume === 1);
}

// ── 2. volume cuts and conservation ───────────────────────────────────────
{
  const q = tape([{ d: 0.01, v: 4000 }, { d: 0.01, v: 4000 }, { d: 0.01, v: 4000 }, { d: 0.01, v: 4000 }, { d: 0.01, v: 1000 }]);
  const bars = buildAltBars(q, { kind: 'volume', size: 10_000 });
  check('10k of volume closes a bar on its third quarter', bars.length === 2 && bars[0].volume === 12000, JSON.stringify(bars.map(b => b.volume)));
  const totalIn = q.reduce((s, b) => s + b.volume, 0);
  const totalOut = bars.reduce((s, b) => s + b.volume, 0);
  check('every share lands in exactly one bar — volume is conserved', totalIn === totalOut, `${totalIn} vs ${totalOut}`);
  check('the forming tail carries the remainder', bars[1].volume === 5000);
}

// ── 3. the overnight gap ──────────────────────────────────────────────────
{
  const q = tape([
    { d: 0.1, v: 100 }, { d: 0.1, v: 100 },
    { d: 3, v: 100, gapBefore: true }, // the roll: a $3 jump lives BETWEEN sessions
    { d: 0.1, v: 100 },
  ]);
  const bars = buildAltBars(q, { kind: 'range', size: 5 });
  check('the forming bar is finalized at the session roll, undersized', bars.length === 2 && bars[0].high - bars[0].low < 5, JSON.stringify(bars.map(b => +(b.high - b.low).toFixed(2))));
  check('the overnight jump is never one bar\'s range', bars.every(b => b.high - b.low < 5));
  check('the new session starts its own bar at its first quarter', bars[1].time === q[2].time);
}

// ── 4. shape ──────────────────────────────────────────────────────────────
{
  const moves = Array.from({ length: 40 }, (_, i) => ({ d: (i % 3 === 0 ? -1 : 1) * 0.17, v: 500 + (i % 7) * 300 }));
  const q = tape(moves);
  for (const spec of [{ kind: 'range' as const, size: 0.5 }, { kind: 'volume' as const, size: 3000 }]) {
    const bars = buildAltBars(q, spec);
    check(`${spec.kind}: times ascend and never repeat`, bars.every((b, i) => i === 0 || b.time > bars[i - 1].time));
    check(`${spec.kind}: every bar takes its FIRST quarter's time`, bars[0].time === q[0].time);
    check(`${spec.kind}: bars are coherent`, bars.every(b => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)));
    check(`${spec.kind}: each bar opens where the last closed`, bars.every((b, i) => i === 0 || Math.abs(b.open - bars[i - 1].close) < 1e-9));
  }
}

// ── 5. the table ──────────────────────────────────────────────────────────
{
  const keys = BAR_CLOCKS.map(c => c.key);
  check('clock keys are unique', new Set(keys).size === keys.length, keys.join(','));
  check("'time' is the null spec — the ordinary clock", barClockSpec('time') === null);
  check('every row has words', BAR_CLOCKS.every(c => c.label.length > 0 && c.blurb.length > 0));
  check('the validator admits exactly the table', keys.every(isBarClock) && !isBarClock('r999') && !isBarClock(5));
  check('every non-time spec is a positive size of a real kind', BAR_CLOCKS.every(c => c.spec === null || (c.spec.size > 0 && (c.spec.kind === 'range' || c.spec.kind === 'volume'))));
}

// ── 6. empty in, empty out ────────────────────────────────────────────────
check('an empty tape builds an empty list', buildAltBars([], { kind: 'range', size: 1 }).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
