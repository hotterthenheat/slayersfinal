import { useMemo } from 'react';
import { ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { History, Target, Activity, TrendingDown, Layers } from 'lucide-react';
import { ChartTip, TipHead, TipRow, TipSeries, TipNote } from '../charts/ChartTip';
import { GRID, CURSOR, valueAxis, categoryAxis, axisPct, niceTicks } from '../charts/chartTheme';
import {
  buildStateReplay,
  type StateReplayView,
  type SimSession,
  type Outcome,
  type MatchQuality,
  type CalibrationBin,
  type EdgeDecayPoint,
} from '../../data/statereplay';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';
import { BULL, BEAR, SPOT, MUTED_INK } from '../gex/palette';

interface MarketStateReplayProps {
  snapshot: MarketSnapshot;
}

const outcomeTone: Record<Outcome, Tone> = {
  TARGET: 'bull',
  STOP: 'bear',
  NEITHER: 'neutral',
};

const outcomeLabel: Record<Outcome, string> = {
  TARGET: 'TGT',
  STOP: 'STOP',
  NEITHER: 'NONE',
};

const matchTone: Record<MatchQuality, Tone> = {
  TIGHT: 'bull',
  STRONG: 'select',
  LOOSE: 'warn',
  WEAK: 'bear',
};

// neutral analytical series = white ("where the market is"); silver is selection-only
const SERIES = SPOT;
const GREEN = BULL;
const RED = BEAR;
const MUTED = MUTED_INK;

/** Stacked outcome distribution — target (foil) / stop (red) / neither (dim). */
const OutcomeBar = ({ view }: { view: StateReplayView }) => (
  <div>
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <span className="bg-bull/80 h-full" style={{ width: `${view.targetPct}%` }} title={`Target first ${view.targetPct}%`} />
      <span className="h-full bg-bear/70" style={{ width: `${view.stopPct}%` }} title={`Stop first ${view.stopPct}%`} />
      <span className="h-full bg-white/15" style={{ width: `${view.neitherPct}%` }} title={`Neither ${view.neitherPct}%`} />
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-micro">
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="bg-bull/80 h-1.5 w-1.5 rounded-full" /> Target <span className="tnum text-bull ml-auto text-caption font-semibold">{view.targetPct}%</span>
      </span>
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-bear/80" /> Stop <span className="tnum text-bear ml-auto text-caption font-semibold">{view.stopPct}%</span>
      </span>
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-white/30" /> Neither <span className="tnum text-textPrimary ml-auto text-caption font-semibold">{view.neitherPct}%</span>
      </span>
    </div>
  </div>
);

/** One analog row: how close it was, how it resolved, what it paid. */
const SessionRow = ({ s }: { s: SimSession }) => {
  const tone = outcomeTone[s.outcome];
  const rTxt = `${s.rMultiple >= 0 ? '+' : ''}${s.rMultiple.toFixed(2)}R`;
  return (
    <div className="grid grid-cols-[64px_1fr_58px_54px] items-center gap-2 px-3.5 py-2">
      <span className="font-mono text-micro text-textSecondary tnum">{s.id}</span>
      <div className="min-w-0">
        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="data-bar block h-full rounded-full" style={{ width: `${Math.round(s.sim * 100)}%` }} />
        </div>
        <span className="mt-0.5 block font-mono text-micro text-textMuted tnum">
          match {Math.round(s.sim * 100)}% · {s.daysAgo}d ago · +{s.mfePct.toFixed(1)}/−{s.maePct.toFixed(1)}%
        </span>
      </div>
      <SignalBadge tone={tone}>{outcomeLabel[s.outcome]}</SignalBadge>
      <span className={`text-right font-mono text-caption font-semibold tnum ${s.rMultiple >= 0 ? 'text-bull' : 'text-bear'}`}>{rTxt}</span>
    </div>
  );
};

/*
  Reliability plot — predicted P(target) on X, resolved rate on Y. On
  recharts.

  The 1:1 aspect is load-bearing here: the y = x diagonal is what "well
  calibrated" LOOKS like, and it stops being a 45-degree line the moment the
  plot is stretched. recharts draws into a square coordinate space, so the
  diagonal stays diagonal and the bubbles stay round — the hand-rolled version
  had to cap and centre its SVG to avoid exactly that.
*/
const CalibrationPlot = ({ view }: { view: StateReplayView }) => (
  <div
    style={{ height: 210 }}
    /* layout-cap-ok: the plot has to be SQUARE. A calibration chart's whole
       claim is that the diagonal is where predicted equals realized, and a
       45-degree line stops being 45 degrees the moment the box is stretched.
       This is an aspect lock on a figure, not a text column parked mid-screen. */
    className="w-full max-w-[360px] mx-auto"
    role="img"
    aria-label={`Probability calibration: predicted target rate against resolved rate across ${view.calibration.length} modeled bands. Mean absolute gap ${view.calibrationErrorPct.toFixed(1)} percentage points.`}
  >
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 10, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis {...categoryAxis} type="number" dataKey="predictedPct" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={axisPct} name="predicted" />
        <YAxis {...valueAxis} type="number" dataKey="realizedPct" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={axisPct} width={40} name="realized" />
        {/* Bubble area carries the sample count — a band with three comparables
            behind it should not read as loudly as one with forty. */}
        <ZAxis type="number" dataKey="count" range={[40, 340]} name="count" />
        {/* Perfect calibration, drawn as a segment so it is a true y = x. */}
        <ReferenceLine
          segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
          stroke={MUTED}
          strokeOpacity={0.5}
          strokeDasharray="3 3"
          label={{ value: 'ideal', position: 'insideTopRight', fill: MUTED, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(255,255,255,0.18)' }}
          content={
            <ChartTip<CalibrationBin>
              render={b => {
                const miss = b.realizedPct - b.predictedPct;
                return (
                  <>
                    <TipHead sub={`${b.count} comparable${b.count === 1 ? '' : 's'}`}>{b.label}</TipHead>
                    <TipRow label="Model predicted" value={`${b.predictedPct.toFixed(1)}%`} />
                    <TipRow label="Resolved rate" value={`${b.realizedPct.toFixed(1)}%`} />
                    <TipRow
                      label="Gap"
                      value={`${miss >= 0 ? '+' : ''}${miss.toFixed(1)} pts`}
                      tone={Math.abs(miss) <= 5 ? 'text-textMuted' : Math.abs(miss) <= 12 ? 'text-warn' : 'text-bear'}
                    />
                    <TipNote>
                      {Math.abs(miss) <= 5
                        ? 'On the diagonal. The comparables are drawn from the model\'s own predicted probability, so agreement here is a consistency check on the sampler — it cannot corroborate the model.'
                        : miss > 0
                          ? 'Above the diagonal: the draw resolved to target more often than the band predicted. With this few paths that is sampling noise before it is anything else.'
                          : 'Below the diagonal: the draw resolved to target less often than the band predicted. With this few paths that is sampling noise before it is anything else.'}
                      {b.count < 8 ? ' Thin sample, so read the position loosely.' : ''}
                    </TipNote>
                  </>
                );
              }}
            />
          }
        />
        <Scatter data={view.calibration} fill={SERIES} fillOpacity={0.85} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  </div>
);

/*
  Edge captured (target − stop) as the trade is held longer. On recharts.

  The hand-rolled version stretched a 250x180 viewBox to panel width with
  preserveAspectRatio="none", scaling x about 2.9x and y 1x. Correct for paths,
  wrong for glyphs — which is why its axis captions had to be HTML siblings
  positioned over the plot. recharts scales the plot without scaling the type,
  so they are just axis labels again.
*/
const EdgeDecayChart = ({ view }: { view: StateReplayView }) => {
  const pts = view.edgeDecay;
  const maxEdge = Math.max(10, ...pts.map(p => p.cumTargetPct));

  return (
    <div
      style={{ height: 196 }}
      className="w-full"
      role="img"
      aria-label={`Edge decay: modeled net edge against bars held, from ${pts[0]?.label ?? ''} to ${pts[pts.length - 1]?.label ?? ''}, with cumulative target and stop rates behind it.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 12, right: 8, bottom: 12, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...categoryAxis}
            type="number"
            dataKey="bar"
            domain={[0, view.horizonBars]}
            label={{ value: 'bars held', position: 'insideBottom', offset: -8, fill: MUTED, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <YAxis {...valueAxis} domain={[0, maxEdge]} ticks={niceTicks(0, maxEdge)} tickFormatter={axisPct} width={42} />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<EdgeDecayPoint>
                render={p => (
                  <>
                    <TipHead sub={`${p.bar} bars`}>{p.label}</TipHead>
                    <TipRow label="Net edge" value={`${p.edgePct.toFixed(1)} pts`} tone={p.edgePct >= 0 ? 'text-bull' : 'text-bear'} />
                    <TipSeries color={GREEN} label="Reached target by now" value={`${p.cumTargetPct.toFixed(1)}%`} />
                    <TipSeries color={RED} label="Reached stop by now" value={`${p.cumStopPct.toFixed(1)}%`} />
                    <TipRow
                      label="Added since last"
                      value={`${p.marginalEdgePts >= 0 ? '+' : ''}${p.marginalEdgePts.toFixed(1)} pts`}
                      tone={p.marginalEdgePts > 0.5 ? 'text-textSecondary' : 'text-textMuted'}
                    />
                    <TipNote>
                      {p.marginalEdgePts <= 0.2
                        ? 'Holding past the previous checkpoint added almost nothing — this is where the modeled edge stops paying for the risk of staying in.'
                        : 'Still accruing: across the modeled paths, target is reached faster than stop through this window.'}
                    </TipNote>
                  </>
                )}
              />
            }
          />
          {/* Cumulative target and stop sit behind as context, not as subjects. */}
          <Line type="monotone" dataKey="cumStopPct" stroke={RED} strokeOpacity={0.4} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="cumTargetPct" stroke={GREEN} strokeOpacity={0.4} strokeWidth={1} dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="edgePct"
            stroke={SERIES}
            strokeWidth={1.9}
            dot={{ r: 2, fill: SERIES, stroke: 'none' }}
            activeDot={{ r: 3.4, fill: SERIES, stroke: 'none' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Today's 8-factor market-state fingerprint. */
const StateFingerprint = ({ view }: { view: StateReplayView }) => (
  <div className="flex flex-col gap-2">
    {view.factors.map(f => (
      <div key={f.key} className="grid grid-cols-[110px_1fr_58px] items-center gap-2.5">
        <span className="font-mono text-micro uppercase tracking-wider text-textSecondary truncate">{f.label}</span>
        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="data-bar block h-full rounded-full" style={{ width: `${Math.round(f.value * 100)}%` }} />
        </div>
        <span className="flex items-center justify-end gap-1.5">
          <span className="font-mono text-micro tnum text-textPrimary">{Math.round(f.value * 100)}</span>
          <span
            className={`font-mono text-micro uppercase tracking-wider ${f.live ? 'text-textSecondary' : 'text-textMuted'}`}
            title={f.live ? 'read from the option chain and tape' : 'macro context'}
          >
            {f.live ? 'chain' : 'macro'}
          </span>
        </span>
      </div>
    ))}
  </div>
);

const MarketStateReplay = ({ snapshot }: MarketStateReplayProps) => {
  const view = useMemo(
    () => buildStateReplay(snapshot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.ticker, Math.round(snapshot.spot * 4)]
  );

  const edgeTone: Tone = view.edgePts >= 4 ? 'bull' : view.edgePts <= -4 ? 'bear' : 'warn';

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Reached target first"
          value={`${view.targetPct}%`}
          sub={`${view.n} simulated analogs`}
          tone={view.edgePts >= 0 ? 'bull' : 'bear'}
          emphasis
        />
        <StatCard label="Stopped first" value={`${view.stopPct}%`} sub="hit the stop before target" tone="bear" />
        <StatCard label="Neither" value={`${view.neitherPct}%`} sub="unresolved inside the session" tone="neutral" />
        <StatCard
          label="Expectancy"
          value={`${view.expectancyR >= 0 ? '+' : ''}${view.expectancyR.toFixed(2)}R`}
          sub={`vs ${view.rr.toFixed(1)}:1 geometry`}
          tone={view.expectancyR >= 0 ? 'bull' : 'bear'}
        />
        <StatCard
          label="Recent half"
          value={`${view.oos.outSampleTargetPct}%`}
          sub={`recency split · Δ${view.oos.degradationPts >= 0 ? '−' : '+'}${Math.abs(view.oos.degradationPts)}pt`}
          tone={Math.abs(view.oos.degradationPts) <= 5 ? 'bull' : 'warn'}
        />
        <StatCard
          label="Match quality"
          value={`${view.matchQuality} ${view.avgSimPct}%`}
          sub={`avg similarity · ${view.simLowPct}–${view.simHighPct}%`}
          tone={matchTone[view.matchQuality]}
        />
      </MetricGrid>

      <Panel tone={edgeTone} bodyClassName="py-3.5" emphasis>
        <p className="text-read text-textPrimary leading-relaxed">
          <span
            className={`font-mono text-micro font-semibold uppercase tracking-widest mr-2.5 ${
              view.edgePts >= 4 ? 'text-bull' : view.edgePts <= -4 ? 'text-bear' : 'text-warn'
            }`}
          >
            The receipts
          </span>
          {view.headline}
        </p>
        <p className="mt-1.5 font-mono text-label text-textSecondary tnum">{view.receipts}</p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* Simulated analogs + outcome distribution */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Simulated analogs
            </span>
          }
          subtitle={`${view.n} closest of ${view.pool} synthesized`}
          className="xl:col-span-7"
          flush
        >
          <div className="p-4">
            <OutcomeBar view={view} />
          </div>
          <div className="flex items-center justify-between border-y border-borderSubtle px-3.5 py-1.5">
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">closest analogs</span>
            <span className="font-mono text-micro uppercase tracking-widest text-textMuted">outcome · result</span>
          </div>
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.topSessions.map(s => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-micro text-textMuted leading-relaxed">
            Target first vs stop first is scored against this setup's own geometry — {view.targetDistPct.toFixed(1)}% to target,{' '}
            {view.stopDistPct.toFixed(1)}% to stop ({view.rr.toFixed(1)}:1). Excess over the {view.baselineTargetPct}% a no-edge
            session posts is the size of the similarity tilt the sampler assumes: {view.edgePts >= 0 ? '+' : ''}
            {view.edgePts} points.
          </p>
        </Panel>

        {/* State fingerprint */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Market-state fingerprint
            </span>
          }
          subtitle="the 8 factors today is matched on"
          className="xl:col-span-5"
          /* The row stretches, so this panel is as tall as the analog list beside
             it. Flex the body and pin the footnote to the bottom: the slack lands
             between the axes and their explanation instead of as ~200px of dead
             rail hanging off the bottom of the column. */
          bodyClassName="flex flex-col"
        >
          <StateFingerprint view={view} />
          <p className="mt-auto pt-3 font-mono text-micro text-textMuted leading-relaxed">
            Similarity is Euclidean distance over these eight axes. <span className="text-textPrimary">Chain</span> factors read off the
            option chain and tape; the macro ones are the wider context — breadth, rates, session phase — that rounds out the
            eight-axis fingerprint.
          </p>
        </Panel>
      </div>

      {/* Calibration & edge decay */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Probability calibration
            </span>
          }
          subtitle="predicted target rate vs the rate the sampler drew"
          className="xl:col-span-6"
          tone={view.calibrationErrorPct <= 6 ? 'bull' : 'warn'}
        >
          <CalibrationPlot view={view} />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted">mean gap</span>
            <SignalBadge tone={view.calibrationErrorPct <= 6 ? 'bull' : 'warn'} dot>
              {view.calibrationErrorPct}pt error
            </SignalBadge>
          </div>
          <p className="mt-2 text-caption text-textSecondary leading-relaxed">{view.note}</p>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Edge decay
            </span>
          }
          subtitle="net edge captured as the trade is held longer"
          className="xl:col-span-6"
        >
          <EdgeDecayChart view={view} />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="font-mono text-micro uppercase tracking-wider text-textMuted">Peak edge</div>
              <div className="font-mono text-body font-semibold tnum text-textPrimary leading-5">
                {Math.max(...view.edgeDecay.map(p => p.edgePct)).toFixed(0)}pt
              </div>
            </div>
            <div>
              <div className="font-mono text-micro uppercase tracking-wider text-textMuted">MFE / MAE</div>
              <div className="font-mono text-body font-semibold tnum text-textPrimary leading-5">{view.edgeRatio.toFixed(2)}×</div>
            </div>
            <div>
              <div className="font-mono text-micro uppercase tracking-wider text-textMuted">Avg excursion</div>
              <div className="font-mono text-body font-semibold tnum text-textPrimary leading-5">
                +{view.avgMfePct.toFixed(1)}/−{view.avgMaePct.toFixed(1)}%
              </div>
            </div>
          </div>
          <p className="mt-2 text-caption text-textSecondary leading-relaxed">
            The white line is net edge (target minus stop) captured by each checkpoint; it climbs early then flattens as the
            winners resolve — the decay is the marginal edge, not the level. The faint green and red lines are cumulative
            target and stop hits.
          </p>
        </Panel>
      </div>

      {/* Recency split. Nothing was fitted and `daysAgo` is drawn independently of
          the outcome, so cutting the pool on it reports sampler drift and validates
          nothing — the labels here must not imply otherwise. */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Recency split
          </span>
        }
        subtitle="does the sampler drift across the pool"
        tone={Math.abs(view.oos.degradationPts) <= 5 ? 'bull' : 'warn'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Older half</span>
            <span className="font-mono text-2xl font-bold tnum text-textPrimary">{view.oos.inSampleTargetPct}%</span>
            <span className="font-mono text-micro text-textMuted tnum">{view.oos.inSampleN} analogs · target first</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Recent half</span>
            <span className={`font-mono text-2xl font-bold tnum ${Math.abs(view.oos.degradationPts) <= 5 ? 'text-textPrimary' : 'text-warn'}`}>
              {view.oos.outSampleTargetPct}%
            </span>
            <span className="font-mono text-micro text-textMuted tnum">{view.oos.outSampleN} analogs · target first</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Drift</span>
            <span className={`font-mono text-2xl font-bold tnum ${Math.abs(view.oos.degradationPts) <= 5 ? 'text-bull' : 'text-warn'}`}>
              {view.oos.degradationPts >= 0 ? '−' : '+'}
              {Math.abs(view.oos.degradationPts)}pt
            </span>
            <span className="font-mono text-micro text-textMuted tnum">
              {Math.abs(view.oos.degradationPts) <= 5 ? 'flat across the pool' : 'the halves disagree'}
            </span>
          </div>
        </div>
      </Panel>

      {/* Honest explainer */}
      <Panel bodyClassName="py-3">
        <p className="text-caption text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 text-textSecondary">How this reads</span>
          Market-State Replay synthesizes {view.pool} sessions around today's eight-factor state, keeps the {view.n} closest, and
          replays them against this setup's target and stop. No session here happened — the pool is generated by the same model that
          scores it, so every rate above is the size of a modeled assumption rather than a measurement. Dealer positioning, vol and
          options flow are read from the current chain and tape; breadth, rates and time-of-day are modeled macro context.
          Calibration checks the sampler against itself, since each outcome is drawn from its own predicted probability, and the
          recency split reports whether that sampler drifts across the pool. Neither can corroborate the model.
        </p>
      </Panel>
    </>
  );
};

export default MarketStateReplay;
