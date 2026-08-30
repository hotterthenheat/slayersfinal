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
import { insiderFlow, insiderRead, insiderBuyers, isOpenMarketBuy, insiderFeed, TX_CODES, type TxCode } from '../src/data/insiderFlow';
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
  /* Buy plans are now MODELLED — rare, but real, because a model that
     forbids them can never be wrong about one. So the definition is proven
     directly over the code table rather than inferred from what the
     generator happens to emit. */
  check('an open-market purchase is an open-market buy', isOpenMarketBuy({ code: 'P', plan: 'discretionary' }));
  check('— and so is one whose plan flag was never captured', isOpenMarketBuy({ code: 'P', plan: 'unknown' }));
  check('a PLANNED purchase is not — nobody chose the day', !isOpenMarketBuy({ code: 'P', plan: 'plan' }));
  check('a sale is never an open-market buy, however flagged',
    (['plan', 'discretionary', 'unknown'] as const).every(pl => !isOpenMarketBuy({ code: 'S', plan: pl })));
  check('and neither is any compensation event',
    (['A', 'M', 'F', 'D', 'G'] as const).every(c => !isOpenMarketBuy({ code: c, plan: 'discretionary' })),
    'a grant is not a purchase');
  const planned = rows.filter(t => t.planned);
  check('PREMISE: plans exist', planned.length > 0, `${planned.length} of ${rows.length}`);
  check('a plan flag only ever sits on a market trade', planned.every(t => TX_CODES[t.code].openMarket));

  /* DIRECTION IS THE CODE TABLE'S, not re-derived at the call site. A
     mutation that read direction off `code === 'P'` — making every grant
     and every conversion a SELL — passed every other assertion here. */
  check(
    'every row acquires or disposes exactly as its code says',
    rows.every(t => (t.kind === 'BUY') === TX_CODES[t.code].acquires),
    rows.filter(t => (t.kind === 'BUY') !== TX_CODES[t.code].acquires).map(t => `${t.code}:${t.kind}`).slice(0, 4).join(' ')
  );
  check('PREMISE: acquiring codes other than P are present', rows.some(t => TX_CODES[t.code].acquires && t.code !== 'P'), 'grants and conversions acquire');

  /* ALL THREE PLAN STATES MUST BE REACHABLE. Collapsing the flag to a
     boolean is the exact misreading this surface exists to prevent — an
     old sale whose plan status was never captured would render as a
     decision — and it passed every assertion until this one. */
  const states = new Set(rows.map(t => t.plan));
  check('the plan flag really has three states in the data', states.size === 3, [...states].sort().join(', '));
  check('— including "unknown", which a boolean would have erased', states.has('unknown'));
  check('a non-market row never claims a plan', rows.filter(t => !TX_CODES[t.code].openMarket).every(t => t.plan === 'discretionary'));

  /* PLANS ARE A SELLING INSTRUMENT. Comparing the RATES, not the counts:
     a shared rate still leaves sells the majority of planned rows simply
     because sells are the majority of rows, so a count test passes a
     mutation that gives buys the same rate. */
  const mktBuys = rows.filter(t => TX_CODES[t.code].openMarket && t.kind === 'BUY');
  const mktSells = rows.filter(t => TX_CODES[t.code].openMarket && t.kind === 'SELL');
  check('PREMISE: both directions are present in the market rows', mktBuys.length > 3 && mktSells.length > 3, `${mktBuys.length} buys, ${mktSells.length} sells`);
  const buyRate = mktBuys.filter(t => t.planned).length / mktBuys.length;
  const sellRate = mktSells.filter(t => t.planned).length / mktSells.length;
  check(
    'a sale is far likelier to be scheduled than a purchase',
    sellRate > buyRate * 2,
    `${(buyRate * 100).toFixed(0)}% of buys vs ${(sellRate * 100).toFixed(0)}% of sells`
  );
  check('plans are overwhelmingly SELL plans, as in real filings',
    planned.filter(t => t.kind === 'SELL').length > planned.length * 0.8,
    `${planned.filter(t => t.kind === 'SELL').length} of ${planned.length}`);
  for (const f of withRows) {
    /* Planned SALES only — see the note in the engine. Folding a planned
       purchase in here made the "% of selling that was scheduled" line
       divide a mixed numerator by a sales-only denominator and print 555%. */
    const want = f.trades.filter(t => t.planned && t.kind === 'SELL').reduce((s, t) => s + t.value, 0);
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
    /* BOUGHT AND SOLD ARE MARKET ACTIVITY ONLY — the fix that stops a
       vesting event reading as "the CFO dumped $4m". A grant and a tax
       withholding both carry a share count and a price, and summing them
       here is exactly the error this surface exists to avoid. */
    const mkt = f.trades.filter(t => TX_CODES[t.code].openMarket);
    const b = mkt.filter(t => t.kind === 'BUY').reduce((s, t) => s + t.value, 0);
    const sl = mkt.filter(t => t.kind === 'SELL').reduce((s, t) => s + t.value, 0);
    check(`${f.ticker}: the two totals count market rows only`, f.bought === b && f.sold === sl);
    const comp = f.trades.filter(t => !TX_CODES[t.code].openMarket).reduce((s, t) => s + t.value, 0);
    check(`${f.ticker}: compensation is counted apart, never in the totals`, f.compValue === comp, `${f.compValue} vs ${comp}`);
    check(`${f.ticker}: net is bought less sold`, f.net === f.bought - f.sold);
    check(
      `${f.ticker}: open-market buys are code P outside a plan`,
      f.openMarketBuys === f.trades.filter(t => isOpenMarketBuy(t)).reduce((s, t) => s + t.value, 0)
    );
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
  /* The claim is about MARKET activity. Counting every acquiring row as a
     "buy" folds in grants and option conversions — which acquire shares
     and are not purchases — and that is the very conflation this surface
     exists to undo. */
  const mkt = rows.filter(t => TX_CODES[t.code].openMarket);
  const buys = mkt.filter(t => t.kind === 'BUY').length;
  check('PREMISE: market rows to weigh', mkt.length > 10, `${mkt.length} of ${rows.length}`);
  check('open-market selling outweighs buying, as in real filings', buys < mkt.length * 0.45, `${buys} buys of ${mkt.length}`);
  check('but buying is not impossible', buys > 0, `${buys}`);
  /* And the reason the feed defaults to the market pair: most Form 4 rows
     are not trades at all. */
  const compRows = rows.length - mkt.length;
  check('most filings are compensation events, not trades', compRows > mkt.length, `${compRows} comp vs ${mkt.length} market`);
  const buyers = insiderBuyers(90, DAY);
  check('the buyers board finds them', buyers.length > 0, `${buyers.length} names`);
  check('every name on it actually bought discretionarily', buyers.every(f => f.openMarketBuys > 0));
  check('and it is ranked', buyers.every((f, i) => i === 0 || buyers[i - 1].openMarketBuys >= f.openMarketBuys));
}

// ── nobody holds two offices, and no office has two holders ──────────────
{
  /* A reader who spots two chief executives of one company stops believing
     the rest of the table, and they are right to. Both directions of the
     constraint are checked: one person with two titles, and one title held
     by two people. */
  const SINGULAR = ['CEO', 'CFO', 'COO'];
  for (const f of withRows) {
    const byPerson = new Map<string, Set<string>>();
    const byRole = new Map<string, Set<string>>();
    for (const t of f.trades) {
      if (!byPerson.has(t.person)) byPerson.set(t.person, new Set());
      byPerson.get(t.person)!.add(t.role);
      if (!byRole.has(t.role)) byRole.set(t.role, new Set());
      byRole.get(t.role)!.add(t.person);
    }
    const twoTitles = [...byPerson.entries()].filter(([, r]) => r.size > 1);
    check(`${f.ticker}: nobody holds two titles`, twoTitles.length === 0, twoTitles.map(([p, r]) => `${p}: ${[...r].join('/')}`).join(', '));
    const shared = [...byRole.entries()].filter(([role, ppl]) => SINGULAR.includes(role) && ppl.size > 1);
    check(`${f.ticker}: no singular office has two holders`, shared.length === 0, shared.map(([r, p]) => `${r}: ${[...p].join(', ')}`).join(' | '));
  }
  /* And the roles must actually vary, or the constraint above is vacuous. */
  const allRoles = new Set(withRows.flatMap(f => f.trades.map(t => t.role)));
  check('PREMISE: more than one title appears across the desk', allRoles.size > 2, [...allRoles].join(', '));
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
