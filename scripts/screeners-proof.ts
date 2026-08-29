import {
  SCREENERS, runScreener, sessionChangePct, yearPosition, analystRating,
  daysToEarnings, optionsVolume, type ScreenerKey,
} from '../src/data/screeners';
import { coveredTickers, buildFundamentals } from '../src/data/fundamentals';

/*
==================================================
  SLAYER TERMINAL - SCREENERS (proof)
==================================================

  THE FAILURES THIS IS AIMED AT are the ones a screener has that nothing
  else does, and none of them crash.

  A BOARD SORTED THE WRONG WAY still renders a full, plausible table — the
  losers board sorted like every other one puts the SMALLEST dip on top and
  reads perfectly. So the direction is asserted per board rather than
  assumed from the fact that rows came back.

  A BOARD THAT RESHUFFLES is not a screener. Every field is a pure function
  of (ticker, day), so calling twice inside one day must be identical, and
  a different day must be able to differ. Both are asserted: determinism
  alone is also what a hard-coded list has.

  A BOARD THAT IGNORES ITS OWN TEST is the quiet one. `dividend` promises
  yields above 2% and `analyst` promises buy-or-better; a filter that
  silently lets everything through gives a longer, more impressive board
  and answers a different question from its label.

  AND THE RANK MUST COME FROM THE WHOLE UNIVERSE. `limit` caps what is
  shown, never what is considered — a board that sorted only its own first
  ten would be a different product from the one on the label.
*/

let failed = 0;
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => { failed++; console.log(`  FAIL ${m}`); };
const t = (c: boolean, m: string) => (c ? ok(m) : bad(m));
const head = (m: string) => console.log(`\n${m}\n`);

const DAY = '2026-08-30';
const OTHER = '2026-09-15';
const ALL = SCREENERS.map(s => s.key);

/* ── every board answers ─────────────────────────────────────────────── */
head('every board returns a well-formed answer');

const universe = coveredTickers();
t(universe.length > 10, `PREMISE: the universe is real — ${universe.length} names`);

for (const key of ALL) {
  const rows = runScreener(key, 99, DAY);
  const okShape = rows.every(r =>
    typeof r.ticker === 'string' && r.ticker.length > 0
    && Number.isFinite(r.price) && r.price > 0
    && Number.isFinite(r.changePct)
    && Number.isFinite(r.metricValue)
    && typeof r.metric === 'string' && r.metric.length > 0);
  t(okShape, `${key}: every row is complete and finite (${rows.length} rows)`);
  t(new Set(rows.map(r => r.ticker)).size === rows.length, `${key}: no ticker appears twice`);
}

/* ── the sort ────────────────────────────────────────────────────────── */
head('each board is sorted the way its own label promises');

{
  const g = runScreener('gainers', 99, DAY);
  const desc = g.every((r, i) => i === 0 || g[i - 1].metricValue >= r.metricValue);
  t(desc, 'gainers run DESCENDING — the biggest gain is first');
  t(g.length === 0 || g[0].changePct >= g[g.length - 1].changePct, 'and the top row moved at least as much as the bottom');

  const l = runScreener('losers', 99, DAY);
  const asc = l.every((r, i) => i === 0 || l[i - 1].metricValue <= r.metricValue);
  /* THE ONE THAT BREAKS SILENTLY. Sorted like the others, this board puts
     the smallest dip on top and still looks entirely correct. */
  t(asc, 'losers run ASCENDING — the biggest FALL is first, not the smallest');
  t(l.length === 0 || l[0].changePct <= l[l.length - 1].changePct, 'and the top row fell at least as far as the bottom');

  const e = runScreener('earnings', 99, DAY);
  const soonest = e.every((r, i) => i === 0 || e[i - 1].metricValue >= r.metricValue);
  t(soonest, 'earnings put the SOONEST report first');
}

/* ── each board keeps its own promise ────────────────────────────────── */
head('each board applies the test on its label');

{
  const d = runScreener('dividend', 99, DAY);
  const allPay = d.every(r => {
    const f = buildFundamentals(r.ticker);
    return !!f && f.ratios.dividendYieldPct >= 2;
  });
  t(allPay, `dividend board holds only names yielding 2%+ (${d.length} of ${universe.length})`);
  t(d.length < universe.length, 'and it is a FILTER — it does not pass the whole universe through');

  const a = runScreener('analyst', 99, DAY);
  t(a.every(r => /buy/i.test(r.metric)), 'analyst board holds only buy-or-better ratings');
  t(a.length < universe.length, 'and it filters too');

  const hi = runScreener('high52', 99, DAY);
  t(hi.every(r => yearPosition(r.ticker, DAY) >= 0.94), 'every 52-week high is genuinely near its year high');
  const lo = runScreener('low52', 99, DAY);
  t(lo.every(r => yearPosition(r.ticker, DAY) <= 0.06), 'every 52-week low is genuinely near its year low');
  /* The two boards are mutually exclusive by construction — a name cannot
     be pressing both ends of its own year. */
  t(hi.every(r => !lo.some(x => x.ticker === r.ticker)), 'and no name appears on both ends at once');

  const er = runScreener('earnings', 99, DAY);
  t(er.every(r => daysToEarnings(r.ticker, DAY) !== null), 'the earnings board holds only names that actually report');
}

/* ── determinism, and that it is not a constant ──────────────────────── */
head('the same day gives the same board, a different day may not');

for (const key of ALL) {
  const a = runScreener(key, 99, DAY).map(r => r.ticker).join(',');
  const b = runScreener(key, 99, DAY).map(r => r.ticker).join(',');
  t(a === b, `${key}: two runs on the same day are identical`);
}
{
  /* Determinism on its own is also what a hard-coded list has. At least one
     board must MOVE across days or the whole thing is a fixture. */
  const moved = ALL.filter(k =>
    runScreener(k, 99, DAY).map(r => r.ticker).join(',')
    !== runScreener(k, 99, OTHER).map(r => r.ticker).join(','));
  t(moved.length > 0, `and ${moved.length}/${ALL.length} boards differ on another day — not a fixture`);
}

/* ── the rank comes from the whole universe ──────────────────────────── */
head('limit caps what is shown, never what is considered');

for (const key of ['gainers', 'losers', 'iv', 'optionsVolume'] as ScreenerKey[]) {
  const full = runScreener(key, 99, DAY);
  const five = runScreener(key, 5, DAY);
  t(five.length === Math.min(5, full.length), `${key}: a limit of 5 returns 5`);
  t(five.every((r, i) => r.ticker === full[i].ticker),
    `${key}: and they are the TOP five of the whole board, not the first five found`);
}

/* ── the generators themselves ───────────────────────────────────────── */
head('the underlying figures are sane');

{
  const chg = universe.map(x => sessionChangePct(x, DAY));
  t(chg.every(v => v >= -6.5 && v <= 6.5), 'session change stays inside its stated band');
  t(chg.some(v => v > 0) && chg.some(v => v < 0), 'and both directions occur — not a permanently green tape');
  t(universe.every(x => { const p = yearPosition(x, DAY); return p >= 0 && p <= 1; }), '52-week position is a 0..1 fraction');
  t(universe.every(x => optionsVolume(x, DAY) > 0), 'options volume is always positive');
  t(universe.some(x => optionsVolume(x, DAY) > 400), 'and the liquid names really are an order of magnitude bigger');
  const ratings = new Set(universe.map(x => analystRating(x, DAY)));
  t(ratings.size >= 3, `ratings span the scale — ${[...ratings].join(', ')}`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} failing\n`);
process.exit(failed === 0 ? 0 : 1);
