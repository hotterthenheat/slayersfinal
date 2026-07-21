import { useEffect, useMemo, useRef, useState } from 'react';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { GripHorizontal, Plus, RotateCcw, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildGexView, pulseMatrix } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import { buildCommandView } from '../../data/command';
import { buildVannaCharm } from '../../data/vannacharm';
import { buildVolLab } from '../../data/vollab';
import { buildSkyVision } from '../../data/skyvision';
import PageHeader from '../../components/ui/PageHeader';
import TickerSearch from '../../components/ui/TickerSearch';
import Panel from '../../components/ui/Panel';
import { WIDGETS, widgetByKey, type WorkspaceCtx } from './registry';
import type { MarketSnapshot } from '../../types/market';

const Grid = WidthProvider(RGL);

const SCAN_INTERVAL_MS = 10_000;
const STORAGE_KEY = 'slayer_workspace_v1';

interface WidgetInstance {
  id: string;
  key: string;
}

interface SavedWorkspace {
  instances: WidgetInstance[];
  layout: Layout[];
}

/** Fresh-user preset — a sensible four-widget desk. */
const DEFAULT: SavedWorkspace = {
  instances: [
    { id: 'live-chart-1', key: 'live-chart' },
    { id: 'key-levels-1', key: 'key-levels' },
    { id: 'positioning-map-1', key: 'positioning-map' },
    { id: 'gex-heatmap-1', key: 'gex-heatmap' },
  ],
  layout: [
    { i: 'live-chart-1', x: 0, y: 0, w: 8, h: 5, minW: 4, minH: 4 },
    { i: 'key-levels-1', x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
    { i: 'positioning-map-1', x: 0, y: 5, w: 6, h: 5, minW: 3, minH: 4 },
    { i: 'gex-heatmap-1', x: 6, y: 5, w: 6, h: 5, minW: 4, minH: 4 },
  ],
};

function loadSaved(): SavedWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as SavedWorkspace;
    if (!Array.isArray(parsed.instances) || !Array.isArray(parsed.layout)) return DEFAULT;
    // Drop widgets whose keys no longer exist in the registry
    const instances = parsed.instances.filter(w => widgetByKey(w.key));
    return { instances, layout: parsed.layout.filter(l => instances.some(w => w.id === l.i)) };
  } catch {
    return DEFAULT;
  }
}

const Workspace = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const [saved] = useState<SavedWorkspace>(loadSaved);
  const [instances, setInstances] = useState<WidgetInstance[]>(saved.instances);
  const [layout, setLayout] = useState<Layout[]>(saved.layout);
  const [addOpen, setAddOpen] = useState(false);
  const counterRef = useRef(1);

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  // Auto-save every arrangement change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ instances, layout }));
  }, [instances, layout]);

  // Scan tier — one snapshot feeds every widget
  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);
  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current ||
      now - lastScanTimeRef.current >= SCAN_INTERVAL_MS ||
      scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
    }
  }, [marketData]);

  // 1s heatmap pulse (same treatment as Pulse)
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Shared data context — each build runs once per scan, all widgets share it
  const ctx = useMemo<WorkspaceCtx | null>(() => {
    if (!scanSnapshot) return null;
    const gex = buildGexView(scanSnapshot, 'GEX', 10);
    const iv = Simulator.TICKERS[scanSnapshot.ticker]?.iv ?? 0.2;
    return {
      ticker: scanSnapshot.ticker,
      revision,
      snapshot: scanSnapshot,
      iv,
      gex,
      matrix: gex.matrix,
      exposure: buildExposureProfile(scanSnapshot, '0DTE', 10),
      cmd: buildCommandView(scanSnapshot),
      vanna: buildVannaCharm(scanSnapshot, 'CHARM', -1),
      vol: buildVolLab(scanSnapshot.ticker, scanSnapshot.spot, iv),
      setups: buildSkyVision(scanSnapshot, 'top-setups'),
    };
  }, [scanSnapshot, revision]);

  const pulsedCtx = useMemo<WorkspaceCtx | null>(
    () => (ctx ? { ...ctx, matrix: pulseMatrix(ctx.gex.matrix, pulseTick) } : null),
    [ctx, pulseTick]
  );

  const addWidget = (key: string) => {
    const def = widgetByKey(key);
    if (!def) return;
    const id = `${key}-${++counterRef.current}-${instances.length}`;
    setInstances(prev => [...prev, { id, key }]);
    setLayout(prev => [
      ...prev,
      { i: id, x: 0, y: Infinity, w: def.w, h: def.h, minW: def.minW, minH: def.minH },
    ]);
    setAddOpen(false);
  };

  const removeWidget = (id: string) => {
    setInstances(prev => prev.filter(w => w.id !== id));
    setLayout(prev => prev.filter(l => l.i !== id));
  };

  const reset = () => {
    setInstances(DEFAULT.instances);
    setLayout(DEFAULT.layout);
  };

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Workspace']}
        title="Workspace"
        subtitle="Your desk, your layout — add panels, drag them around, resize freely"
        actions={<TickerSearch value={activeTicker} onChange={changeTicker} />}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setAddOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add widget
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-72 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
              {WIDGETS.map(def => (
                <button
                  key={def.key}
                  onClick={() => addWidget(def.key)}
                  className="w-full text-left px-3 py-2 hover:bg-white/[0.03] transition-colors border-b border-borderSubtle/40 last:border-0"
                >
                  <span className="block font-mono text-[11px] font-semibold text-textPrimary">{def.title}</span>
                  <span className="block text-[10px] text-textSecondary">{def.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {instances.length} panels · layout auto-saved
        </span>
      </div>

      {/* The grid */}
      {!pulsedCtx ? (
        <Panel className="h-64" bodyClassName="flex items-center justify-center">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">
            Awaiting feed initialization…
          </span>
        </Panel>
      ) : instances.length === 0 ? (
        <Panel className="h-64" bodyClassName="flex flex-col items-center justify-center gap-2">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Empty desk</span>
          <span className="text-[11px] text-textSecondary">Use “Add widget” to build your layout</span>
        </Panel>
      ) : (
        <Grid
          layout={layout}
          cols={12}
          rowHeight={88}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          compactType="vertical"
          draggableHandle=".widget-drag"
          onLayoutChange={(next: Layout[]) => setLayout(next)}
        >
          {instances.map(inst => {
            const def = widgetByKey(inst.key);
            if (!def) return <div key={inst.id} />;
            return (
              <div key={inst.id} className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col">
                <div className="widget-drag cursor-grab active:cursor-grabbing flex items-center gap-2 px-2.5 h-8 border-b border-borderSubtle shrink-0 select-none">
                  <GripHorizontal className="w-3.5 h-3.5 text-textMuted" />
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-textPrimary truncate">
                    {def.title}
                  </span>
                  <button
                    onClick={() => removeWidget(inst.id)}
                    onMouseDown={e => e.stopPropagation()}
                    aria-label="Remove widget"
                    className="ml-auto text-textMuted hover:text-bear transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-grow min-h-0 overflow-hidden">{def.render(pulsedCtx)}</div>
              </div>
            );
          })}
        </Grid>
      )}
    </>
  );
};

export default Workspace;
