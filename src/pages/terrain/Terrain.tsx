import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Rows3, X } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLadderFor, buildLevelsFor, buildPrints, fmtUsd, spotChangePct } from '../../data/gex';
import StrikeChart, {
  DEFAULT_INDICATORS,
  DEFAULT_OVERLAYS,
  type ChartIndicators,
  type ChartOverlays,
  type ChartStyle,
} from '../../components/gex/StrikeChart';
import ChartToolbar from '../../components/gex/ChartToolbar';
import PaneLadder from '../../components/gex/PaneLadder';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import { CANDLE_THEMES, chartSurface, useCandleThemeKey } from '../../components/gex/candleTheme';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';

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

/** How many panes are on screen. Four is the ceiling: at 1440 a fifth pane is
    260px wide, and a chart that narrow stops being a chart — the same finding
    that keeps the Pulse desk's widgets from going below their floor. */
export const LAYOUTS = [1, 2, 3, 4] as const;
export type TerrainLayout = (typeof LAYOUTS)[number];

/** Everything one pane owns. There is nothing else — a setting that is not
    here is a setting every pane shares, and only two of those exist. */
interface PaneCfg {
  ticker: string;
  timeframe: Timeframe;
  overlays: ChartOverlays;
  indicators: ChartIndicators;
  chartStyle: ChartStyle;
}

interface TerrainCfg {
  layout: TerrainLayout;
  /** Always four, whatever the layout, so going 3 → 2 → 3 gives the third
      pane back exactly as it was rather than resetting it. */
  panes: PaneCfg[];
  ladder: boolean;
}

const TF_VALUES = new Set<string>(TIMEFRAMES.map(t => t.value));
const STYLES = new Set<ChartStyle>(['candles', 'hollow', 'bars', 'line', 'step', 'area', 'baseline']);

/** The pane slots differ only by symbol at first; a reader sets the rest. */
const defaultPanes = (): PaneCfg[] =>
  Simulator.WATCHLIST.slice(0, 4).map(ticker => ({
    ticker,
    timeframe: '15m' as Timeframe,
    overlays: { ...DEFAULT_OVERLAYS },
    indicators: { ...DEFAULT_INDICATORS },
    chartStyle: 'candles' as ChartStyle,
  }));

const defaults = (): TerrainCfg => ({ layout: 3, panes: defaultPanes(), ladder: true });

/** One stored pane, validated field by field against a known-good default. */
function readPane(raw: unknown, def: PaneCfg): PaneCfg {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<PaneCfg>;
  return {
    ticker: typeof c.ticker === 'string' && c.ticker ? c.ticker : def.ticker,
    timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : def.timeframe,
    overlays: { ...DEFAULT_OVERLAYS, ...(c.overlays && typeof c.overlays === 'object' ? c.overlays : {}) },
    indicators: { ...DEFAULT_INDICATORS, ...(c.indicators && typeof c.indicators === 'object' ? c.indicators : {}) },
    chartStyle: typeof c.chartStyle === 'string' && STYLES.has(c.chartStyle as ChartStyle) ? (c.chartStyle as ChartStyle) : def.chartStyle,
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
    const ladder = typeof c.ladder === 'boolean' ? c.ladder : def.ladder;

    if (Array.isArray(c.panes)) {
      const stored = c.panes as unknown[];
      return { layout, ladder, panes: def.panes.map((d, i) => readPane(stored[i], d)) };
    }

    // ── the flat shape, fanned out ──
    const legacy: Partial<PaneCfg> = {
      timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : undefined,
      overlays: c.overlays && typeof c.overlays === 'object' ? (c.overlays as ChartOverlays) : undefined,
      indicators: c.indicators && typeof c.indicators === 'object' ? (c.indicators as ChartIndicators) : undefined,
      chartStyle: typeof c.chartStyle === 'string' && STYLES.has(c.chartStyle as ChartStyle) ? (c.chartStyle as ChartStyle) : undefined,
    };
    const tickers = Array.isArray(c.tickers) ? (c.tickers as unknown[]) : [];
    return {
      layout,
      ladder,
      panes: def.panes.map((d, i) =>
        readPane({ ...legacy, ticker: typeof tickers[i] === 'string' ? tickers[i] : d.ticker }, d)
      ),
    };
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
  Height of the time axis lightweight-charts draws under the plot, in px.

  MEASURED, not chosen: with `timeVisible: true` and this font the axis canvas
  runs 858→884 in a 1000px viewport. It is a library constant for this
  configuration, so it is written down once here and asserted in the sweep —
  if a library upgrade moves it, the rail stops lining up with the plot floor
  and the check fails instead of the corner quietly filling with ladder again.
*/
const TIME_AXIS_PX = 26;

/** The three heaviest strikes in the pane's window, signed — the one-line
    read of where the book is, and the same rows the rail draws. */
const heavyThree = (rows: { strike: number; value: number }[]) =>
  [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);

interface PaneProps {
  cfg: PaneCfg;
  onCfg: (patch: Partial<PaneCfg>) => void;
  ladder: boolean;
  revision: number;
  expanded: boolean;
  onToggleExpand: () => void;
  index: number;
  /** Panes get shorter as the grid gets wider — one chart earns the height */
  tall: boolean;
}

const Pane = ({ cfg, onCfg, ladder, revision, expanded, onToggleExpand, index, tall }: PaneProps) => {
  const { ticker, timeframe, overlays, indicators, chartStyle } = cfg;

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
  const heavy = useMemo(() => heavyThree(rail.rows), [rail]);

  /* What the reader clicked in the rail, flashed on the chart. Clicking the
     same strike again clears it, so the rail is a toggle rather than a thing
     you can only turn on. It resets on a symbol change because a price from
     the last book means nothing against this one. */
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => setFocus(null), [ticker]);

  /* One surface under the header AND the tape, so a pane is one continuous
     black inside its frame rather than two shades meeting at a seam. */
  const themeKey = useCandleThemeKey();
  const themeBg = chartSurface(CANDLE_THEMES[themeKey]).bg;
  const surface = themeBg === 'transparent' ? '#0a0a0a' : themeBg;

  const up = changePct >= 0;

  return (
    <div className={expanded ? 'fixed inset-0 z-[80] flex flex-col' : 'contents'}>
      <div
        className={`relative flex flex-col min-h-0 overflow-hidden animate-soft-in ${
          expanded ? 'flex-1' : 'border border-borderSubtle rounded-md'
        }`}
        style={{ animationDelay: `${index * 60}ms`, background: surface }}
      >
        {/* ── who this pane is ────────────────────────────────────────────
            ITS OWN ROW, and that is not a stylistic preference. Sharing one
            wrapping line with the toolbar put the timeframe pills ABOVE the
            symbol at three-up: `spread` pins the pills left and pushes the
            rest right, so the first thing to wrap was the whole identity
            block, and the pane announced its interval before it announced
            what it was charting. Two rows cannot do that. */}
        {/*
          ONE ROW, ALWAYS — it does not wrap, it clips.

          Wrapping made the panes disagree about where their charts start: the
          heaviest-strike read is as wide as its numbers happen to be, so a
          pane holding three $200M strikes pushed the expand button onto a
          second line while the pane beside it stayed on one, and the two
          charts began at different heights. In a side-by-side workspace that
          reads as a rendering fault. The identity and the button are fixed;
          only the strike read gives, and it gives by being cut off at the
          pane's edge — visibly, predictably, and equally in every pane.
        */}
        <div className="shrink-0 w-full select-none flex items-center gap-2 px-2 pt-1.5 overflow-hidden">
          <span className="shrink-0">
            <TickerQuickPick ticker={ticker} onPick={t => onCfg({ ticker: t })} />
          </span>
          <span className="shrink-0">
            <SpotPrice value={levels.spot} />
          </span>
          <span className={`shrink-0 font-mono text-[11px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
            {up ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>

          {/* ── the book, on the same line ────────────────────────────────
              The three heaviest strikes in the pane's window with their
              signed exposure — the same rows the rail draws, so the line and
              the column can never name different strikes. It rides beside the
              identity because a pane that spends four rows on chrome is a
              pane with no room left to chart anything. Gold is put-dominant,
              steel call-dominant: the desk's ramp poles, so this line, the
              rail and the trails under it all say the same thing in the same
              colours. */}
          {heavy.length > 0 && (
            <span className="flex items-center gap-2.5 min-w-0 overflow-hidden whitespace-nowrap">
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
          )}

          <button
            onClick={onToggleExpand}
            aria-pressed={expanded}
            aria-label={expanded ? `Collapse ${ticker}` : `Expand ${ticker} to the full screen`}
            title={expanded ? 'Collapse — Esc' : 'Expand this pane'}
            className="ml-auto shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* ── and how this pane is set up. Its own, every one of them. ──── */}
        <div className="shrink-0 w-full px-2 pt-1 pb-1">
          <ChartToolbar
            minimal
            candles
            alerts
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

        {/* Chart and rail on ONE line. min-w-0 on the chart is load-bearing:
            a flex item wider than its line does not wrap, it spills, and a
            chart's natural width is whatever its container was last tick. */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
            <StrikeChart
              ticker={ticker}
              revision={revision}
              levels={levels}
              timeframe={timeframe}
              height={tall ? 260 : 200}
              overlays={overlays}
              indicators={indicators}
              chartStyle={chartStyle}
              prints={prints}
              focusPrice={focus}
              axisLevels
              countdown
              frameless
            />
          </div>
          {ladder && rail.rows.length > 0 && (
            <PaneLadder
              ticker={ticker}
              rows={rail.rows}
              maxAbs={rail.maxAbs}
              levels={levels}
              focusPrice={focus}
              axisInset={TIME_AXIS_PX}
              onSelect={price => setFocus(cur => (cur != null && Math.abs(cur - price) < 1e-9 ? null : price))}
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

  const setPane = (i: number, patch: Partial<PaneCfg>) =>
    setCfg(prev => ({ ...prev, panes: prev.panes.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  const [expanded, setExpanded] = useState<number | null>(null);
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

  return (
    /*
      FULL BLEED, and only from `lg`. The negative margins cancel the shell's
      own padding (px-4/6/8, pt-5, pb-16) so the panes reach the window edges,
      and the height is the viewport less the 56px top bar — measured in the
      built page, not guessed at. Below `lg` every one of those comes off and
      the page scrolls normally.
    */
    <div className="-mx-4 lg:-mx-6 2xl:-mx-8 lg:-mt-5 lg:-mb-16 px-2 lg:pt-2 lg:pb-1 flex flex-col gap-2 lg:h-[calc(100vh-3.5rem)] lg:min-h-0">
      {/* ── The rail. Only what belongs to the ARRANGEMENT. ─────────────── */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-mono text-[13px] font-bold uppercase tracking-wider text-textPrimary">Terrain</h1>
          <p className="font-mono text-[10px] text-textMuted uppercase tracking-widest">
            {cfg.layout} {cfg.layout === 1 ? 'chart' : 'charts'} · each on its own
          </p>
        </div>

        <div
          role="group"
          aria-label="How many charts"
          className="inline-flex flex-wrap items-center gap-0.5 border border-borderSubtle bg-panel rounded-md p-0.5"
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
                title={`${n} ${n === 1 ? 'chart' : 'charts'}`}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold tnum transition-colors ${
                  active ? 'bg-[#ededed] text-[#0a0a0a]' : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* The strike rail is an arrangement choice — it changes what a pane
            is made of, not how its tape is drawn, which is why it lives here
            and not in the pane's own toolbar. */}
        <button
          onClick={() => setCfg(prev => ({ ...prev, ladder: !prev.ladder }))}
          aria-pressed={cfg.ladder}
          title={cfg.ladder ? 'Hide the strike rail' : 'Show the strike rail beside each chart'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle font-mono text-[10px] uppercase tracking-wider transition-colors ${
            cfg.ladder ? 'bg-[#ededed] text-[#0a0a0a]' : 'bg-panel text-textSecondary hover:text-textPrimary'
          }`}
        >
          Strikes
        </button>

        {expanded !== null && (
          <button
            onClick={() => setExpanded(null)}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary"
          >
            <X className="w-3.5 h-3.5" /> Esc
          </button>
        )}
      </div>

      {/*
        THE CHARTS ARE THE PAGE, so the grid takes every pixel the root has
        left rather than a fraction of the viewport. `flex-1 min-h-0` is what
        does it — min-h-0 is what lets a flex child actually shrink; without
        it the charts set the floor and the grid grows past the window.

        Below `lg` the panes stack and each takes a readable minimum instead,
        because four charts sharing one phone screen is four unreadable ones.
      */}
      <div
        className={`grid ${COLS[cfg.layout]} ${cfg.layout === 4 ? 'lg:grid-rows-2' : 'lg:grid-rows-1'} gap-2 flex-1 min-h-0 [&>*]:min-h-[420px] lg:[&>*]:min-h-0`}
      >
        {panes.map((pane, i) => (
          <Pane
            key={i}
            cfg={pane}
            onCfg={patch => setPane(i, patch)}
            ladder={cfg.ladder}
            revision={revision}
            expanded={expanded === i}
            onToggleExpand={() => setExpanded(cur => (cur === i ? null : i))}
            index={i}
            tall={cfg.layout === 1}
          />
        ))}
      </div>
    </div>
  );
};

export default Terrain;
