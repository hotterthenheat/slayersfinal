/*
  Acceptance test for T-16's futures clock. Fixed wall-clock instants whose
  Globex phase is known by hand, in BOTH halves of the DST year — the model
  must resolve New York wall time through the zone database, and a hardcoded
  UTC offset passes one season and fails the other.

  2026 anchors (all regular weeks, no holidays):
    Wed 2026-07-15  EDT, UTC−4
    Wed 2026-01-14  EST, UTC−5
    Sun 2026-07-19 / Sat 2026-07-18 / Fri 2026-07-17
*/
import { futuresPhaseAt, FUTURES_PHASE_WORDS, MARKET_HOLIDAYS, type FuturesPhase } from '../src/core/calendar';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/** An instant from a New York wall time, via the fixed seasonal offset the
    TEST controls (the model must not be trusted to build its own fixtures). */
const edt = (iso: string) => new Date(`${iso}-04:00`); // summer
const est = (iso: string) => new Date(`${iso}-05:00`); // winter
const at = (d: Date): FuturesPhase => futuresPhaseAt(d);

// ── the trading-day bands, summer ─────────────────────────────────────────
check('01:00 ET Wednesday is Asia', at(edt('2026-07-15T01:00:00')) === 'GLOBEX_ASIA');
check('03:00 ET is the European handoff, on the boundary', at(edt('2026-07-15T03:00:00')) === 'GLOBEX_EUROPE');
check('09:29 ET is still Europe', at(edt('2026-07-15T09:29:00')) === 'GLOBEX_EUROPE');
check('09:30 ET is the cash open, on the boundary', at(edt('2026-07-15T09:30:00')) === 'RTH');
check('15:59 ET is still RTH', at(edt('2026-07-15T15:59:00')) === 'RTH');
check('16:00 ET the cash closes and futures keep trading', at(edt('2026-07-15T16:00:00')) === 'GLOBEX_POST');
check('17:00 ET the maintenance break starts', at(edt('2026-07-15T17:00:00')) === 'MAINTENANCE');
check('18:00 ET the next Globex day opens into Asia', at(edt('2026-07-15T18:00:00')) === 'GLOBEX_ASIA');

// ── the week's edges ──────────────────────────────────────────────────────
check('Friday 16:30 ET still trades', at(edt('2026-07-17T16:30:00')) === 'GLOBEX_POST');
check('Friday 17:00 ET the week closes — not a maintenance break', at(edt('2026-07-17T17:00:00')) === 'CLOSED');
check('Saturday is closed all day', at(edt('2026-07-18T12:00:00')) === 'CLOSED');
check('Sunday 17:59 ET is still the weekend', at(edt('2026-07-19T17:59:00')) === 'CLOSED');
check('Sunday 18:00 ET the week opens', at(edt('2026-07-19T18:00:00')) === 'GLOBEX_ASIA');

// ── the same wall times hold in winter — the DST tripwire ─────────────────
check('09:30 ET in January is RTH (EST resolves through the zone, not an offset)', at(est('2026-01-14T09:30:00')) === 'RTH');
check('17:30 ET in January is maintenance', at(est('2026-01-14T17:30:00')) === 'MAINTENANCE');
check('18:00 ET in January opens Asia', at(est('2026-01-14T18:00:00')) === 'GLOBEX_ASIA');
/* And the SAME UTC hour that means 18:00 in July means 17:00 in January —
   a fixed-offset model calls both Asia; the zone-aware one splits them. */
check('22:00Z is Asia in July but maintenance in January', at(new Date('2026-07-15T22:00:00Z')) === 'GLOBEX_ASIA' && at(new Date('2026-01-14T22:00:00Z')) === 'MAINTENANCE');

// ── holidays, as documented approximation ─────────────────────────────────
{
  const holiday = [...MARKET_HOLIDAYS][0];
  check('PREMISE: the holiday table has entries', holiday !== undefined, String(holiday));
  if (holiday) {
    const mm = holiday.slice(5, 7);
    const off = mm >= '04' && mm <= '10' ? '-04:00' : '-05:00';
    check(`the listed holiday ${holiday} reads CLOSED at noon (documented approximation)`, at(new Date(`${holiday}T12:00:00${off}`)) === 'CLOSED');
  }
}

// ── every phase has words ─────────────────────────────────────────────────
check('every phase carries its label and blurb', (['GLOBEX_ASIA', 'GLOBEX_EUROPE', 'RTH', 'GLOBEX_POST', 'MAINTENANCE', 'CLOSED'] as FuturesPhase[]).every(p => FUTURES_PHASE_WORDS[p].label.length > 0 && FUTURES_PHASE_WORDS[p].blurb.length > 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
