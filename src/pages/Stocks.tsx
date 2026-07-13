import { useMemo, useState } from 'react';
import { Layers3, TrendingUp } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatRibbon from '../components/ui/StatRibbon';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import Sparkline from '../components/skyvision/Sparkline';
import { buildSectorBoard, buildStockBoard, type SectorRow, type StockPick, type StockVerdict } from '../data/stocks';
import type { Tone } from '../components/ui/tones';

type ViewFilter = 'ALL' | 'ACCUMULATE' | 'AVOID';

const VIEW_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACCUMULATE', label: 'Buys' },
  { value: 'AVOID', label: 'Avoids' },
] as const;

const verdictTone: Record<StockVerdict, Tone> = {
  ACCUMULATE: 'bull',
  HOLD: 'neutral',
  AVOID: 'bear',
};

const sectorTone: Record<SectorRow['verdict'], Tone> = {
  OVERWEIGHT: 'bull',
  NEUTRAL: 'neutral',
  UNDERWEIGHT: 'bear',
};

const phaseTone: Record<SectorRow['phase'], Tone> = {
  LEADING: 'bull',
  IMPROVING: 'select',
  WEAKENING: 'warn',
  LAGGING: 'bear',
};

/** Sleeve meter — one thin bar per scoring sleeve; the composite's anatomy. */
const SleeveBar = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="w-9 shrink-0 font-mono text-[9px] uppercase tracking-wider text-textMuted">{label}</span>
    <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <span
        className={`block h-full rounded-full ${value >= 60 ? 'holo-bar' : value >= 40 ? 'bg-white/30' : 'bg-bear/70'}`}
        style={{ width: `${value}%` }}
      />
    </span>
    <span className="w-6 shrink-0 font-mono text-[10px] text-textSecondary tnum text-right">{value}</span>
  </div>
);

const Stocks = () => {
  const picks = useMemo(() => buildStockBoard(), []);
  const sectors = useMemo(() => buildSectorBoard(picks), [picks]);
  const [view, setView] = useState<ViewFilter>('ALL');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const rows = useMemo(() => (view === 'ALL' ? picks : picks.filter(p => p.verdict === view)), [picks, view]);
  const selected = picks.find(p => p.ticker === selectedTicker) ?? null;

  const buys = picks.filter(p => p.verdict === 'ACCUMULATE');
  const avoids = picks.filter(p => p.verdict === 'AVOID');
  const breadth = Math.round((picks.filter(p => p.sleeves.momentum > 50).length / picks.length) * 100);
  const topSector = sectors[0];
  const bottomSector = sectors[sectors.length - 1];
  const avgScore = Math.round(picks.reduce((a, p) => a + p.composite, 0) / picks.length);
  const sectorsUp = sectors.filter(s => s.phase === 'LEADING' || s.phase === 'IMPROVING').length;
  const rsSpread = sectors[0].score - sectors[sectors.length - 1].score;

  const headerRibbon = (
    <StatRibbon
      stats={[
        { label: 'Universe', value: String(picks.length) },
        { label: 'Avg score', value: String(avgScore), tone: avgScore >= 60 ? 'bull' : avgScore <= 48 ? 'bear' : 'neutral' },
        { label: 'Sectors up', value: `${sectorsUp}/${sectors.length}`, tone: sectorsUp > sectors.length / 2 ? 'bull' : 'bear' },
        { label: 'RS spread', value: `${rsSpread}pts` },
      ]}
    />
  );

  const columns: Column<StockPick>[] = [
    {
      key: 'ticker',
      header: 'Name',
      sortValue: p => p.ticker,
      render: p => (
        <span className="flex flex-col">
          <span className="font-mono text-xs font-bold text-textPrimary">{p.ticker}</span>
          <span className="text-[10px] text-textMuted truncate">{p.name}</span>
        </span>
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      sortValue: p => p.sector,
      render: p => <span className="font-mono text-[10px] text-textSecondary">{p.sector}</span>,
    },
    {
      key: 'price',
      header: 'Last',
      align: 'right',
      sortValue: p => p.price,
      render: p => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-xs text-textPrimary tnum">${p.price.toFixed(2)}</span>
          <span className={`font-mono text-[10px] tnum ${p.changePct >= 0 ? 'text-bull' : 'text-bear'}`}>
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
      header: 'Sleeves · Mom / Qual / Flow / News',
      width: '220px',
      render: p => (
        <span className="flex flex-col gap-1 py-0.5">
          <SleeveBar label="Mom" value={p.sleeves.momentum} />
          <SleeveBar label="Qual" value={p.sleeves.quality} />
          <SleeveBar label="Flow" value={p.sleeves.flow} />
          <SleeveBar label="News" value={p.sleeves.news} />
        </span>
      ),
    },
    {
      key: 'composite',
      header: 'Score',
      align: 'right',
      sortValue: p => p.composite,
      render: p => (
        <span className={`font-mono text-sm font-bold tnum ${p.composite >= 68 ? 'holo-text' : p.composite <= 46 ? 'text-bear' : 'text-textPrimary'}`}>
          {p.composite}
        </span>
      ),
    },
    {
      key: 'verdict',
      header: 'Verdict',
      sortValue: p => p.verdict,
      render: p => <SignalBadge tone={verdictTone[p.verdict]}>{p.verdict}</SignalBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Stocks']}
        title="Stocks"
        subtitle="Common-stock board — what screens as ownable, and which sectors deserve the exposure"
        ribbon={headerRibbon}
        actions={<SegmentedControl ariaLabel="Verdict filter" options={VIEW_OPTIONS} value={view} onChange={setView} />}
      />

      <MetricGrid min="170px">
        <StatCard label="Accumulate list" value={buys.length} sub={`of ${picks.length} names screened`} tone="bull" />
        <StatCard label="Avoid list" value={avoids.length} sub="screens argue against owning" tone="bear" />
        <StatCard label="Breadth" value={`${breadth}%`} sub="names above trend" tone={breadth >= 55 ? 'bull' : breadth <= 40 ? 'bear' : 'neutral'} />
        <StatCard label="Strongest sector" value={topSector.sector} sub={`score ${topSector.score} · ${topSector.phase}`} tone="bull" />
        <StatCard label="Weakest sector" value={bottomSector.sector} sub={`score ${bottomSector.score} · ${bottomSector.phase}`} tone="bear" />
      </MetricGrid>

      {/* Sector rotation board */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className="w-3.5 h-3.5" /> Sector rotation
          </span>
        }
        subtitle="composite of member names · relative strength on two windows"
        flush
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-borderSubtle">
          {sectors.map(s => (
            <div key={s.sector} className="bg-panel px-3.5 py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-textPrimary truncate">{s.sector}</span>
                <SignalBadge tone={phaseTone[s.phase]}>{s.phase}</SignalBadge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-xl font-bold tnum ${s.verdict === 'OVERWEIGHT' ? 'holo-text' : s.verdict === 'UNDERWEIGHT' ? 'text-bear' : 'text-textPrimary'}`}>
                  {s.score}
                </span>
                <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">{s.verdict}</span>
              </div>
              <div className="h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
                <span
                  className={`block h-full rounded-full ${s.verdict === 'OVERWEIGHT' ? 'holo-bar' : s.verdict === 'UNDERWEIGHT' ? 'bg-bear/70' : 'bg-white/30'}`}
                  style={{ width: `${s.score}%` }}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] tnum">
                <span className={s.rs1w >= 0 ? 'text-bull' : 'text-bear'}>
                  1w {s.rs1w >= 0 ? '+' : ''}
                  {s.rs1w.toFixed(1)}%
                </span>
                <span className={s.rs1m >= 0 ? 'text-bull' : 'text-bear'}>
                  1m {s.rs1m >= 0 ? '+' : ''}
                  {s.rs1m.toFixed(1)}%
                </span>
                <span className="text-textMuted">br {s.breadthPct}%</span>
              </div>
              <p className="text-[10px] text-textMuted leading-snug">{s.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Ranked picks */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Ranked board
          </span>
        }
        subtitle="click a row for the thesis"
        flush
      >
        {selected && (
          <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex items-start gap-2 animate-soft-in">
            <SignalBadge tone={verdictTone[selected.verdict]}>{selected.verdict}</SignalBadge>
            <p className="text-xs text-textSecondary leading-relaxed">{selected.thesis}</p>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={p => p.ticker}
          onRowClick={p => setSelectedTicker(prev => (prev === p.ticker ? null : p.ticker))}
          selectedKey={selectedTicker}
          initialSort={{ key: 'composite', dir: 'desc' }}
          maxHeight="640px"
        />
      </Panel>
    </>
  );
};

export default Stocks;
