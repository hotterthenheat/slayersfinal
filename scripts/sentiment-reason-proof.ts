/*
  Acceptance test for 8.1's sentiment reasoning.

  "Sentiment display per article (positive/negative/neutral) with the
   sentiment REASONING on hover — the reasoning field is the
   differentiator; don't drop it."

  A bare +0.7 beside a headline is a number the reader must accept or
  ignore, and most will ignore it. The reasoning is what makes the score
  checkable: a reader who disagrees with the REASON can discount the score,
  which is the only useful thing anyone does with a sentiment model.

  Two failures are guarded here. The obvious one is a missing field. The
  subtler one is a reason that says nothing — "this story is positive"
  restates the score in words and is worse than absent, because it looks
  like an explanation.
*/
import { readFileSync } from 'node:fs';
import { CONFIDENCE_METHOD, CONFIDENCE_RUNGS, confidenceWord } from '../src/data/news';
import { buildNewsFeed, sentimentReason, type NewsCategory } from '../src/data/news';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const feed = buildNewsFeed();
check('PREMISE: there is a feed', feed.length > 5, `${feed.length} items`);

// ── every item carries one ──────────────────────────────────────────────
{
  check('every headline has a reasoning', feed.every(n => typeof n.sentimentWhy === 'string' && n.sentimentWhy.length > 40),
    `shortest ${Math.min(...feed.map(n => n.sentimentWhy.length))} chars`);

  /*
    AND IT MATCHES THE SCORE'S SIGN. A reason is derived from the category
    and the direction, so a positive story explained by a negative reason
    would mean the two had come apart — which is precisely what writing the
    reason on each of twenty-four templates would eventually cause.
  */
  let mismatch = '';
  for (const n of feed) {
    const expected = sentimentReason(n.category, n.sentiment);
    if (n.sentimentWhy !== expected) { mismatch = `${n.category} ${n.sentiment.toFixed(2)}`; break; }
  }
  check('the reasoning always agrees with the score that produced it', mismatch === '', mismatch);
}

// ── the reason says something ───────────────────────────────────────────
{
  const cats: NewsCategory[] = ['Analyst', 'Guidance', 'Product', 'M&A', 'Regulatory', 'Earnings', 'Macro'];
  check('every category is covered in both directions',
    cats.every(c => sentimentReason(c, 1).length > 40 && sentimentReason(c, -1).length > 40));

  /*
    A REASON THAT RESTATES THE SCORE IS WORSE THAN NONE — it looks like an
    explanation. "Scored positive because it is good news" teaches nothing;
    the useful reason says what the CATEGORY does to a price.
  */
  const empty = cats.filter(c => {
    const up = sentimentReason(c, 1).toLowerCase();
    return /^scored (positive|negative)\.?$/.test(up.trim()) || up.length < 60;
  });
  check('no reason merely restates the direction', empty.length === 0, empty.join(', '));

  const allText = cats.flatMap(c => [sentimentReason(c, 1), sentimentReason(c, -1)]);
  check('every reason is distinct — no two categories share an explanation',
    new Set(allText).size === allText.length);

  /* The reasons should say what moves, on what horizon, or why the
     magnitude is what it is — the things a reader could argue with. */
  const joined = allText.join(' ').toLowerCase();
  check('the reasons argue about mechanism, not mood',
    /expectation/.test(joined) && /magnitude|weight|discount|horizon|session/.test(joined));

  /* Two directions of the same category must differ — a symmetric reason
     is a reason that was not thought about. */
  const asymmetric = cats.filter(c => sentimentReason(c, 1) !== sentimentReason(c, -1));
  check('up and down are explained differently in every category',
    asymmetric.length === cats.length, `${asymmetric.length} of ${cats.length}`);
}

// ── zero borrows nothing ────────────────────────────────────────────────
{
  /* A neutral headline inheriting the positive reason would be the model
     asserting a lean it does not have. */
  const z = sentimentReason('Analyst', 0);
  check('a zero score gets its own reason', z !== sentimentReason('Analyst', 1) && z !== sentimentReason('Analyst', -1));
  check('and it says neutral rather than picking a side', /neutral/i.test(z), z);
}

// ── the surfaces show it ────────────────────────────────────────────────
{
  const widget = readFileSync('src/pages/workspace/NewsWidget.tsx', 'utf8');
  check('the widget shows the reasoning', /sentimentWhy/.test(widget));
  /* 0.13's rule too: the direction was carried by ink alone, which gives a
     reader who cannot separate green from red nothing at all. */
  check('and states the direction in a word, not only in colour',
    /positive.*negative.*neutral/s.test(widget));

  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');
  check('the news room attaches it to the grade', /sentimentWhy/.test(room));
}

// ── the other number the room printed without a scale ───────────────────
{
  /*
    "Confidence: 71%", beside two expected moves, in the same typeface, with
    no scale and no door. The number underneath is
    `42 + magnitude * 40 + h01(seed) * 12` — ONE real input and up to twelve
    points of hash on top — so a reader comparing a 71% headline against a
    68% one was comparing two hashes.

    THE DESK HAD ALREADY MADE THIS ARGUMENT, about severity: "two inputs on
    a ten-point scale cannot carry the precision a printed 7 would imply."
    The same sentence is true here with a bigger number and a bigger seed.
    Words, three rungs, and a door — the treatment severity already got.
  */
  const news = readFileSync('src/data/news.ts', 'utf8');
  const room = readFileSync('src/pages/newsroom/NewsRoom.tsx', 'utf8');

  check('confidence has words and rungs', /export const CONFIDENCE_RUNGS/.test(news) && /export function confidenceWord|export const confidenceWord/.test(news));
  check('  · three of them, ordered and touching', (() => {
    if (CONFIDENCE_RUNGS.length !== 3) return false;
    return CONFIDENCE_RUNGS.every((r, i) => r.from <= r.to && (i === 0 || CONFIDENCE_RUNGS[i - 1].to + 1 === r.from));
  })(), CONFIDENCE_RUNGS.map(r => `${r.word} ${r.from}-${r.to}`).join(' · '));
  /* The rungs on the door have to be the cuts the code makes, or the door
     is a second place the scale is written down. */
  check('  · and the rungs are the cuts confidenceWord makes',
    CONFIDENCE_RUNGS.every(r => confidenceWord(r.from) === r.word && confidenceWord(r.to) === r.word));
  check('  · covering the whole range, so nothing is unnameable',
    CONFIDENCE_RUNGS[0].from === 0 && CONFIDENCE_RUNGS[CONFIDENCE_RUNGS.length - 1].to === 100);

  check('the method says what it leans on', /magnitude/i.test(CONFIDENCE_METHOD));
  check('  · admits it is a model, not a track record', /MODEL OUTPUT, not a track record/.test(CONFIDENCE_METHOD));
  /* THE CALIBRATION ADMISSION IS THE POINT. A confidence nothing has ever
     scored is an opinion about an opinion, and saying so is the difference
     between a model and a claim. */
  check('  · and says plainly that nothing has ever scored it',
    /nothing here has checked/i.test(CONFIDENCE_METHOD) && /graded outcomes/i.test(CONFIDENCE_METHOD));
  check('  · giving the same reason severity gives for hiding its number',
    /cannot carry the precision/.test(CONFIDENCE_METHOD));

  check('the room prints the word, not the percentage', /confidenceWord\(selected\.item\.prediction\.confidencePct\)/.test(room));
  check('  · and the raw percentage is gone from the surface',
    !/value=\{selected\.item\.prediction\.confidencePct\}/.test(room));
  check('  · behind a door rather than a hover', /setConfidenceDoor\(true\)/.test(room) && /What confidence measures/.test(room));

  /* The number itself still has a job inside the engine — the playbook rule
     reads it — so this is about what is PRINTED, not about deleting it. */
  check('the engine keeps the number it actually uses', /confidencePct < 55/.test(news));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
