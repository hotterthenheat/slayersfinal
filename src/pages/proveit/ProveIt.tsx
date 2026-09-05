import { useMemo, useState } from 'react';
import { Boxes, FlaskConical, Sliders, Trophy } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  modelScoreboard, runMonteCarlo,
  MC_MODEL_NAME, MC_MODEL_ASSUMPTIONS, SCOREBOARD_LOCK_NOTE, MATURITY_DAYS,
} from '../../core/quant';
import DataState from '../../components/ui/DataState';
import CarryEditor from '../../components/ui/CarryEditor';
import PageHeader from '../../components/ui/PageHeader';
import TickerSearch from '../../components/ui/TickerSearch';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SegmentedControl from '../../components/ui/SegmentedControl';
import Sparkline from '../../components/compass/Sparkline';
import MonteCarloPanel from './MonteCarloPanel';
import Surface3D from './Surface3D';
import ProvenanceChip from '../../components/ui/ProvenanceChip';

type Window = '10' | '30' | '60';

const WINDOW_OPTIONS = [
  { value: '10', label: '10d' },
  { value: '30', label: '30d' },
  { value: '60', label: '60d' },
] as const;

const ProveIt = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [window_, setWindow] = useState<Window>('30');

  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const mc = useMemo(
    () => (marketData ? runMonteCarlo(marketData, iv, Number(window_)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketData?.ticker, marketData?.spot && Math.round(marketData.spot * 4), iv, window_]
  );
  const scoreboard = useMemo(() => modelScoreboard(), []);
  const composite = Math.round(scoreboard.reduce((a, m) => a + m.hitRatePct, 0) / scoreboard.length);

  if (!marketData || !mc) {
    return (
      <>
        <PageHeader
          breadcrumb={['Terminal', 'Prove It']}
          title="Prove It"
          subtitle="Quantitative modeling & predictive analytics — the receipts behind every call"
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
        subtitle="Quantitative modeling & predictive analytics — the receipts behind every call"
        actions={
          <span className="inline-flex items-center gap-2">
            <SegmentedControl
              ariaLabel="Forecast horizon"
              options={WINDOW_OPTIONS}
              value={window_}
              onChange={v => setWindow(v as Window)}
            />
            <TickerSearch value={activeTicker} onChange={changeTicker} />
            {/* Every path on this page is discounted, and the scoreboard scores
                a model against its own inputs — the carry curve is as much a
                source of these numbers as the chain is. */}
            <ProvenanceChip
              sources={['chain', 'carry']}
              note="Monte Carlo paths discount at r and grow at q; the scoreboard grades the model that uses them."
            />
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
          sub="90% of paths land inside"
        />
        <StatCard
          label="Vol regime"
          value={regime}
          sub={`IV ${(iv * 100).toFixed(0)}% annualized`}
          tone={regime === 'HIGH VOL' ? 'warn' : 'neutral'}
        />
        <StatCard label="Model composite" value={`${composite}%`} sub="engines' blended hit rate" tone="select" />
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
          {/* 10 · THE MODEL, NAMED, BESIDE THE CHART.

              A fan chart with a percentile cone is the most authoritative
              object a quant interface draws, and this is the tab that
              advertises rigour — so the assumption behind it cannot be a
              three-letter word in a subtitle. GBM is the weakest thing on
              this page and the reader is entitled to know in what
              direction it is wrong, not merely that it is a model. */}
          <div className="mt-3 border-t border-borderSubtle pt-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-warn/90">
              {MC_MODEL_NAME} — the weakest assumption on this page
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {MC_MODEL_ASSUMPTIONS.map(a => (
                <li key={a.claim} className="text-[11px] leading-snug text-textMuted">
                  <span className="text-textSecondary">{a.claim}.</span> {a.why}
                </li>
              ))}
            </ul>
          </div>
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

      {/* 15 · THE CARRY EDITOR, on the page that already tells the reader
          its paths discount at r and grow at q. Every greek on this desk is
          priced against these two numbers, so the surface that exists to
          demonstrate rigour is the right place to expose them — and the
          right place to say whether they came from a feed, from the desk's
          documented assumption, or from somebody typing. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" /> Carry
          </span>
        }
        subtitle="the rate and yield every greek on this desk is priced against"
        bodyClassName="py-3"
      >
        <CarryEditor />
      </Panel>

      {/* The receipts */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Model scoreboard
          </span>
        }
        subtitle="every engine tracked against what actually happened"
        flush
        actions={
          /* 10 · THE LOCK, WHICH IS WHAT MAKES A SCOREBOARD MEAN ANYTHING.

             A hit rate is a claim that the desk called things correctly,
             and it is worth exactly nothing unless the calls were fixed
             before the results were known — any model grades brilliantly
             against a window chosen afterwards. So the window is stated:
             predictions locked between two dates, outcomes known through a
             LATER one, and the two never overlapping. */
          scoreboard.length > 0 ? (
            <span
              className="font-mono text-[9px] uppercase tracking-wider text-textMuted whitespace-nowrap"
              title={SCOREBOARD_LOCK_NOTE}
            >
              locked {scoreboard[0].lockedFrom} → {scoreboard[0].lockedTo} · matured through {scoreboard[0].maturedThrough}
            </span>
          ) : null
        }
      >
        {scoreboard.length === 0 && (
          /* 10 asks for this explicitly, and it is not a formality: a
             scoreboard that has nothing to show yet must say so rather
             than render an empty grid a reader reads as zero. */
          <DataState
            kind="empty"
            title="No matured predictions yet"
            body={`A call is only graded once its outcome is known — ${MATURITY_DAYS} sessions after it was made. Nothing has matured into this window yet.`}
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-px bg-borderSubtle">
          {scoreboard.map(m => (
            <div key={m.model} className="bg-panel px-3.5 py-3 flex flex-col gap-2">
              <div className="font-mono text-[11px] font-semibold text-textPrimary">{m.model}</div>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-2xl font-bold tnum ${m.hitRatePct >= 65 ? 'holo-text' : 'text-textPrimary'}`}>
                  {m.hitRatePct}%
                </span>
                <span className="font-mono text-[10px] text-textMuted tnum">n={m.sample}</span>
              </div>
              <Sparkline data={m.trend} up={m.trend[m.trend.length - 1] >= m.trend[0]} width={120} height={22} />
              <div className="font-mono text-[10px] text-textSecondary tnum">
                edge {m.edgeBps >= 0 ? '+' : ''}
                {m.edgeBps} bps/signal
              </div>
              <p className="text-[10px] text-textMuted leading-snug">{m.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">How to read this</span>
          The cone is not a prediction — it is the honest distribution of outcomes given current volatility. Trade ideas
          from Compass and Trace should live inside the cone's fat part; anything that needs a path outside the 90% band
          is a lottery ticket, whatever the chart pattern says. The scoreboard exists so the terminal has to prove it —
          when an engine's hit rate decays, weights come down with it.
        </p>
      </Panel>
    </>
  );
};

export default ProveIt;
