import { readFileSync } from 'node:fs';
import { buildEarningsCalendar } from '../src/data/earnings';
import { buildIpoCalendar, isPending } from '../src/data/ipo';
import { macroCards } from '../src/data/macroDetail';

/*
==================================================
  SLAYER TERMINAL - PROOF · THE UNIFIED CALENDAR
  (scripts/unified-calendar-proof.ts) — Part 9.4
==================================================

  Three calendars lived on two pages and never met, so the one question a
  reader planning a week actually asks — what is happening on Thursday —
  could not be asked anywhere.

  Merging calendars is where a surface most easily starts lying, because
  every row looks like every other row once they share a date column. Three
  things have to hold:

    ONLY WHAT IS AHEAD   the list answers "what is coming". A withdrawn
                         listing keeps its date on the panel it comes from,
                         on purpose, so a reader does not assume they missed
                         it — but a deal that is not happening is not ahead
                         of anybody and must not appear here.
    EVERY ROW SAYS WHICH the kinds carry different units (sessions for a
                         report, calendar days for a listing) and different
                         certainties (a confirmed date, an estimated one, a
                         filed range). A merged row that drops the kind
                         drops all of that.
    THE FILTER CANNOT    turning the last kind off leaves a reader looking
    EMPTY THE PANEL      at a blank panel wondering whether the week is
                         quiet or the control is broken.
*/

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const src = readFileSync('src/components/earnings/UnifiedCalendar.tsx', 'utf8');

// ── the three sources exist and overlap in time ────────────────────────────
{
  const earnings = buildEarningsCalendar().filter(e => e.daysOut >= 0);
  const listings = buildIpoCalendar().filter(d => isPending(d.status) && d.daysOut >= 0);
  const macro = macroCards().filter(m => !m.past && m.daysOut >= 0);
  check('there are earnings ahead', earnings.length > 0, `${earnings.length}`);
  check('there are listings ahead', listings.length > 0, `${listings.length}`);
  check('there are macro prints ahead', macro.length > 0, `${macro.length}`);
  /* A merged calendar over three windows that never overlap is three lists
     with a shared heading. */
  const spans = [earnings, listings, macro].map(xs => Math.max(...xs.map(x => x.daysOut)));
  check('and their windows overlap, so merging them means something', Math.min(...spans) > 0, `deepest ${spans.join(' / ')} out`);
}

// ── dead deals do not travel ───────────────────────────────────────────────
{
  const dead = buildIpoCalendar().filter(d => !isPending(d.status));
  check('the listings engine holds resolved deals', dead.length > 0, `${dead.length} withdrawn, postponed or priced`);
  check('and the unified list takes only what is still pending', /if \(!isPending\(d\.status\) \|\| d\.daysOut < 0\) continue;/.test(src));
  check('  · past earnings are dropped the same way', /if \(e\.daysOut < 0\) continue;/.test(src));
  check('  · and released macro prints too', /if \(m\.past \|\| m\.daysOut < 0\) continue;/.test(src));
}

// ── every row says which kind it is, in that kind's own units ──────────────
{
  check('each row carries its kind on the surface', /data-event-kind=\{r\.kind\}/.test(src));
  /* Sessions for a report, calendar days for a listing and a macro print.
     One unit across all three would be wrong for two of them. */
  check('and the distance is worded in that kind’s own unit',
    /kind === 'earnings' \? \(n === 1 \? 'session' : 'sessions'\)/.test(src));
  check('an unconfirmed earnings date says so', /date still an estimate/.test(src));
  check('a listing says its options cannot be traded yet', /no options for about/.test(src));
  check('a macro print carries its consensus', /consensus \$\{m\.consensus\}\$\{m\.unit\}/.test(src));
}

// ── the importance tier that is not offered ────────────────────────────────
{
  /* The desk carries the rate decision, CPI and payrolls. All three ARE the
     high-importance tier; a control with one value in it would teach a
     reader the calendar is deeper than it is. */
  const kinds = new Set(macroCards().map(m => m.kind));
  check('the macro calendar holds only the top-tier prints', kinds.size <= 3, [...kinds].join(', '));
  check('so no importance filter is offered', !/importance|high\/medium\/low/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('  · and the copy names the three instead of ranking them', /the three macro prints this desk carries/.test(src));
}

// ── the filter cannot empty the panel ──────────────────────────────────────
{
  check('the last kind on stays on', /if \(next\.has\(k\) && next\.size > 1\) next\.delete\(k\);/.test(src));
  check('  · and says why when a reader tries', /The last kind stays on/.test(src));
  check('rows are grouped by date, so one line answers "what is on Thursday"', /new Map<string, Row\[\]>/.test(src));
  check('the panel is on the earnings page', /<UnifiedCalendar/.test(readFileSync('src/pages/EarningsHub.tsx', 'utf8')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
