/*
  Acceptance test for T-11's event markers. Runs the ACTUAL engine against
  staged tapes where every placement is computable by hand.

  Proves:
  1. The two time shapes: an event still ahead carries TRADING MINUTES past
     the last bar (the cone's arithmetic — session remainder plus whole
     sessions plus the minute inside the target day); one already on the
     tape carries a bar time on the seeded grid
  2. Earnings placement honours the slot — AMC at that session's close, BMO
     at its open — and a BMO report on a session already underway lands as a
     PAST mark at today's open, not a negative future
  3. The macro bridge is trading days → sessions, signed; a date before the
     buffer's first bar is dropped rather than drawn pointing at nothing
  4. The print floor and cap: below the floor is texture, above it the
     LARGEST N win, and a print stamped outside the buffer is dropped
  5. The calendar rules: first-Friday really lands a Friday in week one,
     second-Wednesday a Wednesday in week two, and the signed distance is
     antisymmetric
  6. Output order: past by time, then futures by minutes ahead
*/
import { buildTapeEvents, firstFriday, secondWednesday, tradingDaysSigned, PRINT_PREMIUM_FLOOR, PRINT_CAP } from '../src/data/events';
import { RTH_MINUTES } from '../src/core/calendar';
import type { EarningsEvent } from '../src/data/earnings';
import type { Candle } from '../src/types/market';
import type { FlowPrint } from '../src/types/trace';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Two seeded sessions plus a partial today, on the simulator's own grid:
   sessions one calendar day apart, 390 one-minute bars each, today at 100. */
const T0 = 1_760_000_000 - (1_760_000_000 % 60);
const bars: Candle[] = [];
const day = (d: number, i: number) => T0 + d * 86400 + i * 60;
for (let d = 0; d < 2; d++) for (let i = 0; i < 390; i++) bars.push({ time: day(d, i), open: 100, high: 100, low: 100, close: 100, volume: 1 });
for (let i = 0; i < 100; i++) bars.push({ time: day(2, i), open: 100, high: 100, low: 100, close: 100, volume: 1 });
const todayStart = day(2, 0);
const elapsed = 100; // through the last bar

const earnings = (slot: 'BMO' | 'AMC', daysOut: number): EarningsEvent =>
  ({ ticker: 'SPY', slot, daysOut, confirmed: true, impliedMovePct: 4.2, histAvgMovePct: 3.1 } as unknown as EarningsEvent);
const print = (premium: number, at: number, right: 'C' | 'P' = 'C'): FlowPrint & { at: number } =>
  ({ premium, at, right, size: 500, strike: 100, dte: 3, side: 'ASK' } as unknown as FlowPrint & { at: number });

const base = { bars, prints: [] as (FlowPrint & { at: number })[], earnings: null, macro: [], todayIso: '2026-08-27' };

// ── 1+2. earnings, both slots, both shapes ────────────────────────────────
{
  const amc = buildTapeEvents({ ...base, earnings: earnings('AMC', 2) });
  check('PREMISE: one earnings mark', amc.length === 1 && amc[0].kind === 'earnings');
  check(
    'AMC two sessions out lands at that session\'s close, in trading minutes',
    amc[0].minutesAhead === RTH_MINUTES - elapsed + RTH_MINUTES + RTH_MINUTES,
    `${amc[0].minutesAhead} vs ${3 * RTH_MINUTES - elapsed}`
  );
  const bmo = buildTapeEvents({ ...base, earnings: earnings('BMO', 1) });
  check('BMO tomorrow lands at tomorrow\'s open', bmo[0].minutesAhead === RTH_MINUTES - elapsed, String(bmo[0].minutesAhead));
  const bmoToday = buildTapeEvents({ ...base, earnings: earnings('BMO', 0) });
  check('a BMO report on a session underway is a PAST mark at today\'s open', bmoToday[0].time === todayStart && bmoToday[0].minutesAhead === undefined);
  const amcToday = buildTapeEvents({ ...base, earnings: earnings('AMC', 0) });
  check('an AMC report today is still ahead — at the bell', amcToday[0].minutesAhead === RTH_MINUTES - elapsed);
}

// ── 3. the macro bridge ───────────────────────────────────────────────────
{
  /* 2026-08-27 is a Thursday: +1 trading day = Friday the 28th, −1 = Wednesday
     the 26th, and Monday the 31st is +2 (the weekend does not count). */
  const macro = [
    { iso: '2026-08-28', label: 'NFP release', detail: 'x' },
    { iso: '2026-08-26', label: 'CPI release', detail: 'x' },
    { iso: '2026-08-31', label: 'FOMC decision', detail: 'x' },
  ];
  const got = buildTapeEvents({ ...base, macro });
  const nfp = got.find(e => e.label === 'NFP release');
  const cpi = got.find(e => e.label === 'CPI release');
  const fomc = got.find(e => e.label === 'FOMC decision');
  check('one trading day ahead = next session\'s open', nfp?.minutesAhead === RTH_MINUTES - elapsed);
  check('across a weekend counts trading days, not calendar ones', fomc?.minutesAhead === 2 * RTH_MINUTES - elapsed, String(fomc?.minutesAhead));
  check('one trading day back = the prior seeded session\'s start', cpi?.time === todayStart - 86400);
  const far = buildTapeEvents({ ...base, macro: [{ iso: '2026-08-03', label: 'NFP release', detail: 'x' }] });
  check('a date before the buffer is dropped, not drawn pointing at nothing', far.length === 0);
}

// ── 4. the print floor and cap ────────────────────────────────────────────
{
  const prints = [
    print(PRINT_PREMIUM_FLOOR - 1, day(2, 10)),
    print(PRINT_PREMIUM_FLOOR, day(2, 20)),
    ...Array.from({ length: PRINT_CAP + 3 }, (_, i) => print(2_000_000 + i * 1000, day(2, 30 + i), i % 2 ? 'P' : 'C')),
    print(9_000_000, day(2, 5) - 86400 * 30), // stamped before the buffer
  ];
  const got = buildTapeEvents({ ...base, prints });
  check('below the floor is texture, not an event', !got.some(e => e.label.startsWith('$1.0M') && e.time === day(2, 10)));
  check(`the cap keeps the largest ${PRINT_CAP}`, got.filter(e => e.kind === 'print').length === PRINT_CAP, `${got.filter(e => e.kind === 'print').length}`);
  const kept = got.filter(e => e.kind === 'print');
  check('— largest, not first: the at-floor print lost its seat to bigger ones', !kept.some(e => e.time === day(2, 20)));
  check('a print stamped outside the buffer is dropped', !kept.some(e => (e.time ?? 0) < bars[0].time));
  check('the glyph knows its right, as shape not colour', kept.every(e => e.side === 'C' || e.side === 'P'));
  /* And AT the floor with room under the cap is an event — the floor is
     inclusive, and only the cap evicted it above. */
  const alone = buildTapeEvents({ ...base, prints: [print(PRINT_PREMIUM_FLOOR, day(2, 20))] });
  check('at the floor, with room, the print is marked', alone.filter(e => e.kind === 'print').length === 1);
}

// ── 5. the calendar rules ─────────────────────────────────────────────────
{
  let fridays = true, wednesdays = true;
  for (let m = 0; m < 12; m++) {
    const ff = new Date(`${firstFriday(2026, m)}T12:00:00`);
    if (ff.getDay() !== 5 || ff.getDate() > 7) fridays = false;
    const sw = new Date(`${secondWednesday(2026, m)}T12:00:00`);
    if (sw.getDay() !== 3 || sw.getDate() < 8 || sw.getDate() > 14) wednesdays = false;
  }
  check('first-Friday is a Friday in week one, all twelve months', fridays);
  check('second-Wednesday is a Wednesday in week two, all twelve months', wednesdays);
  check('signed distance is antisymmetric', tradingDaysSigned('2026-08-27', '2026-08-31') === 2 && tradingDaysSigned('2026-08-31', '2026-08-27') === -2);
}

// ── 6. order ──────────────────────────────────────────────────────────────
{
  const got = buildTapeEvents({
    ...base,
    earnings: earnings('AMC', 1),
    macro: [{ iso: '2026-08-26', label: 'CPI release', detail: 'x' }],
    prints: [print(3_000_000, day(2, 50))],
  });
  const times = got.map(e => e.time ?? Infinity);
  const aheads = got.map(e => e.minutesAhead ?? -Infinity);
  const pastCount = got.filter(e => e.time !== undefined).length;
  check('past marks come first, by time', times.slice(0, pastCount).every((t, i, a) => i === 0 || t >= a[i - 1]));
  check('then futures, by minutes ahead', aheads.slice(pastCount).every((t, i, a) => i === 0 || t >= a[i - 1]));
  check('and nothing carries both shapes', got.every(e => (e.time === undefined) !== (e.minutesAhead === undefined)));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
