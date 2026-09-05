/*
  Acceptance test for Part 10 — the tab that advertises rigour.

  Two items, and they are the same item twice: a quant surface that looks
  authoritative and does not say what is behind it.

  MODEL DISCLOSURE. A fan chart with a percentile cone and a histogram is
  the most authoritative-looking object a quant interface produces. Behind
  it is geometric Brownian motion, which the checklist correctly calls the
  weakest assumption in the app. Naming it is not enough — the reader needs
  to know in WHICH DIRECTION it is wrong, because for options every one of
  its errors runs the same way.

  LOCKED PREDICTIONS. A scoreboard is a claim that the desk called things
  correctly, and it is worth exactly nothing unless the calls were fixed
  before the results were known. Any model grades brilliantly against a
  window chosen after the fact.
*/
import { readFileSync } from 'node:fs';
import {
  modelScoreboard, MC_MODEL_NAME, MC_MODEL_ASSUMPTIONS, MC_MODEL_NOTE,
  SCOREBOARD_LOCK_NOTE, MATURITY_DAYS,
} from '../src/core/quant';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── the model is named, and its failures are named ──────────────────────
{
  check('the model has a name, not an acronym in a subtitle',
    MC_MODEL_NAME.length > 10 && /brownian/i.test(MC_MODEL_NAME), MC_MODEL_NAME);
  check('there are several stated assumptions', MC_MODEL_ASSUMPTIONS.length >= 3,
    `${MC_MODEL_ASSUMPTIONS.length}`);
  check('each one says what it is AND why it is wrong',
    MC_MODEL_ASSUMPTIONS.every(a => a.claim.length > 8 && a.why.length > 60));

  /*
    THE THREE THAT MATTER FOR OPTIONS, by name. A disclosure that says
    "this is a model, models are imperfect" teaches nothing. Fat tails, vol
    clustering and jumps are the specific ways GBM misprices exactly what
    an option buyer is paying for, and all three errors run the same way.
  */
  const all = MC_MODEL_ASSUMPTIONS.map(a => `${a.claim} ${a.why}`).join(' ').toLowerCase();
  check('fat tails are named', /fat|tail/.test(all));
  check('vol clustering is named', /cluster/.test(all));
  check('the absence of jumps is named', /jump|gap/.test(all));
  check('and the note tells the reader how to read the cone',
    /shape, not as a probability/i.test(MC_MODEL_NOTE), MC_MODEL_NOTE.slice(-60));

  const page = readFileSync('src/pages/proveit/ProveIt.tsx', 'utf8');
  check('the page renders the model card beside the chart',
    page.includes('MC_MODEL_ASSUMPTIONS') && page.includes('MC_MODEL_NAME'));
  check('and calls it the weakest assumption in as many words',
    /weakest assumption/i.test(page));
}

// ── the lock ─────────────────────────────────────────────────────────────
{
  const rows = modelScoreboard();
  check('there are rows to check', rows.length > 0, `${rows.length} models`);
  check('every row carries a lock window and a maturity date',
    rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.lockedFrom) && /^\d{4}-\d{2}-\d{2}$/.test(r.lockedTo) && /^\d{4}-\d{2}-\d{2}$/.test(r.maturedThrough)),
    rows[0] ? `${rows[0].lockedFrom} → ${rows[0].lockedTo} / ${rows[0].maturedThrough}` : '');

  /*
    THE WINDOWS MUST NOT OVERLAP, and this is the whole assertion. If a
    prediction could be locked on or after the date its outcome is known,
    the scoreboard is grading the model against information the model had
    — which is the failure the lock exists to make impossible.
  */
  check('the lock window closes strictly BEFORE outcomes are known',
    rows.every(r => r.lockedTo < r.maturedThrough),
    rows[0] ? `lockedTo ${rows[0].lockedTo} vs matured ${rows[0].maturedThrough}` : '');
  check('and it opens before it closes', rows.every(r => r.lockedFrom < r.lockedTo));
  /* THE GAP IS THE FULL HORIZON, not merely non-zero. The last prediction
     counted has to have had every one of its maturity days — a first
     version left one day between the two dates, which contradicts the
     field's own documentation and would grade a call on an outcome it
     could not have had. */
  check('the gap is the whole maturity horizon', (() => {
    const r = rows[0];
    const days = (Date.parse(r.maturedThrough) - Date.parse(r.lockedTo)) / 86_400_000;
    return days >= MATURITY_DAYS;
  })(), rows[0] ? `${(Date.parse(rows[0].maturedThrough) - Date.parse(rows[0].lockedTo)) / 86_400_000} of ${MATURITY_DAYS} days` : '');

  check('every model states the same window — one scoreboard, one claim',
    new Set(rows.map(r => `${r.lockedFrom}|${r.lockedTo}|${r.maturedThrough}`)).size === 1);

  check('the window is a real span, not a single day',
    (Date.parse(rows[0].lockedTo) - Date.parse(rows[0].lockedFrom)) / 86_400_000 > 30,
    `${Math.round((Date.parse(rows[0].lockedTo) - Date.parse(rows[0].lockedFrom)) / 86_400_000)} days`);

  check('the lock note says the two windows cannot overlap',
    /do not overlap/i.test(SCOREBOARD_LOCK_NOTE) && /before its outcome was known/i.test(SCOREBOARD_LOCK_NOTE));

  // Sample sizes have to be real counts, not decoration.
  check('every row reports a sample size', rows.every(r => r.sample > 0 && Number.isInteger(r.sample)));

  const page = readFileSync('src/pages/proveit/ProveIt.tsx', 'utf8');
  check('the page prints the lock window rather than only storing it',
    page.includes('lockedFrom') && page.includes('maturedThrough'));
  check('and it has an empty state for a scoreboard with nothing matured',
    /No matured predictions yet/i.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
