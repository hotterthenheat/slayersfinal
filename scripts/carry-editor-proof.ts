/*
  Acceptance test for 15's carry editor.

  r and q are the two numbers EVERY greek on this desk is priced against. A
  change here moves every delta, every charm and every exposure figure on
  every page — which is why it deserves a surface, and why the surface has
  to be honest about who set the value.

  THREE STATES, NOT TWO. A person typing a rate into a box is not a feed.
  Collapsing the two lets a guess inherit a feed's authority: the chip
  would read "feed" about something somebody made up.
*/
import { readFileSync } from 'node:fs';
import {
  getCarry, carrySource, setCarry, resetCarry,
  DEFAULT_R, DEFAULT_Q, CARRY_MIN, CARRY_MAX,
} from '../src/core/carry';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

resetCarry();

// ── the three states ────────────────────────────────────────────────────
{
  check('a fresh desk is on documented assumptions',
    carrySource().kind === 'assumed' && getCarry().r === DEFAULT_R && getCarry().q === DEFAULT_Q);
  /* An as-of on an assumption is a timestamp for when nothing happened. */
  check('an assumption carries no as-of', carrySource().asOf === null);
  check('and its note says why there is no feed',
    /no rates or corporate-actions feed/i.test(carrySource().note));

  setCarry({ r: 0.05 }, undefined, 'feed');
  check('a feed sets kind feed', carrySource().kind === 'feed');
  check('and stamps an as-of', carrySource().asOf instanceof Date);

  resetCarry();
  setCarry({ r: 0.05 }, undefined, 'override');
  check('a hand-set value is an OVERRIDE, not a feed', carrySource().kind === 'override',
    carrySource().kind);
  check('and says so in its note', /set by hand/i.test(carrySource().note), carrySource().note);
  check('and stamps an as-of too', carrySource().asOf instanceof Date);

  resetCarry();
  check('reset returns to assumed with no as-of',
    carrySource().kind === 'assumed' && carrySource().asOf === null && getCarry().r === DEFAULT_R);
}

// ── the guard ───────────────────────────────────────────────────────────
{
  resetCarry();
  const before = { ...getCarry() };

  /*
    A "RATE" OF 40% IS A UNITS ERROR — percent handed over where a fraction
    was meant — and it must leave the last good carry standing rather than
    poisoning every greek on the desk.
  */
  check('an absurd rate is refused', setCarry({ r: 0.4 }) === false);
  check('and nothing moved', getCarry().r === before.r && getCarry().q === before.q);
  check('NaN is refused', setCarry({ r: NaN }) === false && getCarry().r === before.r);
  check('Infinity is refused', setCarry({ q: Infinity }) === false);
  check('a deeply negative rate is refused', setCarry({ r: -0.5 }) === false);
  check('a refusal does not change the source kind', carrySource().kind === 'assumed');

  check('a plausible rate is accepted', setCarry({ r: 0.031 }) === true && getCarry().r === 0.031);
  check('and a partial update leaves the other alone', getCarry().q === before.q);
  resetCarry();
}

// ── the bounds are shared, not restated ─────────────────────────────────
{
  /*
    The editor refuses at the keyboard what the seam refuses on submit. Two
    copies of a bound is how an editor and its seam quietly come to
    disagree — so the constants are exported and BOTH read them.
  */
  const src = readFileSync('src/core/carry.ts', 'utf8');
  const guard = src.slice(src.indexOf('export function setCarry'), src.indexOf('export function resetCarry'));
  check('the seam guards with the exported bounds, not literals',
    /CARRY_MIN/.test(guard) && /CARRY_MAX/.test(guard) && !/-0\.05/.test(guard));

  const editor = readFileSync('src/components/ui/CarryEditor.tsx', 'utf8');
  check('and the editor validates against the same two constants',
    /CARRY_MIN/.test(editor) && /CARRY_MAX/.test(editor));
  check('the bounds are a sane band', CARRY_MIN < 0 && CARRY_MAX > 0.1);
}

// ── the surface says source and as-of ───────────────────────────────────
{
  const editor = readFileSync('src/components/ui/CarryEditor.tsx', 'utf8');
  check('the editor prints the source kind', /KIND_WORD\[src\.kind\]/.test(editor));
  check('and the as-of when there is one', /src\.asOf/.test(editor));
  check('and it distinguishes a feed from a hand-set value in words',
    /from a feed/.test(editor) && /set by hand/.test(editor));
  /* Entered in percent, stored as a fraction — the gap between 4.2 and
     0.042 is the units error the guard exists to catch. */
  check('the editor converts percent to fraction', /Number\(t\) \/ 100/.test(editor));

  const page = readFileSync('src/pages/proveit/ProveIt.tsx', 'utf8');
  check('and it is mounted where the reader is told r and q are used',
    page.includes('CarryEditor'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
