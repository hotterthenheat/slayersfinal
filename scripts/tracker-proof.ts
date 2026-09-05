/*
  Acceptance test for Part 11 — the Tracker.

  THE DEFECT THIS FIXES was a date. The expired card read "This contract
  expired {date}" and printed `trackedAt` — WHEN THE READER BOOKMARKED IT.
  For a 0DTE that is off by a day and looks right; for a LEAPS it is off by
  a year, stated as a fact, in the one sentence whose entire job is to say
  when something ended. Two facts about a contract lived in one field and
  the wrong one was on screen.
*/
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const src = readFileSync('src/pages/Tracker.tsx', 'utf8');

// ── the expiry is the expiry ────────────────────────────────────────────
{
  check('there is a function that computes when a contract dies', /function expiresAt\(/.test(src));
  /* ONE SOURCE. The date shown and the state shown must come from the same
     place, or a card can say "expired" beside a future date. */
  check('the expired flag is derived from it rather than recomputed',
    /function isExpired[\s\S]{0,200}expiresAt\(tracked\)/.test(src));
  check('and the card no longer prints the bookmark date as the expiry',
    !/expired \{new Date\(tracked\.trackedAt\)/.test(src));
  check('it prints the computed expiry instead', /expiresAt\(tracked\)[\s\S]{0,220}toLocaleDateString/.test(src));
  /* The bookmark date is still worth showing — it is just a different
     fact, and now labelled as one. */
  check('and still shows when it was bookmarked, said as that',
    /Bookmarked \{new Date\(tracked\.trackedAt\)/.test(src));

  /* A swing never date-expires, so it must get null rather than a date
     invented from Infinity. */
  check('a never-expiring sleeve yields null, not a date from Infinity',
    /if \(!Number\.isFinite\(dte\)\) return null;/.test(src));
}

// ── the sort ────────────────────────────────────────────────────────────
{
  check('there is a sort', /type SortKey/.test(src) && /SORT_LABEL/.test(src));
  const keys = (src.match(/const SORT_LABEL: Record<SortKey, string> = \{([\s\S]*?)\};/)?.[1] ?? '')
    .split('\n').map(l => l.trim().split(':')[0]).filter(Boolean);
  check('it offers several orders', keys.length >= 4, keys.join(', '));
  check('every order explains itself', (src.match(/const SORT_NOTE/) ?? []).length > 0 &&
    keys.every(k => new RegExp(`${k}:\\s*['"\`]`).test(src.slice(src.indexOf('SORT_NOTE')))));

  /*
    DEAD CARDS SINK IN EVERY ORDER. An expired contract has no live
    confidence and no future; interleaving it by score puts a dead card
    above a live one and makes the reader check each badge to find what
    they can still act on.
  */
  check('expired rows sort last whatever the order',
    /a\.expired === b\.expired \? by\[sort\]\(a, b\) : a\.expired \? 1 : -1/.test(src));

  /* "Moved" is measured against the score the setup carried WHEN TRACKED —
     a live score alone cannot answer "has this held up". */
  check('the "moved" order compares against the score at tracking time',
    /live\.score - [ab]\.tracked\.scoreAtTrack/.test(src));

  /* One row cannot be sorted, so the control should not appear. */
  check('the control is hidden when there is nothing to order',
    /trackedSetups\.length > 1 && \(/.test(src));
}

// ── the states the page already had, held in place ─────────────────────
{
  check('the empty state names the way in', /No tracked setups yet/.test(src) && /Compass/.test(src));
  check('an expired card cannot be reviewed', /Expired contracts have no live setup to review/.test(src));
  check('and the count says how many are dead', /expired<\/span>|expired\n/.test(src) || /expired$/m.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
