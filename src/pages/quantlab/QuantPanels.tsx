import { Fragment, useMemo, type ReactNode } from 'react';
import {
  ComposedChart,
  LineChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import SurfaceTile from '../../components/experience/SurfaceTile';
import MonteCarloPanel from '../proveit/MonteCarloPanel';
import AlertRow from '../../components/ui/AlertRow';
import { RAMP_CSS, type RampKind } from '../../components/experience/surfaceRamps';
import type { MonteCarloResult } from '../../core/quant';
import type { MarketSnapshot } from '../../types/market';
import type { RndData, TermStructureData } from '../../types/gex';
import type { CorrelationView, RegimePanel, Signal, KeyMetrics } from '../../data/quantlab';

/* Shared chart chrome */
const GRID = 'rgba(255,255,255,0.05)';
const AXIS = '#6b6b6b';
const BULL = '#30D158';
const BEAR = '#FF3B30';
const SELECT = '#E4E8F4';
const FLIP = '#7DD3FC';
const KING = '#EA00FF';
const WARN = '#FF9500';

const axisTick = { fill: AXIS, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' };

// ---- panel shell (numbered header + meta chips, like the reference) -----------------
export const LabCard = ({
  id,
  num,
  title,
  meta,
  colorbar,
  children,
  bodyClassName = '',
  className = '',
}: {
  id?: string;
  num: number;
  title: string;
  meta?: ReactNode;
  colorbar?: { css: string; top: string; bottom: string };
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) => (
  <section
    id={id}
    className={`flex flex-col rounded-lg border border-borderSubtle bg-panel/80 overflow-hidden ${className}`}
  >
    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-borderSubtle/70">
      <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-textSecondary truncate">
        <span className="text-textMuted">{num}. </span>
        {title}
      </h3>
      {meta && <div className="flex items-center gap-1.5 shrink-0">{meta}</div>}
    </header>
    <div className={`relative flex-grow min-h-0 ${bodyClassName}`}>
      {children}
      {colorbar && (
        <div className="pointer-events-none absolute top-3 right-2 bottom-3 flex flex-col items-center gap-1">
          <span className="font-mono text-[8px] text-textMuted">{colorbar.top}</span>
          <div className="w-2 flex-grow rounded-sm border border-borderSubtle/60" style={{ background: colorbar.css }} />
          <span className="font-mono text-[8px] text-textMuted">{colorbar.bottom}</span>
        </div>
      )}
    </div>
  </section>
);

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[9px] uppercase tracking-wide text-textMuted border border-borderSubtle rounded px-1.5 py-0.5">
    {children}
  </span>
);

// ---- 3D surface panel ---------------------------------------------------------------
export const SurfacePanel = ({
  id,
  num,
  title,
  meta,
  grid,
  ramp,
  colorbar,
}: {
  id?: string;
  num: number;
  title: string;
  meta: ReactNode;
  grid: number[][];
  ramp: RampKind;
  colorbar: { top: string; bottom: string };
}) => (
  <LabCard id={id} num={num} title={title} meta={meta} colorbar={{ css: RAMP_CSS[ramp], ...colorbar }} bodyClassName="h-[248px]">
    <SurfaceTile grid={grid} ramp={ramp} />
  </LabCard>
);

// ---- Monte Carlo --------------------------------------------------------------------
export const MonteCarloLabPanel = ({ id, num, mc, spot }: { id?: string; num: number; mc: MonteCarloResult; spot: number }) => (
  <LabCard
    id={id}
    num={num}
    title="Monte Carlo Simulation"
    meta={<><Chip>GBM</Chip><Chip>{mc.runs.toLocaleString()} paths</Chip></>}
    bodyClassName="p-2"
  >
    <div className="h-[210px]">
      <MonteCarloPanel mc={mc} spot={spot} height={210} />
    </div>
    <div className="grid grid-cols-4 gap-x-2 px-1 pt-1.5 border-t border-borderSubtle/60">
      {[
        ['P(up)', `${mc.stats.probUpPct}%`],
        ['Exp Ret', `${mc.stats.expReturnPct >= 0 ? '+' : ''}${mc.stats.expReturnPct.toFixed(1)}%`],
        ['95% VaR', `${mc.stats.var95Pct.toFixed(1)}%`],
        ['Range', `${mc.stats.rangeLow.toFixed(0)}–${mc.stats.rangeHigh.toFixed(0)}`],
      ].map(([k, v]) => (
        <div key={k}>
          <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted">{k}</div>
          <div className="font-mono text-[11px] text-textPrimary tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  </LabCard>
);

// ---- Risk-neutral distribution (density + CDF) --------------------------------------
export const RndPanel = ({ id, num, rnd, spot }: { id?: string; num: number; rnd: RndData; spot: number }) => {
  const data = useMemo(() => {
    const total = rnd.density.reduce((a, d) => a + d, 0) || 1;
    let cum = 0;
    return rnd.prices.map((p, i) => {
      cum += rnd.density[i] / total;
      return { price: p, density: rnd.density[i], cdf: Number((cum * 100).toFixed(2)) };
    });
  }, [rnd]);

  const cdfAt = (level: number) => {
    const row = data.find(d => d.price >= level) ?? data[data.length - 1];
    return row.cdf;
  };
  const dn = rnd.forward - rnd.stats.expMoveAbs;
  const up = rnd.forward + rnd.stats.expMoveAbs;

  return (
    <LabCard
      id={id}
      num={num}
      title="Risk-Neutral Distribution"
      meta={<><Chip>30DTE</Chip><Chip>RN</Chip></>}
      bodyClassName="p-2 flex flex-col"
    >
      <div className="h-[188px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 2, left: -8 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="price" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
            <YAxis yAxisId="d" tick={axisTick} tickLine={false} axisLine={false} width={22} />
            <YAxis yAxisId="c" orientation="right" domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} width={24} />
            <ReferenceLine yAxisId="d" x={spot} stroke={FLIP} strokeDasharray="3 3" strokeWidth={1} />
            <Area yAxisId="d" type="monotone" dataKey="density" stroke={SELECT} strokeWidth={1.4} fill={SELECT} fillOpacity={0.12} isAnimationActive={false} />
            <Line yAxisId="c" type="monotone" dataKey="cdf" stroke={KING} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-x-2 pt-1.5 border-t border-borderSubtle/60">
        {[
          [`P(<${dn.toFixed(0)})`, `${cdfAt(dn).toFixed(1)}%`],
          [`P(>${up.toFixed(0)})`, `${(100 - cdfAt(up)).toFixed(1)}%`],
          ['Exp Move', `±${rnd.stats.expMovePct.toFixed(1)}%`],
          ['Skew', rnd.stats.skew.toFixed(2)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted truncate">{k}</div>
            <div className="font-mono text-[11px] text-textPrimary tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </LabCard>
  );
};

// ---- Dealer hedging by strike -------------------------------------------------------
export const HedgingPanel = ({
  id,
  num,
  snapshot,
  squeezeScore,
}: {
  id?: string;
  num: number;
  snapshot: MarketSnapshot;
  squeezeScore: number;
}) => {
  const data = useMemo(
    () =>
      [...snapshot.chain]
        .sort((a, b) => a.strike - b.strike)
        .map(n => ({ strike: n.strike, flow: Number((n.netGex / 1e6).toFixed(2)) })),
    [snapshot.chain]
  );
  const totalHedge = snapshot.chain.reduce((a, n) => a + Math.abs(n.netGex), 0);
  const netFlow = snapshot.chain.reduce((a, n) => a + n.netGex, 0);

  return (
    <LabCard
      id={id}
      num={num}
      title="Dealer Hedging Simulator"
      meta={<><Chip>Net</Chip><Chip>$M / strike</Chip></>}
      bodyClassName="p-2 flex flex-col"
    >
      <div className="h-[188px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, bottom: 2, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="strike" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}B` : `${v}`)}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
            <ReferenceLine x={snapshot.plan.flipZone} stroke={FLIP} strokeDasharray="3 3" strokeWidth={1} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a3a3a3' }}
            />
            <Bar dataKey="flow" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.flow >= 0 ? BULL : BEAR} fillOpacity={0.82} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-4 gap-x-2 pt-1.5 border-t border-borderSubtle/60">
        {[
          ['Total Hedge', `$${(totalHedge / 1e9).toFixed(1)}B`],
          ['Net Flow', `${netFlow >= 0 ? '+' : ''}${(netFlow / 1e9).toFixed(2)}B`],
          ['Gamma Flip', snapshot.plan.flipZone.toFixed(0)],
          ['Squeeze', `${squeezeScore} / 100`],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted truncate">{k}</div>
            <div className="font-mono text-[11px] text-textPrimary tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </LabCard>
  );
};

// ---- Market regime detection --------------------------------------------------------
const REGIME_COLOR: Record<string, string> = { 'RISK-ON': BULL, NEUTRAL: '#6b6b6b', 'RISK-OFF': BEAR };

export const RegimeDetectionPanel = ({ id, num, regime }: { id?: string; num: number; regime: RegimePanel }) => {
  const series = regime.series.map((p, i) => ({ ...p, i }));
  return (
    <LabCard
      id={id}
      num={num}
      title="Market Regime Detection"
      meta={<Chip>HMM</Chip>}
      bodyClassName="p-2 flex flex-col"
    >
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="t" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} interval={8} />
            <YAxis domain={[-1, 1]} tick={axisTick} tickLine={false} axisLine={false} width={24} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Line type="monotone" dataKey="trend" stroke={BULL} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="vol" stroke={WARN} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="risk" stroke={FLIP} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="liquidity" stroke={KING} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="composite" stroke={SELECT} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* regime band strip */}
      <div className="mt-1.5 flex h-2 rounded-sm overflow-hidden">
        {regime.series.map((p, i) => {
          const r = p.composite > 0.18 ? 'RISK-ON' : p.composite < -0.18 ? 'RISK-OFF' : 'NEUTRAL';
          return <span key={i} className="flex-grow" style={{ background: REGIME_COLOR[r], opacity: 0.55 }} />;
        })}
      </div>
      <div className="grid grid-cols-4 gap-x-2 pt-1.5 mt-1.5 border-t border-borderSubtle/60">
        {[
          ['Regime', regime.regime],
          ['Confidence', `${regime.confidencePct}%`],
          ['Duration', regime.durationLabel],
          ['Next', `${regime.nextRegime} ${regime.nextProbPct}%`],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted truncate">{k}</div>
            <div className="font-mono text-[10.5px] text-textPrimary truncate">{v}</div>
          </div>
        ))}
      </div>
    </LabCard>
  );
};

// ---- Correlation / PCA --------------------------------------------------------------
function corrColor(v: number): string {
  // diverging: blue (low/neg) → dark (mid) → red (high)
  if (v >= 0) return `rgba(220,60,50,${0.12 + v * 0.8})`;
  return `rgba(56,110,230,${0.12 + Math.abs(v) * 0.8})`;
}

export const CorrelationPanel = ({ id, num, corr }: { id?: string; num: number; corr: CorrelationView }) => {
  const n = corr.tickers.length;
  return (
    <LabCard id={id} num={num} title="Correlation / PCA Explorer" meta={<Chip>{n} names</Chip>} bodyClassName="p-2">
      <div className="flex gap-3 h-full">
        {/* matrix */}
        <div className="shrink-0">
          <div className="grid" style={{ gridTemplateColumns: `18px repeat(${n}, 1fr)`, gap: 1 }}>
            <span />
            {corr.tickers.map(t => (
              <span key={t} className="font-mono text-[7px] text-textMuted text-center rotate-0 truncate">{t}</span>
            ))}
            {corr.matrix.map((row, i) => (
              <Fragment key={`r${i}`}>
                <span className="font-mono text-[7px] text-textMuted flex items-center">{corr.tickers[i]}</span>
                {row.map((v, j) => (
                  <span
                    key={`${i}-${j}`}
                    title={`${corr.tickers[i]}·${corr.tickers[j]} ${v.toFixed(2)}`}
                    className="aspect-square rounded-[1px]"
                    style={{ background: corrColor(v), minWidth: 14 }}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        {/* PCA */}
        <div className="flex-grow min-w-0 border-l border-borderSubtle/60 pl-3">
          <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted mb-1">Explained variance</div>
          {corr.pca.map(c => (
            <div key={c.name} className="flex items-center gap-1.5 mb-1">
              <span className="font-mono text-[9px] text-textSecondary w-6">{c.name}</span>
              <div className="flex-grow h-1.5 bg-inset rounded-sm overflow-hidden">
                <div className="h-full bg-select/70" style={{ width: `${c.variancePct}%` }} />
              </div>
              <span className="font-mono text-[9px] text-textPrimary tabular-nums w-9 text-right">{c.variancePct}%</span>
            </div>
          ))}
          <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted mt-2 mb-1">PC1 loadings</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {corr.loadings.map(l => (
              <div key={l.ticker} className="flex items-center justify-between">
                <span className="font-mono text-[8.5px] text-textSecondary">{l.ticker}</span>
                <span className="font-mono text-[8.5px] text-textPrimary tabular-nums">{l.pc1.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LabCard>
  );
};

// ---- Volatility term structure ------------------------------------------------------
export const TermStructurePanel = ({ id, num, term }: { id?: string; num: number; term: TermStructureData }) => {
  const data = useMemo(
    () =>
      term.current.map((p, i) => ({
        dte: p.dte,
        today: p.iv,
        d1: term.dayAgo[i]?.iv,
        w1: term.weekAgo[i]?.iv,
        m1: term.monthAgo[i]?.iv,
      })),
    [term]
  );
  return (
    <LabCard
      id={id}
      num={num}
      title="Volatility Term Structure"
      meta={<><Chip>ATM</Chip><Chip>IV %</Chip></>}
      bodyClassName="p-2 flex flex-col"
    >
      <div className="flex-grow min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis dataKey="dte" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={26} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 6, fontSize: 11 }}
              labelStyle={{ color: '#a3a3a3' }}
              labelFormatter={(v) => `${v} DTE`}
            />
            <Line type="monotone" dataKey="today" name="Today" stroke={SELECT} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="d1" name="1 Day" stroke={FLIP} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="w1" name="1 Week" stroke={BULL} strokeWidth={1.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="m1" name="1 Month" stroke={KING} strokeWidth={1.1} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 pt-1.5 mt-1 border-t border-borderSubtle/60">
        {[['Today', SELECT], ['1D', FLIP], ['1W', BULL], ['1M', KING]].map(([label, c]) => (
          <span key={label} className="flex items-center gap-1 font-mono text-[9px] text-textMuted">
            <span className="w-2.5 h-[2px] rounded-full" style={{ background: c }} />
            {label}
          </span>
        ))}
      </div>
    </LabCard>
  );
};

// ---- Key metrics summary ------------------------------------------------------------
const fmtExposure = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
};

export const KeyMetricsPanel = ({ id, num, m }: { id?: string; num: number; m: KeyMetrics }) => {
  const cells: { k: string; v: string; tone?: string }[] = [
    { k: 'IV Rank', v: m.ivRank.toFixed(1) },
    { k: 'IV Percentile', v: `${m.ivPercentile.toFixed(1)}%` },
    { k: 'IV 1D Change', v: `${m.iv1dChangePct >= 0 ? '+' : ''}${m.iv1dChangePct.toFixed(1)}%`, tone: m.iv1dChangePct >= 0 ? BULL : BEAR },
    { k: 'HV (10D)', v: `${m.hv10.toFixed(2)}%` },
    { k: 'HV (30D)', v: `${m.hv30.toFixed(2)}%` },
    { k: 'Realized Vol', v: `${m.realizedVol.toFixed(2)}%` },
    { k: 'Gamma Exposure', v: `${m.gammaExposureBn >= 0 ? '' : '-'}${Math.abs(m.gammaExposureBn).toFixed(2)}B`, tone: m.gammaExposureBn >= 0 ? BULL : BEAR },
    { k: 'Vanna Exposure', v: fmtExposure(m.vannaExposure) },
    { k: 'Charm Exposure', v: fmtExposure(m.charmExposure) },
    { k: 'Dealer Position', v: m.dealerPositioning, tone: m.dealerPositioning === 'BULLISH' ? BULL : m.dealerPositioning === 'BEARISH' ? BEAR : undefined },
    { k: 'Max Pain', v: m.maxPain.toFixed(0) },
    { k: 'Put / Call Ratio', v: m.putCallRatio.toFixed(2) },
  ];
  return (
    <LabCard id={id} num={num} title="Key Metrics & Summary" bodyClassName="p-2">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {cells.map(c => (
          <div key={c.k} className="rounded border border-borderSubtle/70 bg-inset px-2.5 py-2">
            <div className="font-mono text-[8.5px] uppercase tracking-wide text-textMuted truncate">{c.k}</div>
            <div className="font-mono text-[13px] tabular-nums mt-0.5" style={{ color: c.tone ?? '#ededed' }}>{c.v}</div>
          </div>
        ))}
      </div>
    </LabCard>
  );
};

// ---- Recent alerts & signals --------------------------------------------------------
export const AlertsPanel = ({ id, num, signals }: { id?: string; num: number; signals: Signal[] }) => (
  <LabCard id={id} num={num} title="Recent Alerts & Signals" bodyClassName="overflow-y-auto">
    {signals.map((s, i) => (
      <AlertRow key={i} tone={s.tone} title={s.title} detail={s.detail} time={s.time} />
    ))}
  </LabCard>
);
