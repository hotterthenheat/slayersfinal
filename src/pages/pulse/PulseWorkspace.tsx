import { useEffect, useMemo, useRef, useState } from 'react';
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
import { EASE } from '../../lib/motion';
import {
  PULSE_PRESETS,
  PULSE_STORAGE_KEY,
  WORKSPACE_VERSION,
  clonePreset,
  type PulseLayout,
  type PulseWorkspaceState,
} from './presets';

const Grid = WidthProvider(RGL);
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

/** Client-only media-query subscription. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
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
        className="w-16 bg-inputBg border border-borderMuted rounded px-1 py-0.5 font-mono text-[10px] text-textPrimary outline-none"
      />
    );
  return (
    <button
      onMouseDown={e => e.stopPropagation()}
      onClick={() => setEditing(true)}
      className="font-mono text-[10px] font-semibold text-select hover:text-textPrimary px-1 rounded transition-colors"
      title="Change this panel's ticker"
    >
      {value}
    </button>
  );
};

const PulseWorkspace = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const location = useLocation();

  const [ws, setWs] = useState<PulseWorkspaceState>(loadState);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
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
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);
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

  // Apply the 1s heatmap pulse on top (only the matrix changes).
  const pulsedByTicker = useMemo(() => {
    const m = new Map<string, WorkspaceCtx>();
    ctxByTicker.forEach((ctx, t) => m.set(t, { ...ctx, matrix: pulseMatrix(ctx.gex.matrix, pulseTick) }));
    return m;
  }, [ctxByTicker, pulseTick]);

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

  const removePanel = (id: string) =>
    mutate(l => ({ ...l, panels: l.panels.filter(p => p.id !== id), layout: l.layout.filter(g => g.i !== id) }));

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

  const doArrange = (mode: 'one' | 'cols' | 'rows' | 'quad') =>
    mutate(l => ({ ...l, layout: arrange(mode, l.panels.map(p => p.id)) }));

  // ---- workspace-level ops ------------------------------------------------
  const switchLayout = (id: string) => {
    setWs(prev => ({ ...prev, activeId: id }));
    setWsMenuOpen(false);
    setMaximizedId(null);
  };
  const saveAs = () => {
    const name = window.prompt('Name this layout', `${active.name} copy`);
    if (!name) return;
    const id = `ws-${++counterRef.current}-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const copy: PulseLayout = { ...clonePreset(active), id, name, preset: false };
    setWs(prev => ({ ...prev, layouts: [...prev.layouts, copy], activeId: id }));
    setWsMenuOpen(false);
  };
  const rename = () => {
    const name = window.prompt('Rename layout', active.name);
    if (!name) return;
    mutate(l => ({ ...l, name }));
  };
  const duplicateLayout = () => {
    const id = `ws-${++counterRef.current}-dup`;
    setWs(prev => ({ ...prev, layouts: [...prev.layouts, { ...clonePreset(active), id, name: `${active.name} copy`, preset: false }], activeId: id }));
    setWsMenuOpen(false);
  };
  const deleteLayout = () => {
    if (ws.layouts.length <= 1) return;
    setWs(prev => {
      const layouts = prev.layouts.filter(l => l.id !== prev.activeId);
      return { ...prev, layouts, activeId: layouts[0].id };
    });
    setWsMenuOpen(false);
  };
  const resetLayout = () => {
    // Restore the active layout from its matching preset when possible.
    const preset = PULSE_PRESETS.find(p => p.id === active.id);
    if (preset) mutate(() => clonePreset(preset));
  };

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
    const ctx = pulsedByTicker.get(ticker);
    if (!def) return null;
    if (!ctx)
      return (
        <div className="h-full flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
          loading…
        </div>
      );
    // Isolate each body so one throwing panel can't take down the whole grid.
    return (
      <PanelErrorBoundary resetKey={`${key}:${ticker}`} label={def.title}>
        {def.render(ctx)}
      </PanelErrorBoundary>
    );
  };

  const PanelChrome = ({ panelId, panelKey, ticker, maximizedView }: { panelId: string; panelKey: string; ticker: string; maximizedView?: boolean }) => {
    const def = pulsePanelByKey(panelKey);
    const draggable = !maximizedView && editLayout;
    // Locked dashboard: panels are finished cards — title, ticker, and just a
    // maximize affordance. Editing controls (grip, duplicate, minimize, close)
    // only appear in Customize mode.
    return (
      <div className={`${draggable ? 'widget-drag cursor-grab active:cursor-grabbing' : ''} flex items-center gap-2 px-3.5 h-10 border-b border-borderSubtle shrink-0 select-none`}>
        {draggable && <GripHorizontal className="w-3.5 h-3.5 text-textMuted shrink-0" />}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textPrimary truncate">
          {def?.title ?? panelKey}
        </span>
        <PanelTicker value={ticker} onChange={t => setPanelTicker(panelId, t)} />
        <div className="ml-auto flex items-center gap-1.5 shrink-0" onMouseDown={e => e.stopPropagation()}>
          {draggable && (
            <>
              <button onClick={() => duplicatePanel(panelId)} title="Duplicate" className="text-textMuted hover:text-textPrimary transition-colors">
                <Copy className="w-3 h-3" />
              </button>
              <button onClick={() => toggleMin(panelId)} title="Minimize" className="text-textMuted hover:text-textPrimary transition-colors">
                <Minus className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setMaximizedId(maximizedView ? null : panelId)}
            title={maximizedView ? 'Restore' : 'Maximize'}
            className="text-textMuted hover:text-textPrimary transition-colors"
          >
            {maximizedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {draggable && (
            <button onClick={() => removePanel(panelId)} title="Close" className="text-textMuted hover:text-bear transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const barBtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors';

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-canvas p-3 flex flex-col gap-4 overflow-auto' : 'flex flex-col gap-4'}>
      {/* Workspace bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View switcher — the hero control (present in both modes) */}
        <div className="relative">
          <button
            onClick={() => setWsMenuOpen(o => !o)}
            className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-md border border-borderMuted bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-select" />
            <span className="font-mono text-[12px] font-semibold text-textPrimary">{active.name}</span>
            <span className="font-mono text-[10px] text-textMuted tnum">· {active.panels.length}</span>
            <ChevronDown className="w-3 h-3 text-textMuted" />
          </button>
          {wsMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-64 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in">
              <div className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-textMuted">Views</div>
              <div className="max-h-56 overflow-auto">
                {ws.layouts.map(l => (
                  <button
                    key={l.id}
                    onClick={() => switchLayout(l.id)}
                    className={`w-full text-left px-3 py-2 font-mono text-[11px] flex items-center gap-2 transition-colors ${
                      l.id === active.id ? 'text-select bg-select/[0.06]' : 'text-textSecondary hover:bg-white/[0.03]'
                    }`}
                  >
                    {l.name}
                    {l.preset && <span className="ml-auto text-[10px] text-textMuted uppercase tracking-wider">preset</span>}
                  </button>
                ))}
              </div>
              {/* Layout-management ops only surface inside Customize mode */}
              {editLayout && (
                <div className="border-t border-borderSubtle p-1.5 grid grid-cols-2 gap-1">
                  <button onClick={saveAs} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] text-textSecondary hover:bg-white/[0.04] transition-colors"><Save className="w-3 h-3" /> Save as</button>
                  <button onClick={rename} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] text-textSecondary hover:bg-white/[0.04] transition-colors">Rename</button>
                  <button onClick={duplicateLayout} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] text-textSecondary hover:bg-white/[0.04] transition-colors"><Copy className="w-3 h-3" /> Duplicate</button>
                  <button onClick={resetLayout} className="flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] text-textSecondary hover:bg-white/[0.04] transition-colors"><RotateCcw className="w-3 h-3" /> Reset</button>
                  <button onClick={deleteLayout} disabled={ws.layouts.length <= 1} className="col-span-2 flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[10px] text-bear/80 hover:bg-bear/[0.08] disabled:opacity-40 transition-colors"><Trash2 className="w-3 h-3" /> Delete layout</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Builder tools — only in Customize mode */}
        {editLayout && (
          <>
            <div className="inline-flex items-center rounded-md border border-borderSubtle overflow-hidden">
              <button onClick={() => doArrange('one')} title="One panel" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-white/[0.04]"><Square className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('cols')} title="Columns" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-white/[0.04] border-l border-borderSubtle"><Columns className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('rows')} title="Rows" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-white/[0.04] border-l border-borderSubtle"><Rows className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('quad')} title="Grid" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-white/[0.04] border-l border-borderSubtle"><Grid2x2 className="w-3.5 h-3.5" /></button>
            </div>

            <div className="relative">
              <button onClick={() => setAddOpen(o => !o)} title="Add panel (A)" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-select/40 bg-select/[0.06] hover:bg-select/[0.12] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add panel
              </button>
              {addOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-72 border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 animate-slide-in flex flex-col max-h-[420px]">
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
                    className="w-full bg-inputBg border border-borderMuted rounded pl-7 pr-2 py-1.5 font-mono text-[11px] text-textPrimary placeholder:text-textMuted outline-none focus:border-select/40"
                  />
                </div>
              </div>

              <div className="overflow-auto">
                {addableMatches.map(def => (
                  <button
                    key={def.key}
                    onClick={() => addPanel(def.key)}
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.03] transition-colors border-b border-borderSubtle/40 last:border-0"
                  >
                    <span className="block font-mono text-[11px] font-semibold text-textPrimary">{def.title}</span>
                    <span className="block text-[10px] text-textSecondary">{def.description}</span>
                  </button>
                ))}

                {addableMatches.length === 0 && connectionMatches.length === 0 && (
                  <div className="px-3 py-5 text-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
                    No panels match
                  </div>
                )}

                {/* Feed-gated modules — real, but dark until a live feed is wired */}
                {connectionMatches.length > 0 && (
                  <div className="border-t border-borderSubtle">
                    <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-textMuted">
                        Data connections
                      </span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-textMuted">
                        requires a live feed
                      </span>
                    </div>
                    {connectionMatches.map(def => (
                      <button
                        key={def.key}
                        onClick={() => addPanel(def.key)}
                        title={`Requires ${def.requires}`}
                        className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-white/[0.03] transition-colors border-b border-borderSubtle/40 last:border-0"
                      >
                        <Lock className="w-3 h-3 text-textMuted mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-mono text-[11px] font-semibold text-textSecondary">{def.title}</span>
                          <span className="block text-[10px] text-textMuted">requires {def.requires}</span>
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-select/40 bg-select/[0.10] hover:bg-select/[0.16] font-mono text-[11px] font-semibold uppercase tracking-wider text-select transition-colors"
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
          <PanelChrome panelId={maximized.id} panelKey={maximized.key} ticker={maximized.ticker ?? activeTicker} maximizedView />
          <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(maximized.key, maximized.ticker ?? activeTicker)}</div>
        </div>
      ) : active.panels.length === 0 ? (
        <div className="inst-surface rounded-md h-64 flex flex-col items-center justify-center gap-2">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Empty workspace</span>
          <span className="text-[11px] text-textSecondary">Use “Add panel” or pick a layout to build your desk</span>
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
                  <PanelChrome panelId={p.id} panelKey={p.key} ticker={ticker} />
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
            transition={{ duration: 0.24, ease: EASE }}
          >
            <Grid
              layout={active.layout}
              cols={12}
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
                    <PanelChrome panelId={p.id} panelKey={p.key} ticker={ticker} />
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
