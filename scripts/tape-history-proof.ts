/*
  Acceptance test for the ENDLESS TAPE — the history under the Live Tape's
  live stream (Noah, 2026-09-04: "make it a endless scroll and don't let it
  load when people get to the page it should be nonstop").

  The page's promise is that a reader can scroll for as long as they like and
  never meet a spinner, an end, or a row that was not there a second ago. The
  page keeps the first half of that with a runway it extends far ahead of the
  scroll; the generator has to keep the rest, and every one of these is a way
  it could quietly fail to.

  Proves:
  1. A page is the SAME page every time it is asked for — the reader can
     scroll away from a row and back to it, and a filter can drop a row and
     restore it, without the tape rewriting itself underneath them
  2. Time runs BACKWARDS down the page, strictly, across the page seams —
     a clock that stutters forward is the one thing a tape may not do
  3. Ids can never collide with the live stream's, however long the tab lives
  4. Pages TILE: page n+1 continues page n, no row shared, none skipped
  5. Roster names are priced as themselves, not as the 100/0.2 fallback —
     the strike sits near the money instead of 150% out of it
  6. The whole desk prints, weighted like the live tape rather than evenly
  7. Extending is CHEAP — the reason no loading state is needed at all
*/
import Simulator from '../src/core/simulator';
import { backfillPrints, type TapeQuote } from '../src/data/tape';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const quotes: TapeQuote[] = Simulator.universeQuotes('SPY');
const ANCHOR = Date.UTC(2026, 8, 4, 20, 0, 0);
const PAGE = 60;
const page = (p: number) => backfillPrints(quotes, p, PAGE, ANCHOR);

// ── 1. the same page, every time ─────────────────────────────────────────
{
  /* THE BUG THIS FORBIDS: a generator seeded on anything the page holds —
     a row count, a Date.now(), a page index that shifts when a filter
     changes — reshuffles history as you read it. Scroll down, scroll back,
     and the print you were looking at is a different print. */
  const key = (p: ReturnType<typeof page>[number]) =>
    `${p.id}|${p.at}|${p.ticker}|${p.strike}|${p.right}|${p.size}|${p.fill}|${p.premium}|${p.side}|${p.dte}`;
  let stable = true;
  for (const n of [0, 1, 7, 40, 399]) {
    const a = page(n).map(key).join('\n');
    const b = page(n).map(key).join('\n');
    if (a !== b) stable = false;
  }
  check('a page is identical however often it is asked for', stable, '5 pages, every field compared');

  // And asking for them out of order must not change them either — the reader
  // scrolling back up re-requests pages in the opposite order to the one that
  // first produced them.
  const forwards = [page(3), page(4), page(5)].flat().map(key).join('\n');
  const asked = [page(5), page(4), page(3)];
  const reassembled = [asked[2], asked[1], asked[0]].flat().map(key).join('\n');
  check('page order of request does not change the pages', forwards === reassembled);
}

// ── 2. the clock only ever runs backwards ────────────────────────────────
{
  /* Times are drawn as an anchor minus a per-row offset. If that offset were
     not strictly increasing — a bare jitter, say, or a stride narrower than
     its own noise — two adjacent rows would swap and the tape would appear
     to run FORWARDS as you scroll down it. */
  const rows = [page(0), page(1), page(2), page(3)].flat();
  let backwards = true;
  let worst = '';
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].at >= rows[i - 1].at) {
      backwards = false;
      worst = `row ${i}: ${rows[i].at} not older than ${rows[i - 1].at}`;
      break;
    }
  }
  check('every row is strictly older than the row above it', backwards, worst || `${rows.length} rows, 3 page seams`);

  // …and it actually covers ground: four pages should be well over an hour.
  const spanMin = (rows[0].at - rows[rows.length - 1].at) / 60000;
  check('the history reaches back at a believable rate', spanMin > 10 && spanMin < 60 * 6, `${spanMin.toFixed(0)} min over ${rows.length} prints`);
}

// ── 3. ids cannot collide with the live stream ───────────────────────────
{
  /* The live stream climbs from 0 upward for as long as the tab is open. A
     history that numbered from 0 too would eventually hand React two rows
     with one key — and would toggle a bookmark on a print the reader never
     clicked, since the marked set is keyed on the same number. */
  const rows = [page(0), page(9), page(50), page(1999)].flat();
  check('every history id is negative', rows.every(r => r.id < 0), `${rows.length} rows`);
  check('history ids are unique', new Set(rows.map(r => r.id)).size === rows.length);
}

// ── 4. pages tile ────────────────────────────────────────────────────────
{
  /* A page indexed off the wrong base repeats its predecessor's rows or skips
     a stretch — either shows up as a duplicate key or as a jump in the clock,
     both of them only after the reader has scrolled far enough to see it. */
  const a = page(0);
  const b = page(1);
  const ids = new Set(a.map(r => r.id));
  check('consecutive pages share no row', b.every(r => !ids.has(r.id)));
  check('page 1 continues page 0 with no gap', b[0].id === a[a.length - 1].id - 1, `${a[a.length - 1].id} then ${b[0].id}`);
  check('a page is the size it was asked for', a.length === PAGE && b.length === PAGE);
}

// ── 5. roster names are priced as themselves ─────────────────────────────
{
  /* THE BUG THIS CAUGHT: enrichPrint reads Simulator.TICKERS for spot and iv,
     and only the seeded watchlist lives there. Eighteen of the desk's names
     are quoted without being simmed, so they fell through to spot 100 — and
     a TSLA print came out struck at 248 against a spot of 100, reading 148%
     out of the money on a contract that is at the money. */
  const rows = Array.from({ length: 12 }, (_, i) => page(i)).flat();
  const byTicker = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byTicker.get(r.ticker) ?? [];
    list.push(r);
    byTicker.set(r.ticker, list);
  }
  let worstName = '';
  let worstOtm = 0;
  for (const [t, list] of byTicker) {
    for (const r of list) {
      if (Math.abs(r.otmPct) > worstOtm) { worstOtm = Math.abs(r.otmPct); worstName = `${t} ${r.strike} vs spot ${r.spot}`; }
    }
  }
  check('no print is struck absurdly far from its own spot', worstOtm < 25, `worst ${worstOtm.toFixed(1)}% — ${worstName}`);

  // Each name's quoted spot must match what the desk quotes for it.
  const quoted = new Map(quotes.map(q => [q.ticker, q.price]));
  const agree = rows.every(r => Math.abs(r.spot - (quoted.get(r.ticker) ?? -1)) < 0.51);
  check('every print carries its own name’s quoted spot', agree, `${byTicker.size} names`);

  check('every premium is a real number of dollars', rows.every(r => r.premium > 0 && Number.isFinite(r.premium)));
}

// ── 6. the whole desk prints, weighted like the live tape ────────────────
{
  const rows = Array.from({ length: 20 }, (_, i) => page(i)).flat();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
  check('the history reaches past the seeded watchlist', counts.size >= 15, `${counts.size} names in ${rows.length} prints`);

  /* The watchlist is weighted 4x, so SPY should print several times what a
     roster name does — a history that reads like an even lottery is not this
     desk's tape. Bounded on BOTH sides: a weight that ran away would be just
     as wrong as one that did nothing. */
  const spy = counts.get('SPY') ?? 0;
  const intc = counts.get('INTC') ?? 0;
  check('the watchlist prints harder than the roster', spy > intc * 1.8 && spy < intc * 12, `SPY ${spy} vs INTC ${intc}`);
}

// ── 7. extending is cheap ────────────────────────────────────────────────
{
  /* This is the assertion behind "nonstop". Every other infinite list owns a
     spinner because its next page is a network round trip; this one has no
     loading state to render because generating the next page is arithmetic.
     If that ever stops being true the page's promise breaks silently — it
     would still work, just with a visible hitch at the bottom. */
  const t0 = Date.now();
  let n = 0;
  for (let p = 0; p < 100; p++) n += page(p).length;
  const ms = Date.now() - t0;
  check('a hundred pages generate faster than a frame budget', ms < 400, `${n} prints in ${ms}ms`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
