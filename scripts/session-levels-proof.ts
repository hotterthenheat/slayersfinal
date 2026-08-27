/*
  Acceptance test for T-6's session levels. Runs the ACTUAL module — no
  browser, no React, no simulator.

  Proves:
  1. The prior day's high, low and close come from the PRIOR session, cut at
     the same boundary the VWAP re-anchors on
  2. The opening range is bounded by the CLOCK rather than by a bar count,
     and the reason that difference is not observable yet is recorded rather
     than tested around — the session-boundary rule has no calendar behind it
     (T-16), so a hole inside a session currently starts a new one
  3. A forming range is returned AND flagged as forming, so a caller can say
     which it is rather than drawing a settled line over a moving one
  4. The initial balance is the first hour, and only the first hour
  5. A first-ever session has no prior day rather than a fabricated one
  6. No data is an empty answer, not a throw
*/
import {
  INITIAL_BALANCE_MIN,
  OPENING_RANGES,
  buildSessionLevels,
  type SessionLevelKey,
} from '../src/data/sessionLevels';
import { sessionStarts, vwapSeries } from '../src/data/indicators';
import type { Candle } from '../src/types/market';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const T0 = 1_700_000_000;
const priceOf = (ls: { key: SessionLevelKey; price: number }[], k: SessionLevelKey) => ls.find(l => l.key === k)?.price;

/** A session of `n` one-minute bars whose closes follow `shape(i)`. */
const session = (n: number, start: number, shape: (i: number) => number): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = shape(i);
    return { time: start + i * 60, open: c, high: c + 1, low: c - 1, close: c, volume: 100 };
  });

const DAY = 24 * 3600;

// ── 1. the prior day ───────────────────────────────────────────────────────
{
  /* Yesterday ran 100 → 120 and closed at 120; today opens at 200. */
  const yest = session(390, T0, i => 100 + (20 * i) / 389);
  const today = session(90, T0 + DAY, () => 200);
  const all = [...yest, ...today];

  check('PREMISE: the two days really are two sessions to the shared rule', sessionStarts(all, 1).length === 2, JSON.stringify(sessionStarts(all, 1)));

  const s = buildSessionLevels(all, 15);
  check('the prior high is yesterday’s high, not today’s', priceOf(s.levels, 'prevHigh') === 121, String(priceOf(s.levels, 'prevHigh')));
  check('the prior low is yesterday’s low', priceOf(s.levels, 'prevLow') === 99, String(priceOf(s.levels, 'prevLow')));
  check('the prior close is yesterday’s last close', priceOf(s.levels, 'prevClose') === 120, String(priceOf(s.levels, 'prevClose')));
  check('and today’s own range is nowhere in them', priceOf(s.levels, 'prevHigh') !== 201, String(priceOf(s.levels, 'prevHigh')));
  check('the session it cut from is today’s open', s.sessionStart === T0 + DAY, String(s.sessionStart));

  /* The boundary is the one the VWAP uses — asserted rather than assumed,
     because two copies of it drifting apart is the failure this shares a
     helper to avoid. */
  const v = vwapSeries(all, 1);
  check(
    'the VWAP re-anchored at the same bar this cut the day at',
    Math.abs(v[390] - 200) < 1e-9,
    `vwap at the first bar of today is ${v[390].toFixed(4)}`
  );
}

// ── 2 & 3. the opening range is a clock, and says when it is still forming ──
{
  /* Today: the first 15 minutes run 50 → 65, then it collapses to 10. An
     opening range read from the clock cannot see the collapse. */
  const today = session(120, T0, i => (i < 15 ? 50 + i : 10));
  for (const or of OPENING_RANGES) {
    const s = buildSessionLevels(today, or);
    const hi = priceOf(s.levels, 'orHigh');
    const lo = priceOf(s.levels, 'orLow');
    /* The collapse starts at minute 15, so OR5 and OR15 never see it and
       OR30 does — which is the point of reading the clock rather than the
       shape of the session. */
    const expectHi = or === 5 ? 55 : 65;
    const expectLo = or === 30 ? 9 : 49;
    check(`OR${or} takes exactly the first ${or} minutes`, hi === expectHi && lo === expectLo, `${lo}..${hi}`);
    check(`OR${or} on a two-hour session is complete`, s.orComplete && s.orElapsed === or, `${s.orElapsed}/${or}`);
  }

  /*
    A HOLE INSIDE A SESSION READS AS A NEW SESSION — recorded here as the
    CURRENT behaviour, not asserted as the right one.

    The boundary rule is "a step of more than 1.5× the bar's own length",
    which for 1-minute bars is ninety seconds: any missing minute — a halt, a
    thin name, a feed hiccup — starts a new day as far as this and the VWAP
    are both concerned. Nothing on screen is wrong today, because the
    simulator's sessions are contiguous 390-bar runs and no intra-session hole
    exists to trip it.

    The rule cannot be fixed by choosing a bigger number: it has to be
    scale-relative or a DAILY series would re-anchor its VWAP on every bar,
    and no scale-relative threshold separates a two-hour halt from a
    seventeen-hour night. What separates them is a calendar that knows when
    the market was open, which `core/calendar.ts` does not have — it knows
    trading DAYS, holidays and expiries and nothing intraday. That is T-16.

    Pinned so the day it changes, it changes on purpose.
  */
  const gappy = [...session(4, T0, i => 50 + i), ...session(6, T0 + 10 * 60, () => 90)];
  check(
    'KNOWN LIMIT: a six-minute hole cuts the session, because the rule has no calendar behind it (T-16)',
    sessionStarts(gappy, 1).length === 2,
    JSON.stringify(sessionStarts(gappy, 1))
  );
  const afterHole = buildSessionLevels(gappy, 15);
  check(
    'and the levels then describe the run after the hole, consistently with the VWAP',
    afterHole.sessionStart === T0 + 10 * 60 && priceOf(afterHole.levels, 'orHigh') === 91,
    `session from ${afterHole.sessionStart}, ORH ${priceOf(afterHole.levels, 'orHigh')}`
  );

  /*
    THE CLOCK-VERSUS-COUNT DIFFERENCE IS NOT OBSERVABLE TODAY, and saying so
    is more useful than a test that pretends it is. With the boundary rule
    above, a 1-minute series inside one session has no missing minutes by
    construction, so `within(15 minutes)` and `slice(0, 15)` cannot disagree.
    The implementation still reads the clock, because that is correct without
    depending on the boundary rule at all — and the day T-16 gives sessions a
    calendar, holes will appear inside them and the two WILL differ.
  */
  const contiguous = session(60, T0, i => 50 + i);
  const byClock = buildSessionLevels(contiguous, 15);
  check(
    'the opening range is bounded by the clock, and agrees with the count while nothing is missing',
    priceOf(byClock.levels, 'orHigh') === 65 && priceOf(byClock.levels, 'orLow') === 49,
    `${priceOf(byClock.levels, 'orLow')}..${priceOf(byClock.levels, 'orHigh')}`
  );

  /* FORMING — returned, and flagged. */
  const young = session(4, T0, i => 50 + i);
  const f = buildSessionLevels(young, 15);
  check('a range still forming is still returned', priceOf(f.levels, 'orHigh') === 54, String(priceOf(f.levels, 'orHigh')));
  check('and is flagged as forming, with how far in it is', !f.orComplete && f.orElapsed === 4, `${f.orElapsed}/${f.orMinutes}`);
  const done = buildSessionLevels(session(15, T0, i => 50 + i), 15);
  check('and it turns complete on the minute it is due, not after', done.orComplete && done.orElapsed === 15, `${done.orElapsed}/15`);
}

// ── 4. the initial balance is the first hour ──────────────────────────────
{
  /* First hour 200 → 259, then a spike to 400 that the IB must not see. */
  const today = session(180, T0, i => (i < 60 ? 200 + i : 400));
  const s = buildSessionLevels(today, 15);
  check('the initial balance is the first hour', priceOf(s.levels, 'ibHigh') === 260 && priceOf(s.levels, 'ibLow') === 199, `${priceOf(s.levels, 'ibLow')}..${priceOf(s.levels, 'ibHigh')}`);
  check('and does not see what happened after it', priceOf(s.levels, 'ibHigh') !== 401);
  check('it is complete on a three-hour session', s.ibComplete && s.ibElapsed === INITIAL_BALANCE_MIN, `${s.ibElapsed}/${INITIAL_BALANCE_MIN}`);
  const half = buildSessionLevels(session(30, T0, i => 200 + i), 15);
  check('and forming on a half-hour one', !half.ibComplete && half.ibElapsed === 30, `${half.ibElapsed}/${INITIAL_BALANCE_MIN}`);
}

// ── 5 & 6. the states that are not measurements ───────────────────────────
{
  const first = buildSessionLevels(session(90, T0, () => 100), 15);
  check('a first-ever session reports no prior day', first.hasPrior === false);
  check('and publishes no prior-day level at all rather than a made-up one', !first.levels.some(l => l.key.startsWith('prev')), JSON.stringify(first.levels.map(l => l.key)));
  check('while still publishing the levels it CAN measure', first.levels.some(l => l.key === 'orHigh') && first.levels.some(l => l.key === 'ibHigh'), JSON.stringify(first.levels.map(l => l.tag)));

  const none = buildSessionLevels([], 15);
  check('no data is an empty answer rather than a throw', none.levels.length === 0 && none.sessionStart === null && !none.hasPrior);
}

// ── every level carries the shorthand a chart labels it with ──────────────
{
  const s = buildSessionLevels([...session(390, T0, i => 100 + i / 10), ...session(120, T0 + DAY, () => 200)], 30);
  check('every level carries a tag', s.levels.every(l => !!l.tag && l.tag.length <= 4), JSON.stringify(s.levels.map(l => l.tag)));
  check('and the tags are unique', new Set(s.levels.map(l => l.tag)).size === s.levels.length);
  check('a full day publishes all seven', s.levels.length === 7, `${s.levels.length}: ${s.levels.map(l => l.tag).join(' ')}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
