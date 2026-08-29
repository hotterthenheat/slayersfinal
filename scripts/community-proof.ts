/*
  Acceptance test for §19's social layer.

  The number this file exists to defend is the HIT RATE, because it is the
  one figure on the board that could quietly become marketing. Everything
  else here is presentation; that is a claim about a person.

  Proves:
  1. Avatars are derived and stable — same handle, same face, forever — and
     two handles do not collide by construction
  2. An idea is OPEN until a full session has passed; open ideas count
     toward nothing
  3. Under the minimum sample nobody is ranked, and the hit rate is NULL
     rather than a flattering percentage of one
  4. Hit rate is hits over RESOLVED, never over posts — open ideas must not
     dilute or inflate it
  5. The ordering puts ranked members above unranked ones regardless of votes
  6. Threads are stable per idea
*/
import {
  MIN_RANKED_POSTS, RESOLVE_AFTER_HOURS, avatarFor, commentsFor, leaderboard, outcomeOf,
} from '../src/data/communitySocial';
import type { CommunityIdea } from '../src/types/community';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};

const NOW = Date.parse('2026-08-29T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
let n = 0;
const idea = (author: string, hoursOld: number): CommunityIdea => ({
  id: `i${++n}`, author, ticker: 'SPY', direction: 'BULLISH',
  thesis: 'x', votes: 5, createdAt: ago(hoursOld),
});

// ── 1. avatars ────────────────────────────────────────────────────────────
{
  const a = avatarFor('gammahunter');
  check('an avatar is derived from the handle', a.initials === 'GA' && a.hue >= 0 && a.hue <= 360, `${a.initials} h${a.hue}`);
  check('and it is the same every time', JSON.stringify(avatarFor('gammahunter')) === JSON.stringify(a));
  check('a different handle is a different face', avatarFor('flowsniper').hue !== a.hue || avatarFor('flowsniper').initials !== a.initials);
  check('a handle of symbols still yields initials', avatarFor('___').initials.length === 2, avatarFor('___').initials);
  /* Hues spread across the wheel rather than clustering. */
  const hues = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(h => avatarFor(`user_${h}`).hue).sort((x, y) => x - y);
  const spread = hues[hues.length - 1] - hues[0];
  check('hues spread across the wheel, not clustered', spread > 150, `spread ${spread}`);
}

// ── 2. open until resolved ────────────────────────────────────────────────
{
  check('a fresh idea is OPEN', outcomeOf(idea('a', 1), NOW) === 'OPEN');
  check(`— right up to ${RESOLVE_AFTER_HOURS}h`, outcomeOf(idea('a', RESOLVE_AFTER_HOURS - 0.1), NOW) === 'OPEN');
  check('and past it, it resolves', outcomeOf(idea('a', RESOLVE_AFTER_HOURS + 1), NOW) !== 'OPEN');
  const one = idea('a', 100);
  check('resolution is stable for the same idea', outcomeOf(one, NOW) === outcomeOf(one, NOW));
}

// ── 3+4. the record needs a sample ────────────────────────────────────────
{
  /* Four resolved ideas — under the floor. */
  const thin = leaderboard([idea('thin', 100), idea('thin', 101), idea('thin', 102), idea('thin', 103)], NOW);
  check(`under ${MIN_RANKED_POSTS} resolved, nobody is ranked`, thin[0].ranked === false);
  check('— and the hit rate is NULL, not a percentage of four', thin[0].hitRate === null, String(thin[0].hitRate));

  /* Eight resolved — over the floor. */
  const many = Array.from({ length: 8 }, (_, i) => idea('fat', 100 + i));
  const fat = leaderboard(many, NOW)[0];
  check(`at ${MIN_RANKED_POSTS}+ resolved, a record exists`, fat.ranked && fat.hitRate !== null, `${fat.hitRate?.toFixed(0)}%`);
  check('and it is hits over RESOLVED, exactly',
    Math.abs((fat.hitRate as number) - (fat.hits / (fat.hits + fat.misses)) * 100) < 1e-9);

  /* The trap: open ideas must not touch the denominator. */
  const mixed = leaderboard([...many, idea('fat', 1), idea('fat', 2), idea('fat', 3)], NOW)[0];
  check('open ideas raise the post count', mixed.posts === 11 && mixed.open === 3, `${mixed.posts} posts, ${mixed.open} open`);
  check('— but do NOT change the hit rate', Math.abs((mixed.hitRate as number) - (fat.hitRate as number)) < 1e-9,
    `${fat.hitRate?.toFixed(2)} vs ${mixed.hitRate?.toFixed(2)}`);
  check('hits and misses always sum to the resolved count',
    mixed.hits + mixed.misses + mixed.open === mixed.posts);
}

// ── 5. the ordering ───────────────────────────────────────────────────────
{
  const ranked = Array.from({ length: 6 }, (_, i) => idea('ranked', 100 + i));
  const loud = [{ ...idea('loud', 1), votes: 9999 }];
  const board = leaderboard([...ranked, ...loud], NOW);
  check('a ranked member outranks an unranked one, however loud',
    board[0].handle === 'ranked' && board[1].handle === 'loud',
    board.map(b => `${b.handle}${b.ranked ? '*' : ''}`).join(' '));
  check('an empty board is an empty list, not a crash', leaderboard([], NOW).length === 0);
}

// ── 6. threads ────────────────────────────────────────────────────────────
{
  const one = idea('a', 5);
  const c1 = commentsFor(one), c2 = commentsFor(one);
  check('a thread is stable for its idea', JSON.stringify(c1) === JSON.stringify(c2));
  check('every comment names an author and a body', c1.every(c => c.author.length > 0 && c.body.length > 10));
  check('replies come after the idea they answer',
    c1.every(c => Date.parse(c.createdAt) > Date.parse(one.createdAt)));
  check('a different idea has a different thread',
    JSON.stringify(commentsFor(idea('a', 5))) !== JSON.stringify(c1) || c1.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
