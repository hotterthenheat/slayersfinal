import { useMemo } from 'react';
import { Zap, GitBranch, Layers } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildFractureView } from '../../core/fracture';
import { SPOT } from '../../components/gex/palette';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import SpotRule from '../../components/ui/SpotRule';
import type { AbsorptionRegime, ForcedFlowLevel, MoveDecomposition } from '../../types/fracture';
import type { Tone } from '../../components/ui/tones';

const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(0)}M`;
  return `${s}$${(a / 1e3).toFixed(0)}K`;
};

const regimeTone: Record<AbsorptionRegime, Tone> = {
  ABSORBED: 'neutral',
  PRESSURE: 'select',
  UNSTABLE: 'warn',
  NONLINEAR: 'bear',
};

// Forced participants — one color each, stable across every view
const PARTS: { key: keyof ForcedFlowLevel; label: string; color: string }[] = [
  { key: 'dealerHedge', label: 'Dealer', color: '#C7D3E8' },
  { key: 'volControl', label: 'Vol-control', color: '#7DD3FC' },
  { key: 'cta', label: 'CTA', color: '#FF9500' },
  { key: 'letf', label: 'LETF', color: '#EA00FF' },
  { key: 'margin', label: 'Margin', color: '#FF3B30' },
];

const DECOMP: { key: keyof MoveDecomposition; label: string; color: string }[] = [
  { key: 'informational', label: 'Information', color: '#7DD3FC' },
  { key: 'dealerHedging', label: 'Dealer hedge', color: '#C7D3E8' },
  { key: 'systematic', label: 'Systematic', color: '#FF9500' },
  { key: 'shortCovering', label: 'Short cover', color: '#7fe7c4' },
  { key: 'passive', label: 'Passive', color: '#a1a1aa' },
  { key: 'liquidation', label: 'Liquidation', color: '#FF3B30' },
  { key: 'unexplained', label: 'Noise', color: '#3f3f46' },
];

/** One row of the forced-flow balance sheet. */
const FlowRow = ({ level, maxForced, maxLatent }: { level: ForcedFlowLevel; maxForced: number; maxLatent: number }) => {
  const absPct = Math.min(150, level.absorption * 100);
  return (
    <div className="px-4 py-2 grid grid-cols-[76px_1fr_120px_92px] items-center gap-3">
      <span className="font-mono text-xs font-semibold text-textPrimary tnum">${level.price.toFixed(2)}</span>
      {/* forced-flow stacked bar */}
      <span className="flex h-3 rounded-sm overflow-hidden bg-white/[0.04]" title={`Forced ${fmtUsd(level.totalForced)}`}>
        {PARTS.map(p => {
          const v = Math.abs(level[p.key] as number);
          const w = (v / maxForced) * 100;
          return w > 0.4 ? <span key={p.key} style={{ width: `${w}%`, background: p.color }} /> : null;
        })}
      </span>
      {/* latent vs absorption */}
      <span className="flex flex-col gap-0.5">
        <span className="relative h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <span
            className={`block h-full rounded-full ${
              level.absorption >= 1 ? 'bg-bear' : level.absorption >= 0.6 ? 'bg-warn' : level.absorption >= 0.25 ? 'holo-bar' : 'bg-white/25'
            }`}
            style={{ width: `${(absPct / 150) * 100}%` }}
          />
          <span className="absolute top-0 bottom-0" style={{ left: `${(100 / 150) * 100}%`, width: '1px', background: 'rgba(255,255,255,0.5)' }} />
        </span>
        <span className="font-mono text-[9px] text-textMuted tnum">
          {fmtUsd(Math.abs(level.totalForced))} vs {fmtUsd(level.latentLiquidity)} · {level.absorption.toFixed(2)}×
        </span>
      </span>
      <span className="text-right">
        <SignalBadge tone={regimeTone[level.regime]}>{level.regime}</SignalBadge>
      </span>
      <span className="sr-only">{maxLatent}</span>
    </div>
  );
};

/** Monte-Carlo cascade fan chart from the simulated paths. */
const CascadeFan = ({ paths, spot, trigger }: { paths: number[][]; spot: number; trigger: number }) => {
  const W = 640;
  const H = 220;
  const maxLen = Math.max(...paths.map(p => p.length), 2);
  const all = paths.flat();
  const lo = Math.min(...all, trigger) * 0.999;
  const hi = Math.max(...all, spot) * 1.001;
  const X = (i: number) => (i / (maxLen - 1)) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={0} x2={W} y1={Y(spot)} y2={Y(spot)} stroke={SPOT} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 3" />
      <line x1={0} x2={W} y1={Y(trigger)} y2={Y(trigger)} stroke="#FF3B30" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 3" />
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.map((v, j) => `${j === 0 ? 'M' : 'L'}${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}
          fill="none"
          stroke={p[p.length - 1] < trigger ? '#FF3B30' : '#C7D3E8'}
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}
      <text x={4} y={Y(spot) - 4} fontSize={9} fill={SPOT} fillOpacity={0.6} fontFamily="monospace">
        spot ${spot.toFixed(0)}
      </text>
      <text x={4} y={Y(trigger) + 11} fontSize={9} fill="#FF3B30" fontFamily="monospace">
        trigger ${trigger.toFixed(0)}
      </text>
    </svg>
  );
};

const Fracture = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildFractureView(marketData) : null), [marketData]);

  if (!view || !marketData) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Modeling forced flow…</span>
      </Panel>
    );
  }

  const maxForced = Math.max(...view.levels.map(l => Math.abs(l.totalForced)), 1);
  const maxLatent = Math.max(...view.levels.map(l => l.latentLiquidity), 1);
  const headTone: Tone = view.fractureSide === 'DOWN' ? 'bear' : view.fractureSide === 'UP' ? 'bull' : 'neutral';
  const crit = view.criticality;
  const critTone: Tone = crit.label === 'UNSTABLE' ? 'bear' : crit.label === 'CRITICAL' ? 'warn' : crit.label === 'REACTIVE' ? 'select' : 'bull';

  // spot sits between the below/above halves of the ladder
  const aboveCount = view.levels.filter(l => l.distPct > 0).length;

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Fracture line"
          value={view.fractureLine ? `$${view.fractureLine.toFixed(2)}` : 'none'}
          sub={view.fractureLine ? `${view.fractureSide} · ${view.fractureDistPct! >= 0 ? '+' : ''}${view.fractureDistPct!.toFixed(1)}% away` : 'absorbed in range'}
          tone={headTone}
        />
        <StatCard label="Instability" value={`${view.instability}`} sub="forced flow × feedback ÷ liquidity" tone={view.instability >= 66 ? 'bear' : view.instability >= 40 ? 'warn' : 'bull'} />
        <StatCard label="Cascade if tested" value={`${view.cascade.cascadeProbPct}%`} sub={`terminus $${view.cascade.medianTerminus.toFixed(2)} if the line breaks`} tone={view.cascade.cascadeProbPct >= 55 ? 'bear' : view.cascade.cascadeProbPct >= 30 ? 'warn' : 'bull'} />
        <StatCard label="Criticality" value={crit.label} sub={`branching ${crit.branchingRatio.toFixed(2)} · ${crit.endogeneityPct}% endogenous`} tone={critTone} />
        <StatCard label="Forced now" value={fmtUsd(view.forcedNowUsd)} sub="at the nearest level" tone={view.forcedNowUsd < 0 ? 'bear' : 'bull'} />
      </MetricGrid>

      {/* Headline read */}
      <Panel tone={headTone} bodyClassName="py-3.5" emphasis>
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${headTone === 'bear' ? 'text-bear' : headTone === 'bull' ? 'text-bull' : 'text-textSecondary'}`}>
            The read
          </span>
          {view.headline}
        </p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Forced-flow balance sheet */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Forced-flow balance sheet
            </span>
          }
          subtitle="who must transact at each level, vs the liquidity to absorb it"
          flush
          className="xl:col-span-7"
          actions={
            <span className="hidden sm:flex items-center gap-2">
              {PARTS.map(p => (
                <span key={p.key} className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-textMuted">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} /> {p.label}
                </span>
              ))}
            </span>
          }
        >
          <div className="flex flex-col">
            {view.levels.map((level, i) => (
              <div key={level.price}>
                <FlowRow level={level} maxForced={maxForced} maxLatent={maxLatent} />
                {i === aboveCount - 1 && (
                  <div className="px-4 py-1">
                    <SpotRule ticker={view.ticker} price={view.spot} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* Cascade simulator */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Reflexive cascade
            </span>
          }
          subtitle={`${view.cascade.cascadeProbPct}% cascade · 500 simulated feedback paths`}
          className="xl:col-span-5"
          tone={view.cascade.cascadeProbPct >= 50 ? 'bear' : 'neutral'}
        >
          <CascadeFan paths={view.cascade.paths} spot={view.spot} trigger={view.cascade.triggerPrice} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Median terminus</div>
              <div className="mt-1 font-mono text-sm font-semibold text-bear tnum">${view.cascade.medianTerminus.toFixed(2)}</div>
            </div>
            <div className="border border-borderSubtle bg-inset rounded-md px-2.5 py-2">
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Exhaustion zone</div>
              <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
                ${view.cascade.exhaustionLo.toFixed(2)}–${view.cascade.exhaustionHi.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-textMuted uppercase tracking-wider text-[10px]">Primary amplifier</span>
              <span className="text-textPrimary">{view.cascade.primaryAmplifier}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-textMuted uppercase tracking-wider text-[10px]">Secondary</span>
              <span className="text-textSecondary">{view.cascade.secondaryAmplifier}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 items-start">
        {/* Criticality + move decomposition */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Criticality & move source
            </span>
          }
          subtitle="is the market reacting to news, or to itself?"
          tone={critTone}
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">Branching ratio</span>
                <SignalBadge tone={critTone} dot>
                  {crit.label}
                </SignalBadge>
              </div>
              <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <span
                  className={`block h-full rounded-full ${crit.branchingRatio >= 0.9 ? 'bg-bear' : crit.branchingRatio >= 0.78 ? 'bg-warn' : 'holo-bar'}`}
                  style={{ width: `${crit.branchingRatio * 100}%` }}
                />
                <span className="absolute top-0 bottom-0" style={{ left: '80%', width: '1px', background: 'rgba(255,255,255,0.4)' }} />
              </div>
              <p className="mt-2 text-[11px] text-textSecondary leading-relaxed">{crit.note}</p>
            </div>

            <div className="border-t border-borderSubtle pt-3">
              <div className="font-mono text-[10px] uppercase tracking-widest text-textMuted mb-2">
                What's driving the current move
              </div>
              <div className="flex h-3 rounded-sm overflow-hidden bg-white/[0.04]">
                {DECOMP.map(d => (
                  <span key={d.key} style={{ width: `${view.decomposition[d.key]}%`, background: d.color }} title={`${d.label} ${view.decomposition[d.key]}%`} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                {DECOMP.filter(d => view.decomposition[d.key] >= 4).map(d => (
                  <span key={d.key} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-textSecondary">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: d.color }} />
                    {d.label} <span className="text-textMuted tnum ml-auto">{view.decomposition[d.key]}%</span>
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-textMuted leading-relaxed">
                {view.decomposition.dealerHedging + view.decomposition.systematic + view.decomposition.liquidation >= 55
                  ? 'Mechanically driven — this move can reverse hard once the forced flow behind it is done.'
                  : 'Information leads — the move has a fundamental driver and is more likely to persist.'}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond GEX</span>
          GEX estimates which way dealers must hedge. Fracture estimates whether the market can absorb that hedging — it combines
          the forced flow from every mechanical participant, the liquidity actually available to take the other side, and how close
          activity is to self-sustaining, then simulates the feedback loop. The fracture line is where that balance breaks. Modeled
          from the live chain and price path; swap in real dealer, flow and depth feeds behind the same contract.
        </p>
      </Panel>
    </>
  );
};

export default Fracture;
