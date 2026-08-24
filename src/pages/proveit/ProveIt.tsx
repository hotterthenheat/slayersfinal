import { useMemo, useState } from 'react';
import { Boxes, FlaskConical } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Feed from '../../core/feed';
import { runMonteCarlo } from '../../core/quant';
import PageHeader from '../../components/ui/PageHeader';
import TickerSearch from '../../components/ui/TickerSearch';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SegmentedControl from '../../components/ui/SegmentedControl';
import MonteCarloPanel from './MonteCarloPanel';
import Surface3D from './Surface3D';

type Window = '10' | '30' | '60';

const WINDOW_OPTIONS = [
  { value: '10', label: '10d' },
  { value: '30', label: '30d' },
  { value: '60', label: '60d' },
] as const;

const ProveIt = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [window_, setWindow] = useState<Window>('30');

  const iv = Feed.TICKERS[activeTicker]?.iv ?? 0.25;

  const mc = useMemo(
    () => (marketData ? runMonteCarlo(marketData, iv, Number(window_)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketData?.ticker, marketData?.spot && Math.round(marketData.spot * 4), iv, window_]
  );

  if (!marketData || !mc) {
    return (
      <>
        <PageHeader
          breadcrumb={['Terminal', 'Prove It']}
          title="Prove It"
          subtitle="Quantitative modeling — the distribution of outcomes, given today's volatility"
        />
        <Panel className="h-64" bodyClassName="flex items-center justify-center">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Spinning up the models…</span>
        </Panel>
      </>
    );
  }

  const regime = iv > 0.32 ? 'HIGH VOL' : iv > 0.22 ? 'NORMAL' : 'COMPRESSED';

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Prove It']}
        title="Prove It"
        subtitle="Quantitative modeling — the distribution of outcomes, given today's volatility"
        actions={
          <span className="inline-flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Simulation window"
              options={WINDOW_OPTIONS}
              value={window_}
              onChange={v => setWindow(v as Window)}
            />
            <TickerSearch value={activeTicker} onChange={changeTicker} />
          </span>
        }
      />

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
          value={
            <span className="text-sm">
              ${mc.stats.rangeLow.toFixed(0)}–${mc.stats.rangeHigh.toFixed(0)}
            </span>
          }
          sub="90% of simulated paths land inside"
        />
        <StatCard
          label="Vol regime"
          value={regime}
          sub={`IV ${(iv * 100).toFixed(0)}% annualized`}
          tone={regime === 'HIGH VOL' ? 'warn' : 'neutral'}
        />
      </MetricGrid>

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
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5" /> Dealer surface
            </span>
          }
          subtitle="net exposure — strikes × expiries × GEX"
          className="xl:col-span-5"
          bodyClassName="p-0"
        >
          <Surface3D snapshot={marketData} height={352} />
        </Panel>
      </div>

      {/*
        THE SCOREBOARD IS GONE, DELIBERATELY.

        Five engines used to report a hit rate, a sample size, an edge in bps
        and a 24-point trend line under the subtitle "every engine tracked
        against what actually happened". None of it was tracked against
        anything: every figure came out of `modelScoreboard()`, which hashed
        the date and the engine's name. The closing copy went further and
        claimed a live loop — "when an engine's hit rate decays, weights come
        down with it" — where the weights are static constants.

        This is the one page whose entire premise is measurement, so a
        fabricated number here is worse than anywhere else in the product.

        It does not come back by wiring the old function to real data, because
        the missing thing is not a feed. Nobody sells you a track record of
        your OWN signals: it has to be earned by writing every verdict to the
        decision journal (core/journal.ts already has the seam — ENGINE_VERSION
        and decisionId) and grading them on a forward window. That takes
        sessions of wall-clock time, and until it has run there is nothing
        honest to print.
      */}

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">How to read this</span>
          The cone is not a prediction — it is the distribution of outcomes given current volatility. Trade ideas
          from Compass and Trace should live inside the cone's fat part; anything that needs a path outside the 90% band
          is a lottery ticket, whatever the chart pattern says. This desk does not yet report how the engines have
          graded out: that has to be measured decision by decision on a forward window, and none of it has run.
        </p>
      </Panel>
    </>
  );
};

export default ProveIt;
