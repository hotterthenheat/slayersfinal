import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Rows3, X } from 'lucide-react';
import Simulator from '../../core/simulator';
import { useMarketData } from '../../context/MarketDataContext';
import { buildLevelsFor, buildPrints } from '../../data/gex';
import StrikeChart, {
  DEFAULT_INDICATORS,
  DEFAULT_OVERLAYS,
  type ChartIndicators,
  type ChartOverlays,
  type ChartStyle,
} from '../../components/gex/StrikeChart';
import ChartToolbar from '../../components/gex/ChartToolbar';
import TickerQuickPick from '../../components/gex/TickerQuickPick';
import SpotPrice from '../../components/gex/SpotPrice';
import { CANDLE_THEMES, chartSurface, useCandleThemeKey } from '../../components/gex/candleTheme';
import { TIMEFRAMES, type Timeframe } from '../../data/timeframe';

/*
==================================================
  SLAYER TERMINAL - TERRAIN (pages/terrain/Terrain.tsx)

  Charts, and nothing else. One rail across the top
  drives every pane; each pane carries its own name.
==================================================

  WHY IT IS NOT THE 4-WAY BOARD.

  /pulse/board already puts four charts on a screen, and it is deliberately
  the opposite arrangement: four cells, each with its OWN full toolbar,
  because its job is comparing four books that are each set up differently.
  That is four workspaces on one page.

  Terrain is one workspace with several viewports. The timeframe, the
  overlays, the indicators and the tape's shape are set ONCE and every pane
  obeys, so what changes between panes is the instrument and nothing else —
  which is the only way a three-up read of SPY, QQQ and AAPL means anything.
  Change the timeframe and all three move together.

  So the two are not duplicates and neither replaces the other. If they ever
  drift toward each other, the board is the one that should keep per-cell
  controls.

  WHAT IS SHARED AND WHAT IS NOT, stated because it is the whole design:

      shared    timeframe · overlays · indicators · chart style
      per pane  the symbol, and nothing else

  The rail is `ChartToolbar` in `spread` mode — the same component every
  other chart on the desk uses, not a second toolbar that looks like it.
  Layout is the one control Terrain adds, because no single chart needs it.
*/

const TERRAIN_KEY = 'slayer_terrain_v1';

/** How many panes are on screen. Four is the ceiling: at 1440 a fifth pane is
    260px wide, and a chart that narrow stops being a chart — the same finding
    that keeps the Pulse desk's widgets from going below their floor. */
export const LAYOUTS = [1, 2, 3, 4] as const;
export type TerrainLayout = (typeof LAYOUTS)[number];

interface TerrainCfg {
  layout: TerrainLayout;
  /** One per pane slot; kept at length 4 so switching layout never loses a
      symbol the reader chose — going 3 → 2 → 3 gives the third pane back. */
  tickers: string[];
  timeframe: Timeframe;
  overlays: ChartOverlays;
  indicators: ChartIndicators;
  chartStyle: ChartStyle;
}

const TF_VALUES = new Set<string>(TIMEFRAMES.map(t => t.value));
const STYLES = new Set<ChartStyle>(['candles', 'hollow', 'bars', 'line', 'step', 'area', 'baseline']);

const defaults = (): TerrainCfg => ({
  layout: 3,
  tickers: [...Simulator.WATCHLIST.slice(0, 4)],
  timeframe: '15m',
  overlays: { ...DEFAULT_OVERLAYS },
  indicators: { ...DEFAULT_INDICATORS },
  chartStyle: 'candles',
});

/*
  Self-healing load, the same contract the board's uses: anything malformed in
  storage falls back to the default rather than throwing on read. A saved
  layout of 7, a ticker that is a number, a timeframe that was renamed — each
  is a value somebody's browser can be holding after a deploy, and none of
  them may take the page down.
*/
function loadCfg(): TerrainCfg {
  const def = defaults();
  try {
    const raw = localStorage.getItem(TERRAIN_KEY);
    if (!raw) return def;
    const c = JSON.parse(raw) as Partial<TerrainCfg>;
    if (!c || typeof c !== 'object') return def;
    const tickers = Array.isArray(c.tickers)
      ? def.tickers.map((d, i) => (typeof c.tickers?.[i] === 'string' && c.tickers[i] ? c.tickers[i] : d))
      : def.tickers;
    return {
      layout: (LAYOUTS as readonly number[]).includes(c.layout as number) ? (c.layout as TerrainLayout) : def.layout,
      tickers,
      timeframe: typeof c.timeframe === 'string' && TF_VALUES.has(c.timeframe) ? (c.timeframe as Timeframe) : def.timeframe,
      overlays: { ...DEFAULT_OVERLAYS, ...(c.overlays && typeof c.overlays === 'object' ? c.overlays : {}) },
      indicators: { ...DEFAULT_INDICATORS, ...(c.indicators && typeof c.indicators === 'object' ? c.indicators : {}) },
      chartStyle: typeof c.chartStyle === 'string' && STYLES.has(c.chartStyle as ChartStyle) ? (c.chartStyle as ChartStyle) : def.chartStyle,
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

interface PaneProps {
  ticker: string;
  onTicker: (t: string) => void;
  timeframe: Timeframe;
  overlays: ChartOverlays;
  indicators: ChartIndicators;
  chartStyle: ChartStyle;
  revision: number;
  expanded: boolean;
  onToggleExpand: () => void;
  index: number;
  /** Panes get shorter as the grid gets wider — one chart earns the height */
  tall: boolean;
}

const Pane = ({
  ticker,
  onTicker,
  timeframe,
  overlays,
  indicators,
  chartStyle,
  revision,
  expanded,
  onToggleExpand,
  index,
  tall,
}: PaneProps) => {
  // Each pane reads its own book; revision keeps the levels tracking the tick
  const levels = useMemo(
    () => buildLevelsFor(ticker),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, revision]
  );
  // Deterministic per ticker, so the dark-pool lines do not wander on a tick
  const prints = useMemo(
    () => buildPrints(ticker, levels.spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker]
  );

  /* One surface under the header AND the tape, so a pane is one continuous
     black inside its frame rather than two shades meeting at a seam. */
  const themeKey = useCandleThemeKey();
  const themeBg = chartSurface(CANDLE_THEMES[themeKey]).bg;
  const surface = themeBg === 'transparent' ? '#0a0a0a' : themeBg;

  return (
    <div className={expanded ? 'fixed inset-0 z-[80] flex flex-col' : 'contents'}>
      <div
        className={`relative flex flex-col min-h-0 overflow-hidden animate-soft-in ${
          expanded ? 'flex-1' : 'border border-borderSubtle rounded-md'
        }`}
        style={{ animationDelay: `${index * 60}ms`, background: surface }}
      >
        {/* The pane's whole header is its IDENTITY — symbol, price, and the
            timeframe the rail chose, read-only here. Every control that would
            change how the chart is drawn lives on the rail, because a control
            that only moves one pane defeats the point of the arrangement. */}
        <div className="shrink-0 w-full select-none flex items-center gap-2 px-2.5 py-1.5">
          <TickerQuickPick ticker={ticker} onPick={onTicker} />
          <SpotPrice value={levels.spot} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-textMuted">{timeframe}</span>
          <button
            onClick={onToggleExpand}
            aria-label={expanded ? `Collapse ${ticker}` : `Expand ${ticker} to the full screen`}
            title={expanded ? 'Collapse — Esc' : 'Expand this pane'}
            className="ml-auto shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-textMuted hover:text-textPrimary hover:bg-white/[0.05] transition-colors"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
        {/* flex-1 min-h-0, not a vh slice. The grid below sizes itself to the
            workspace and the pane fills its cell, so three charts and four
            charts each use the whole height instead of leaving a band of
            black under them. min-h-0 is what lets a flex child actually
            shrink — without it the chart sets the floor and the grid grows
            past the viewport. */}
        <div className="flex-1 min-h-0">
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
            frameless
          />
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
  const set = <K extends keyof TerrainCfg>(key: K, value: TerrainCfg[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

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

  const panes = cfg.tickers.slice(0, cfg.layout);

  return (
    <>
      {/* ── The rail. One row, and it drives every pane. ────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="font-mono text-[13px] font-bold uppercase tracking-wider text-textPrimary">Terrain</h1>
          <p className="font-mono text-[10px] text-textMuted uppercase tracking-widest">
            {cfg.layout} {cfg.layout === 1 ? 'chart' : 'charts'} · one set of controls
          </p>
        </div>

        {/* Layout is the one control that belongs to Terrain and to no single
            chart, so it sits first and reads as a count rather than an icon. */}
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
                onClick={() => set('layout', n)}
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

        <div className="flex-1 min-w-0">
          <ChartToolbar
            spread
            candles
            alerts
            timeframe={cfg.timeframe}
            onTimeframe={tf => set('timeframe', tf)}
            overlays={cfg.overlays}
            onOverlays={o => set('overlays', o)}
            indicators={cfg.indicators}
            onIndicators={i => set('indicators', i)}
            chartStyle={cfg.chartStyle}
            onChartStyle={s => set('chartStyle', s)}
          />
        </div>

        {expanded !== null && (
          <button
            onClick={() => setExpanded(null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-borderSubtle font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary"
          >
            <X className="w-3.5 h-3.5" /> Esc
          </button>
        )}
      </div>

      {/*
        THE CHARTS ARE THE PAGE, so the grid takes the height rather than a
        fixed slice of it. 15rem is the shell's top bar, this rail, and the
        page's own padding — measured, not guessed. Below `lg` the panes
        stack and the height cap comes off, because four charts sharing one
        phone screen is four unreadable charts.

        The site footer still ends the page, as it does everywhere else
        (AppShell, 2026-08-23). It simply falls below the fold here, which is
        where a workspace wants it.
      */}
      <div
        className={`grid ${COLS[cfg.layout]} ${cfg.layout === 4 ? 'lg:grid-rows-2' : 'lg:grid-rows-1'} gap-3 lg:h-[calc(100vh-15rem)] lg:min-h-[520px]`}
      >
        {panes.map((ticker, i) => (
          <Pane
            key={i}
            ticker={ticker}
            onTicker={t =>
              setCfg(prev => ({ ...prev, tickers: prev.tickers.map((x, j) => (j === i ? t : x)) }))
            }
            timeframe={cfg.timeframe}
            overlays={cfg.overlays}
            indicators={cfg.indicators}
            chartStyle={cfg.chartStyle}
            revision={revision}
            expanded={expanded === i}
            onToggleExpand={() => setExpanded(cur => (cur === i ? null : i))}
            index={i}
            tall={cfg.layout === 1}
          />
        ))}
      </div>
    </>
  );
};

export default Terrain;
