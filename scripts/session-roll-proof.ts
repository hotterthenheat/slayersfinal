/*
  Acceptance test for the simulator's LIVE session roll.

  Before T-9 the live tape never rolled: seeding laid down SESSIONS complete
  days with overnight gaps, then updateCandles appended 60-second bars
  forever — so the seeded past had sessions and the live future was one
  endless day. Every session-cut consumer starved quietly after ~26 wall
  minutes of uptime (390 bars at ~4s each): "prior day" stopped advancing,
  the opening range never re-formed, and the expected-move cone's forward
  half stayed collapsed because RTH_MINUTES − elapsed never went positive
  again.

  Proves, against the ACTUAL simulator ticking:
  1. PREMISE — the seeded history's own shape: uniform in-session spacing,
     two kinds of gap (a night and a weekend), and every session opening at
     09:30 in the exchange's own zone
  2. The first live bar ROLLS: it opens the next session the calendar allows
  3. In-session live bars stay BAR_SECONDS apart — one roll, not a gap storm
  4. The next roll comes exactly one full session later — the cadence holds
     across a whole live day, so the session-cut features cycle forever

  WHY A SESSION'S PLACE ON THE CLOCK IS PINNED HERE. The tape had sessions
  and put them nowhere in particular: the seed anchored to `Date.now()`, so a
  session opened at whatever minute the app booted at, and measured on the
  build before this every single bar fell between 17:00 and 00:59 New York
  with not one inside 09:30-16:00. Nothing said so, because nothing asked.
  Every session-aware thing on the desk was reading a tape that never traded
  during the day it claimed to.
*/
import Simulator from '../src/core/simulator';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const bars = Simulator.getCandles('SPY')!;

/* The exchange's own clock, which is the only one a session means anything
   in — a UTC day boundary lands mid-afternoon in New York. */
const nyFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York', hour12: false,
  weekday: 'short', hour: '2-digit', minute: '2-digit',
});
const nyOf = (sec: number): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const p of nyFmt.formatToParts(new Date(sec * 1000))) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
};
const opensTheBell = (sec: number): boolean => {
  const p = nyOf(sec);
  return p.hour === '09' && p.minute === '30';
};
const isWeekday = (sec: number): boolean => {
  const d = nyOf(sec).weekday;
  return d !== 'Sat' && d !== 'Sun';
};

/* ── 1. the seeded shape, measured off the history itself ─────────────────
   The proof re-derives the session length and the overnight gap from the
   bars rather than importing private constants — the claim is that the live
   roll matches THE HISTORY'S OWN shape, whatever that shape is. */
const dts = new Set<number>();
const gapIdx: number[] = [];
for (let i = 1; i < bars.length; i++) {
  const dt = bars[i].time - bars[i - 1].time;
  dts.add(dt);
  if (dt > 60) gapIdx.push(i);
}
const BAR_SEC = Math.min(...dts);
const gapSet = new Set(gapIdx.map(i => bars[i].time - bars[i - 1].time));
/* TWO gaps, not one: a night, and a weekend. A single gap size was the old
   shape and it could only be produced by opening sessions on Saturdays. */
check('PREMISE: seeded bars use one in-session spacing and two kinds of gap',
  dts.size === 3 && gapSet.size === 2, `spacings {${[...dts].sort((a, b) => a - b).join(', ')}}`);
const OVERNIGHT = Math.min(...gapSet);
const WEEKEND = Math.max(...gapSet);
check('  · and the weekend is the night plus the two days nobody trades',
  WEEKEND - OVERNIGHT === 2 * 86400, `${OVERNIGHT}s vs ${WEEKEND}s`);

/* THE INVARIANT THIS PROOF EXISTS FOR NOW. */
const opens = [bars[0].time, ...gapIdx.map(i => bars[i].time)];
check('every session opens at 09:30 in the exchange zone', opens.every(opensTheBell),
  `${opens.filter(opensTheBell).length}/${opens.length} — first ${nyOf(opens[0]).weekday} ${nyOf(opens[0]).hour}:${nyOf(opens[0]).minute}`);
check('and none of them opens on a weekend', opens.every(isWeekday),
  `${[...new Set(opens.map(t => nyOf(t).weekday))].join(' ')}`);
check('so every bar on the tape falls inside 09:30-16:00',
  bars.every(b => { const p = nyOf(b.time); const hhmm = Number(p.hour) * 100 + Number(p.minute); return hhmm >= 930 && hhmm < 1600; }),
  `${bars.length} bars`);

const SESSION_LEN = gapIdx[gapIdx.length - 1] - gapIdx[gapIdx.length - 2];
check('PREMISE: seeded sessions share one length', gapIdx.slice(1).every((g, i) => g - gapIdx[i] === SESSION_LEN), `${SESSION_LEN} bars`);
/* The LAST session is the one the clock is in, so it is complete only when
   the bell has already rung. Asserting it is always complete would be a
   proof that passes or fails by the hour it is run at. */
const tailBars = bars.length - gapIdx[gapIdx.length - 1];
check('PREMISE: the final seeded session is complete, or the clock is still in it',
  tailBars === SESSION_LEN || tailBars < SESSION_LEN,
  `${tailBars} of ${SESSION_LEN}`);

/* ── 2. the first live bar rolls the session ────────────────────────────── */
const TICKS_PER_BAR = 4; // one simulated bar aggregates 4 ticks (simulator.ts)
const lastSeeded = bars[bars.length - 1].time;
const seededLen = bars.length;
for (let i = 0; i < TICKS_PER_BAR; i++) Simulator.tick();
check('PREMISE: four ticks rolled exactly one new bar', bars.length === seededLen + 1, `${bars.length - seededLen} rolled`);
const rolledBy = bars[bars.length - 1].time - lastSeeded;
/* Either gap is correct — which one depends on the weekday the seeded tape
   happened to end on, and both open the next session at the bell. A plain
   bar step is correct too, and means the clock is mid-session: the tape is
   seeded up to NOW, so there is nothing to roll yet. */
const midSession = rolledBy === BAR_SEC;
check('the first live bar carries the session on, or opens the next one',
  (rolledBy === OVERNIGHT || rolledBy === WEEKEND || midSession),
  `Δ ${rolledBy}s (night ${OVERNIGHT}s · weekend ${WEEKEND}s · in-session ${BAR_SEC}s)`);
/* THE DETAIL HAS TO BE TRUE IN BOTH BRANCHES. This printed the bar's clock
   under the words "opens it at the bell" whichever branch it took, so
   mid-session it passed while reporting "Thu 11:51" — a line that argues
   with itself, and the kind of message that makes a real failure beside it
   unreadable. */
check('  · and when it IS a roll, it opens at the bell on a weekday',
  midSession || (opensTheBell(bars[bars.length - 1].time) && isWeekday(bars[bars.length - 1].time)),
  midSession
    ? `no roll to make — the clock is mid-session, ${tailBars} of ${SESSION_LEN} bars in`
    : `${nyOf(bars[bars.length - 1].time).weekday} ${nyOf(bars[bars.length - 1].time).hour}:${nyOf(bars[bars.length - 1].time).minute}`);

/* ── 3. then the session runs at bar cadence ────────────────────────────── */
for (let i = 0; i < TICKS_PER_BAR * 3; i++) Simulator.tick();
const tail = bars.slice(-4).map(b => b.time);
check('the next bars are in-session neighbours, not more gaps', tail.every((t, i) => i === 0 || t - tail[i - 1] === BAR_SEC), tail.map((t, i) => (i ? t - tail[i - 1] : 0)).slice(1).join(','));

/* ── 4. the cadence holds: the next roll lands at the next bell ──────────
   COUNTED TO THE BOUNDARY, NOT A FIXED NUMBER OF BARS.

   This ticked `SESSION_LEN - 4` bars and asserted the step after them was a
   gap. That is only true when the seeded tape ended exactly at a session
   close, and it does not: the tape is seeded up to NOW. Whenever the clock
   is inside 09:30-16:00 the last seeded bar is mid-session, the boundary
   arrives EARLIER than a full session away, and the bar this landed on was
   an ordinary in-session minute.

   Measured: green on every CI run that started before the opening bell —
   07:01, 08:07 and 09:05 New York — and red on the two that started at
   10:54 and 10:59. A proof whose answer depends on the hour it is run at is
   reporting the clock rather than the code, which is the exact trap the
   PREMISE thirty lines above is written to avoid. I wrote both.

   Ticking to the boundary is the claim it was always trying to make: the
   next roll comes within one session, and it opens at the bell. */
let rolledAgain = 0;
let barsRun = 0;
while (rolledAgain === 0 && barsRun < SESSION_LEN + 2) {
  const before = bars[bars.length - 1].time;
  for (let i = 0; i < TICKS_PER_BAR; i++) Simulator.tick();
  barsRun++;
  const step = bars[bars.length - 1].time - before;
  if (step !== BAR_SEC) rolledAgain = step;
}
check('the cadence holds — the tape rolls again within one session',
  rolledAgain === OVERNIGHT || rolledAgain === WEEKEND,
  `Δ ${rolledAgain}s after ${barsRun} bars, session is ${SESSION_LEN}`);
check('  · to the bell again, on a weekday again',
  opensTheBell(bars[bars.length - 1].time) && isWeekday(bars[bars.length - 1].time),
  `${nyOf(bars[bars.length - 1].time).weekday} ${nyOf(bars[bars.length - 1].time).hour}:${nyOf(bars[bars.length - 1].time).minute}`);
/* And the finished live session had exactly the seeded length. */
const liveGaps: number[] = [];
for (let i = 1; i < bars.length; i++) if (bars[i].time - bars[i - 1].time > BAR_SEC) liveGaps.push(i);
const liveLen = liveGaps[liveGaps.length - 1] - liveGaps[liveGaps.length - 2];
check('the live session it closed was one seeded-session long', liveLen === SESSION_LEN, `${liveLen} bars`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
