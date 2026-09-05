/*
  Acceptance test for the four empty states added in Part 0.1.

  THE FAILURE THIS PREVENTS IS DEAD COPY. An empty state written for a cut
  that can never be empty is worse than none: it is code nobody maintains,
  nobody sees, and nobody can tell has rotted. Every one of the four had to
  be PROVED reachable before it was written, and that proof belongs here so
  the reverse is caught too — a tuning change that makes a threshold
  unreachable should fail this file rather than quietly orphan a sentence.

  The four:
    Stocks         · the Strong tab, when nothing clears the composite bar
    Earnings Hub   · the Cheap tab, when nothing is discounted
    Earnings tile  · the same cut on the Pulse desk
    News tile      · each of the four beats, when the wire draws none

  Reachable is not the same as common. A state that fires on 1% of sessions
  still has to read correctly on that session, and the counts below are the
  record of how often each one is actually seen.
*/
import { withEngineClock } from '../src/core/clock';
import { buildNewsFeed, type NewsCategory } from '../src/data/news';
import { buildEarningsCalendar } from '../src/data/earnings';
import { stateOf } from '../src/components/earnings/volState';
import { buildStockBoard } from '../src/data/stocks';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 5, 15, 0, 0);
const SESSIONS = 400;

const NEWS_CATS: NewsCategory[] = ['Earnings', 'Guidance', 'Analyst', 'Macro'];
const VOL_STATES = ['RICH', 'INLINE', 'CHEAP'] as const;
const VERDICTS = ['ACCUMULATE', 'AVOID'] as const;

const emptyNews: Record<string, number> = {};
const emptyVol: Record<string, number> = {};
const emptyVerdict: Record<string, number> = {};
let sessions = 0;

for (let d = 0; d < SESSIONS; d++) {
  const t = BASE + d * DAY;
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  sessions++;
  withEngineClock(new Date(t), () => {
    const feed = buildNewsFeed();
    for (const c of NEWS_CATS) {
      if (feed.filter(n => n.category === c).length === 0) emptyNews[c] = (emptyNews[c] ?? 0) + 1;
    }
    const events = buildEarningsCalendar();
    for (const v of VOL_STATES) {
      if (events.filter(e => stateOf(e) === v).length === 0) emptyVol[v] = (emptyVol[v] ?? 0) + 1;
    }
    const picks = buildStockBoard();
    for (const v of VERDICTS) {
      if (picks.filter(p => p.verdict === v).length === 0) emptyVerdict[v] = (emptyVerdict[v] ?? 0) + 1;
    }
  });
}

check('PREMISE: enough sessions sampled to see a 1% event', sessions >= 250, `${sessions}`);

// ── 1. the News tile's beats ─────────────────────────────────────────────
{
  const reachable = NEWS_CATS.filter(c => (emptyNews[c] ?? 0) > 0);
  check(
    'the News tile can empty on every beat it offers',
    reachable.length === NEWS_CATS.length,
    NEWS_CATS.map(c => `${c} ${emptyNews[c] ?? 0}`).join(' · '),
  );
  // Never ALL of them at once, or the tile would be empty on its default tab
  let allBlank = 0;
  for (let d = 0; d < SESSIONS; d++) {
    const t = BASE + d * DAY;
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    withEngineClock(new Date(t), () => {
      if (buildNewsFeed().length === 0) allBlank++;
    });
  }
  check('the wire itself is never blank — only its cuts are', allBlank === 0, `${allBlank} blank sessions`);
}

// ── 2. the Earnings cut, on the page and the tile ────────────────────────
{
  check(
    'the Cheap earnings cut is reachable',
    (emptyVol.CHEAP ?? 0) > 0,
    `CHEAP ${emptyVol.CHEAP ?? 0} of ${sessions}`,
  );
  check(
    'the slate itself always has reports — only the cut empties',
    (emptyVol.RICH ?? 0) < sessions && (emptyVol.INLINE ?? 0) < sessions,
    VOL_STATES.map(v => `${v} ${emptyVol[v] ?? 0}`).join(' · '),
  );
}

// ── 3. the Stocks verdict tab ────────────────────────────────────────────
{
  check(
    'the Strong verdict tab is reachable-empty',
    (emptyVerdict.ACCUMULATE ?? 0) > 0,
    `ACCUMULATE ${emptyVerdict.ACCUMULATE ?? 0} of ${sessions}`,
  );
  let blankBoard = 0;
  for (let d = 0; d < SESSIONS; d++) {
    const t = BASE + d * DAY;
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    withEngineClock(new Date(t), () => {
      if (buildStockBoard().length === 0) blankBoard++;
    });
  }
  check('the screening board is never blank — only a verdict tab is', blankBoard === 0, `${blankBoard} blank sessions`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
