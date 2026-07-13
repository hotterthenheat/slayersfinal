import { useCallback, useEffect, useRef } from 'react';
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
import { candleTheme } from './candleTheme';
import type { DarkPoolPrint } from '../../types/gex';

interface MiniPaneProps {
  ticker: string;
  spot: number;
  changePercent: number;
  prints: DarkPoolPrint[];
  /** Bumped every simulator tick */
  revision: number;
}

const UP = candleTheme.up;
const DOWN = candleTheme.down;

/** Compact candlestick pane with dark-pool print levels. Same smoothness contract as StrikeChart. */
const MiniPane = ({ ticker, spot, changePercent, prints, revision }: MiniPaneProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const printLinesRef = useRef<IPriceLine[]>([]);
  const loadedRef = useRef<{ ticker: string; length: number }>({ ticker: '', length: 0 });

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    chart.timeScale().fitContent();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#5a5a5a',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 4 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      printLinesRef.current = [];
      loadedRef.current = { ticker: '', length: 0 };
    };
  }, []);

  // Candles — incremental per tick
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const bars = Simulator.getCandles(ticker);
    if (!bars || bars.length === 0) return;

    const toCandle = (b: (typeof bars)[number]) => ({
      time: b.time as UTCTimestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    });
    const toVolume = (b: (typeof bars)[number]) => ({
      time: b.time as UTCTimestamp,
      value: b.volume,
      color: b.close >= b.open ? candleTheme.volUp : candleTheme.volDown,
    });

    const loaded = loadedRef.current;
    if (loaded.ticker !== ticker || Math.abs(bars.length - loaded.length) > 1) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      if (loaded.ticker !== ticker) {
        const len = bars.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - 90), to: len + 3 });
      }
      loadedRef.current = { ticker, length: bars.length };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
      loaded.length = bars.length;
    }
  }, [ticker, revision]);

  // Dark-pool print levels — context, not live structure: white line, dark ink
  // on the axis chip. Teal stays the dark-pool identity in tables only.
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries) return;
    for (const line of printLinesRef.current) candleSeries.removePriceLine(line);
    printLinesRef.current = prints.map(print =>
      candleSeries.createPriceLine({
        price: print.price,
        color: 'rgba(237,237,237,0.65)',
        title: `DP $${print.notional.toFixed(2)}B · ${print.date}`,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        axisLabelColor: '#ededed',
        axisLabelTextColor: '#0a0a0a',
      })
    );
  }, [prints]);

  const up = changePercent >= 0;

  return (
    <div className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-2.5 h-8 border-b border-borderSubtle shrink-0 select-none">
        <span className="font-mono text-[11px] font-bold text-textPrimary">{ticker}</span>
        <span className="font-mono text-[11px] font-semibold text-textPrimary tnum">${spot.toFixed(2)}</span>
        <span className={`font-mono text-[10px] tnum ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? '+' : ''}
          {changePercent.toFixed(2)}%
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-textSecondary uppercase tracking-wider">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-textPrimary" /> dark pool
        </span>
      </div>
      <div className="relative h-[248px]" onDoubleClick={resetView} title="Double-click to reset view">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

export default MiniPane;
