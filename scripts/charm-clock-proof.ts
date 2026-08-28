/*
  Acceptance test for P-15's charm clock.

  The whole surface rests on one claim: charm is NOT paid evenly through the
  session, it accelerates into the bell. If the strip advanced linearly it
  would be a clock wearing a charm label, and it would tell a reader the
  opposite of the truth mid-afternoon. So the assertions are about the shape
  of the curve, not about any particular number.

  Proves:
  1. The boundaries are exact: nothing realized at the open, everything at
     the bell
  2. Charm RUNS BEHIND THE CLOCK at every moment inside the session — the
     non-obvious fact, asserted across the whole span rather than at a point
  3. The curve is the √τ one specifically: at the halfway bell √0.5 of the
     day's charm is still ahead, not half
  4. The last half hour of a 390-minute session carries more than a quarter
     of the day's decay — the figure the strip exists to show
  5. It is monotone: charm realized never goes backwards as time passes
  6. Out-of-range and degenerate inputs clamp rather than producing
     nonsense shares
*/
import { buildCharmClock, charmClockWords } from '../src/data/charmClock';
import { RTH_MINUTES } from '../src/core/calendar';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── 1. the boundaries ─────────────────────────────────────────────────────
{
  const open = buildCharmClock(0);
  check('at the open nothing has been paid', near(open.realizedShare, 0) && near(open.remainingShare, 1));
  const bell = buildCharmClock(RTH_MINUTES);
  check('at the bell everything has', near(bell.realizedShare, 1) && near(bell.remainingShare, 0));
  check('and the words say so at each end', /still ahead/.test(charmClockWords(open)) && /all of today’s charm has been paid/.test(charmClockWords(bell)));
}

// ── 2. charm runs BEHIND the clock, everywhere inside ─────────────────────
{
  let behindEverywhere = true;
  let worst = { at: 0, gap: 0 };
  for (let m = 1; m < RTH_MINUTES; m++) {
    const c = buildCharmClock(m);
    if (!(c.realizedShare < c.clockShare)) behindEverywhere = false;
    const gap = c.clockShare - c.realizedShare;
    if (gap > worst.gap) worst = { at: m, gap };
  }
  check(
    'charm realized runs BEHIND the clock at every minute of the session',
    behindEverywhere,
    `widest gap ${(worst.gap * 100).toFixed(1)}pts at minute ${worst.at}`
  );
  /* A linear strip would be exactly equal everywhere — the assertion above
     is what separates this from a clock. */
  check('— so it is not a linear clock in disguise', !near(buildCharmClock(RTH_MINUTES / 2).realizedShare, 0.5, 1e-3));
}

// ── 3. the √τ curve specifically ──────────────────────────────────────────
{
  const half = buildCharmClock(RTH_MINUTES / 2);
  check('at the halfway bell, √0.5 of the charm is still ahead', near(half.remainingShare, Math.sqrt(0.5)), String(half.remainingShare));
  check('so barely 29% has been paid, not 50%', near(half.realizedShare, 1 - Math.sqrt(0.5)));
  const quarter = buildCharmClock(RTH_MINUTES * 0.75);
  check('three-quarters through, half the charm is still ahead', near(quarter.remainingShare, Math.sqrt(0.25)) && near(quarter.remainingShare, 0.5));
}

// ── 4. the last half hour ─────────────────────────────────────────────────
{
  const atThirtyLeft = buildCharmClock(RTH_MINUTES - 30);
  check(
    'the last 30 minutes carry more than a quarter of the day’s decay',
    atThirtyLeft.remainingShare > 0.25,
    `${(atThirtyLeft.remainingShare * 100).toFixed(1)}% left in the last ${(30 / RTH_MINUTES * 100).toFixed(1)}% of the session`
  );
}

// ── 5. monotone ───────────────────────────────────────────────────────────
{
  let monotone = true;
  let prev = -1;
  for (let m = 0; m <= RTH_MINUTES; m += 5) {
    const r = buildCharmClock(m).realizedShare;
    if (r < prev) monotone = false;
    prev = r;
  }
  check('charm realized never goes backwards', monotone);
}

// ── 6. clamping ───────────────────────────────────────────────────────────
{
  const before = buildCharmClock(-50);
  check('a moment before the open clamps to the open', before.elapsed === 0 && near(before.realizedShare, 0));
  const after = buildCharmClock(RTH_MINUTES + 500);
  check('past the bell clamps to the bell', after.elapsed === RTH_MINUTES && near(after.realizedShare, 1));
  const custom = buildCharmClock(60, 120);
  check('a custom session length is honoured', near(custom.clockShare, 0.5) && near(custom.remainingShare, Math.sqrt(0.5)));
  const bad = buildCharmClock(60, 0);
  check('a zero-length session falls back to RTH rather than dividing by zero', Number.isFinite(bad.realizedShare) && bad.elapsed === 60);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
