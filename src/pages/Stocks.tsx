import { useMemo, useState } from 'react';
import { fmtUsdSigned } from '../data/gex';
import { Link } from 'react-router-dom';
import { Layers3, TrendingUp } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import FilterTabs from '../components/ui/FilterTabs';
import DataTable, { type Column } from '../components/ui/DataTable';
import RichRead from '../components/ui/RichRead';
import Sparkline from '../components/compass/Sparkline';
import {
  buildSectorBoard, buildStockBoard, SLEEVE_WINDOWS,
  type SectorRow, type StockPick, type StockSleeves, type StockVerdict,
} from '../data/stocks';

/*
  Screening board, not an advisor. Internal verdicts (ACCUMULATE/HOLD/AVOID)
  are engine vocabulary — users see SCREEN STATES: STRONG / MIXED / WEAK,
  the data's opinion of how a name screens. Same doctrine as Compass.
  Sector rotation is a RANKED LADDER (who leads, by how much) — not a wall
  of cards all stamped "LEADING".
*/

type ViewFilter = 'ALL' | 'ACCUMULATE' | 'AVOID';

const VIEW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCUMULATE', label: 'Strong' },
  { value: 'AVOID', label: 'Weak' },
] as const;

/** User-facing screen states — the data's read, never an instruction. */
const STATE_LABEL: Record<StockVerdict, string> = {
  ACCUMULATE: 'STRONG',
  HOLD: 'MIXED',
  AVOID: 'WEAK',
};

const stateDot: Record<StockVerdict, string> = {
  ACCUMULATE: 'bg-bull',
  HOLD: 'bg-white/30',
  AVOID: 'bg-bear',
};

const StateTag = ({ verdict }: { verdict: StockVerdict }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textPrimary whitespace-nowrap">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stateDot[verdict]}`} />
    {STATE_LABEL[verdict]}
  </span>
);

/* Phase = DIRECTION of relative strength (two windows), a different axis
   than ladder position — named so it can't be read as rank. A mid-table
   sector can be RISING; the ladder says where it sits, the phase says
   which way it's moving. LEADING is reserved for the ladder's absolute
   top (silver/holo — the supreme family), never used as a phase word. */
const PHASE_LABEL: Record<SectorRow['phase'], string> = {
  LEADING: 'RISING',
  IMPROVING: 'TURNING UP',
  WEAKENING: 'ROLLING OVER',
  LAGGING: 'FALLING',
};

const phaseDot: Record<SectorRow['phase'], string> = {
  LEADING: 'bg-bull',
  IMPROVING: 'bg-flip',
  WEAKENING: 'bg-warn',
  LAGGING: 'bg-bear',
};

// Bar carries the SAME direction color as the dot — one code, two marks
const phaseBar: Record<SectorRow['phase'], string> = {
  LEADING: 'bg-bull',
  IMPROVING: 'bg-flip',
  WEAKENING: 'bg-warn',
  LAGGING: 'bg-bear/80',
};

/** Sleeve meter — one thin bar per sleeve; the screen's anatomy. Bar only,
    no figure: sleeve grades are engine-internal (Noah, 2026-08-16). Colored
    by direction against the 50 neutral line (the same threshold the breadth
    read uses): soft green above, red below — never the holo family. */
/* 7.3 — A BAR WITHOUT ITS WINDOW IS NOT A CLAIM.

   These four render identically: same length, same scale, one column. But
   momentum is 30 sessions of price and quality is four quarters of
   filings, and two bars the same length measured over windows an order of
   magnitude apart read as two equally weighted votes. The window travels
   with the label — on hover for the detail, and named in the header so it
   is visible without one. */
const SleeveBar = ({ label, value, sleeve }: { label: string; value: number; sleeve: keyof StockSleeves }) => (
  <div className="flex items-center gap-2 min-w-0" title={`${SLEEVE_WINDOWS[sleeve].window} — ${SLEEVE_WINDOWS[sleeve].note}`}>
    <span className="w-9 shrink-0 font-mono text-[10px] uppercase tracking-wider text-textMuted">{label}</span>
    <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <span
        className={`block h-full rounded-full ${value > 50 ? 'bg-bull' : 'bg-bear/70'}`}
        style={{ width: `${value}%` }}
      />
    </span>
  </div>
);

const Stocks = () => {
  /* The default board is what a reader looks at first; the position
     columns are one click away rather than always on. */
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['ticker', 'price', 'trend', 'sleeves', 'short', 'verdict']));
  const picks = useMemo(() => buildStockBoard(), []);
  const sectors = useMemo(() => buildSectorBoard(picks), [picks]);
  const [view, setView] = useState<ViewFilter>('ALL');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  // Strongest screens first — the ranking survives even though the composite
  // itself is engine-internal now (Noah, 2026-08-16; no Score column to sort by).
  const rows = useMemo(
    () => (view === 'ALL' ? picks : picks.filter(p => p.verdict === view)).slice().sort((a, b) => b.composite - a.composite),
    [picks, view],
  );
  const selected = picks.find(p => p.ticker === selectedTicker) ?? null;

  const strong = picks.filter(p => p.verdict === 'ACCUMULATE');
  const weak = picks.filter(p => p.verdict === 'AVOID');
  // "A, B and C" — not "A and B and C"
  const listPhrase = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  const breadth = Math.round((picks.filter(p => p.sleeves.momentum > 50).length / picks.length) * 100);
  const topSector = sectors[0];
  const bottomSector = sectors[sectors.length - 1];
  // The ladder's leader is never called a laggard in the same breath, even if
  // its two windows are both red — rank and direction are different axes.
  const laggards = sectors
    .filter(s => s.phase === 'LAGGING' && s.score !== topSector.score)
    .map(s => s.sector);

  // One board-level read instead of ten near-identical card sentences.
  // Key tokens echo the ladder's color code: leader = magenta, laggards = bear.

  const allColumns: Column<StockPick>[] = [
    {
      key: 'ticker',
      header: 'Name',
      sortValue: p => p.ticker,
      render: p => (
        /* §2 — the ticker is a door to the company behind it. The row's own
           click still opens the thesis inline; this opens the business. */
        <Link
          to={`/stocks/${p.ticker}`}
          onClick={e => e.stopPropagation()}
          className="flex flex-col group focus:outline-none focus-visible:ring-1 focus-visible:ring-select rounded"
        >
          <span className="font-mono text-[13px] font-bold text-textPrimary group-hover:underline decoration-dotted">{p.ticker}</span>
          <span className="text-[11px] text-textSecondary truncate">{p.name}</span>
        </Link>
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      sortValue: p => p.sector,
      render: p => <span className="font-mono text-[11px] text-textSecondary">{p.sector}</span>,
    },
    {
      key: 'price',
      header: 'Last',
      align: 'right',
      sortValue: p => p.price,
      render: p => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-xs text-textPrimary tnum">${p.price.toFixed(2)}</span>
          <span className={`font-mono text-[11px] tnum ${p.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
            {p.changePct >= 0 ? '+' : ''}
            {p.changePct.toFixed(2)}%
          </span>
        </span>
      ),
    },
    {
      key: 'trend',
      header: '30d RS',
      render: p => <Sparkline data={p.trend} up={p.trend[p.trend.length - 1] >= p.trend[0]} width={72} height={22} />,
    },
    {
      key: 'sleeves',
      /* The windows in the header, so the difference is visible without a
         hover — a reader scanning the column sees 30d against 4Q and knows
         the bars are not measuring the same kind of thing. */
      header: (
        <span className="inline-flex flex-col leading-tight">
          <span>Sleeves · Mom / Qual / Flow / News</span>
          <span className="font-mono text-[8px] normal-case tracking-normal text-textMuted">
            30d · 4Q · today · 7d
          </span>
        </span>
      ),
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} sleeve="momentum" />
          <SleeveBar label="Qual" value={p.sleeves.quality} sleeve="quality" />
          <SleeveBar label="Flow" value={p.sleeves.flow} sleeve="flow" />
          <SleeveBar label="News" value={p.sleeves.news} sleeve="news" />
        </span>
      ),
    },
    /*
      §2's POSITION columns. The sleeves above score the name; these four
      answer a different question — what happens if it moves. They are
      opt-in because a board carrying every column at once is unreadable on
      a laptop, and a reader screening on momentum is not also screening on
      float.
    */
    {
      key: 'short',
      /* TWO VINTAGES UNDER ONE HEADER. Short interest is an exchange
         settlement figure published twice a month; days-to-cover divides it
         by recent average volume and moves daily. They sat under one label
         reading as one measurement. */
      header: (
        <span className="inline-flex flex-col leading-tight">
          <span>Short % · cover</span>
          <span className="font-mono text-[8px] normal-case tracking-normal text-textMuted">
            settled · vs ADV
          </span>
        </span>
      ),
      align: 'right',
      width: '110px',
      sortValue: p => p.shortInterestPct,
      render: p => (
        <span className="font-mono text-[11px]">
          <span className={p.shortInterestPct >= 15 ? 'text-warn' : 'text-textSecondary'}>
            {p.shortInterestPct.toFixed(1)}%
          </span>
          <span className="text-textMuted ml-1.5">{p.daysToCover.toFixed(1)}d</span>
        </span>
      ),
    },
    {
      key: 'insider',
      header: 'Insider 90d',
      align: 'right',
      width: '110px',
      sortValue: p => p.insiderNet90d,
      render: p => (
        <span className={`font-mono text-[11px] ${p.insiderNet90d > 0 ? 'text-bull' : p.insiderNet90d < 0 ? 'text-bear' : 'text-textMuted'}`}>
          {fmtUsdSigned(p.insiderNet90d, '$0')}
        </span>
      ),
    },
    {
      key: 'float',
      header: 'Float',
      align: 'right',
      width: '96px',
      sortValue: p => p.floatShares,
      render: p => (
        <span className="font-mono text-[11px] text-textSecondary">
          {p.floatShares >= 1e9 ? `${(p.floatShares / 1e9).toFixed(1)}B` : `${(p.floatShares / 1e6).toFixed(0)}M`}
        </span>
      ),
    },
    {
      key: 'verdict',
      header: 'Screen',
      sortValue: p => p.verdict,
      render: p => <StateTag verdict={p.verdict} />,
    },
  ];

  /* Column visibility — the list asks for it, and the board needs it once
     the position columns are in: eleven columns is a horizontal scroll on
     anything smaller than a desk monitor. */
  const shownColumns = useMemo(
    () => allColumns.filter(c => visibleCols.has(c.key)),
    [allColumns, visibleCols]
  );

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Stocks']}
        title="Stocks"
        subtitle="Screening board — how every name and sector screens on momentum, quality, flow and news"
      />

      <MetricGrid min="170px">
        <StatCard label="Strong screens" value={strong.length} sub={`of ${picks.length} names screened`} tone="bull" />
        <StatCard label="Weak screens" value={weak.length} sub="the data argues against" tone="bear" />
        <StatCard label="Breadth" value={`${breadth}%`} sub="names above trend" tone={breadth >= 55 ? 'bull' : breadth <= 40 ? 'bear' : 'neutral'} />
        <StatCard label="Strongest sector" value={topSector.sector} sub="leading the rotation" tone="bull" />
        <StatCard label="Weakest sector" value={bottomSector.sector} sub="trailing the rotation" tone="bear" />
      </MetricGrid>

      {/* Sector rotation — a ranked ladder, so "who leads by how much" is geometry */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="w-3.5 h-3.5" /> Sector rotation
          </span>
        }
        subtitle="price relative strength, ranked · composite of member names"
        flush
      >
        <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex flex-col gap-1">
          <p className="text-[13px] text-textPrimary leading-relaxed">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider mr-2 text-textSecondary">The read</span>
            <span className="text-supreme font-semibold">{topSector.sector}</span> leads the ladder with {sectors[1].sector}{' '}
            close behind —{' '}
            {laggards.length > 0 ? (
              <>
                <span className="text-bear font-semibold">{listPhrase(laggards)}</span>{' '}
                {laggards.length === 1 ? 'is' : 'are'} falling on both windows
              </>
            ) : (
              'none are falling on both windows'
            )}
            .
          </p>
          {/* The Dark Pool › Leaders cross-link died with the launch trim
              (Noah, 2026-08-17) — the read stands on its own. */}
          <p className="text-[11px] text-textSecondary leading-relaxed">
            This board ranks <span className="text-textPrimary">price strength</span> — who's outperforming the tape.
          </p>
        </div>
        <div className="flex flex-col">
          {sectors.map((s, i) => {
            // The crown: only the ladder's absolute best (ties share it)
            const isLeader = s.score === topSector.score;
            return (
              <div
                key={s.sector}
                className="px-4 py-2.5 grid grid-cols-[26px_minmax(120px,1.1fr)_112px_minmax(80px,1.6fr)_74px_74px_56px] items-center gap-3 border-b border-borderSubtle/60 last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-mono text-[10px] text-textMuted tnum">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-mono text-[13px] text-textPrimary truncate font-semibold">{s.sector}</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textPrimary">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLeader ? 'bg-supreme' : phaseDot[s.phase]}`}
                  />
                  {isLeader ? 'LEADING' : PHASE_LABEL[s.phase]}
                </span>
                <span className="flex h-[5px] rounded-full overflow-hidden bg-white/[0.05] min-w-0">
                  <span
                    className={`h-full rounded-full ${isLeader ? 'bg-supreme' : phaseBar[s.phase]}`}
                    style={{ width: `${(s.score / topSector.score) * 100}%` }}
                  />
                </span>
                <span className={`font-mono text-[11px] tnum text-right ${s.rs1w >= 0 ? 'text-bull' : 'text-bear'}`}>
                  1w {s.rs1w >= 0 ? '+' : ''}
                  {s.rs1w.toFixed(1)}%
                </span>
                <span className={`font-mono text-[11px] tnum text-right ${s.rs1m >= 0 ? 'text-bull' : 'text-bear'}`}>
                  1m {s.rs1m >= 0 ? '+' : ''}
                  {s.rs1m.toFixed(1)}%
                </span>
                <span className="font-mono text-[11px] text-textSecondary tnum text-right">br {s.breadthPct}%</span>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Ranked screens */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Ranked screens
          </span>
        }
        subtitle="screen states — the data's read, you make the call · click a row for the why"
        actions={
          <div className="flex items-center gap-2">
            {/* Column visibility — the position columns are one click away
                rather than always on, because eleven columns is a horizontal
                scroll on anything smaller than a desk monitor. */}
            <div className="flex items-center gap-1" role="group" aria-label="Columns">
              {allColumns.filter(c => c.key !== 'ticker').map(c => {
                const on = visibleCols.has(c.key);
                return (
                  <button
                    key={c.key}
                    aria-pressed={on}
                    onClick={() => setVisibleCols(prev => {
                      const next = new Set(prev);
                      if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                      return next;
                    })}
                    className={`px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-select ${
                      on ? 'bg-white/[0.07] text-textSecondary' : 'text-textMuted hover:text-textSecondary'
                    }`}
                  >
                    {c.key}
                  </button>
                );
              })}
            </div>
            <FilterTabs ariaLabel="Screen filter" options={VIEW_OPTIONS} value={view} onChange={setView} />
          </div>
        }
        flush
      >
        {selected && (
          <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex items-start gap-3 animate-soft-in">
            <StateTag verdict={selected.verdict} />
            <p className="text-[13px] text-textPrimary leading-relaxed">
              <RichRead text={selected.thesis} />
            </p>
          </div>
        )}
        {/* keyed by filter so the swap fades up softly instead of blinking */}
        <div key={view} className="animate-soft-in">
          <DataTable
            columns={shownColumns}
            rows={rows}
            rowKey={p => p.ticker}
            onRowClick={p => setSelectedTicker(prev => (prev === p.ticker ? null : p.ticker))}
            selectedKey={selectedTicker}
            /* Reachable: the composite is a seeded per-day draw against a
               fixed threshold, so a day where nothing clears 68 empties the
               Strong tab. Measured at 3 of 286 sampled sessions. Without
               this the table falls through to DataTable's generic "No data",
               which reads as a fault rather than as a flat board. */
            emptyText={
              view === 'ALL'
                ? 'Nothing screened today.'
                : `Nothing scored ${view === 'ACCUMULATE' ? 'Strong' : 'Weak'} on today's sweep — the board landed in the middle. Try All.`
            }
            maxHeight="640px"
          />
        </div>
      </Panel>
    </>
  );
};

export default Stocks;
