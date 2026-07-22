import { useMemo } from 'react';
import { History, Target, Activity, TrendingDown, Layers } from 'lucide-react';
import {
  buildStateReplay,
  type StateReplayView,
  type SimSession,
  type Outcome,
  type MatchQuality,
} from '../../data/statereplay';
import type { MarketSnapshot } from '../../types/market';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import type { Tone } from '../ui/tones';

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
const SERIES = '#ededed';
const GREEN = '#30D158';
const RED = '#FF3B30';
const AMBER = '#FF9500';
const MUTED = '#6b6b6b';

/** Stacked outcome distribution — target (foil) / stop (red) / neither (dim). */
const OutcomeBar = ({ view }: { view: StateReplayView }) => (
  <div>
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <span className="holo-bar h-full" style={{ width: `${view.targetPct}%` }} title={`Target first ${view.targetPct}%`} />
      <span className="h-full bg-bear/70" style={{ width: `${view.stopPct}%` }} title={`Stop first ${view.stopPct}%`} />
      <span className="h-full bg-white/15" style={{ width: `${view.neitherPct}%` }} title={`Neither ${view.neitherPct}%`} />
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px]">
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="holo-bar h-1.5 w-1.5 rounded-full" /> Target <span className="tnum text-bull ml-auto text-[12px] font-semibold">{view.targetPct}%</span>
      </span>
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-bear/80" /> Stop <span className="tnum text-bear ml-auto text-[12px] font-semibold">{view.stopPct}%</span>
      </span>
      <span className="flex items-center gap-1.5 text-textMuted uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-white/30" /> Neither <span className="tnum text-textPrimary ml-auto text-[12px] font-semibold">{view.neitherPct}%</span>
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
      <span className="font-mono text-[10px] text-textSecondary tnum">{s.id}</span>
      <div className="min-w-0">
        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="holo-bar block h-full rounded-full" style={{ width: `${Math.round(s.sim * 100)}%` }} />
        </div>
        <span className="mt-0.5 block font-mono text-[9px] text-textMuted tnum">
          sim {Math.round(s.sim * 100)}% · {s.daysAgo}d ago · +{s.mfePct.toFixed(1)}/−{s.maePct.toFixed(1)}%
        </span>
      </div>
      <SignalBadge tone={tone}>{outcomeLabel[s.outcome]}</SignalBadge>
      <span className={`text-right font-mono text-[12px] font-semibold tnum ${s.rMultiple >= 0 ? 'text-bull' : 'text-bear'}`}>{rTxt}</span>
    </div>
  );
};

/** Reliability plot — predicted P(target) on X, realized frequency on Y. */
const CalibrationPlot = ({ view }: { view: StateReplayView }) => {
  const W = 250;
  const H = 180;
  const pad = 22;
  const X = (p: number) => pad + (p / 100) * (W - pad - 6);
  const Y = (p: number) => H - pad - (p / 100) * (H - pad - 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* frame */}
      <line x1={pad} y1={H - pad} x2={W - 6} y2={H - pad} stroke="#2a2a2a" strokeWidth={1} />
      <line x1={pad} y1={8} x2={pad} y2={H - pad} stroke="#2a2a2a" strokeWidth={1} />
      {/* perfect-calibration diagonal */}
      <line x1={X(0)} y1={Y(0)} x2={X(100)} y2={Y(100)} stroke={MUTED} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />
      <text x={X(100) - 2} y={Y(100) + 2} fontSize={7.5} fill={MUTED} fontFamily="monospace" textAnchor="end">
        ideal
      </text>
      {/* points */}
      {view.calibration.map((b, i) => (
        <g key={i}>
          <line x1={X(b.predictedPct)} y1={Y(b.predictedPct)} x2={X(b.predictedPct)} y2={Y(b.realizedPct)} stroke={AMBER} strokeOpacity={0.45} strokeWidth={1} />
          <circle cx={X(b.predictedPct)} cy={Y(b.realizedPct)} r={Math.max(2.5, Math.min(6, 2 + b.count / 12))} fill={SERIES} fillOpacity={0.9} />
        </g>
      ))}
      <text x={pad} y={H - 6} fontSize={7.5} fill={MUTED} fontFamily="monospace">
        predicted →
      </text>
      <text x={6} y={14} fontSize={7.5} fill={MUTED} fontFamily="monospace">
        realized ↑
      </text>
    </svg>
  );
};

/** Edge captured (target − stop) as the trade is held longer. */
const EdgeDecayChart = ({ view }: { view: StateReplayView }) => {
  const W = 250;
  const H = 180;
  const pad = 22;
  const pts = view.edgeDecay;
  const maxBar = view.horizonBars;
  const maxEdge = Math.max(10, ...pts.map(p => p.cumTargetPct));
  const X = (b: number) => pad + (b / maxBar) * (W - pad - 6);
  const Y = (v: number) => H - pad - (v / maxEdge) * (H - pad - 8);
  const path = (sel: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.bar).toFixed(1)},${Y(sel(p)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <line x1={pad} y1={H - pad} x2={W - 6} y2={H - pad} stroke="#2a2a2a" strokeWidth={1} />
      <line x1={pad} y1={8} x2={pad} y2={H - pad} stroke="#2a2a2a" strokeWidth={1} />
      {/* cumulative target / stop as faint context */}
      <path d={path(p => p.cumStopPct)} fill="none" stroke={RED} strokeOpacity={0.4} strokeWidth={1} />
      <path d={path(p => p.cumTargetPct)} fill="none" stroke={GREEN} strokeOpacity={0.4} strokeWidth={1} />
      {/* net edge — the headline line */}
      <path d={path(p => p.edgePct)} fill="none" stroke={SERIES} strokeWidth={1.9} />
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.bar)} cy={Y(p.edgePct)} r={2} fill={SERIES} />
      ))}
      <text x={pad} y={H - 6} fontSize={7.5} fill={MUTED} fontFamily="monospace">
        bars held →
      </text>
      <text x={6} y={14} fontSize={7.5} fill={MUTED} fontFamily="monospace">
        net edge ↑
      </text>
    </svg>
  );
};

/** Today's 8-factor market-state fingerprint. */
const StateFingerprint = ({ view }: { view: StateReplayView }) => (
  <div className="flex flex-col gap-2">
    {view.factors.map(f => (
      <div key={f.key} className="grid grid-cols-[110px_1fr_58px] items-center gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-textSecondary truncate">{f.label}</span>
        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="holo-bar block h-full rounded-full" style={{ width: `${Math.round(f.value * 100)}%` }} />
        </div>
        <span className="flex items-center justify-end gap-1.5">
          <span className="font-mono text-[10px] tnum text-textPrimary">{Math.round(f.value * 100)}</span>
          <span
            className={`font-mono text-[8px] uppercase tracking-wider ${f.live ? 'holo-text' : 'text-textMuted'}`}
            title={f.live ? 'read from the live chain/tape' : 'modeled macro context'}
          >
            {f.live ? 'live' : 'mdl'}
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
          sub={`${view.n} comparable sessions`}
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
          label="Out-of-sample"
          value={`${view.oos.outSampleTargetPct}%`}
          sub={`holdout · Δ${view.oos.degradationPts >= 0 ? '−' : '+'}${Math.abs(view.oos.degradationPts)}pt`}
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
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span
            className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${
              view.edgePts >= 4 ? 'text-bull' : view.edgePts <= -4 ? 'text-bear' : 'text-warn'
            }`}
          >
            The receipts
          </span>
          {view.headline}
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-textSecondary tnum">{view.receipts}</p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Comparable sessions + outcome distribution */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Comparable sessions
            </span>
          }
          subtitle={`${view.n} closest analogs of ${view.pool} scanned`}
          className="xl:col-span-7"
          flush
        >
          <div className="p-4">
            <OutcomeBar view={view} />
          </div>
          <div className="flex items-center justify-between border-y border-borderSubtle px-3.5 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">closest analogs</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">outcome · result</span>
          </div>
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.topSessions.map(s => (
              <SessionRow key={s.id} s={s} />
            ))}
          </div>
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed">
            Target first vs stop first is scored against this setup's own geometry — {view.targetDistPct.toFixed(1)}% to target,{' '}
            {view.stopDistPct.toFixed(1)}% to stop ({view.rr.toFixed(1)}:1). Excess over the {view.baselineTargetPct}% a no-edge
            session posts is the edge: {view.edgePts >= 0 ? '+' : ''}
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
        >
          <StateFingerprint view={view} />
          <p className="mt-3 font-mono text-[10px] text-textMuted leading-relaxed">
            Similarity is Euclidean distance over these eight axes. <span className="holo-text">Live</span> factors read off the chain
            and tape; <span className="text-textSecondary">modeled</span> factors are macro context that swaps for a real feed behind
            the same contract.
          </p>
        </Panel>
      </div>

      {/* Calibration & edge decay */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Probability calibration
            </span>
          }
          subtitle="predicted target rate vs what actually happened"
          className="xl:col-span-6"
          tone={view.calibrationErrorPct <= 6 ? 'bull' : 'warn'}
        >
          <CalibrationPlot view={view} />
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">mean gap</span>
            <SignalBadge tone={view.calibrationErrorPct <= 6 ? 'bull' : 'warn'} dot>
              {view.calibrationErrorPct}pt error
            </SignalBadge>
          </div>
          <p className="mt-2 text-xs text-textSecondary leading-relaxed">{view.note}</p>
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
              <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Peak edge</div>
              <div className="font-mono text-sm font-semibold tnum holo-text">
                {Math.max(...view.edgeDecay.map(p => p.edgePct)).toFixed(0)}pt
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">MFE / MAE</div>
              <div className="font-mono text-sm font-semibold tnum text-textPrimary">{view.edgeRatio.toFixed(2)}×</div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-textMuted">Avg excursion</div>
              <div className="font-mono text-sm font-semibold tnum text-textPrimary">
                +{view.avgMfePct.toFixed(1)}/−{view.avgMaePct.toFixed(1)}%
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-textSecondary leading-relaxed">
            The white line is net edge (target minus stop) captured by each checkpoint; it climbs early then flattens as the
            winners resolve — the decay is the marginal edge, not the level. The faint green and red lines are cumulative
            target and stop hits.
          </p>
        </Panel>
      </div>

      {/* Out-of-sample split */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> In-sample vs out-of-sample
          </span>
        }
        subtitle="does the target rate hold on analogs the read wasn't fit to"
        tone={Math.abs(view.oos.degradationPts) <= 5 ? 'bull' : 'warn'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">In-sample</span>
            <span className="font-mono text-2xl font-bold tnum text-textPrimary">{view.oos.inSampleTargetPct}%</span>
            <span className="font-mono text-[10px] text-textMuted tnum">older {view.oos.inSampleN} analogs · target first</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">Out-of-sample</span>
            <span className={`font-mono text-2xl font-bold tnum ${Math.abs(view.oos.degradationPts) <= 5 ? 'holo-text' : 'text-warn'}`}>
              {view.oos.outSampleTargetPct}%
            </span>
            <span className="font-mono text-[10px] text-textMuted tnum">recent {view.oos.outSampleN} held out · target first</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-textMuted">Degradation</span>
            <span className={`font-mono text-2xl font-bold tnum ${Math.abs(view.oos.degradationPts) <= 5 ? 'text-bull' : 'text-warn'}`}>
              {view.oos.degradationPts >= 0 ? '−' : '+'}
              {Math.abs(view.oos.degradationPts)}pt
            </span>
            <span className="font-mono text-[10px] text-textMuted tnum">
              {Math.abs(view.oos.degradationPts) <= 5 ? 'holds out of sample' : 'softens on the holdout'}
            </span>
          </div>
        </div>
      </Panel>

      {/* Honest explainer */}
      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">How this reads</span>
          Market-State Replay asks the only question a backtest should: not "what does the pattern say" but "what happened the last
          time the whole board looked like this." It scores {view.pool} prior sessions against today's eight-factor state, keeps the{' '}
          {view.n} closest, and replays their outcomes against this setup's actual target and stop. Dealer positioning, vol and options
          flow are read from the live chain and tape; breadth, rates, news and time-of-day are modeled macro context and swap for real
          feeds behind the same contract. Every session here is a deterministic simulation — the calibration and out-of-sample panels
          exist so the read has to prove it holds on data it wasn't fit to, rather than asking you to take the headline number on faith.
        </p>
      </Panel>
    </>
  );
};

export default MarketStateReplay;
