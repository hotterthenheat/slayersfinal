/*
  Acceptance test for Part 12's "Moderation/report affordance."

  A report button is the easiest thing on a community page to build badly,
  because every bad version LOOKS the same as the good one until somebody
  presses it. The four failures guarded here are the four that actually
  happen:

    1. The button does nothing visible, so the reader presses it again.
    2. The queue fills with reports nobody can act on.
    3. A misclick hides a post forever with no way back.
    4. "Delete" is offered for content that this browser cannot delete.
*/
import { readFileSync } from 'node:fs';
import {
  EXCERPT_MAX,
  LOCAL_ID_PREFIX,
  REPORT_REASONS,
  REPORT_REASON_ORDER,
  excerptOf,
  fileReport,
  hiddenIds,
  isLocallyAuthored,
  reportBlockedBecause,
  reportIsActionable,
  withdrawReport,
  type Report,
  type ReportReason,
} from '../src/data/moderation';
import { SEED_IDEAS, SEED_REQUESTS } from '../src/data/community';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ---- the taxonomy is closed and complete ------------------------------------
const keys = Object.keys(REPORT_REASONS) as ReportReason[];
check('every reason in the map is in the menu order', keys.every(k => REPORT_REASON_ORDER.includes(k)));
check('every reason in the menu order is in the map', REPORT_REASON_ORDER.every(k => k in REPORT_REASONS));
check('no reason appears twice in the order', new Set(REPORT_REASON_ORDER).size === REPORT_REASON_ORDER.length);

/* A reason whose note restates its own label teaches a reader nothing, and
   two readers then pick different reasons for the same post. Each note has
   to add words the label does not have. */
for (const k of REPORT_REASON_ORDER) {
  const spec = REPORT_REASONS[k];
  const labelWords = new Set(spec.label.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const noteWords = spec.note.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const fresh = noteWords.filter(w => !labelWords.has(w));
  check(`${k}: the note explains rather than repeats the label`, fresh.length >= 5, `${fresh.length} new words`);
  check(`${k}: the note is a sentence`, /[.!]$/.test(spec.note.trim()));
}

// ---- 2 · the queue cannot fill with unactionable claims ---------------------
check('"something else" with nothing written is refused', !reportIsActionable('other', ''));
check('"something else" with only whitespace is refused', !reportIsActionable('other', '   \n  '));
check('"factually wrong" with nothing written is refused', !reportIsActionable('false', ''));
check('and both say WHY they are refusing', [
  reportBlockedBecause('other', ''),
  reportBlockedBecause('false', ''),
].every(m => typeof m === 'string' && m.length > 20));
check(
  'the two refusals do not say the same thing',
  reportBlockedBecause('other', '') !== reportBlockedBecause('false', '')
);

/* The other four must NOT demand an essay. A report button that makes you
   write a paragraph to say "this is spam" is a report button nobody uses. */
const selfDescribing = REPORT_REASON_ORDER.filter(k => !REPORT_REASONS[k].needsDetail);
check('four reasons stand on their own', selfDescribing.length === 4, selfDescribing.join(', '));
check(
  'and every one of them files with an empty note',
  selfDescribing.every(k => reportIsActionable(k, '') && reportBlockedBecause(k, '') === null)
);
check('a described "something else" is accepted', reportIsActionable('other', 'doxxing another member'));
check('and then stops complaining', reportBlockedBecause('other', 'doxxing another member') === null);

// ---- 1 · pressing it changes something, and pressing twice does not double --
const idea = SEED_IDEAS[0];
let reports: Report[] = [];
reports = fileReport(reports, {
  targetId: idea.id,
  targetKind: 'idea',
  reason: 'spam',
  detail: '',
  excerpt: excerptOf(idea.thesis),
});
check('one press files one claim', reports.length === 1);
check('and the post leaves the feed', hiddenIds(reports, 'idea').has(idea.id));

reports = fileReport(reports, {
  targetId: idea.id,
  targetKind: 'idea',
  reason: 'abuse',
  detail: 'named a person',
  excerpt: excerptOf(idea.thesis),
});
check('a second press on the same post does not stack', reports.length === 1);
check('and the LATER reason is the one kept', reports[0].reason === 'abuse', reports[0].reason);
check('with the later detail', reports[0].detail === 'named a person');

/* Two different posts are two different claims — the de-dupe must key on the
   target, not merely collapse everything. */
reports = fileReport(reports, {
  targetId: SEED_IDEAS[1].id,
  targetKind: 'idea',
  reason: 'offtopic',
  detail: '',
  excerpt: excerptOf(SEED_IDEAS[1].thesis),
});
check('a different post files its own claim', reports.length === 2);

/* And the same id under a different KIND is a different row. Ideas and
   requests are separately-seeded lists; nothing stops them colliding. */
reports = fileReport(reports, {
  targetId: idea.id,
  targetKind: 'request',
  reason: 'spam',
  detail: '',
  excerpt: 'x',
});
check('the same id in another list is a separate claim', reports.length === 3);
check('and hiding is scoped to its own list', hiddenIds(reports, 'request').size === 1);

// ---- 3 · every hide is reversible -------------------------------------------
const back = withdrawReport(reports, idea.id, 'idea');
check('putting it back drops the claim', back.length === 2);
check('and the post returns to the feed', !hiddenIds(back, 'idea').has(idea.id));
check('while the OTHER list keeps its own claim', hiddenIds(back, 'request').has(idea.id));
check('withdrawing something never reported changes nothing', withdrawReport(back, 'nope', 'idea').length === back.length);

// ---- the excerpt survives the author -----------------------------------------
/* The whole reason to copy the text is that the author edits or deletes it
   after being reported. If the report only held an id, the queue would be
   worthless the moment that happened. */
check('the claim carries the words, not just an id', reports.every(r => typeof r.excerpt === 'string'));
const longBody = 'x'.repeat(EXCERPT_MAX + 200);
check('a long body is cut to the cap', excerptOf(longBody).length <= EXCERPT_MAX);
check('and says it was cut', excerptOf(longBody).endsWith('…'));
const shortBody = 'short enough';
check('a short body is left whole', excerptOf(shortBody) === shortBody);
check('newlines are flattened so a queue row stays one line', !excerptOf('a\n\nb   c').includes('\n'));
check('and collapsed rather than deleted', excerptOf('a\n\nb   c') === 'a b c');

// ---- 4 · delete is offered only where deleting is real ----------------------
/* Every seeded row belongs to the build, not to this browser. Offering
   "delete" on one would be a hide wearing the wrong word. */
const seeded = [...SEED_IDEAS.map(i => i.id), ...SEED_REQUESTS.map(r => r.id)];
check('no seeded row is deletable', seeded.every(id => !isLocallyAuthored(id)), `${seeded.length} rows`);
check('a locally-composed row is', isLocallyAuthored(`${LOCAL_ID_PREFIX}${Date.now()}`));

/* The composers are the only place that mints local ids, and the test above
   is worthless if they ever stop using the prefix. Read them. */
for (const [file, page] of [
  ['src/pages/community/Ideas.tsx', 'Ideas'],
  ['src/pages/community/Requests.tsx', 'Requests'],
] as const) {
  const src = readFileSync(file, 'utf8');
  check(`${page} still mints ids with the prefix the test relies on`, src.includes('id: `you-${Date.now()}`'));
  check(`${page} asks isLocallyAuthored rather than checking the author string`, src.includes('mine={isLocallyAuthored('));
  check(`${page} offers a way back`, src.includes('HiddenShelf') && src.includes('Put back'));
}

/* And the dialog must promise the immediate effect. A confirm button
   labelled only "Report" is the version that gets pressed twice. */
const control = readFileSync('src/components/community/ReportControl.tsx', 'utf8');
check('the confirm button names the hide', control.includes('Hide and report'));
check('the copy says nobody has reviewed it', /Nobody has reviewed it/i.test(control));
check('deleting your own post warns there is no undo', /no undo/i.test(control));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
