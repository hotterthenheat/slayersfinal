import { useMemo } from 'react';
import { Activity, GitCompareArrows, Layers, TrendingDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildStateDensity, type StateDensityView, type MassShift, type SkewLabel } from '../../data/statedensity';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import { BULL, BEAR } from './palette';
import SignalBadge from '../ui/SignalBadge';
import PriceThresholdOdds from './PriceThresholdOdds';
import type { Tone } from '../ui/tones';

interface StatePriceDensityProps {
  /** Optional explicit snapshot; falls back to the live market context. */
  snapshot?: MarketSnapshot;
}

const fmtK = (n: number): string => (n >= 1000 ? n.toFixed(0) : n >= 50 ? n.toFixed(n % 1 ? 1 : 0) : n.toFixed(2));
const signed = (n: number, d = 1): string => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;

// Severity ramp: green → neutral → amber → red (never through brand silver).
const skewTone: Record<SkewLabel, Tone> = {
  CALM: 'bull',
  NORMAL: 'neutral',
  ELEVATED: 'warn',
  STRESSED: 'bear',
};

/** Risk-neutral terminal density: implied vs realized, spot marker, shaded 2σ tails. */
const DensityChart = ({ view }: { view: StateDensityView }) => {
  const W = 560;
  const H = 190;
  const { density: D, realizedDensity: R, sigma2, forward, spot } = view;
  const lo = D[0].price;
  const hi = D[D.length - 1].price;
  const span = hi - lo || 1;
  const maxD = Math.max(...D.map(p => p.density), ...R.map(p => p.density)) || 1;
  const X = (p: number): number => ((p - lo) / span) * W;
  const Y = (d: number): number => H - (d / maxD) * (H - 30) - 10;

  const impLine = D.map((p, i) => `${i ? 'L' : 'M'}${X(p.price).toFixed(1)},${Y(p.density).toFixed(1)}`).join(' ');
  const impArea = `${impLine} L${X(hi).toFixed(1)},${H} L${X(lo).toFixed(1)},${H} Z`;
  const realLine = R.map((p, i) => `${i ? 'L' : 'M'}${X(p.price).toFixed(1)},${Y(p.density).toFixed(1)}`).join(' ');

  const lTail = X(sigma2[0]);
  const rTail = X(sigma2[1]);
  const sx = X(spot);
  const fx = X(forward);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      {/* shaded 2σ tails */}
      <rect x={0} y={0} width={Math.max(0, lTail)} height={H} fill="rgba(255,59,48,0.06)" />
      <rect x={rTail} y={0} width={Math.max(0, W - rTail)} height={H} fill="rgba(48,209,88,0.06)" />
      {/* implied density */}
      <path d={impArea} fill="rgba(151,136,196,0.12)" />
      <path d={impLine} fill="none" stroke="#ededed" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      {/* realized density — dotted overlay */}
      <path d={realLine} fill="none" stroke="#8f8f8f" strokeWidth={1.1} strokeDasharray="2 2.5" vectorEffect="non-scaling-stroke" />
      {/* forward marker */}
      <line x1={fx} x2={fx} y1={0} y2={H} stroke="#6b6b6b" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 3" />
      <text x={fx + 3} y={12} fontSize={8} fill="#6b6b6b" fontFamily="monospace">FWD {forward.toFixed(0)}</text>
      {/* spot marker — white, "where the market is" */}
      <line x1={sx} x2={sx} y1={0} y2={H} stroke="#ededed" strokeOpacity={0.85} strokeWidth={1.25} />
      <text x={sx + 3} y={H - 5} fontSize={8.5} fill="#ededed" fontFamily="monospace">SPOT {spot.toFixed(2)}</text>
      {/* 2σ tick labels */}
      <text x={Math.max(2, lTail - 2)} y={H - 5} fontSize={8} fill={BEAR} fontFamily="monospace" textAnchor="end">−2σ</text>
      <text x={Math.min(W - 2, rTail + 2)} y={12} fontSize={8} fill={BULL} fontFamily="monospace">+2σ</text>
    </svg>
  );
};

/** One probability-mass-shift row: P(below K) an hour ago vs now. */
const MassRow = ({ m }: { m: MassShift }) => {
  const rising = m.direction === 'RISING';
  const tone: Tone = rising ? 'bear' : 'bull';
  const from = Math.min(m.pEarlier, m.pNow);
  const width = Math.abs(m.pNow - m.pEarlier);
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[11px] text-textPrimary uppercase tracking-wider">
          P(<span className="tnum">{m.label}</span>)
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tnum text-textMuted">
            {m.pEarlier.toFixed(0)}% <span className="text-textMuted/60">→</span>{' '}
            <span className="text-textPrimary font-semibold">{m.pNow.toFixed(0)}%</span>
          </span>
          <SignalBadge tone={tone}>{signed(m.deltaPts)} pts</SignalBadge>
        </span>
      </div>
      {/* track 0–100%, ghost tick at earlier, filled shift segment, solid tick at now */}
      <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <span
          className={`absolute top-0 bottom-0 rounded-full ${rising ? 'bg-bear/70' : 'bg-bull/70'}`}
          style={{ left: `${from}%`, width: `${Math.max(width, 0.6)}%` }}
        />
        <span className="absolute top-0 bottom-0 w-px bg-white/30" style={{ left: `${m.pEarlier}%` }} aria-hidden />
        <span className="absolute top-0 bottom-0 w-px bg-white/80" style={{ left: `${m.pNow}%` }} aria-hidden />
      </div>
    </div>
  );
};

/** Forward-vol curve — the vol priced between tenors, not just to them. */
const ForwardVolChart = ({ view }: { view: StateDensityView }) => {
  const W = 520;
  const H = 150;
  const pts = view.forwardVols;
  const vols = pts.flatMap(p => [p.forwardVol, p.spotVol]);
  const vMin = Math.min(...vols) * 0.9;
  const vMax = Math.max(...vols) * 1.08;
  const vSpan = vMax - vMin || 1;
  const X = (i: number): number => 14 + (i / Math.max(1, pts.length - 1)) * (W - 28);
  const Y = (v: number): number => H - 22 - ((v - vMin) / vSpan) * (H - 44);
  const fwdLine = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.forwardVol).toFixed(1)}`).join(' ');
  const spotLine = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.spotVol).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <path d={spotLine} fill="none" stroke="#6b6b6b" strokeWidth={1.1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={fwdLine} fill="none" stroke="#ededed" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={X(i)} cy={Y(p.forwardVol)} r={2.4} fill="#ededed" />
          <text x={X(i)} y={H - 6} fontSize={8} fill="#6b6b6b" fontFamily="monospace" textAnchor="middle">{p.label}</text>
          <text x={X(i)} y={Y(p.forwardVol) - 6} fontSize={8} fill="#ededed" fontFamily="monospace" textAnchor="middle">
            {p.forwardVol.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  );
};

const StatePriceDensity = ({ snapshot }: StatePriceDensityProps) => {
  const { marketData } = useMarketData();
  const snap = snapshot ?? marketData;
  const view = useMemo(() => (snap ? buildStateDensity(snap) : null), [snap]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Reconstructing state-price density…</span>
      </Panel>
    );
  }

  const down = view.tails[0];
  const up = view.tails[1];
  const shiftTone: Tone = view.headlineShift.direction === 'RISING' ? 'bear' : 'bull';
  const vrpTone: Tone = view.vrpVolPts >= 0 ? 'bull' : 'warn';
  const leftTailTone: Tone = down.prob >= 20 ? 'bear' : down.prob >= 12 ? 'warn' : 'neutral';

  return (
    <>
      {/* Model header — Vol Lab lineage */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 border border-borderSubtle bg-panel rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-textSecondary">
          Model <span className="text-textPrimary font-semibold">SLAYER-DENSITY v0.1</span>
        </span>
        <span className="font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {view.ticker} · risk-neutral · {view.horizonDays}D horizon
        </span>
      </div>

      <MetricGrid min="170px">
        <StatCard
          label="Prob-mass drift"
          value={`${signed(view.headlineShift.deltaPts)} pts`}
          sub={`P(${view.headlineShift.label}) ${view.headlineShift.pEarlier.toFixed(0)}% → ${view.headlineShift.pNow.toFixed(0)}%`}
          tone={shiftTone}
          emphasis
        />
        <StatCard label="Expected move" value={`±${view.expMovePct.toFixed(2)}%`} sub={`±${view.expMoveAbs.toFixed(2)} · ${view.horizonDays}D`} tone="neutral" />
        <StatCard label="25Δ risk reversal" value={`${view.skewRr25.toFixed(2)} vol`} sub={`skew ${view.skewLabel.toLowerCase()}`} tone={skewTone[view.skewLabel]} />
        <StatCard label="Variance risk premium" value={`${signed(view.vrpVolPts)} vol`} sub={`IV ${view.atmIv.toFixed(1)} vs RV ${view.realizedVol.toFixed(1)}`} tone={vrpTone} />
        <StatCard label="Left tail · −5%" value={`${down.prob.toFixed(1)}%`} sub={`insure ${down.premiumPct.toFixed(2)}% of spot`} tone={leftTailTone} />
      </MetricGrid>

      <Panel tone={shiftTone} bodyClassName="py-3.5" emphasis>
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${shiftTone === 'bear' ? 'text-bear' : 'text-bull'}`}>
            Density read
          </span>
          {view.headline}
        </p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* State-price density */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> State-price density
            </span>
          }
          subtitle="risk-neutral terminal-price odds — implied vs realized"
          className="xl:col-span-7"
        >
          <DensityChart view={view} />
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] tnum text-textMuted select-none">
            <span>{view.density[0].price.toFixed(0)}</span>
            <span className="uppercase tracking-wider">terminal price · {view.horizonDays}D</span>
            <span>{view.density[view.density.length - 1].price.toFixed(0)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-textMuted">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-px bg-bull" /> implied</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-textSecondary" /> realized</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 bg-bear/20" /> 2σ tails</span>
          </div>
        </Panel>

        {/* Probability-mass migration */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <GitCompareArrows className="w-3.5 h-3.5" /> Probability-mass migration
            </span>
          }
          subtitle={`${view.earlierTime} → ${view.nowTime} · spot ${signed(view.spotDriftPct, 2)}%`}
          flush
          className="xl:col-span-5"
          tone={shiftTone}
        >
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.massShifts.map(m => (
              <MassRow key={m.strike} m={m} />
            ))}
          </div>
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed">
            {view.note}
          </p>
        </Panel>
      </div>

      {/* Price-threshold odds — read P(above)/P(below) any level off the density */}
      <PriceThresholdOdds view={view} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Forward-vol curve */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Forward-vol curve
            </span>
          }
          subtitle="vol priced between tenors — variance additivity"
          className="xl:col-span-7"
        >
          <ForwardVolChart view={view} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-textMuted">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-px bg-bull" /> forward vol</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-textSecondary" /> spot vol</span>
          </div>
        </Panel>

        {/* Skew-stress monitor */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Skew-stress monitor
            </span>
          }
          subtitle="how stretched the put wing is"
          className="xl:col-span-5"
          tone={skewTone[view.skewLabel]}
        >
          <div className="flex items-center gap-4">
            <span
              className={`font-mono text-3xl font-bold tnum ${
                view.skewLabel === 'STRESSED' ? 'text-bear' : view.skewLabel === 'ELEVATED' ? 'text-warn' : 'text-textPrimary'
              }`}
            >
              {view.skewStress}
            </span>
            <div className="flex-1">
              <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                <span
                  className={`block h-full rounded-full ${
                    view.skewLabel === 'STRESSED'
                      ? 'bg-bear'
                      : view.skewLabel === 'ELEVATED'
                        ? 'bg-warn'
                        : view.skewLabel === 'NORMAL'
                          ? 'bg-select'
                          : 'holo-bar'
                  }`}
                  style={{ width: `${view.skewStress}%` }}
                />
                {[34, 56, 78].map(t => (
                  <span key={t} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${t}%` }} aria-hidden />
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-textMuted">
                <span>Calm</span>
                <span>Normal</span>
                <span>Elevated</span>
                <span>Stressed</span>
              </div>
            </div>
            <SignalBadge tone={skewTone[view.skewLabel]} dot>
              {view.skewLabel}
            </SignalBadge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-borderSubtle">
            <div className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Put wing 25Δ</span>
              <span className="block font-mono text-[13px] font-semibold tnum text-bear">{view.putWingVol.toFixed(1)}</span>
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Call wing 25Δ</span>
              <span className="block font-mono text-[13px] font-semibold tnum text-textPrimary">{view.callWingVol.toFixed(1)}</span>
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Risk reversal</span>
              <span className="block font-mono text-[13px] font-semibold tnum text-bear">{view.skewRr25.toFixed(2)}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Tail-risk pricing & variance premium */}
      <Panel
        title="Tail-risk pricing & variance premium"
        subtitle="what the wings cost — and how rich vol is vs realized"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Down −{down.otmPct.toFixed(1)}% · P</span>
            <span className="block font-mono text-[15px] font-semibold tnum text-bear">{down.prob.toFixed(1)}%</span>
            <span className="block text-[10px] text-textMuted">@ {fmtK(down.strike)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Down insure</span>
            <span className="block font-mono text-[15px] font-semibold tnum text-textPrimary">{down.premiumPct.toFixed(2)}%</span>
            <span className="block text-[10px] text-textMuted">of spot</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Up +{up.otmPct.toFixed(1)}% · P</span>
            <span className="block font-mono text-[15px] font-semibold tnum text-bull">{up.prob.toFixed(1)}%</span>
            <span className="block text-[10px] text-textMuted">@ {fmtK(up.strike)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Up insure</span>
            <span className="block font-mono text-[15px] font-semibold tnum text-textPrimary">{up.premiumPct.toFixed(2)}%</span>
            <span className="block text-[10px] text-textMuted">of spot</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">Implied var</span>
            <span className="block font-mono text-[15px] font-semibold tnum text-textPrimary">{view.impliedVar.toFixed(2)}</span>
            <span className="block text-[10px] text-textMuted">RV {view.realizedVar.toFixed(2)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-textMuted truncate">VRP</span>
            <span className={`block font-mono text-[15px] font-semibold tnum ${vrpTone === 'bull' ? 'text-bull' : 'text-warn'}`}>
              {signed(view.vrp, 2)}
            </span>
            <span className="block text-[10px] text-textMuted">{signed(view.vrpVolPts)} vol pts</span>
          </div>
        </div>
      </Panel>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond the smile</span>
          A single IV number is one moment of one curve. Reconstructing the whole state-price density turns the option book into
          an explicit set of odds over where price lands — so you can watch probability mass MOVE. The migration read is the tell
          the smile hides: mass can slide toward a strike while spot sits still, repricing the tail before the tape does. Realized
          vol is measured off the price history; the density is reconstructed from the vol surface and skew.
        </p>
      </Panel>
    </>
  );
};

export default StatePriceDensity;
