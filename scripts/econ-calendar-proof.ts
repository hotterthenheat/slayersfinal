/*
  Acceptance test for 8.2 — the three numbers that make a release
  meaningful, and the fourth thing that makes them addressable.

  "Actual / forecast / prior columns — the three numbers that make a
   release meaningful."

  The calendar carried two of the three. Without the actual, a released
  print and a scheduled one are the same row: same layout, same two
  figures, and a reader cannot tell what has happened from what is coming.

  And a release covers a PERIOD that is not its release date. A CPI print
  published in September is August's inflation; a calendar showing only the
  date invites the reader to attach the number to the wrong month, and the
  row looks complete either way.
*/
import { readFileSync } from 'node:fs';
import { buildEconCalendar } from '../src/data/newsroom';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const cal = buildEconCalendar();
check('PREMISE: there is a calendar', cal.length > 3, `${cal.length} releases`);
check('and it spans released and scheduled',
  cal.some(e => e.inMinutes < 0) && cal.some(e => e.inMinutes >= 0),
  `${cal.filter(e => e.inMinutes < 0).length} printed, ${cal.filter(e => e.inMinutes >= 0).length} ahead`);

// ── actual, and its absence ─────────────────────────────────────────────
{
  /*
    THE REFUSAL IS THE ASSERTION. A release that has not happened must not
    carry an actual — not a zero, not a dash-as-string, not the forecast
    standing in. Undefined, so the surface renders absence as absence.
  */
  const early = cal.filter(e => e.inMinutes >= 0 && e.actual !== undefined);
  check('nothing unreleased carries an actual', early.length === 0,
    early.map(e => e.title).join(', '));

  const printedWithNumbers = cal.filter(e => e.inMinutes < 0 && e.previous !== undefined);
  check('a released numeric print does carry one',
    printedWithNumbers.length === 0 || printedWithNumbers.every(e => e.actual !== undefined),
    `${printedWithNumbers.length} released numeric releases`);

  /* A meeting or an auction has no number at all, released or not — and
     must not be given one. */
  const nonNumeric = cal.filter(e => e.previous === undefined);
  check('a meeting or auction gets no invented figure',
    nonNumeric.every(e => e.actual === undefined && e.forecast === undefined),
    nonNumeric.map(e => e.title).join(', ').slice(0, 80));
}

// ── the surprise ────────────────────────────────────────────────────────
{
  const withSurprise = cal.filter(e => e.surprise !== undefined);
  check('a surprise needs both an actual and a forecast',
    withSurprise.every(e => e.actual !== undefined && e.forecast !== undefined),
    `${withSurprise.length} with a surprise`);
  /* A surprise against nothing is not a small surprise. */
  check('and nothing missing one reports a surprise anyway',
    cal.filter(e => e.actual === undefined || e.forecast === undefined).every(e => e.surprise === undefined));
  check('a surprise is signed, so its direction is not carried by colour alone',
    withSurprise.every(e => /^[+−]/.test(e.surprise as string)),
    withSurprise[0]?.surprise);
}

// ── the period ──────────────────────────────────────────────────────────
{
  /* "Q2" is two characters and a complete answer — the first version of
     this bound asked for more than two and failed on it. What matters is
     that every release HAS one, not that it is verbose. */
  check('every release says what it covers',
    cal.every(e => typeof e.period === 'string' && e.period.trim().length >= 2),
    cal.map(e => e.period).slice(0, 4).join(' | '));

  /*
    AND IT IS NOT THE RELEASE DATE. A monthly series published this month
    reports LAST month — if the period ever equalled the release month the
    column would be worse than absent, because it would look like a fact.
  */
  const monthly = cal.filter(e => /cpi|payroll|ifo|pmi/i.test(e.title));
  const thisMonth = new Date().toLocaleString('en-US', { month: 'long' });
  check('a monthly series does not name the month it is published in',
    monthly.length === 0 || monthly.every(e => e.period !== thisMonth),
    `${monthly.length} monthly releases, this month is ${thisMonth}`);

  const quarterly = cal.filter(e => /q\/q|gdp/i.test(e.title));
  check('a quarterly series names a quarter',
    quarterly.length === 0 || quarterly.every(e => /^Q[1-4]/.test(e.period)),
    quarterly.map(e => `${e.title}: ${e.period}`).join(' | '));

  const claims = cal.filter(e => /claims/i.test(e.title));
  check('claims name a week, not a month',
    claims.length === 0 || claims.every(e => /week ending/i.test(e.period)),
    claims.map(e => e.period).join(' | '));

  const meetings = cal.filter(e => /minutes|auction|speakers/i.test(e.title));
  check('a meeting covers itself rather than a period it does not have',
    meetings.length === 0 || meetings.every(e => /meeting itself/i.test(e.period)),
    meetings.map(e => e.period).join(' | '));
}

// ── the surface ─────────────────────────────────────────────────────────
{
  const page = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  check('the row renders the actual', /ev\.actual/.test(page));
  check('and renders absence as a dash rather than dropping the column',
    /Not released yet/.test(page));
  check('and shows what the number covers', /ev\.period/.test(page));
  check('and the surprise', /ev\.surprise/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
