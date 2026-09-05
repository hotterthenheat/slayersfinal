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
  buildEarningsCalendar, type ImpliedMoveMethod,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
