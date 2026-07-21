import { useMemo, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildScannerRows, summarizeScanner, type FlowSentiment, type ScannerRow } from '../../data/flowscan';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import SegmentedControl from '../../components/ui/SegmentedControl';
import DataTable, { type Column } from '../../components/ui/DataTable';
import type { Tone } from '../../components/ui/tones';

type SideFilter = 'ALL' | 'C' | 'P';
type SentFilter = 'ALL' | FlowSentiment;

const SIDE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'C', label: 'Calls' },
  { value: 'P', label: 'Puts' },
] as const;

const SENT_OPTIONS = [
  { value: 'ALL', label: 'Any' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'BEARISH', label: 'Bearish' },
] as const;

const sentTone: Record<FlowSentiment, Tone> = {
  BULLISH: 'bull',
  BEARISH: 'bear',
  NEUTRAL: 'neutral',
};

/** Diverging conviction bar centered at 0 — bullish right (holo), bearish left (red). */
const ScoreBar = ({ score }: { score: number }) => (
  <span className="flex items-center gap-1.5 w-full">
    <span className="relative flex-1 h-[6px] rounded-full bg-white/[0.05] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
      {score >= 0 ? (
        <span className="absolute top-0 bottom-0 left-1/2 holo-bar rounded-r-full" style={{ width: `${(score / 100) * 50}%` }} />
      ) : (
        <span className="absolute top-0 bottom-0 right-1/2 bg-bear/80 rounded-l-full" style={{ width: `${(-score / 100) * 50}%` }} />
      )}
    </span>
    <span className={`w-8 text-right font-mono text-[10px] tnum ${score >= 0 ? 'text-bull' : 'text-bear'}`}>
      {score >= 0 ? '+' : ''}
      {score}
    </span>
  </span>
);

const FlowScanner = () => {
  const { marketData } = useMarketData();
  const rows = useMemo(() => (marketData ? buildScannerRows(marketData) : []), [marketData]);
  const summary = useMemo(() => summarizeScanner(rows), [rows]);
  const [side, setSide] = useState<SideFilter>('ALL');
  const [sent, setSent] = useState<SentFilter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => rows.filter(r => (side === 'ALL' || r.right === side) && (sent === 'ALL' || r.sentiment === sent)),
    [rows, side, sent]
  );
  const selected = rows.find(r => r.id === selectedId) ?? null;

  const columns: Column<ScannerRow>[] = [
    {
      key: 'contract',
      header: 'Contract',
      sortValue: r => r.strike,
      render: r => (
        <span className="flex flex-col">
          <span className="font-mono text-xs font-bold text-textPrimary">
            {r.ticker} {r.strike}
            <span className={r.right === 'C' ? 'text-bull' : 'text-bear'}>{r.right}</span>
          </span>
          <span className="font-mono text-[10px] text-textMuted">
            {r.expiry} · {r.dte}d · {r.otmPct >= 0 ? '+' : ''}
            {r.otmPct.toFixed(1)}%
          </span>
        </span>
      ),
    },
    { key: 'last', header: 'Last', render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.last}</span> },
    { key: 'volume', header: 'Vol', align: 'right', sortValue: r => r.volume, render: r => <span className="font-mono text-xs text-textPrimary tnum">{r.volume.toLocaleString()}</span> },
    { key: 'oi', header: 'OI', align: 'right', sortValue: r => r.oi, render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.oi.toLocaleString()}</span> },
    {
      key: 'doi',
      header: 'ΔOI',
      align: 'right',
      sortValue: r => r.deltaOi,
      render: r => (
        <span className={`font-mono text-xs tnum ${r.deltaOi >= 0 ? 'text-bull' : 'text-bear'}`}>
          {r.deltaOi >= 0 ? '+' : ''}
          {r.deltaOi.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'voi',
      header: 'Vol/OI',
      align: 'right',
      sortValue: r => r.volOverOi,
      render: r => <span className={`font-mono text-xs tnum ${r.volOverOi > 1 ? 'text-warn' : 'text-textSecondary'}`}>{r.volOverOi.toFixed(2)}</span>,
    },
    { key: 'premium', header: 'Premium', align: 'right', sortValue: r => r.premium, render: r => <span className="font-mono text-xs font-semibold text-textPrimary tnum">{fmtUsd(r.premium)}</span> },
    { key: 'iv', header: 'IV', align: 'right', sortValue: r => r.iv, render: r => <span className="font-mono text-xs text-textSecondary tnum">{r.iv.toFixed(0)}%</span> },
    { key: 'score', header: 'Conviction', width: '150px', sortValue: r => r.bullScore, render: r => <ScoreBar score={r.bullScore} /> },
    { key: 'sent', header: 'Read', sortValue: r => r.sentiment, render: r => <SignalBadge tone={sentTone[r.sentiment]}>{r.sentiment}</SignalBadge> },
  ];

  return (
    <>
      <MetricGrid min="170px">
        <StatCard label="Contracts scanned" value={summary.contracts} sub={`${filtered.length} shown`} />
        <StatCard label="Total premium" value={fmtUsd(summary.totalPremium)} sub={`${fmtUsd(summary.callPremium)} calls / ${fmtUsd(summary.putPremium)} puts`} />
        <StatCard
          label="Net directional"
          value={`${summary.bullish ? '+' : '−'}${fmtUsd(Math.abs(summary.netPremium))}`}
          sub={summary.bullish ? 'bullish premium leads' : 'bearish premium leads'}
          tone={summary.bullish ? 'bull' : 'bear'}
        />
        <StatCard
          label="Top bull"
          value={summary.topBull ? `${summary.topBull.strike}${summary.topBull.right}` : '--'}
          sub={summary.topBull ? `+${summary.topBull.bullScore} · ${fmtUsd(summary.topBull.premium)}` : ''}
          tone="bull"
        />
        <StatCard
          label="ΔOI leader"
          value={summary.deltaOiLeader ? `${summary.deltaOiLeader.strike}${summary.deltaOiLeader.right}` : '--'}
          sub={summary.deltaOiLeader ? `${summary.deltaOiLeader.deltaOi >= 0 ? '+' : ''}${summary.deltaOiLeader.deltaOi.toLocaleString()} OI` : ''}
          tone="select"
        />
      </MetricGrid>

      <div className="flex items-center gap-2.5 flex-wrap">
        <SegmentedControl ariaLabel="Side filter" options={SIDE_OPTIONS} value={side} onChange={setSide} />
        <SegmentedControl ariaLabel="Sentiment filter" options={SENT_OPTIONS} value={sent} onChange={setSent} />
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {summary.sweeps} sweeps · per-contract aggregation · 10s
        </span>
      </div>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" /> Contract aggregation
          </span>
        }
        subtitle="volume · ΔOI · premium · bull/bear conviction"
        flush
      >
        {selected && (
          <div className="px-4 py-2.5 border-b border-borderSubtle bg-inset flex items-center gap-2 flex-wrap animate-soft-in">
            <SignalBadge tone={sentTone[selected.sentiment]}>{selected.sentiment}</SignalBadge>
            <span className="font-mono text-xs font-bold text-textPrimary">
              {selected.ticker} {selected.strike}
              {selected.right} · {selected.expiry}
            </span>
            <span className="font-mono text-[11px] text-textSecondary">
              {selected.volume.toLocaleString()} vol on {selected.oi.toLocaleString()} OI ({selected.volOverOi.toFixed(2)}× vol/OI) ·{' '}
              {selected.bidPct}% bid-side · {fmtUsd(selected.premium)} premium
              {selected.sweeps > 0 ? ` · ${selected.sweeps} sweeps` : ''}
            </span>
          </div>
        )}
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={r => r.id}
          onRowClick={r => setSelectedId(prev => (prev === r.id ? null : r.id))}
          selectedKey={selectedId}
          initialSort={{ key: 'premium', dir: 'desc' }}
          maxHeight="560px"
          emptyText="No contracts match this filter"
        />
      </Panel>
    </>
  );
};

export default FlowScanner;
