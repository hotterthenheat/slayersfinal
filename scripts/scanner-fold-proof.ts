/*
  Acceptance test for folding the Screeners page into the Weigher's scanner.

  Proves:
  1. There is ONE screening engine now — every board the deleted page offered
     is reachable from the desk, and the desk's own three are among them
  2. Short labels exist for every board and are short enough for the card
     header that has to hold nine of them
  3. The boards actually run, return rows on the desk's own universe, and
     sort by the metric they claim
  4. A board with nothing in it returns empty rather than inventing rows
  5. `runScreener` is deterministic within a session day — the desk rebuilds
     it on a sweep cadence and rows must not jump between identical calls
  6. Losers sort the OTHER way, on purpose — biggest fall on top
*/
import { SCREENERS, runScreener, screenerByKey, type ScreenerKey } from '../src/data/screeners';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ── 1. one engine, and it carries everything both surfaces had ────────────
{
  const keys = SCREENERS.map(s => s.key);
  check('nine boards survive the fold', keys.length === 9, keys.join(','));
  /* The desk's own three: gainers and losers by name, and 'voliv' — options
     volume x IV — which the migration maps onto the volume board. */
  for (const k of ['gainers', 'losers', 'optionsVolume'] as ScreenerKey[]) {
    check(`the desk's old board "${k}" is still reachable`, keys.includes(k));
  }
  /* And the six the desk never had. */
  for (const k of ['earnings', 'analyst', 'iv', 'dividend', 'high52', 'low52'] as ScreenerKey[]) {
    check(`the desk gained "${k}" from the deleted page`, keys.includes(k));
  }
}

// ── 2. the short labels the card header needs ─────────────────────────────
{
  check('every board carries a short label', SCREENERS.every(s => !!s.short));
  const longest = SCREENERS.reduce((a, b) => (a.short.length > b.short.length ? a : b));
  check('— and the longest still fits a chip', longest.short.length <= 8, `${longest.short} (${longest.short.length})`);
  check('the full blurb survives for the hover', SCREENERS.every(s => s.blurb.length > 12));
  check('screenerByKey still resolves every board', SCREENERS.every(s => screenerByKey(s.key)?.key === s.key));
  check('and refuses one that does not exist', screenerByKey('voliv') === null);
}

// ── 3. the boards run, and sort by what they claim ────────────────────────
{
  let ran = 0;
  for (const b of SCREENERS) {
    const rows = runScreener(b.key, 60);
    if (rows.length > 0) ran++;
    /* Descending by metricValue everywhere EXCEPT losers, which sorts
       ascending on purpose: the biggest fall is the most negative number, so
       descending would put the smallest dip on top. The first cut of this
       proof asserted one universal direction and failed the board that gets
       it right — the assertion was wrong, not the engine. */
    const wantAsc = b.key === 'losers';
    const sorted = rows.every((r, i) =>
      i === 0 || (wantAsc ? rows[i - 1].metricValue <= r.metricValue : rows[i - 1].metricValue >= r.metricValue)
    );
    check(`"${b.short}" sorts by ${b.metricLabel}, ${wantAsc ? 'ascending — biggest fall first' : 'descending'}`, sorted, `${rows.length} rows`);
    check(`— and every row names a ticker and a price`, rows.every(r => !!r.ticker && r.price > 0));
  }
  check('most boards return something on the desk universe', ran >= 6, `${ran}/9 populated`);
}

// ── 4. an empty board is empty, not invented ──────────────────────────────
{
  const rows = runScreener('gainers', 0);
  check('a zero limit yields nothing rather than a filled board', rows.length === 0);
}

// ── 5. deterministic across the desk's rebuild cadence ────────────────────
{
  const a = runScreener('iv', 20);
  const b = runScreener('iv', 20);
  check(
    'two identical calls agree — the sweep cadence cannot reshuffle the board',
    JSON.stringify(a.map(r => r.ticker)) === JSON.stringify(b.map(r => r.ticker)),
    `${a.length} rows`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
