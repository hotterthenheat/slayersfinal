import { useCallback, useEffect, useRef } from 'react';
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
import type { Candle } from '../../types/market';
import type { KeyLevels, OverlayMode } from '../../types/gex';

interface StrikeChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  overlay: OverlayMode;
  timeframe: Timeframe;
  height?: number;
  /** Transient user-focused price — renders a cyan FOCUS line while set */
  focusPrice?: number | null;
}

// Wall / flip / king overlay colors (independent of candle theme)
import { CALL_WALL, PUT_WALL, FLIP, KING, FOCUS } from './palette';

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
const StrikeChart = ({ ticker, revision, levels, overlay, timeframe, height = 460, focusPrice = null }: StrikeChartProps) => {
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

  // Keep the autoscale provider reading the freshest levels without re-mounting
  levelsRef.current = levels;

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
      rightPriceScale: { borderColor: '#1c1c1c' },
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
  }, []);

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
      loadedRef.current = { ticker, timeframe };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
    }

    // Node overlay is intraday-only
    const showNodes = (overlay === 'NODES' || overlay === 'BOTH') && mins <= INTRADAY_MAX_MINUTES;
    nodes.setData(snaps, maxAbs, showNodes);
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
      for (const spec of LEVEL_SPEC) {
        levelLinesRef.current[spec.key] = candleSeries.createPriceLine({
          price: L[spec.key],
          color: spec.color,
          title: spec.title,
          lineStyle: spec.style,
          lineWidth: spec.width,
          axisLabelVisible: true,
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
        {[
          { label: 'Call Wall', cls: 'bg-bull' },
          { label: 'Put Wall', cls: 'bg-bear' },
          { label: 'Flip', cls: 'bg-flip' },
          { label: 'King', cls: 'bg-king' },
          { label: '+GEX node', color: heatPoles.pos },
          { label: '−GEX node', color: heatPoles.neg },
        ].map((item: { label: string; cls?: string; color?: string }) => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-[10px] text-textSecondary">
            <span
              className={`inline-block w-3 h-0.5 rounded-full ${item.cls ?? ''}`}
              style={item.color ? { background: item.color } : undefined}
            />
            {item.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-textMuted uppercase tracking-wider">
          scroll zoom · drag pan · dbl-click reset
        </span>
        <button
          onClick={resetView}
          title="Reset view (or double-click the chart)"
          className="inline-flex items-center gap-1.5 border border-borderSubtle hover:border-borderMuted bg-panel rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
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

export default StrikeChart;
