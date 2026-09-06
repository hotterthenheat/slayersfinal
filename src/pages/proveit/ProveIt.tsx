import { useMemo, useState } from 'react';
import { Boxes, FlaskConical, Sliders, Trophy } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import {
  runMonteCarlo,
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
import { useTracker } from '../../context/TrackerContext';
import { buildScoreboard, sampleWords, type Claim } from '../../data/scoreboard';
import { expiresAt, labelRead, sleeveOf } from '../../data/labelMaturity';
import { makeSetup } from '../../data/compass';
import type { TrackedSetup } from '../../types/tracker';

type Window = '10' | '30' | '60';

const WINDOW_OPTIONS = [
  { value: '10', label: '10d' },
  { value: '30', label: '30d' },
  { value: '60', label: '60d' },
] as const;

/*
  ONE TRACKED SETUP, FLATTENED INTO A CLAIM.

  The maturity rule lives in `labelMaturity` and is shared with the Tracker
  rather than re-derived here — two surfaces disagreeing about whether a
  call has matured is the one way this board could still lie after the
  seeded rates came out.
*/
const claimOf = (t: TrackedSetup): Claim => {
  Simulator.ensureTicker(t.ticker);
  const cfg = Simulator.TICKERS[t.ticker];
  const live = makeSetup(t.ticker, cfg.currentPrice, t.strike, t.right, t.scanner, cfg.iv, sleeveOf(t));
  const at = expiresAt(t);
  const read = labelRead(t.verdictAtTrack, live, at !== null && Date.now() >= at, at !== null);
  return { lens: t.scanner, at: t.trackedAt, matured: read.maturity === 'matured', heldUp: read.heldUp };
};

const ProveIt = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [window_, setWindow] = useState<Window>('30');

  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const mc = useMemo(
    () => (marketData ? runMonteCarlo(marketData, iv, Number(window_)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketData?.ticker, marketData?.spot && Math.round(marketData.spot * 4), iv, window_]
  );
  /*
    10.4 — THE SCOREBOARD IS THE READER'S LEDGER NOW.

    It used to be `Math.round(base + hRange(seed, -3, 3))` around five
    hand-picked bases, printed under "every engine tracked against what
    actually happened" — the same failure as a quality bar drawn from a
    seed, on the one tab in the product that advertises rigour.

    A tracked setup is the only locked prediction this desk records:
    `verdictAtTrack` is the claim, `trackedAt` is when it was made, and
    `labelMaturity` grades it once its window has closed and not before.
    So those are what is counted, grouped by the lens that found them.

    That the ledger is usually empty is not a problem to solve — it is the
    true state, and the empty state the checklist asks for exists precisely
    to say so. A scoreboard with nothing in it is worth more than one with
    numbers nobody can check.
  */
  const { trackedSetups } = useTracker();
  const scoreboard = useMemo(() => buildScoreboard(trackedSetups.map(claimOf)), [trackedSetups]);
  /* The blend is over GRADED claims rather than over lenses, so a lens with
     three calls cannot pull the composite as hard as one with ninety. Null
     when nothing is graded — a composite of zero is a score, and this is
     the absence of one. */
  const composite = scoreboard.graded === 0
    ? null
    : Math.round(
        (scoreboard.rows.reduce((a, r) => a + r.held, 0) / scoreboard.graded) * 100,
      );

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
        <StatCard
          label="Model composite"
          value={composite === null ? '—' : `${composite}%`}
          sub={composite === null ? 'nothing tracked has matured yet' : `over ${scoreboard.graded} graded ${scoreboard.graded === 1 ? 'call' : 'calls'} you tracked`}
          tone={composite === null ? 'neutral' : 'select'}
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
        subtitle="your tracked calls, graded once their window closed"
        flush
        actions={
          /* 10 · THE LOCK, WHICH IS WHAT MAKES A SCOREBOARD MEAN ANYTHING.

             A hit rate is a claim that the desk called things correctly,
             and it is worth exactly nothing unless the calls were fixed
             before the results were known — any model grades brilliantly
             against a window chosen afterwards. That discipline is not a
             disclaimer bolted on here; it is why this panel now counts
             tracked setups and nothing else. A tracked setup records the
             verdict AND the moment, and `labelMaturity` refuses to grade it
             until its window has closed. */
          scoreboard.lockedFrom ? (
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-textMuted whitespace-nowrap cursor-help"
              title={SCOREBOARD_LOCK_NOTE}
            >
              locked {scoreboard.lockedFrom} → {scoreboard.lockedTo}
            </span>
          ) : null
        }
      >
        {scoreboard.rows.length === 0 ? (
          /* 10 asks for this explicitly, and it is not a formality: a
             scoreboard that has nothing to show yet must say so rather
             than render an empty grid a reader reads as zero. It was
             unreachable while the rows were hardcoded — which is its own
             comment on what those rows were. */
          <DataState
            kind="empty"
            title="No graded calls yet"
            body={`This board grades the setups YOU track, and only after their window closes — ${MATURITY_DAYS} sessions for a dated contract, or a target banked for a swing. Track a setup on Compass and it appears here once it has matured. Nothing is counted before its outcome was known, which is the only thing that makes a hit rate mean anything.`}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-px bg-borderSubtle">
              {scoreboard.rows.map(r => (
                <div key={r.lens} className="bg-panel px-3.5 py-3 flex flex-col gap-2" data-score-row={r.lens}>
                  <div className="font-mono text-[11px] font-semibold text-textPrimary">{r.label}</div>
                  <div className="flex items-baseline gap-2">
                    {/* A NULL RATE IS NOT A ZERO. A lens whose only matured
                        claims were WATCHes has graded nothing, and a 0%
                        beside it would read as five straight misses. */}
                    <span className={`font-mono text-2xl font-bold tnum ${r.hitRatePct !== null && r.hitRatePct >= 65 ? 'holo-text' : 'text-textPrimary'}`}>
                      {r.hitRatePct === null ? '—' : `${r.hitRatePct}%`}
                    </span>
                    <span className="font-mono text-[10px] text-textMuted tnum">{sampleWords(r.sample)}</span>
                  </div>
                  <div className="font-mono text-[10px] text-textSecondary tnum">
                    {r.held} held · {r.missed} did not
                    {r.noClaim > 0 && <span className="text-textMuted"> · {r.noClaim} made no claim</span>}
                  </div>
                  {r.pending > 0 && (
                    <p className="text-[10px] text-textMuted leading-snug">
                      {r.pending} more still inside {r.pending === 1 ? 'its' : 'their'} window — not counted until {r.pending === 1 ? 'it closes' : 'they close'}.
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="px-3.5 py-2.5 text-[11px] text-textMuted leading-relaxed border-t border-borderSubtle">
              {/* THREE OUTCOMES, TWO IN THE DENOMINATOR. A WATCH says "not
                  yet" and is right about nothing either way; counting it as
                  a miss would punish the desk for its own caution and
                  counting it as a hit would reward it for saying nothing. */}
              {scoreboard.graded} graded, {scoreboard.pending} still open
              {scoreboard.noClaim > 0 && `, ${scoreboard.noClaim} matured without a claim to grade`}. A WATCH claims nothing, so it sits
              outside the ratio rather than counting either way.
            </p>
          </>
        )}
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
