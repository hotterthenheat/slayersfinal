import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Plus,
  X,
  Copy,
  Minus,
  Maximize2,
  Minimize2,
  RotateCcw,
  ChevronDown,
  GripHorizontal,
  LayoutGrid,
  Save,
  Trash2,
  Square,
  Columns,
  Rows,
  Grid2x2,
  Lock,
  Pencil,
  Search,
  Check,
} from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToast } from '../../components/ui/Toast';
import { SkeletonRows } from '../../components/ui/Skeleton';
import Simulator from '../../core/simulator';
import { buildGexView, pulseMatrix } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import { buildCommandView } from '../../data/command';
import { buildVannaCharm } from '../../data/vannacharm';
import { buildVolLab } from '../../data/vollab';
import { buildSkyVision } from '../../data/skyvision';
import type { MarketSnapshot } from '../../types/market';
import type { WorkspaceCtx } from '../workspace/registry';
import { PULSE_ADDABLE_PANELS, PULSE_DATA_CONNECTIONS, pulsePanelByKey } from './pulseRegistry';
import PanelErrorBoundary from './PanelErrorBoundary';
import { DUR, EASE } from '../../lib/motion';
import {
  PULSE_PRESETS,
  PULSE_STORAGE_KEY,
  WORKSPACE_VERSION,
  clonePreset,
  type PulseLayout,
  type PulseWorkspaceState,
} from './presets';

const Grid = WidthProvider(RGL);
/** Grid columns — shared by the layout and the keyboard nudge clamp. */
const GRID_COLS = 12;

const SCAN_INTERVAL_MS = 10_000;

/** One shared data context per ticker, built once per scan. */
function buildCtx(snapshot: MarketSnapshot, revision: number, focusPrice: number | null = null): WorkspaceCtx {
  const gex = buildGexView(snapshot, 'GEX', 10);
  const iv = Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2;
  return {
    ticker: snapshot.ticker,
    revision,
    snapshot,
    iv,
    gex,
    matrix: gex.matrix,
    exposure: buildExposureProfile(snapshot, '0DTE', 10),
    cmd: buildCommandView(snapshot),
    vanna: buildVannaCharm(snapshot, 'CHARM', -1),
    vol: buildVolLab(snapshot.ticker, snapshot.spot, iv),
    setups: buildSkyVision(snapshot, 'top-setups'),
    focusPrice,
  };
}

// ---- persistence ---------------------------------------------------------
function freshState(): PulseWorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    layouts: PULSE_PRESETS.map(clonePreset),
    activeId: PULSE_PRESETS[0].id,
  };
}

function loadState(): PulseWorkspaceState {
  try {
    const raw = localStorage.getItem(PULSE_STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw) as PulseWorkspaceState;
    if (parsed.version !== WORKSPACE_VERSION || !Array.isArray(parsed.layouts) || parsed.layouts.length === 0) {
      return freshState();
    }
    // Drop panels whose keys no longer exist in the registry
    parsed.layouts = parsed.layouts.map(l => {
      const panels = l.panels.filter(p => pulsePanelByKey(p.key));
      return { ...l, panels, layout: l.layout.filter(g => panels.some(p => p.id === g.i)) };
    });
    // Fold in any preset the saved state predates (by id), so returning users
    // gain newly-shipped desk profiles without losing their custom layouts.
    const have = new Set(parsed.layouts.map(l => l.id));
    const missing = PULSE_PRESETS.filter(p => !have.has(p.id)).map(clonePreset);
    if (missing.length) parsed.layouts = [...parsed.layouts, ...missing];
    if (!parsed.layouts.some(l => l.id === parsed.activeId)) parsed.activeId = parsed.layouts[0].id;
    return parsed;
  } catch {
    return freshState();
  }
}

/** Re-flow the active layout's panels into a quick arrangement. */
function arrange(mode: 'one' | 'cols' | 'rows' | 'quad', ids: string[]): Layout[] {
  if (mode === 'one') return ids.map((i, k) => ({ i, x: 0, y: k * 6, w: 12, h: 6, minW: 3, minH: 3 }));
  if (mode === 'cols') return ids.map((i, k) => ({ i, x: (k % 2) * 6, y: Math.floor(k / 2) * 6, w: 6, h: 6, minW: 3, minH: 3 }));
  if (mode === 'rows') return ids.map((i, k) => ({ i, x: 0, y: k * 4, w: 12, h: 4, minW: 3, minH: 3 }));
  // quad — 2×2 then stack extras
  return ids.map((i, k) => ({ i, x: (k % 2) * 6, y: Math.floor(k / 2) * 5, w: 6, h: 5, minW: 3, minH: 3 }));
}

/** Per-panel ticker editor — click to type a symbol, Enter to switch. */
const PanelTicker = ({ value, onChange }: { value: string; onChange: (t: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    setEditing(false);
    const t = draft.trim().toUpperCase();
    if (t && t !== value) onChange(t);
  };
  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value.toUpperCase())}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onMouseDown={e => e.stopPropagation()}
        className="w-16 bg-inputBg border border-borderMuted rounded px-1 py-0.5 font-mono text-micro text-textPrimary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-select"
      />
    );
  return (
    <button
      onMouseDown={e => e.stopPropagation()}
      onClick={() => setEditing(true)}
      className="inline-flex items-center min-h-6 -my-1 font-mono text-micro font-semibold text-select hover:text-textPrimary px-1 rounded transition-colors"
      title="Change this panel's ticker"
    >
      {value}
    </button>
  );
};

/** Handlers the panel header needs from the workspace. Bundled so PanelChrome
    can live at module scope (stable identity → no header remount per tick, so
    the ticker editor keeps its state mid-type). */
interface PanelChromeHandlers {
  editLayout: boolean;
  onTicker: (panelId: string, t: string) => void;
  onDuplicate: (panelId: string) => void;
  onMinimize: (panelId: string) => void;
  onMaximize: (panelId: string | null) => void;
  onClose: (panelId: string) => void;
  /** Keyboard move/resize. Returns the new position or size, for announcing. */
  onNudge: (panelId: string, dx: number, dy: number, dw: number, dh: number) => string;
}

/** Panel header — title, per-panel ticker, a live quote, and edit/maximize
    affordances. The quote makes every panel read as a live instrument the way a
    pro terminal does. */
const PanelChrome = ({
  panelId,
  panelKey,
  ticker,
  price,
  changePct,
  maximizedView,
  h,
}: {
  panelId: string;
  panelKey: string;
  ticker: string;
  price?: number;
  changePct?: number;
  maximizedView?: boolean;
  h: PanelChromeHandlers;
}) => {
  const def = pulsePanelByKey(panelKey);
  const [nudged, setNudged] = useState('');
  const draggable = !maximizedView && h.editLayout;
  const up = (changePct ?? 0) >= 0;
  return (
    <div className={`${draggable ? 'widget-drag cursor-grab active:cursor-grabbing' : ''} flex items-center gap-2 px-3.5 h-10 border-b border-borderSubtle bg-white/[0.015] shrink-0 select-none`}>
      {draggable && (
        <>
          {/* react-grid-layout's handle is a bare div, so Customize mode
              advertised a rearrangeable desk that no keyboard could rearrange.
              The grip is a real button: arrows move, Shift+arrows resize, and
              the result goes to a live region rather than a toast (one toast per
              arrow press would bury the desk). Mouse dragging still works from
              anywhere in the header — the handle class stays on the row. */}
          <button
            type="button"
            aria-label={`Move or resize ${def?.title ?? panelKey} panel. Arrow keys move, Shift plus arrow keys resize.`}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
            onKeyDown={e => {
              const step: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              const d = step[e.key];
              if (!d) return;
              e.preventDefault();
              const [ax, ay] = d;
              setNudged(e.shiftKey ? h.onNudge(panelId, 0, 0, ax, ay) : h.onNudge(panelId, ax, ay, 0, 0));
            }}
            className="-m-1 p-1 rounded shrink-0 text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </button>
          <span className="sr-only" aria-live="polite">
            {nudged}
          </span>
        </>
      )}
      {/* h2, matching Panel's level. These were spans carrying Panel's exact
          class string, which left /pulse — the flagship desk — with zero
          headings of any level. */}
      <h2 className="font-mono text-label font-semibold uppercase tracking-widest text-textPrimary truncate">
        {def?.title ?? panelKey}
      </h2>
      <PanelTicker value={ticker} onChange={t => h.onTicker(panelId, t)} />
      {price != null && Number.isFinite(price) && (
        <span className="hidden md:flex items-baseline gap-1.5 font-mono tnum whitespace-nowrap" onMouseDown={e => e.stopPropagation()}>
          <span className="text-caption text-textPrimary">${price.toFixed(2)}</span>
          {changePct != null && Number.isFinite(changePct) && (
            <span className={`text-micro ${up ? 'text-bull' : 'text-bear'}`}>
              {up ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          )}
        </span>
      )}
      <div className="ml-auto flex items-center gap-0.5 shrink-0" onMouseDown={e => e.stopPropagation()}>
        {draggable && (
          <>
            <button onClick={() => h.onDuplicate(panelId)} title="Duplicate" aria-label={`Duplicate ${def?.title ?? panelKey} panel`} className="p-1.5 rounded text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60">
              <Copy className="w-3 h-3" />
            </button>
            <button onClick={() => h.onMinimize(panelId)} title="Minimize" aria-label={`Minimize ${def?.title ?? panelKey} panel`} className="p-1.5 rounded text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60">
              <Minus className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <button
          onClick={() => h.onMaximize(maximizedView ? null : panelId)}
          title={maximizedView ? 'Restore' : 'Maximize'}
          aria-label={`${maximizedView ? 'Restore' : 'Maximize'} ${def?.title ?? panelKey} panel`}
          className="p-1.5 rounded text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"
        >
          {maximizedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3 h-3" />}
        </button>
        {draggable && (
          <button onClick={() => h.onClose(panelId)} title="Close" aria-label={`Close ${def?.title ?? panelKey} panel`} className="p-1.5 rounded text-textMuted hover:text-bear transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

/** Keys whose render actually consumes the 1s pulsing matrix. Only these re-run
    on the heat pulse; every other panel's data is on the 10s scan cadence, so it
    renders from the stable ctx and is memoized — killing the per-second re-render
    (and the per-second buildDarkPoolView / runMonteCarlo that rode on it). */
const PULSE_KEYS = new Set(['gex-heatmap']);

/** Memoized panel body — bails out unless its render fn or ctx identity changes,
    so stable-ctx panels don't re-render on the 1s pulse tick. */
const MemoPanelBody = memo(({ render, ctx }: { render: (c: WorkspaceCtx) => ReactNode; ctx: WorkspaceCtx }) => (
  <>{render(ctx)}</>
));

const PulseWorkspace = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const location = useLocation();
  const toast = useToast();

  const [ws, setWs] = useState<PulseWorkspaceState>(loadState);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  // Inline name editor for "Save as" / "Rename" (no window.prompt).
  const [nameEditor, setNameEditor] = useState<{ mode: 'saveAs' | 'rename'; value: string } | null>(null);
  // Two-step arm/confirm for the destructive layout ops.
  const [confirmOp, setConfirmOp] = useState<'delete' | 'reset' | null>(null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Layout edit mode. Pulse is a finished dashboard by DEFAULT — locked, clean,
  // no editing chrome. "Customize" opts into drag/resize/add — the workspace
  // builder is a deliberate mode you enter, not the front door.
  const [editLayout, setEditLayout] = useState(false);
  // A price level to mark on the matching ticker's charts, arriving from a
  // cross-page "view on chart" deep-link (Exposure Profile / Ranked Targets).
  const [focus, setFocus] = useState<{ ticker: string; price: number } | null>(null);
  const counterRef = useRef(1);

  const active = ws.layouts.find(l => l.id === ws.activeId) ?? ws.layouts[0];
  // Below lg the 12-col drag grid is unusable on a phone — stack instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Consume a cross-page "view on chart" deep-link: switch ticker and/or mark
  // a price level on the chart. Documented contract:
  //   navigate('/pulse', { state: { focusTicker?, focusPrice? } })
  useEffect(() => {
    const st = location.state as { focusTicker?: string; focusPrice?: number } | null;
    if (!st) return;
    if (st.focusTicker) changeTicker(st.focusTicker);
    if (typeof st.focusPrice === 'number') {
      setFocus({ ticker: st.focusTicker ?? activeTicker, price: st.focusPrice });
    }
    if (st.focusTicker || st.focusPrice != null) window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save (debounced by React's batching; localStorage write is cheap).
  useEffect(() => {
    try {
      localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify(ws));
    } catch {
      /* storage full — ignore */
    }
  }, [ws]);

  // ---- keyboard shortcuts -------------------------------------------------
  // Single-key desk controls. Ignored while typing in a field or with a
  // modifier held, so they never collide with the ticker/search inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        setAddOpen(false);
        setWsMenuOpen(false);
        setMaximizedId(null);
        setFullscreen(false);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'e':
          setEditLayout(v => !v);
          break;
        case 'f':
          setFullscreen(v => !v);
          break;
        case 'a':
          setAddOpen(o => !o);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- data cadence -------------------------------------------------------
  // Monotonic nonce bumped whenever the snapshot re-publishes; drives the heat
  // pulse. Kept in state + effect (not a ref mutated during render) so it stays
  // pure under StrictMode/concurrent rendering.
  const [revision, setRevision] = useState(0);
  useEffect(() => setRevision(r => r + 1), [marketData]);
  const [scanSnapshot, setScanSnapshot] = useState<MarketSnapshot | null>(null);
  const scanRef = useRef<MarketSnapshot | null>(null);
  const lastScanTimeRef = useRef(0);
  useEffect(() => {
    if (!marketData) return;
    const now = Date.now();
    const due =
      !scanRef.current || now - lastScanTimeRef.current >= SCAN_INTERVAL_MS || scanRef.current.ticker !== marketData.ticker;
    if (due) {
      scanRef.current = marketData;
      lastScanTimeRef.current = now;
      setScanSnapshot(marketData);
    }
  }, [marketData]);

  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const usedTickers = useMemo(() => {
    const set = new Set<string>([activeTicker]);
    active.panels.forEach(p => set.add(p.ticker ?? activeTicker));
    return [...set];
  }, [active.panels, activeTicker]);

  // One ctx per used ticker, rebuilt each scan. The active ticker reuses the
  // already-built global snapshot; others are built on demand per symbol.
  const ctxByTicker = useMemo(() => {
    const m = new Map<string, WorkspaceCtx>();
    if (!scanSnapshot) return m;
    for (const t of usedTickers) {
      const snap = t === activeTicker && marketData ? marketData : Simulator.buildSnapshot(t);
      const fp = focus && focus.ticker === t ? focus.price : null;
      m.set(t, buildCtx(snap, revision, fp));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanSnapshot, usedTickers.join('|'), focus?.ticker, focus?.price]);

  // ---- mutations ----------------------------------------------------------
  const mutate = (fn: (l: PulseLayout) => PulseLayout) =>
    setWs(prev => ({ ...prev, layouts: prev.layouts.map(l => (l.id === prev.activeId ? fn(l) : l)) }));

  const addPanel = (key: string) => {
    const def = pulsePanelByKey(key);
    if (!def) return;
    const id = `${key}-${++counterRef.current}`;
    mutate(l => ({
      ...l,
      panels: [...l.panels, { id, key }],
      layout: [...l.layout, { i: id, x: 0, y: Infinity, w: def.w, h: def.h, minW: def.minW, minH: def.minH }],
    }));
    setAddOpen(false);
  };

  const removePanel = (id: string) => {
    // Snapshot the panel and its geometry BEFORE removing, so Undo restores it
    // where it was rather than dropping it at the bottom of the grid. Closing a
    // panel was instant and irreversible; the toast system already carries an
    // action, and Tracker already uses it for exactly this.
    const panel = active.panels.find(p => p.id === id);
    const geo = active.layout.find(g => g.i === id);
    const title = (panel && pulsePanelByKey(panel.key)?.title) ?? 'Panel';
    mutate(l => ({ ...l, panels: l.panels.filter(p => p.id !== id), layout: l.layout.filter(g => g.i !== id) }));
    if (!panel || !geo) return;
    toast.toast(`Closed ${title}`, 'info', {
      label: 'Undo',
      onClick: () =>
        mutate(l =>
          l.panels.some(p => p.id === id)
            ? l
            : { ...l, panels: [...l.panels, panel], layout: [...l.layout, geo] }
        ),
    });
  };

  const duplicatePanel = (id: string) => {
    const panel = active.panels.find(p => p.id === id);
    const geo = active.layout.find(g => g.i === id);
    if (!panel || !geo) return;
    const nid = `${panel.key}-${++counterRef.current}`;
    mutate(l => ({
      ...l,
      panels: [...l.panels, { ...panel, id: nid }],
      layout: [...l.layout, { ...geo, i: nid, x: 0, y: Infinity }],
    }));
  };

  const setPanelTicker = (id: string, ticker: string) =>
    mutate(l => ({ ...l, panels: l.panels.map(p => (p.id === id ? { ...p, ticker } : p)) }));

  const toggleMin = (id: string) =>
    mutate(l => {
      const p = l.panels.find(x => x.id === id);
      const geo = l.layout.find(g => g.i === id);
      if (!p || !geo) return l;
      const min = !p.minimized;
      return {
        ...l,
        panels: l.panels.map(x => (x.id === id ? { ...x, minimized: min, restoreH: min ? geo.h : undefined } : x)),
        layout: l.layout.map(g => (g.i === id ? { ...g, h: min ? 1 : p.restoreH ?? geo.h, minH: min ? 1 : 3 } : g)),
      };
    });

  const onLayoutChange = (next: Layout[]) => mutate(l => ({ ...l, layout: next }));

  /**
   * Keyboard move/resize. react-grid-layout ships no keyboard path — its drag
   * and resize handles are bare divs — so Customize mode advertised a
   * rearrangeable desk that a keyboard user could not rearrange at all. Writing
   * the geometry straight into the layout is the same thing a drag produces, and
   * RGL re-runs its vertical compaction from it.
   */
  const nudgePanel = (id: string, dx: number, dy: number, dw: number, dh: number): string => {
    const panel = active.panels.find(p => p.id === id);
    const def = panel ? pulsePanelByKey(panel.key) : undefined;
    const minW = def?.minW ?? 2;
    const minH = def?.minH ?? 2;
    let announced = '';
    mutate(l => ({
      ...l,
      layout: l.layout.map(g => {
        if (g.i !== id) return g;
        const w = Math.max(minW, Math.min(GRID_COLS, g.w + dw));
        const h = Math.max(minH, g.h + dh);
        const x = Math.max(0, Math.min(GRID_COLS - w, g.x + dx));
        const y = Math.max(0, g.y + dy);
        announced = dw || dh ? `${w} by ${h}` : `column ${x + 1}, row ${y + 1}`;
        return { ...g, x, y, w, h };
      }),
    }));
    return announced;
  };

  const doArrange = (mode: 'one' | 'cols' | 'rows' | 'quad') =>
    mutate(l => ({ ...l, layout: arrange(mode, l.panels.map(p => p.id)) }));

  // ---- workspace-level ops ------------------------------------------------
  const switchLayout = (id: string) => {
    setWs(prev => ({ ...prev, activeId: id }));
    setWsMenuOpen(false);
    setMaximizedId(null);
  };
  const commitName = () => {
    if (!nameEditor) return;
    const name = nameEditor.value.trim();
    if (!name) return;
    if (nameEditor.mode === 'saveAs') {
      const id = `ws-${++counterRef.current}-${name.toLowerCase().replace(/\s+/g, '-')}`;
      const copy: PulseLayout = { ...clonePreset(active), id, name, preset: false };
      setWs(prev => ({ ...prev, layouts: [...prev.layouts, copy], activeId: id }));
      setWsMenuOpen(false);
    } else {
      mutate(l => ({ ...l, name }));
    }
    setNameEditor(null);
  };
  const duplicateLayout = () => {
    const id = `ws-${++counterRef.current}-dup`;
    setWs(prev => ({ ...prev, layouts: [...prev.layouts, { ...clonePreset(active), id, name: `${active.name} copy`, preset: false }], activeId: id }));
    setWsMenuOpen(false);
  };
  const deleteLayout = () => {
    if (ws.layouts.length <= 1) return;
    if (confirmOp !== 'delete') {
      setConfirmOp('delete');
      return;
    }
    const name = active.name;
    setWs(prev => {
      const layouts = prev.layouts.filter(l => l.id !== prev.activeId);
      return { ...prev, layouts, activeId: layouts[0].id };
    });
    setConfirmOp(null);
    setWsMenuOpen(false);
    toast.success(`Deleted layout "${name}"`);
  };
  const resetLayout = () => {
    // Restore the active layout from its matching preset when possible.
    const preset = PULSE_PRESETS.find(p => p.id === active.id);
    if (!preset) {
      toast.info('This layout has no preset to restore');
      return;
    }
    if (confirmOp !== 'reset') {
      setConfirmOp('reset');
      return;
    }
    mutate(() => clonePreset(preset));
    setConfirmOp(null);
    toast.success(`Reset "${preset.name}" to its preset arrangement`);
  };

  // Fresh menu each open — no stale armed confirm or half-typed name.
  useEffect(() => {
    if (!wsMenuOpen) {
      setNameEditor(null);
      setConfirmOp(null);
    }
  }, [wsMenuOpen]);

  const maximized = maximizedId ? active.panels.find(p => p.id === maximizedId) : null;

  // ---- add-panel search ---------------------------------------------------
  // Reset the query each time the menu opens for a clean search.
  useEffect(() => {
    if (!addOpen) setAddQuery('');
  }, [addOpen]);

  const addMatch = (title: string, description: string) => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return true;
    return title.toLowerCase().includes(q) || description.toLowerCase().includes(q);
  };
  const addableMatches = PULSE_ADDABLE_PANELS.filter(d => addMatch(d.title, d.description));
  const connectionMatches = PULSE_DATA_CONNECTIONS.filter(d => addMatch(d.title, `${d.description} ${d.requires}`));

  const renderPanelBody = (key: string, ticker: string) => {
    const def = pulsePanelByKey(key);
    const base = ctxByTicker.get(ticker);
    if (!def) return null;
    if (!base)
      return (
        <div className="h-full p-4 overflow-hidden">
          <SkeletonRows rows={4} />
        </div>
      );
    // Only pulse-consuming panels take the fresh per-second matrix; the rest get
    // the stable scan ctx so their memoized body skips the 1s churn.
    const ctx = PULSE_KEYS.has(key) ? { ...base, matrix: pulseMatrix(base.gex.matrix, pulseTick) } : base;
    // Isolate each body so one throwing panel can't take down the whole grid.
    return (
      <PanelErrorBoundary resetKey={`${key}:${ticker}`} label={def.title}>
        <MemoPanelBody render={def.render} ctx={ctx} />
      </PanelErrorBoundary>
    );
  };

  // Locked dashboard: panels are finished cards — title, ticker, and a maximize
  // affordance. Editing controls only appear in Customize mode. Handlers bundled
  // for the module-scope PanelChrome.
  const chromeHandlers: PanelChromeHandlers = {
    editLayout,
    onTicker: setPanelTicker,
    onDuplicate: duplicatePanel,
    onMinimize: toggleMin,
    onMaximize: setMaximizedId,
    onClose: removePanel,
    onNudge: nudgePanel,
  };

  // Live quote for a panel's ticker (scan cadence — no per-second header churn).
  const snapFor = (t: string) => ctxByTicker.get(t)?.snapshot;

  const barBtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-rowHover font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors';

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-canvas p-3 flex flex-col gap-4 overflow-auto' : 'flex flex-col gap-4'}>
      {/* The desk is deliberately chromeless — no page title bar — so the H1
          every other route renders is here for the document outline and for
          assistive tech, not for the eye. */}
      <h1 className="sr-only">Pulse — {active.name} workspace</h1>
      {/* Workspace bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View switcher — the hero control (present in both modes) */}
        <div className="relative">
          <button
            onClick={() => setWsMenuOpen(o => !o)}
            className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-md border border-borderMuted bg-white/[0.03] hover:bg-rowHover transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-select" />
            <span className="font-mono text-caption font-semibold text-textPrimary">{active.name}</span>
            <span className="font-mono text-micro text-textMuted tnum">· {active.panels.length}</span>
            <ChevronDown className="w-3 h-3 text-textMuted" />
          </button>
          {wsMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-64 border border-borderMuted bg-panel rounded-md shadow-overlay overflow-hidden animate-slide-in">
              <div className="px-3 pt-2 pb-1 font-mono text-micro uppercase tracking-widest text-textMuted">Views</div>
              <div className="max-h-56 overflow-auto">
                {ws.layouts.map(l => (
                  <button
                    key={l.id}
                    onClick={() => switchLayout(l.id)}
                    className={`w-full text-left px-3 py-2 font-mono text-label flex items-center gap-2 transition-colors ${
                      l.id === active.id ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-rowHover'
                    }`}
                  >
                    {l.name}
                    {l.preset && <span className="ml-auto text-micro text-textMuted uppercase tracking-wider">preset</span>}
                  </button>
                ))}
              </div>
              {/* Layout-management ops only surface inside Customize mode */}
              {editLayout && nameEditor && (
                <div className="border-t border-borderSubtle flex items-center gap-1.5 p-1.5">
                  <input
                    autoFocus
                    value={nameEditor.value}
                    onChange={e => setNameEditor(ne => (ne ? { ...ne, value: e.target.value } : ne))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') setNameEditor(null);
                    }}
                    placeholder={nameEditor.mode === 'saveAs' ? 'New layout name…' : 'Layout name…'}
                    className="flex-1 min-w-0 bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-caption text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-borderMuted"
                  />
                  <button
                    onClick={commitName}
                    // commitName() early-returns on an empty name — same
                    // enabled-but-inert shape as the two tape Save buttons.
                    disabled={!nameEditor.value.trim()}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-borderSubtle hover:border-borderMuted disabled:opacity-40 disabled:hover:border-borderSubtle font-mono text-label text-textSecondary hover:text-textPrimary transition-colors"
                  >
                    <Check className="w-3 h-3" /> {nameEditor.mode === 'saveAs' ? 'Save' : 'Rename'}
                  </button>
                </div>
              )}
              {editLayout && !nameEditor && (
                <div className="border-t border-borderSubtle p-1.5 grid grid-cols-2 gap-1">
                  <button onClick={() => setNameEditor({ mode: 'saveAs', value: `${active.name} copy` })} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-micro text-textSecondary hover:bg-rowHover transition-colors"><Save className="w-3 h-3" /> Save as</button>
                  <button onClick={() => setNameEditor({ mode: 'rename', value: active.name })} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-micro text-textSecondary hover:bg-rowHover transition-colors">Rename</button>
                  <button onClick={duplicateLayout} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-micro text-textSecondary hover:bg-rowHover transition-colors"><Copy className="w-3 h-3" /> Duplicate</button>
                  <button onClick={resetLayout} className={`flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-micro transition-colors ${confirmOp === 'reset' ? 'text-bear bg-bear/[0.12]' : 'text-textSecondary hover:bg-rowHover'}`}><RotateCcw className="w-3 h-3" /> {confirmOp === 'reset' ? 'Confirm reset' : 'Reset'}</button>
                  <button onClick={deleteLayout} disabled={ws.layouts.length <= 1} className={`col-span-2 flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-micro disabled:opacity-40 transition-colors ${confirmOp === 'delete' ? 'text-bear bg-bear/[0.12]' : 'text-bear/80 hover:bg-bear/[0.08]'}`}><Trash2 className="w-3 h-3" /> {confirmOp === 'delete' ? 'Click again to confirm delete' : 'Delete layout'}</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Builder tools — only in Customize mode */}
        {editLayout && (
          <>
            <div className="inline-flex items-center rounded-md border border-borderSubtle overflow-hidden">
              <button onClick={() => doArrange('one')} title="One panel" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover"><Square className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('cols')} title="Columns" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle"><Columns className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('rows')} title="Rows" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle"><Rows className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('quad')} title="Grid" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle"><Grid2x2 className="w-3.5 h-3.5" /></button>
            </div>

            <div className="relative">
              <button onClick={() => setAddOpen(o => !o)} title="Add panel (A)" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-label font-semibold uppercase tracking-wider text-select transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add panel
              </button>
              {addOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-72 border border-borderMuted bg-panel rounded-md shadow-overlay animate-slide-in flex flex-col max-h-[420px]">
              {/* Search */}
              <div className="p-2 border-b border-borderSubtle shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-textMuted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    autoFocus
                    value={addQuery}
                    onChange={e => setAddQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setAddOpen(false);
                      if (e.key === 'Enter' && addableMatches.length > 0) addPanel(addableMatches[0].key);
                    }}
                    placeholder="Search panels…"
                    className="w-full bg-inputBg border border-borderMuted rounded pl-7 pr-2 py-1.5 font-mono text-label text-textPrimary placeholder:text-textMuted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60 focus:border-select/40"
                  />
                </div>
              </div>

              <div className="overflow-auto">
                {addableMatches.map(def => (
                  <button
                    key={def.key}
                    onClick={() => addPanel(def.key)}
                    className="w-full text-left px-3 py-2 hover:bg-rowHover transition-colors border-b border-borderSubtle/40 last:border-0"
                  >
                    <span className="block font-mono text-label font-semibold text-textPrimary">{def.title}</span>
                    <span className="block text-micro text-textSecondary">{def.description}</span>
                  </button>
                ))}

                {addableMatches.length === 0 && connectionMatches.length === 0 && (
                  <div className="px-3 py-5 text-center font-mono text-label text-textMuted uppercase tracking-widest">
                    No panels match
                  </div>
                )}

                {/* Feed-gated modules — real, but dark until a live feed is wired */}
                {connectionMatches.length > 0 && (
                  <div className="border-t border-borderSubtle">
                    <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
                      <span className="font-mono text-label font-semibold uppercase tracking-widest text-textMuted">
                        Data connections
                      </span>
                      <span className="ml-auto font-mono text-micro uppercase tracking-wider text-textMuted">
                        requires a market feed
                      </span>
                    </div>
                    {connectionMatches.map(def => (
                      <button
                        key={def.key}
                        onClick={() => addPanel(def.key)}
                        title={`Requires ${def.requires}`}
                        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-rowHover transition-colors border-b border-borderSubtle/40 last:border-0"
                      >
                        <Lock className="w-3 h-3 text-textMuted mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-mono text-label font-semibold text-textSecondary">{def.title}</span>
                          <span className="block text-micro text-textMuted">requires {def.requires}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {editLayout ? (
            <button
              onClick={() => setEditLayout(false)}
              title="Done customizing (E)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.10] hover:bg-select/[0.16] font-mono text-label font-semibold uppercase tracking-wider text-select transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Done
            </button>
          ) : (
            <button onClick={() => setEditLayout(true)} title="Customize this view (E)" className={barBtn}>
              <Pencil className="w-3.5 h-3.5" /> Customize
            </button>
          )}
          <button onClick={() => setFullscreen(f => !f)} title="Full-screen (F)" className={barBtn}>
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Maximized single panel */}
      {maximized ? (
        <div
          className={`${fullscreen ? 'flex-1' : ''} min-h-0 inst-surface rounded-md overflow-hidden flex flex-col`}
          style={{ height: fullscreen ? 'auto' : '78vh' }}
        >
          <PanelChrome
            panelId={maximized.id}
            panelKey={maximized.key}
            ticker={maximized.ticker ?? activeTicker}
            price={snapFor(maximized.ticker ?? activeTicker)?.spot}
            changePct={snapFor(maximized.ticker ?? activeTicker)?.changePercent}
            maximizedView
            h={chromeHandlers}
          />
          <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(maximized.key, maximized.ticker ?? activeTicker)}</div>
        </div>
      ) : active.panels.length === 0 ? (
        <div className="inst-surface rounded-md h-64 flex flex-col items-center justify-center gap-2">
          <span className="font-mono text-label text-textMuted uppercase tracking-widest">Empty workspace</span>
          <span className="text-label text-textSecondary">Use “Add panel” or pick a layout to build your desk</span>
        </div>
      ) : !isDesktop ? (
        // Mobile: the 12-col drag grid is unreadable on a phone. Stack the panels
        // in their on-screen order (top→bottom, left→right) at readable heights;
        // drag/resize stay a desktop affordance. Tap ⤢ to focus one full-screen.
        <div className="flex flex-col gap-3">
          {[...active.panels]
            .sort((a, b) => {
              const la = active.layout.find(g => g.i === a.id);
              const lb = active.layout.find(g => g.i === b.id);
              return (la?.y ?? 0) - (lb?.y ?? 0) || (la?.x ?? 0) - (lb?.x ?? 0);
            })
            .map(p => {
              const ticker = p.ticker ?? activeTicker;
              const li = active.layout.find(g => g.i === p.id);
              const h = Math.max(340, (li?.h ?? 6) * 52);
              return (
                <div
                  key={p.id}
                  className="inst-surface rounded-md overflow-hidden flex flex-col"
                  style={{ height: p.minimized ? undefined : h }}
                >
                  <PanelChrome panelId={p.id} panelKey={p.key} ticker={ticker} price={snapFor(ticker)?.spot} changePct={snapFor(ticker)?.changePercent} h={chromeHandlers} />
                  {!p.minimized && (
                    <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(p.key, ticker)}</div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        // Keyed by the active layout so switching a desk profile crossfades +
        // settles into the new arrangement — the terminal visibly rearranging
        // itself. Only fires on profile switch (not data ticks or drags); first
        // load skips it (initial={false}) so the page's own entrance leads.
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: DUR.slow, ease: EASE }}
          >
            <Grid
              layout={active.layout}
              cols={GRID_COLS}
              rowHeight={64}
              margin={[12, 12]}
              containerPadding={[0, 0]}
              compactType="vertical"
              draggableHandle=".widget-drag"
              isDraggable={editLayout}
              isResizable={editLayout}
              onLayoutChange={onLayoutChange}
            >
              {active.panels.map(p => {
                const ticker = p.ticker ?? activeTicker;
                const minimized = p.minimized;
                return (
                  <div key={p.id} className="inst-surface rounded-md overflow-hidden flex flex-col">
                    <PanelChrome panelId={p.id} panelKey={p.key} ticker={ticker} price={snapFor(ticker)?.spot} changePct={snapFor(ticker)?.changePercent} h={chromeHandlers} />
                    {!minimized && <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(p.key, ticker)}</div>}
                  </div>
                );
              })}
            </Grid>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default PulseWorkspace;
