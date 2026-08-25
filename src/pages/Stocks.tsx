import { useMemo, useState } from 'react';
import { Layers3, TrendingUp } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import FilterTabs from '../components/ui/FilterTabs';
import DataTable, { type Column } from '../components/ui/DataTable';
import RichRead from '../components/ui/RichRead';
import Sparkline from '../components/compass/Sparkline';
import { buildSectorBoard, buildStockBoard, type SectorRow, type StockPick, type StockVerdict } from '../data/stocks';

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
   top and wears `king` — the same token the king strike wears, one colour
   for "the single one that matters most" wherever a board has one. (It read
   silver when this was written; king moved to magenta 2026-08-18 and the
   token followed, so the comment is caught up with the pixels.) Never used
   as a phase word. */
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
const SleeveBar = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2 min-w-0">
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

  const columns: Column<StockPick>[] = [
    {
      key: 'ticker',
      header: 'Name',
      sortValue: p => p.ticker,
      render: p => (
        <span className="flex flex-col">
          <span className="font-mono text-[13px] font-bold text-textPrimary">{p.ticker}</span>
          <span className="text-[11px] text-textSecondary truncate">{p.name}</span>
        </span>
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
      header: 'Sleeves · Mom / Qual / Flow',
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} />
          <SleeveBar label="Qual" value={p.sleeves.quality} />
          <SleeveBar label="Flow" value={p.sleeves.flow} />
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

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Stocks']}
        title="Stocks"
        subtitle="Screening board — how every name and sector screens on momentum, quality and flow"
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
            <span className="text-king font-semibold">{topSector.sector}</span> leads the ladder with {sectors[1].sector}{' '}
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
        {/* SCROLLS SIDEWAYS INSIDE ITSELF, not the page. The row below is a
            seven-column grid with a 614px minimum — 26 + 120 + 112 + 80 + 74 +
            74 + 56 and six 12px gaps. Held at every width it made <main> 647px
            wide on a 390px screen, so the whole terminal slid left and right
            under the reader's thumb. The list takes the overflow instead, the
            way DataTable already does; nothing is lost and nothing else moves.
            Measured: 257px over -> 0. */}
        <div className="flex flex-col overflow-x-auto">
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
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLeader ? 'bg-king' : phaseDot[s.phase]}`}
                  />
                  {isLeader ? 'LEADING' : PHASE_LABEL[s.phase]}
                </span>
                <span className="flex h-[5px] rounded-full overflow-hidden bg-white/[0.05] min-w-0">
                  <span
                    className={`h-full rounded-full ${isLeader ? 'bg-king' : phaseBar[s.phase]}`}
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
        actions={<FilterTabs ariaLabel="Screen filter" options={VIEW_OPTIONS} value={view} onChange={setView} />}
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
            columns={columns}
            rows={rows}
            rowKey={p => p.ticker}
            onRowClick={p => setSelectedTicker(prev => (prev === p.ticker ? null : p.ticker))}
            selectedKey={selectedTicker}
            maxHeight="640px"
          />
        </div>
      </Panel>
    </>
  );
};

export default Stocks;
