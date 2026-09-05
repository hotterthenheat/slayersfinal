/*
  Acceptance test for 9.3 — the IPO calendar.

  Two of its items are refusals, and both are the kind of thing a calendar
  gets wrong by inheritance rather than by decision.

  A WITHDRAWN DEAL MUST NEVER READ AS UPCOMING. Every calendar ever built
  sorts by date, and a pulled deal keeps its date — so it sits among next
  week's live ones, in the same ink, and the reason it is dead is a column
  the reader has to notice. The checklist says it plainly and the fix
  belongs at the source, not in a filter the next view forgets to apply.

  A NEW LISTING HAS NO OPTIONS. Not few — none. Exchanges season a new
  issue for days to weeks, so every options surface on this desk is
  unavailable for it, and a link that opens an empty Weigher is worse than
  one that says why it cannot.
*/
import {
  buildIpoCalendar, chainBlockedReason, isPending, isDead,
  IPO_STATUS_WORDS, IPO_STATUS_NOTES, OPTIONS_SEASONING_SESSIONS,
  type IpoStatus,
} from '../src/data/ipo';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const deals = buildIpoCalendar();
check('PREMISE: there is a calendar', deals.length > 5, `${deals.length} deals`);
check('and it spans both sides of today — resolved deals beside pending ones',
  deals.some(d => d.daysOut > 0) && deals.some(d => d.daysOut <= 0),
  `${deals.filter(d => d.daysOut > 0).length} ahead, ${deals.filter(d => d.daysOut <= 0).length} behind`);

// ── a date in the past cannot be upcoming ───────────────────────────────
{
  const wrong = deals.filter(d => d.status === 'upcoming' && d.daysOut <= 0);
  check('nothing dated today or earlier calls itself upcoming', wrong.length === 0,
    wrong.map(d => `${d.ticker} ${d.date}`).join(', '));

  /* And the inverse, which is the subtler half: a deal still ahead must
     not be marked priced, because a price it has not come at yet is a
     number the reader would act on. */
  const early = deals.filter(d => d.status === 'priced' && d.daysOut > 0);
  check('nothing still ahead claims to have priced', early.length === 0,
    early.map(d => d.ticker).join(', '));

  check('exactly the upcoming deals count as pending',
    deals.every(d => isPending(d.status) === (d.status === 'upcoming')));
  check('and withdrawn is the only dead one',
    deals.every(d => isDead(d.status) === (d.status === 'withdrawn')));
}

// ── the ordering does not bury a live deal behind a dead one ────────────
{
  const firstResolved = deals.findIndex(d => !isPending(d.status));
  const lastPending = deals.map(d => isPending(d.status)).lastIndexOf(true);
  check('every pending deal sorts above every resolved one',
    firstResolved === -1 || lastPending < firstResolved,
    `last pending at ${lastPending}, first resolved at ${firstResolved}`);

  const pending = deals.filter(d => isPending(d.status));
  check('and pending deals run soonest-first',
    pending.every((d, i) => i === 0 || d.daysOut >= pending[i - 1].daysOut));
}

// ── a pulled deal carries no live numbers ───────────────────────────────
{
  const dead = deals.filter(d => isDead(d.status));
  check('a withdrawn deal shows no filed range',
    dead.every(d => d.rangeLow === null && d.rangeHigh === null),
    `${dead.length} withdrawn`);
  check('and never a price it came at', dead.every(d => d.pricedAt === null));
  /* An ETA on a withdrawn filing is a countdown to nothing. */
  check('and no options ETA — that would be a countdown to nothing',
    dead.every(d => d.chainEta === null));

  const priced = deals.filter(d => d.status === 'priced');
  check('only a priced deal reports what it came at',
    deals.every(d => (d.pricedAt !== null) === (d.status === 'priced')),
    `${priced.length} priced`);
  /* Deals price outside their filed range often; keeping both lets the
     surface show the gap rather than quietly replacing one with the other. */
  check('a priced deal keeps its filed range beside the print',
    priced.every(d => d.rangeLow !== null && d.rangeHigh !== null));
}

// ── no options on a new listing ─────────────────────────────────────────
{
  check('nothing that has not traded has a chain',
    deals.filter(d => d.status !== 'priced').every(d => !d.hasChain));
  check('and nothing that traded within the seasoning window does either',
    deals.filter(d => d.status === 'priced' && -d.daysOut < OPTIONS_SEASONING_SESSIONS).every(d => !d.hasChain));
  check('the seasoning window is days, not hours', OPTIONS_SEASONING_SESSIONS >= 3,
    `${OPTIONS_SEASONING_SESSIONS} sessions`);

  /*
    THE REASON IS THE FEATURE. A disabled link with no explanation is a
    broken link with better manners — the reader is left deciding whether
    the desk is broken or the deal is.
  */
  const blocked = deals.filter(d => !d.hasChain);
  check('every dealt without a chain gives a reason',
    blocked.every(d => (chainBlockedReason(d) ?? '').length > 30),
    `${blocked.length} blocked`);
  check('and a deal WITH a chain gives none',
    deals.filter(d => d.hasChain).every(d => chainBlockedReason(d) === null));

  const reasons = blocked.map(d => `${d.status}:${chainBlockedReason(d)}`);
  check('a withdrawn deal is told it will never have one',
    reasons.filter(r => r.startsWith('withdrawn')).every(r => /will be no chain/i.test(r)));
  check('an upcoming one is told it has not traded yet',
    reasons.filter(r => r.startsWith('upcoming')).every(r => /not listed yet/i.test(r)));
}

// ── the vocabulary ──────────────────────────────────────────────────────
{
  const all: IpoStatus[] = ['upcoming', 'priced', 'withdrawn', 'postponed'];
  check('all four statuses are worded', all.every(s => IPO_STATUS_WORDS[s] && IPO_STATUS_NOTES[s]?.length > 40));
  check('no two share a word', new Set(all.map(s => IPO_STATUS_WORDS[s])).size === 4);
  /* Withdrawn and postponed are genuinely different and are the pair most
     likely to be collapsed — one is over, the other is waiting. */
  check('withdrawn and postponed are told apart in the copy',
    /not happening/i.test(IPO_STATUS_NOTES.withdrawn) && /may return/i.test(IPO_STATUS_NOTES.postponed));
  check('and the calendar says why a dead deal is kept on it',
    /assumes they missed/i.test(IPO_STATUS_NOTES.withdrawn));
}

// ── determinism ─────────────────────────────────────────────────────────
{
  const again = buildIpoCalendar();
  check('the same session yields the same calendar',
    JSON.stringify(again) === JSON.stringify(deals));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
