import { useEffect, useMemo, useRef, useState } from 'react';
import DataState from '../../components/ui/DataState';
import { useLocation } from 'react-router-dom';
import RGL, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Check, GripHorizontal, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildGexView, pulseMatrix } from '../../data/gex';
import { buildExposureProfile } from '../../data/exposure';
import { buildPulseView } from '../../data/pulse';
import { buildVannaCharm } from '../../data/vannacharm';
import { buildCompassView } from '../../data/compass';
import Chip from '../../components/ui/Chip';
import HoverReadout from '../../components/ui/HoverReadout';
import PageHeader from '../../components/ui/PageHeader';
import { useIsPhone } from '../../components/ui/useMediaQuery';
import Panel from '../../components/ui/Panel';
import { WIDGETS, widgetByKey, type WorkspaceCtx } from './registry';
import LiveChartWidget from './LiveChartWidget';
import WidgetThumb from './WidgetThumb';
import WidgetTickerPicker from './WidgetTickerPicker';
import {
  firstFit,
  isPreset,
  loadDesks,
  PRESET_BLURBS,
  PRESET_NAMES,
  presetTemplate,
  saveDesks,
  type DeskStore,
  type SavedWorkspace,
  type WidgetInstance,
} from './desks';
import type { MarketSnapshot } from '../../types/market';

const Grid = WidthProvider(RGL);

const SCAN_INTERVAL_MS = 10_000;

/**
 * The hover peek on a desk chip (Noah, 2026-08-19: "a hover effect that
 * shows users what's inside each section"): a schematic of the arrangement
 * — every panel drawn at its grid position — and the panel names, plus the
 * preset's one-line purpose. Drawn from the saved layout itself, so it can
 * never disagree with what a click will open.
 */
const DeskPeek = ({ name, ws }: { name: string; ws: SavedWorkspace }) => {
  const titles = ws.instances.map(i => widgetByKey(i.key)?.title ?? i.key);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold text-textPrimary">{name}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-textMuted tnum">
          {ws.instances.length} panel{ws.instances.length === 1 ? '' : 's'}
        </span>
      </div>
      {PRESET_BLURBS[name] && <p className="mt-1 text-[10px] leading-snug text-textSecondary">{PRESET_BLURBS[name]}</p>}
      {/* words only — the block schematic read as noise (Noah, 2026-08-19) */}
      <ul className="mt-2 flex flex-col gap-0.5">
        {titles.map((t, i) => (
          <li key={`${t}-${i}`} className="font-mono text-[10px] text-textSecondary">
            <span className="text-textMuted">· </span>
            {t}
          </li>
        ))}
      </ul>
    </>
  );
};

/* PULSE (2026-08-17): the widget desk IS the Pulse page — Noah: "i want the
   pulse page to basically be the workspace page... i love how our current
   workspace moves so lets just make pulse that." Named desks + the link
   (Mo, 2026-08-19) layered on without touching how it moves. */
const Pulse = () => {
  const { activeTicker, marketData, changeTicker } = useMarketData();
  const location = useLocation();
  /* Read every render, and read BEFORE any early return — a hook cannot sit
     behind the branch it decides. */
  const isPhone = useIsPhone();

  /* A strike sent here to be SEEN (Ranked Targets, Exposure Profile — Mo,
     2026-08-19: "clicking a strike should take me directly to that strike on
     the chart"). Held until cleared by hand or until the desk changes name;
     the live chart draws it as the FOCUS line. Before this the route state
     arrived and nothing read it — the click was a dead link. */
  const [focus, setFocus] = useState<{ price: number; ticker: string; token: number } | null>(null);

  // ---- desks: named layouts, every one autosaving its own working state ----
  const [store, setStore] = useState<DeskStore>(loadDesks);
  const active = store.active;
  const [instances, setInstances] = useState<WidgetInstance[]>(() => store.desks[store.active].instances);
  const [layout, setLayout] = useState<Layout[]>(() => store.desks[store.active].layout);
  const [savingAs, setSavingAs] = useState(false);
  const [newName, setNewName] = useState('');
  const saveInputRef = useRef<HTMLInputElement | null>(null);

  // Working state flows into the active desk's slot…
  useEffect(() => {
    setStore(prev => ({ ...prev, desks: { ...prev.desks, [prev.active]: { instances, layout } } }));
  }, [instances, layout]);
  // …and the whole store persists on every change.
  useEffect(() => {
    saveDesks(store);
  }, [store]);

  const loadWorkspace = (ws: SavedWorkspace) => {
    setInstances(ws.instances);
    setLayout(ws.layout);
  };

  /* Two-phase switch (Noah, 2026-08-19: "right now its a rapid change"): the
     current desk fades OUT on an opacity transition, then the next one mounts
     under a fresh key and breathes in on the slow soft-in. Timer-driven, never
     animation-completion — the takeover rule. */
  const [switching, setSwitching] = useState(false);
  const switchTimer = useRef(0);
  const switchDesk = (name: string) => {
    if (name === active || switching) return;
    const ws = store.desks[name];
    if (!ws) return;
    setSwitching(true);
    window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => {
      setStore(prev => ({ ...prev, active: name }));
      loadWorkspace(ws);
      setSwitching(false);
    }, 220);
  };
  useEffect(() => () => window.clearTimeout(switchTimer.current), []);

  const saveAs = () => {
    const name = newName.trim();
    // Preset names are reserved — they're the templates you reset TO.
    if (!name || isPreset(name)) return;
    setStore(prev => ({ active: name, desks: { ...prev.desks, [name]: { instances, layout } } }));
    setSavingAs(false);
    setNewName('');
  };

  const deleteDesk = (name: string) => {
    if (isPreset(name)) return;
    const fallback = PRESET_NAMES[0];
    setStore(prev => {
      const desks = { ...prev.desks };
      delete desks[name];
      return { active: prev.active === name ? fallback : prev.active, desks };
    });
    if (active === name) loadWorkspace(store.desks[fallback]);
  };

  /** Presets reset to their curated template; a custom desk has nothing to reset to. */
  const reset = () => {
    const tpl = presetTemplate(active);
    if (tpl) loadWorkspace(tpl);
  };

  useEffect(() => {
    if (savingAs) requestAnimationFrame(() => saveInputRef.current?.focus());
  }, [savingAs]);

  const customNames = useMemo(() => Object.keys(store.desks).filter(n => !isPreset(n)), [store.desks]);

  // The hover peek — which chip, and where the pointer is
  const [peek, setPeek] = useState<{ name: string; x: number; y: number } | null>(null);
  const peekHandlers = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setPeek({ name, x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setPeek({ name, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setPeek(null),
  });

  // ---- add menu -------------------------------------------------------------
  const [addOpen, setAddOpen] = useState(false);
  /** Which widget the add-menu is previewing — only this one gets mounted. */
  const [previewKey, setPreviewKey] = useState<string>(WIDGETS[0].key);
  const previewDef = widgetByKey(previewKey) ?? WIDGETS[0];
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  // Clicking anywhere else, or Escape, closes the add menu — re-clicking the
  // button should not be the only way out.
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [addOpen]);
  const counterRef = useRef(1);

  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  /* Self-heal GHOSTS (Noah, 2026-08-17: "there is nothing there yet im still
     moving it and i see its 4 corners"): an instance whose widget key has
     left the registry — a launch trim landing over a live session — would
     render as an invisible, draggable, resizable box. loadDesks sanitizes at
     mount; this prunes them mid-flight too. */
  useEffect(() => {
    if (!instances.some(w => !widgetByKey(w.key))) return;
    const alive = instances.filter(w => widgetByKey(w.key));
    setInstances(alive);
    setLayout(prev => prev.filter(l => alive.some(w => w.id === l.i)));
  }, [instances]);

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

  // 1s heatmap pulse (same treatment as Live Terminal)
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  /** Build the whole widget context for one name. */
  const buildCtxFor = (snapshot: MarketSnapshot): WorkspaceCtx => {
    const gex = buildGexView(snapshot, 'GEX', 10);
    return {
      ticker: snapshot.ticker,
      snapshot,
      revision,
      pulseTick: 0, // stamped per render by ctxFor — the memo below must not depend on it
      gex,
      matrix: gex.matrix,
      exposure: buildExposureProfile(snapshot, '0DTE', 10),
      pulse: buildPulseView(snapshot),
      vanna: buildVannaCharm(snapshot, 'CHARM', -1),
      setups: buildCompassView(snapshot, 'top-setups', Simulator.universeQuotes(snapshot.ticker)),
    };
  };

  // Every name any panel is unlinked to. Linked panels use the desk's ticker,
  // so an untouched desk still builds exactly one context.
  const usedTickers = useMemo(() => {
    const set = new Set<string>();
    if (scanSnapshot) set.add(scanSnapshot.ticker);
    instances.forEach(i => i.ticker && set.add(i.ticker));
    return [...set];
  }, [instances, scanSnapshot]);

  // One context per name in use, rebuilt on the scan tier. The active symbol
  // reuses the live snapshot (it carries the tape); unlinked names read their
  // own state straight from the simulator without advancing it.
  const ctxByTicker = useMemo<Map<string, WorkspaceCtx>>(() => {
    const map = new Map<string, WorkspaceCtx>();
    if (!scanSnapshot) return map;
    for (const t of usedTickers) {
      try {
        map.set(t, buildCtxFor(t === scanSnapshot.ticker ? scanSnapshot : Simulator.snapshotFor(t)));
      } catch {
        /* a name the sim can't build is simply skipped — the panel says so */
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanSnapshot, revision, usedTickers.join('|')]);

  /** The context a panel should render with, pulsed for the live heat. */
  const ctxFor = (pinned?: string): WorkspaceCtx | null => {
    const base = ctxByTicker.get(pinned ?? scanSnapshot?.ticker ?? '') ?? null;
    if (!base) return null;
    // The focus belongs to ONE name — a panel pinned elsewhere never draws it
    const focusPrice = focus && focus.ticker === base.ticker ? focus.price : null;
    return {
      ...base,
      pulseTick,
      matrix: pulseMatrix(base.gex.matrix, pulseTick),
      focusPrice,
      clearFocus: focusPrice != null ? () => setFocus(null) : undefined,
      // Evaluated on click, after focusOn below exists — the in-desk door
      focusStrike: (price: number) => focusOn(price, base.ticker),
    };
  };

  /** The desk's own context — used by the add-menu preview. */
  const pulsedCtx = ctxFor();

  /** The one chart that lifts on a focus arrival: the first live chart whose
      effective name is the focus's. */
  const focusChartId = focus
    ? (instances.find(w => w.key === 'live-chart' && (w.ticker ?? activeTicker) === focus.ticker)?.id ?? null)
    : null;

  const addWidget = (key: string) => {
    const def = widgetByKey(key);
    if (!def) return;
    const id = `${key}-${++counterRef.current}-${instances.length}`;
    setInstances(prev => [...prev, { id, key }]);
    // First hole from the top that takes it, shrinking toward the minimum when
    // the hole is narrower — not the bottom of the page (Noah, 2026-08-19).
    setLayout(prev => [...prev, { i: id, ...firstFit(prev, def), minW: def.minW, minH: def.minH, maxH: def.maxH }]);
    setAddOpen(false);
  };

  /* Focus a strike on this desk: the desk repoints to its name if it has
     drifted, and makes sure there is a chart to draw it on — the first desk
     that carries one, else a chart added to this one. The deep link from
     other pages and the in-desk widgets (Ranked Targets) both come through
     here. */
  const focusOn = (price: number, ticker: string) => {
    if (ticker !== activeTicker) changeTicker(ticker);
    setFocus({ price, ticker, token: Date.now() });
    if (!instances.some(w => w.key === 'live-chart')) {
      const deskWithChart = Object.entries(store.desks).find(([, ws]) => ws.instances.some(w => w.key === 'live-chart'))?.[0];
      if (deskWithChart) switchDesk(deskWithChart);
      else addWidget('live-chart');
    }
  };

  // Deep link in: a strike to focus. Consumed so a refresh doesn't re-enter.
  useEffect(() => {
    const state = location.state as { focusPrice?: number; ticker?: string } | null;
    if (state?.focusPrice == null) return;
    focusOn(state.focusPrice, state.ticker ?? activeTicker);
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The focus is a fact about one name — leaving that name retires it. Only
  // a transition AWAY counts: arriving with a repoint in flight, the desk is
  // briefly still on the old name, and clearing then would kill the focus
  // before the chart ever drew it.
  const prevTickerRef = useRef(activeTicker);
  useEffect(() => {
    const prev = prevTickerRef.current;
    prevTickerRef.current = activeTicker;
    if (focus && prev === focus.ticker && activeTicker !== focus.ticker) setFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);

  const setWidgetTicker = (id: string, ticker: string | undefined) =>
    setInstances(prev => prev.map(w => (w.id === id ? { ...w, ticker } : w)));

  /* THE LINK (Mo, 2026-08-19). A linked panel (ticker undefined) that picks a
     name BROADCASTS it — the terminal moves, so every linked panel follows.
     An unlinked panel keeps its pick to itself. Unlinking pins the panel to
     whatever it shows right now, so nothing jumps at the moment of unlinking. */
  const pickFor = (inst: WidgetInstance) => (t: string) => {
    if (inst.ticker === undefined) changeTicker(t);
    else setWidgetTicker(inst.id, t);
  };
  const toggleLink = (inst: WidgetInstance) =>
    setWidgetTicker(inst.id, inst.ticker === undefined ? activeTicker : undefined);

  const removeWidget = (id: string) => {
    setInstances(prev => prev.filter(w => w.id !== id));
    setLayout(prev => prev.filter(l => l.i !== id));
  };

  /*
    ══ THE PHONE'S PULSE: ONE CHART, AND THAT IS THE WHOLE PAGE ══════════════

    Noah, 2026-08-25, on the desk collapsing badly at 390px: "it's okay if
    pulse does not work on phone, it should just be one chart on the phone
    like this" — with a TradingView mobile chart.

    That is the right call and it is worth saying why, because the obvious
    alternative is to make the grid responsive and it cannot be made to work.
    The desk is twelve columns wide. At 390px a column is 32px, so the
    NARROWEST panel the registry allows is about 97px across — not cramped,
    illegible. Stacking every panel to full width instead just trades that for
    a page you scroll through ten charts to reach the bottom of, which is not
    a desk either: the whole point of an arrangement is seeing the panels AT
    ONCE, and a phone cannot show two of these panels at once no matter how
    they are stacked. So the desk is a desktop object, and the phone gets the
    one panel that is worth the entire screen on its own.

    Branched in JS, not hidden with CSS, and the difference is the reason
    `useIsPhone` exists: a `md:hidden` grid still MOUNTS — ten live panels
    building canvases and subscribing to the tick behind a screen nobody can
    see, on the device least able to carry them.

    The desk state above is untouched by this. It still loads, still saves,
    still autosaves the active desk — a reader who opens the terminal on a
    laptop finds their arrangement exactly as they left it, having been on a
    phone in between.
  */
  if (isPhone) {
    return (
      /*
        Full bleed, cancelling the shell's own padding (`px-4 pt-5 pb-16`) so
        the chart reaches all four edges, exactly as Terrain does it — the one
        difference being that Terrain only takes the vertical cancellation
        from `lg` and this takes it always, because here the narrow width IS
        the case being built for rather than the one being escaped.

        `dvh`, not `vh`: on a phone browser `100vh` is the height with the URL
        bar RETRACTED, so a chart sized to it is taller than the window until
        the reader scrolls — the bottom of the tape, which is where the price
        axis and the taskbar live, sits under the browser chrome on arrival.
        `dvh` tracks the viewport that is actually showing. 3.5rem is the top
        bar, the same measured constant Terrain uses.
      */
      <div className="-mx-4 -mt-5 -mb-16 flex h-[calc(100dvh-3.5rem)] flex-col">
        {pulsedCtx ? (
          <LiveChartWidget
            /* Remounts on a name change so the chart rebuilds cleanly rather
               than re-pointing a live series — the desk's charts key the same
               way. */
            key={pulsedCtx.ticker}
            ctx={{ ...pulsedCtx, pickTicker: changeTicker }}
            soleChart
          />
        ) : (
          <DataState kind="loading" title="Reading the tape" body="The first tick has not arrived yet." />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={['Terminal', 'Pulse']}
        title="Pulse"
        subtitle="The live market desk — add panels, drag them around, link them to one name or let them hold their own; every desk saves as you go"
      />

      {/* Desk rail — two named groups so the house's desks and yours never
          read as one undifferentiated row (Noah, 2026-08-19: "these buttons
          all look the same"). Presets are bare chips under PRESETS; your
          saved desks wear an outline under YOURS; Save as is an action and
          dresses like one. */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Group labels: a different register from the chips they name —
            flat holo silver (the fact-slot label ink), smaller, letterspaced,
            and locked to the chips' line so they sit dead center. */}
        <span className="flex items-center gap-1.5">
          <span className="h-5 inline-flex items-center font-mono text-[8px] leading-none uppercase tracking-[0.2em] text-[#C7D3E8]/70 select-none">
            Presets
          </span>
          <span className="flex items-center gap-0.5">
            {PRESET_NAMES.map(name => (
              <span key={name} className="inline-flex" {...peekHandlers(name)}>
                <Chip active={active === name} onClick={() => switchDesk(name)} title="">
                  {/* Every desk wears a dot; the one you're ON is neon —
                      the selection voice saying "you are here". */}
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1 h-1 rounded-full shrink-0 ${active === name ? 'bg-select' : 'bg-[#C7D3E8]/50'}`} aria-hidden="true" />
                    {name}
                  </span>
                </Chip>
              </span>
            ))}
          </span>
        </span>
        {customNames.length > 0 && (
          <>
            <span className="w-px h-3.5 bg-borderSubtle" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              {/* No "Yours" heading — a desk carrying the user's own name
                  says that already, and the divider plus the hover-delete
                  are the honest tell (Noah, 2026-08-19). Same geometry as a
                  preset chip — one element, even padding — and a delete slot
                  of fixed width that reveals on hover. */}
              <span className="flex items-center gap-0.5">
                {customNames.map(name => (
                  <span key={name} className="group inline-flex items-center" {...peekHandlers(name)}>
                    <button
                      onClick={() => switchDesk(name)}
                      aria-pressed={active === name}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] whitespace-nowrap transition-colors ${
                        active === name
                          ? 'bg-white/[0.09] text-textPrimary font-semibold'
                          : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`w-1 h-1 rounded-full shrink-0 ${active === name ? 'bg-select' : 'bg-[#C7D3E8]/50'}`} aria-hidden="true" />
                      {name}
                    </button>
                    <button
                      onClick={() => deleteDesk(name)}
                      aria-label={`Delete the ${name} desk`}
                      title="Delete this desk"
                      className="w-4 h-4 inline-flex items-center justify-center rounded text-textMuted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!text-bear transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </span>
            </span>
          </>
        )}
        <span className="w-px h-3.5 bg-borderSubtle" aria-hidden="true" />
        {savingAs ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              saveAs();
            }}
            className="inline-flex items-center gap-1"
          >
            <input
              ref={saveInputRef}
              value={newName}
              onChange={e => setNewName(e.target.value.slice(0, 24))}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  setSavingAs(false);
                  setNewName('');
                }
              }}
              placeholder="Name this desk…"
              className="w-40 bg-inset border border-borderSubtle rounded px-2 py-1 font-mono text-[11px] text-textPrimary placeholder:text-textMuted focus:outline-none focus:border-borderMuted"
            />
            <button
              type="submit"
              disabled={!newName.trim() || isPreset(newName.trim())}
              title={isPreset(newName.trim()) ? 'Preset names are reserved' : 'Save'}
              className="p-1 rounded text-textSecondary hover:text-textPrimary disabled:opacity-30 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSavingAs(false);
                setNewName('');
              }}
              className="p-1 rounded text-textMuted hover:text-textPrimary transition-colors"
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setSavingAs(true)}
            title="Save this arrangement as a new desk"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] hover:border-borderMuted font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          >
            <Save className="w-3 h-3" /> Save as
          </button>
        )}
      </div>

      {peek && store.desks[peek.name] && (
        <HoverReadout x={peek.x} y={peek.y}>
          <DeskPeek name={peek.name} ws={store.desks[peek.name]} />
        </HoverReadout>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative" ref={addMenuRef}>
          {/* CTA wears the foil (lime retreating — Noah, 2026-08-17; filled
              holo is the sanctioned CTA material). */}
          <button
            onClick={() => setAddOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md holo-bg text-[#0a0a0a] hover:brightness-105 font-mono text-[11px] font-semibold uppercase tracking-wider transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add widget
          </button>
          {addOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-[620px] border border-borderMuted bg-panel rounded-md shadow-2xl shadow-black/60 overflow-hidden animate-slide-in flex">
              {/* Names on the left, the actual panel on the right. Only the
                  highlighted one is mounted — ten live panels took two seconds
                  to open, one is instant. */}
              <div className="w-[228px] shrink-0 max-h-[380px] overflow-y-auto border-r border-borderSubtle">
                {WIDGETS.map(def => (
                  <button
                    key={def.key}
                    onClick={() => addWidget(def.key)}
                    onMouseEnter={() => setPreviewKey(def.key)}
                    onFocus={() => setPreviewKey(def.key)}
                    className={`w-full text-left px-3 py-2 border-b border-borderSubtle/40 last:border-0 transition-colors ${
                      previewKey === def.key ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="block font-mono text-[11px] font-semibold text-textPrimary">{def.title}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
                <WidgetThumb def={previewDef} ctx={pulsedCtx} width={352} />
                <span className="font-mono text-[11px] font-semibold text-textPrimary">{previewDef.title}</span>
                <span className="text-[10px] text-textSecondary leading-snug">{previewDef.description}</span>
                <button
                  onClick={() => addWidget(previewDef.key)}
                  className="mt-auto w-full py-1.5 rounded holo-bg text-[#0a0a0a] hover:brightness-105 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all"
                >
                  Add {previewDef.title}
                </button>
              </div>
            </div>
          )}
        </div>
        {isPreset(active) && (
          <button
            onClick={reset}
            title={`Restore the ${active} preset`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset preset
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-widest tnum">
          {active} · {instances.length} panels · saves as you go
        </span>
      </div>

      {/* The grid — fades out on a switch, then the next desk mounts under a
          fresh key and breathes in slowly */}
      {!pulsedCtx ? (
        <Panel className="w-full">
        <DataState kind="loading" title="Reading the tape" body="The first tick has not arrived yet." />
      </Panel>
      ) : instances.length === 0 ? (
        <Panel className="h-64" bodyClassName="flex flex-col items-center justify-center gap-2">
          <span className="font-mono text-[11px] text-textMuted uppercase tracking-widest">Empty desk</span>
          <span className="text-[11px] text-textSecondary">Use “Add widget” to build your layout</span>
        </Panel>
      ) : (
        <div
          key={active}
          className={`animate-soft-in-slow transition-opacity duration-200 ease-out ${switching ? 'opacity-0' : 'opacity-100'}`}
        >
          <Grid
            layout={layout}
            cols={12}
            rowHeight={88}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            /* Vertical compaction restored (Noah, 2026-08-17: the null-compaction
               trial "messed it up" — reverted same day). */
            compactType="vertical"
            draggableHandle=".widget-drag"
            /* Every corner resizes (Noah, 2026-08-17) — the library defaults to
               bottom-right only. */
            resizeHandles={['se', 'sw', 'ne', 'nw']}
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
                    {/* The link + name. stopPropagation on mousedown so using
                        the picker never starts a panel drag. */}
                    <span className="ml-auto flex items-center gap-1.5" onMouseDown={e => e.stopPropagation()}>
                      <WidgetTickerPicker
                        value={inst.ticker}
                        terminalTicker={activeTicker}
                        onPick={pickFor(inst)}
                        onToggleLink={() => toggleLink(inst)}
                      />
                      {/* Fat hit target (Noah, 2026-08-17: "very difficult to
                          click") — the padding is the button; the icon just
                          marks its center. */}
                      <button
                        onClick={() => removeWidget(inst.id)}
                        aria-label="Remove widget"
                        className="p-1.5 -my-1.5 -mr-1 rounded text-textMuted hover:text-bear hover:bg-white/[0.06] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  </div>
                  <div className="flex-grow min-h-0 overflow-hidden">
                    {(() => {
                      const wctx = ctxFor(inst.ticker);
                      return wctx ? (
                        def.render({
                          ...wctx,
                          pickTicker: pickFor(inst),
                          // The arrival token goes to ONE chart — the first on
                          // the focus's name — so two charts never lift at once
                          focusOpen: inst.id === focusChartId ? focus?.token : undefined,
                        })
                      ) : (
                        <span className="flex h-full items-center justify-center font-mono text-[10px] text-textMuted uppercase tracking-widest">
                          No data for {inst.ticker}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </Grid>
        </div>
      )}
    </>
  );
};

export default Pulse;
