import { useCallback, useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
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
import Feed from '../../core/feed';
import { DARK_POOL } from './palette';
import { getCandleTheme, useCandleThemeKey, candleSeriesOptions, chartSurface } from './candleTheme';
import TickerQuickPick from './TickerQuickPick';
import type { DarkPoolPrint } from '../../types/gex';

interface MiniPaneProps {
  ticker: string;
  spot: number;
  changePercent: number;
  prints: DarkPoolPrint[];
  /** Bumped every simulator tick */
  revision: number;
  /** When set, the header ticker becomes a switcher (presets + free entry) */
  onChangeTicker?: (ticker: string) => void;
  /** When set, an expand button lifts this pane into the fullscreen chart */
  onExpand?: () => void;
}

/** Compact candlestick pane with dark-pool print levels. Same smoothness contract as StrikeChart. */
const MiniPane = ({ ticker, spot, changePercent, prints, revision, onChangeTicker, onExpand }: MiniPaneProps) => {
  const themeKey = useCandleThemeKey();
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

    const s0 = chartSurface(getCandleTheme());
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: s0.bg },
        textColor: '#5a5a5a',
        fontFamily: "'SF Pro', sans-serif",
        fontSize: 9,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: s0.grid } },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 4 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      ...candleSeriesOptions(getCandleTheme()),
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

  // Theme swap: recolor the candle series in place and repaint volume bars in
  // the new palette — without touching load bookkeeping, so the view never jumps.
  useEffect(() => {
    const t = getCandleTheme();
    candleRef.current?.applyOptions(candleSeriesOptions(t));
    const s = chartSurface(t);
    chartRef.current?.applyOptions({
      layout: { background: { color: s.bg } },
      grid: { horzLines: { color: s.grid } },
    });
    const bars = Feed.getCandles(ticker);
    if (bars && bars.length > 0 && volumeRef.current) {
      volumeRef.current.setData(
        bars.map(b => ({
          time: b.time as UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? t.volUp : t.volDown,
        }))
      );
    }
  }, [themeKey, ticker]);

  // Candles — incremental per tick
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const bars = Feed.getCandles(ticker);
    if (!bars || bars.length === 0) return;

    const theme = getCandleTheme();
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
      color: b.close >= b.open ? theme.volUp : theme.volDown,
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

  // Dark-pool print levels — teal, the app-wide dark-pool identity (matches
  // StrikeChart's DP overlay). The old 65% white whisper vanished against the
  // candles (Noah, 2026-08-18).
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries) return;
    for (const line of printLinesRef.current) candleSeries.removePriceLine(line);
    printLinesRef.current = prints.map(print =>
      candleSeries.createPriceLine({
        price: print.price,
        color: DARK_POOL,
        title: `DP $${print.notional.toFixed(2)}B · ${print.date}`,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        axisLabelColor: DARK_POOL,
        axisLabelTextColor: '#0a0a0a',
      })
    );
  }, [prints]);

  const up = changePercent >= 0;

  return (
    <div className="border border-borderSubtle bg-panel rounded-md overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-2.5 h-8 border-b border-borderSubtle shrink-0 select-none">
        {onChangeTicker ? (
          <TickerQuickPick ticker={ticker} onPick={onChangeTicker} />
        ) : (
          <span className="font-mono text-[11px] font-bold text-textPrimary">{ticker}</span>
        )}
        <span className="font-mono text-[11px] font-semibold text-textPrimary tnum">${spot.toFixed(2)}</span>
        <span className={`font-mono text-[10px] tnum ${up ? 'text-bull' : 'text-bear'}`}>
          {up ? '+' : ''}
          {changePercent.toFixed(2)}%
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-textSecondary uppercase tracking-wider">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-textPrimary" /> dark pool
        </span>
        {onExpand && (
          <button
            onClick={onExpand}
            title="Expand — full chart with overlays & timeframes"
            className="p-1 -mr-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="relative h-[248px]" onDoubleClick={resetView} title="Double-click to reset view">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

export default MiniPane;
