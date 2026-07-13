import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { HORIZONS, weighContracts, type ContractVerdict, type Horizon, type WeighedContract } from '../../core/contractScore';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import DataTable, { type Column } from '../ui/DataTable';
import type { Tone } from '../ui/tones';

const verdictTone: Record<ContractVerdict, Tone> = {
  BUY: 'bull',
  WATCH: 'warn',
  FADE: 'bear',
};

/** One factor of the composite — label, weight, meter, score. */
const FactorRow = ({ label, weight, score, detail }: { label: string; weight: number; score: number; detail: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="font-mono text-[9px] text-textMuted tnum">×{weight.toFixed(2)}</span>
      <span className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
        <span
          className={`block h-full rounded-full ${score >= 60 ? 'holo-bar' : score >= 40 ? 'bg-white/30' : 'bg-bear/70'}`}
          style={{ width: `${score}%` }}
        />
      </span>
      <span className="w-7 shrink-0 font-mono text-[11px] font-semibold text-textPrimary tnum text-right">{score}</span>
    </div>
    <p className="pl-32 text-[10px] text-textMuted leading-snug">{detail}</p>
  </div>
);

interface ContractWeigherProps {
  snapshot: MarketSnapshot;
}

/** Compass's second mode: the scale. Weeklies, swings and LEAPS candidates
    priced and weighed — buy list on top, fades on the bottom, reasons attached. */
const ContractWeigher = ({ snapshot }: ContractWeigherProps) => {
  const [horizon, setHorizon] = useState<Horizon>('WEEKLIES');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const contracts = useMemo(() => weighContracts(snapshot, horizon), [snapshot, horizon]);
  const selected = contracts.find(c => c.id === selectedId) ?? contracts[0] ?? null;

  const buys = contracts.filter(c => c.verdict === 'BUY');
  const fades = contracts.filter(c => c.verdict === 'FADE');
  const best = contracts[0];
  const activeHorizon = HORIZONS.find(h => h.key === horizon)!;

  const columns: Column<WeighedContract>[] = [
    {
      key: 'contract',
      header: 'Contract',
      sortValue: c => c.strike,
      render: c => (
        <span className="flex flex-col">
          <span className="font-mono text-xs font-bold text-textPrimary">
            {c.ticker} {c.strike} {c.right}
          </span>
          <span className="font-mono text-[10px] text-textMuted">
            {c.expiryLabel} · {c.dte}d
          </span>
        </span>
      ),
    },
    {
      key: 'mid',
      header: 'Mid',
      align: 'right',
      sortValue: c => c.mid,
      render: c => <span className="font-mono text-xs text-textPrimary tnum">${c.mid.toFixed(2)}</span>,
    },
    {
      key: 'delta',
      header: 'Δ',
      align: 'right',
      sortValue: c => Math.abs(c.delta),
      render: c => <span className="font-mono text-xs text-textSecondary tnum">{c.delta.toFixed(2)}</span>,
    },
    {
      key: 'theta',
      header: 'θ/day',
      align: 'right',
      sortValue: c => c.thetaPerDayPct,
      render: c => (
        <span className={`font-mono text-xs tnum ${c.thetaPerDayPct > 4 ? 'text-bear' : 'text-textSecondary'}`}>
          −{c.thetaPerDayPct.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'be',
      header: 'B/E vs 1σ',
      align: 'right',
      sortValue: c => c.expectedMovePct / Math.max(c.breakevenMovePct, 0.05),
      render: c => (
        <span
          className={`font-mono text-xs tnum ${
            c.expectedMovePct >= c.breakevenMovePct ? 'text-bull' : 'text-textSecondary'
          }`}
        >
          {c.breakevenMovePct.toFixed(1)}% / {c.expectedMovePct.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'ivr',
      header: 'IVR',
      align: 'right',
      sortValue: c => c.ivRank,
      render: c => <span className="font-mono text-xs text-textSecondary tnum">{c.ivRank}</span>,
    },
    {
      key: 'spread',
      header: 'Spread',
      align: 'right',
      sortValue: c => c.spreadPct,
      render: c => <span className="font-mono text-xs text-textSecondary tnum">{c.spreadPct.toFixed(1)}%</span>,
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      sortValue: c => c.composite,
      render: c => (
        <span className={`font-mono text-sm font-bold tnum ${c.composite >= 70 ? 'holo-text' : c.composite < 52 ? 'text-bear' : 'text-textPrimary'}`}>
          {c.composite}
        </span>
      ),
    },
    {
      key: 'verdict',
      header: 'Call',
      sortValue: c => c.verdict,
      render: c => <SignalBadge tone={verdictTone[c.verdict]}>{c.verdict}</SignalBadge>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Horizon tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-0.5 border border-borderSubtle bg-panel rounded-md p-0.5">
          {HORIZONS.map(h => {
            const active = h.key === horizon;
            return (
              <button
                key={h.key}
                onClick={() => {
                  setHorizon(h.key);
                  setSelectedId(null);
                }}
                className={`relative px-3 py-1.5 rounded-[5px] font-mono text-xs whitespace-nowrap transition-colors ${
                  active ? 'text-[#0a0a0a] font-semibold holo-bg' : 'text-textSecondary font-medium hover:text-textPrimary hover:bg-white/[0.03]'
                }`}
              >
                {h.label}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">{activeHorizon.blurb}</span>
      </div>

      <MetricGrid min="170px">
        <StatCard
          label="Top of the scale"
          value={best ? `${best.strike} ${best.right} · ${best.composite}` : '--'}
          sub={best ? `${best.expiryLabel} — ${best.verdict}` : ''}
          tone={best ? verdictTone[best.verdict] : 'neutral'}
        />
        <StatCard label="Worth buying" value={buys.length} sub={`of ${contracts.length} candidates weighed`} tone="bull" />
        <StatCard label="Not worth it" value={fades.length} sub="the math or the tape says no" tone="bear" />
        <StatCard
          label="Spot"
          value={`$${snapshot.spot.toFixed(2)}`}
          sub={`${snapshot.ticker} · RSI ${Math.round(snapshot.indicators.rsi)}`}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" /> The scale
            </span>
          }
          subtitle={`${activeHorizon.label.toLowerCase()} candidates, best first`}
          flush
          className="xl:col-span-7"
        >
          <DataTable
            columns={columns}
            rows={contracts}
            rowKey={c => c.id}
            onRowClick={c => setSelectedId(c.id)}
            selectedKey={selected?.id ?? null}
            initialSort={{ key: 'score', dir: 'desc' }}
            maxHeight="520px"
          />
        </Panel>

        {selected && (
          <Panel
            title="Why it weighs what it weighs"
            subtitle={`${selected.ticker} ${selected.strike} ${selected.right} · ${selected.expiryLabel}`}
            tone={verdictTone[selected.verdict]}
            className="xl:col-span-5 xl:sticky xl:top-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className={`font-mono text-3xl font-bold tnum ${selected.composite >= 70 ? 'holo-text' : selected.composite < 52 ? 'text-bear' : 'text-textPrimary'}`}>
                  {selected.composite}
                </span>
                <SignalBadge tone={verdictTone[selected.verdict]}>{selected.verdict}</SignalBadge>
                <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
                  ${selected.mid.toFixed(2)} mid · Δ{selected.delta.toFixed(2)} · IV {selected.ivPct.toFixed(0)}%
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {selected.factors.map(f => (
                  <FactorRow key={f.key} label={f.label} weight={f.weight} score={f.score} detail={f.detail} />
                ))}
              </div>

              <div className="border-t border-borderSubtle pt-3 flex flex-col gap-2">
                <p className="text-xs leading-relaxed">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bull mr-2">Edge</span>
                  <span className="text-textSecondary">{selected.edge}</span>
                </p>
                <p className="text-xs leading-relaxed">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bear mr-2">Risk</span>
                  <span className="text-textSecondary">{selected.risk}</span>
                </p>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default ContractWeigher;
