import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { CALL_WALL, PUT_WALL, FLIP, KING, DARK_POOL, FOCUS, SPOT } from '../gex/palette';
import { LiquidityHeatmapPrimitive } from './liquidityHeatmapPrimitive';
import { makeLiquidityLUT, type LiquidityField } from '../../data/liquidityField';
import type { Candle } from '../../types/market';
import type { KeyLevels } from '../../types/gex';
import type { LiqDPLevel, LiqOverlays } from './liquidityTypes';

interface LiquidityHeatmapChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  /** Resting-liquidity profile painted behind the candles */
  field: LiquidityField;
  overlays: LiqOverlays;
  darkPoolLevels?: LiqDPLevel[];
  /** Session VWAP & point-of-control for the reference lines */
  orderFlow?: { vwap: number; poc: number };
  timeframe?: Timeframe;
  height?: number;
  focusPrice?: number | null;
}

// Wall / flip / king structure lines. Same grammar as the Live Chart so the two
// read as one system — green call wall, red put wall, baby-blue flip, magenta king.
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

// One axis pill per price — walls claim it first, then king, then flip — so
// coincident levels don't stack into an unreadable overlap. (Same rule as the
// Live Chart; the full breakdown still lives in the Key Levels panel.)
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
 * TradingView-style liquidity chart: real candles + volume with the resting-
 * liquidity heat field painted behind them, dealer-structure walls, dark-pool
 * shelves and VWAP/POC as native price lines. Created once; ticks arrive as
 * series.update(); full setData only on ticker/timeframe change. Pan/zoom is
 * never fought — the field re-anchors to price every frame.
 */
const LiquidityHeatmapChart = ({
  ticker,
  revision,
  levels,
  field,
  overlays,
  darkPoolLevels,
  orderFlow,
  timeframe = '1m',
  height = 320,
  focusPrice = null,
}: LiquidityHeatmapChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const heatRef = useRef<LiquidityHeatmapPrimitive | null>(null);

  const wallLinesRef = useRef<Partial<Record<'callWall' | 'putWall' | 'flip' | 'king', IPriceLine>>>({});
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
  const lut = useMemo(() => makeLiquidityLUT(), []);

  const VISIBLE_BARS = 130;
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
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
      },
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
      // Keep the whole liquidity window (which spans the walls) on screen so the
      // shelves line up with the candles rather than just the couple around spot.
      // Frame the candles exactly like the Live Chart: the real price range unioned
      // with the walls & spot. The heat field is a SUPERSET of this window, so it
      // always paints edge-to-edge — but it never drives the scale (that would
      // stretch the candles into a sliver). King / far nodes stay out on purpose.
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const lv = levelsRef.current;
        const extras = [lv.putWall, lv.callWall, lv.spot].filter(v => Number.isFinite(v));
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

    const heat = new LiquidityHeatmapPrimitive(lut);
    candles.attachPrimitive(heat);

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    heatRef.current = heat;

    return () => {
      cancelAnimationFrame(levelRafRef.current);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      heatRef.current = null;
      wallLinesRef.current = {};
      dpLinesRef.current = [];
      flowLinesRef.current = [];
      focusLineRef.current = null;
      shownLevelsRef.current = null;
      loadedRef.current = { ticker: '', timeframe: '1m' };
    };
  }, [lut]);

  // Candle + volume data and the heat field: full load on ticker/timeframe change,
  // incremental per tick. The field re-blends upstream (memoized) and is pushed here.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const heat = heatRef.current;
    if (!candleSeries || !volumeSeries || !heat) return;

    const base = Simulator.getCandles(ticker);
    if (!base || base.length === 0) return;

    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(base, mins);
    barCountRef.current = bars.length;

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe;
    if (changed) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      showRecent();
      loadedRef.current = { ticker, timeframe };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
    }

    heat.setData(field, overlays.liquidity);
  }, [ticker, revision, timeframe, overlays.liquidity, field, showRecent]);

  // Volume strip visibility
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  // Wall / flip / king structure lines — create/destroy on toggle or ticker
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
    const top = [...darkPoolLevels].sort((a, b) => b.notional - a.notional).slice(0, 5);
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
            style={{ background: 'linear-gradient(to right, rgba(58,67,86,0.5), #c6d0e6)' }}
          />
          Resting liquidity
        </span>
        {[
          { label: 'Call Wall', cls: 'bg-bull' },
          { label: 'Put Wall', cls: 'bg-bear' },
          { label: 'Dark Pool', color: DARK_POOL },
        ].map((item: { label: string; cls?: string; color?: string }) => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-micro text-textSecondary">
            <span
              className={`inline-block w-3 h-0.5 rounded-full ${item.cls ?? ''}`}
              style={item.color ? { background: item.color } : undefined}
            />
            {item.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-wider hidden sm:inline">
          scroll zoom · drag pan · dbl-click reset
        </span>
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
      </div>
    </div>
  );
};

export default LiquidityHeatmapChart;
