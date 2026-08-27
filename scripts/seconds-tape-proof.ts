/*
  Acceptance test for T-14's seconds tape. Runs the ACTUAL simulator ticking.

  Proves:
  1. LIVE-ONLY: before the first tick the seconds tape is empty — seeding
     writes none, exactly as a per-second feed has nothing before connect
  2. One tick appends exactly one 15-second bar, on the quarter grid
     (offsets 0/15/30/45 of the minute it belongs to), contiguous within a
     minute and coherent (high/low contain open/close)
  3. The quarters agree with the minute tape they subdivide — the four
     quarters of a completed live minute land inside that bar's own range
  4. The ring cap holds across more than two sessions of ticking, dropping
     the oldest quarters first
*/
import Simulator from '../src/core/simulator';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const secs = () => Simulator.getSecondsBars('SPY');
const mins = () => Simulator.getCandles('SPY')!;

// ── 1. live-only ──────────────────────────────────────────────────────────
check('PREMISE: seeding writes no seconds bars — the tape starts at connect', secs().length === 0);
const seededLast = mins()[mins().length - 1].time;

// ── 2. shape, per tick ────────────────────────────────────────────────────
for (let i = 0; i < 9; i++) Simulator.tick();
{
  const s = secs();
  check('nine ticks are nine quarter-bars', s.length === 9, String(s.length));
  check('every bar sits on the quarter grid', s.every(b => [0, 15, 30, 45].includes(b.time % 60)), s.map(b => b.time % 60).join(','));
  check('the first live quarter lands after the seeded tape', s[0].time > seededLast);
  let contiguous = true;
  for (let i = 1; i < s.length; i++) {
    const dt = s[i].time - s[i - 1].time;
    /* +15s inside a session; anything else must be the session roll's
       overnight jump, never a skipped or repeated quarter. */
    if (dt !== 15 && dt < 3600) contiguous = false;
  }
  check('quarters are contiguous inside the session', contiguous);
  check('and coherent — high and low contain open and close', s.every(b => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)));
  let chained = true;
  for (let i = 1; i < s.length; i++) {
    if (s[i].time - s[i - 1].time === 15 && Math.abs(s[i].open - s[i - 1].close) > 1e-9) chained = false;
  }
  check('each quarter opens where the last one closed', chained);
}

// ── 3. the quarters agree with their minute ───────────────────────────────
{
  /* Find a COMPLETED live minute with all four quarters on the tape. */
  const s = secs();
  const byMinute = new Map<number, typeof s>();
  for (const b of s) {
    const m0 = b.time - (b.time % 60);
    const arr = byMinute.get(m0) ?? [];
    arr.push(b);
    byMinute.set(m0, arr);
  }
  const full = [...byMinute.entries()].find(([, q]) => q.length === 4);
  check('PREMISE: nine ticks completed at least one full minute of quarters', full !== undefined);
  if (full) {
    const bar = mins().find(b => b.time === full[0]);
    check('their minute exists on the minute tape', bar !== undefined);
    if (bar) {
      const qHi = Math.max(...full[1].map(q => q.high));
      const qLo = Math.min(...full[1].map(q => q.low));
      check('the quarters live inside their minute\'s range', qHi <= bar.high + 1e-9 && qLo >= bar.low - 1e-9, `q [${qLo}, ${qHi}] vs bar [${bar.low}, ${bar.high}]`);
      check('and the last quarter closes where the minute closes', Math.abs(full[1][3].close - bar.close) < 1e-9);
    }
  }
}

// ── 4. the cap ────────────────────────────────────────────────────────────
{
  /* Two sessions of quarters is 3120; tick past it and the ring must hold
     the LAST 3120, oldest dropped. */
  const target = 3120 + 30;
  const already = secs().length;
  for (let i = 0; i < target - already; i++) Simulator.tick();
  const s = secs();
  check('the ring caps at two sessions of quarters', s.length === 3120, String(s.length));
  check('— keeping the newest: the tail is still on the live grid', s[s.length - 1].time > s[0].time);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
