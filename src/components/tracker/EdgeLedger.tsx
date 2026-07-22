import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Layers, AlertTriangle, ScrollText, Target, ChevronDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import {
  buildEdgeLedger,
  type EdgeLedgerView,
  type LedgerTrade,
  type StrategyStat,
  type DecayWarning,
  type DecaySeverity,
  type VolRegime,
} from '../../data/edgeledger';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import DataTable, { type Column } from '../ui/DataTable';
import type { Tone } from '../ui/tones';

const fmtPct = (v: number, signed = true): string => {
  const s = v < 0 ? '−' : signed ? '+' : '';
  return `${s}${Math.abs(v).toFixed(1)}%`;
};
const fmtR = (v: number): string => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}R`;

const rTone = (r: number): Tone => (r >= 0.15 ? 'bull' : r <= -0.05 ? 'bear' : 'neutral');
const regimeLabel = (r: VolRegime): string => (r === 'HIGH-VOL' ? 'high-vol' : r.toLowerCase());

const severityTone: Record<DecaySeverity, Tone> = {
  SOFTENING: 'warn',
  DECAYING: 'bear',
};

/** Diverging expectancy meter — green right (positive R), red left (negative R). */
const ExpectancyBar = ({ r, maxAbs }: { r: number; maxAbs: number }) => {
  const halfW = Math.min(50, (Math.abs(r) / (maxAbs || 1)) * 50);
  const pos = r >= 0;
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" aria-hidden />
      <span
        className={`absolute top-0 bottom-0 rounded-full ${pos ? 'bg-bull/80' : 'bg-bear/80'}`}
        style={pos ? { left: '50%', width: `${halfW}%` } : { left: `${50 - halfW}%`, width: `${halfW}%` }}
      />
    </div>
  );
};

/** One setup's expectancy line — count, win rate, R, and the regimes it lives/dies in. */
const StrategyRow = ({ st, maxAbs }: { st: StrategyStat; maxAbs: number }) => {
  const tone = rTone(st.avgR);
  return (
    <div className="px-3.5 py-2.5 grid grid-cols-[1fr_88px] items-center gap-3">
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[12px] font-semibold text-textPrimary truncate">{st.setup}</span>
          <span className="font-mono text-[10px] text-textMuted tnum shrink-0 ml-2">
            {st.count} tr · {st.winRate.toFixed(0)}% W · PF {st.profitFactor.toFixed(2)}
          </span>
        </div>
        <ExpectancyBar r={st.avgR} maxAbs={maxAbs} />
        <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider">
          <span className="text-bull">▲ {regimeLabel(st.bestRegime)}</span>
          <span className="text-textMuted">·</span>
          <span className="text-bear">▼ {regimeLabel(st.worstRegime)}</span>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className={`font-mono text-lg font-bold tnum ${tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
          {fmtR(st.avgR)}
        </span>
        <span className="font-mono text-[9px] text-textMuted uppercase tracking-wider">{fmtPct(st.expectancyPct)}/tr</span>
      </div>
    </div>
  );
};

/** A micro label / value stack used in the selected-trade dossier. */
const Field = ({ label, children, tone }: { label: string; children: ReactNode; tone?: Tone }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">{label}</div>
    <div className={`mt-0.5 text-[12px] leading-snug ${tone === 'bull' ? 'text-bull' : tone === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
      {children}
    </div>
  </div>
);

/** Full review of one closed trade — thesis through better-contract counterfactual. */
const TradeDossier = ({ t }: { t: LedgerTrade }) => {
  const win = t.outcome === 'WIN';
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-bold text-textPrimary tracking-tight">{t.contract}</span>
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-wider">{t.setup}</span>
        <SignalBadge tone={win ? 'bull' : 'bear'} dot className="ml-auto">
          {t.outcome} {fmtR(t.rMultiple)}
        </SignalBadge>
      </div>

      <Field label="Thesis">{t.thesis}</Field>
      <Field label="Entry conditions">{t.entryConditions}</Field>

      <div className="grid grid-cols-3 gap-2">
        <div className="inst-surface rounded px-2.5 py-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Planned</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold text-textPrimary tnum">${t.plannedEntry.toFixed(2)}</div>
        </div>
        <div className="inst-surface rounded px-2.5 py-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Actual fill</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold text-textPrimary tnum">${t.actualFill.toFixed(2)}</div>
        </div>
        <div className="inst-surface rounded px-2.5 py-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Slippage</div>
          <div className={`mt-0.5 font-mono text-[13px] font-semibold tnum ${t.slippagePct > 0 ? 'text-bear' : 'text-bull'}`}>
            {fmtPct(t.slippagePct)}
          </div>
        </div>
      </div>

      <Field label="Entry-time state">{t.entryState}</Field>

      <div className="grid grid-cols-4 gap-2">
        {[
          { k: 'MFE', v: fmtPct(t.mfePct), cls: 'text-bull' },
          { k: 'MAE', v: fmtPct(t.maePct), cls: 'text-bear' },
          { k: 'Exit', v: fmtPct(t.exitPct), cls: win ? 'text-bull' : 'text-bear' },
          { k: 'Capture', v: `${Math.round(Math.max(0, Math.min(1, t.captureRatio)) * 100)}%`, cls: 'text-textPrimary' },
        ].map(x => (
          <div key={x.k} className="text-center">
            <div className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">{x.k}</div>
            <div className={`mt-0.5 font-mono text-[13px] font-semibold tnum ${x.cls}`}>{x.v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="text-textSecondary uppercase tracking-wider">Exit quality</span>
        <span className="text-textPrimary">{t.exitQuality} · {regimeLabel(t.volRegime)} regime</span>
      </div>

      <Field label={win ? 'Why it won' : 'Why it lost'} tone={win ? 'bull' : 'bear'}>
        {t.reason}
      </Field>
      <Field label="Better contract">
        <span className="text-textSecondary">{t.counterfactual}</span>
      </Field>
    </div>
  );
};

const EdgeLedger = () => {
  const { marketData } = useMarketData();
  const view = useMemo<EdgeLedgerView | null>(() => (marketData ? buildEdgeLedger(marketData) : null), [marketData]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const selected = useMemo(() => {
    if (!view) return null;
    return view.trades.find(t => t.id === selectedId) ?? view.trades[0];
  }, [view, selectedId]);

  const columns = useMemo<Column<LedgerTrade>[]>(
    () => [
      {
        key: 'trade',
        header: 'Trade',
        render: t => (
          <span className="flex flex-col">
            <span className="font-semibold text-textPrimary">{t.contract}</span>
            <span className="text-[10px] text-textMuted">{t.setup}</span>
          </span>
        ),
      },
      {
        key: 'regime',
        header: 'Regime',
        sortValue: t => ['COMPRESSED', 'NORMAL', 'ELEVATED', 'HIGH-VOL'].indexOf(t.volRegime),
        render: t => <span className="text-textSecondary">{regimeLabel(t.volRegime)}</span>,
      },
      {
        key: 'mfe',
        header: 'MFE',
        align: 'right',
        sortValue: t => t.mfePct,
        render: t => <span className="text-textSecondary tnum">{fmtPct(t.mfePct)}</span>,
      },
      {
        key: 'mae',
        header: 'MAE',
        align: 'right',
        sortValue: t => t.maePct,
        render: t => <span className="text-bear/80 tnum">{fmtPct(t.maePct)}</span>,
      },
      {
        key: 'exit',
        header: 'P/L',
        align: 'right',
        sortValue: t => t.exitPct,
        render: t => <span className={`tnum ${t.exitPct >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtPct(t.exitPct)}</span>,
      },
      {
        key: 'r',
        header: 'R',
        align: 'right',
        sortValue: t => t.rMultiple,
        render: t => <span className={`tnum ${t.rMultiple >= 0 ? 'text-bull' : 'text-bear'}`}>{fmtR(t.rMultiple)}</span>,
      },
      {
        key: 'result',
        header: 'Result',
        align: 'right',
        sortValue: t => t.rMultiple,
        render: t => <SignalBadge tone={t.outcome === 'WIN' ? 'bull' : 'bear'}>{t.outcome}</SignalBadge>,
      },
    ],
    []
  );

  if (!view || !selected) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Reconstructing the edge ledger…</span>
      </Panel>
    );
  }

  const expTone: Tone = view.overallExpectancy >= 0.15 ? 'bull' : view.overallExpectancy <= -0.05 ? 'bear' : 'neutral';
  const maxAbsR = Math.max(...view.strategies.map(s => Math.abs(s.avgR)), 0.1);

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Expectancy · per trade"
          value={fmtR(view.overallExpectancy)}
          sub={`${fmtPct(view.overallExpectancyPct)} avg · ${view.tradeCount} closed`}
          tone={expTone}
          emphasis
        />
        <StatCard
          label="Win rate"
          value={`${view.winRate.toFixed(0)}%`}
          sub={`profit factor ${view.profitFactor.toFixed(2)}`}
          tone={view.profitFactor >= 1.3 ? 'bull' : view.profitFactor >= 1 ? 'warn' : 'bear'}
        />
        <StatCard
          label="Best strategy"
          value={view.bestStrategy.setup}
          sub={`${fmtR(view.bestStrategy.avgR)} · ${view.bestStrategy.winRate.toFixed(0)}% win`}
          tone={view.bestStrategy.avgR >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Worst strategy"
          value={view.worstStrategy.setup}
          sub={`${fmtR(view.worstStrategy.avgR)} · ${view.worstStrategy.winRate.toFixed(0)}% win`}
          tone={view.worstStrategy.avgR >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Decay flags"
          value={`${view.decayFlagCount}`}
          sub="regime edge-decay warnings"
          tone={view.decayFlagCount >= 2 ? 'warn' : view.decayFlagCount === 1 ? 'neutral' : 'bull'}
        />
      </MetricGrid>

      <Panel tone={expTone} bodyClassName="py-3.5">
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${expTone === 'bear' ? 'text-bear' : 'holo-text'}`}>
            Ledger read
          </span>
          {view.headline}
        </p>
      </Panel>

      {/* Primary — a clean table of the existing closed-trade entries */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Per-trade ledger */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5" /> Closed-trade ledger
            </span>
          }
          subtitle="select a trade to review the full thesis-to-exit dossier"
          flush
          className="xl:col-span-7"
        >
          <DataTable
            columns={columns}
            rows={view.trades}
            rowKey={t => t.id}
            onRowClick={t => setSelectedId(t.id)}
            selectedKey={selected.id}
            maxHeight="520px"
          />
        </Panel>

        {/* Selected trade dossier */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Trade dossier
            </span>
          }
          subtitle="how the trade should be reviewed"
          className="xl:col-span-5"
        >
          <TradeDossier t={selected} />
        </Panel>
      </div>

      {/* Secondary — expectancy & edge-decay, collapsed so the ledger table stays primary */}
      <div className="flex flex-col gap-4">
        <button
          onClick={() => setShowAnalytics(s => !s)}
          aria-expanded={showAnalytics}
          className="inst-surface rounded-md px-3.5 h-10 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary hover:bg-white/[0.02] transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          Expectancy &amp; edge-decay
          <span className="font-mono text-[11px] font-normal normal-case tracking-wider text-textSecondary">
            {view.decayFlagCount} decay {view.decayFlagCount === 1 ? 'flag' : 'flags'}
          </span>
          <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
        </button>

        {showAnalytics && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start animate-view-in">
            {/* Expectancy by setup */}
            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Expectancy by strategy
                </span>
              }
              subtitle="what each setup actually pays — and where it lives or dies"
              flush
              className="xl:col-span-7"
            >
              <div className="flex flex-col divide-y divide-borderSubtle">
                {view.strategies.map(st => (
                  <StrategyRow key={st.setup} st={st} maxAbs={maxAbsR} />
                ))}
              </div>
              <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed">
                Expectancy is average P/L per trade in R — a full stop is −1R. ▲ marks the vol regime a setup pays best in, ▼ where
                it has bled the most.
              </p>
            </Panel>

            {/* Edge-decay warnings */}
            <Panel
              title={
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Edge-decay warnings
                </span>
              }
              subtitle="setups that only pay in the tape they were built for"
              className="xl:col-span-5"
              tone={view.decayFlagCount >= 2 ? 'warn' : 'neutral'}
            >
              {view.decayWarnings.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center gap-2 text-center">
                  <Target className="w-5 h-5 text-bull" />
                  <span className="font-mono text-[11px] text-textSecondary uppercase tracking-wider">No edge leaking across regimes</span>
                  <span className="text-[11px] text-textMuted max-w-[240px] leading-relaxed">
                    Every setup is holding expectancy wherever the tape has put it.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {view.decayWarnings.map((w: DecayWarning) => (
                    <div key={w.setup} className="border-l-2 border-borderSubtle pl-3 py-0.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-textPrimary">{w.setup}</span>
                        <SignalBadge tone={severityTone[w.severity]} dot className="ml-auto">
                          {w.severity}
                        </SignalBadge>
                      </div>
                      <p className="text-[11px] text-textSecondary leading-relaxed">{w.message}</p>
                      <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] tnum">
                        <span className="text-bull">{regimeLabel(w.strongRegime)} {fmtR(w.strongExpectancy)}</span>
                        <span className="text-textMuted">→</span>
                        <span className="text-bear">{regimeLabel(w.weakRegime)} {fmtR(w.weakExpectancy)}</span>
                        <span className="text-textMuted ml-auto">−{w.gap.toFixed(2)}R</span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-textSecondary leading-relaxed border-t border-borderSubtle pt-2.5">{view.note}</p>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond the P/L screen</span>
          A P/L blotter tells you what you made; the edge ledger tells you why, and whether it still works. It reconstructs each
          closed trade the way a review should — thesis, entry conditions, actual fill, the market state you took it in, the max
          favorable and adverse excursion, and the better contract you could have held — then rolls that into expectancy by setup
          and edge-decay warnings, the pattern where a good setup keeps getting run in the one regime it stopped paying in.{' '}
          {view.sampleNote}
        </p>
      </Panel>
    </>
  );
};

export default EdgeLedger;
