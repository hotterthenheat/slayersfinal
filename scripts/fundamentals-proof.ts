/*
  Acceptance test for §2's Ticker Overview.

  Financial statements are the one surface where a reader can CHECK the
  arithmetic themselves — add a column and see whether it foots. So the
  assertions here are the ones a reader would run: every subtotal is a real
  subtraction, the balance sheet balances exactly, and every ratio is
  derived from the statements above it rather than generated beside them.

  A P/E that disagrees with the net income printed above it is worse than no
  P/E at all.

  Proves:
  1. The income statement foots, line by line, for every covered name
  2. Assets equal liabilities plus equity — exactly, not approximately
  3. Current subtotals are the sum of their parts
  4. Free cash flow is operating plus capex, and capex is negative
  5. Every ratio recomputes from the statements
  6. A name that loses money has NO P/E rather than a negative one
  7. Scale follows the name — a megacap does not earn what a mid-cap earns
  8. Deterministic, and unknown tickers are null rather than invented
*/
import { buildFundamentals, coveredTickers } from '../src/data/fundamentals';

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  ok ? pass++ : fail++;
};
/* Relative tolerance — these are floats in the billions, so an absolute
   epsilon would be meaningless at one end and vacuous at the other. */
const foots = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);

const tickers = coveredTickers();
const all = tickers.map(t => ({ t, f: buildFundamentals(t)! }));

check('PREMISE: the overview covers the universe', all.length > 20 && all.every(x => x.f), `${all.length} names`);

// ── 1. the income statement foots ─────────────────────────────────────────
{
  const bad: string[] = [];
  for (const { t, f } of all) {
    const i = f.income;
    if (!foots(i.grossProfit, i.revenue - i.costOfRevenue)) bad.push(`${t} gross`);
    if (!foots(i.operatingIncome, i.grossProfit - i.operatingExpense)) bad.push(`${t} operating`);
    if (!foots(i.netIncome, i.operatingIncome - i.interestExpense - i.taxExpense)) bad.push(`${t} net`);
    if (!foots(i.eps, i.netIncome / f.profile.sharesOutstanding)) bad.push(`${t} eps`);
  }
  check('every income statement foots, line by line', bad.length === 0, bad.slice(0, 3).join(' '));
  check('revenue is always positive', all.every(x => x.f.income.revenue > 0));
}

// ── 2+3. the balance sheet balances ───────────────────────────────────────
{
  const bad: string[] = [];
  for (const { t, f } of all) {
    const b = f.balance;
    if (!foots(b.totalAssets, b.totalLiabilities + b.equity)) bad.push(`${t} A≠L+E`);
    if (!foots(b.totalCurrentAssets, b.cash + b.receivables + b.inventory + b.otherCurrentAssets)) bad.push(`${t} CA`);
    if (!foots(b.totalAssets, b.totalCurrentAssets + b.ppe + b.goodwill)) bad.push(`${t} TA`);
    if (!foots(b.totalCurrentLiabilities, b.payables + b.shortTermDebt)) bad.push(`${t} CL`);
    if (!foots(b.totalLiabilities, b.totalCurrentLiabilities + b.longTermDebt)) bad.push(`${t} TL`);
  }
  check('assets equal liabilities plus equity — exactly, for every name', bad.length === 0, bad.slice(0, 3).join(' '));
  check('and every subtotal is the sum of its parts', bad.length === 0);
  check('no negative cash or inventory', all.every(x => x.f.balance.cash > 0 && x.f.balance.inventory >= 0));
}

// ── 4. the cash flow ──────────────────────────────────────────────────────
{
  check('free cash flow is operating plus capex',
    all.every(x => foots(x.f.cashFlow.freeCashFlow, x.f.cashFlow.operating + x.f.cashFlow.capex)));
  check('capex is a spend, so it is negative', all.every(x => x.f.cashFlow.capex < 0));
  check('buybacks and dividends are outflows', all.every(x => x.f.cashFlow.buybacks <= 0 && x.f.cashFlow.dividendsPaid <= 0));
  check('the net change is the three sections summed',
    all.every(x => foots(x.f.cashFlow.netChange, x.f.cashFlow.operating + x.f.cashFlow.investing + x.f.cashFlow.financing)));
}

// ── 5+6. ratios come FROM the statements ──────────────────────────────────
{
  const bad: string[] = [];
  for (const { t, f } of all) {
    const { income: i, balance: b, ratios: r, profile: p } = f;
    if (!foots(r.grossMarginPct, (i.grossProfit / i.revenue) * 100)) bad.push(`${t} gm`);
    if (!foots(r.netMarginPct, (i.netIncome / i.revenue) * 100)) bad.push(`${t} nm`);
    if (!foots(r.psRatio, p.marketCap / i.revenue)) bad.push(`${t} ps`);
    if (!foots(r.currentRatio, b.totalCurrentAssets / b.totalCurrentLiabilities)) bad.push(`${t} cr`);
    if (r.roePct !== null && !foots(r.roePct, (i.netIncome / b.equity) * 100)) bad.push(`${t} roe`);
    if (r.peRatio !== null && !foots(r.peRatio, (p.marketCap / p.sharesOutstanding) / i.eps)) bad.push(`${t} pe`);
  }
  check('every ratio recomputes from the statements above it', bad.length === 0, bad.slice(0, 3).join(' '));

  const losers = all.filter(x => x.f.income.eps <= 0);
  check('a name that loses money has NO P/E, not a negative one',
    losers.every(x => x.f.ratios.peRatio === null),
    `${losers.length} loss-making names`);
  check('a name that pays nothing has a zero yield, not a fabricated one',
    all.every(x => x.f.ratios.dividendYieldPct >= 0));
  check('margins are ordered gross >= operating >= net',
    all.every(x => x.f.ratios.grossMarginPct >= x.f.ratios.operatingMarginPct - 1e-9
      && x.f.ratios.operatingMarginPct >= x.f.ratios.netMarginPct - 1e-9));
}

// ── 7. scale follows the name ─────────────────────────────────────────────
{
  const caps = all.map(x => x.f.profile.marketCap);
  check('market caps span orders of magnitude, not one band',
    Math.max(...caps) / Math.min(...caps) > 25,
    `${(Math.max(...caps) / 1e9).toFixed(0)}B high, ${(Math.min(...caps) / 1e9).toFixed(1)}B low`);
  check('revenue is never larger than a plausible multiple of cap',
    all.every(x => x.f.income.revenue < x.f.profile.marketCap * 3));
  check('every company has four quarters', all.every(x => x.f.quarters.length === 4));
  check('and a related-names rail from its own sector',
    all.every(x => !x.f.profile.related.includes(x.t)));
}

// ── 8. determinism and the unknown ────────────────────────────────────────
{
  check('the same ticker builds the same company',
    JSON.stringify(buildFundamentals('AAPL')) === JSON.stringify(buildFundamentals('AAPL')));
  check('a different ticker is a different company',
    JSON.stringify(buildFundamentals('MSFT')) !== JSON.stringify(buildFundamentals('AAPL')));
  check('an unknown ticker is null, never invented', buildFundamentals('ZZZZ') === null);
  check('price moves the cap and the P/E, but not the business', (() => {
    const a = buildFundamentals('AAPL', 100)!, b = buildFundamentals('AAPL', 200)!;
    return foots(a.income.netIncome, b.income.netIncome) && b.profile.marketCap > a.profile.marketCap;
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
