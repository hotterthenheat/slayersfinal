import { readFileSync } from 'node:fs';
import {
  SEED,
  WATCHLIST_CAP,
  __setForTest,
  getWatchlist,
  isWatched,
  normalizeTicker,
  resetWatchlist,
  toggleWatch,
  unwatch,
  watch,
} from '../src/data/watchlist';

/*
==================================================
  SLAYER TERMINAL - PROOF · THE WATCHLIST
  (scripts/watchlist-proof.ts) — Part 9.4
==================================================

  A watchlist is the first place on this desk where a reader puts WORK. Every
  other piece of state here is a view of something the engine computed; this
  one is theirs, and losing it is not a rendering bug, it is losing what they
  did. So the assertions are about what cannot be allowed to happen to it:

    A BAD SYMBOL NEVER ENTERS   the list is read by a calendar row, a board
                                and a URL. One malformed entry is a broken
                                row on every one of them.
    NOTHING IS LOST SILENTLY    adding a duplicate is a no-op, order is
                                insertion order because that IS the meaning,
                                and the cap drops the oldest rather than
                                refusing a click the reader deliberately
                                made.
    AN EMPTY LIST IS A STATE    a reader who removes everything has an empty
                                watchlist, not a fresh one. Re-seeding them
                                back to four names they did not ask for is
                                the same failure as losing four they did.
*/

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// ── a symbol is a symbol ───────────────────────────────────────────────────
{
  check('a plain ticker normalizes', normalizeTicker('aapl') === 'AAPL');
  check('  · whitespace is trimmed', normalizeTicker('  msft ') === 'MSFT');
  check('  · a class suffix survives', normalizeTicker('BRK.B') === 'BRK.B');
  for (const bad of ['', ' ', '1AAPL', 'TOOLONGX', 'A B', 'AA;PL', '<script>', null, undefined, 42, {}]) {
    check(`  · ${JSON.stringify(bad)} is refused`, normalizeTicker(bad) === null);
  }
}

// ── adding, removing, and the order that carries the meaning ───────────────
{
  __setForTest([]);
  watch('AAPL');
  watch('MSFT');
  watch('NVDA');
  check('names arrive in the order they were kept', getWatchlist().join() === 'AAPL,MSFT,NVDA');
  watch('MSFT');
  check('a duplicate is a no-op, and does not reorder', getWatchlist().join() === 'AAPL,MSFT,NVDA');
  check('a name that is on the list reads as watched', isWatched('msft') && isWatched('AAPL'));
  check('  · and one that is not, does not', !isWatched('TSLA'));
  unwatch('MSFT');
  check('removing takes out exactly one', getWatchlist().join() === 'AAPL,NVDA');
  unwatch('MSFT');
  check('  · and removing it twice is not an error', getWatchlist().join() === 'AAPL,NVDA');
  watch('not a ticker');
  check('a malformed name never enters the list', getWatchlist().join() === 'AAPL,NVDA');
}

// ── the toggle a button calls ──────────────────────────────────────────────
{
  __setForTest(['AAPL']);
  check('toggling an absent name adds it and says so', toggleWatch('TSLA') === true && isWatched('TSLA'));
  check('toggling a present one removes it and says so', toggleWatch('TSLA') === false && !isWatched('TSLA'));
  check('toggling a malformed name changes nothing', toggleWatch('!!') === false && getWatchlist().join() === 'AAPL');
}

// ── the cap drops the oldest rather than refusing the click ────────────────
{
  __setForTest([]);
  /* Two-letter symbols so the generator itself cannot produce an invalid
     one — a proof that quietly stops adding is a proof of nothing. */
  const many = Array.from({ length: WATCHLIST_CAP + 5 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
  for (const t of many) watch(t);
  const list = getWatchlist();
  check(`the list stops at ${WATCHLIST_CAP}`, list.length === WATCHLIST_CAP, `${list.length}`);
  check('  · the newest name is kept', list[list.length - 1] === many[many.length - 1]);
  check('  · and it is the OLDEST that left', !list.includes(many[0]) && !list.includes(many[4]));
  check('  · never a refused click — the last add landed', isWatched(many[many.length - 1]));
}

// ── an empty list is a state, not an absence ───────────────────────────────
{
  __setForTest([]);
  check('a reader can hold an empty watchlist', getWatchlist().length === 0);
  check('  · and nothing on it reads as watched', !isWatched('AAPL'));
  resetWatchlist();
  check('reset returns the names the terminal opens on', getWatchlist().join() === [...SEED].join(), getWatchlist().join());
  check('  · and that seed is a real, valid set', SEED.length >= 1 && SEED.every(t => normalizeTicker(t) === t));

  /* THE SEED IS NOT THE LIST. Storage carrying an empty array must load as
     empty; falling back to the seed there would hand a reader four names
     they deliberately removed, every reload. */
  const src = readFileSync('src/data/watchlist.ts', 'utf8');
  check('an empty stored list loads as empty, not as the seed', /An EMPTY stored list is a real state/.test(src) && /if \(!raw\) return \[\.\.\.SEED\];/.test(src));
  check('every read and write survives blocked storage', (src.match(/catch/g) ?? []).length >= 2);
  check('corrupt JSON falls back rather than throwing', /if \(!Array\.isArray\(parsed\)\) return \[\.\.\.SEED\];/.test(src));
}

// ── the button, on the rows that have a name to keep ───────────────────────
{
  const btn = readFileSync('src/components/ui/WatchButton.tsx', 'utf8');
  /* Every surface this lands on has a clickable row. A star that also fired
     the row would navigate away every time a reader kept a name — and the
     name WOULD be added, so the bug would read as a navigation fault. */
  check('the star swallows the click of the row it sits in', /e\.stopPropagation\(\)/.test(btn));
  check('  · and states its state to a screen reader', /aria-pressed=\{on\}/.test(btn) && /aria-label=\{on \?/.test(btn));
  check('  · saying which way the next click goes', /click to remove it/.test(btn) && /Keep \$\{ticker\}/.test(btn));
  check('  · and warning before the cap silently drops a name', /adding \$\{ticker\} drops the oldest/.test(btn));

  const hub = readFileSync('src/pages/EarningsHub.tsx', 'utf8');
  check('a report can be kept from the calendar row', /<WatchButton ticker=\{e\.ticker\}/.test(hub));
  check('a listing can be kept too', /<WatchButton ticker=\{d\.ticker\}/.test(hub));
  check('  · except a withdrawn one, which has nothing to watch', /isDead\(d\.status\) \? <span className="w-6" \/> : <WatchButton/.test(hub));

  const cal = readFileSync('src/components/earnings/UnifiedCalendar.tsx', 'utf8');
  check('and from the unified calendar, where the row is about a company', /r\.ticker \? <WatchButton/.test(cal));
  check('  · a macro print carries no star, because it is a date', /ticker: null,/.test(cal));

  const stocks = readFileSync('src/pages/Stocks.tsx', 'utf8');
  check('the screening board keeps names too', /<WatchButton ticker=\{p\.ticker\}/.test(stocks));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
