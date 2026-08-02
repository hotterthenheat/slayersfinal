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
  StretchHorizontal,
  Maximize,
  Lock,
  Pencil,
  Search,
  Check,
  ExternalLink,
  PictureInPicture2,
  Anchor,
  Monitor,
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
import { buildCompass } from '../../data/compass';
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
  type PixelBounds,
  type PulseLayout,
  type PulsePanel,
  type PulseWorkspaceState,
  type ScreenBox,
} from './presets';
import {
  GRID,
  MIN_UNITS,
  boundsFromGrid,
  boundsOnScreen,
  clampBounds,
  deadSpace,
  mergeLayout,
  migrateWorkspace,
  screenIndexOf,
  tile,
} from './detach';
import { useScreens, type DisplayInfo } from './useScreens';
import PopoutPanel from './PopoutPanel';
import { openPanelWindow } from './popoutWindow';
import DetachedPanel from './DetachedPanel';

const Grid = WidthProvider(RGL);
/** Grid columns — shared by the layout and the keyboard nudge clamp. */
const GRID_COLS = 12;

const SCAN_INTERVAL_MS = 10_000;

/**
 * One shared data context per ticker, built once per scan.
 *
 * The strike window is the WIDEST the chain supports: the simulated book carries
 * spot ±15 (31 strikes) and the desk was drawing the inner ±10, so ten strikes
 * of real exposure were clipped off every GEX panel at once and a wall sitting
 * just outside the window simply was not on screen. Measured cost of the extra
 * rows on the 1s heat pulse is +3.6ms per repaint (6.4 → 10.1ms), inside the
 * 16.7ms frame budget. Going deeper than the chain needs the chain itself to get
 * deeper: see simulator.ts `strikeRange`.
 */
function buildCtx(snapshot: MarketSnapshot, revision: number, focusPrice: number | null = null): WorkspaceCtx {
  const gex = buildGexView(snapshot, 'GEX', 20);
  const iv = Simulator.TICKERS[snapshot.ticker]?.iv ?? 0.2;
  return {
    ticker: snapshot.ticker,
    revision,
    snapshot,
    iv,
    gex,
    matrix: gex.matrix,
    exposure: buildExposureProfile(snapshot, '0DTE', 15),
    cmd: buildCommandView(snapshot),
    vanna: buildVannaCharm(snapshot, 'CHARM', -1),
    vol: buildVolLab(snapshot.ticker, snapshot.spot, iv),
    setups: buildCompass(snapshot, 'top-setups'),
    focusPrice,
  };
}

// ---- layout constraints --------------------------------------------------
/**
 * The registry is the one authority on how small a widget may get. Layout items
 * carry their own minW/minH — hand-typed in the presets, frozen at write time in
 * a saved layout — and nothing reconciled the two, so "GEX + Order Flow" shipped
 * the Exposure Matrix at w=4 under a declared minimum of 6, and any layout saved
 * before a widget's floor moved kept the old one forever. Read the floor off the
 * registry on every load and clamp anything already under it.
 */
function hydrateLayout(l: PulseLayout): PulseLayout {
  return {
    ...l,
    layout: l.layout.map(g => ({
      ...g,
      // Nothing is clamped. This used to read every widget's registered floor
      // and raise `w` and `h` to it on EVERY load, which is why a panel could
      // be dragged narrower and then silently sprang back the next time the
      // desk opened, and why a row of panels could never be made to sum to 12:
      // there was always a strip of canvas on the right that no combination of
      // sizes could reach. The registry still says how big a panel is born;
      // what it grows or shrinks to afterwards is the user's business.
      minW: MIN_UNITS.w,
      minH: MIN_UNITS.h,
      w: Math.min(GRID_COLS, Math.max(MIN_UNITS.w, g.w)),
      h: Math.max(MIN_UNITS.h, g.h),
    })),
  };
}

const hydratedPreset = (p: PulseLayout): PulseLayout => hydrateLayout(clonePreset(p));

// ---- persistence ---------------------------------------------------------
function freshState(): PulseWorkspaceState {
  return {
    version: WORKSPACE_VERSION,
    layouts: PULSE_PRESETS.map(hydratedPreset),
    activeId: PULSE_PRESETS[0].id,
  };
}

function loadState(): PulseWorkspaceState {
  try {
    const raw = localStorage.getItem(PULSE_STORAGE_KEY);
    if (!raw) return freshState();
    // Migrate rather than discard. This used to compare the stored version to
    // WORKSPACE_VERSION and hand back a fresh workspace on any mismatch, which
    // meant the next schema bump would delete every desk the user had built,
    // silently, with nothing red anywhere. migrateWorkspace returns null only
    // for data it genuinely cannot read.
    const parsed = migrateWorkspace(JSON.parse(raw) as PulseWorkspaceState);
    if (!parsed) return freshState();
    // Drop panels whose keys no longer exist in the registry, then re-read every
    // size floor from the registry (see hydrateLayout).
    parsed.layouts = parsed.layouts.map(l => {
      const panels = l.panels.filter(p => pulsePanelByKey(p.key));
      return hydrateLayout({ ...l, panels, layout: l.layout.filter(g => panels.some(p => p.id === g.i)) });
    });
    // Fold in any preset the saved state predates (by id), so returning users
    // gain newly-shipped desk profiles without losing their custom layouts.
    const have = new Set(parsed.layouts.map(l => l.id));
    const missing = PULSE_PRESETS.filter(p => !have.has(p.id)).map(hydratedPreset);
    if (missing.length) parsed.layouts = [...parsed.layouts, ...missing];
    if (!parsed.layouts.some(l => l.id === parsed.activeId)) parsed.activeId = parsed.layouts[0].id;
    return parsed;
  } catch {
    return freshState();
  }
}

/**
 * The size a widget WANTS, in grid units.
 *
 * This is no longer a floor. It is what a panel is born at, and what the
 * one-press arrange modes aim for so pressing Columns still produces something
 * legible rather than twelve slivers. A manual drag ignores it entirely.
 *
 * Heights double on the way out because the row unit is half as tall as it was
 * when these numbers were tuned; the registry still declares them in the old
 * coarse unit, same as the presets.
 */
const wantOf = (key: string): { w: number; h: number } => {
  const def = pulsePanelByKey(key);
  return { w: def?.minW ?? 3, h: (def?.minH ?? 3) * 2 };
};

/** A collapsed panel is its 40px title bar and nothing else. Two fine rows is
    64px, which is what one coarse row used to be — so minimizing looks the same
    as it always did. */
const MINIMIZED_H = 2;

/**
 * Re-flow the active layout's panels into a quick arrangement.
 *
 * Every mode used to emit a flat minW/minH of 3 for every panel. RGL reads the
 * resize floor off the layout item, so one press of Columns silently licensed a
 * later mouse-drag to shrink the Liquidity Map to a third of the size its own
 * heatmap needs. Sizes now come from the widget's own registered floor.
 */
function arrange(mode: 'one' | 'cols' | 'rows' | 'quad', panels: PulsePanel[]): Layout[] {
  // per-row width, nominal height, panels per row
  // Heights are in the fine row unit: 6 coarse rows is 12 of these.
  const SHAPE = {
    one: { w: 12, h: 12, per: 1 },
    cols: { w: 6, h: 12, per: 2 },
    rows: { w: 12, h: 8, per: 1 },
    quad: { w: 6, h: 10, per: 2 },
  }[mode];

  const out: Layout[] = [];
  let y = 0;
  for (let k = 0; k < panels.length; k += SHAPE.per) {
    const band = panels.slice(k, k + SHAPE.per);
    const boxes = band.map((p, j) => {
      // The shape wins on width — the whole point of "Columns" is two equal
      // columns — but a widget that wants to be taller still gets its height,
      // so a one-press arrange never produces a panel too short to read.
      const want = wantOf(p.key);
      return { i: p.id, x: j * SHAPE.w, y, w: SHAPE.w, h: Math.max(want.h, SHAPE.h), minW: MIN_UNITS.w, minH: MIN_UNITS.h };
    });
    // The nominal height is a suggestion; a widget whose floor is taller sets the
    // band, so the row advances past its real bottom instead of overlapping the
    // next one and leaving RGL to shove it out.
    const bandH = Math.max(...boxes.map(b => b.h));
    boxes.forEach(b => out.push({ ...b, h: bandH }));
    y += bandH;
  }
  return out;
}

/**
 * Pack the desk into full rows.
 *
 * The other four modes impose a shape; this one keeps the shape the user built
 * and only closes the gaps. It walks the panels in reading order, keeps adding
 * to the current row while the next panel's floor still fits, then stretches or
 * trims that row's widths until they sum to exactly 12. This is what repairs an
 * already-saved desk where two panels the user wanted side by side are stacked
 * because their old default widths summed past the grid — nothing migrates on
 * load, they press Fit.
 */
function fitRows(layout: Layout[], panels: PulsePanel[]): Layout[] {
  const panelOf = (i: string) => panels.find(p => p.id === i);
  const keyOf = (i: string) => panelOf(i)?.key ?? '';
  const order = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Layout[][] = [];
  let row: Layout[] = [];
  let wantUsed = 0;
  const flush = () => {
    if (row.length) rows.push(row);
    row = [];
    wantUsed = 0;
  };
  for (const g of order) {
    // A collapsed panel is a title bar. Pairing it with a full-height neighbour
    // would stretch it back open with its body still hidden, so it takes a band
    // of its own.
    if (panelOf(g.i)?.minimized) {
      flush();
      rows.push([g]);
      continue;
    }
    // Row breaks still use the widget's PREFERRED width. This is the one place
    // that judgement belongs: Fit is a one-press tidy, and packing eight panels
    // into a row because each is technically allowed to be one column wide
    // would be obeying the letter of "no floors" and missing the point.
    const want = wantOf(keyOf(g.i)).w;
    if (row.length && wantUsed + want > GRID_COLS) flush();
    row.push(g);
    wantUsed += want;
  }
  flush();

  const out: Layout[] = [];
  let y = 0;
  for (const r of rows) {
    if (r.length === 1 && panelOf(r[0].i)?.minimized) {
      out.push({ ...r[0], x: 0, y, w: GRID_COLS, h: MINIMIZED_H, minW: MIN_UNITS.w, minH: MIN_UNITS.h });
      y += MINIMIZED_H;
      continue;
    }
    // Start from what each panel currently is, then settle the row on exactly
    // 12. Nothing is held above a floor any more, so the row ALWAYS reaches 12
    // and the ragged right edge is gone by construction rather than by luck.
    const widths = r.map(g => Math.max(MIN_UNITS.w, Math.min(g.w, GRID_COLS)));
    let sum = widths.reduce((a, b) => a + b, 0);
    for (let guard = 0; sum > GRID_COLS && guard < 256; guard++) {
      let pick = -1;
      widths.forEach((w, k) => {
        if (w > MIN_UNITS.w && (pick < 0 || w > widths[pick])) pick = k;
      });
      if (pick < 0) break;
      widths[pick] -= 1;
      sum -= 1;
    }
    for (let guard = 0; sum < GRID_COLS && guard < 256; guard++) {
      let pick = 0;
      widths.forEach((w, k) => {
        if (w < widths[pick]) pick = k;
      });
      widths[pick] += 1;
      sum += 1;
    }
    // One height per row so the row reads as a band rather than a ragged edge.
    const h = Math.max(...r.map(g => g.h), MIN_UNITS.h);
    let x = 0;
    r.forEach((g, k) => {
      out.push({ ...g, x, y, w: widths[k], h, minW: MIN_UNITS.w, minH: MIN_UNITS.h });
      x += widths[k];
    });
    y += h;
  }
  return out;
}

/**
 * Where a newly added panel lands. It used to be `{ x: 0, y: Infinity }` — the
 * left edge of a brand-new bottom row — so adding a second panel stacked it
 * under the first even with half the grid free beside it, which is exactly what
 * "the boxes don't fit each other" describes. Take the first row with room for
 * the incoming widget's own minimum, and only fall back to a new bottom row when
 * no row has any.
 */
function placeNew(layout: Layout[], def: { w: number; minW: number }): { x: number; y: number; w: number } {
  // `def.minW` here is the width the widget WANTS, used to decide whether a
  // row has enough room to be worth landing in. It is not a floor on what the
  // panel may later be dragged to.
  const bands = [...new Set(layout.map(g => g.y))].sort((a, b) => a - b);
  for (const y of bands) {
    // Everything whose vertical span COVERS this band, not just what starts on
    // it: Flow Command's full-height GEX column occupies three bands, and
    // counting only the panels that begin at each y would offer its space away.
    const rightEdge = layout.reduce((m, g) => (g.y <= y && y < g.y + g.h ? Math.max(m, g.x + g.w) : m), 0);
    const free = GRID_COLS - rightEdge;
    if (free >= def.minW) return { x: rightEdge, y, w: Math.min(def.w, free) };
  }
  return { x: 0, y: Infinity, w: def.w };
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
  /** Float free of the grid, or snap back into the cell it left. */
  onDetach: (panelId: string) => void;
  onDock: (panelId: string) => void;
  /** Open in its own OS window. `display` places it on a specific monitor. */
  onPopout: (panelId: string, display?: DisplayInfo) => void;
  /** Displays available to place a pop-out on; one entry means no picker. */
  displays: DisplayInfo[];
  requestDisplays: () => void;
}

/** One class for every icon button in the panel header. It was repeated
    verbatim seven times, and the copies had already drifted. */
const chromeBtn =
  'p-1.5 rounded text-textMuted hover:text-textPrimary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60';

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
  placement = 'docked',
  h,
}: {
  panelId: string;
  panelKey: string;
  ticker: string;
  price?: number;
  changePct?: number;
  maximizedView?: boolean;
  /** Where this panel is living. Drives which of detach/dock/pop-out show. */
  placement?: 'docked' | 'detached' | 'popped';
  h: PanelChromeHandlers;
}) => {
  const def = pulsePanelByKey(panelKey);
  const [nudged, setNudged] = useState('');
  /**
   * Measure the header, do not guess from the column count.
   *
   * In Customize mode a docked panel carries eight interactive controls, not
   * the four a read-only panel shows, and at the 2-column floor only four of
   * them land inside the box — the rest overflow and are unclickable. A column
   * count cannot tell you that, because two columns is 244px on a 1600 desk and
   * 153px at the 1024 breakpoint. So the header watches its own width and drops
   * the secondary controls when they stop fitting, which is also why the floor
   * can stay at two units instead of being raised for the widest case.
   */
  const headRef = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(9999);
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Thresholds are the measured cost of each group: ~26px a button, plus the
  // grip and a readable stub of title.
  const showQuote = room >= 420;
  const showSecondary = room >= 300; // duplicate + minimize
  const showPlacement = room >= 210; // detach + pop out
  // A detached panel has its own drag strip and a popped-out one has the OS
  // window's title bar, so neither takes the grid's drag handle.
  const draggable = !maximizedView && placement === 'docked' && h.editLayout;
  const title = def?.title ?? panelKey;
  const up = (changePct ?? 0) >= 0;
  return (
    <div ref={headRef} className={`${draggable ? 'widget-drag cursor-grab active:cursor-grabbing' : ''} flex items-center gap-2 px-3.5 h-10 border-b border-borderSubtle bg-white/[0.015] shrink-0 select-none overflow-hidden`}>
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
      {showPlacement && <PanelTicker value={ticker} onChange={t => h.onTicker(panelId, t)} />}
      {showQuote && price != null && Number.isFinite(price) && (
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
        {draggable && showSecondary && (
          <>
            <button onClick={() => h.onDuplicate(panelId)} title="Duplicate" aria-label={`Duplicate ${title} panel`} className={chromeBtn}>
              <Copy className="w-3 h-3" />
            </button>
            <button onClick={() => h.onMinimize(panelId)} title="Minimize" aria-label={`Minimize ${title} panel`} className={chromeBtn}>
              <Minus className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Window placement. Available whether or not Customize is on: moving a
            panel to another monitor is how the desk is USED, not how it is
            built, and gating it behind edit mode would be the same mistake as
            gating the ticker switcher. Maximized is the one exclusion — there
            is no grid cell to come back to mid-maximize. */}
        {!maximizedView && placement !== 'popped' && showPlacement && (
          <>
            <button
              onClick={() => (placement === 'detached' ? h.onDock(panelId) : h.onDetach(panelId))}
              title={placement === 'detached' ? 'Dock back into the grid' : 'Detach — float free of the grid'}
              aria-label={placement === 'detached' ? `Dock ${title} panel back into the grid` : `Detach ${title} panel from the grid`}
              className={chromeBtn}
            >
              {placement === 'detached' ? <Anchor className="w-3.5 h-3.5" /> : <PictureInPicture2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => h.onPopout(panelId)}
              title={h.displays.length > 1 ? `Pop out to ${h.displays.find(d => !d.isCurrent)?.label ?? 'another display'}` : 'Pop out into its own window'}
              aria-label={`Pop ${title} panel out into its own window`}
              className={chromeBtn}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {placement === 'popped' && (
          <button onClick={() => h.onDock(panelId)} title="Return to the desk" aria-label={`Return ${title} panel to the desk`} className={chromeBtn}>
            <Anchor className="w-3.5 h-3.5" />
          </button>
        )}

        {placement !== 'popped' && (
          <button
            onClick={() => h.onMaximize(maximizedView ? null : panelId)}
            title={maximizedView ? 'Restore' : 'Maximize'}
            aria-label={`${maximizedView ? 'Restore' : 'Maximize'} ${title} panel`}
            className={chromeBtn}
          >
            {maximizedView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        )}
        {(draggable || placement === 'detached') && (
          <button onClick={() => h.onClose(panelId)} title="Close" aria-label={`Close ${title} panel`} className={`${chromeBtn} hover:text-bear`}>
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

/**
 * How many panels may take the 1s heat pulse at once.
 *
 * Measured rather than guessed. One 30-strike matrix repaints in ~10ms, two in
 * ~19ms, three in ~30ms, four in ~34ms (headless Chromium at 1536x900, React 18
 * production, real heatCellStyle), against a 16.7ms budget at 60fps. So a desk
 * carrying more than one heatmap cannot pulse them together without dropping a
 * frame every second. Over the budget they ALL fall back to the 10s scan
 * cadence: the per-second movement is an interpolation between scans, and a wall
 * of books is read by comparing them, which a staggered or partial animation
 * actively gets in the way of. Raising this needs the cell repaint to get
 * cheaper, not the budget to get more generous — see GexMatrix's per-cell CSS
 * transition, which is most of the cost.
 */
const PULSE_BUDGET = 1;

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

  // ---- out-of-grid panels -------------------------------------------------
  /** Live handles on the pop-out windows. Deliberately NOT persisted: a Window
      cannot be serialised, and after a reload the browser will not let us
      reopen one without a fresh gesture. The layout remembers the BOX; this map
      remembers the window that is currently showing it. */
  const [popWins, setPopWins] = useState<Map<string, Window>>(() => new Map());
  /** Stacking order for floating panels — last touched sits on top. */
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const zTop = useRef(10);
  /** The panel a drag or resize is currently about. Read once by
      `onLayoutChange` to decide whose size to hold while the rest absorb. */
  const touched = useRef<string | null>(null);
  /** The desk surface, measured so a detaching panel keeps its exact box. */
  const deskRef = useRef<HTMLDivElement | null>(null);
  const { displays, granted: displaysGranted, request: requestDisplays, supported: supportsDisplays } = useScreens();
  /** Which monitor new pop-outs open on. Held by label rather than index, since
      unplugging a monitor renumbers the list. */
  const [popoutTarget, setPopoutTarget] = useState<string | null>(null);
  const [winMenuOpen, setWinMenuOpen] = useState(false);

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

  // Maximizing hides every other panel, so the budget is spent on what is
  // actually on screen rather than on what the layout holds.
  const pulsePanelCount = maximizedId
    ? active.panels.filter(p => p.id === maximizedId && PULSE_KEYS.has(p.key)).length
    : active.panels.filter(p => PULSE_KEYS.has(p.key)).length;
  const pulseOn = pulsePanelCount > 0 && pulsePanelCount <= PULSE_BUDGET;

  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    // No pulsing panel on screen means no reason to re-render the desk every
    // second just to throw the result away in MemoPanelBody.
    if (!pulseOn) return;
    const id = setInterval(() => setPulseTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [pulseOn]);

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
    mutate(l => {
      const spot = placeNew(l.layout, def);
      return {
        ...l,
        panels: [...l.panels, { id, key }],
        // Born at the registry's size; free to be dragged anywhere after.
        layout: [...l.layout, { i: id, ...spot, h: def.h * 2, minW: MIN_UNITS.w, minH: MIN_UNITS.h }],
      };
    });
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
        layout: l.layout.map(g =>
          g.i === id ? { ...g, h: min ? MINIMIZED_H : (p.restoreH ?? geo.h), minH: MIN_UNITS.h } : g,
        ),
      };
    });

  /**
   * The grid only ever reports the panels it is rendering, so writing `next`
   * straight back DELETES the cell of every panel that is currently detached or
   * popped out. The panel then docks back as an item RGL has never seen and
   * lands at the default 1x1 in the top-left corner — a chart collapsed to a
   * stub, which is what the whole "keeps its layout entry while away" contract
   * was supposed to prevent. Carry the absent cells across untouched.
   */
  const onLayoutChange = (next: Layout[]) => {
    // Only re-tile when a gesture put us here. On mount, on a layout switch and
    // on a restore there is no touched panel, and re-packing then would reshape
    // a preset the user never asked to change — Flow Command's full-height
    // column being the obvious casualty.
    const held = touched.current;
    touched.current = null;
    // Minimized panels are a parked title bar. They pack like anything else but
    // must never be GROWN, or the fill logic stretches one to a neighbour's
    // height and it becomes a tall empty card with its body still hidden.
    const minimized = active.panels.filter(p => p.minimized).map(p => p.id);
    const settled = held ? tile(next, { hold: [held], noGrow: minimized }) : next;
    mutate(l => ({
      ...l,
      layout: mergeLayout(
        settled,
        l.layout,
        l.panels.filter(p => p.detached || p.popout).map(p => p.id),
      ),
    }));
  };

  // ---- placement: docked ⇄ detached ⇄ popped out --------------------------
  /**
   * A panel keeps its `layout` entry the whole time it is away, so docking
   * returns it to the cell it left rather than to the bottom of the grid. The
   * grid simply does not render it while `detached` or `popout` is set.
   */
  const patchPanel = (id: string, patch: (p: PulsePanel) => PulsePanel) =>
    mutate(l => ({ ...l, panels: l.panels.map(p => (p.id === id ? patch(p) : p)) }));

  const detachPanel = (id: string) => {
    const geo = active.layout.find(g => g.i === id);
    const surface = deskRef.current;
    if (!geo || !surface) return;
    // Hand it the pixel box it already occupies, so it lifts off the grid
    // exactly where it was standing instead of jumping to a corner.
    const box = clampBounds(boundsFromGrid(geo, surface.clientWidth), {
      w: surface.clientWidth,
      h: Math.max(surface.clientHeight, 400),
    });
    bumpZ(id);
    patchPanel(id, p => ({ ...p, detached: box, popout: undefined }));
  };

  const dockPanel = (id: string) => {
    closePopout(id);
    mutate(l => {
      const panels = l.panels.map(p => (p.id === id ? { ...p, detached: undefined, popout: undefined } : p));
      // Re-tile the whole docked set, the returning panel included. Its saved
      // cell is a HINT, not a reservation: the desk keeps itself gapless while a
      // panel is away, so that cell has usually been absorbed by a neighbour and
      // dropping the panel straight back onto it would overlap. Packing it in
      // costs the exact-same-cell guarantee and buys never colliding.
      const backIds = new Set(panels.filter(p => !p.detached && !p.popout).map(p => p.id));
      const staying = l.layout.filter(g => backIds.has(g.i) && g.i !== id);
      const returning = l.layout.find(g => g.i === id);
      // Land the returning panel BELOW everything, then let the pack lift it in.
      //
      // Dropping it straight onto its saved cell overlaps whatever absorbed
      // that space while it was away, and an overlapping desk trips the band
      // reflow — which is correct but brutal: a chart came back 244px wide,
      // shredded into a six-panel band. Arriving underneath costs nothing, and
      // the up-pack then slots it into the first row with room for it.
      const floor = staying.reduce((m, g) => Math.max(m, g.y + g.h), 0);
      const docked = returning ? [...staying, { ...returning, y: floor }] : staying;
      return {
        ...l,
        panels,
        layout: mergeLayout(
          tile(docked, { noGrow: panels.filter(p => p.minimized).map(p => p.id) }),
          l.layout,
          panels.filter(p => p.detached || p.popout).map(p => p.id),
        ),
      };
    });
  };

  const moveDetached = (id: string, box: PixelBounds) => patchPanel(id, p => ({ ...p, detached: box }));

  /**
   * Pop a panel into its own window.
   *
   * `window.open` has to happen inside this call stack, which is still the
   * click's, because a popup inherits the opener's user activation and an
   * activation does not survive into an effect. That is also why the display
   * list is requested lazily here rather than on mount: the Window Management
   * permission prompt is itself gesture-gated.
   */
  const popoutPanel = (id: string, display?: DisplayInfo) => {
    const panel = active.panels.find(p => p.id === id);
    if (!panel) return;
    const target = display ?? displays.find(d => d.label === popoutTarget) ?? displays.find(d => d.isCurrent) ?? displays[0];
    const box = panel.popout ?? boundsOnScreen(target, 0.55);
    const def = pulsePanelByKey(panel.key);
    const title = `${def?.title ?? panel.key} · ${panel.ticker ?? activeTicker} · Slayer`;
    const win = openPanelWindow(box, id, title);
    if (!win) {
      toast.warn('Your browser blocked the pop-out window. Allow pop-ups for this site, then try again.');
      return;
    }
    setPopWins(m => new Map(m).set(id, win));
    patchPanel(id, p => ({ ...p, popout: box, detached: undefined }));
    // Ask for the real display list AFTER the window is open, so the next
    // pop-out can offer a monitor picker. Doing it before would spend the
    // gesture on the permission prompt and lose the window.
    if (supportsDisplays && !displaysGranted) void requestDisplays();
  };

  /** Drop our handle on a pop-out and close it if it is still standing. */
  const closePopout = (id: string) =>
    setPopWins(m => {
      const win = m.get(id);
      if (!win) return m;
      if (!win.closed) win.close();
      const next = new Map(m);
      next.delete(id);
      return next;
    });

  /** The user closed the window from its own title bar. The panel comes home
      rather than vanishing — a closed window is not a deleted panel. */
  const onPopoutClosed = (id: string) => {
    setPopWins(m => {
      if (!m.has(id)) return m;
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    patchPanel(id, p => ({ ...p, popout: undefined }));
  };

  const onPopoutMoved = (id: string, box: ScreenBox) => patchPanel(id, p => ({ ...p, popout: box }));

  const bumpZ = (id: string) => setZOrder(z => ({ ...z, [id]: (zTop.current += 1) }));

  /**
   * Keyboard move/resize. react-grid-layout ships no keyboard path — its drag
   * and resize handles are bare divs — so Customize mode advertised a
   * rearrangeable desk that a keyboard user could not rearrange at all. Writing
   * the geometry straight into the layout is the same thing a drag produces, and
   * RGL re-runs its vertical compaction from it.
   */
  const nudgePanel = (id: string, dx: number, dy: number, dw: number, dh: number): string => {
    // The keyboard path gets exactly the freedom the mouse has. It used to
    // read the registry floor, so Shift+Arrow stopped shrinking a panel at a
    // size the mouse is now allowed past — two different limits for the same
    // gesture.
    const minW = MIN_UNITS.w;
    const minH = MIN_UNITS.h;
    let announced = '';
    mutate(l => {
      const away = l.panels.filter(p => p.detached || p.popout).map(p => p.id);
      const awaySet = new Set(away);
      const moved = l.layout
        .filter(g => !awaySet.has(g.i))
        .map(g => {
          if (g.i !== id) return g;
          const w = Math.max(minW, Math.min(GRID_COLS, g.w + dw));
          const h = Math.max(minH, g.h + dh);
          const x = Math.max(0, Math.min(GRID_COLS - w, g.x + dx));
          const y = Math.max(0, g.y + dy);
          announced = dw || dh ? `${w} by ${h}` : `column ${x + 1}, row ${y + 1}`;
          return { ...g, x, y, w, h };
        });
      // Tile the keyboard path too. It wrote straight to the layout and never
      // went near `tile`, so Shift+Arrow left exactly the dead bands a mouse
      // drag now removes automatically — the keyboard promised equivalent
      // resizing and quietly delivered a worse desk.
      return {
        ...l,
        layout: mergeLayout(
          tile(moved, { hold: [id], noGrow: l.panels.filter(p => p.minimized).map(p => p.id) }),
          l.layout,
          away,
        ),
      };
    });
    return announced;
  };

  const doArrange = (mode: 'one' | 'cols' | 'rows' | 'quad') =>
    mutate(l => ({ ...l, layout: arrange(mode, l.panels) }));

  const doFit = () => mutate(l => ({ ...l, layout: fitRows(l.layout, l.panels) }));

  /**
   * Stretch every panel into whatever space is left beside and below it.
   *
   * Distinct from Fit, which re-flows the desk into tidy full-width rows and
   * therefore MOVES things. Fill moves nothing: it keeps the arrangement the
   * user built and only takes the holes out of it, which is the whole point
   * when the arrangement is deliberate and the gaps are not.
   */
  const doFill = () =>
    mutate(l => {
      const docked = l.layout.filter(g => l.panels.some(p => p.id === g.i && !p.detached && !p.popout));
      const before = deadSpace(docked);
      const packed = tile(docked, { noGrow: l.panels.filter(p => p.minimized).map(p => p.id) });
      toast.info(
        before <= 0.001
          ? 'No dead space to reclaim'
          : `Dead space ${Math.round(before * 100)}% to ${Math.round(deadSpace(packed) * 100)}%`,
      );
      return { ...l, layout: mergeLayout(packed, l.layout, l.panels.filter(p => p.detached || p.popout).map(p => p.id)) };
    });

  /**
   * Re-tile after a drag or a resize so the desk is never left with a hole.
   *
   * The invariant the user asked for: make one panel smaller and the others get
   * bigger. `held` is the panel they just let go of — it keeps exactly the size
   * they dragged it to, and the rest of the row absorbs what it gave up. A
   * panel with no neighbour to donate to is grown back, because "keep my width"
   * and "no dead space" cannot both hold when a panel is alone in its row.
   */


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
    mutate(() => hydratedPreset(preset));
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

  // ---- panel placement, derived -------------------------------------------
  /** Only docked panels go into the grid. A detached or popped-out panel keeps
      its `layout` entry so it can come home to the same cell, but the grid must
      not render it or it appears in two places at once. */
  const dockedPanels = active.panels.filter(p => !p.detached && !p.popout);
  const dockedLayout = active.layout.filter(g => dockedPanels.some(p => p.id === g.i));
  const detachedPanels = active.panels.filter(p => p.detached);
  const outCount = active.panels.filter(p => p.detached || p.popout).length;
  /**
   * Panels the layout says are popped out but which have no live window —
   * after a reload, or after the layout was switched away and back. They cannot
   * be reopened automatically: `window.open` without a user gesture is exactly
   * what a pop-up blocker exists to stop, and a silently-swallowed window would
   * read as the feature being broken. So they are offered as one button.
   */
  const reopenable = active.panels.filter(p => p.popout && !popWins.has(p.id));
  /** Share of the desk that is empty, so Fill can say what it will reclaim. */
  const gaps = deadSpace(dockedLayout);

  /**
   * Windows belong to the layout that opened them. Switching desk profiles has
   * to take its windows with it, or the second monitor keeps showing a panel
   * from a layout that is no longer on screen.
   */
  useEffect(() => {
    return () => {
      popWins.forEach(w => {
        if (!w.closed) w.close();
      });
    };
    // Intentionally keyed on the layout id alone: this is a teardown for
    // "the active desk changed", not for "the window map changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id]);

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
    const ctx = pulseOn && PULSE_KEYS.has(key) ? { ...base, matrix: pulseMatrix(base.gex.matrix, pulseTick) } : base;
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
    onDetach: detachPanel,
    onDock: dockPanel,
    onPopout: popoutPanel,
    displays,
    requestDisplays: () => void requestDisplays(),
  };

  // Live quote for a panel's ticker (scan cadence — no per-second header churn).
  const snapFor = (t: string) => ctxByTicker.get(t)?.snapshot;

  const barBtn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-rowHover font-mono text-label uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors';

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 bg-canvas p-3 flex flex-col gap-4 overflow-auto' : 'flex flex-col gap-4'}>
      {/* The desk is deliberately chromeless — no page title bar — so the H1
          every other route renders is here for the document outline and for
          assistive tech, not for the eye. */}
      <h1 className="sr-only">Pulse workspace: {active.name}</h1>
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
              <button onClick={() => doArrange('one')} title="One panel per row" aria-label="Arrange one panel per row" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><Square className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('cols')} title="Two columns" aria-label="Arrange in two columns" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><Columns className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('rows')} title="Short rows" aria-label="Arrange in short rows" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><Rows className="w-3.5 h-3.5" /></button>
              <button onClick={() => doArrange('quad')} title="Two by two" aria-label="Arrange two by two" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><Grid2x2 className="w-3.5 h-3.5" /></button>
              {/* Keeps the desk you built and only closes the gaps, so a pair
                  that saved stacked ends up side by side. */}
              <button onClick={doFit} title="Fit panels to full rows" aria-label="Fit panels to full rows" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><StretchHorizontal className="w-3.5 h-3.5" /></button>
              <button onClick={doFill} title={gaps > 0.001 ? `Fill dead space (${Math.round(gaps * 100)}% empty)` : 'Fill dead space'} aria-label="Grow every panel to fill the empty space around it" className="px-2 py-1.5 text-textMuted hover:text-textPrimary hover:bg-rowHover border-l border-borderSubtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-select/60"><Maximize className="w-3.5 h-3.5" /></button>
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
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-label font-semibold text-textPrimary">{def.title}</span>
                      {/* The grid is 12 wide, so the size a panel arrives at
                          decides whether it can share a row. Say it before the
                          click instead of after. */}
                      <span className="ml-auto shrink-0 font-mono text-micro text-textMuted tnum" title={`${def.w} of ${GRID_COLS} columns wide, ${def.h} rows tall`}>
                        {def.w}×{def.h}
                      </span>
                    </span>
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
          {/* Windows — where pop-outs land, and how to get them back. Only
              earns a slot once there is something to say: a panel is out, or
              the browser can actually place windows on a chosen monitor. */}
          {(outCount > 0 || supportsDisplays) && (
            <div className="relative">
              <button
                onClick={() => {
                  setWinMenuOpen(o => !o);
                  // Opening the menu IS the gesture the permission prompt needs.
                  if (supportsDisplays && !displaysGranted) void requestDisplays();
                }}
                title="Window placement and pop-outs"
                aria-haspopup="menu"
                aria-expanded={winMenuOpen}
                className={`${barBtn} ${outCount > 0 ? 'text-select' : ''}`}
              >
                <Monitor className="w-3.5 h-3.5" />
                {outCount > 0 && <span className="ml-1 font-mono text-micro tnum">{outCount}</span>}
              </button>
              {winMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setWinMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 top-full mt-1 z-50 w-72 inst-surface rounded-md shadow-overlay p-1.5 flex flex-col gap-0.5">
                    {displays.length > 1 && (
                      <>
                        <div className="px-2 py-1 font-mono text-micro uppercase tracking-widest text-textMuted">New pop-outs open on</div>
                        {displays.map(d => {
                          const on = d.label === (popoutTarget ?? displays.find(x => x.isCurrent)?.label);
                          return (
                            <button
                              key={d.label}
                              role="menuitemradio"
                              aria-checked={on}
                              onClick={() => setPopoutTarget(d.label)}
                              className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-label text-textSecondary hover:bg-rowHover hover:text-textPrimary transition-colors"
                            >
                              <Check className={`w-3 h-3 shrink-0 ${on ? 'text-select' : 'opacity-0'}`} />
                              <span className="truncate">{d.label}</span>
                              <span className="ml-auto font-mono text-micro text-textMuted tnum shrink-0">
                                {d.width}×{d.height}
                              </span>
                            </button>
                          );
                        })}
                        <div className="h-px bg-borderSubtle my-1" />
                      </>
                    )}
                    {reopenable.length > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          // One gesture, every window: the blocker counts the
                          // click, not the windows, so reopening a saved
                          // multi-monitor desk works in a single press.
                          reopenable.forEach(p => popoutPanel(p.id));
                          setWinMenuOpen(false);
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-label text-textSecondary hover:bg-rowHover hover:text-textPrimary transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        Reopen {reopenable.length} saved {reopenable.length === 1 ? 'window' : 'windows'}
                      </button>
                    )}
                    {outCount > 0 && (
                      <>
                        <div className="px-2 py-1 font-mono text-micro uppercase tracking-widest text-textMuted">Out of the grid</div>
                        {active.panels
                          .filter(p => p.detached || p.popout)
                          .map(p => {
                            // Name the actual monitor, not just "popped out".
                            // With three displays, "which window is where" is
                            // the entire question this menu exists to answer.
                            const at = p.detached
                              ? 'floating on the desk'
                              : // A saved box is not an open window. Naming the
                                // display for a pop-out that no reload has
                                // reopened yet would claim a panel is showing
                                // on a monitor where there is nothing.
                                !popWins.has(p.id)
                                ? 'saved, not open'
                                : (displays[screenIndexOf(p.popout!, displays)]?.label ?? 'another display');
                            return (
                              <button
                                key={p.id}
                                role="menuitem"
                                onClick={() => {
                                  dockPanel(p.id);
                                  setWinMenuOpen(false);
                                }}
                                className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-label text-textSecondary hover:bg-rowHover hover:text-textPrimary transition-colors"
                                title="Bring this panel back to the grid"
                              >
                                <Anchor className="w-3 h-3 shrink-0" />
                                <span className="truncate">{pulsePanelByKey(p.key)?.title ?? p.key}</span>
                                <span className="ml-auto text-micro text-textMuted shrink-0 truncate max-w-[9rem]">{at}</span>
                              </button>
                            );
                          })}
                        <div className="h-px bg-borderSubtle my-1" />
                        <button
                          role="menuitem"
                          onClick={() => {
                            active.panels.filter(p => p.detached || p.popout).forEach(p => dockPanel(p.id));
                            setWinMenuOpen(false);
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-left text-label text-textSecondary hover:bg-rowHover hover:text-textPrimary transition-colors"
                        >
                          <Anchor className="w-3 h-3 shrink-0" />
                          Bring every panel back
                        </button>
                      </>
                    )}
                    {!supportsDisplays && (
                      <p className="px-2 py-1.5 text-micro text-textMuted leading-relaxed">
                        This browser cannot place a window on a chosen monitor. Pop-outs open here and can be dragged
                        across; where you leave them is saved with the layout.
                      </p>
                    )}
                    {outCount === 0 && reopenable.length === 0 && displays.length <= 1 && supportsDisplays && (
                      <p className="px-2 py-1.5 text-micro text-textMuted leading-relaxed">
                        One display detected. Pop a panel out with the ⧉ button in its header.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={() => setFullscreen(f => !f)} title="Full-screen (F)" className={barBtn}>
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* The desk surface. `relative` is load-bearing: detached panels are
          positioned against this box, and their saved coordinates mean nothing
          without it. Measured on the ref so a panel lifting out of the grid
          keeps the exact pixel box it had while docked. */}
      <div ref={deskRef} className={`relative ${fullscreen ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
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
              // 26px per fine row, matching the desktop grid's own row unit.
              const h = Math.max(340, (li?.h ?? 12) * 26);
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
              layout={dockedLayout}
              cols={GRID_COLS}
              rowHeight={GRID.rowHeight}
              margin={[GRID.marginX, GRID.marginY]}
              containerPadding={[0, 0]}
              compactType="vertical"
              draggableHandle=".widget-drag"
              isDraggable={editLayout}
              isResizable={editLayout}
              // Every edge and corner, not just the bottom-right nub. Closing a
              // gap on a panel's LEFT means dragging its left edge; with only
              // the SE handle you had to move the panel and then resize it,
              // which is two gestures for one intention.
              resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
              onLayoutChange={onLayoutChange}
              // Record WHICH panel the gesture is about, then tile in
              // onLayoutChange. Tiling in onResizeStop does not survive: RGL
              // fires onResizeStop first and onLayoutChange straight after with
              // its own untiled layout, so the absorb was computed and then
              // immediately overwritten. Measured — the neighbour never moved.
              onResizeStart={(_l, item) => (touched.current = item.i)}
              onDragStart={(_l, item) => (touched.current = item.i)}
            >
              {dockedPanels.map(p => {
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

      {/* Floating panels, above the grid and inside the desk. Not rendered
          while one panel is maximized — a full-bleed panel with boxes hovering
          over it is neither of the two things the user asked for. */}
      {!maximized &&
        isDesktop &&
        detachedPanels.map(p => {
          const ticker = p.ticker ?? activeTicker;
          const surface = deskRef.current;
          return (
            <DetachedPanel
              key={p.id}
              bounds={p.detached!}
              viewport={{ w: surface?.clientWidth ?? 1280, h: Math.max(surface?.clientHeight ?? 720, 400) }}
              z={zOrder[p.id] ?? 10}
              title={pulsePanelByKey(p.key)?.title ?? p.key}
              onChange={b => moveDetached(p.id, b)}
              onFocus={() => bumpZ(p.id)}
            >
              <PanelChrome
                panelId={p.id}
                panelKey={p.key}
                ticker={ticker}
                price={snapFor(ticker)?.spot}
                changePct={snapFor(ticker)?.changePercent}
                placement="detached"
                h={chromeHandlers}
              />
              <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(p.key, ticker)}</div>
            </DetachedPanel>
          );
        })}
      </div>

      {/* Popped-out panels. Rendered through a portal into their own window, so
          they stay in THIS React tree and keep ticking off the one shared
          MarketDataContext — two React roots would mean two simulators and two
          prices for the same symbol. */}
      {[...popWins.entries()].map(([id, win]) => {
        const p = active.panels.find(x => x.id === id);
        if (!p) return null;
        const ticker = p.ticker ?? activeTicker;
        return (
          <PopoutPanel key={id} win={win} onClosed={() => onPopoutClosed(id)} onMoved={box => onPopoutMoved(id, box)}>
            <PanelChrome
              panelId={id}
              panelKey={p.key}
              ticker={ticker}
              price={snapFor(ticker)?.spot}
              changePct={snapFor(ticker)?.changePercent}
              placement="popped"
              h={chromeHandlers}
            />
            <div className="flex-grow min-h-0 overflow-hidden">{renderPanelBody(p.key, ticker)}</div>
          </PopoutPanel>
        );
      })}
    </div>
  );
};

export default PulseWorkspace;
