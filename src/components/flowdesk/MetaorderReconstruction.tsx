import { useMemo, type ReactNode } from 'react';
import { GitMerge, Zap, Timer } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
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
              ? 'text-[#EA00FF]'
              : 'text-textPrimary';
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted truncate">{label}</div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold tnum truncate ${color}`}>{value}</div>
    </div>
  );
};

/** Child-print execution timeline — clip size = radius, ask-lifts ride the silver foil. */
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="child-print execution timeline">
      <line x1={padX} x2={W - padX} y1={yMid} y2={yMid} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      {prints.map(p => {
        const fill = p.side === 'ASK' ? '#C7D3E8' : 'rgba(150,160,180,0.4)';
        return (
          <circle
            key={p.id}
            cx={X(p.atFrac)}
            cy={yMid}
            r={R(p.size)}
            fill={fill}
            stroke={p.orderType === 'SWEEP' ? '#C7D3E8' : 'none'}
            strokeOpacity={p.orderType === 'SWEEP' ? 0.5 : 0}
            strokeWidth={p.orderType === 'SWEEP' ? 1 : 0}
          />
        );
      })}
    </svg>
  );
};

/** A single reassembled parent order — the reconstruction, not just the tape line. */
const MetaorderRow = ({ m }: { m: Metaorder }) => {
  const tone = dirTone(m.dir);
  const first = m.children[0];
  const last = m.children[m.children.length - 1];
  return (
    <div className="px-4 py-3.5 flex flex-col gap-3">
      {/* header — strategy + classification */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-textPrimary">{m.strategy}</span>
          <span className="ml-2 font-mono text-[10px] text-textMuted">
            {m.childCount} clips · {m.legs.length} leg{m.legs.length > 1 ? 's' : ''}
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

      {/* completion bar */}
      <div>
        <div className="flex items-center justify-between mb-1 font-mono text-[10px]">
          <span className="uppercase tracking-wider text-textMuted">{m.pctComplete}% complete</span>
          <span className="tnum text-textSecondary">
            {fmtUsd(m.filledUsd)} worked of {fmtUsd(m.estTotalUsd)} est.
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <span className="block h-full rounded-full holo-bar" style={{ width: `${m.pctComplete}%` }} />
        </div>
      </div>

      {/* reconstruction readings */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2.5 pt-0.5">
        <Cell label="Est. parent" value={fmtUsd(m.estTotalUsd)} tone={tone} />
        <Cell label="Time left" value={`${m.minsRemainingLo}–${m.minsRemainingHi}m`} tone={urgencyTone[m.urgency]} />
        <Cell label="Flow half-life" value={`${m.halfLifeMin}m`} />
        <Cell label="Opening prob" value={`${m.openingProb}%`} tone={m.openingProb >= 55 ? 'select' : 'neutral'} />
        <Cell label="Ask-lift" value={`${m.askPct.toFixed(0)}%`} />
        <Cell label="Dir. info" value={`${signed(m.infoScore)} · ${m.infoLabel}`} tone={tone} />
      </div>

      {/* legs */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap border-t border-borderSubtle pt-2.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Legs</span>
        {m.legs.map(leg => (
          <span key={`${leg.strike}-${leg.right}`} className="inline-flex items-center gap-1.5 font-mono text-[10px]">
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

      {/* execution timeline */}
      <div>
        <Timeline prints={m.children} />
        <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] text-textMuted tnum">
          <span>{first?.time}</span>
          <span className="uppercase tracking-widest">
            worked over ~{m.minsElapsed}m · {m.sweepShare.toFixed(0)}% sweeps
          </span>
          <span>{last?.time}</span>
        </div>
      </div>

      {/* the read */}
      <p className="text-[11px] text-textMuted leading-relaxed">{m.read}</p>
    </div>
  );
};

const MetaorderReconstruction = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildMetaorderView(marketData) : null), [marketData]);

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Reconstructing parent orders…</span>
      </Panel>
    );
  }

  const biasTone: Tone = view.netBias === 'BULLISH' ? 'bull' : view.netBias === 'BEARISH' ? 'bear' : 'neutral';
  const biasLabelColor = biasTone === 'bull' ? 'text-bull' : biasTone === 'bear' ? 'text-bear' : 'holo-text';

  return (
    <>
      <MetricGrid min="180px">
        <StatCard
          label="Net directional info"
          value={signed(view.netInfoScore)}
          sub={view.netBias.toLowerCase()}
          tone={biasTone}
          emphasis
        />
        <StatCard
          label="Parents detected"
          value={view.detected}
          sub={`${view.childPrintCount} child prints reconstructed`}
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
          sub="of reconstructed premium"
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
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-widest mr-2.5 ${biasLabelColor}`}>
            TRACE read
          </span>
          {view.headline}
        </p>
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <GitMerge className="w-3.5 h-3.5" /> Reconstructed parent orders
          </span>
        }
        subtitle="child prints clustered into the meta-order behind them"
        flush
      >
        <div className="flex flex-col divide-y divide-borderSubtle">
          {view.metaorders.map(m => (
            <MetaorderRow key={m.id} m={m} />
          ))}
        </div>
        <p className="px-4 py-2.5 border-t border-borderSubtle font-mono text-[10px] text-textMuted leading-relaxed inline-flex items-center gap-3 flex-wrap">
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
          A parent order never prints as one ticket — a desk works a clip over minutes, and the tape only shows the children.
          TRACE clusters those prints by strike geometry, aggressor side and timing, then infers the strategy, projects the full
          size from what is already done, and estimates the time and urgency to finish. Chain strikes are the live chain; the
          child-print clip and the parent-order reconstruction are modeled from the session tape — a genuine execution
          reconstruction needs order-audit data this app cannot see, so treat every parent here as an estimate, and it swaps for a
          real reconstruction feed behind the same contract. The information-vs-hedge split and directional-info score are the
          model’s read, not confirmed intent.
        </p>
      </Panel>
    </>
  );
};

export default MetaorderReconstruction;
