import { useMemo, type ReactNode } from 'react';
import { Target, TrendingDown, Layers, Scale, History, ArrowDownUp, GitBranch } from 'lucide-react';
import {
  buildEarningsIntel,
  type EarningsIntelView,
  type Expression,
  type StateNode,
  type MispricedComponent,
} from '../../data/earningsintel';
import type { EarningsEvent } from '../../data/earnings';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import { toneText, type Tone } from '../ui/tones';

interface EarningsIntelProps {
  /** The selected print from the earnings board. Null renders the empty state. */
  event: EarningsEvent | null;
}

const fmtMove = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const fmtEv = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

const evTone = (v: number): Tone => (v > 0.1 ? 'bull' : v < -0.1 ? 'bear' : 'neutral');
const richTone = (r: number): Tone => (r >= 1.3 ? 'warn' : r <= 0.85 ? 'bull' : 'neutral');
const recLabel: Record<EarningsIntelView['recommended'], string> = {
  LONG: 'LONG VOL',
  SHORT: 'SHORT VOL',
  SKIP: 'NO EDGE',
};
const recTone: Record<EarningsIntelView['recommended'], Tone> = {
  LONG: 'bull',
  SHORT: 'magenta',
  SKIP: 'neutral',
};
const skewTone: Record<EarningsIntelView['skewLean'], Tone> = {
  PUT: 'bear',
  CALL: 'bull',
  BALANCED: 'neutral',
};
const componentTone: Record<MispricedComponent, Tone> = {
  STRADDLE_CHEAP: 'bull',
  STRADDLE_RICH: 'magenta',
  DOWNSIDE_SKEW: 'bear',
  UPSIDE_SKEW: 'bull',
  FAIR: 'neutral',
};
const componentLabel: Record<MispricedComponent, string> = {
  STRADDLE_CHEAP: 'STRADDLE CHEAP',
  STRADDLE_RICH: 'STRADDLE RICH',
  DOWNSIDE_SKEW: 'DOWN-GAP UNDERPRICED',
  UPSIDE_SKEW: 'UP-GAP UNDERPRICED',
  FAIR: 'FAIRLY PRICED',
};

/** ATM IV ramping into the print, then the overnight crush. */
const CrushPath = ({ view }: { view: EarningsIntelView }) => {
  const W = 560;
  const H = 184;
  const pts = view.crushPath;
  const n = pts.length;
  const ivs = pts.map(p => p.iv);
  const minIv = Math.min(...ivs) * 0.94;
  const maxIv = Math.max(...ivs) * 1.03;
  const X = (i: number) => 6 + (i / (n - 1)) * (W - 12);
  const Y = (iv: number) => H - ((iv - minIv) / (maxIv - minIv)) * (H - 30) - 12;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.iv).toFixed(1)}`).join(' ');
  const printIdx = pts.findIndex(p => p.phase === 'print');
  const px = X(printIdx);
  const baseY = Y(view.baseIv);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      {/* post-print crush zone */}
      <rect x={px} y={0} width={W - px} height={H} fill="rgba(255,149,0,0.05)" />
      {/* post-crush baseline */}
      <line x1={6} x2={W - 6} y1={baseY} y2={baseY} stroke="#6b6b6b" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="4 3" />
      <text x={8} y={baseY - 4} fontSize={8.5} fill="#7d7d7d" fontFamily="monospace">
        base IV {view.baseIv.toFixed(0)}%
      </text>
      {/* print marker */}
      <line x1={px} x2={px} y1={6} y2={H - 4} stroke="#FF9500" strokeOpacity={0.65} strokeWidth={1} />
      <text x={px + 4} y={14} fontSize={8.5} fill="#FF9500" fontFamily="monospace">
        PRINT · {view.frontIv.toFixed(0)}% → crush {view.ivCrushPct.toFixed(0)}%
      </text>
      {/* IV path */}
      <path d={line} fill="none" stroke="#ededed" strokeWidth={1.9} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={p.day} cx={X(i)} cy={Y(p.iv)} r={p.phase === 'print' ? 3 : 1.8} fill={p.phase === 'print' ? '#FF9500' : '#ededed'} />
      ))}
      {/* x labels */}
      {pts.map((p, i) =>
        p.day % 2 === 0 || p.phase === 'print' ? (
          <text key={`l${p.day}`} x={X(i)} y={H - 2} fontSize={7.5} fill="#6b6b6b" fontFamily="monospace" textAnchor="middle">
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  );
};

/** Model probability (bar) vs what the straddle + skew prices (tick). */
const StateRow = ({ s, maxP }: { s: StateNode; maxP: number }) => {
  const moveTone = s.movePct > 0.05 ? 'text-bull' : s.movePct < -0.05 ? 'text-bear' : 'text-textSecondary';
  const delta = s.prob - s.priced;
  const mis: { tone: Tone; label: string } | null =
    delta > 0.03 ? { tone: 'bull', label: 'CHEAP' } : delta < -0.03 ? { tone: 'warn', label: 'RICH' } : null;
  return (
    <div className="px-3.5 py-2 grid grid-cols-[92px_1fr_88px] items-center gap-3">
      <span className="flex flex-col">
        <span className="font-mono text-[11px] font-semibold text-textPrimary">{s.label}</span>
        <span className={`font-mono text-[10px] tnum ${moveTone}`}>{fmtMove(s.movePct)}</span>
      </span>
      <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full rounded-full holo-bar" style={{ width: `${(s.prob / maxP) * 100}%` }} />
        {/* what the market prices this state at */}
        <span className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(100, (s.priced / maxP) * 100)}%` }} aria-hidden />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="font-mono text-[11px] tnum text-textSecondary">{(s.prob * 100).toFixed(0)}%</span>
        {mis && <SignalBadge tone={mis.tone}>{mis.label}</SignalBadge>}
      </div>
    </div>
  );
};

const ExpressionCard = ({ expr, recommended }: { expr: Expression; recommended: boolean }) => {
  const tone: Tone = expr.side === 'LONG' ? 'bull' : 'magenta';
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" /> {expr.side === 'LONG' ? 'Best long-vol expression' : 'Best short-vol expression'}
        </span>
      }
      subtitle={expr.side === 'LONG' ? 'own the move' : 'sell the crush'}
      tone={recommended ? tone : 'neutral'}
      emphasis={recommended}
      className="xl:col-span-6"
      actions={recommended ? <SignalBadge tone={tone} dot pulse>THE TRADE</SignalBadge> : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-base font-bold ${expr.side === 'LONG' ? 'text-bull' : 'text-king'}`}>{expr.name}</span>
        <span className={`font-mono text-lg font-bold tnum ${evTone(expr.ev) === 'bull' ? 'text-bull' : evTone(expr.ev) === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
          {fmtEv(expr.ev)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">net EV · post spreads + crush</span>
        <SignalBadge tone={tone}>{expr.edgeLabel}</SignalBadge>
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-textSecondary">{expr.legs}</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Cost</div>
          <div className="font-mono text-[12px] text-textPrimary tnum">{expr.cost}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Breakeven</div>
          <div className="font-mono text-[12px] text-textPrimary tnum">{expr.breakeven}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Structure</div>
          <div className="font-mono text-[11px] text-textSecondary leading-tight">{expr.maxLabel}</div>
        </div>
      </div>
      <p className="mt-2.5 text-xs text-textSecondary leading-relaxed">{expr.fit}</p>
    </Panel>
  );
};

/*
  Report-time confirmation is inferred from proximity — near-dated prints carry a
  confirmed date/slot, further-out ones stay analyst-estimated. A read of the
  existing daysOut field, labeled honestly.
*/
const ReportTimeChip = ({ daysOut }: { daysOut: number }) => {
  const confirmed = daysOut <= 4;
  return (
    <span
      title={
        confirmed
          ? 'Report date & slot inferred confirmed — inside the near-term window'
          : 'Report date estimated — further-out prints stay analyst-estimated until confirmed'
      }
      className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider ${
        confirmed ? 'text-textSecondary' : 'text-warn'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${confirmed ? 'bg-textSecondary' : 'bg-warn'}`} />
      {confirmed ? 'confirmed' : 'est.'}
    </span>
  );
};

/** One rail-connected row in the scenario tree. */
const TreeRow = ({ last = false, children }: { last?: boolean; children: ReactNode }) => (
  <li className="relative pl-6">
    <span className="absolute left-2 top-0 w-px bg-borderMuted" style={{ height: last ? 24 : '100%' }} aria-hidden />
    <span className="absolute left-2 top-[24px] h-px w-3.5 bg-borderMuted" aria-hidden />
    {children}
  </li>
);

/** Model prob bar with the white priced tick — same grammar as the state rows. */
const ProbBar = ({ model, priced }: { model: number; priced: number }) => (
  <span className="relative block h-2 rounded-full bg-white/[0.06] overflow-hidden">
    <span className="block h-full rounded-full holo-bar" style={{ width: `${Math.min(100, model * 100)}%` }} />
    <span className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(100, priced * 100)}%` }} aria-hidden />
  </span>
);

/**
 * Post-earnings scenario tree — a structural branch of the reaction the model and
 * the market already price. Root = the print; the three branches (down / pin / up)
 * sum the existing state probabilities; the leaves are the five states verbatim.
 * Nothing new is computed — the branch figures are sums of the state array.
 */
const ScenarioTree = ({ view }: { view: EarningsIntelView }) => {
  const byKey = Object.fromEntries(view.states.map(s => [s.key, s] as const)) as Record<string, StateNode>;
  type Group = { key: string; label: string; tone: Tone; leaves: string[] };
  const groups: Group[] = [
    { key: 'down', label: 'Down reaction', tone: 'bear', leaves: ['gapDown', 'fade'] },
    { key: 'pin', label: 'Pin / muted', tone: 'neutral', leaves: ['pin'] },
    { key: 'up', label: 'Up reaction', tone: 'bull', leaves: ['pop', 'gapUp'] },
  ];
  // Which branch the recommended expression lives on — down/up wing, or the body for a short.
  const targetKey =
    view.recommended === 'SKIP'
      ? null
      : view.recommended === 'SHORT'
        ? 'pin'
        : view.downEdge >= view.upEdge
          ? 'down'
          : 'up';

  const branchStat = (leaves: string[]) => {
    const model = leaves.reduce((a, k) => a + (byKey[k]?.prob ?? 0), 0);
    const priced = leaves.reduce((a, k) => a + (byKey[k]?.priced ?? 0), 0);
    const delta = model - priced;
    const mis: { tone: Tone; label: string } | null =
      delta > 0.03 ? { tone: 'bull', label: 'CHEAP' } : delta < -0.03 ? { tone: 'warn', label: 'RICH' } : null;
    return { model, priced, mis };
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Root */}
      <div className="inst-surface rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Print</span>
          <span className="font-mono text-sm font-bold text-textPrimary">
            {view.ticker} · implied ±{view.impliedMovePct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tnum">
          <span className="text-textSecondary">
            gap <span className="text-textPrimary">{view.gapProb.toFixed(0)}%</span>
          </span>
          <span className="text-textMuted">·</span>
          <span className="text-textSecondary">
            continuation <span className="text-textPrimary">{view.continuousProb.toFixed(0)}%</span>
          </span>
        </div>
      </div>

      {/* Branches */}
      <ul className="flex flex-col">
        {groups.map((g, gi) => {
          const stat = branchStat(g.leaves);
          const isTarget = targetKey === g.key;
          return (
            <TreeRow key={g.key} last={gi === groups.length - 1}>
              <div
                className={`rounded-md px-3 py-2 ${
                  isTarget ? 'border border-select/40 bg-select/[0.06]' : 'border border-borderSubtle bg-white/[0.02]'
                }`}
              >
                <div className="grid grid-cols-[104px_1fr_84px] items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className={`font-mono text-[12px] font-semibold ${toneText[g.tone]}`}>{g.label}</span>
                  </span>
                  <ProbBar model={stat.model} priced={stat.priced} />
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="font-mono text-[12px] tnum text-textSecondary">{(stat.model * 100).toFixed(0)}%</span>
                    {stat.mis && <SignalBadge tone={stat.mis.tone}>{stat.mis.label}</SignalBadge>}
                  </span>
                </div>
                {isTarget && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <SignalBadge tone="select" dot>
                      Trade lives here
                    </SignalBadge>
                  </div>
                )}

                {/* Leaves — the individual states */}
                <ul className="mt-1.5 flex flex-col">
                  {g.leaves.map((k, li) => {
                    const s = byKey[k];
                    if (!s) return null;
                    const moveTone = s.movePct > 0.05 ? 'text-bull' : s.movePct < -0.05 ? 'text-bear' : 'text-textSecondary';
                    return (
                      <TreeRow key={k} last={li === g.leaves.length - 1}>
                        <div className="grid grid-cols-[104px_1fr_84px] items-center gap-3 py-0.5">
                          <span className="flex flex-col">
                            <span className="font-mono text-[12px] text-textPrimary">{s.label}</span>
                            <span className={`font-mono text-[11px] tnum ${moveTone}`}>{fmtMove(s.movePct)}</span>
                          </span>
                          <ProbBar model={s.prob} priced={s.priced} />
                          <span className="font-mono text-[12px] tnum text-textSecondary text-right">
                            {(s.prob * 100).toFixed(0)}%
                          </span>
                        </div>
                      </TreeRow>
                    );
                  })}
                </ul>
              </div>
            </TreeRow>
          );
        })}
      </ul>
    </div>
  );
};

const EarningsIntel = ({ event }: EarningsIntelProps) => {
  const view = useMemo(() => (event ? buildEarningsIntel(event) : null), [event]);

  if (!view) {
    return (
      <Panel className="h-56" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Select a print to open the event dossier</span>
      </Panel>
    );
  }

  const maxP = Math.max(...view.states.flatMap(s => [s.prob, s.priced]));

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="168px">
        <StatCard label="Net EV · best trade" value={fmtEv(view.netEv)} sub="after spreads + IV crush" tone={evTone(view.netEv)} emphasis />
        <StatCard label="Recommendation" value={recLabel[view.recommended]} sub={view.recommended === 'SKIP' ? 'no vol edge' : view.recommended === 'LONG' ? view.longVol.name : view.shortVol.name} tone={recTone[view.recommended]} />
        <StatCard label="Event vol extracted" value={`${view.eventVolPct.toFixed(1)}%`} sub="jump the base vol can’t explain" tone="neutral" />
        <StatCard label="IV crush" value={`${view.ivCrushPct.toFixed(0)}%`} sub={`${view.frontIv.toFixed(0)}% → ${view.baseIv.toFixed(0)}% ATM IV`} tone="warn" />
        <StatCard label="Straddle richness" value={`${view.richness.toFixed(2)}×`} sub={`imp ${view.impliedMovePct.toFixed(1)}% vs ${view.histAvgMovePct.toFixed(1)}% real`} tone={richTone(view.richness)} />
        <StatCard label="Reaction shape" value={`${view.gapProb.toFixed(0)}% gap`} sub={`${view.continuousProb.toFixed(0)}% continuation`} tone="neutral" />
      </MetricGrid>

      {/* The mispricing verdict — the reason this module exists */}
      <Panel tone={componentTone[view.mispricing.component]} bodyClassName="py-3.5" emphasis
        title={
          <span className="inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Mispriced component
          </span>
        }
        subtitle={`${view.ticker} · ${view.dateLabel} ${view.slot}`}
        actions={<SignalBadge tone={componentTone[view.mispricing.component]} dot>{componentLabel[view.mispricing.component]}</SignalBadge>}
      >
        <p className="text-[15px] text-textPrimary leading-relaxed">{view.mispricing.headline}</p>
        <p className="mt-2 text-sm text-textSecondary leading-relaxed">
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2 ${componentTone[view.mispricing.component] === 'neutral' ? 'holo-text' : ''}`}>
            Verdict
          </span>
          {view.mispricing.verdict}
        </p>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* IV-crush path */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> Expected IV-crush path
            </span>
          }
          subtitle="ATM IV around the print"
          className="xl:col-span-7"
          tone="warn"
        >
          <CrushPath view={view} />
          <p className="mt-2 text-xs text-textSecondary leading-relaxed">
            Front-month IV ramps to <span className="text-textPrimary tnum">{view.frontIv.toFixed(0)}%</span> holding the {view.eventVolPct.toFixed(1)}% jump, then
            collapses to the <span className="text-textPrimary tnum">{view.baseIv.toFixed(0)}%</span> baseline overnight — a{' '}
            <span className="text-warn tnum">{view.ivCrushPct.toFixed(0)}%</span> crush any long-premium structure has to out-run.
          </p>
        </Panel>

        {/* State-price distribution */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Earnings state distribution
            </span>
          }
          subtitle="model prob · tick = priced"
          flush
          className="xl:col-span-5"
        >
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.states.map(s => (
              <StateRow key={s.key} s={s} maxP={maxP} />
            ))}
          </div>
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed">
            Bar = outcome probability; the white tick is where the straddle + skew price it. Bar past the tick = a state the market
            discounts (CHEAP); tick past the bar = one it overpays for (RICH).
          </p>
        </Panel>
      </div>

      {/* Best long-vol / short-vol expressions */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <ExpressionCard expr={view.longVol} recommended={view.recommended === 'LONG'} />
        <ExpressionCard expr={view.shortVol} recommended={view.recommended === 'SHORT'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Gap vs continuation + skew */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <ArrowDownUp className="w-3.5 h-3.5" /> Gap vs continuation
            </span>
          }
          subtitle="how the move arrives"
          className="xl:col-span-5"
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold tnum text-textPrimary">{view.gapProb.toFixed(0)}%</span>
            <div className="flex-1">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.06]">
                <span className="h-full holo-bar" style={{ width: `${view.gapProb}%` }} />
                <span className="h-full bg-white/25" style={{ width: `${view.continuousProb}%` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-textMuted">
                <span>Overnight gap</span>
                <span>Continuation</span>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatCard label="Expected gap" value={`${view.gapExpectedPct.toFixed(1)}%`} sub="one-and-done overnight" tone="neutral" />
            <StatCard label="25Δ skew" value={`${view.skewRR >= 0 ? '+' : '−'}${Math.abs(view.skewRR).toFixed(1)} pts`} sub={`${view.skewLean.toLowerCase()} skew`} tone={skewTone[view.skewLean]} />
          </div>
        </Panel>

        {/* Similar-event search */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Similar-event search
            </span>
          }
          subtitle={`${view.analogHitRate.toFixed(0)}% straddle-covered`}
          flush
          className="xl:col-span-7"
        >
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.analogs.map(a => {
              const max = Math.max(a.impliedPct, a.realizedPct, 1);
              return (
                <div key={a.tag} className="px-3.5 py-2 grid grid-cols-[54px_1fr_58px_54px] items-center gap-3">
                  <span className="font-mono text-[11px] font-semibold text-textPrimary">{a.tag}</span>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 font-mono text-[8px] uppercase text-textMuted">imp</span>
                      <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <span className="block h-full rounded-full bg-white/30" style={{ width: `${(a.impliedPct / max) * 100}%` }} />
                      </span>
                      <span className="w-9 text-right font-mono text-[9px] text-textSecondary tnum">{a.impliedPct.toFixed(1)}%</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 font-mono text-[8px] uppercase text-textMuted">real</span>
                      <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <span className="block h-full rounded-full holo-bar" style={{ width: `${(a.realizedPct / max) * 100}%` }} />
                      </span>
                      <span className={`w-9 text-right font-mono text-[9px] tnum ${a.direction === 'UP' ? 'text-bull' : 'text-bear'}`}>
                        {a.direction === 'UP' ? '+' : '−'}{a.realizedPct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted text-center">{a.gapped ? 'gapped' : 'grind'}</span>
                  <div className="flex justify-end">
                    <SignalBadge tone={a.covered ? 'bull' : 'warn'}>{a.covered ? 'COVER' : 'BUST'}</SignalBadge>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Post-earnings scenario tree — structural branch of the reaction */}
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5" /> Post-earnings scenario tree
          </span>
        }
        subtitle="how the reaction branches"
        actions={<ReportTimeChip daysOut={view.daysOut} />}
      >
        <ScenarioTree view={view} />
        <p className="mt-3 font-mono text-[11px] text-textMuted leading-relaxed">
          Each branch sums the state probabilities into a down / pin / up outcome; the bar is the odds, the white tick
          where the straddle + skew prices it. CHEAP = the read carries more of that branch than the market charges; the
          highlighted branch is where the recommended structure lives.
        </p>
      </Panel>

      {/* Honest explainer */}
      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond the straddle</span>
          A single implied move hides the trade. This dossier strips the jump vol out of the front-month IV, traces the crush the
          overnight brings, and splits the reaction into an outcome distribution — so the edge is not &ldquo;vol is rich&rdquo; but
          which slice of that distribution the market has wrong. The recommended expression is the one that harvests exactly that slice,
          net EV taken after spreads and the IV crush. Implied move, richness and the event fields come straight from the earnings
          contract; base vol, 25Δ skew, the crush depth and the prior-print analogs round out the read per name.
        </p>
      </Panel>
    </div>
  );
};

export default EarningsIntel;
