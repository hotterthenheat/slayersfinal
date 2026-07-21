import { WIDGETS, type WidgetDef, type WorkspaceCtx } from '../workspace/registry';
import DataUnavailablePanel from '../../components/workspace/DataUnavailablePanel';
import { buildMocRead, buildFractureView } from '../../core/fracture';
import { dayKey } from '../../core/rng';
import type { MarketSnapshot } from '../../types/market';

/**
 * buildFractureView runs a 500-path Monte-Carlo cascade — too heavy to recompute
 * on every panel render. It's deterministic per ticker+day, so memoize it.
 */
const _fracCache = new Map<string, ReturnType<typeof buildFractureView>>();
function fractureFor(snapshot: MarketSnapshot) {
  const k = `${snapshot.ticker}-${dayKey()}`;
  let v = _fracCache.get(k);
  if (!v) {
    v = buildFractureView(snapshot);
    _fracCache.set(k, v);
  }
  return v;
}

/** Pulse-only panels on top of the shared workspace catalog. */
const PULSE_EXTRA: WidgetDef[] = [
  {
    key: 'moc-read',
    title: 'Closing Auction (MOC)',
    description: 'Imbalance, absorption & the closing-auction call',
    w: 5,
    h: 6,
    minW: 3,
    minH: 4,
    render: (ctx: WorkspaceCtx) => {
      const moc = buildMocRead(ctx.snapshot);
      return (
        <div className="h-full p-3 flex flex-col gap-2 overflow-auto">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-2xl font-bold tnum ${moc.score >= 0 ? 'text-bull' : 'text-bear'}`}>
              {moc.score >= 0 ? '+' : ''}
              {moc.score}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-textSecondary">{moc.classification}</span>
          </div>
          <div className="font-mono text-[11px] text-textMuted">
            {moc.side} imbalance · {moc.absorptionPct}% absorbed · reversal {moc.reversalRisk}%
          </div>
          <p className="text-[11px] text-textSecondary leading-relaxed">{moc.note}</p>
        </div>
      );
    },
  },
  {
    key: 'fracture-snapshot',
    title: 'Fracture Snapshot',
    description: 'Instability, fracture line & cascade probability',
    w: 5,
    h: 6,
    minW: 3,
    minH: 4,
    render: (ctx: WorkspaceCtx) => {
      const v = fractureFor(ctx.snapshot);
      return (
        <div className="h-full p-3 flex flex-col gap-2.5 overflow-auto">
          <div className="flex items-start gap-5">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Instability</div>
              <div className="font-mono text-2xl font-bold tnum text-textPrimary">{v.instability}</div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Fracture line</div>
              <div className="font-mono text-lg font-semibold tnum text-bear">
                {v.fractureLine ? `$${v.fractureLine.toFixed(2)}` : 'none'}
              </div>
            </div>
          </div>
          <div className="font-mono text-[11px] text-textMuted">
            Cascade if tested {v.cascade.cascadeProbPct}% · criticality {v.criticality.label}
          </div>
          <p className="text-[11px] text-textSecondary leading-relaxed">{v.headline}</p>
        </div>
      );
    },
  },
  {
    key: 'dom-ladder',
    title: 'DOM Ladder',
    description: 'Bid/ask depth by price — needs Level-2',
    w: 4,
    h: 6,
    minW: 3,
    minH: 4,
    render: () => <DataUnavailablePanel requires="streaming Level-2 order-book depth" />,
  },
  {
    key: 'liquidity-heatmap',
    title: 'Liquidity Heatmap',
    description: 'Resting depth over price & time — needs Level-2',
    w: 8,
    h: 6,
    minW: 4,
    minH: 4,
    render: () => <DataUnavailablePanel requires="timestamped Level-2 depth updates" />,
  },
  {
    key: 'footprint',
    title: 'Footprint',
    description: 'Bid × ask volume per price — needs tick prints',
    w: 6,
    h: 6,
    minW: 4,
    minH: 4,
    render: () => <DataUnavailablePanel requires="tick-level trades tagged by aggressor at each price" />,
  },
  {
    key: 'l2-tape',
    title: 'Time & Sales (L2)',
    description: 'True prints with real aggressor — needs tick feed',
    w: 5,
    h: 5,
    minW: 3,
    minH: 3,
    render: () => <DataUnavailablePanel requires="a real time-&-sales print stream" />,
  },
];

export const PULSE_PANELS: WidgetDef[] = [...WIDGETS, ...PULSE_EXTRA];

export function pulsePanelByKey(key: string): WidgetDef | undefined {
  return PULSE_PANELS.find(p => p.key === key);
}
