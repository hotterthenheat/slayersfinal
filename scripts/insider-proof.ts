/*
  Acceptance test for insider transactions.

  Proves:
  1. A scheduled sale is MARKED, and the planned total only ever counts
     rows that carry the badge — the distinction the surface exists for
  2. Buys are never modelled as scheduled, because a 10b5-1 buy is rare
     enough that pretending otherwise would blunt the one informative
     event here
  3. The verdict follows the discretionary numbers, not the gross ones: a
     window of pure plan selling is never called distribution, because
     nobody decided anything
  4. The tallies match the rows, and value is shares at the filed price
  5. Selling dominates, the way it does in real filings — a 50/50 draw
     would make a buy unremarkable, which is the opposite of what it is
  6. An empty window is reachable and is stated as a fact, not a gap
  7. It is stable within a day
*/
import { insiderFlow, insiderRead, insiderBuyers, isOpenMarketBuy } from '../src/data/insiderFlow';
import { UNIVERSE, lookup } from '../src/data/universe';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const DAY = '2026-08-30';
const all = UNIVERSE.map(u => insiderFlow(u.ticker, 90, DAY));
const withRows = all.filter(f => f.trades.length > 0);

// ── 1 & 2. plans are marked, and only sells carry them ───────────────────
{
  check('PREMISE: some names filed', withRows.length > 0, `${withRows.length}/${all.length}`);
  const rows = withRows.flatMap(f => f.trades);
  check('PREMISE: rows to inspect', rows.length > 10, `${rows.length}`);
  check('no buy is modelled as scheduled', rows.every(t => !(t.kind === 'BUY' && t.planned)));
  /* Which means the "open market" test can never see a planned buy in
     generated data — so the definition is proven directly, over all four
     combinations, rather than left to a guard nothing can reach. A real
     filing feed will contain planned buys and this is the line that has to
     be right when it does. */
  check('an unplanned buy is an open-market buy', isOpenMarketBuy({ kind: 'BUY', planned: false }));
  check('a PLANNED buy is not — nobody chose it', !isOpenMarketBuy({ kind: 'BUY', planned: true }));
  check('a sale is never an open-market buy, planned or not',
    !isOpenMarketBuy({ kind: 'SELL', planned: false }) && !isOpenMarketBuy({ kind: 'SELL', planned: true }));
  const planned = rows.filter(t => t.planned);
  check('PREMISE: plans exist', planned.length > 0, `${planned.length} of ${rows.length}`);
  check('every planned row is a sale', planned.every(t => t.kind === 'SELL'));
  for (const f of withRows) {
    const want = f.trades.filter(t => t.planned).reduce((s, t) => s + t.value, 0);
    check(`${f.ticker}: the planned total counts only badged rows`, f.plannedValue === want, `${f.plannedValue} vs ${want}`);
  }
}

// ── 3. the verdict follows the discretionary numbers ─────────────────────
{
  for (const f of withRows) {
    const disc = f.sold - f.plannedValue;
    if (f.signal === 'distributing') {
      check(`${f.ticker}: distribution means someone chose to sell`, disc > 0, `discretionary ${disc}`);
    }
    if (f.signal === 'scheduled selling') {
      check(
        `${f.ticker}: scheduled selling is not called distribution`,
        disc < f.sold * 0.4 || f.openMarketBuys > 0 || disc === 0,
        `discretionary ${disc} of ${f.sold}`
      );
    }
    if (f.signal === 'accumulating') {
      check(`${f.ticker}: accumulation requires a discretionary buy`, f.openMarketBuys > 0, `${f.openMarketBuys}`);
    }
  }
  /* A window that is nothing but plan selling must never read as a
     decision — this is the misreading the whole surface exists to stop. */
  const pureplan = withRows.filter(f => f.sold > 0 && f.plannedValue === f.sold && f.openMarketBuys === 0);
  check('PREMISE: some window is pure plan selling', pureplan.length > 0, pureplan.map(f => f.ticker).join(','));
  check(
    'a pure-plan window is never called distribution',
    pureplan.every(f => f.signal === 'scheduled selling'),
    pureplan.map(f => `${f.ticker}:${f.signal}`).join(' ')
  );
  /* And every signal is reachable, or the ladder above is untested. */
  const seen = new Set(all.map(f => f.signal));
  check('every verdict is reachable', seen.size >= 3, [...seen].join(', '));
}

// ── 4. the arithmetic ────────────────────────────────────────────────────
{
  for (const f of withRows) {
    check(`${f.ticker}: value is shares at the filed price`, f.trades.every(t => t.value === Math.round(t.shares * t.price)));
    const b = f.trades.filter(t => t.kind === 'BUY').reduce((s, t) => s + t.value, 0);
    const sl = f.trades.filter(t => t.kind === 'SELL').reduce((s, t) => s + t.value, 0);
    check(`${f.ticker}: the two totals match their rows`, f.bought === b && f.sold === sl);
    check(`${f.ticker}: net is bought less sold`, f.net === f.bought - f.sold);
    check(`${f.ticker}: open-market buys exclude nothing but plans`, f.openMarketBuys === f.trades.filter(t => t.kind === 'BUY' && !t.planned).reduce((s, t) => s + t.value, 0));
    check(`${f.ticker}: newest first`, f.trades.every((t, i) => i === 0 || f.trades[i - 1].daysAgo <= t.daysAgo));
    check(`${f.ticker}: every row is inside the window`, f.trades.every(t => t.daysAgo >= 1 && t.daysAgo <= 90));
    check(`${f.ticker}: the stake share is a real fraction`, f.trades.every(t => t.stakePct > 0 && t.stakePct <= 100));
    /* The filed price must reconcile with the move since — it is drawn as
       arithmetic, so it has to be arithmetic. */
    const u = lookup(f.ticker)!;
    check(
      `${f.ticker}: the filed price and the move since agree`,
      f.trades.every(t => Math.abs(t.price * (1 + t.sincePct / 100) - u.px) < 0.05),
      f.trades.map(t => (t.price * (1 + t.sincePct / 100)).toFixed(2)).join(',')
    );
  }
}

// ── 5. selling dominates ─────────────────────────────────────────────────
{
  const rows = withRows.flatMap(f => f.trades);
  const buys = rows.filter(t => t.kind === 'BUY').length;
  check('selling is the majority, as in real filings', buys < rows.length * 0.45, `${buys} buys of ${rows.length}`);
  check('but buying is not impossible', buys > 0, `${buys}`);
  const buyers = insiderBuyers(90, DAY);
  check('the buyers board finds them', buyers.length > 0, `${buyers.length} names`);
  check('every name on it actually bought discretionarily', buyers.every(f => f.openMarketBuys > 0));
  check('and it is ranked', buyers.every((f, i) => i === 0 || buyers[i - 1].openMarketBuys >= f.openMarketBuys));
}

// ── 6 & 7. empty windows, and stability ──────────────────────────────────
{
  const quiet = all.filter(f => f.trades.length === 0);
  check('PREMISE: an empty window is reachable', quiet.length > 0, quiet.map(f => f.ticker).join(','));
  check('an empty window reads as quiet', quiet.every(f => f.signal === 'quiet' && f.net === 0));
  check('and says so plainly', quiet.every(f => /No insider filed/.test(insiderRead(f))));
  check('an unknown name does not crash', insiderFlow('ZZZZ', 90, DAY).trades.length === 0);

  const a = insiderFlow('JPM', 90, DAY);
  const b = insiderFlow('JPM', 90, DAY);
  check('the board is stable within a day', a.trades.length === b.trades.length && a.net === b.net);
  check('every read names its own ticker', withRows.every(f => insiderRead(f).includes(f.ticker)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
