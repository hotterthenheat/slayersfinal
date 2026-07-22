import { useMemo, useState, type ReactNode } from 'react';
import { GitMerge, Zap, Timer, ChevronRight, AlertTriangle, Layers } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { BULL } from '../gex/palette';
import {
  buildMetaorderView,
  type ChildPrint,
  type InfoClass,
  type Metaorder,
  type Urgency,
} from '../../data/metaorder';
import Panel from '../ui/Panel';
import StatCard from '../ui/StatCard';
import MetricGrid from '../ui/MetricGrid';
import SignalBadge from '../ui/SignalBadge';
import HoverReadout from '../ui/HoverReadout';
import type { Tone } from '../ui/tones';

const fmtUsd = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

const fmtNum = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(a / 1e3).toFixed(1)}K`;
  return `${Math.round(a)}`;
};

const signed = (v: number): string => `${v >= 0 ? '+' : ''}${v}`;

const dirTone = (dir: number): Tone => (dir > 0 ? 'bull' : dir < 0 ? 'bear' : 'warn');

const urgencyTone: Record<Urgency, Tone> = {
  LOW: 'bull',
  MED: 'warn',
  HIGH: 'bear',
};

const infoClassTone: Record<InfoClass, Tone> = {
  INFORMED: 'magenta',
  MIXED: 'neutral',
  HEDGE: 'warn',
};

// ── Inferred-basis wording, all read straight off values the engine already computed ──

/** Dominant aggressor from the premium-weighted ask share (existing askPct). */
const dominantSide = (m: Metaorder): string =>
  m.askPct >= 55 ? 'ask-side buy aggression' : m.askPct <= 45 ? 'bid-side supply' : 'a two-sided book';

/** Compact leg-geometry string from the legs the engine already collapsed. */
const legsSummary = (m: Metaorder): string =>
  m.legs.map(l => `${fmtNum(l.size)}× ${l.strike}${l.right}`).join(' / ');

/** Qualitative confidence descriptor — binned from how much has actually printed. */
const printedWord = (m: Metaorder): string =>
  m.pctComplete >= 70 ? 'well-printed' : m.pctComplete >= 45 ? 'forming' : 'early read';

const printedClass = (m: Metaorder): string =>
  m.pctComplete >= 70 ? 'text-textPrimary' : m.pctComplete >= 45 ? 'text-textSecondary' : 'text-textMuted';

/** Why the tape's child prints were clustered into one parent. */
const whyGrouped = (m: Metaorder): string => {
  const first = m.children[0];
  const last = m.children[m.children.length - 1];
  return `These ${m.childCount} child prints were grouped because they share the same strike geometry (${legsSummary(
    m
  )}), lean on ${dominantSide(m)} (${m.askPct.toFixed(0)}% at the ask), and all printed inside one ~${
    m.minsElapsed
  }-min window (${first?.time}–${last?.time}) at ${m.sweepShare.toFixed(0)}% sweeps.`;
};

/** Alternate structures the same prints could be — each tied to an existing signal. */
const alternates = (m: Metaorder): string[] => {
  const closePct = Math.max(0, 100 - m.openingProb);
  return [
    `Position exit / unwind rather than a fresh ${m.phrase} — the opening read is only ${m.openingProb}%, so ~${closePct}% of this could be someone closing existing exposure.`,
    m.infoClass === 'INFORMED'
      ? 'Mechanical or dealer-hedge flow that merely looks informed — the informed-vs-hedge split is the model’s call, not confirmed intent.'
      : m.infoClass === 'HEDGE'
        ? 'A directional bet wearing a hedge’s footprint — the hedge label is inferred from leg geometry, not from a known underlying position.'
        : 'Either a genuine view or routine hedging — the footprint sits between the two and the split is inferred.',
    m.legs.length > 1
      ? `${m.legs.length} unrelated orders that happened to cluster by strike and timing, rather than one worked parent.`
      : 'Several desks lifting the same strike independently, rather than a single worked parent.',
  ];
};

/** What evidence would break the inferred grouping. */
const invalidation = (m: Metaorder): string => {
  const opp = m.legs[0]?.side === 'ASK' ? 'bid' : 'ask';
  const legClause =
    m.legs.length > 1 ? 'the short leg clearing on its own book' : 'the clip printing against an opposing order';
  return `A confirming print lifting the ${opp} side, ${legClause}, or the flow stalling past the inferred ${m.minsRemainingHi}-min finish window without follow-through would break this grouping.`;
};

const PER_OUTPUT_CAVEAT =
  'Inferred from the session tape — no order-audit trail or ticket IDs confirm these prints belong to one parent.';

/** One micro-labelled reading in a card's stat row. */
const Cell = ({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: Tone }) => {
  const color =
    tone === 'bull'
      ? 'text-bull'
      : tone === 'bear'
        ? 'text-bear'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'select'
            ? 'text-select'
            : tone === 'magenta'
              ? 'text-king'
              : 'text-textPrimary';
  return (
    <div className="min-w-0">
      <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted truncate">{label}</div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold tnum truncate ${color}`}>{value}</div>
    </div>
  );
};

/** Child-print execution timeline — clip size = radius, ask-lifts read green. */
const Timeline = ({ prints }: { prints: ChildPrint[] }) => {
  const W = 520;
  const H = 44;
  const padX = 7;
  const fracs = prints.map(p => p.atFrac);
  const lo = Math.min(...fracs);
  const hi = Math.max(...fracs);
  const range = Math.max(hi - lo, 0.01);
  const maxSize = Math.max(...prints.map(p => p.size), 1);
  const X = (f: number) => padX + ((f - lo) / range) * (W - 2 * padX);
  const yMid = H / 2;
  const R = (s: number) => 2 + (s / maxSize) * 5;
  const [hover, setHover] = useState<{ p: ChildPrint; x: number; y: number } | null>(null);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="inferred child-print execution timeline">
        <line x1={padX} x2={W - padX} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {prints.map(p => {
          // aggressor colour follows the app convention (ask-lift = green buy
          // aggression, bid = muted supply); silver is reserved for selection.
          const fill = p.side === 'ASK' ? BULL : 'rgba(150,160,180,0.4)';
          return (
            <circle
              key={p.id}
              cx={X(p.atFrac)}
              cy={yMid}
              r={R(p.size)}
              fill={fill}
              stroke={p.orderType === 'SWEEP' ? 'rgba(255,255,255,0.55)' : 'none'}
              strokeOpacity={p.orderType === 'SWEEP' ? 0.8 : 0}
              strokeWidth={p.orderType === 'SWEEP' ? 1 : 0}
            />
          );
        })}
        {/* enlarged transparent hit-targets so each clip is easy to hover */}
        {prints.map(p => (
          <circle
            key={`hit-${p.id}`}
            cx={X(p.atFrac)}
            cy={yMid}
            r={Math.max(R(p.size) + 3, 8)}
            fill="transparent"
            className="cursor-crosshair"
            onMouseMove={e => setHover({ p, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover && (
        <HoverReadout x={hover.x} y={hover.y}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{hover.p.time}</span>
            <span
              className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${
                hover.p.side === 'ASK' ? 'text-bull' : 'text-textSecondary'
              }`}
            >
              {hover.p.side === 'ASK' ? 'ask-lift' : 'bid'}
            </span>
          </div>
          <div className="mt-1 font-mono text-[13px] font-bold tnum text-textPrimary">
            {hover.p.strike}
            {hover.p.right} · {fmtNum(hover.p.size)}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 font-mono text-[10px] tnum text-textSecondary">
            <span>{fmtUsd(hover.p.premium)}</span>
            <span className={hover.p.orderType === 'SWEEP' ? 'text-warn' : 'text-textMuted'}>{hover.p.orderType}</span>
          </div>
        </HoverReadout>
      )}
    </>
  );
};

/** Expandable table of the individual child prints the parent was inferred from. */
const ChildPrintTable = ({ prints }: { prints: ChildPrint[] }) => (
  <div className="mt-2 overflow-x-auto rounded-md border border-borderSubtle">
    <table className="w-full text-left font-mono text-[11px] tnum">
      <thead>
        <tr className="border-b border-borderSubtle text-[10px] uppercase tracking-wider text-textMuted">
          <th className="px-2.5 py-1.5 font-medium">Time</th>
          <th className="px-2.5 py-1.5 font-medium">Strike</th>
          <th className="px-2.5 py-1.5 font-medium text-right">Size</th>
          <th className="px-2.5 py-1.5 font-medium text-right">Premium</th>
          <th className="px-2.5 py-1.5 font-medium">Side</th>
          <th className="px-2.5 py-1.5 font-medium">Type</th>
        </tr>
      </thead>
      <tbody>
        {prints.map(c => (
          <tr key={c.id} className="border-b border-borderSubtle/60 last:border-0">
            <td className="px-2.5 py-1 text-textSecondary">{c.time}</td>
            <td className="px-2.5 py-1 text-textPrimary">
              {c.strike}
              {c.right}
            </td>
            <td className="px-2.5 py-1 text-right text-textPrimary">{fmtNum(c.size)}</td>
            <td className="px-2.5 py-1 text-right text-textSecondary">{fmtUsd(c.premium)}</td>
            <td className="px-2.5 py-1 text-textSecondary">{c.side}</td>
            <td className="px-2.5 py-1 text-textMuted">{c.orderType}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** A single reassembled parent order — the inferred reconstruction, not just the tape line. */
const MetaorderRow = ({ m }: { m: Metaorder }) => {
  const [showPrints, setShowPrints] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  const tone = dirTone(m.dir);
  const first = m.children[0];
  const last = m.children[m.children.length - 1];
  return (
    <div className="px-4 py-3.5 flex flex-col gap-3">
      {/* header — inferred strategy + classification */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-textPrimary">
            {m.strategy}
          </span>
          <span className="ml-2 font-mono text-[11px] text-textMuted">
            inferred · {m.childCount} clips · {m.legs.length} leg{m.legs.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SignalBadge tone={infoClassTone[m.infoClass]}>{m.infoClass}</SignalBadge>
          <SignalBadge tone={urgencyTone[m.urgency]} dot>
            {m.urgency} URG
          </SignalBadge>
        </div>
      </div>

      {/* the reconstruction, stated */}
      <p className="text-[13px] text-textPrimary leading-relaxed">{m.headline}</p>

      {/* inferred confidence range — size floor→ceiling and finish window, both already computed */}
      <div className="rounded-md border border-borderSubtle bg-white/[0.02] px-3 py-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Inferred size range</span>
          <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">
            {fmtUsd(m.filledUsd)} <span className="text-textMuted">confirmed →</span> {fmtUsd(m.estTotalUsd)}{' '}
            <span className="text-textMuted">inferred</span>
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Inferred confidence</span>
          <span className={`font-mono text-[13px] font-semibold uppercase ${printedClass(m)}`}>
            {printedWord(m)} · {m.pctComplete}% printed
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Finish window</span>
          <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">
            {m.minsRemainingLo}–{m.minsRemainingHi}m
          </span>
        </div>
      </div>

      {/* inferred completion bar */}
      <div>
        <div className="flex items-center justify-between mb-1 font-mono text-[11px]">
          <span className="uppercase tracking-wider text-textMuted">{m.pctComplete}% inferred complete</span>
          <span className="tnum text-textSecondary">
            {fmtUsd(m.filledUsd)} worked of {fmtUsd(m.estTotalUsd)} est.
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${m.pctComplete}%` }} />
        </div>
      </div>

      {/* inferred readings */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2.5 pt-0.5">
        <Cell label="Inferred total" value={fmtUsd(m.estTotalUsd)} tone={tone} />
        <Cell label="Time left" value={`${m.minsRemainingLo}–${m.minsRemainingHi}m`} tone={urgencyTone[m.urgency]} />
        <Cell label="Flow half-life" value={`${m.halfLifeMin}m`} />
        <Cell label="Opening prob" value={`${m.openingProb}%`} tone={m.openingProb >= 55 ? 'select' : 'neutral'} />
        <Cell label="Ask-lift" value={`${m.askPct.toFixed(0)}%`} />
        <Cell label="Dir. info" value={`${signed(m.infoScore)} · ${m.infoLabel}`} tone={tone} />
      </div>

      {/* legs */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap border-t border-borderSubtle pt-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted">Legs</span>
        {m.legs.map(leg => (
          <span key={`${leg.strike}-${leg.right}`} className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <span className={leg.action === 'BOUGHT' ? 'text-bull' : 'text-bear'}>
              {leg.action === 'BOUGHT' ? 'LONG' : 'SHORT'}
            </span>
            <span className="text-textPrimary tnum">
              {fmtNum(leg.size)} · {leg.strike}
              {leg.right}
            </span>
            <span className="text-textMuted">@ {leg.side}</span>
          </span>
        ))}
      </div>

      {/* why these prints were grouped into one inferred parent */}
      <div className="border-t border-borderSubtle pt-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-textMuted mr-2">Why grouped</span>
        <span className="text-[12px] text-textSecondary leading-relaxed">{whyGrouped(m)}</span>
      </div>

      {/* execution timeline */}
      <div>
        <Timeline prints={m.children} />
        <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-textMuted tnum">
          <span>{first?.time}</span>
          <span className="uppercase tracking-widest">
            worked over ~{m.minsElapsed}m · {m.sweepShare.toFixed(0)}% sweeps
          </span>
          <span>{last?.time}</span>
        </div>
      </div>

      {/* the inferred read */}
      <p className="text-[11px] text-textMuted leading-relaxed">{m.read}</p>

      {/* expandable disclosure — child prints + alternates + what would invalidate this */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-0.5">
        <button
          type="button"
          onClick={() => setShowPrints(v => !v)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          aria-expanded={showPrints}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showPrints ? 'rotate-90' : ''}`} />
          <Layers className="w-3.5 h-3.5" />
          {showPrints ? 'Hide' : 'Show'} {m.childCount} inferred child prints
        </button>
        <button
          type="button"
          onClick={() => setShowBasis(v => !v)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          aria-expanded={showBasis}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showBasis ? 'rotate-90' : ''}`} />
          Alternates · what would invalidate this
        </button>
      </div>

      {showPrints && <ChildPrintTable prints={m.children} />}

      {showBasis && (
        <div className="rounded-md border border-borderSubtle bg-white/[0.02] p-3 flex flex-col gap-3">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-textMuted mb-1.5">
              Alternate structures these prints could be
            </div>
            <ul className="flex flex-col gap-1.5">
              {alternates(m).map((a, idx) => (
                <li key={idx} className="text-[12px] text-textSecondary leading-relaxed flex gap-2">
                  <span className="text-textMuted shrink-0 tnum">{idx + 1}.</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-warn mb-1 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> What would invalidate this
            </div>
            <p className="text-[12px] text-textSecondary leading-relaxed">{invalidation(m)}</p>
          </div>
          <p className="text-[11px] text-textMuted leading-relaxed border-t border-borderSubtle pt-2.5">
            {PER_OUTPUT_CAVEAT}
          </p>
        </div>
      )}
    </div>
  );
};

const MetaorderReconstruction = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildMetaorderView(marketData) : null), [marketData]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
          Inferring parent orders…
        </span>
      </Panel>
    );
  }

  const biasTone: Tone = view.netBias === 'BULLISH' ? 'bull' : view.netBias === 'BEARISH' ? 'bear' : 'neutral';
  const biasLabelColor = biasTone === 'bull' ? 'text-bull' : biasTone === 'bear' ? 'text-bear' : 'holo-text';

  return (
    <>
      <MetricGrid min="170px">
        <StatCard
          label="Net directional info"
          value={signed(view.netInfoScore)}
          sub={view.netBias.toLowerCase()}
          tone={biasTone}
          emphasis
        />
        <StatCard
          label="Parents inferred"
          value={view.detected}
          sub={`${view.childPrintCount} child prints inferred`}
        />
        <StatCard
          label="Largest parent"
          value={view.largest ? fmtUsd(view.largest.estTotalUsd) : '--'}
          sub={view.largest ? `${view.largest.phrase} · ${view.largest.pctComplete}% done` : ''}
          tone={view.largest ? dirTone(view.largest.dir) : 'neutral'}
        />
        <StatCard
          label="Informed share"
          value={`${view.informedSharePct.toFixed(0)}%`}
          sub="of inferred premium"
          tone={view.informedSharePct >= 50 ? 'select' : 'neutral'}
        />
        <StatCard
          label="Premium worked"
          value={fmtUsd(view.totalReconstructedUsd)}
          sub={`avg ${view.avgOpeningProb}% opening`}
          tone="neutral"
        />
      </MetricGrid>

      <Panel tone={biasTone} bodyClassName="py-3.5" emphasis>
        <p className="text-[15px] text-textPrimary leading-relaxed">
          <span className={`font-mono text-[11px] font-semibold uppercase tracking-widest mr-2.5 ${biasLabelColor}`}>
            TRACE read
          </span>
          {view.headline}
        </p>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <GitMerge className="w-3.5 h-3.5" /> Inferred parent orders
          </span>
        }
        subtitle="child prints clustered into the parent order working behind them"
        flush
      >
        <div className="flex flex-col divide-y divide-borderSubtle">
          {view.metaorders.map(m => (
            <MetaorderRow key={m.id} m={m} />
          ))}
        </div>
        <p className="px-4 py-2.5 border-t border-borderSubtle font-mono text-[11px] text-textMuted leading-relaxed inline-flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> ask-lift = buy aggression
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Timer className="w-3 h-3" /> half-life = time for half the remaining clip at the current pace
          </span>
        </p>
      </Panel>

      <Panel bodyClassName="py-3">
        <p className="text-xs text-textSecondary leading-relaxed">
          <span className="font-mono font-semibold uppercase tracking-wider mr-2 holo-text">Beyond the tape</span>
          A parent order never prints as one ticket — a desk works a clip over minutes, and the tape only shows the
          children. TRACE clusters those prints by strike geometry, aggressor side and timing, then infers the strategy,
          projects the full size from what is already done, and estimates the time and urgency to finish. The child-print
          clip and the parent-order reconstruction are inferred from the session tape — the information-vs-hedge split and
          directional-info score are a read of intent, not confirmed intent, so each parent above carries its own
          confidence range, alternates, and what-would-invalidate-it note for exactly that reason.
        </p>
      </Panel>
    </>
  );
};

export default MetaorderReconstruction;
