import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Rows3, X } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLadderFor, buildLevelsFor, buildPrints, fmtUsd, spotChangePct } from '../../data/gex';
import StrikeChart, {
  PRICE_SCALE_MIN_WIDTH,
  DEFAULT_INDICATORS,
  DEFAULT_OVERLAYS,
  type ChartIndicators,
  type ChartOverlays,
  type ChartStyle,
  type CompareEntry,
  type CompareMode,
  type CrosshairSync,
  type PriceProjection,
} from '../../components/gex/StrikeChart';
import ChartToolbar from '../../components/gex/ChartToolbar';
import CompareControl from '../../components/gex/CompareControl';
import PaneLadder, { LADDER_WIDTH_PX } from '../../components/gex/PaneLadder';
import useFocusTrap from '../../components/ui/useFocusTrap';
import { useIsBelowLg } from '../../components/ui/useMediaQuery';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import { CANDLE_THEMES, chartSurface, useCandleThemeKey } from '../../components/gex/candleTheme';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';
import {
  SETUP_KEYS, applySetup, captureSetup, evict, readSetups, symKey, type SetupMap,
} from './setups';

/*
==================================================
  SLAYER TERMINAL - TERRAIN (pages/terrain/Terrain.tsx)

  Charts, and nothing else. One to four of them,
  filling the screen, and EACH ONE IS ITS OWN
  WORKSPACE — its own symbol, interval, overlays,
  indicators and tape shape.
==================================================

  THE PANES ARE INDEPENDENT (Noah, 2026-08-25: "each chart box should have
  its own time frame area, it's own everything because each is different from
  the other ones"). The first cut shared one rail across every pane, on the
  reasoning that a three-up read only means something if the panes agree. That
  was the wrong call for this desk and it is reversed here: the panes are
  three different instruments at three different resolutions, and the whole
  point of putting them side by side is that they are set up differently.

  So the only things left on the top rail are the two that belong to the
  ARRANGEMENT rather than to any chart: how many panes there are, and whether
  they carry their strike rail. Everything else lives in the pane.

  WHAT A PANE CARRIES, top to bottom:

      symbol · price · session change      identity
      interval + overlays + indicators     ChartToolbar, `minimal`
      the three heaviest strikes near      the book, in one line
      spot, signed
      the chart, and its strike rail       StrikeChart + PaneLadder

  IT TAKES THE WHOLE SCREEN. The shell wraps every page in horizontal padding,
  20px above and 64px below, then ends it with the site footer. A workspace
  wants none of that, so the margins are cancelled and the height is pinned to
  the viewport less the top bar — measured at 56px, not guessed. The footer
  still follows, below the fold, exactly as it does on every other page.
  Below `lg` all of it comes off: the panes stack, the height cap lifts, and
  the page scrolls, because four charts sharing one phone screen is four
  charts nobody can read.

  WHY IT IS NOT THE 4-WAY BOARD. /pulse/board is four cells with four
  toolbars, fixed at four, on a page that scrolls. Terrain is one to four
  panes that own the viewport, with a strike rail and named levels on the
  axis. They have converged on per-pane controls, which is the right answer
  for both; what still separates them is the arrangement and the density.
*/

const TERRAIN_KEY = 'slayer_terrain_v1';

/* One step along the interval list, CLAMPED at both ends. Wrapping would
   turn one keypress on a 1-minute chart into a weekly chart, which is a
   different instrument, not a smaller adjustment. */
const stepTf = (tf: Timeframe, dir: 1 | -1): Timeframe => {
  const i = TIMEFRAMES.findIndex(t => t.value === tf);
  const j = Math.max(0, Math.min(TIMEFRAMES.length - 1, (i < 0 ? 2 : i) + dir));
  return TIMEFRAMES[j].value;
};

/** How many panes are on screen. Four is the ceiling: at 1440 a fifth pane is
    260px wide, and a chart that narrow stops being a chart — the same finding
    that keeps the Pulse desk's widgets from going below their floor. */
export const LAYOUTS = [1, 2, 3, 4] as const;
export type TerrainLayout = (typeof LAYOUTS)[number];

/*
  Everything one pane owns. There is nothing else — a setting that is not here
  is a setting every pane shares, and only two of those exist.

  KEPT FLAT on purpose, even though five of these fields now also follow the
  SYMBOL (SETUP_KEYS in ./setups). A complete PaneCfg on disk means an older
  build — a rollback, or a tab still holding cached JS — reads the reader's
  setup instead of resetting every pane to 15m candles, and it costs nothing,
  because the whole config was already being stringified.

  `ticker` and `ladder` follow the SLOT, never the symbol; see ./setups for
  why the rail in particular has to.
*/
interface PaneCfg {
  ticker: string;
  timeframe: Timeframe;
  overlays: ChartOverlays;
  indicators: ChartIndicators;
  chartStyle: ChartStyle;
  /** Symbols crossed onto this pane's tape — the compare overlay. Per pane,
      like everything else here, and persisted with it. */
  compares: CompareEntry[];
  /** Whether this pane carries the strike rail down its right edge. Per pane
      too (Noah, 2026-08-25: "make sure the strike thing you added is
      removable") — the rail has its own × and the top button is a
      convenience that sets every pane at once, not the only way out. */
  ladder: boolean;
}

interface TerrainCfg {
  layout: TerrainLayout;
  /** Always four, whatever the layout, so going 3 → 2 → 3 gives the third
      pane back exactly as it was rather than resetting it. */
  panes: PaneCfg[];
  /** How each symbol was last set up. Consulted ONLY when a symbol is newly
      picked — never re-applied to what is already on screen, or a reader's
      live pane would be rewritten under them by an old decision. */
  setups: SetupMap;
}

const TF_VALUES = new Set<string>(TIMEFRAMES.map(t => t.value));
const COMPARE_MODES = new Set<CompareMode>(['percent', 'scale', 'pane']);
/* The desk's comparison inks (LiveChartWidget's set, verbatim): none of them
   collide with the field's gold/steel, the levels' magenta/green/red/blue, or
   the interface's lime. Four, so a pane can cross four symbols at most. */
const COMPARE_INKS = ['#5B9CF6', '#BBB2E8', '#EDE4CD', '#6BD3C7'];
const STYLES = new Set<ChartStyle>(['candles', 'hollow', 'bars', 'line', 'step', 'area', 'baseline']);

/** The pane slots differ only by symbol at first; a reader sets the rest. */
const defaultPanes = (): PaneCfg[] =>
  Simulator.WATCHLIST.slice(0, 4).map(ticker => ({
    ticker,
    timeframe: '15m' as Timeframe,
    overlays: { ...DEFAULT_OVERLAYS },
    indicators: { ...DEFAULT_INDICATORS },
    chartStyle: 'candles' as ChartStyle,
    compares: [] as CompareEntry[],
    ladder: true,
  }));

/* The map starts EMPTY on a fresh install, deliberately. Seeding it from the
   four watchlist rows would mean a reader who sets a pane to 1h and then picks
   SPY gets yanked back to 15m by a setup they never chose — precisely the
   surprise the earned-by-touch rule exists to prevent. */
const defaults = (): TerrainCfg => ({ layout: 3, panes: defaultPanes(), setups: {} });

/** One stored pane, validated field by field against a known-good default. */
/*
  MIGRATION ONLY. A blob written before setups existed has four panes a reader
  did configure, so their settings become those four symbols' setups — the
  same reasoning as the legacy fan-out below.

  It runs only off a blob that ALREADY EXISTED: a fresh browser returns the
  defaults before reaching here, so its map stays empty and nothing is
  remembered that the reader never chose. Duplicate tickers across panes:
  later index wins, the same last-touch-wins rule the reducer uses.
*/
const seedFrom = (panes: PaneCfg[]): SetupMap => {
  const now = Date.now();
  const out: SetupMap = {};
  for (const p of panes) out[symKey(p.ticker)] = captureSetup(p, now);
  return out;
};

function readPane(raw: unknown, def: PaneCfg): PaneCfg {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<PaneCfg>;
  return {
    ticker: typeof c.ticker === 'string' && c.ticker ? c.ticker : def.ticker,
    timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : def.timeframe,
    overlays: { ...DEFAULT_OVERLAYS, ...(c.overlays && typeof c.overlays === 'object' ? c.overlays : {}) },
    indicators: { ...DEFAULT_INDICATORS, ...(c.indicators && typeof c.indicators === 'object' ? c.indicators : {}) },
    chartStyle: typeof c.chartStyle === 'string' && STYLES.has(c.chartStyle as ChartStyle) ? (c.chartStyle as ChartStyle) : def.chartStyle,
    /* Each entry validated on its own: a stored comparison whose symbol was
       renamed, or whose ink went missing, must not take the pane down. */
    compares: Array.isArray(c.compares)
      ? (c.compares as unknown[])
          .filter(
            (e): e is CompareEntry =>
              !!e &&
              typeof e === 'object' &&
              typeof (e as CompareEntry).ticker === 'string' &&
              typeof (e as CompareEntry).ink === 'string' &&
              COMPARE_MODES.has((e as CompareEntry).mode)
          )
          .slice(0, COMPARE_INKS.length)
      : def.compares,
    ladder: typeof c.ladder === 'boolean' ? c.ladder : def.ladder,
  };
}

/*
  Self-healing load, and a MIGRATION.

  The shape stored before this change was flat — one timeframe, one set of
  overlays, one style for the whole desk, plus a `tickers` array. Somebody's
  browser is holding that right now, and dropping it would silently reset the
  symbols and the interval they chose. So the old fields are read and fanned
  out across the panes: the shared interval becomes every pane's interval,
  which is precisely what the reader was looking at when they left.

  Everything else keeps the contract the board's loader set: anything
  malformed falls back to the default rather than throwing on read. A layout
  of 7, a ticker that is a number, a timeframe that was renamed — each is a
  value a browser can be holding after a deploy, and none of them may take
  the page down.
*/
function loadCfg(): TerrainCfg {
  const def = defaults();
  try {
    const raw = localStorage.getItem(TERRAIN_KEY);
    if (!raw) return def;
    const c = JSON.parse(raw) as Record<string, unknown>;
    if (!c || typeof c !== 'object') return def;

    const layout = (LAYOUTS as readonly number[]).includes(c.layout as number)
      ? (c.layout as TerrainLayout)
      : def.layout;
    /* `ladder` used to be one flag for the whole desk. If that is what is in
       storage it becomes every pane's flag, the same way the one shared
       interval did. */
    const deskLadder = typeof c.ladder === 'boolean' ? (c.ladder as boolean) : undefined;

    if (Array.isArray(c.panes)) {
      const stored = c.panes as unknown[];
      const panes = def.panes.map((d, i) => readPane(stored[i], { ...d, ladder: deskLadder ?? d.ladder }));
      const hadSetups = !!c.setups && typeof c.setups === 'object';
      return { layout, panes, setups: hadSetups ? readSetups(c.setups) : seedFrom(panes) };
    }

    // ── the flat shape, fanned out ──
    const legacy: Partial<PaneCfg> = {
      timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : undefined,
      overlays: c.overlays && typeof c.overlays === 'object' ? (c.overlays as ChartOverlays) : undefined,
      indicators: c.indicators && typeof c.indicators === 'object' ? (c.indicators as ChartIndicators) : undefined,
      chartStyle: typeof c.chartStyle === 'string' && STYLES.has(c.chartStyle as ChartStyle) ? (c.chartStyle as ChartStyle) : undefined,
    };
    const tickers = Array.isArray(c.tickers) ? (c.tickers as unknown[]) : [];
    const panes = def.panes.map((d, i) =>
      readPane({ ...legacy, ticker: typeof tickers[i] === 'string' ? tickers[i] : d.ticker }, {
        ...d,
        ladder: deskLadder ?? d.ladder,
      })
    );
    return { layout, panes, setups: seedFrom(panes) };
  } catch {
    return def;
  }
}

/** How many columns a layout wants, and from which breakpoint. One pane is
    full width at every size; the rest stack on a phone and open out on a
    laptop, because three 400px charts on a 1280 screen read and three 160px
    ones do not. */
const COLS: Record<TerrainLayout, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 lg:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
  4: 'grid-cols-1 lg:grid-cols-2',
};

/*
  ROWS HAVE TO FOLLOW COLUMNS, at every breakpoint, or a pane falls out of the
  grid's height.

  Three panes in two columns need TWO rows. Layout 3 declared one, so the
  third pane landed in an IMPLICIT row — and an implicit row is sized to its
  content, not to a share of the container, while the single explicit row took
  the whole height. Measured at 1024 and at 1440: two panes full height and a
  third at 174px.

  It hid because layout 3 is three columns from `2xl` up, and every screenshot
  of it was taken at 1760. The band it was broken in — 1024 to 1535 — is most
  laptops, and layout 3 is the default.
*/
const ROWS: Record<TerrainLayout, string> = {
  1: 'lg:grid-rows-1',
  2: 'lg:grid-rows-1',
  3: 'lg:grid-rows-2 2xl:grid-rows-1',
  4: 'lg:grid-rows-2',
};

/*
  Height of the time axis lightweight-charts draws under the plot, in px.

  MEASURED, not chosen: with `timeVisible: true` and this font the axis canvas
  runs 858→884 in a 1000px viewport. It is a library constant for this
  configuration, so it is written down once here and asserted in the sweep —
  if a library upgrade moves it, the rail stops lining up with the plot floor
  and the check fails instead of the corner quietly filling with ladder again.
*/
const TIME_AXIS_PX = 26;

/*
  CLEARANCE for the price gutter lightweight-charts draws down the right of
  the plot, in px. Floating chrome has to stop short of that gutter or it
  lands on the price ticks.

  It is deliberately a hair MORE than the gutter itself, and it is DERIVED
  from the chart's own minimum rather than typed here. It used to be a literal
  56 against a ~54px gutter, and when the chart widened its scale to 74 (so
  the live-price card sits in the gutter instead of over the tape) the two
  became a two-generators-for-one-fact bug: the desk would have gone on
  clearing 56 and parking a button on the price ticks. The browser sweep
  caught it — clearance at least as wide as the gutter, and not so much wider
  that it is throwing away chart — and this is the fix that keeps it caught.
*/
const PRICE_GUTTER_PX = PRICE_SCALE_MIN_WIDTH + 2;

/*
  WHAT THE FULL CONTROL STRIP NEEDS — inside the chart column, with the price
  gutter already taken off it.

  Measured against this build: the un-compacted toolbar lays out at 818px on
  one line. The seven-button timeframe strip is 251 of that, the three worded
  triggers (Indicators 117 · Alerts 93 · Candles 102) another 311, `Overlays 3`
  117, `Theme` 89, and 42 of gaps and dividers. Add the strip's 6px left pad
  and the toolbar band's 8px sides and the column has to give it 840px past
  the gutter.

  Under that it does not clip or scroll, it WRAPS — the root is `flex-wrap`
  and the Indicators/Alerts/Candles span inside it wraps again. At 1024px with
  two grid columns the chart column is 369px, so 291px of line takes 818px of
  controls in FOUR rows: 126px of toolbar inside a 205px chrome stack over a
  411px pane — half the pane, sitting on the tape. On a coarse pointer
  `.chrome-hover` pins that visible (index.css), so it never goes away.

  It is a PANE width, not a window width: a four-pane desk at 1440px still
  gives each toolbar ~577px and still wraps.
*/
const TOOLBAR_FULL_PX = 840;

/*
  THE STRIP'S OWN PADDING, when it is not clearing a price gutter (`p-1.5`).
  Named because the usable width below is derived from it rather than from a
  second copy of the number.
*/
const STRIP_PAD_PX = 6;

/*
  WHAT THE IDENTITY ROW COSTS, AND WHAT IT GIVES UP WHEN THE COLUMN CANNOT PAY.

  The row is `w-fit max-w-full` and every child is `shrink-0`, which caps the
  BOX at the column and lets the CONTENTS overflow it visibly. So it does not
  wrap and it does not clip — it prints past the pane's edge, onto the price
  ticks. Measured at a 1024px viewport with the rail up, where the chart column
  is 369px and the usable width is 287:

    padding 16 · badge 16 · symbol capsule 146 · price 47 · change 44 · expand 24
    = 317 needed against 287 available, on ALL FOUR panes (315 on QQQ).

  The 30px that did not fit was the EXPAND BUTTON, sitting on the price axis —
  in the shipped build, at a laptop width, with or without a second axis. The
  comment above this row says the identity and the button are fixed and only
  the strike read gives. That was not true, and this is what makes it true.

  The order things go in is by what the reader loses least:

    the CHANGE %  first — the price it is a delta of is still right there, and
                  the chart draws the same move. Costs 52 (44 + its gap).
    the BADGE     next — the symbol already names the pane; the number is only
                  a shorthand for it. Costs 24, and only exists at all when
                  more than one pane is up.
    the COMPARE + last — a control, so it goes last. Removing a comparison is
                  still possible from the legend's own x, and the menu comes
                  back the moment the column is wide enough. Costs 34, since
                  the button sits inside the capsule (146 = 112 + 6 + 28).

  Thresholds are the cost of the NEXT tier down plus room to spare, because
  the parts are not fixed: `min-w-[112px]` on the symbol button is a floor, so
  a five-letter symbol grows it, and a four-figure price is wider than the
  $501.80 measured here. The sweep asserts the GEOMETRY — nothing over an axis
  — rather than these numbers, so a symbol that outgrows them fails the build
  instead of quietly printing on the ticks.
*/
const ID_ROW_FULL_PX = 340;
const ID_ROW_NO_PCT_PX = 285;
const ID_ROW_NO_BADGE_PX = 260;

/*
  THE HEAVIEST READ'S ENTRIES, measured the same way: the HEAVIEST label is 50
  and the widest entry seen is 86 ("172.50 $131.3M"), each followed by a 10px
  gap.

  This count used to come from the LAYOUT — `layout >= 3 ? 2 : 3` — and layout
  is not what decides it. At a 1024px viewport every layout from 2 up has the
  SAME 369px column, so a two-pane desk printed three entries in exactly the
  width where a four-pane desk correctly printed two, and the third ran onto
  the price axis. Measured: 2 entries fit 287px with room (`scrollWidth ===
  clientWidth`), 3 need ~338.
*/
const HEAVY_LABEL_PX = 60; // the word plus its gap
const HEAVY_ENTRY_PX = 96; // the widest entry plus its gap
const HEAVY_MAX = 3;

/*
  The heaviest strikes in the pane's window, signed — the one-line read of
  where the book is, and the same rows the rail draws.

  HOW MANY depends on the layout, and that is a correctness fix rather than a
  tidiness one. The row clips at the pane's edge, and clipping happens WITHIN
  an entry, not between them: at three-up a pane printed "425 -$13", which is
  the front of -$135.6M and reads as thirteen dollars. A number cut in half is
  not a shortened number, it is a different number. Narrow panes therefore
  carry fewer entries, and what still clips is faded out so an incomplete
  value cannot pass for a complete one.
*/
const heaviest = (rows: { strike: number; value: number }[], n: number) =>
  [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, n);

interface PaneProps {
  cfg: PaneCfg;
  onCfg: (patch: Partial<PaneCfg>) => void;
  revision: number;
  expanded: boolean;
  onToggleExpand: () => void;
  index: number;
  /** Panes get shorter as the grid gets wider — one chart earns the height */
  tall: boolean;
  /** This pane's real hover, out to the desk. null when the pointer leaves. */
  onCrosshair: CrosshairSync;
  /** Hand the desk this pane's "mark that moment" function, null on unmount. */
  registerSync: (apply: CrosshairSync | null) => void;
  /** Whether the keys act on this pane, and how to make them. */
  isActive: boolean;
  onActivate: () => void;
  /** How many panes are on the desk — a number badge on the only pane on
      screen is chrome that says nothing. */
  paneCount: number;
  /** Which of this pane's menus a key has opened, if any. */
  menuOpen: 'symbol' | 'compare' | null;
  onMenu: (which: 'symbol' | 'compare' | null) => void;
  /** The pane's real box, handed up so the desk can scroll it into view when
      a key makes it active — below `lg` the panes stack and the page scrolls. */
  boxRef?: (el: HTMLDivElement | null) => void;
  /*
    Extra grid classes for THIS pane's box.

    They have to arrive here rather than being written on the grid, for the
    same reason the stacked-phone floor does: the wrapper below is
    `display: contents` when the pane is not expanded, so a `[&>*]` rule on
    the grid lands on an element that generates no box and is ignored. That
    trap has already cost one silent defect in this file.
  */
  cell?: string;
}

const Pane = ({
  cfg, onCfg, revision, expanded, onToggleExpand, index, tall,
  onCrosshair, registerSync, isActive, onActivate, paneCount, menuOpen, onMenu,
  boxRef, cell = '',
}: PaneProps) => {
  const { ticker, timeframe, overlays, indicators, chartStyle, compares, ladder } = cfg;
  /* An "Own scale" comparison gives the tape a SECOND price gutter, down the
     LEFT (StrikeChart's `leftPriceScale.visible`). Every piece of this pane's
     floating chrome is left-anchored, so it has to step aside for that axis
     exactly the way it already steps aside for the right-hand one. */
  const ownScale = compares.some(c => c.mode === 'scale');
  /* Below `lg` this desk stops filling the viewport and becomes a column the
     page scrolls through — so the wheel has to belong to the page, not to the
     chart. See `pageScroll` on StrikeChart for what was measured. */
  const belowLg = useIsBelowLg();

  /*
    ══ THE COMPARE LEGEND HAS TO START BELOW THE STRIP, NOT AT 46px ═════════

    The legend was pinned at `top-[46px]` — the strip's height when it holds
    one row. The strip is a `flex-col` and holds two whenever the toolbar is
    up, so on hover it grew over the legend and the legend is z-10 against the
    strip's z-20.

    Measured at 1440x900, one compare: legend row [19,109,109,16] against the
    heaviest-strike read [13,109,316,23] — 16px of 16 vertical overlap, 109 of
    109 horizontal. With four compares the Remove buttons land at y=109/127/
    145/163 and elementFromPoint at the third one's own centre returns the
    timeframe strip's button: that × cannot be clicked at all, even though it
    carries `pointer-events-auto`.

    So the offset is the strip's OWN height, measured. A second hard-coded
    number would be the same bug with a bigger constant — the strip's height
    is whatever its content and the pane's width make it.
  */
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripH, setStripH] = useState(46);
  /* The SAME observation answers a second question: how much room the toolbar
     has. The strip is `inset-x-0` on the chart column, so its width IS the
     column's — which is the width that decides whether the strip wraps, and
     which no media query on the window can stand in for.

     Width in, height out: the decision is made on the room AVAILABLE, never
     on the strip's own content, so compacting cannot feed back into the
     measurement and oscillate. `inset-x-0` also means flipping to compact
     leaves this width unchanged — only stripH moves, and that only shifts the
     compare legend. */
  const [stripW, setStripW] = useState(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      // getBoundingClientRect, not contentRect: the strip carries p-1.5 and
      // contentRect excludes padding, which would put the legend back under it.
      const r = el.getBoundingClientRect();
      const h = Math.round(r.height);
      if (h > 0) setStripH(h);
      if (r.width > 0) setStripW(Math.round(r.width));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* WHAT THE STRIP'S ROWS CAN ACTUALLY USE — the column, less the gutter it
     clears on each side. Derived from the SAME expression the padding above
     applies, so the two cannot disagree about how much room was taken.

     Width in, content out, exactly as the observer's own note requires: the
     tiers below read this, never their own rendered width, so shedding a part
     cannot change the number that decided to shed it. `inset-x-0` keeps this
     width fixed across a tier change, so there is no oscillation to damp.

     Before the first measurement stripW is 0 and everything renders — the
     honest default is the full row for one frame, not a shed one that grows. */
  const stripInner = stripW > 0 ? stripW - PRICE_GUTTER_PX - (ownScale ? PRICE_GUTTER_PX : STRIP_PAD_PX) : 0;
  const roomFor = (px: number) => stripInner === 0 || stripInner >= px;
  const showChangePct = roomFor(ID_ROW_FULL_PX);
  const showBadge = paneCount > 1 && roomFor(ID_ROW_NO_PCT_PX);
  const showCompareAdd = roomFor(ID_ROW_NO_BADGE_PX);
  /* At least one entry: a HEAVIEST label with nothing after it is chrome that
     says nothing, so the row hides itself entirely rather than print a header
     over an empty line (see `heavy.length > 0` at the row). */
  const heavyCount = stripInner === 0
    ? HEAVY_MAX
    : Math.max(1, Math.min(HEAVY_MAX, Math.floor((stripInner - HEAVY_LABEL_PX) / HEAVY_ENTRY_PX)));
  /* The tape, straight from the provider that accumulates it. Read HERE rather
     than threaded down from Terrain: this component already takes fourteen
     props, and every pane wants the same unfiltered tape — StrikeChart narrows
     it to its own symbol. */
  const { flowTape } = useMarketData();

  /* Add / remove a crossed symbol. Capped at the ink list's length so every
     comparison on a pane is a DIFFERENT colour — two lines sharing an ink is
     a chart that cannot be read, and the legend below would name them both
     the same. A symbol already crossed, or the pane's own, is refused. */
  const addCompare = (t: string, mode: CompareMode) =>
    onCfg({
      compares: (() => {
        if (compares.length >= COMPARE_INKS.length || compares.some(c => c.ticker === t) || t === ticker) return compares;
        const ink = COMPARE_INKS.find(i => !compares.some(c => c.ink === i)) ?? COMPARE_INKS[0];
        return [...compares, { ticker: t, mode, ink }];
      })(),
    });
  const removeCompare = (t: string, mode: CompareMode) =>
    onCfg({ compares: compares.filter(c => !(c.ticker === t && c.mode === mode)) });

  /* The desk's reducer now sets `compares` explicitly on every symbol change,
     so the effect that used to clear them here is gone — and it had to go.
     Keyed on [ticker], it also ran on MOUNT, which wrote a saved comparison
     back and then wiped it a frame later: measured on a boot with one stored
     comparison, the array ended empty and no legend row ever rendered.
     Compares have been persisted-but-dead since they were added. */

  // Each pane reads its own book; revision keeps the levels tracking the tick
  const levels = useMemo(
    () => buildLevelsFor(ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  const changePct = useMemo(
    () => spotChangePct(ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  // Deterministic per ticker, so the dark-pool lines do not wander on a tick
  const prints = useMemo(
    () => buildPrints(ticker, levels.spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker]
  );
  /* The rail's rows come off the SAME snapshot `levels` was reduced from. The
     header's three-strike read uses them too, so the line and the column can
     never name different strikes. Read even when the rail is hidden, because
     the header is not. */
  const rail = useMemo(
    () => buildLadderFor(ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  /* The header's heaviest read comes off the NEAR-SPOT core, not the widened
     set the rail draws. `rows` now reaches the whole maintained book so the
     column can fill the price scale; pointing the header at it would have it
     naming strikes $30 away from the market. */
  const heavy = useMemo(() => heaviest(rail.core, heavyCount), [rail, heavyCount]);

  /* What the reader clicked in the rail, flashed on the chart. Clicking the
     same strike again clears it, so the rail is a toggle rather than a thing
     you can only turn on. It resets on a symbol change because a price from
     the last book means nothing against this one. */
  /* Where the chart puts a price, handed to the rail so the two columns cannot
     disagree. A ref, so it never re-renders anything: the rail reads it inside
     its own frame loop. */
  const projectionRef = useRef<PriceProjection | null>(null);

  /* An expanded pane covers the desk, so the keyboard has to be inside it.
     Measured before this: thirteen Tabs from the expand button walked out of
     the overlay and into the pane underneath, and the overlay told assistive
     technology nothing about being modal at all. */
  const overlayRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(expanded, overlayRef);

  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => setFocus(null), [ticker]);

  /* One surface under the header AND the tape, so a pane is one continuous
     black inside its frame rather than two shades meeting at a seam. */
  const themeKey = useCandleThemeKey();
  const themeBg = chartSurface(CANDLE_THEMES[themeKey]).bg;
  const surface = themeBg === 'transparent' ? '#0a0a0a' : themeBg;

  const up = changePct >= 0;

  return (
    <div
      ref={overlayRef}
      className={expanded ? 'fixed inset-0 z-[80] flex flex-col' : 'contents'}
      {...(expanded
        ? { role: 'dialog' as const, 'aria-modal': true, tabIndex: -1, 'aria-label': `${ticker} expanded` }
        : {})}
    >
      {/*
        THE PANE'S OWN FLOOR, and it has to be here.

        The wrapper above is `display: contents` when the pane is not
        expanded, so THIS div is the real grid item. A `[&>*]:min-h-[420px]`
        rule on the grid targets the wrapper instead, where min-height is
        computed and then ignored — `contents` elements generate no box for it
        to apply to. Measured on a phone with that rule in place: both panes
        0px tall, the whole grid 10px, the charts stacked on top of each other
        under a pile of floating chrome. It looked like a layout bug and it
        was a selector pointing one element too high.

        Only below `lg`. Above it the grid owns the height and a floor here
        would fight it.
      */}
      {/* Activation lives on THIS div, not the wrapper above: the wrapper is
          `display: contents` when the pane is not expanded and generates no
          box, so it has neither a border to ring nor an area to click. Both
          handlers are capture-phase, so reaching for any control inside the
          pane makes it the active one before that control does its own job. */}
      <div
        ref={boxRef}
        onPointerDownCapture={onActivate}
        onFocusCapture={onActivate}
        className={`relative flex flex-col overflow-hidden animate-soft-in ${
          expanded
            ? 'flex-1 min-h-0'
            : `min-h-[420px] lg:min-h-0 border rounded-md ${cell} ${
                isActive && paneCount > 1 ? 'border-select' : 'border-borderSubtle'
              }`
        }`}
        style={{ animationDelay: `${index * 60}ms`, background: surface }}
      >
        {/* Chart and rail on ONE line, and that line is the WHOLE pane —
            `absolute inset-0`, not a flex row under a header. The header
            floats on top of the chart instead of sitting above it, so the
            tape gets every pixel the pane has. min-w-0 on the chart column is
            load-bearing: a flex item wider than its line does not wrap, it
            spills, and a chart's natural width is whatever its container was
            last tick. */}
        <div className="absolute inset-0 flex">
          <div className="group relative flex-1 min-w-0">
            <StrikeChart
              ticker={ticker}
              revision={revision}
              levels={levels}
              timeframe={timeframe}
              flowPrints={flowTape}
              height={tall ? 260 : 200}
              overlays={overlays}
              indicators={indicators}
              chartStyle={chartStyle}
              prints={prints}
              compares={compares}
              focusPrice={focus}
              priceTag
              onCrosshair={onCrosshair}
              syncRegister={registerSync}
              projectionRef={projectionRef}
              pageScroll={belowLg}
              frameless
            />

            {/*
              ── who this pane is, and how it is set up ──────────────────
              FLOATING OVER THE TAPE, not stacked above it (Noah, 2026-08-25:
              "find a way in logic to make that stuff transparently fit into
              the chart screens so the charts can be damn near full screen").
              Two header rows in flow cost every pane ~56px of chart; over the
              tape they cost nothing, because the top of a chart is the
              emptiest part of it — price sits in the middle and volume at the
              floor.

              SCOPED TO THE CHART COLUMN, not the pane. Spanning the pane put
              the strip across the strike rail's own header and clipped it to
              "TRIKE ×". The rail is a sibling of this column, so bounding the
              overlay to the column is the fix — not a z-index, and not a
              right-margin that has to be kept in step with the rail's width.

              The strip is `pointer-events-none` and each control group turns
              them back on. Without that the invisible gaps BETWEEN the
              controls swallow drags on the chart underneath, and a chart you
              cannot pan by its top third is broken in a way that looks like
              nothing at all.
            */}
            {/*
              IT COMES AND GOES (Noah, 2026-08-25: "fix the chart float to
              actual be a hover over kinda thing, that way you can have all
              the info you need but it comes and goes").

              Graded, not all-or-nothing, because the two rows answer
              different questions. WHAT AM I LOOKING AT is a question you have
              while your eyes are on the tape and your cursor is somewhere
              else entirely — so the symbol, price and change stay on screen,
              just quiet. HOW IS IT SET UP is a question you only have while
              you are reaching for a control, so the toolbar is not there at
              all until the cursor arrives. Hiding the symbol too would mean
              a four-pane desk where you cannot tell the panes apart without
              waving at each one.

              focus-within, not only hover: the toolbar is reachable by Tab,
              and a control you can focus but not see is worse than one you
              cannot reach. Keyboard focus brings the strip up exactly as the
              cursor does.
            */}
            <div
              ref={stripRef}
              /* Padding clears the price gutter, so nothing floating ever
                 lands on a price tick — BOTH gutters whenever there is a left
                 one, with no width condition on it.

                 It used to be conditional, and the condition was covering for
                 a different bug. Taking the left gutter on a narrow pane moved
                 the collision to the RIGHT axis, so the clearance was gated on
                 the column being wide enough to hold both. But the right axis
                 was ALREADY being overprinted at those widths by 28-30px, with
                 or without a left one — the gate was not preventing that, only
                 declining to make it worse. Now that the row sheds parts to fit
                 (ID_ROW_* above), there is nothing to trade and the axis on
                 each side is simply left alone. */
              style={{
                paddingLeft: ownScale ? PRICE_GUTTER_PX : undefined,
                paddingRight: PRICE_GUTTER_PX,
              }}
              className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-start gap-1 p-1.5"
            >
              {/*
                ONE ROW, ALWAYS — it does not wrap, it clips.

                Wrapping made the panes disagree about where their charts
                start: the heaviest-strike read is as wide as its numbers
                happen to be, so a pane holding three $200M strikes pushed the
                expand button onto a second line while the pane beside it
                stayed on one. The strike read gives by carrying
                fewer entries, and the identity row gives by dropping parts of
                itself (ID_ROW_* above). Neither is ever cut mid-value.
              */}
              {/*
                IT HUGS ITS CONTENT. It used to carry the heaviest-strike read
                as well, which is as wide as its numbers happen to be, so the
                row overflowed and `max-w-full` stretched the translucent band
                across the entire top of the tape — and pushed the expand icon
                out over the price ticks.

                Moving the read off did not fix that, it only made it smaller:
                identity ALONE still needed 317px of the 287 a 369px column
                gives, and the expand icon was still on the ticks. `max-w-full`
                caps this box; it does not clip `shrink-0` children, so what
                does not fit is drawn past the edge either way. This row is
                only narrow enough because it now sheds parts — ID_ROW_* above,
                and the sweep section that measures it in a real browser.
              */}
              <div className="chrome-hover relative z-30 pointer-events-auto w-fit max-w-full select-none flex items-center gap-2 rounded-md bg-canvas/25 backdrop-blur-[3px] px-2 py-1 opacity-55 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                {/* This strip is the one row visible at rest, so the number
                    is legible without a pointer ever touching the desk. */}
                {showBadge && (
                  <span
                    aria-hidden
                    className={`shrink-0 w-4 h-4 rounded-[3px] font-mono text-[9px] font-bold tnum inline-flex items-center justify-center ${
                      isActive ? 'bg-select text-[#0a0a0a]' : 'bg-white/[0.08] text-textPrimary'
                    }`}
                  >
                    {index + 1}
                  </span>
                )}
                <span className="shrink-0 inline-flex items-center gap-1.5">
                  <TickerQuickPick
                    ticker={ticker}
                    onPick={t => onCfg({ ticker: t })}
                    open={menuOpen === 'symbol'}
                    onOpenChange={o => onMenu(o ? 'symbol' : null)}
                  />
                  {/* TradingView's "+" beside the symbol capsule — cross
                      another symbol onto this tape. Per pane, like the rest.

                      Last thing the row gives up (ID_ROW_NO_BADGE_PX): it is a
                      control, and a control is worth more than a label. What
                      it opens is still reachable — an existing comparison has
                      its own x in the legend below — and it returns as soon as
                      the column can hold it. */}
                  {showCompareAdd && (
                    <CompareControl
                      current={ticker}
                      compares={compares}
                      onAdd={addCompare}
                      onRemove={removeCompare}
                      open={menuOpen === 'compare'}
                      onOpenChange={o => onMenu(o ? 'compare' : null)}
                    />
                  )}
                </span>
                <span className="shrink-0">
                  <SpotPrice value={levels.spot} />
                </span>
                {/* First thing the row gives up when the column is narrow
                    (ID_ROW_FULL_PX) — the price it is a delta of is directly
                    to its left, and the chart draws the same move. */}
                {showChangePct && (
                  <span className={`shrink-0 font-mono text-[11px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
                    {up ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </span>
                )}

                <button
                  onClick={onToggleExpand}
                  aria-pressed={expanded}
                  aria-label={expanded ? `Collapse ${ticker}` : `Expand ${ticker} to the full screen`}
                  title={expanded ? 'Collapse — Esc' : 'Expand this pane — F'}
                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
                >
                  {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/*
                THE BOOK, on its own line and only while you are looking.

                It rode in the identity row and kept getting cut mid-number —
                a pane printed "521 -$235.4", which is the front of -$235.4M
                and reads as a complete number that is wrong by six orders of
                magnitude. Fading the tail did not fix that; a faded number is
                still a number. On its own full-width line, revealed with the
                toolbar, there is room for every entry whole.
              */}
              {heavy.length > 0 && (
                <div className="chrome-hover relative z-10 pointer-events-none hidden sm:block w-fit max-w-full rounded-md bg-canvas/25 backdrop-blur-[3px] px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  <span className="flex items-center gap-2.5 whitespace-nowrap">
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-textMuted">Heaviest</span>
                    {heavy.map(row => (
                      <span key={row.strike} className="shrink-0 font-mono text-[10px] tnum whitespace-nowrap">
                        <span className="text-textSecondary">
                          {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(2)}
                        </span>
                        <span className={`ml-1.5 font-semibold ${row.value >= 0 ? 'text-[#F5C542]' : 'text-[#AAB6C6]'}`}>
                          {fmtUsd(row.value)}
                        </span>
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {/* Its own, every one of them — and not there until you reach. */}
              <div className="chrome-hover chrome-tap relative z-10 pointer-events-none max-w-full rounded-md bg-canvas/25 backdrop-blur-[3px] px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <ChartToolbar
                  minimal
                  candles
                  /* COMPACT WHEN THE STRIP WOULD NOT FIT ON ONE LINE — the
                     mode the phone already uses (ChartToolbar's `compact`):
                     the seven timeframes collapse into the current interval
                     as a trigger, and every dropdown trades its word for its
                     icon, keeping the word as the hover/AT name.

                     Measured after: 818px of controls becomes 350px. Four
                     rows become one at 1180/1280 in every layout (177px of
                     chrome down to 112, 43% of the pane down to 27%), and two
                     at 1024 with 2+ panes, where the column is only 369px
                     (205px down to 145, 50% down to 35%). The single wide
                     pane beside a narrow one keeps its full labels, because
                     the test is its own column's width. */
                  compact={stripW > 0 && stripW - PRICE_GUTTER_PX < TOOLBAR_FULL_PX}
                  alertTicker={ticker}
                  alertSpot={levels.spot}
                  timeframe={timeframe}
                  onTimeframe={tf => onCfg({ timeframe: tf })}
                  overlays={overlays}
                  onOverlays={o => onCfg({ overlays: o })}
                  indicators={indicators}
                  onIndicators={i => onCfg({ indicators: i })}
                  chartStyle={chartStyle}
                  onChartStyle={s => onCfg({ chartStyle: s })}
                />
              </div>
            </div>

            {/* ── the crossed symbols, under the floating header ───────────
                One quiet row each: its line's own ink, its live price, and the
                only hand-removal outside the + menu. pointer-events are off on
                the stack and back on for the buttons, so the legend never eats
                a drag on the chart. */}
            {compares.length > 0 && (
              <div
                /* Unconditional, unlike the strip above: the legend rows are
                   ~106px, so even at a 369px column they clear both gutters. */
                style={{ top: stripH + 4, left: ownScale ? PRICE_GUTTER_PX : undefined }}
                className="pointer-events-none absolute left-3 z-10 flex flex-col gap-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100"
              >
                {compares.map(c => (
                  <span key={`${c.ticker}:${c.mode}`} className="flex items-center gap-1.5">
                    <span className="w-2 h-[3px] rounded-full" style={{ background: c.ink }} aria-hidden />
                    <span className="font-mono text-[10px] font-semibold" style={{ color: c.ink }}>
                      {c.ticker}
                    </span>
                    {Simulator.TICKERS[c.ticker] && (
                      <SpotPrice
                        value={Simulator.TICKERS[c.ticker].currentPrice}
                        className="font-mono text-[10px] tnum text-textSecondary"
                      />
                    )}
                    <button
                      onClick={() => removeCompare(c.ticker, c.mode)}
                      aria-label={`Remove the ${c.ticker} comparison`}
                      title="Remove comparison"
                      className="pointer-events-auto inline-flex items-center justify-center w-4 h-4 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.08] transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/*
            NOT ON A PHONE. The rail is 132px, which is a THIRD of a 390px
            screen — with it up, the chart column is 250px and the price
            gutter takes 56 of those, leaving under 200px of plot beside a
            full-height ladder. Worse, the pane's own floating chrome is wider
            than 250px, so it spilled out of the column and over the ladder.

            Hidden by breakpoint, not by config: the reader's `ladder` choice
            is left exactly as they set it and comes back the moment the
            window is wide enough. Turning it off in storage would silently
            rewrite a preference because they picked up their phone.
          */}
          {ladder && rail.rows.length > 0 && (
            <PaneLadder
              ticker={ticker}
              rows={rail.rows}
              maxAbs={rail.maxAbs}
              step={rail.step}
              levels={levels}
              focusPrice={focus}
              projection={projectionRef}
              onClose={() => {
                onCfg({ ladder: false });
                /*
                  A control that removes ITSELF has to say where focus goes.

                  This button unmounts on the same click, and the browser's
                  answer to "the focused element is gone" is <body> — so a
                  keyboard reader is dropped to the top of the document and
                  tabs back through the whole desk to reach anything. Focus
                  goes to the one control that undoes this, which is what a
                  reader would look for next.

                  After the commit, not during: the button is still mounted in
                  this tick, and focusing the target before React removes it
                  would be undone by the removal.
                */
                requestAnimationFrame(() => {
                  const undo = document.querySelector<HTMLElement>('[data-strikes-toggle]');
                  // Below `lg` the arrangement chrome can be off screen; there
                  // is nothing better to offer than leaving focus where it is.
                  if (undo?.isConnected) undo.focus();
                });
              }}
              closeHint="Hide this rail — R"
              onSelect={price => setFocus(cur => (cur != null && Math.abs(cur - price) < 1e-9 ? null : price))}
              className="hidden lg:flex"
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Terrain — the charts-only desk. */
const Terrain = () => {
  const { marketData } = useMarketData();
  const revRef = useRef(0);
  const revision = useMemo(() => ++revRef.current, [marketData]);

  const [cfg, setCfg] = useState<TerrainCfg>(loadCfg);
  useEffect(() => {
    try {
      localStorage.setItem(TERRAIN_KEY, JSON.stringify(cfg));
    } catch {
      /* storage can be full, private, or switched off — never fatal */
    }
  }, [cfg]);

  /* The key handler is installed once, so it reaches the reducer through a ref
     rather than closing over the first render's copy of it. */
  const setPaneRef = useRef<(i: number, patch: Partial<PaneCfg>) => void>(() => {});

  /*
    EVERY pane mutation funnels here, which is why both halves of the symbol
    memory live here and nowhere else.

    Doing the restore in a Pane effect instead would give one render with the
    new symbol and the OLD interval, then another with both — two full reloads
    of candles, volume and trails for one pick, and it would mis-fire the
    chart's own "same ticker" fade guard. This is one commit: symbol and
    settings land together.
  */
  const setPane = (i: number, patch: Partial<PaneCfg>) =>
    setCfg(prev => {
      const cur = prev.panes[i];
      if (!cur) return prev;
      const now = Date.now();
      const put = (p: PaneCfg, setups: SetupMap) => ({
        ...prev,
        setups,
        panes: prev.panes.map((q, j) => (j === i ? p : q)),
      });

      // A SYMBOL CHANGE — restore, and never capture the symbol on its way out
      if (patch.ticker && symKey(patch.ticker) !== symKey(cur.ticker)) {
        const key = symKey(patch.ticker);
        const saved = prev.setups[key];
        /* With nothing saved, applySetup reduces to `cur` — a symbol nobody
           has configured inherits the pane exactly as it stands, which is the
           behaviour that was here before any of this. `compares` is written
           explicitly every time, so a comparison can never leak across a
           symbol change. */
        const next = { ...applySetup(cur, saved), ...patch, compares: saved?.compares ?? [] };
        return put(next, saved ? { ...prev.setups, [key]: { ...saved, seen: now } } : prev.setups);
      }

      // A CONTROL TOUCH — this is what earns the symbol its entry
      const next = { ...cur, ...patch };
      // A rail-only patch is slot business and writes nothing to the symbol.
      if (!SETUP_KEYS.some(k => k in patch)) return put(next, prev.setups);
      return put(next, evict({ ...prev.setups, [symKey(cur.ticker)]: captureSetup(next, now) }));
    });
  setPaneRef.current = setPane;

  const [expanded, setExpanded] = useState<number | null>(null);
  const expandedRef = useRef<number | null>(null);
  expandedRef.current = expanded;

  /*
    AN EXPANDED PANE CANNOT OUTLIVE THE PANE IT POINTS AT.

    `expanded` is an INDEX, and the number of panes is a separate piece of
    state that the layout buttons and the 1-4 keys both change without
    consulting it. Expand the fourth chart, then press 2: the fourth pane stops
    rendering, so its `fixed inset-0` overlay vanishes and the desk looks
    normal — while `expanded` is still 3.

    What is left behind is worse than a stale number. The scroll lock is
    installed by the effect below and released by its cleanup, and the cleanup
    only runs when `expanded` CHANGES: it did not, so `document.body.style
    .overflow` stays `hidden` with nothing expanded. Below `lg` the desk is a
    scrolling page, and the reader is left on a page that will not scroll, with
    a floating "Esc" chip offering to close something that is not open.

    Clearing rather than clamping: shrinking the desk past the pane you were
    looking at is not a request to look at a different one.
  */
  useEffect(() => {
    setExpanded(cur => (cur !== null && cur >= cfg.layout ? null : cur));
  }, [cfg.layout]);

  useEffect(() => {
    if (expanded === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  const panes = cfg.panes.slice(0, cfg.layout);
  const anyLadder = panes.some(p => p.ladder);

  /*
    WHICH PANE A KEY ACTS ON.

    Stored unclamped and clamped on read, the same way the pane configs are:
    going 4 → 2 → 4 gives the fourth pane back rather than having silently
    forgotten it. It starts at 0 from first paint, so no key ever acts on
    something the reader cannot see, and reaching for any control inside a
    pane makes that pane active before the control does its own job.
  */
  const [activeRaw, setActiveRaw] = useState(0);
  const activeRaw0 = useRef(0);
  activeRaw0.current = activeRaw;
  const active = Math.min(activeRaw, cfg.layout - 1);
  /* Mirrors for the key handler, which is installed once and must never read
     a stale closure — the same pattern the charts use for their own
     subscriptions. */
  const activeRef = useRef(0);
  activeRef.current = active;
  /* Assigned during render, not in an effect: two keys inside one frame must
     both see the config the first one produced. */
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  /** Which pane has a menu open, and which menu — so `s` and `c` can open one
      without every pane growing its own piece of state. */
  const [menu, setMenu] = useState<{ pane: number; which: 'symbol' | 'compare' } | null>(null);

  /* A ring is feedback for people who can see it. Everything a key changes is
     also said out loud, or the whole layer is silent to a screen reader. */
  const [announce, setAnnounce] = useState('');
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);

  /*
    THE KEYS.

    Installed once, for the page's life: every mutation goes through a
    functional updater so the deps stay empty and `revision` — which bumps ten
    times a minute — cannot tear the listener down and rebuild it.

    Guards first. A key pressed while typing belongs to the text field, not to
    the desk, and `e.repeat` is dropped so a held key does not walk the
    timeframe list at the keyboard's repeat rate.
  */
  useEffect(() => {
    const editable = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return;
      if (editable(e.target) || editable(document.activeElement)) return;
      const i = activeRef.current;
      /* Read the config, compute the delta, then set — rather than doing any
         of it inside the updater. An updater that also calls setState is not
         pure, and React is free to run it more than once. */
      const cur = cfgRef.current;
      /* THROUGH setPane, not straight to setCfg. That reducer is the one place
         a pane change is turned into the symbol's remembered setup, and a
         second writer here meant a key-driven change was never remembered —
         measured: the `=` key moved the pane to 1h and wrote no SPY entry. */
      const patch = (fn: (q: PaneCfg) => Partial<PaneCfg>, say: (q: PaneCfg) => string) => {
        const q = cur.panes[i];
        if (!q) return;
        const delta = fn(q);
        setPaneRef.current(i, delta);
        setAnnounce(say({ ...q, ...delta }));
      };

      switch (e.key) {
        case '1': case '2': case '3': case '4': {
          e.preventDefault();
          const n = Number(e.key) as TerrainLayout;
          setCfg(prev => ({ ...prev, layout: n }));
          setAnnounce(n === 1 ? 'One chart' : `${n} charts`);
          return;
        }
        case '[': case ']': {
          e.preventDefault();
          const n = cur.layout;
          const next = ((Math.min(activeRaw0.current, n - 1) + (e.key === ']' ? 1 : -1)) + n) % n;
          setActiveRaw(next);
          /* Below `lg` the panes stack and the page scrolls, so the newly
             active one can be off screen entirely. */
          paneRefs.current[next]?.scrollIntoView({ block: 'nearest' });
          setAnnounce(`Chart ${next + 1} of ${n}, ${cur.panes[next]?.ticker ?? ''}`);
          return;
        }
        case '-': case '=':
          e.preventDefault();
          patch(q => ({ timeframe: stepTf(q.timeframe, e.key === '=' ? 1 : -1) }), q => `${q.ticker} ${q.timeframe}`);
          return;
        case 'r':
          e.preventDefault();
          patch(q => ({ ladder: !q.ladder }), q => `${q.ticker} strike rail ${q.ladder ? 'shown' : 'hidden'}`);
          return;
        case 'R': {
          e.preventDefault();
          const any = cur.panes.slice(0, cur.layout).some(q => q.ladder);
          setCfg(prev => ({ ...prev, panes: prev.panes.map(q => ({ ...q, ladder: !any })) }));
          setAnnounce(any ? 'Every strike rail hidden' : 'Strike rail on every chart');
          return;
        }
        case 'f':
          e.preventDefault();
          setExpanded(v => (v === i ? null : i));
          setAnnounce(`${cur.panes[i]?.ticker ?? ''} ${expandedRef.current === i ? 'collapsed' : 'expanded'}`);
          return;
        case 's':
          e.preventDefault();
          setMenu({ pane: i, which: 'symbol' });
          return;
        case 'c':
          e.preventDefault();
          setMenu({ pane: i, which: 'compare' });
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
    CROSSHAIR SYNC — one pane's hover, marking the same MOMENT on the others.

    IMPERATIVE, and that is the design rather than a shortcut. A hovered
    timestamp in React state would re-render every Pane and every StrikeChart
    at mousemove rate; neither is memoised, so that is up to four chart
    subtrees reconciled per pointer event on a desk whose whole premise is that
    the charts stay smooth. The panes hand up their own "mark that moment"
    function and the desk calls it directly: no state, no render.

    Only the moment travels — never a price. Two panes are usually two symbols,
    and the library's magnet discards a foreign price anyway, snapping to the
    receiving chart's own close.
  */
  const sinks = useRef(new Map<number, CrosshairSync>()).current;
  const sourcePane = useRef<number | null>(null);

  /* Plain functions, recreated every render on purpose: StrikeChart holds
     syncRegister through a ref and calls it only on mount, and reaches
     onCrosshair through a ref refreshed every render, so a changing identity
     costs nothing and useCallback here would be ceremony. */
  const registerSync = (i: number, apply: CrosshairSync | null) => {
    if (apply) sinks.set(i, apply);
    else sinks.delete(i);
  };

  const emitCrosshair = (i: number, time: Parameters<CrosshairSync>[0]) => {
    /* A LEAVE from a pane that is not the current source is stale. Dragging
       the pointer from one pane straight onto the next fires the old pane's
       leave and the new pane's enter in the same turn, and honouring that
       leave would wipe the mark the new pane had just set — a visible flicker
       on exactly the gesture this feature exists for. */
    if (time === null && sourcePane.current !== i) return;
    sourcePane.current = time === null ? null : i;
    for (const [j, apply] of sinks) if (j !== i) apply(time);
  };

  /* Nothing carries across a change of arrangement: a pane that has gone
     leaves no mark behind it, and the fullscreen takeover has nothing to sync
     with. */
  useEffect(() => {
    for (const apply of sinks.values()) apply(null);
    sourcePane.current = null;
  }, [cfg.layout, expanded, sinks]);

  return (
    /*
      FULL BLEED, and only from `lg`. The negative margins cancel the shell's
      own padding (px-4/6/8, pt-5, pb-16) so the panes reach the window edges,
      and the height is the viewport less the 56px top bar — measured in the
      built page, not guessed at. Below `lg` every one of those comes off and
      the page scrolls normally.
    */
    <div className="relative -mx-4 lg:-mx-6 2xl:-mx-8 lg:-mt-5 lg:-mb-16 px-1.5 lg:py-1.5 flex flex-col lg:h-[calc(100vh-3.5rem)] lg:min-h-0">
      {/*
        THE ARRANGEMENT CONTROLS, floating over the top-right of the grid.

        There is no page title and no caption any more (Noah, 2026-08-25: "i
        don't need to be told what page i'm on i know what i clicked"). He is
        right — a heading that names the thing you just navigated to is a line
        of chrome that tells a reader something they did on purpose thirty
        seconds ago, and on this desk that line was coming out of the charts.

        What is left is the two controls that belong to the ARRANGEMENT rather
        than to any chart, and they float rather than sit in flow, so they
        cost the grid nothing. Top RIGHT, because every pane's own controls
        float top left and two translucent strips on the same corner would
        stack into an unreadable pile.
      */}
      <div
        /*
          BOTTOM right, not top right.

          Top right put them straight through the last pane's own header: a
          pane's identity strip is as wide as its numbers, and at three-up the
          heaviest-strike read carries it most of the way across. Two floating
          things on the same corner is one unreadable thing.

          The bottom right of a chart is the emptiest region on this desk — it
          is the room held open AHEAD of the last bar, by design — so controls
          parked there cover nothing. Lifted clear of the time axis, and
          cleared past the last pane's rail when it has one; the rail's width
          comes from its own export rather than a number copied here that
          drifts the first time somebody edits the other file.
        */
        /* Cleared past the rail of the pane that is actually UNDER it. That is
           the last pane normally, but the EXPANDED one while a pane is
           expanded — it is the only one on screen, and its rail is the only
           one this bar can land on. Reading the last pane's flag there put the
           clearance on the wrong pane's setting the moment the two differed. */
        style={{
          right:
            ((expanded !== null ? panes[expanded] : panes[panes.length - 1])?.ladder ? LADDER_WIDTH_PX : 0) +
            PRICE_GUTTER_PX +
            8,
          bottom: TIME_AXIS_PX + 12,
        }}
        /* They come and go like the pane chrome, and they were the loudest
           thing on the screen while they were here: a solid white STRIKES
           button and a solid white active count, on a desk that had just been
           asked for less. Quiet at rest, full on hover or keyboard focus. */
        /*
          ABOVE THE EXPANDED PANE, AND FIXED WHILE IT IS UP.

          The expanded pane is `fixed inset-0 z-[80]`, and this bar was
          `absolute z-30` — under it. All three controls stayed mounted,
          `opacity: 1` and `pointer-events: auto`, and `elementFromPoint` at
          each one's own centre returned the expanded chart's canvas: painted,
          and dead. Measured at 1440x900 and 1024x768.

          The Esc chip is the one that made this worth fixing, because it
          renders ONLY while expanded — a control whose entire job is the
          pointer way out of fullscreen, shipped in the one state where it
          cannot be clicked. (The pane's own Collapse button is inside the
          modal and does work, so this was a dead duplicate rather than a
          trap; it still offered a reader a button that does nothing.)

          `fixed` rather than `absolute` while expanded, to match what it now
          sits over: `absolute` anchors to this page root, and below `lg` the
          root is a scrolling column rather than the viewport, so the bar
          would ride down the page while the modal stayed pinned to the glass.
        */
        className={`chrome-hover pointer-events-none flex items-center gap-2 opacity-40 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100 ${
          expanded !== null ? 'fixed z-[90]' : 'absolute z-30'
        }`}
      >
        <div
          role="group"
          aria-label="How many charts"
          className="pointer-events-auto inline-flex flex-wrap items-center gap-0.5 border border-white/[0.08] bg-canvas/40 backdrop-blur-[3px] rounded-md p-0.5"
        >
          <Rows3 className="w-3.5 h-3.5 mx-1.5 text-textMuted shrink-0" aria-hidden />
          {LAYOUTS.map(n => {
            const active = n === cfg.layout;
            return (
              <button
                key={n}
                onClick={() => setCfg(prev => ({ ...prev, layout: n }))}
                aria-pressed={active}
                aria-label={`${n} ${n === 1 ? 'chart' : 'charts'}`}
                title={`${n} ${n === 1 ? 'chart' : 'charts'} — press ${n}`}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold tnum transition-colors ${
                  active ? 'bg-white/[0.16] text-textPrimary' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.06]'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* Every pane at once — a convenience over the per-pane ×, not the
            only way out of the rail. It reads the panes rather than holding
            its own flag: if any visible pane still shows a rail the button is
            lit and pressing it clears them all; with none showing it puts
            them all back. A button that can disagree with what is on screen
            is a button nobody trusts. */}
        <button
          /* Named so a control that REMOVES itself can hand focus here — see
             the rail's × below. A data attribute rather than an id: a desk can
             hold four panes and an id has to be unique, while this button is
             the one global undo for all of them. */
          data-strikes-toggle=""
          onClick={() => setCfg(prev => ({ ...prev, panes: prev.panes.map(p => ({ ...p, ladder: !anyLadder })) }))}
          aria-pressed={anyLadder}
          title={anyLadder ? 'Hide every strike rail — Shift R' : 'Show the strike rail beside every chart — Shift R'}
          className={`pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/[0.08] backdrop-blur-[3px] font-mono text-[10px] uppercase tracking-wider transition-colors ${
            anyLadder ? 'bg-white/[0.16] text-textPrimary' : 'bg-canvas/40 text-textSecondary hover:text-textPrimary'
          }`}
        >
          Strikes
        </button>

        {expanded !== null && (
          <button
            onClick={() => setExpanded(null)}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle bg-canvas/70 backdrop-blur-[2px] font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary"
          >
            <X className="w-3.5 h-3.5" /> Esc
          </button>
        )}
      </div>

      {/* The ring and the badge are feedback for people who can see them. A
          key that rearranges the desk has to say so as well, or the whole
          layer is silent to a screen reader. */}
      <span className="sr-only" aria-live="polite">{announce}</span>

      {/*
        THE CHARTS ARE THE PAGE, so the grid takes every pixel the root has
        left rather than a fraction of the viewport. `flex-1 min-h-0` is what
        does it — min-h-0 is what lets a flex child actually shrink; without
        it the charts set the floor and the grid grows past the window.

        Below `lg` the panes stack and each takes a readable minimum instead,
        because four charts sharing one phone screen is four unreadable ones.
      */}
      <div
        /* The stacked-phone minimum lives on the PANE, not here — see the
           note on Pane's own wrapper for why a rule here does nothing. */
        className={`grid ${COLS[cfg.layout]} ${ROWS[cfg.layout]} gap-1.5 flex-1 min-h-0`}
      >
        {panes.map((pane, i) => (
          <Pane
            key={i}
            cfg={pane}
            onCfg={patch => setPane(i, patch)}
            revision={revision}
            expanded={expanded === i}
            onToggleExpand={() => setExpanded(cur => (cur === i ? null : i))}
            index={i}
            tall={cfg.layout === 1}
            onCrosshair={t => emitCrosshair(i, t)}
            registerSync={apply => registerSync(i, apply)}
            isActive={i === active}
            onActivate={() => setActiveRaw(i)}
            paneCount={cfg.layout}
            menuOpen={menu?.pane === i ? menu.which : null}
            onMenu={which => setMenu(which ? { pane: i, which } : null)}
            boxRef={el => { paneRefs.current[i] = el; }}
            /*
              THE ODD PANE OUT TAKES THE WHOLE ROW.

              Three panes in two columns leaves the second row half empty —
              at 1440, the most ordinary laptop width there is, that is a
              quarter of the desk showing nothing. The third pane spans both
              columns instead. From `2xl` the layout is three columns and the
              span comes straight back off, because there is no odd pane any
              more.
            */
            cell={cfg.layout === 3 && i === 2 ? 'lg:col-span-2 2xl:col-span-1' : ''}
          />
        ))}
      </div>
    </div>
  );
};

export default Terrain;
