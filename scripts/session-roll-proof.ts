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
     one uniform overnight gap, and a complete final session
  2. The first live bar ROLLS: it lands one overnight gap after the seeded
     history's last bar, exactly as the seeder spaces its sessions
  3. In-session live bars stay BAR_SECONDS apart — one roll, not a gap storm
  4. The next roll comes exactly one full session later — the cadence holds
     across a whole live day, so the session-cut features cycle forever
*/
import Simulator from '../src/core/simulator';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const bars = Simulator.getCandles('SPY')!;

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
check('PREMISE: seeded bars use one in-session spacing and one overnight gap', dts.size === 2 && gapSet.size === 1, `spacings {${[...dts].join(', ')}}`);
const OVERNIGHT = [...gapSet][0];
const SESSION_LEN = gapIdx[gapIdx.length - 1] - gapIdx[gapIdx.length - 2];
check('PREMISE: seeded sessions share one length', gapIdx.slice(1).every((g, i) => g - gapIdx[i] === SESSION_LEN), `${SESSION_LEN} bars`);
check('PREMISE: the final seeded session is complete', bars.length - gapIdx[gapIdx.length - 1] === SESSION_LEN, `${bars.length - gapIdx[gapIdx.length - 1]} of ${SESSION_LEN}`);

/* ── 2. the first live bar rolls the session ────────────────────────────── */
const TICKS_PER_BAR = 4; // one simulated bar aggregates 4 ticks (simulator.ts)
const lastSeeded = bars[bars.length - 1].time;
const seededLen = bars.length;
for (let i = 0; i < TICKS_PER_BAR; i++) Simulator.tick();
check('PREMISE: four ticks rolled exactly one new bar', bars.length === seededLen + 1, `${bars.length - seededLen} rolled`);
check('the first live bar after a complete session lands one overnight out', bars[bars.length - 1].time - lastSeeded === OVERNIGHT, `Δ ${bars[bars.length - 1].time - lastSeeded}s vs ${OVERNIGHT}s`);

/* ── 3. then the session runs at bar cadence ────────────────────────────── */
for (let i = 0; i < TICKS_PER_BAR * 3; i++) Simulator.tick();
const tail = bars.slice(-4).map(b => b.time);
check('the next bars are in-session neighbours, not more gaps', tail.every((t, i) => i === 0 || t - tail[i - 1] === BAR_SEC), tail.map((t, i) => (i ? t - tail[i - 1] : 0)).slice(1).join(','));

/* ── 4. the cadence holds: the NEXT roll is one full session later ──────── */
for (let i = 0; i < TICKS_PER_BAR * (SESSION_LEN - 4); i++) Simulator.tick();
const beforeRoll = bars[bars.length - 1].time;
for (let i = 0; i < TICKS_PER_BAR; i++) Simulator.tick();
check('one full session later the tape rolls again', bars[bars.length - 1].time - beforeRoll === OVERNIGHT, `Δ ${bars[bars.length - 1].time - beforeRoll}s`);
/* And the finished live session had exactly the seeded length. */
const liveGaps: number[] = [];
for (let i = 1; i < bars.length; i++) if (bars[i].time - bars[i - 1].time > BAR_SEC) liveGaps.push(i);
const liveLen = liveGaps[liveGaps.length - 1] - liveGaps[liveGaps.length - 2];
check('the live session it closed was one seeded-session long', liveLen === SESSION_LEN, `${liveLen} bars`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
