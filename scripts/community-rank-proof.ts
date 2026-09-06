/*
  Acceptance test for 12's ranking.

  "Use Wilson lower bound rather than raw score IF RANKING GETS SERIOUS."

  It has not, and the reason is worth pinning: a Wilson lower bound is a
  confidence interval on a PROPORTION and needs positives and a total. The
  idea model carries a single net vote count with no up/down split, so the
  bound cannot be computed from it — and adding the split to rank a handful
  of rows would be arithmetic wearing a lab coat.

  What IS broken with a raw sort is age, not sample size. "Top voted" over
  a list that only grows is a permanent record: a month-old idea with 24
  votes outranks one posted this morning with 8, forever, because it has
  had a month to collect them. New posts are invisible in the one view
  meant to surface what is worth reading — the same failure Wilson is
  famous for fixing, arriving through a different door.
*/
import { readFileSync } from 'node:fs';
import { hotScore, HOT_GRAVITY, HOT_OFFSET_HOURS } from '../src/data/community';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

// ── THE DEFECT, stated ──────────────────────────────────────────────────
{
  const oldIdea = { votes: 24, at: ago(24 * 30) };   // a month old
  const newIdea = { votes: 8, at: ago(3) };          // this morning

  check('PREMISE: raw votes buries the newer idea forever',
    oldIdea.votes > newIdea.votes);
  check('and the decayed order puts the fresh one first',
    hotScore(newIdea.votes, newIdea.at, NOW) > hotScore(oldIdea.votes, oldIdea.at, NOW),
    `${hotScore(newIdea.votes, newIdea.at, NOW).toFixed(3)} vs ${hotScore(oldIdea.votes, oldIdea.at, NOW).toFixed(3)}`);
}

// ── but votes still count ───────────────────────────────────────────────
{
  /* Decay must not become "newest wins" — that order already exists and is
     a different question. At equal age, more votes must rank higher. */
  check('at equal age, more votes ranks higher',
    hotScore(30, ago(5), NOW) > hotScore(4, ago(5), NOW));
  /* And a big enough score beats a small fresh one. */
  check('a much stronger older post still beats a weak new one',
    hotScore(500, ago(6), NOW) > hotScore(1, ago(0.1), NOW),
    `${hotScore(500, ago(6), NOW).toFixed(2)} vs ${hotScore(1, ago(0.1), NOW).toFixed(2)}`);
}

// ── the edges ───────────────────────────────────────────────────────────
{
  /*
    A BRAND-NEW POST MUST NOT DIVIDE BY NEARLY ZERO and rank first on one
    vote — that is what the offset is for, and it is the failure mode of
    every hand-rolled version of this formula.
  */
  check('a one-vote post seconds old does not top a real one',
    hotScore(1, ago(0.001), NOW) < hotScore(40, ago(4), NOW),
    `${hotScore(1, ago(0.001), NOW).toFixed(3)} vs ${hotScore(40, ago(4), NOW).toFixed(3)}`);
  check('the offset is there to make that true', HOT_OFFSET_HOURS >= 1);
  check('and the gravity actually decays', HOT_GRAVITY > 1);

  /*
    A NEGATIVE SCORE MUST NOT BE RESCUED BY AGE. Dividing −10 by a large
    number floats it toward zero and up past a lightly-upvoted new post —
    decay may only ever remove standing.
  */
  check('a downvoted old post does not drift upward with age',
    hotScore(-10, ago(24 * 60), NOW) <= hotScore(-10, ago(1), NOW));
  check('and never outranks a positive one', hotScore(-50, ago(24 * 90), NOW) < hotScore(1, ago(24), NOW));

  check('a future timestamp does not produce a huge score',
    Number.isFinite(hotScore(10, new Date(NOW + 3_600_000).toISOString(), NOW)));
  check('an unparseable timestamp scores zero rather than NaN',
    hotScore(10, 'not a date', NOW) === 0);
  check('zero votes score zero', hotScore(0, ago(3), NOW) === 0);
}

// ── the surface keeps both questions ────────────────────────────────────
{
  const page = readFileSync('src/pages/community/Ideas.tsx', 'utf8');
  check('the page offers the decayed order', /'HOT'/.test(page) && /hotScore\(/.test(page));
  /* "What has the most support ever" is a real question and stays — it is
     just not the same question as "what should I read now". */
  check('and keeps top-voted rather than replacing it', /'TOP'/.test(page) && /b\.votes - a\.votes/.test(page));
  check('and newest, which is a third question again', /'NEW'/.test(page));

  const data = readFileSync('src/data/community.ts', 'utf8');
  check('the file records why this is not Wilson',
    /Wilson/.test(data) && /positives and a total|POSITIVES AND A TOTAL/i.test(data));
  check('and names what would have to change first',
    /up\/down split/i.test(data));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
