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

/** Analytical Pulse-only panels on top of the shared workspace catalog. */
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
];

/**
 * A WidgetDef plus the short phrase naming the live feed that would light it up.
 * `requires` is used by the picker's "Data connections" tray so the operator
 * sees which modules are real but simply not yet wired to a feed.
 */
export interface DataConnectionDef extends WidgetDef {
  /** Short phrase: the live feed this module needs before it activates. */
  requires: string;
}

/**
 * Real order-flow modules that stay dark until a live feed is connected. They
 * are kept separate from the normal addable catalog and surfaced in their own
 * "Data connections" section — the module exists, it just needs its feed.
 */
export const PULSE_DATA_CONNECTIONS: DataConnectionDef[] = [
  {
    key: 'dom-ladder',
    title: 'DOM Ladder',
    description: 'Bid/ask depth by price',
    requires: 'a live Level-2 order-book feed',
    w: 4,
    h: 6,
    minW: 3,
    minH: 4,
    render: () => <DataUnavailablePanel requires="streaming Level-2 order-book depth" />,
  },
  {
    key: 'footprint',
    title: 'Footprint',
    description: 'Bid × ask volume per price',
    requires: 'a tick-level trade feed',
    w: 6,
    h: 6,
    minW: 4,
    minH: 4,
    render: () => <DataUnavailablePanel requires="tick-level trades tagged by aggressor at each price" />,
  },
  {
    key: 'l2-tape',
    title: 'Time & Sales (L2)',
    description: 'True prints with real aggressor',
    requires: 'a live time-&-sales print feed',
    w: 5,
    h: 5,
    minW: 3,
    minH: 3,
    render: () => <DataUnavailablePanel requires="a real time-&-sales print stream" />,
  },
];

/** Panels offered in the normal "Add panel" catalog (feed-independent). */
export const PULSE_ADDABLE_PANELS: WidgetDef[] = [...WIDGETS, ...PULSE_EXTRA];

/** Everything resolvable by key — catalog plus the feed-gated modules. */
export const PULSE_PANELS: WidgetDef[] = [...PULSE_ADDABLE_PANELS, ...PULSE_DATA_CONNECTIONS];

export function pulsePanelByKey(key: string): WidgetDef | undefined {
  return PULSE_PANELS.find(p => p.key === key);
}
