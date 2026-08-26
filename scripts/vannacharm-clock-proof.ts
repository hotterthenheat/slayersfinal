/*
  P-0 — THE CHARM CLOCK TICKS.

  `data/vannacharm.ts` held `const HOURS_TO_CLOSE = 3`, feeding
  `t = HOURS_TO_CLOSE / 6.5`. `t` was therefore always 0.4615, and the charm
  projection at 09:35 was byte-identical to the one at 15:55 — on a page about
  where exposure migrates as TIME shifts, on a 0DTE product, where the last
  hour is where charm does nearly all of its work.

  The assertion the directive asks for is the one below: a session with six
  hours left and one with half an hour left must not project the same map. The
  pre-fix code cannot tell them apart, which is the bug stated as a test.

  Run: npx tsx scripts/vannacharm-clock-proof.ts
*/
import Simulator from '../src/core/simulator';
import { buildVannaCharm } from '../src/data/vannacharm';
import { RTH_HOURS, RTH_MINUTES } from '../src/core/calendar';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const snap = Simulator.snapshotFor('SPY');
const rows = (h: number) =>
  buildVannaCharm(snap, 'CHARM', 1, 10, h).rows.map(r => r.projected);

const open = rows(6.0);
const close = rows(0.5);

check(
  'a session with 6h left and one with 30m left do not project the same map',
  JSON.stringify(open) !== JSON.stringify(close),
  `${open.length} strikes compared`
);

/* Not merely different — different in the RIGHT DIRECTION. Charm is decay, so
   more time left means more of it still to come: the projection must sit
   FURTHER from where the book is now. Without this, any wiring that made the
   two differ at all would pass, including one that ignored the clock and
   varied on a hash. */
const now = buildVannaCharm(snap, 'CHARM', 1, 10, 6.0).rows.map(r => r.current);
const drift = (proj: number[]) =>
  proj.reduce((sum, v, i) => sum + Math.abs(v - now[i]), 0);
const driftOpen = drift(open);
const driftClose = drift(close);
check(
  'and more time left means more decay still to come',
  driftOpen > driftClose,
  `6h drifts ${driftOpen.toExponential(3)} vs 30m ${driftClose.toExponential(3)}`
);

/* The clock is CLAMPED, not trusted. `readSessionClock` returns zero after the
   bell and a replay can hand back anything; a negative fraction would run the
   decay backwards — walls migrating AWAY from the money as the day ends, which
   would read as a working feature. */
for (const bad of [-4, Number.NaN, 99]) {
  const r = rows(bad);
  check(
    `an impossible clock (${bad}) still yields a finite map`,
    r.length > 0 && r.every(v => Number.isFinite(v)),
    `${r.filter(v => !Number.isFinite(v)).length} non-finite`
  );
}
check(
  'a clock past the open is the same as a full session, not more than one',
  JSON.stringify(rows(99)) === JSON.stringify(rows(RTH_HOURS)),
  'clamped at the session length'
);
check(
  'a clock past the bell is the same as no time left',
  JSON.stringify(rows(-4)) === JSON.stringify(rows(0)),
  'clamped at zero'
);

/* The session length is ONE fact. It was a bare 6.5 in three modules and the
   derived 390 in a fourth. */
check('the calendar owns the session length', RTH_HOURS === 6.5 && RTH_MINUTES === 390, `${RTH_HOURS}h / ${RTH_MINUTES}m`);

/* The default preserves every call site that has not been pointed at a clock
   yet, so this change moved no surface on its own. */
check(
  'the default is the posture every existing caller already had',
  JSON.stringify(buildVannaCharm(snap, 'CHARM', 1, 10).rows.map(r => r.projected)) ===
    JSON.stringify(rows(3)),
  '3h, unchanged'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
