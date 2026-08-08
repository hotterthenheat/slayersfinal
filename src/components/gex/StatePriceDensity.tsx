import { useMemo } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { Activity, GitCompareArrows, Layers, TrendingDown } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { buildStateDensity, type StateDensityView, type MassShift, type SkewLabel } from '../../data/statedensity';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import { BULL, BEAR, SPOT, MUTED_INK, FOCUS } from './palette';
import { ChartTip, TipHead, TipRow, TipSeries, TipNote } from '../charts/ChartTip';
import { GRID, CURSOR, valueAxis, categoryAxis, axisVol, paddedDomain, niceTicks } from '../charts/chartTheme';
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

interface DensityRow {
  price: number;
  implied: number;
  realized: number;
  cdf: number;
}

/*
  Risk-neutral terminal density: implied vs realized, spot marker, shaded 2-sigma
  tails. On recharts, house chart theme.

  The implied area was lilac (rgba(151,136,196,·)), the last of the off-palette
  inks in this file — a modelled distribution takes holo-silver like every other
  model output. Realized stays a dotted grey overlay: same shape language, no
  claim to being the subject.
*/
const DensityChart = ({ view }: { view: StateDensityView }) => {
  const { density: D, realizedDensity: R, sigma2, forward, spot } = view;
  const rows: DensityRow[] = D.map((p, i) => ({
    price: p.price,
    implied: p.density,
    realized: R[i]?.density ?? 0,
    cdf: p.cdf,
  }));
  const lo = rows[0].price;
  const hi = rows[rows.length - 1].price;

  return (
    <div
      style={{ height: 208 }}
      className="w-full"
      role="img"
      aria-label={`Risk-neutral terminal-price density for ${view.ticker} over ${view.horizonDays} days, implied against realized, centred on a forward of ${forward.toFixed(0)} with spot at ${spot.toFixed(2)}. Two-sigma bounds at ${sigma2[0].toFixed(0)} and ${sigma2[1].toFixed(0)}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 18, right: 6, bottom: 2, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...categoryAxis}
            type="number"
            dataKey="price"
            domain={[lo, hi]}
            tickFormatter={(v: number) => v.toFixed(0)}
          />
          {/* The density value carries no unit a reader can act on; the read-out
              gives the probability instead. Axis kept for layout only. */}
          <YAxis hide domain={[0, 'dataMax']} />
          {/* Beyond two sigma either way — the tails the panel grades. */}
          <ReferenceArea x1={lo} x2={sigma2[0]} fill={BEAR} fillOpacity={0.06} />
          <ReferenceArea x1={sigma2[1]} x2={hi} fill={BULL} fillOpacity={0.06} />
          <ReferenceLine
            x={forward}
            stroke={MUTED_INK}
            strokeOpacity={0.7}
            strokeDasharray="3 3"
            label={{ value: `FWD ${forward.toFixed(0)}`, position: 'insideTopLeft', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <ReferenceLine
            x={spot}
            stroke={SPOT}
            strokeOpacity={0.85}
            strokeWidth={1.25}
            label={{ value: `SPOT ${spot.toFixed(2)}`, position: 'insideBottomRight', fill: SPOT, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<DensityRow>
                render={r => {
                  const below = r.cdf * 100;
                  const rich = r.implied > r.realized;
                  const inTail = r.price < sigma2[0] || r.price > sigma2[1];
                  return (
                    <>
                      <TipHead sub={`${signed(((r.price - spot) / spot) * 100, 1)}% vs spot`}>{r.price.toFixed(2)}</TipHead>
                      <TipRow label="Settles below" value={`${below.toFixed(1)}%`} tone="text-bear" />
                      <TipRow label="Settles above" value={`${(100 - below).toFixed(1)}%`} tone="text-bull" />
                      <TipSeries color={FOCUS} label="Implied density" value={r.implied.toFixed(4)} />
                      <TipSeries color={MUTED_INK} label="Realized density" value={r.realized.toFixed(4)} />
                      <TipNote>
                        {inTail
                          ? 'Past two sigma. The market prices this as a tail, and the two curves usually disagree most out here.'
                          : rich
                            ? 'Options price MORE weight on this outcome than the tape has actually delivered around it.'
                            : 'Options price LESS weight on this outcome than the tape has actually delivered around it.'}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="implied"
            stroke={FOCUS}
            strokeWidth={1.75}
            fill={FOCUS}
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 3, fill: FOCUS, stroke: 'none' }}
            isAnimationActive={false}
          />
          {/* Realized overlaid as a dotted line, never filled — it is the check
              on the implied curve, not a second subject competing with it. */}
          <Area
            type="monotone"
            dataKey="realized"
            stroke={MUTED_INK}
            strokeWidth={1.1}
            strokeDasharray="2 2.5"
            fill="none"
            dot={false}
            activeDot={{ r: 2.5, fill: MUTED_INK, stroke: 'none' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
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
        <span className="font-mono text-label text-textPrimary uppercase tracking-wider">
          P(<span className="tnum">{m.label}</span>)
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-label tnum text-textMuted">
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

/*
  Forward-vol curve — the vol priced BETWEEN tenors, not just to them. On
  recharts.

  This chart previously had no hover at all, on a panel whose entire point is
  that forward vol and spot vol diverge: the reader could see two lines cross
  and had no way to ask by how much.
*/
const ForwardVolChart = ({ view }: { view: StateDensityView }) => {
  const pts = view.forwardVols;
  const domain = paddedDomain(pts.flatMap(p => [p.forwardVol, p.spotVol]), 0.1);

  return (
    <div
      style={{ height: 168 }}
      className="w-full"
      role="img"
      aria-label={`Forward volatility priced between tenors, against spot volatility to each tenor, across ${pts.map(p => p.label).join(', ')}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 14, right: 6, bottom: 2, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis {...categoryAxis} dataKey="label" interval={0} />
          <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={axisVol} width={40} />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<(typeof pts)[number]>
                render={p => {
                  const spread = p.forwardVol - p.spotVol;
                  return (
                    <>
                      <TipHead sub="tenor">{p.label}</TipHead>
                      <TipSeries color={SPOT} label="Forward vol" value={`${p.forwardVol.toFixed(2)}%`} />
                      <TipSeries color={MUTED_INK} label="Spot vol" value={`${p.spotVol.toFixed(2)}%`} />
                      <TipRow
                        label="Spread"
                        value={`${spread >= 0 ? '+' : ''}${spread.toFixed(2)} pt`}
                        tone={Math.abs(spread) < 0.1 ? 'text-textMuted' : 'text-textSecondary'}
                      />
                      <TipNote>
                        {Math.abs(spread) < 0.1
                          ? 'Forward and spot vol agree at this tenor — the curve is priced flat through it.'
                          : spread > 0
                            ? 'The market prices MORE vol in the window between tenors than the running average to this one implies. Buying the calendar here is paying up for the gap.'
                            : 'The market prices LESS vol in the window between tenors than the running average implies — the front is carrying the level.'}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Line type="monotone" dataKey="spotVol" stroke={MUTED_INK} strokeWidth={1.1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="forwardVol"
            stroke={SPOT}
            strokeWidth={1.75}
            dot={{ r: 2.4, fill: SPOT, stroke: 'none' }}
            activeDot={{ r: 3.4, fill: SPOT, stroke: 'none' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const StatePriceDensity = ({ snapshot }: StatePriceDensityProps) => {
  const { marketData } = useMarketData();
  const snap = snapshot ?? marketData;
  const view = useMemo(() => (snap ? buildStateDensity(snap) : null), [snap]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Reconstructing state-price density…</span>
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
        <span className="inline-flex items-center gap-1.5 border border-borderSubtle bg-panel rounded-md px-2.5 py-1.5 font-mono text-micro uppercase tracking-wider text-textSecondary">
          Model <span className="text-textPrimary font-semibold">SLAYER-DENSITY v0.1</span>
        </span>
        <span className="font-mono text-micro text-textMuted uppercase tracking-widest tnum">
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
        <p className="text-read text-textPrimary leading-relaxed">
          <span className={`font-mono text-micro font-semibold uppercase tracking-widest mr-2.5 ${shiftTone === 'bear' ? 'text-bear' : 'text-bull'}`}>
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
          <div className="mt-2 flex items-center justify-between font-mono text-micro tnum text-textMuted select-none">
            <span>{view.density[0].price.toFixed(0)}</span>
            <span className="uppercase tracking-wider">terminal price · {view.horizonDays}D</span>
            <span>{view.density[view.density.length - 1].price.toFixed(0)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-micro uppercase tracking-wider text-textMuted">
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
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-micro text-textMuted leading-relaxed">
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
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-micro uppercase tracking-wider text-textMuted">
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
                          : 'data-bar'
                  }`}
                  style={{ width: `${view.skewStress}%` }}
                />
                {[34, 56, 78].map(t => (
                  <span key={t} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${t}%` }} aria-hidden />
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-micro uppercase tracking-wider text-textMuted">
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
              <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Put wing 25Δ</span>
              <span className="block font-mono text-data font-semibold tnum text-bear">{view.putWingVol.toFixed(1)}</span>
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Call wing 25Δ</span>
              <span className="block font-mono text-data font-semibold tnum text-textPrimary">{view.callWingVol.toFixed(1)}</span>
            </div>
            <div className="min-w-0">
              <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Risk reversal</span>
              <span className="block font-mono text-data font-semibold tnum text-bear">{view.skewRr25.toFixed(2)}</span>
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
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Down −{down.otmPct.toFixed(1)}% · P</span>
            <span className="block font-mono text-read font-semibold tnum text-bear">{down.prob.toFixed(1)}%</span>
            <span className="block text-micro text-textMuted">@ {fmtK(down.strike)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Down insure</span>
            <span className="block font-mono text-read font-semibold tnum text-textPrimary">{down.premiumPct.toFixed(2)}%</span>
            <span className="block text-micro text-textMuted">of spot</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Up +{up.otmPct.toFixed(1)}% · P</span>
            <span className="block font-mono text-read font-semibold tnum text-bull">{up.prob.toFixed(1)}%</span>
            <span className="block text-micro text-textMuted">@ {fmtK(up.strike)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Up insure</span>
            <span className="block font-mono text-read font-semibold tnum text-textPrimary">{up.premiumPct.toFixed(2)}%</span>
            <span className="block text-micro text-textMuted">of spot</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">Implied var</span>
            <span className="block font-mono text-read font-semibold tnum text-textPrimary">{view.impliedVar.toFixed(2)}</span>
            <span className="block text-micro text-textMuted">RV {view.realizedVar.toFixed(2)}</span>
          </div>
          <div className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">VRP</span>
            <span className={`block font-mono text-read font-semibold tnum ${vrpTone === 'bull' ? 'text-bull' : 'text-warn'}`}>
              {signed(view.vrp, 2)}
            </span>
            <span className="block text-micro text-textMuted">{signed(view.vrpVolPts)} vol pts</span>
          </div>
        </div>
      </Panel>

      <Panel bodyClassName="py-3">
        <p className="text-caption text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 text-textSecondary">Beyond the smile</span>
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
