import { useCallback, useEffect, useMemo, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import { candleTheme } from '../gex/candleTheme';
import { CALL_WALL, PUT_WALL, FLIP, FOCUS } from '../gex/palette';
import { SwingPrimitive } from './swingPrimitive';
import { buildSwingModel, type SwingModel } from '../../data/swingModel';
import type { Candle } from '../../types/market';

interface SwingMapChartProps {
  ticker: string;
  spot: number;
  /** Bumped every tick; used only to seed the model, not to churn the daily bars */
  revision?: number;
  height?: number;
  focusPrice?: number | null;
  /** Unix seconds "now" — passed so the deterministic daily series is stable */
  nowSec?: number;
}

const toCandle = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
});

/**
 * Daily swing chart — the price-estimation read a swing trader draws by hand:
 * resistance / support zones, a trend rail, and a measured-move projection arrow
 * with its percent target, on a TradingView-grade candle chart. The daily series
 * is deterministic per ticker and ends at the live spot.
 */
const SwingMapChart = ({ ticker, spot, height = 300, focusPrice = null, nowSec }: SwingMapChartProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const swingRef = useRef<SwingPrimitive | null>(null);
  const zoneLinesRef = useRef<IPriceLine[]>([]);
  const focusLineRef = useRef<IPriceLine | null>(null);
  const modelRef = useRef<SwingModel | null>(null);
  const loadedTickerRef = useRef('');

  // Stable per ticker — the intraday tick shouldn't redraw a daily chart. The
  // model anchors its last close to the spot captured on (re)build.
  const now = useMemo(() => nowSec ?? Math.floor(Date.now() / 1000), [nowSec]);
  const model = useMemo(
    () => buildSwingModel(ticker, spot, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticker, now]
  );
  modelRef.current = model;

  const showRecent = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const len = modelRef.current?.bars.length ?? 0;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - 120), to: len + 3 });
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
      rightPriceScale: { borderColor: '#1c1c1c', mode: PriceScaleMode.Normal },
      timeScale: { borderColor: '#1c1c1c', timeVisible: false, secondsVisible: false, rightOffset: 3, barSpacing: 6 },
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
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const m = modelRef.current;
        if (!base) return null;
        let min = base.priceRange.minValue;
        let max = base.priceRange.maxValue;
        if (m) {
          for (const v of [m.support.lo, m.resistance.hi, m.projection.to]) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        const pad = Math.max((max - min) * 0.06, 0.01);
        return { priceRange: { minValue: min - pad, maxValue: max + pad } };
      },
    });
    const swing = new SwingPrimitive();
    candles.attachPrimitive(swing);
    chartRef.current = chart;
    candleSeriesRef.current = candles;
    swingRef.current = swing;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      swingRef.current = null;
      zoneLinesRef.current = [];
      focusLineRef.current = null;
      loadedTickerRef.current = '';
    };
  }, []);

  // Load the daily series + swing model
  useEffect(() => {
    const candles = candleSeriesRef.current;
    const swing = swingRef.current;
    if (!candles || !swing) return;

    const changed = loadedTickerRef.current !== ticker;
    candles.setData(model.bars.map(toCandle));
    swing.setData(model, true);

    // zone axis labels
    for (const line of zoneLinesRef.current) candles.removePriceLine(line);
    // Zone axis labels only — the projection TARGET always coincides with a zone
    // (the arrow points at one), so a separate TARGET line just stacks a
    // redundant axis pill. The arrow + its % pill already read the target.
    zoneLinesRef.current = [
      candles.createPriceLine({ price: model.resistance.mid, color: PUT_WALL, title: 'RESIST', lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true }),
      candles.createPriceLine({ price: model.support.mid, color: CALL_WALL, title: 'SUPPORT', lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true }),
    ];

    if (changed) {
      showRecent();
      requestAnimationFrame(() => requestAnimationFrame(() => showRecent()));
      loadedTickerRef.current = ticker;
    }
  }, [model, ticker, showRecent]);

  // Transient FOCUS line
  useEffect(() => {
    const candles = candleSeriesRef.current;
    if (!candles) return;
    if (focusLineRef.current) {
      candles.removePriceLine(focusLineRef.current);
      focusLineRef.current = null;
    }
    if (focusPrice != null) {
      focusLineRef.current = candles.createPriceLine({
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
          { label: 'Resistance', cls: 'bg-bear' },
          { label: 'Support', cls: 'bg-bull' },
          { label: 'Trend', color: '#E0B84E' },
          { label: 'Proj. move', color: FLIP },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5 font-mono text-micro text-textSecondary">
            <span className={`inline-block w-3 h-0.5 rounded-full ${item.cls ?? ''}`} style={item.color ? { background: item.color } : undefined} />
            {item.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-micro text-textMuted uppercase tracking-wider hidden sm:inline">daily · swing targets</span>
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

export default SwingMapChart;
