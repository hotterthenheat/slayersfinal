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
import { buildNewsFeed, sentimentReason } from '../src/data/news';
import type { NewsCategory } from '../src/types/news';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
