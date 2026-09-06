/*
  Acceptance test for Part 3's label maturity.

  "Journal/label-maturity UI: a setup's label matures over time; show
   pending vs matured."

  A tracked verdict is a claim until its window closes and a grade after.
  The cases below build a live setup in each resolution and check that a
  date tenor matures on the date, a swing on the resolution, and that a
  WATCH — which claims nothing — is never graded right or wrong.
*/
import { labelRead } from '../src/data/labelMaturity';
import type { Setup } from '../src/types/compass';

let pass = 0,
  fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* Only the fields the grader reads are real; the rest is a shell. */
const live = (verdict: Setup['verdict'], hit: boolean): Setup =>
  ({
    verdict,
    takeProfits: [
      { level: 1, price: 0, status: hit ? 'HIT' : 'PENDING' },
      { level: 2, price: 0, status: 'PENDING' },
    ],
  }) as unknown as Setup;

// ---- date tenors mature on the date -------------------------------------------
{
  const open = labelRead('ENTER', live('ENTER', false), false, true);
  check('an unexpired date-tenor label is pending', open.maturity === 'pending' && open.chip === 'PENDING');
  check('pending has no resolution and no grade', open.resolution === null && open.heldUp === null);
  check('the note says what it said and that it can still change', /Said ACTIVE/.test(open.note) && /still/i.test(open.note));

  const paid = labelRead('ENTER', live('ENTER', true), false, true);
  check('a target banked BEFORE expiry is still pending on a date tenor — the date is the clock', paid.maturity === 'pending');

  const done = labelRead('ENTER', live('ENTER', true), true, true);
  check('at expiry it matures', done.maturity === 'matured' && done.chip === 'MATURED');
  check('ACTIVE that paid held up', done.resolution === 'paid' && done.heldUp === true);
  check('the note grades it', /held up/.test(done.note) && /target was banked/.test(done.note));
}

// ---- what each resolution does to each claim ----------------------------------------
{
  check('ACTIVE that broke did not hold', labelRead('ENTER', live('EXIT', false), true, true).heldUp === false);
  check('ACTIVE that expired flat did not hold — it claimed a payout', labelRead('ENTER', live('WATCH', false), true, true).heldUp === false);
  check('FADING that broke held up', labelRead('EXIT', live('EXIT', false), true, true).heldUp === true);
  check('FADING that expired flat held up — it said it would not pay, and it did not', labelRead('EXIT', live('WATCH', false), true, true).heldUp === true);
  check('FADING that paid did not hold', labelRead('EXIT', live('ENTER', true), true, true).heldUp === false);
  const w = labelRead('WATCH', live('ENTER', true), true, true);
  check('WATCH is never graded — it made no claim', w.maturity === 'matured' && w.heldUp === null);
  check('and its note says so', /no claim/i.test(w.note));
  check('a paid resolution outranks a broken verdict', labelRead('ENTER', live('EXIT', true), true, true).resolution === 'paid');
}

// ---- swings mature on resolution, not on a date ---------------------------------------
{
  const open = labelRead('ENTER', live('ENTER', false), false, false);
  check('a swing with nothing resolved is pending', open.maturity === 'pending');
  check('its note says the floor is the clock', /no date clock/i.test(open.note));
  check('a swing matures when a target is banked, expired flag or not', labelRead('ENTER', live('ENTER', true), false, false).maturity === 'matured');
  check('or when the floor gives way', labelRead('ENTER', live('EXIT', false), false, false).maturity === 'matured');
  check('an "expired" flag on a swing changes nothing — it has no date', labelRead('ENTER', live('ENTER', false), true, false).maturity === 'pending');
}

// ---- the chip vocabulary is exactly two words --------------------------------------------
{
  const chips = new Set([
    labelRead('ENTER', live('ENTER', false), false, true).chip,
    labelRead('ENTER', live('ENTER', true), true, true).chip,
    labelRead('WATCH', live('EXIT', false), true, true).chip,
  ]);
  check('PENDING and MATURED, nothing else', chips.size === 2 && chips.has('PENDING') && chips.has('MATURED'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
