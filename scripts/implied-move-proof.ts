/*
  Acceptance test for 9.2 — which implied move this is.

  "State whether the implied move is the straddle approximation or the
   term-structure decomposition. They give different numbers and the reader
   must know which."

  The checklist is right that they differ, and understates by how much. The
  straddle approximation reads the front-expiry ATM straddle as a fraction
  of spot: quick, universal, and biased HIGH, because a straddle prices the
  whole distribution and its price over spot lands nearer 1.25 standard
  deviations than one. The term-structure decomposition strips non-event
  vol out of the front expiry using a later one and solves for the jump
  alone — a smaller number, and the one a vol desk means.

  A reader comparing 6.4% here against 5.1% elsewhere is looking at two
  conventions, not two opinions, and cannot tell without being told.
*/
import { readFileSync } from 'node:fs';
import {
  IMPLIED_MOVE_METHOD, IMPLIED_MOVE_METHOD_WORDS, IMPLIED_MOVE_NOTE,
  bandRecordOf, buildEarningsCalendar, buildEarningsDossier, type ImpliedMoveMethod,
} from '../src/data/earnings';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the convention is declared ──────────────────────────────────────────
{
  const both: ImpliedMoveMethod[] = ['straddle', 'term-structure'];
  check('both conventions are named', both.every(m => IMPLIED_MOVE_METHOD_WORDS[m]?.length > 10));
  check('the desk declares which one it uses', both.includes(IMPLIED_MOVE_METHOD), IMPLIED_MOVE_METHOD);
  check('and the words are distinct',
    IMPLIED_MOVE_METHOD_WORDS.straddle !== IMPLIED_MOVE_METHOD_WORDS['term-structure']);

  /*
    A DISCLOSURE THAT ONLY NAMES THE METHOD IS HALF USELESS. The reader
    needs the DIRECTION of the bias, or they cannot reconcile this number
    against another and will assume one of the two is wrong.
  */
  check('the note names the other convention too', /term-structure/i.test(IMPLIED_MOVE_NOTE));
  check('and says which way this one is biased',
    /reads high|biased high|nearer 1\.25/i.test(IMPLIED_MOVE_NOTE));
  check('and explains why a figure elsewhere may differ',
    /two conventions, not two opinions/i.test(IMPLIED_MOVE_NOTE));
  /* And it must not claim the number is read off a live chain, because it
     is not — the field's old comment said "straddle-implied" flatly. */
  check('it says the figure is modelled, not read off a chain',
    /models the figure|rather than reading it off/i.test(IMPLIED_MOVE_NOTE));
}

// ── the surfaces carry it ───────────────────────────────────────────────
{
  for (const [file, label] of [
    ['src/pages/EarningsDossier.tsx', 'the dossier'],
    ['src/pages/EarningsHub.tsx', 'the hub'],
  ] as const) {
    const src = readFileSync(file, 'utf8');
    check(`${label} names the convention where the figure is shown`,
      src.includes('IMPLIED_MOVE_METHOD_WORDS') && src.includes('IMPLIED_MOVE_NOTE'));
  }

  /* The old type comment asserted the number WAS a straddle price. It is
     not — it is modelled — and a comment that overclaims is the same lie
     with a smaller audience. */
  const data = readFileSync('src/data/earnings.ts', 'utf8');
  check('the field no longer claims flatly to be a straddle price',
    !/\/\*\* Straddle-implied move for the print/.test(data));
  check('and points at the method instead', /IMPLIED_MOVE_METHOD/.test(
    data.slice(data.indexOf('impliedMovePct: number;') - 400, data.indexOf('impliedMovePct: number;'))
  ));
}

// ── the figure itself still behaves ─────────────────────────────────────
{
  const events = buildEarningsCalendar();
  check('the calendar builds', events.length > 0, `${events.length} events`);
  check('every implied move is a positive percent',
    events.every(e => e.impliedMovePct > 0 && e.impliedMovePct < 60));
  /*
    RICHNESS IS THE RELATIONSHIP THE WHOLE PAGE HANGS ON — implied over
    realised — so it has to agree with the two numbers beside it or the
    "priced vs typical" column is telling a different story from the bars.
  */
  const worst = events.reduce((w, e) => {
    const derived = e.impliedMovePct / e.histAvgMovePct;
    return Math.max(w, Math.abs(derived - e.richness));
  }, 0);
  check('richness is implied over realised, to the rounding',
    worst < 0.02, `worst disagreement ${worst.toFixed(4)}`);
}

// ── the convention is behind a door, not a hover ────────────────────────
{
  const dossier = readFileSync('src/pages/EarningsDossier.tsx', 'utf8');
  /*
    A `title` attribute is not a methodology door. The note is 240 words a
    reader must hold a cursor still to read, it cannot be selected or
    copied, and a phone cannot show it at all — which makes the single most
    important sentence on this page unreachable on the device half the
    readers use. It is a button opening a modal now.
  */
  check('the implied-move convention opens as a dialog', /setMethodOpen\(true\)/.test(dossier) && /<Modal[^>]*methodOpen/.test(dossier));
  check('  · and no longer hides in a native tooltip', !/title=\{IMPLIED_MOVE_NOTE\}/.test(dossier));
  check('  · with the note itself inside it', /\{IMPLIED_MOVE_NOTE\}/.test(dossier));
  check('  · and the convention named in the same dialog', /IMPLIED_MOVE_METHOD_WORDS\[IMPLIED_MOVE_METHOD\]/.test(dossier));

  /* EACH SQUARE ANSWERS FOR ITSELF. Eight squares under one shared tooltip
     described the ROW and told a reader nothing about any quarter in it. */
  check('every reaction square carries its own quarter', /data-reaction-squares/.test(dossier) && /\{q\.label\} — EPS/.test(dossier));
  check('  · naming the estimate, the print and the next-day move', /against \$\{q\.epsEst/.test(dossier) && /The stock moved/.test(dossier));
}

// ── the board's three cuts, and the one that is not offered ─────────────
{
  const hub = readFileSync('src/pages/EarningsHub.tsx', 'utf8');
  check('the board filters on pricing state, implied move and sector',
    /ariaLabel="Vol pricing filter"/.test(hub) && /ariaLabel="Implied move"/.test(hub) && /aria-label="Sector"/.test(hub));
  /* THE GRID AND THE BOARD MUST AGREE. Two surfaces on one page disagreeing
     about which reports exist is worse than neither of them filtering. */
  check('  · and the calendar grid answers to the same three', /weekIdx === Number\(week\) && passes\(e\)/.test(hub));
  /* A UNIVERSE SWITCH WOULD RETURN THE SAME ROWS UNDER TWO LABELS. The
     calendar covers the desk universe and nothing else. */
  check('  · with no universe switch over a universe that does not vary',
    !/S&P 500|Nasdaq 100/.test(hub.replace(/\/\*[\s\S]*?\*\//g, '')));
  /* Three filters can empty this board and "no reports" is true of all
     three, which tells a reader nothing about which to loosen. */
  check('an empty board names the cut that is actually binding',
    /clears the rest of the board/.test(hub) && /clear the other cuts/.test(hub));

  const events = buildEarningsCalendar();
  const sectors = new Set(events.map(e => e.sector));
  check('every report carries a sector to filter on', events.every(e => typeof e.sector === 'string' && e.sector.length > 0), `${sectors.size} sectors on the slate`);
  check('  · and more than one, or the filter would be furniture', sectors.size > 1);
  const big = events.filter(e => e.impliedMovePct >= 5).length;
  check('the implied-move cuts actually cut', big > 0 && big < events.length, `${big} of ${events.length} priced for ±5% or more`);
}

// ── the odds that were a hash of the ticker's name ──────────────────────
{
  /*
    `probInsidePct = Math.round(65 + h01(s('pin')) * 6)` — printed under
    "Closes inside ±X%", beside a real implied move, in the same typeface.
    It forecast nothing: two names with identical options markets got
    different odds because their letters differed. The Prove It board had
    exactly this defect and the fix there was to DELETE the seeded figure
    rather than to dress it better, so it is deleted here too.

    What replaces it is a count of what actually happened, which the panel
    directly below is already drawing — a reader can put a finger on each
    bar against the dashed lines and get the same answer.
  */
  const src = readFileSync('src/data/earnings.ts', 'utf8');
  const page = readFileSync('src/pages/EarningsDossier.tsx', 'utf8');
  /* Tested against the CODE, not the prose — the comment that replaced it
     quotes the old expression on purpose, so that a reader running `git
     log` is not the only way to find out what this used to say. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('the seeded "odds it stays inside" is gone from the engine',
    !/probInsidePct/.test(code) && !/probBeyondPct/.test(code));
  check('  · and off the page', !/probInsidePct/.test(page) && !/probBeyondPct/.test(page));
  /* The direction skew reads real inputs and stays. Deleting a good number
     beside a bad one would be the wrong lesson. */
  check('  · while the skew, which reads flow and revisions, survives',
    /event\.flowLean \* 14 \+ event\.revisionTrend \* 10/.test(src) && /probUpPct/.test(page));

  const dossier = buildEarningsDossier(buildEarningsCalendar()[0].ticker);
  if (!dossier) {
    check('PREMISE: a dossier builds', false);
  } else {
    const { bandRecord: r, quarters, event } = dossier;
    check('PREMISE: a dossier builds', true, `${event.ticker}`);
    check('the record counts every quarter it has', r.of === quarters.length && r.of > 0, `${r.inside} of ${r.of}`);
    check('  · and cannot count more than it has', r.inside >= 0 && r.inside <= r.of);
    /* THE COUNT MUST BE THE BARS. If this and the chart disagree the panel
       argues with itself in front of the reader. */
    check('  · and it is exactly the reactions inside the dashed lines',
      r.inside === quarters.filter(q => Math.abs(q.movePct) <= event.impliedMovePct).length);

    /* A COUNT IS NOT A SEED. The same quarters against a wider band can
       only contain more of them — a hash would not care. */
    const wider = bandRecordOf(quarters, event.impliedMovePct * 3);
    const tighter = bandRecordOf(quarters, 0);
    check('a wider band contains at least as much', wider.inside >= r.inside, `${wider.inside} at 3x`);
    check('and a zero band contains only the prints that did not move',
      tighter.inside === quarters.filter(q => q.movePct === 0).length);

    /* THE CAVEAT IS PART OF THE NUMBER. Each of those eight prints was
       priced by its own market at the time and those bands are not in this
       feed, so this is not "was the market right each time". */
    check('the record says what it was counted against', /priced for this print/.test(r.note));
    check('  · and admits the comparison is not each quarter’s own band',
      /not against what each of those quarters was priced at/.test(r.note) && /does not hold those bands/.test(r.note));
    check('and the caveat rides with the figure rather than beside it',
      /hint=\{d\.bandRecord\.note\}/.test(page));
    check('the count is printed on the chart that shows it',
      /\{dossier\.bandRecord\.inside\} of\{' '\}/.test(page) && /landed inside it/.test(page));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
