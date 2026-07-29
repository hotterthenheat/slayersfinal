import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import Simulator from '../../core/simulator';
import { aggregateCandles, tfMinutes, type Timeframe } from '../../data/timeframe';
import { candleTheme } from '../gex/candleTheme';
import ChartLegend from '../ui/ChartLegend';
import TimeframePicker from '../ui/TimeframePicker';
import { CALL_WALL, PUT_WALL, FLIP, DARK_POOL, FOCUS, SPOT } from '../gex/palette';

// Slayer signature candles (holo-silver/purple) — direction reads in colour so
// it pops against the gold liquidity book without duplicating the green/red the
// walls own.
const theme = candleTheme;
import { LiquidityHeatmapPrimitive } from './liquidityHeatmapPrimitive';
import { FlowPillsPrimitive } from './flowPillsPrimitive';
import { buildLiquidityBook, makeLiquidityLUT, type LiquidityBook } from '../../data/liquidityField';
import { buildFlowSweeps, type FlowSweep } from '../../data/flowSweeps';
import type { Candle } from '../../types/market';
import type { KeyLevels } from '../../types/gex';
import type { LiqDPLevel, LiqOverlays } from './liquidityTypes';

interface LiquidityHeatmapChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  spot: number;
  levels: KeyLevels;
  overlays: LiqOverlays;
  darkPoolLevels?: LiqDPLevel[];
  /** Strike open interest + GEX nodes — the structural resting book */
  oiByStrike?: { strike: number; oi: number }[];
  nodes?: { strike: number; value: number }[];
  /** Session VWAP & point-of-control for the reference lines */
  orderFlow?: { vwap: number; poc: number };
  /** Starting interval. The chart owns the live value from here on. */
  timeframe?: Timeframe;
  /** Hide the interval picker where the chart is decoration, not an instrument. */
  showTimeframePicker?: boolean;
  height?: number;
  focusPrice?: number | null;
}

// Wall / flip structure lines — the levels that matter for reading price against
// liquidity. King is deliberately omitted (it's a loud magenta line that mostly
// coincides with a wall and clutters this chart; the Live Chart still carries it).
type LevelKey = 'callWall' | 'putWall' | 'flip';
const LEVEL_SPEC: { key: LevelKey; color: string; title: string; style: LineStyle; width: 1 | 2 }[] = [
  { key: 'callWall', color: CALL_WALL, title: 'CALL WALL', style: LineStyle.Solid, width: 1 },
  { key: 'putWall', color: PUT_WALL, title: 'PUT WALL', style: LineStyle.Solid, width: 1 },
  { key: 'flip', color: FLIP, title: 'FLIP', style: LineStyle.Dashed, width: 1 },
];

// One axis pill per price — walls claim it first, then flip — so coincident
// levels don't stack into an unreadable overlap.
const LABEL_PRIORITY: LevelKey[] = ['callWall', 'putWall', 'flip'];
const labelVisibility = (L: KeyLevels): Record<LevelKey, boolean> => {
  const claimed = new Set<string>();
  const vis: Record<LevelKey, boolean> = { callWall: true, putWall: true, flip: true };
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
  color: b.close >= b.open ? theme.volUp : theme.volDown,
});

/**
 * TradingView-style liquidity chart: real candles + volume with the resting-
 * liquidity heat field painted behind them, dealer-structure walls, dark-pool
 * shelves and VWAP/POC as native price lines. Created once; ticks arrive as
 * series.update(); full setData only on ticker/timeframe change. Pan/zoom is
 * never fought — the field re-anchors to price every frame.
 */
const LiquidityHeatmapChart = ({
  ticker,
  revision,
  spot,
  levels,
  overlays,
  darkPoolLevels,
  oiByStrike,
  nodes,
  orderFlow,
  timeframe: initialTimeframe = '1m',
  showTimeframePicker = true,
  height = 320,
  focusPrice = null,
}: LiquidityHeatmapChartProps) => {
  // The chart owns the live interval; the prop only seeds it, so two tiles of
  // this chart can sit on different intervals side by side in Pulse.
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  useEffect(() => setTimeframe(initialTimeframe), [initialTimeframe]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const heatRef = useRef<LiquidityHeatmapPrimitive | null>(null);
  const flowRef = useRef<FlowPillsPrimitive | null>(null);
  const sweepsRef = useRef<FlowSweep[]>([]);

  const wallLinesRef = useRef<Partial<Record<LevelKey, IPriceLine>>>({});
  const shownLevelsRef = useRef<KeyLevels | null>(null);
  const levelRafRef = useRef(0);
  const levelTickerRef = useRef('');
  const dpLinesRef = useRef<IPriceLine[]>([]);
  const flowLinesRef = useRef<IPriceLine[]>([]);
  const focusLineRef = useRef<IPriceLine | null>(null);

  const levelsRef = useRef<KeyLevels>(levels);
  const dpRef = useRef<LiqDPLevel[]>(darkPoolLevels ?? []);
  levelsRef.current = levels;
  dpRef.current = darkPoolLevels ?? [];

  const loadedRef = useRef<{ ticker: string; timeframe: Timeframe }>({ ticker: '', timeframe: '1m' });
  const barCountRef = useRef(0);
  const barsRef = useRef<Candle[]>([]);
  const lut = useMemo(() => makeLiquidityLUT(), []);

  // Cursor depth read-out — written imperatively from the crosshair handler
  // (fires per-pixel; going through React state would re-render 60×/s for a
  // three-span chip).
  const bookRef = useRef<LiquidityBook | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const roPriceRef = useRef<HTMLSpanElement | null>(null);
  const roTimeRef = useRef<HTMLSpanElement | null>(null);
  const roDepthRef = useRef<HTMLSpanElement | null>(null);

  // Bars re-aggregate when the session advances; the liquidity book — the full
  // TIME x PRICE resting-order field — re-simulates from them. Both are keyed on
  // the tick revision: every input below derives from the same snapshot.
  const bars = useMemo(
    () => aggregateCandles(Simulator.getCandles(ticker) ?? [], tfMinutes(timeframe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, timeframe, revision]
  );
  const book = useMemo(
    () =>
      buildLiquidityBook({
        ticker,
        bars,
        spot,
        levels,
        darkPool: darkPoolLevels,
        oi: oiByStrike,
        nodes,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, bars]
  );

  // Show a full intraday session of thin bars (like a real terminal chart),
  // not a handful of fat candles. One seeded session is 390 1m bars.
  const VISIBLE_BARS = 360;
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
        textColor: '#7d7d7d',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      // Linear scale — the heat field maps row→y affinely, so a log scale would
      // shear the bands off their prices.
      rightPriceScale: { borderColor: '#1c1c1c', mode: PriceScaleMode.Normal },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 3 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.wickUp,
      wickDownColor: theme.wickDown,
      priceLineVisible: true,
      priceLineColor: 'rgba(237,237,237,0.4)',
      priceLineStyle: LineStyle.Dotted,
      // Frame on the CANDLES, computed straight from the visible bars, so the
      // price lines (walls, dark-pool shelves) never stretch the scale and cram
      // price into a strip — lightweight-charts folds price lines into original(),
      // which is exactly what squeezed the candles. Walls are pulled in only when
      // within ~0.3% of spot; far walls keep their clamped edge label and scroll
      // into frame as price runs toward them. The heat field is a superset of the
      // window, so it always paints edge-to-edge without driving the scale.
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const lv = levelsRef.current;
        const bars = barsRef.current;
        const chart = chartRef.current;
        let min = Infinity;
        let max = -Infinity;
        if (bars.length) {
          // Use the visible window only when it's a sane recent slice — on a
          // 0-width mount getVisibleLogicalRange briefly reports the whole history,
          // which would frame the scale to the entire month and cram today into a
          // sliver. In that case fall back to the last VISIBLE_BARS.
          const total = bars.length;
          const lr = chart?.timeScale().getVisibleLogicalRange();
          const sane =
            lr && lr.to > lr.from && lr.to - lr.from <= VISIBLE_BARS * 1.5 && lr.to >= total - VISIBLE_BARS * 1.5;
          const from = sane ? Math.max(0, Math.floor(lr.from)) : Math.max(0, total - VISIBLE_BARS);
          const to = sane ? Math.min(total - 1, Math.ceil(lr.to)) : total - 1;
          for (let i = from; i <= to; i++) {
            const b = bars[i];
            if (!b) continue;
            if (b.low < min) min = b.low;
            if (b.high > max) max = b.high;
          }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          const base = original();
          if (!base) {
            const xs = [lv.putWall, lv.callWall, lv.spot].filter(v => Number.isFinite(v));
            return { priceRange: { minValue: Math.min(...xs), maxValue: Math.max(...xs) } };
          }
          min = base.priceRange.minValue;
          max = base.priceRange.maxValue;
        }
        const band = (Number.isFinite(lv.spot) ? lv.spot : (min + max) / 2) * 0.003;
        for (const v of [lv.callWall, lv.putWall, lv.flip]) {
          if (Number.isFinite(v) && Math.abs(v - lv.spot) <= band) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        const pad = Math.max((max - min) * 0.12, (lv.spot || max) * 0.0022);
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

    const heat = new LiquidityHeatmapPrimitive(lut);
    candles.attachPrimitive(heat);
    const flow = new FlowPillsPrimitive();
    candles.attachPrimitive(flow);

    // Depth-at-cursor read-out: cursor → (price row, time column) in the book
    // grid. The axis crosshair already labels price/time; this adds the number
    // a book map exists for — how much is resting under the cursor.
    chart.subscribeCrosshairMove(param => {
      const el = readoutRef.current;
      if (!el) return;
      const bk = bookRef.current;
      const price = param.point ? candles.coordinateToPrice(param.point.y) : null;
      if (!param.point || param.logical == null || price == null || !bk || bk.cols === 0) {
        el.style.opacity = '0';
        return;
      }
      const bars = barsRef.current;
      const bi = Math.max(0, Math.min(bars.length - 1, Math.round(param.logical)));
      const span = bk.priceMax - bk.priceMin || 1;
      const rowF = ((price - bk.priceMin) / span) * (bk.rows - 1);
      const col = Math.max(0, Math.min(bk.cols - 1, Math.floor((param.logical - bk.firstBar) / bk.barsPerCol)));
      const depth =
        rowF >= 0 && rowF <= bk.rows - 1 ? bk.intensity[col * bk.rows + Math.round(rowF)] : 0;
      const when = bars[bi] ? new Date(bars[bi].time * 1000) : null;
      if (roPriceRef.current) roPriceRef.current.textContent = `$${price.toFixed(2)}`;
      if (roTimeRef.current)
        roTimeRef.current.textContent = when
          ? `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
          : '';
      if (roDepthRef.current) {
        const label = depth >= 0.65 ? 'deep shelf' : depth >= 0.3 ? 'moderate' : depth > 0.06 ? 'thin' : 'open';
        roDepthRef.current.textContent = `depth ${Math.round(depth * 100)}% · ${label}`;
        roDepthRef.current.style.color = depth >= 0.65 ? '#F0C45C' : depth >= 0.3 ? '#C89B3C' : '#7d7d7d';
      }
      el.style.opacity = '1';
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    heatRef.current = heat;
    flowRef.current = flow;

    return () => {
      cancelAnimationFrame(levelRafRef.current);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      heatRef.current = null;
      flowRef.current = null;
      wallLinesRef.current = {};
      dpLinesRef.current = [];
      flowLinesRef.current = [];
      focusLineRef.current = null;
      shownLevelsRef.current = null;
      loadedRef.current = { ticker: '', timeframe: '1m' };
    };
  }, [lut]);

  // Candle + volume data and the liquidity book: full load on ticker/timeframe
  // change, incremental per tick. The book re-simulates upstream (memoized) and
  // its baked bitmap is pushed to the primitive here.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const heat = heatRef.current;
    if (!candleSeries || !volumeSeries || !heat) return;
    if (bars.length === 0) return;

    barCountRef.current = bars.length;
    barsRef.current = bars;

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe;
    if (changed) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      // Flow-sweep prints are deterministic per ticker/day — rebuild only on a
      // symbol/timeframe switch, not every tick.
      sweepsRef.current = buildFlowSweeps(ticker, bars);
      flowRef.current?.setData(sweepsRef.current, overlays.flow);
      showRecent();
      // On a 0-width mount the range doesn't stick; re-apply once the chart has
      // been laid out so the compact tile opens on the recent session, not zoomed
      // out to the whole month.
      requestAnimationFrame(() => requestAnimationFrame(() => showRecent()));
      loadedRef.current = { ticker, timeframe };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
    }

    heat.setData(book, overlays.liquidity);
    bookRef.current = book;
  }, [ticker, timeframe, overlays.liquidity, overlays.flow, bars, book, showRecent]);

  // Volume strip visibility
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  // Flow-sweep pills on/off (data is rebuilt with the candles above)
  useEffect(() => {
    flowRef.current?.setData(sweepsRef.current, overlays.flow);
  }, [overlays.flow]);

  // Wall / flip structure lines — create/destroy on toggle or ticker
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    cancelAnimationFrame(levelRafRef.current);
    for (const spec of LEVEL_SPEC) {
      const line = wallLinesRef.current[spec.key];
      if (line) candleSeries.removePriceLine(line);
      delete wallLinesRef.current[spec.key];
    }
    shownLevelsRef.current = null;

    if (overlays.walls) {
      const L = levelsRef.current;
      const vis = labelVisibility(L);
      for (const spec of LEVEL_SPEC) {
        wallLinesRef.current[spec.key] = candleSeries.createPriceLine({
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
  }, [overlays.walls, ticker]);

  // Tween wall prices to their new scan values — lines glide, never teleport
  useEffect(() => {
    const lines = wallLinesRef.current;
    if (!lines.callWall) return; // walls hidden

    const vis = labelVisibility(levels);
    for (const spec of LEVEL_SPEC) lines[spec.key]?.applyOptions({ axisLabelVisible: vis[spec.key] });

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
  }, [levels, overlays.walls, ticker]);

  // Dark-pool shelves — teal dashed reference lines (top shelves by notional)
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    for (const line of dpLinesRef.current) candleSeries.removePriceLine(line);
    dpLinesRef.current = [];
    if (!overlays.darkpool || !darkPoolLevels?.length) return;
    const top = [...darkPoolLevels].sort((a, b) => b.notional - a.notional).slice(0, 3);
    for (const lv of top) {
      dpLinesRef.current.push(
        candleSeries.createPriceLine({
          price: lv.price,
          color: DARK_POOL,
          title: 'DP',
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
        })
      );
    }
  }, [darkPoolLevels, overlays.darkpool, ticker]);

  // VWAP + point-of-control reference lines
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    for (const line of flowLinesRef.current) candleSeries.removePriceLine(line);
    flowLinesRef.current = [];
    if (!overlays.vwap || !orderFlow) return;
    if (Number.isFinite(orderFlow.vwap)) {
      flowLinesRef.current.push(
        candleSeries.createPriceLine({
          price: orderFlow.vwap,
          color: SPOT,
          title: 'VWAP',
          lineStyle: LineStyle.Solid,
          lineWidth: 1,
          axisLabelVisible: true,
        })
      );
    }
    if (Number.isFinite(orderFlow.poc)) {
      flowLinesRef.current.push(
        candleSeries.createPriceLine({
          price: orderFlow.poc,
          color: '#9aa0aa',
          title: 'POC',
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          axisLabelVisible: true,
        })
      );
    }
  }, [orderFlow, overlays.vwap, ticker]);

  // Transient FOCUS line — "what you clicked"
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
        <span className="flex items-center gap-1.5 font-mono text-micro text-textSecondary">
          <span
            className="inline-block w-4 h-2 rounded-sm"
            style={{ background: 'linear-gradient(to right, rgba(110,74,16,0.5), #F0C45C)' }}
          />
          Resting liquidity
        </span>
        <ChartLegend
          variant="line"
          items={[
            { label: 'Call Wall', swatchClass: 'bg-bull' },
            { label: 'Put Wall', swatchClass: 'bg-bear' },
            { label: 'Dark Pool', color: DARK_POOL },
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
        <div ref={containerRef} className="absolute inset-0" />
        <div
          ref={readoutRef}
          aria-hidden
          className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-2 rounded border border-borderSubtle bg-panel/85 px-2 py-1 font-mono text-micro opacity-0 transition-opacity"
        >
          <span ref={roPriceRef} className="text-textPrimary tnum" />
          <span ref={roTimeRef} className="text-textMuted tnum" />
          <span ref={roDepthRef} className="tnum" />
        </div>
      </div>
    </div>
  );
};

export default LiquidityHeatmapChart;
