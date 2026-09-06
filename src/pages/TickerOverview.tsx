import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import Simulator from '../core/simulator';
import { buildFundamentals, coveredTickers, peerMedians } from '../data/fundamentals';
import { macroCards } from '../data/macroDetail';
import PageHeader from '../components/ui/PageHeader';
import { twinFamilyFor } from '../data/indexTwins';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import DataState from '../components/ui/DataState';
import CompanyLogo from '../components/ui/CompanyLogo';
import ProvenanceChip from '../components/ui/ProvenanceChip';
import SeasonalityPanel from '../components/gex/SeasonalityPanel';
import EtfExposurePanel from '../components/gex/EtfExposurePanel';
import InsiderPanel from '../components/gex/InsiderPanel';

/*
==================================================
  SLAYER TERMINAL - TICKER OVERVIEW (pages/TickerOverview.tsx)

  §2's company page. The one surface here that
  treats a name as a business.
==================================================

  EVERY OTHER DESK READS A TICKER AS A PRICE WITH GREEKS ATTACHED. This
  reads it as a company: what it does, what it earns, what it owns, and what
  the market is paying for that.

  THE STATEMENTS FOOT, and that is not decoration — it is the difference
  between a page a reader can check and a page they can only look at.
  Revenue less cost of revenue is gross profit; assets equal liabilities plus
  equity, exactly. Anyone who adds a column here gets the subtotal printed
  beside it, which is the only way the numbers earn any trust at all.

  THE DIVISION THAT MATTERS: a filing does not move with the tape. Revenue,
  margins and the balance sheet are fixed — they were reported. Market cap,
  P/E, P/S and yield move with price, because those ARE price. The page keeps
  them apart so a reader is never confused about which half just changed.

  RELATED NAMES ARE THE SECTOR, not a recommendation engine. Six tickers from
  the same sector, linked — enough to move sideways through a thesis without
  pretending to know what else a reader should want.
*/

/*
  0.11 asks for `fmtUsd` to be the single source for large numbers, and it
  is — everywhere it can be. This one stays, for two reasons that are about
  the figures rather than about convenience:

  · MARKET CAPS REACH TRILLIONS and `fmtUsd` stops at billions. Passed a
    $3.4T cap it renders "$3400.0B", which is not wrong so much as
    unreadable. Adding a T tier there was the obvious move and I measured
    first: nothing that reaches `fmtUsd` on this desk exceeds $5.94B — the
    largest is SPY's total absolute gamma — so a T tier would be a branch
    no input can take, and this file is where trillions actually live.

  · TWO DECIMALS, not one. A statement page is read by comparing line items
    against each other, and $3.42T against $3.38T is a comparison $3.4T
    against $3.4T cannot make. A tape figure changes every second and gets
    one decimal for the opposite reason.

  Both use the same U+2212 minus, which is the part that was genuinely
  inconsistent and is now shared.
*/
const money = (n: number): string => {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  return `${s}$${a.toFixed(0)}`;
};

/** One statement line. `strong` marks a subtotal a reader can check. */
const Line = ({ label, value, strong, indent }: { label: string; value: number; strong?: boolean; indent?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'border-t border-borderSubtle mt-1 pt-1.5' : ''}`}>
    <span className={`text-[11px] ${indent ? 'pl-3 text-textMuted' : strong ? 'text-textPrimary' : 'text-textSecondary'}`}>{label}</span>
    <span className={`font-mono text-[11px] tnum ${strong ? 'text-textPrimary font-semibold' : 'text-textSecondary'}`}>{money(value)}</span>
  </div>
);

/* ── the two readings the ratios and the quarters needed ─────────────────── */

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const two = (v: number) => v.toFixed(2);

/**
 * A ratio's sub-line: where the name sits against its sector's median.
 *
 * The words carry the comparison, not a colour — "above" and "below" are
 * facts, and whether above is GOOD depends on the ratio (a high debt-to-
 * equity is not a win), which is what `lowerIsBetter` is for. When there is
 * no median to show — no covered peers in the sector, or a nullable ratio
 * missing on every peer — it falls back to the plain explanation the card
 * carried before, rather than printing a gap.
 */
const Peer = ({
  own,
  med,
  fmt,
  fallback,
  lowerIsBetter = false,
}: {
  own: number | null;
  med: number | null;
  fmt: (v: number) => string;
  fallback: React.ReactNode;
  lowerIsBetter?: boolean;
}) => {
  if (own === null || med === null) return <>{fallback}</>;
  const diff = own - med;
  const flat = Math.abs(diff) < Math.max(Math.abs(med) * 0.02, 0.005);
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <>
      sector median {fmt(med)} ·{' '}
      {flat ? (
        <span className="text-textSecondary">in line</span>
      ) : (
        <span className={better ? 'text-bull' : 'text-bear'}>
          {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} {diff > 0 ? 'above' : 'below'}
        </span>
      )}
    </>
  );
};

/**
 * One quarter's move on the quarter before it.
 *
 * A dash on the first quarter, and it is not styled as a zero: there is no
 * prior quarter inside this window, which is a different fact from no change.
 */
const Step = ({ pct }: { pct: number | null }) => {
  if (pct === null) {
    return (
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-textMuted/50 tnum" title="No prior quarter in this window">
        —
      </span>
    );
  }
  const flat = Math.abs(pct) < 0.5;
  return (
    <span className={`w-14 shrink-0 text-right font-mono text-[11px] tnum ${flat ? 'text-textMuted' : pct > 0 ? 'text-bull' : 'text-bear'}`}>
      {flat ? 'flat' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
};

const TickerOverview = () => {
  const { ticker = '' } = useParams();
  const t = ticker.toUpperCase();
  const price = Simulator.TICKERS[t]?.currentPrice;
  const f = useMemo(() => buildFundamentals(t, price), [t, price]);
  const peers = useMemo(() => peerMedians(t), [t]);
  const events = useMemo(() => macroCards().filter(c => !c.past).slice(0, 3), []);

  if (!f) {
    /*
      7.2 — TWO REFUSALS, NOT ONE.

      "Not covered" is true of an ETF and of a name this desk has simply not
      taken on, and they are completely different facts. A reader who asks
      for SPY's income statement should not be told the desk might add it
      later: an index fund HAS no income statement, no balance sheet and no
      cash flow — it holds shares of companies that do — and no feed on
      earth would change that. Telling them to wait is worse than telling
      them nothing.
    */
    const fam = twinFamilyFor(t);
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumb={['Terminal', 'Stocks', t || '—']} title={t || 'Unknown'} />
        <Panel className="w-full">
          {fam ? (
            <DataState
              kind="unavailable"
              title="A fund has no statements to read"
              body={`${t} is an exchange-traded fund tracking ${fam.index}. It has no income statement, no balance sheet and no cash flow of its own — it holds shares of the companies that do. Its exposure, its levels and its chain are on the other desks; this page is for a business, and a fund is not one.`}
            />
          ) : (
            <DataState
              kind="unavailable"
              title="Not covered"
              body={`“${t}” is not in this desk's universe of ${coveredTickers().length} names, so there is no company behind it to show. This is a coverage gap rather than a missing statement — the name may be a real business the desk has not taken on.`}
            />
          )}
        </Panel>
      </div>
    );
  }

  const { profile: p, income: i, balance: b, cashFlow: c, ratios: r } = f;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader breadcrumb={['Terminal', 'Stocks', p.ticker]} title={p.name} subtitle={`${p.sector} · ${p.industry}`} />

      {/* Identity */}
      <Panel className="w-full" actions={<ProvenanceChip sources={['candles']} note="Statements are modelled and internally consistent; price is the simulator's." />}>
        <div className="flex items-start gap-4 flex-wrap">
          <CompanyLogo ticker={p.ticker} size={44} />
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-[17px] text-textPrimary">{p.ticker}</span>
              <span className="font-mono text-[15px] text-textSecondary tnum">
                {price ? `$${price.toFixed(2)}` : '—'}
              </span>
              <span className="font-mono text-[11px] text-textMuted">
                {p.headquarters} · founded {p.founded} · {p.employees.toLocaleString()} employees
              </span>
            </div>
            <p className="text-[12px] text-textSecondary leading-snug mt-2 max-w-[76ch]">{p.description}</p>
          </div>
        </div>

        {/* The price-derived half — these move with the tape */}
        <MetricGrid min="140px" className="mt-4">
          <StatCard label="Market cap" value={money(p.marketCap)} sub={`${(p.sharesOutstanding / 1e6).toFixed(0)}M shares`} />
          <StatCard label="P/E" value={r.peRatio === null ? '—' : r.peRatio.toFixed(1)} sub={r.peRatio === null ? 'no earnings to divide' : `on $${i.eps.toFixed(2)} EPS`} />
          <StatCard label="P/S" value={r.psRatio.toFixed(2)} sub="cap over revenue" />
          <StatCard label="Dividend yield" value={r.dividendYieldPct > 0 ? `${r.dividendYieldPct.toFixed(2)}%` : '—'} sub={r.dividendYieldPct > 0 ? 'trailing' : 'pays nothing'} />
          <StatCard label="Employees" value={p.employees.toLocaleString()} sub={`${p.industry}`} />
        </MetricGrid>
      </Panel>

      {/*
        RATIOS, AGAINST A REFERENCE — 7.2

        Every one is derived from the statements below, and every one now
        carries the sector's median beside it. A ratio on its own is a number
        a reader cannot act on: 14% net margin is excellent for a grocer and
        poor for a software company, which is the same reasoning the quality
        sleeve already uses when it ranks a name inside its sector rather
        than against an absolute band.
      */}
      <Panel
        title="Ratios"
        subtitle={
          peers
            ? `all computed from the statements below, never beside them · median is ${peers.sector}, ${peers.peers} other covered ${peers.peers === 1 ? 'name' : 'names'}`
            : 'all computed from the statements below, never beside them'
        }
        className="w-full"
      >
        <MetricGrid min="140px">
          <StatCard label="Gross margin" value={`${r.grossMarginPct.toFixed(1)}%`} sub={<Peer own={r.grossMarginPct} med={peers?.median.grossMarginPct ?? null} fmt={pct1} fallback="revenue kept after cost" />} tone={r.grossMarginPct >= 45 ? 'bull' : 'neutral'} />
          <StatCard label="Operating margin" value={`${r.operatingMarginPct.toFixed(1)}%`} sub={<Peer own={r.operatingMarginPct} med={peers?.median.operatingMarginPct ?? null} fmt={pct1} fallback="after running the business" />} />
          <StatCard label="Net margin" value={`${r.netMarginPct.toFixed(1)}%`} sub={<Peer own={r.netMarginPct} med={peers?.median.netMarginPct ?? null} fmt={pct1} fallback="after everything" />} tone={r.netMarginPct <= 0 ? 'bear' : 'neutral'} />
          <StatCard label="Return on equity" value={r.roePct === null ? '—' : `${r.roePct.toFixed(1)}%`} sub={<Peer own={r.roePct} med={peers?.median.roePct ?? null} fmt={pct1} fallback="net income over equity" />} />
          <StatCard label="Current ratio" value={r.currentRatio.toFixed(2)} sub={<Peer own={r.currentRatio} med={peers?.median.currentRatio ?? null} fmt={two} fallback={r.currentRatio < 1 ? 'under 1 — short-term cover is thin' : 'short-term cover'} />} tone={r.currentRatio < 1 ? 'warn' : 'neutral'} />
          <StatCard label="Debt / equity" value={r.debtToEquity.toFixed(2)} sub={<Peer own={r.debtToEquity} med={peers?.median.debtToEquity ?? null} fmt={two} fallback={r.debtToEquity > 2 ? 'levered' : 'moderate'} lowerIsBetter />} tone={r.debtToEquity > 2 ? 'warn' : 'neutral'} />
          <StatCard label="FCF margin" value={`${r.fcfMarginPct.toFixed(1)}%`} sub={<Peer own={r.fcfMarginPct} med={peers?.median.fcfMarginPct ?? null} fmt={pct1} fallback="free cash over revenue" />} tone={r.fcfMarginPct <= 0 ? 'bear' : 'bull'} />
        </MetricGrid>
        {/*
          0.4 — WHAT THIS PAGE CANNOT TELL YOU. Fundamentals revise: a filing
          is restated, a period is reclassified, and a reader comparing two
          quarters is entitled to know which vintage they are looking at.
          These statements carry no filing date and no restatement history,
          so rather than printing an as-of that would be invented, the page
          says the field is absent. An unlabelled number reads as current.
        */}
        <p className="mt-3 text-[11px] text-textMuted leading-relaxed">
          These statements carry no filing date and no restatement history — the desk holds one vintage per name, so nothing here can be marked as revised. Treat every figure as one snapshot rather than a point in a filing history.
        </p>
      </Panel>

      {/* The three statements */}
      {/* SEASONALITY sits above the statements on purpose: it is the one
          reading on this page that ignores today entirely, and a reader
          asking "is this a month this name usually does well in" is asking
          it before they read a balance sheet. */}
      <SeasonalityPanel ticker={p.ticker} className="w-full" />

      {/* Who actually owns it, and how much of today's tape was never a view
          on the company at all. This sits above the statements on purpose:
          a reader deciding how much weight to put on an earnings line wants
          to know first whether the name trades on its own account. */}
      <EtfExposurePanel ticker={p.ticker} className="w-full" />

      {/* And what the people who run it did with their own shares. Directly
          under passive ownership on purpose: the two together answer "who is
          actually trading this" from both ends — the money with no view, and
          the people with the most. */}
      <InsiderPanel ticker={p.ticker} className="w-full" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/*
          7.2 — NO PERIOD SELECTOR, AND THE SUBTITLE SAYS WHY. A quarterly /
          annual / TTM control needs three vintages to switch between; this
          desk holds one, and a selector with one value teaches a reader
          there are two more behind it. The quarters panel below is the only
          per-period view there is, and it says so.
        */}
        <Panel title="Income statement" subtitle="trailing twelve months — the one vintage the desk holds" className="w-full" collapsible id="fin-income">
          <Line label="Revenue" value={i.revenue} />
          <Line label="Cost of revenue" value={-i.costOfRevenue} indent />
          <Line label="Gross profit" value={i.grossProfit} strong />
          <Line label="Operating expense" value={-i.operatingExpense} indent />
          <Line label="Operating income" value={i.operatingIncome} strong />
          <Line label="Interest expense" value={-i.interestExpense} indent />
          <Line label="Tax" value={-i.taxExpense} indent />
          <Line label="Net income" value={i.netIncome} strong />
          <div className="flex items-baseline justify-between gap-3 py-1 mt-1">
            <span className="text-[11px] text-textMuted">Earnings per share</span>
            <span className="font-mono text-[11px] text-textSecondary tnum">${i.eps.toFixed(2)}</span>
          </div>
        </Panel>

        <Panel title="Balance sheet" subtitle="assets = liabilities + equity" className="w-full" collapsible id="fin-balance">
          <Line label="Cash" value={b.cash} indent />
          <Line label="Receivables" value={b.receivables} indent />
          <Line label="Inventory" value={b.inventory} indent />
          <Line label="Other current" value={b.otherCurrentAssets} indent />
          <Line label="Total current assets" value={b.totalCurrentAssets} strong />
          <Line label="Property & equipment" value={b.ppe} indent />
          <Line label="Goodwill" value={b.goodwill} indent />
          <Line label="Total assets" value={b.totalAssets} strong />
          <Line label="Payables" value={b.payables} indent />
          <Line label="Short-term debt" value={b.shortTermDebt} indent />
          <Line label="Long-term debt" value={b.longTermDebt} indent />
          <Line label="Total liabilities" value={b.totalLiabilities} strong />
          <Line label="Shareholders' equity" value={b.equity} strong />
        </Panel>

        <Panel title="Cash flow" subtitle="where the cash actually went" className="w-full" collapsible id="fin-cash">
          <Line label="Cash from operations" value={c.operating} />
          <Line label="Capital expenditure" value={c.capex} indent />
          <Line label="Free cash flow" value={c.freeCashFlow} strong />
          <Line label="Investing" value={c.investing} indent />
          <Line label="Buybacks" value={c.buybacks} indent />
          <Line label="Dividends paid" value={c.dividendsPaid} indent />
          <Line label="Financing" value={c.financing} strong />
          <Line label="Net change in cash" value={c.netChange} strong />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Quarters */}
        {/*
          7.2 — THE STEP, NOT JUST THE LEVEL. Four levels in a column is a
          spreadsheet: the reader does the subtraction themselves to learn
          the one thing the panel exists to say. Each quarter carries its
          move from the one before, on revenue and on earnings, with the
          glyph that names the direction — and the first quarter shows a
          dash, because there is no prior quarter inside this window and a
          zero would read as "flat" when it means "unknown".
        */}
        <Panel title="By quarter" subtitle="revenue and earnings across the year, each against the quarter before" className="w-full">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-textMuted">
              <span className="w-8 shrink-0" />
              <span className="flex-1" />
              <span className="w-20 shrink-0 text-right">Revenue</span>
              <span className="w-14 shrink-0 text-right">QoQ</span>
              <span className="w-12 shrink-0 text-right">EPS</span>
              <span className="w-14 shrink-0 text-right">QoQ</span>
            </div>
            {f.quarters.map(q => {
              const max = Math.max(...f.quarters.map(x => x.revenue));
              return (
                <div key={q.label} className="flex items-center gap-3">
                  <span className="w-8 shrink-0 font-mono text-[10px] uppercase tracking-wider text-textMuted">{q.label}</span>
                  <div className="flex-1 h-4 bg-white/[0.03] rounded-sm overflow-hidden">
                    <div className="h-full bg-textSecondary/40" style={{ width: `${(q.revenue / max) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] text-textSecondary tnum">{money(q.revenue)}</span>
                  <Step pct={q.revenueQoQPct} />
                  <span className="w-12 shrink-0 text-right font-mono text-[11px] text-textMuted tnum">${q.eps.toFixed(2)}</span>
                  <Step pct={q.epsQoQPct} />
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Related + what's ahead */}
        <Panel title="Related & upcoming" subtitle={`others in ${p.sector}, and the calendar ahead`} className="w-full">
          <div className="flex gap-1.5 flex-wrap">
            {p.related.map(rt => (
              <Link
                key={rt}
                to={`/stocks/${rt}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle font-mono text-[11px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-select"
              >
                <CompanyLogo ticker={rt} size={14} beside /> {rt}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-borderSubtle pt-3">
            {events.length === 0 ? (
              <span className="text-[11px] text-textMuted">Nothing on the macro calendar in the window ahead.</span>
            ) : events.map(e => (
              <div key={e.iso} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-textSecondary">{e.label}</span>
                <span className="font-mono text-[10px] text-textMuted">in {e.daysOut}d · consensus {e.consensus}{e.unit === '%' ? '%' : 'k'}</span>
              </div>
            ))}
          </div>
          <Link
            to={`/earnings/${p.ticker}`}
            className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-textMuted hover:text-textPrimary focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
          >
            Earnings dossier <ArrowUpRight size={11} />
          </Link>
        </Panel>
      </div>
    </div>
  );
};

export default TickerOverview;
