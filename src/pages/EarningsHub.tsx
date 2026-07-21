import { useMemo, useState } from 'react';
import { CalendarClock, Crosshair } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatRibbon from '../components/ui/StatRibbon';
import TickerJump from '../components/ui/TickerJump';
import Panel from '../components/ui/Panel';
import StatCard from '../components/ui/StatCard';
import MetricGrid from '../components/ui/MetricGrid';
import SignalBadge from '../components/ui/SignalBadge';
import SegmentedControl from '../components/ui/SegmentedControl';
import DataTable, { type Column } from '../components/ui/DataTable';
import { buildEarningsCalendar, type EarningsEvent, type EarningsVerdict } from '../data/earnings';
import EarningsIntel from '../components/earnings/EarningsIntel';
import type { Tone } from '../components/ui/tones';

type VerdictFilter = 'ALL' | EarningsVerdict;

const FILTER_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'PLAY', label: 'Plays' },
  { value: 'FADE', label: 'Fades' },
  { value: 'SKIP', label: 'Skips' },
] as const;

const verdictTone: Record<EarningsVerdict, Tone> = {
  PLAY: 'bull',
  FADE: 'magenta',
  SKIP: 'neutral',
};

/** Implied vs realized, drawn against each other — the whole edge in one glance. */
const MoveCompare = ({ implied, hist }: { implied: number; hist: number }) => {
  const max = Math.max(implied, hist, 1);
  return (
    <span className="flex flex-col gap-1 w-full py-0.5">
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-[9px] uppercase text-textMuted">imp</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${(implied / max) * 100}%` }} />
        </span>
        <span className="w-10 font-mono text-[10px] text-textPrimary tnum text-right">{implied.toFixed(1)}%</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-7 font-mono text-[9px] uppercase text-textMuted">real</span>
        <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full bg-white/30" style={{ width: `${(hist / max) * 100}%` }} />
        </span>
        <span className="w-10 font-mono text-[10px] text-textSecondary tnum text-right">{hist.toFixed(1)}%</span>
      </span>
    </span>
  );
};

const EarningsHub = () => {
  const events = useMemo(() => buildEarningsCalendar(), []);
  const [filter, setFilter] = useState<VerdictFilter>('ALL');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const rows = useMemo(() => (filter === 'ALL' ? events : events.filter(e => e.verdict === filter)), [events, filter]);
  const selected = events.find(e => e.ticker === selectedTicker) ?? null;

  const plays = events.filter(e => e.verdict === 'PLAY');
  const fades = events.filter(e => e.verdict === 'FADE');
  const skips = events.filter(e => e.verdict === 'SKIP');
  const richest = [...events].sort((a, b) => b.richness - a.richness)[0];
  const cheapest = [...events].sort((a, b) => a.richness - b.richness)[0];
  const biggest = [...events].sort((a, b) => b.impliedMovePct - a.impliedMovePct)[0];
  const next = [...events].sort((a, b) => a.daysOut - b.daysOut)[0];
  const avgRich = (events.reduce((a, e) => a + e.richness, 0) / Math.max(events.length, 1)).toFixed(2);

  const headerRibbon = (
    <StatRibbon
      stats={[
        { label: 'Next', value: next ? `${next.ticker} ${next.dateLabel}` : '--' },
        { label: 'Avg rich', value: `${avgRich}×`, tone: Number(avgRich) >= 1.15 ? 'warn' : 'neutral' },
        { label: 'Play', value: String(plays.length), tone: 'bull' },
        { label: 'Fade', value: String(fades.length), tone: 'magenta' },
        { label: 'Skip', value: String(skips.length) },
      ]}
    />
  );

  // Group the next stretch of sessions into a calendar strip
  const byDay = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>();
    for (const e of events) {
      const list = map.get(e.dateLabel) ?? [];
      list.push(e);
      map.set(e.dateLabel, list);
    }
    return [...map.entries()];
  }, [events]);

  const columns: Column<EarningsEvent>[] = [
    {
      key: 'ticker',
      header: 'Name',
      sortValue: e => e.ticker,
      render: e => (
        <span className="flex flex-col">
          <span className="font-mono text-xs font-bold text-textPrimary">{e.ticker}</span>
          <span className="text-[10px] text-textMuted truncate">{e.name}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Reports',
      sortValue: e => e.daysOut,
      render: e => (
        <span className="flex flex-col">
          <span className="font-mono text-xs text-textPrimary">{e.dateLabel}</span>
          <span className="font-mono text-[10px] text-textMuted">
            {e.slot} · {e.daysOut === 0 ? 'today' : `${e.daysOut}d out`}
          </span>
        </span>
      ),
    },
    {
      key: 'move',
      header: 'Implied vs realized',
      width: '190px',
      sortValue: e => e.richness,
      render: e => <MoveCompare implied={e.impliedMovePct} hist={e.histAvgMovePct} />,
    },
    {
      key: 'rich',
      header: 'Rich',
      align: 'right',
      sortValue: e => e.richness,
      render: e => (
        <span className={`font-mono text-xs font-semibold tnum ${e.richness >= 1.3 ? 'text-warn' : e.richness <= 0.85 ? 'text-bull' : 'text-textSecondary'}`}>
          {e.richness.toFixed(2)}×
        </span>
      ),
    },
    {
      key: 'beat',
      header: 'Beat 8q',
      align: 'right',
      sortValue: e => e.beatRate8q,
      render: e => <span className="font-mono text-xs text-textSecondary tnum">{e.beatRate8q}%</span>,
    },
    {
      key: 'rev',
      header: 'Revisions',
      align: 'right',
      sortValue: e => e.revisionTrend,
      render: e => (
        <span className={`font-mono text-xs tnum ${e.revisionTrend > 0.15 ? 'text-bull' : e.revisionTrend < -0.15 ? 'text-bear' : 'text-textMuted'}`}>
          {e.revisionTrend > 0.15 ? '▲ rising' : e.revisionTrend < -0.15 ? '▼ falling' : '— flat'}
        </span>
      ),
    },
    {
      key: 'tech',
      header: 'Setup',
      align: 'right',
      sortValue: e => e.technicalScore,
      render: e => (
        <span className={`font-mono text-xs tnum ${e.technicalScore >= 62 ? 'text-bull' : e.technicalScore <= 40 ? 'text-bear' : 'text-textSecondary'}`}>
          {e.technicalScore}
        </span>
      ),
    },
    {
      key: 'ivr',
      header: 'IVR',
      align: 'right',
      sortValue: e => e.ivRank,
      render: e => <span className="font-mono text-xs text-textSecondary tnum">{e.ivRank}</span>,
    },
    {
      key: 'verdict',
      header: 'Call',
      sortValue: e => e.verdict,
      render: e => <SignalBadge tone={verdictTone[e.verdict]}>{e.verdict}</SignalBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Earnings']}
        title="Earnings Hub"
        subtitle="Every upcoming print priced: implied vs what it actually moves — play the cheap ones, fade the rich ones"
        ribbon={headerRibbon}
        actions={<SegmentedControl ariaLabel="Verdict filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />}
      />

      <MetricGrid min="170px">
        <StatCard label="Reports tracked" value={events.length} sub="next two weeks" />
        <StatCard label="Playable" value={plays.length} sub="edge worth taking" tone="bull" />
        <StatCard label="Fade list" value={fades.length} sub="premium overpriced" tone="magenta" />
        <StatCard
          label="Richest straddle"
          value={richest ? `${richest.ticker} ${richest.richness.toFixed(2)}×` : '--'}
          sub={richest ? `implied ${richest.impliedMovePct.toFixed(1)}% vs ${richest.histAvgMovePct.toFixed(1)}% real` : ''}
          tone="warn"
        />
        <StatCard
          label="Cheapest straddle"
          value={cheapest ? `${cheapest.ticker} ${cheapest.richness.toFixed(2)}×` : '--'}
          sub={cheapest ? `market under-pricing an ${cheapest.histAvgMovePct.toFixed(1)}% mover` : ''}
          tone="bull"
        />
      </MetricGrid>

      {/* Calendar strip */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5" /> The slate
          </span>
        }
        subtitle="who reports when"
        flush
      >
        <div className="flex overflow-x-auto divide-x divide-borderSubtle">
          {byDay.map(([label, list]) => (
            <div key={label} className="min-w-[132px] flex-1 px-3 py-2.5">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textMuted">{label}</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {list.map(e => (
                  <button
                    key={e.ticker}
                    onClick={() => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
                    className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                      selectedTicker === e.ticker ? 'bg-select/[0.08]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="font-mono text-[11px] font-bold text-textPrimary">{e.ticker}</span>
                    <span className="font-mono text-[9px] text-textMuted">{e.slot}</span>
                    <SignalBadge tone={verdictTone[e.verdict]} className="ml-auto">
                      {e.verdict}
                    </SignalBadge>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Main table + selected trade plan */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5" /> The board
          </span>
        }
        subtitle="click a row for the strategy"
        flush
      >
        {selected && (
          <div className="px-4 py-3 border-b border-borderSubtle bg-inset flex flex-col gap-2 animate-soft-in">
            <div className="flex items-center gap-2 flex-wrap">
              <SignalBadge tone={verdictTone[selected.verdict]}>{selected.verdict}</SignalBadge>
              <span className="font-mono text-xs font-bold text-textPrimary">
                {selected.ticker} · {selected.dateLabel} {selected.slot}
              </span>
              <span className="font-mono text-[10px] text-textMuted">
                implied {selected.impliedMovePct.toFixed(1)}% · realized {selected.histAvgMovePct.toFixed(1)}% ·{' '}
                {selected.richness.toFixed(2)}×
              </span>
              <TickerJump ticker={selected.ticker} horizon="WEEKLIES" className="ml-auto" />
            </div>
            <p className="text-xs text-textPrimary leading-relaxed">{selected.strategy}</p>
            <p className="text-xs text-textSecondary leading-relaxed">{selected.rationale}</p>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={e => e.ticker}
          onRowClick={e => setSelectedTicker(prev => (prev === e.ticker ? null : e.ticker))}
          selectedKey={selectedTicker}
          initialSort={{ key: 'date', dir: 'asc' }}
          maxHeight="560px"
        />
      </Panel>

      <EarningsIntel event={selected} />
    </>
  );
};

export default EarningsHub;
