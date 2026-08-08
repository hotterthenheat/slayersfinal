import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, ChevronRight, FlaskConical, Trophy } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { modelScoreboard, runMonteCarlo } from '../../core/quant';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Sparkline from '../../components/compass/Sparkline';
import MonteCarloPanel from './MonteCarloPanel';
import Surface3D from './Surface3D';
import MarketStateReplay from '../../components/proveit/MarketStateReplay';
import VolLab from '../gex/VolLab';
import VolComplex from './VolComplex';
import SurfaceIntegrity from './SurfaceIntegrity';
import StatePriceDensity from '../../components/gex/StatePriceDensity';

type Window = '10' | '30' | '60';

const WINDOW_OPTIONS = [
  { value: '10', label: '10d' },
  { value: '30', label: '30d' },
  { value: '60', label: '60d' },
] as const;

/** The three reads. Volatility and density arrived from Pinpoint: a calibrated
    surface and the price density it implies are model output measured against
    the tape, which is this desk's remit, not a picture of dealer hedging. */
const VIEW_OPTIONS = [
  { value: 'models', label: 'Models' },
  { value: 'volatility', label: 'Volatility lab' },
  { value: 'complex', label: 'Vol complex' },
  { value: 'integrity', label: 'Surface QC' },
  { value: 'density', label: 'Risk-neutral density' },
] as const;
type ViewKey = (typeof VIEW_OPTIONS)[number]['value'];

/**
 * Monte Carlo, the dealer surface and the scoreboard. Split out so the two
 * volatility reads mount without a snapshot they never use, and so the tab bar
 * stays on screen while this one waits for its run.
 */
const ModelsView = ({ window_ }: { window_: Window }) => {
  const { activeTicker, marketData } = useMarketData();
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const mc = useMemo(
    () => (marketData ? runMonteCarlo(marketData, iv, Number(window_)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketData?.ticker, marketData?.spot && Math.round(marketData.spot * 4), iv, window_]
  );
  const scoreboard = useMemo(() => modelScoreboard(), []);
  /*
    An UNWEIGHTED mean of the rows' hit rates, and the sub-line says so.

    It used to read "engines' blended hit rate", which names a quantity nothing
    here computes: blending would pool the calls and divide once, and the two
    engines score different populations — headline priors against the next
    session, sweep prints against the next 30 bars — at very different sample
    sizes. Pooling would let the larger population speak for the smaller engine,
    and the mean of two rates is not that pooled number anyway.

    `grade` returns null for a population too thin to score, so an empty board is
    reachable; it prints a dash rather than NaN%.
  */
  const composite = scoreboard.length
    ? Math.round(scoreboard.reduce((a, m) => a + m.hitRatePct, 0) / scoreboard.length)
    : null;

  if (!marketData || !mc) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Spinning up the models…</span>
      </Panel>
    );
  }

  const regime = iv > 0.32 ? 'HIGH VOL' : iv > 0.22 ? 'NORMAL' : 'COMPRESSED';
  const trendUp = marketData.indicators.ema9 >= marketData.indicators.ema21;

  const assumptions: { label: string; value: string; note: string }[] = [
    { label: 'Model', value: 'GBM', note: 'geometric Brownian motion, log-normal steps' },
    { label: 'IV source', value: `${(iv * 100).toFixed(0)}% annualized`, note: `implied vol for ${activeTicker}` },
    {
      label: 'Drift source',
      value: trendUp ? 'EMA9 ≥ EMA21' : 'EMA9 < EMA21',
      note: 'trend-following: EMAs stand in for the return forecast',
    },
    { label: 'Horizon', value: `${mc.days} sessions`, note: 'trading days ahead' },
    { label: 'Paths', value: `${mc.runs.toLocaleString()} runs`, note: 'independent random sample paths' },
  ];

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label={`P(up in ${mc.days} sessions)`}
          value={`${mc.stats.probUpPct}%`}
          sub={`${mc.runs.toLocaleString()} Monte Carlo runs`}
          tone={mc.stats.probUpPct >= 55 ? 'bull' : mc.stats.probUpPct <= 45 ? 'bear' : 'neutral'}
        />
        <StatCard
          label="Expected return"
          value={`${mc.stats.expReturnPct >= 0 ? '+' : ''}${mc.stats.expReturnPct.toFixed(1)}%`}
          sub="distribution mean vs spot"
          tone={mc.stats.expReturnPct >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="95% VaR"
          value={`${mc.stats.var95Pct.toFixed(1)}%`}
          sub="worst 1-in-20 outcome"
          tone="bear"
        />
        <StatCard
          label="Expected range"
          value={`${mc.stats.rangeLow.toFixed(0)}–${mc.stats.rangeHigh.toFixed(0)}`}
          sub="90% of paths land inside"
        />
        <StatCard
          label="Vol regime"
          value={regime}
          sub={`IV ${(iv * 100).toFixed(0)}% annualized`}
          tone={regime === 'HIGH VOL' ? 'warn' : 'neutral'}
        />
        {/* Hit rate is model QUALITY, not market direction, so a strong composite
            takes the holo select accent and never bull green — the same
            correction the vol desk makes for cheap vol. Green on this grid
            is reserved for the two directional cards above it. */}
        <StatCard
          label="Model composite"
          value={composite === null ? '—' : `${composite}%`}
          sub={`unweighted mean of ${scoreboard.length} engine hit rate${scoreboard.length === 1 ? '' : 's'}`}
          tone={composite !== null && composite >= 60 ? 'select' : 'neutral'}
        />
      </MetricGrid>

      {/* Start-aligned on purpose: the Dealer surface beside this is `xl:sticky`
          with a fixed-height canvas, and a sticky item that stretches to the row
          height cannot pin. Its 62px of slack is the sticky behaviour, not a
          stranded rail — hence `xl:self-start` on that panel. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Monte Carlo
            </span>
          }
          subtitle={`${activeTicker} · GBM · ${mc.runs.toLocaleString()} runs over ${mc.days} sessions`}
          className="xl:col-span-7"
        >
          <MonteCarloPanel mc={mc} spot={marketData.spot} />

          <div className="mt-3 border-t border-borderSubtle pt-3">
            <button
              type="button"
              onClick={() => setAssumptionsOpen(o => !o)}
              aria-expanded={assumptionsOpen}
              className="-my-1 py-1 flex items-center gap-1.5 font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${assumptionsOpen ? 'rotate-90' : ''}`} />
              Assumptions
            </button>

            {assumptionsOpen && (
              <div className="mt-3">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                  {assumptions.map(a => (
                    <div key={a.label} className="flex flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-mono text-label uppercase tracking-wider text-textMuted">{a.label}</dt>
                        <dd className="font-mono text-caption text-textPrimary tnum text-right">{a.value}</dd>
                      </div>
                      <p className="text-micro text-textMuted leading-snug">{a.note}</p>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-label text-textSecondary leading-relaxed">
                  These inputs set the cone's width; they do not make it a forecast. Change the window or ticker and
                  every stat above recomputes from the same seeded run.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> Dealer surface
            </span>
          }
          subtitle="net exposure · strikes × expiries × GEX"
          className="xl:col-span-5 xl:sticky xl:top-4 xl:self-start"
          bodyClassName="p-0"
        >
          <Surface3D snapshot={marketData} height={352} />
        </Panel>
      </div>

      {/* The receipts */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Model scoreboard
          </span>
        }
        subtitle="each engine's calls scored against the outcomes the same seeded series produced"
        flush
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-borderSubtle">
          {scoreboard.map(m => (
            <div key={m.model} className="bg-panel px-3.5 py-3 flex flex-col gap-2">
              <div className="font-mono text-label font-semibold text-textPrimary">{m.model}</div>
              <div className="flex items-baseline gap-2">
                {/* Select, not bull: an engine hitting 65% is a statement about the
                    engine, and a green number beside a call it got right would
                    read as the tape going up. */}
                <span className={`font-mono text-2xl font-bold tnum ${m.hitRatePct >= 65 ? 'text-select' : 'text-textPrimary'}`}>
                  {m.hitRatePct}%
                </span>
                <span className="font-mono text-micro text-textMuted tnum">n={m.sample}</span>
              </div>
              <Sparkline data={m.trend} up={m.trend[m.trend.length - 1] >= m.trend[0]} width={120} height={22} label="hit rate" />
              <div className="font-mono text-micro text-textSecondary tnum">
                edge {m.edgeBps >= 0 ? '+' : ''}
                {m.edgeBps} bps/signal
              </div>
              <p className="text-micro text-textMuted leading-snug">{m.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <MarketStateReplay snapshot={marketData} />

      <Panel bodyClassName="py-3">
        <p className="text-caption text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 text-textSecondary">How to read this</span>
          The cone is not a prediction. It is the distribution of outcomes the stated assumptions imply. Ideas off
          Compass and Trace sit inside the cone's fat part; anything that needs a path outside the 90% band is a tail,
          whatever the chart pattern says. The scoreboard is where an engine has to show its work: every row names the
          population it was scored on, and an engine whose population is too thin to say anything is dropped from the
          board rather than rounded up.
        </p>
      </Panel>
    </>
  );
};

const ProveIt = () => {
  const [params, setParams] = useSearchParams();
  const [window_, setWindow] = useState<Window>('30');

  // An unknown `?view=` falls back to the first read rather than an empty page.
  const active = VIEW_OPTIONS.find(v => v.value === params.get('view')) ?? VIEW_OPTIONS[0];
  const view = active.value;

  const selectView = (next: ViewKey) => {
    const p = new URLSearchParams(params);
    p.set('view', next);
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Prove It', active.label]}
        title="Prove It"
        subtitle="Quantitative modeling & predictive analytics: the receipts behind the calls this desk can grade"
        actions={
          // The window sets the Monte Carlo horizon and nothing else, so it is
          // not offered on the two reads it cannot move.
          view === 'models' && (
            <SegmentedControl
              ariaLabel="Forecast window"
              options={WINDOW_OPTIONS}
              value={window_}
              onChange={v => setWindow(v as Window)}
            />
          )
        }
      />

      <div className="flex max-w-full">
        <SegmentedControl ariaLabel="Prove It view" options={VIEW_OPTIONS} value={view} onChange={selectView} />
      </div>

      {view === 'models' && <ModelsView window_={window_} />}
      {view === 'volatility' && <VolLab />}
      {view === 'complex' && <VolComplex />}
      {view === 'integrity' && <SurfaceIntegrity />}
      {view === 'density' && <StatePriceDensity />}
    </>
  );
};

export default ProveIt;
