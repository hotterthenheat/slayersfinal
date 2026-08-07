import { useMemo, useState, type ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import { MUTED_INK, SPOT } from '../gex/palette';
import { Target, TrendingDown, Layers, Scale, History, ArrowDownUp, GitBranch } from 'lucide-react';
import {
  buildEarningsIntel,
  type EarningsIntelView,
  type Expression,
  type StateNode,
  type MispricedComponent,
  type CrushPoint,
} from '../../data/earningsintel';
import type { EarningsEvent } from '../../data/earnings';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import HoverReadout from '../ui/HoverReadout';
import { ChartTip, TipHead, TipRow, TipNote } from '../charts/ChartTip';
import { GRID, CURSOR, valueAxis, categoryAxis, axisVol, niceTicks } from '../charts/chartTheme';
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

/*
  ATM IV ramping into the print, then the overnight crush. On recharts, house
  chart theme.

  The vol axis is the point of this chart — the whole claim is how far implied
  runs above its own post-print baseline and how much of that is given back
  overnight — and the hand-rolled version had no vol axis at all, only a single
  dashed baseline with its value written beside it in <text>. The crush zone and
  the print marker are on the axis now rather than floating rectangles, so they
  stay aligned with the plot at any panel width.
*/
const CrushPath = ({ view }: { view: EarningsIntelView }) => {
  const pts = view.crushPath;
  const printIdx = pts.findIndex(p => p.phase === 'print');
  const printDay = pts[printIdx]?.day ?? 0;
  const lastDay = pts[pts.length - 1]?.day ?? 0;
  const ivs = pts.map(p => p.iv).concat(view.baseIv);
  const domain: [number, number] = [Math.min(...ivs) * 0.94, Math.max(...ivs) * 1.03];

  return (
    <div
      style={{ height: 200 }}
      className="w-full"
      role="img"
      aria-label={`Expected implied-volatility crush path: at-the-money IV runs to ${view.frontIv.toFixed(0)}% into the print, then gives back ${view.ivCrushPct.toFixed(0)}% overnight against a post-print baseline of ${view.baseIv.toFixed(0)}%.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 16, right: 6, bottom: 2, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            {...categoryAxis}
            type="number"
            dataKey="day"
            domain={[pts[0]?.day ?? 0, lastDay]}
            ticks={pts.filter(p => p.day % 2 === 0 || p.phase === 'print').map(p => p.day)}
            tickFormatter={(d: number) => pts.find(p => p.day === d)?.label ?? ''}
          />
          <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={axisVol} width={40} />
          {/* Everything after the print is the crush window. */}
          <ReferenceArea x1={printDay} x2={lastDay} fill="#FF9500" fillOpacity={0.05} />
          <ReferenceLine
            y={view.baseIv}
            stroke={MUTED_INK}
            strokeOpacity={0.6}
            strokeDasharray="4 3"
            label={{ value: `base IV ${view.baseIv.toFixed(0)}%`, position: 'insideTopLeft', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <ReferenceLine
            x={printDay}
            stroke="#FF9500"
            strokeOpacity={0.65}
            label={{ value: `PRINT · crush ${view.ivCrushPct.toFixed(0)}%`, position: 'insideTopRight', fill: '#FF9500', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <Tooltip
            cursor={CURSOR}
            content={
              <ChartTip<CrushPoint>
                render={p => {
                  const vsBase = p.iv - view.baseIv;
                  return (
                    <>
                      <TipHead sub="ATM implied">{p.label}</TipHead>
                      <TipRow label="Implied vol" value={`${p.iv.toFixed(1)}%`} />
                      <TipRow
                        label="vs post-print base"
                        value={`${vsBase >= 0 ? '+' : '−'}${Math.abs(vsBase).toFixed(1)} pt`}
                        tone={vsBase >= 0 ? 'text-warn' : 'text-bull'}
                      />
                      <TipNote>
                        {p.phase === 'print'
                          ? 'The print itself. Everything above the baseline is event premium, and it is gone by the next open whichever way the number lands.'
                          : p.phase === 'ramp'
                            ? 'Pre-print: event premium is still building, so anything bought here is paying for a catalyst that has not happened yet.'
                            : 'Post-print: the premium is crushed. What is left is the name\'s ordinary vol.'}
                      </TipNote>
                    </>
                  );
                }}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="iv"
            stroke={SPOT}
            strokeWidth={1.9}
            dot={(props: { cx?: number; cy?: number; payload?: CrushPoint }) => {
              const isPrint = props.payload?.phase === 'print';
              return (
                <circle
                  key={`${props.payload?.day}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={isPrint ? 3 : 1.8}
                  fill={isPrint ? '#FF9500' : SPOT}
                />
              );
            }}
            activeDot={{ r: 3.6, fill: SPOT, stroke: 'none' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Shared prob-vs-priced hover body — the delta is the number behind CHEAP/RICH. */
const ProbReadout = ({ label, movePct, prob, priced }: { label: string; movePct?: number; prob: number; priced: number }) => {
  const deltaPts = (prob - priced) * 100;
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-caption font-bold text-textPrimary">{label}</span>
        {movePct != null && (
          <span className={`font-mono text-micro tnum ${movePct > 0.05 ? 'text-bull' : movePct < -0.05 ? 'text-bear' : 'text-textSecondary'}`}>
            {fmtMove(movePct)}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-0.5 font-mono text-micro tnum">
        <div className="flex items-center gap-3">
          <span className="text-textMuted uppercase tracking-wider">model</span>
          <span className="ml-auto text-textPrimary">{(prob * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-textMuted uppercase tracking-wider">priced</span>
          <span className="ml-auto text-textPrimary">{(priced * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className={`mt-1 font-mono text-micro font-semibold tnum ${deltaPts >= 0 ? 'text-bull' : 'text-warn'}`}>
        {deltaPts >= 0 ? '+' : '−'}
        {Math.abs(deltaPts).toFixed(1)} pts vs priced · {deltaPts > 3 ? 'CHEAP' : deltaPts < -3 ? 'RICH' : 'fair'}
      </div>
    </>
  );
};

/** Model probability (bar) vs what the straddle + skew prices (tick). */
const StateRow = ({ s, maxP }: { s: StateNode; maxP: number }) => {
  const moveTone = s.movePct > 0.05 ? 'text-bull' : s.movePct < -0.05 ? 'text-bear' : 'text-textSecondary';
  const delta = s.prob - s.priced;
  const mis: { tone: Tone; label: string } | null =
    delta > 0.03 ? { tone: 'bull', label: 'CHEAP' } : delta < -0.03 ? { tone: 'warn', label: 'RICH' } : null;
  const [hx, setHx] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className="px-3.5 py-2 grid grid-cols-[92px_1fr_88px] items-center gap-3 cursor-crosshair hover:bg-rowHover"
      onMouseEnter={e => setHx({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setHx({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHx(null)}
    >
      <span className="flex flex-col">
        <span className="font-mono text-label font-semibold text-textPrimary">{s.label}</span>
        <span className={`font-mono text-micro tnum ${moveTone}`}>{fmtMove(s.movePct)}</span>
      </span>
      <div className="relative h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full rounded-full data-bar" style={{ width: `${(s.prob / maxP) * 100}%` }} />
        {/* what the market prices this state at */}
        <span className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(100, (s.priced / maxP) * 100)}%` }} aria-hidden />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="font-mono text-label tnum text-textSecondary">{(s.prob * 100).toFixed(0)}%</span>
        {mis && <SignalBadge tone={mis.tone}>{mis.label}</SignalBadge>}
      </div>
      {hx && (
        <HoverReadout x={hx.x} y={hx.y}>
          <ProbReadout label={s.label} movePct={s.movePct} prob={s.prob} priced={s.priced} />
        </HoverReadout>
      )}
    </div>
  );
};

const ExpressionCard = ({ expr, recommended }: { expr: Expression; recommended: boolean }) => {
  const tone: Tone = expr.side === 'LONG' ? 'bull' : 'magenta';
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" /> {expr.side === 'LONG' ? 'Long-vol expression' : 'Short-vol expression'}
        </span>
      }
      // The structure is the subject on both sides, so the long/short
      // distinction survives without the two verbs earnings.ts:198 forbids.
      subtitle={expr.side === 'LONG' ? 'pays for the move' : 'collects the crush'}
      tone={recommended ? tone : 'neutral'}
      emphasis={recommended}
      className="xl:col-span-6"
      // Not the board's QUALIFIED: that word is `EarningsVerdict.PLAY`, cut at
      // richness 0.85/1.3, while `recommended` here is cut at 0.9/1.18 — a
      // NO EDGE row could sit above a QUALIFIED card and the page would be
      // naming one state two ways again. This badge says why the card is
      // emphasised instead of putting a position forward.
      actions={recommended ? <SignalBadge tone={tone} dot pulse>ISOLATES THE MISPRICING</SignalBadge> : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-base font-bold ${expr.side === 'LONG' ? 'text-bull' : 'text-king'}`}>{expr.name}</span>
        <span className={`font-mono text-lg font-bold tnum ${evTone(expr.ev) === 'bull' ? 'text-bull' : evTone(expr.ev) === 'bear' ? 'text-bear' : 'text-textPrimary'}`}>
          {fmtEv(expr.ev)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="font-mono text-label uppercase tracking-wider text-textMuted">net EV · post spreads + crush</span>
        <SignalBadge tone={tone}>{expr.edgeLabel}</SignalBadge>
      </div>
      <p className="mt-2.5 font-mono text-label text-textSecondary">{expr.legs}</p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-label uppercase tracking-wider text-textMuted">Cost</div>
          <div className="font-mono text-caption text-textPrimary tnum">{expr.cost}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-label uppercase tracking-wider text-textMuted">Breakeven</div>
          <div className="font-mono text-caption text-textPrimary tnum">{expr.breakeven}</div>
        </div>
        <div className="rounded bg-white/[0.03] px-2 py-1.5">
          <div className="font-mono text-label uppercase tracking-wider text-textMuted">Structure</div>
          <div className="font-mono text-label text-textSecondary leading-tight">{expr.maxLabel}</div>
        </div>
      </div>
      <p className="mt-2.5 text-caption text-textSecondary leading-relaxed">{expr.fit}</p>
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
      className={`inline-flex items-center gap-1 font-mono text-label uppercase tracking-wider ${
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
const ProbBar = ({ model, priced, label, movePct }: { model: number; priced: number; label?: string; movePct?: number }) => {
  const [hx, setHx] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <span
        className="relative block h-2 rounded-full bg-white/[0.06] overflow-hidden cursor-crosshair"
        onMouseEnter={e => setHx({ x: e.clientX, y: e.clientY })}
        onMouseMove={e => setHx({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHx(null)}
      >
        <span className="block h-full rounded-full data-bar" style={{ width: `${Math.min(100, model * 100)}%` }} />
        <span className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(100, priced * 100)}%` }} aria-hidden />
      </span>
      {hx && label != null && (
        <HoverReadout x={hx.x} y={hx.y}>
          <ProbReadout label={label} movePct={movePct} prob={model} priced={priced} />
        </HoverReadout>
      )}
    </>
  );
};

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
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">Print</span>
          <span className="font-mono text-body font-bold text-textPrimary leading-5">
            {view.ticker} · implied ±{view.impliedMovePct.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-label tnum">
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
                    <span className={`font-mono text-caption font-semibold ${toneText[g.tone]}`}>{g.label}</span>
                  </span>
                  <ProbBar model={stat.model} priced={stat.priced} label={g.label} />
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="font-mono text-caption tnum text-textSecondary">{(stat.model * 100).toFixed(0)}%</span>
                    {stat.mis && <SignalBadge tone={stat.mis.tone}>{stat.mis.label}</SignalBadge>}
                  </span>
                </div>
                {isTarget && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <SignalBadge tone="select" dot>
                      Mispricing sits on this branch
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
                            <span className="font-mono text-caption text-textPrimary">{s.label}</span>
                            <span className={`font-mono text-label tnum ${moveTone}`}>{fmtMove(s.movePct)}</span>
                          </span>
                          <ProbBar model={s.prob} priced={s.priced} label={s.label} movePct={s.movePct} />
                          <span className="font-mono text-caption tnum text-textSecondary text-right">
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
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Select a print to open the event dossier</span>
      </Panel>
    );
  }

  const maxP = Math.max(...view.states.flatMap(s => [s.prob, s.priced]));

  return (
    <div className="flex flex-col gap-4">
      <MetricGrid min="168px">
        {/*
          "best trade" named a position and "Recommendation" was the advice word
          itself. Both replacements are kept under ~20 glyphs because a StatCard
          label truncates, and six cards on a 168px basis leave no more than that
          at the narrowest desktop — a clipped label is its own defect.
        */}
        <StatCard label="Net EV · best fit" value={fmtEv(view.netEv)} sub="after spreads + IV crush" tone={evTone(view.netEv)} emphasis />
        <StatCard label="Where the edge sits" value={recLabel[view.recommended]} sub={view.recommended === 'SKIP' ? 'no vol edge' : view.recommended === 'LONG' ? view.longVol.name : view.shortVol.name} tone={recTone[view.recommended]} />
        <StatCard label="Event vol extracted" value={`${view.eventVolPct.toFixed(1)}%`} sub="jump the base vol can’t explain" tone="neutral" />
        <StatCard label="IV crush" value={`${view.ivCrushPct.toFixed(0)}%`} sub={`${view.frontIv.toFixed(0)}% → ${view.baseIv.toFixed(0)}% ATM IV`} tone="warn" />
        <StatCard label="Straddle richness" value={`${view.richness.toFixed(2)}×`} sub={`imp ${view.impliedMovePct.toFixed(1)}% vs ${view.histAvgMovePct.toFixed(1)}% modeled`} tone={richTone(view.richness)} />
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
        <p className="text-read text-textPrimary leading-relaxed">{view.mispricing.headline}</p>
        <p className="mt-2 text-body text-textSecondary leading-relaxed">
          <span className={`font-mono text-micro font-semibold uppercase tracking-widest mr-2 ${componentTone[view.mispricing.component] === 'neutral' ? 'text-textSecondary' : ''}`}>
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
          <p className="mt-2 text-caption text-textSecondary leading-relaxed">
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
          <p className="px-3.5 py-2.5 border-t border-borderSubtle font-mono text-micro text-textMuted leading-relaxed">
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
                <span className="h-full data-bar" style={{ width: `${view.gapProb}%` }} />
                <span className="h-full bg-white/25" style={{ width: `${view.continuousProb}%` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-micro uppercase tracking-wider text-textMuted">
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

        {/*
          These rows are `printHistory` — the record earnings.ts generates for
          the name, the same eight reports the modeled average and the beat rate
          are counted over. "Similar-event search" named a population of real
          reports nobody searched, so the panel says whose prints these are and
          how many, and only the implied column is a draw.
        */}
        <Panel
          title={
            <span className="inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Modeled prior prints
            </span>
          }
          subtitle={`${view.analogs.length} modeled reports · straddle covered ${view.analogHitRate.toFixed(0)}%`}
          flush
          className="xl:col-span-7"
        >
          <div className="flex flex-col divide-y divide-borderSubtle">
            {view.analogs.map(a => {
              const max = Math.max(a.impliedPct, a.realizedPct, 1);
              return (
                <div key={a.tag} className="px-3.5 py-2 grid grid-cols-[54px_1fr_58px_54px] items-center gap-3">
                  <span className="font-mono text-label font-semibold text-textPrimary">{a.tag}</span>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 font-mono text-micro uppercase text-textMuted">imp</span>
                      <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <span className="block h-full rounded-full bg-white/30" style={{ width: `${(a.impliedPct / max) * 100}%` }} />
                      </span>
                      <span className="w-9 text-right font-mono text-micro text-textSecondary tnum">{a.impliedPct.toFixed(1)}%</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-6 font-mono text-micro uppercase text-textMuted">real</span>
                      <span className="flex-1 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                        <span className="block h-full rounded-full data-bar" style={{ width: `${(a.realizedPct / max) * 100}%` }} />
                      </span>
                      <span className={`w-9 text-right font-mono text-micro tnum ${a.direction === 'UP' ? 'text-bull' : 'text-bear'}`}>
                        {a.direction === 'UP' ? '+' : '−'}{a.realizedPct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted text-center">{a.gapped ? 'gapped' : 'grind'}</span>
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
        <p className="mt-3 font-mono text-label text-textMuted leading-relaxed">
          Each branch sums the state probabilities into a down / pin / up outcome; the bar is the odds, the white tick
          where the straddle + skew prices it. CHEAP = the read carries more of that branch than the market charges; the
          highlighted branch is the one the mispricing sits on.
        </p>
      </Panel>

      {/* Honest explainer */}
      <Panel bodyClassName="py-3">
        <p className="text-caption text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 text-textSecondary">Beyond the straddle</span>
          A single implied move hides the trade. This dossier strips the jump vol out of the front-month IV, traces the crush the
          overnight brings, and splits the reaction into an outcome distribution — so the edge is not &ldquo;vol is rich&rdquo; but
          which slice of that distribution the market has wrong. The highlighted expression is the one whose payoff maps onto exactly
          that slice, net EV taken after spreads and the IV crush. Implied move, richness and the event fields come straight from the
          earnings contract; base vol, 25Δ skew and the crush depth round out the read per name, and the prior prints are the record
          the model already generates for it.
        </p>
      </Panel>
    </div>
  );
};

export default EarningsIntel;
