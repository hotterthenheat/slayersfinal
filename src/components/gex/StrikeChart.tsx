import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import Simulator from '../../core/simulator';
import {
  aggregateCandles,
  aggregateSnapshots,
  snapshotsMaxAbs,
  tfMinutes,
  INTRADAY_MAX_MINUTES,
  type Timeframe,
} from '../../data/timeframe';
import { GexNodesPrimitive } from './gexNodesPrimitive';
import { heatPoles } from './heatmap';
import { candleTheme } from './candleTheme';
import { fmtUsd } from '../../data/gex';
import ChartLegend from '../ui/ChartLegend';
import TimeframePicker from '../ui/TimeframePicker';
import type { Candle, GexSnapshot } from '../../types/market';
import type { KeyLevels, OverlayMode } from '../../types/gex';

interface StrikeChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  overlay: OverlayMode;
  /** Starting interval. The chart owns the live value from here on, so two
      instances of this chart can sit on different intervals side by side. */
  timeframe: Timeframe;
  /** Hide the interval picker where the chart is decoration, not an instrument. */
  showTimeframePicker?: boolean;
  /**
   * Whether the reader may pan and zoom the chart.
   *
   * lightweight-charts enables scroll AND scale by default — drag, wheel, pinch,
   * and press-drag on either axis — and nothing in this file ever turned them
   * off. On a desk that is right: a trader reframing a chart is the point. On the
   * landing page it is not, and the landing already knew that. Its call site
   * carries the comment "a preview of the read, not a desk to operate" and passes
   * `showTimeframePicker={false}`, but the intent stopped at the picker: the chart
   * underneath was still fully draggable, so a visitor could shove the hero
   * candles off into blank space on the first surface they ever see.
   */
  interactive?: boolean;
  height?: number;
  /** Transient user-focused price — renders a cyan FOCUS line while set */
  focusPrice?: number | null;
}

// Wall / flip / king overlay colors (independent of candle theme)
import { CALL_WALL, PUT_WALL, FLIP, KING, FOCUS, MUTED_INK } from './palette';

// Level lines are created once per overlay/ticker, then their prices are
// TWEENED (rAF + easeOutCubic) so scan-tier level moves glide instead of jumping.
const LEVEL_SPEC: {
  key: 'callWall' | 'putWall' | 'flip' | 'king';
  color: string;
  title: string;
  style: LineStyle;
  width: 1 | 2;
}[] = [
  { key: 'callWall', color: CALL_WALL, title: 'CALL WALL', style: LineStyle.Solid, width: 1 },
  { key: 'putWall', color: PUT_WALL, title: 'PUT WALL', style: LineStyle.Solid, width: 1 },
  { key: 'flip', color: FLIP, title: 'FLIP', style: LineStyle.Dashed, width: 1 },
  { key: 'king', color: KING, title: 'KING', style: LineStyle.Solid, width: 2 },
];

// When two levels resolve to the same price (e.g. the king strike IS the put
// wall), their axis-label pills stack into an unreadable overlap. Keep every
// coloured line drawn, but show only ONE pill per price — walls claim it first
// (they carry directional structure), then king, then flip. The full per-level
// breakdown still lives in the Key Levels panel, so nothing is lost.
const LABEL_PRIORITY: ('callWall' | 'putWall' | 'king' | 'flip')[] = ['callWall', 'putWall', 'king', 'flip'];
const labelVisibility = (L: KeyLevels): Record<'callWall' | 'putWall' | 'flip' | 'king', boolean> => {
  const claimed = new Set<string>();
  const vis = { callWall: true, putWall: true, flip: true, king: true };
  for (const key of LABEL_PRIORITY) {
    const priceKey = L[key].toFixed(2);
    if (claimed.has(priceKey)) vis[key] = false;
    else claimed.add(priceKey);
  }
  return vis;
};

const toCandle = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
});
const toVolume = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  value: b.volume,
  color: b.close >= b.open ? candleTheme.volUp : candleTheme.volDown,
});

/**
 * TradingView-grade candlestick chart with dealer-structure overlays and the
 * net-GEX node heatmap. Smoothness contract: created once; ticks arrive as
 * series.update() on the last (current-bucket) bar; full setData + fitContent
 * only on ticker/timeframe change. Pan/zoom is never fought.
 */
const StrikeChart = ({
  ticker,
  revision,
  levels,
  overlay,
  timeframe: initialTimeframe,
  showTimeframePicker = true,
  interactive = true,
  height = 460,
  focusPrice = null,
}: StrikeChartProps) => {
  // The chart owns the live interval; the prop only seeds it. Re-seeding on a
  // prop change keeps a controlled caller working if one ever appears.
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  useEffect(() => setTimeframe(initialTimeframe), [initialTimeframe]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const nodesRef = useRef<GexNodesPrimitive | null>(null);
  const levelLinesRef = useRef<Partial<Record<'callWall' | 'putWall' | 'flip' | 'king', IPriceLine>>>({});
  const shownLevelsRef = useRef<KeyLevels | null>(null);
  const levelRafRef = useRef(0);
  const levelTickerRef = useRef('');
  const focusLineRef = useRef<IPriceLine | null>(null);
  const levelsRef = useRef<KeyLevels>(levels);
  const barCountRef = useRef(0);
  const loadedRef = useRef<{ ticker: string; timeframe: Timeframe }>({ ticker: '', timeframe: '1m' });

  // Node-under-cursor read-out — written imperatively from the crosshair
  // handler (per-pixel frequency; React state would re-render the tree 60×/s).
  const snapMapRef = useRef<Map<number, GexSnapshot>>(new Map());
  const nodeMaxAbsRef = useRef(1);
  const nodesShownRef = useRef(false);
  const strikeStepRef = useRef(1);
  const nodeChipRef = useRef<HTMLDivElement | null>(null);
  const ncStrikeRef = useRef<HTMLSpanElement | null>(null);
  const ncGexRef = useRef<HTMLSpanElement | null>(null);
  const ncNoteRef = useRef<HTMLSpanElement | null>(null);

  // Keep the autoscale provider reading the freshest levels without re-mounting
  levelsRef.current = levels;

  // A full intraday session of thin bars — reads like a real terminal chart
  // rather than a handful of fat candles. One seeded session is 390 1m bars.
  const VISIBLE_BARS = 340;
  const showRecent = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const len = barCountRef.current;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - VISIBLE_BARS), to: len + 4 });
  }, []);

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    showRecent();
  }, [showRecent]);

  // Mount once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: MUTED_INK,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 3 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
      },
      // Both default to true. Locked together on purpose: leaving scale on while
      // scroll is off still lets a wheel stretch the axes until the candles are a
      // smear, which is the same defect with a different gesture. The crosshair is
      // untouched either way, so a locked chart still answers a hover.
      handleScroll: interactive,
      handleScale: interactive,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: candleTheme.up,
      downColor: candleTheme.down,
      borderUpColor: candleTheme.up,
      borderDownColor: candleTheme.down,
      wickUpColor: candleTheme.wickUp,
      wickDownColor: candleTheme.wickDown,
      priceLineVisible: true,
      priceLineColor: 'rgba(237,237,237,0.4)',
      priceLineStyle: LineStyle.Dotted,
      // Widen the visible price range to always include the walls/king so several
      // strike-node bands are on screen, not just the couple around spot.
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const lv = levelsRef.current;
        const extras = [lv.putWall, lv.callWall, lv.king, lv.spot].filter(v => Number.isFinite(v));
        let min = base?.priceRange.minValue ?? Math.min(...extras);
        let max = base?.priceRange.maxValue ?? Math.max(...extras);
        for (const v of extras) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const pad = Math.max((max - min) * 0.08, 0.01);
        return { priceRange: { minValue: min - pad, maxValue: max + pad } };
      },
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const nodes = new GexNodesPrimitive();
    candles.attachPrimitive(nodes);

    // Node-under-cursor read-out: resolve the hovered bar's snapshot, then the
    // strike band nearest the cursor price — using the same visibility threshold
    // the renderer paints with, so the chip only speaks for nodes you can see.
    chart.subscribeCrosshairMove(param => {
      const el = nodeChipRef.current;
      if (!el) return;
      const hide = () => {
        el.style.opacity = '0';
      };
      if (!nodesShownRef.current || !param.point || param.time == null) return hide();
      const snap = snapMapRef.current.get(param.time as number);
      const price = candles.coordinateToPrice(param.point.y);
      if (!snap || price == null) return hide();
      let best: { strike: number; value: number } | null = null;
      let bestDist = Infinity;
      for (const lvl of snap.levels) {
        const d = Math.abs(lvl.strike - price);
        if (d < bestDist) {
          bestDist = d;
          best = lvl;
        }
      }
      const maxAbs = nodeMaxAbsRef.current;
      if (!best || bestDist > strikeStepRef.current * 0.45 || Math.abs(best.value) < maxAbs * 0.045) return hide();
      const pos = best.value >= 0;
      if (ncStrikeRef.current) ncStrikeRef.current.textContent = best.strike.toFixed(2);
      if (ncGexRef.current) {
        ncGexRef.current.textContent = `${pos ? '+' : '−'}${fmtUsd(Math.abs(best.value))} GEX · ${Math.round((Math.abs(best.value) / maxAbs) * 100)}%`;
        ncGexRef.current.style.color = pos ? heatPoles.pos : heatPoles.neg;
      }
      if (ncNoteRef.current)
        ncNoteRef.current.textContent = pos ? 'long-gamma node — dips absorbed' : 'short-gamma node — moves amplified';
      el.style.opacity = '1';
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    nodesRef.current = nodes;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      nodesRef.current = null;
      levelLinesRef.current = {};
      shownLevelsRef.current = null;
      cancelAnimationFrame(levelRafRef.current);
      loadedRef.current = { ticker: '', timeframe: '1m' };
    };
    // Mount-once. `interactive` is read here so the chart is locked on its very
    // first frame rather than for one paint; the effect below keeps it honest if
    // a caller ever makes the prop dynamic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keep the lock in step with the prop.
     The mount effect above never re-runs, so without this a call site that
     toggled `interactive` would be silently ignored — the chart would keep
     whatever it was built with. Cheap, and it means the prop means what it says
     rather than meaning "whatever it was at mount". */
  useEffect(() => {
    chartRef.current?.applyOptions({ handleScroll: interactive, handleScale: interactive });
  }, [interactive]);

  // Candle data + node overlay: full load on ticker/timeframe change, incremental per tick
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const nodes = nodesRef.current;
    if (!chart || !candleSeries || !volumeSeries || !nodes) return;

    const base = Simulator.getCandles(ticker);
    const baseGex = Simulator.getGexHistory(ticker);
    if (!base || base.length === 0) return;

    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(base, mins);
    const snaps = aggregateSnapshots(baseGex ?? [], mins);
    const maxAbs = snapshotsMaxAbs(snaps);
    barCountRef.current = bars.length;

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe;

    if (changed) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      showRecent();
      // On a 0-width mount the range doesn't stick; re-apply once laid out so the
      // compact tile opens on the recent session, not zoomed out to the month.
      requestAnimationFrame(() => requestAnimationFrame(() => showRecent()));
      loadedRef.current = { ticker, timeframe };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
    }

    // Node overlay is intraday-only
    const showNodes = (overlay === 'NODES' || overlay === 'BOTH') && mins <= INTRADAY_MAX_MINUTES;
    nodes.setData(snaps, maxAbs, showNodes);

    // Mirror the overlay state into the cursor read-out's refs
    snapMapRef.current = new Map(snaps.map(s => [s.time as number, s]));
    nodeMaxAbsRef.current = maxAbs;
    nodesShownRef.current = showNodes;
    const strikes = snaps[0]?.levels.map(l => l.strike).sort((a, b) => a - b) ?? [];
    let step = Infinity;
    for (let i = 1; i < strikes.length; i++) step = Math.min(step, strikes[i] - strikes[i - 1]);
    strikeStepRef.current = Number.isFinite(step) ? step : 1;
    if (!showNodes && nodeChipRef.current) nodeChipRef.current.style.opacity = '0';
  }, [ticker, revision, timeframe, overlay, showRecent]);

  // Key-level price lines — create/destroy only when overlay or ticker changes
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    cancelAnimationFrame(levelRafRef.current);
    for (const spec of LEVEL_SPEC) {
      const line = levelLinesRef.current[spec.key];
      if (line) candleSeries.removePriceLine(line);
      delete levelLinesRef.current[spec.key];
    }
    shownLevelsRef.current = null;

    if (overlay === 'LEVELS' || overlay === 'BOTH') {
      const L = levelsRef.current;
      const vis = labelVisibility(L);
      for (const spec of LEVEL_SPEC) {
        levelLinesRef.current[spec.key] = candleSeries.createPriceLine({
          price: L[spec.key],
          color: spec.color,
          title: spec.title,
          lineStyle: spec.style,
          lineWidth: spec.width,
          axisLabelVisible: vis[spec.key],
        });
      }
      shownLevelsRef.current = { ...L };
      levelTickerRef.current = ticker;
    }
  }, [overlay, ticker]);

  // Tween level prices to their new scan values — lines glide, never teleport
  useEffect(() => {
    const lines = levelLinesRef.current;
    if (!lines.callWall) return; // levels hidden

    // Whichever level owns each price pill can change as levels move — recompute
    // so a coincident pill re-appears the moment the levels separate again.
    const vis = labelVisibility(levels);
    for (const spec of LEVEL_SPEC) lines[spec.key]?.applyOptions({ axisLabelVisible: vis[spec.key] });

    // Ticker switch = new world: snap, don't tween across symbols
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (levelTickerRef.current !== ticker || reduced) {
      levelTickerRef.current = ticker;
      for (const spec of LEVEL_SPEC) lines[spec.key]?.applyOptions({ price: levels[spec.key] });
      shownLevelsRef.current = { ...levels };
      return;
    }

    const origin = shownLevelsRef.current ?? { ...levels };
    if (!LEVEL_SPEC.some(s => origin[s.key] !== levels[s.key])) return;

    cancelAnimationFrame(levelRafRef.current);
    const target = { ...levels };
    const start = performance.now();
    const DUR = 650;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const cur: KeyLevels = { ...target };
      for (const spec of LEVEL_SPEC) {
        cur[spec.key] = origin[spec.key] + (target[spec.key] - origin[spec.key]) * e;
        lines[spec.key]?.applyOptions({ price: cur[spec.key] });
      }
      shownLevelsRef.current = cur;
      if (t < 1) levelRafRef.current = requestAnimationFrame(step);
    };
    levelRafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(levelRafRef.current);
  }, [levels, overlay, ticker]);

  // Transient FOCUS line — "what you clicked", drawn via the chart's native API
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    if (focusLineRef.current) {
      candleSeries.removePriceLine(focusLineRef.current);
      focusLineRef.current = null;
    }
    if (focusPrice != null) {
      focusLineRef.current = candleSeries.createPriceLine({
        price: focusPrice,
        color: FOCUS,
        title: 'FOCUS',
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        axisLabelVisible: true,
      });
    }
  }, [focusPrice]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-3.5 px-1 flex-wrap select-none">
        <ChartLegend
          variant="line"
          /* Walls are LINES, nodes are FILLED BANDS — and both resolved to the
             same green and the same red, so the legend showed six entries in
             four colours and the CALL WALL rule was invisible inside the +GEX
             bands. The keys now differ in shape the way the chart does, and the
             node keys carry the ramp they are actually drawn from. */
          items={[
            { label: 'Call Wall', kind: 'line', swatchClass: 'bg-bull' },
            { label: 'Put Wall', kind: 'line', swatchClass: 'bg-bear' },
            { label: 'Flip', kind: 'dashed', swatchClass: 'border-flip' },
            { label: 'King', kind: 'line', swatchClass: 'bg-king' },
            {
              label: '+GEX node',
              kind: 'gradient',
              gradient: `linear-gradient(to right, transparent, ${heatPoles.pos})`,
            },
            {
              label: '−GEX node',
              kind: 'gradient',
              gradient: `linear-gradient(to right, transparent, ${heatPoles.neg})`,
            },
          ]}
        />
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-wider hidden xl:inline">
          scroll zoom · drag pan · dbl-click reset
        </span>
        {/* Below xl the hint is hidden, so the picker takes over the ml-auto
            push that keeps the controls right-aligned against the legend. */}
        {showTimeframePicker && <TimeframePicker value={timeframe} onChange={setTimeframe} className="ml-auto xl:ml-0" />}
        <button
          onClick={resetView}
          title="Reset view (or double-click the chart)"
          className="inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted bg-panel rounded px-2 py-1 font-mono text-micro uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>
      <div
        className="relative flex-grow border border-borderSubtle bg-inset rounded-md overflow-hidden"
        style={{ minHeight: height }}
        onDoubleClick={resetView}
      >
        <div ref={containerRef} className="absolute inset-0" role="img" aria-label={`${ticker} price chart — candles with dealer walls, gamma flip, king strike and net-GEX nodes`} />
        <div
          ref={nodeChipRef}
          aria-hidden
          className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded border border-borderSubtle bg-panel/85 px-2 py-1 font-mono text-micro opacity-0 transition-opacity"
        >
          <span ref={ncStrikeRef} className="text-textPrimary tnum" />
          <span ref={ncGexRef} className="tnum" />
          <span ref={ncNoteRef} className="text-textMuted" />
        </div>
      </div>
    </div>
  );
};

export default StrikeChart;
