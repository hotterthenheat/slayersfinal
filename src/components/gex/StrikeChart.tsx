import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Eraser, Minus, Pause, Play, RotateCcw, StepBack, StepForward, TrendingUp, X } from 'lucide-react';
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
import {
  aggregateCandles,
  aggregateSnapshots,
  snapshotsMaxAbs,
  tfMinutes,
  INTRADAY_MAX_MINUTES,
  type Timeframe,
} from '../../data/timeframe';
import { GexTrailsPrimitive } from './gexNodesPrimitive';
import { DrawingsPrimitive, loadDrawings, saveDrawings, type Drawing, type DrawingKind } from './drawingsPrimitive';
import { getCandleTheme, useCandleThemeKey, candleSeriesOptions, chartSurface, type CandleTheme } from './candleTheme';
import type { Candle } from '../../types/market';
import type { DarkPoolPrint, KeyLevels } from '../../types/gex';

/** What the user chose to draw — every overlay is independent. */
export interface ChartOverlays {
  trails: boolean;
  levels: boolean;
  darkpool: boolean;
  volume: boolean;
}

export const DEFAULT_OVERLAYS: ChartOverlays = {
  trails: true,
  levels: true,
  darkpool: false,
  volume: true,
};

interface StrikeChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  timeframe: Timeframe;
  height?: number;
  /** Transient user-focused price — renders a cyan FOCUS line while set */
  focusPrice?: number | null;
  overlays?: ChartOverlays;
  /** Dark-pool prints for the DP overlay (whisper lines, MiniPane grammar) */
  prints?: DarkPoolPrint[];
  /** Draw mode — pointer sketches trendlines/levels instead of panning */
  drawing?: boolean;
  onExitDraw?: () => void;
  /** Replay mode — scrub through history bar by bar, trails included */
  replay?: boolean;
  onExitReplay?: () => void;
}

// Wall / flip / king overlay colors (independent of candle theme)
import { CALL_WALL, PUT_WALL, FLIP, KING, FOCUS, DARK_POOL } from './palette';

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
const toVolume = (b: Candle, t: CandleTheme) => ({
  time: b.time as UTCTimestamp,
  value: b.volume,
  color: b.close >= b.open ? t.volUp : t.volDown,
});

/** The field's clock: a bead every 5 minutes of real history, whatever the bar —
    a 30m bar carries six, an hour twelve (Noah, 2026-08-22). */
const TRAIL_TEXTURE_MINUTES = 5;

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
  timeframe,
  height = 460,
  focusPrice = null,
  overlays = DEFAULT_OVERLAYS,
  prints = [],
  drawing = false,
  onExitDraw,
  replay = false,
  onExitReplay,
}: StrikeChartProps) => {
  const themeKey = useCandleThemeKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const trailsRef = useRef<GexTrailsPrimitive | null>(null);
  const printLinesRef = useRef<IPriceLine[]>([]);
  const levelLinesRef = useRef<Partial<Record<'callWall' | 'putWall' | 'flip' | 'king', IPriceLine>>>({});
  const shownLevelsRef = useRef<KeyLevels | null>(null);
  const levelRafRef = useRef(0);
  const levelTickerRef = useRef('');
  const focusLineRef = useRef<IPriceLine | null>(null);
  /** The focus price, readable from the autoscale provider (a closure built
      once at chart creation) — a focused strike must never sit off-screen. */
  const focusPriceRef = useRef<number | null>(focusPrice);
  const levelsRef = useRef<KeyLevels>(levels);
  const barCountRef = useRef(0);
  const loadedRef = useRef<{ ticker: string; timeframe: Timeframe; theme: string }>({
    ticker: '',
    timeframe: '1m',
    theme: '',
  });

  // ---- drawing state ----
  const drawingsRef = useRef<DrawingsPrimitive | null>(null);
  const shapesRef = useRef<Drawing[]>([]);
  const dragRef = useRef<Drawing | null>(null);
  const [drawTool, setDrawTool] = useState<DrawingKind>('trend');

  // ---- replay state ----
  const replayRef = useRef(false); // effect-visible mirror of the replay prop
  const replayDataRef = useRef<{ bars: Candle[]; snaps: ReturnType<typeof aggregateSnapshots>; maxAbs: number } | null>(null);
  const replayAppliedRef = useRef(0); // last idx applied to the series (for the fast append path)
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(2);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Keep the autoscale provider reading the freshest levels without re-mounting
  levelsRef.current = levels;

  /* The default view on a new world (ticker or timeframe): as many bars as
     the chart can hold at a DENSE pitch, not a fixed 130 (Noah, 2026-08-22:
     130 bars on a wide screen spread to ~10px and the ribbons ballooned;
     the view he wants is the one where bars sit at ~4px and the field reads
     as texture). Width-aware, so a docked panel and the fullscreen takeover
     each get the pitch, not the count. */
  /* The bar pitch the default view lands on, per timeframe (Noah,
     2026-08-22, tuned against his own screenshots): 5m reads right at ~4px,
     15m at ~6.5 — coarser bars earn more room, so a wider frame shows fewer
     of them and the recent structure stays legible. */
  const DEFAULT_PITCH_PX: Record<Timeframe, number> = { '1m': 3.5, '5m': 4, '15m': 6.5, '30m': 8, '1h': 10, '1D': 14, '1W': 18 };
  /* History takes ~64% of the width; the rest stays OPEN ahead of the last
     bar (Noah, 2026-08-22: "more spacious... pay more attention to what's
     ahead / current time" — a window crammed with five prior sessions put
     the present at the right edge). */
  const HISTORY_SHARE = 0.64;
  const timeframeRef = useRef<Timeframe>(timeframe);
  timeframeRef.current = timeframe;
  const showRecent = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const len = barCountRef.current;
    const width = containerRef.current?.clientWidth ?? 1200;
    const pitch = DEFAULT_PITCH_PX[timeframeRef.current] ?? 4;
    const total = Math.max(90, Math.min(700, Math.round(width / pitch)));
    const history = Math.round(total * HISTORY_SHARE);
    const ahead = total - history;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - history), to: len + ahead });
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

    const s0 = chartSurface(getCandleTheme());
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: s0.bg },
        textColor: '#7d7d7d', // matches textMuted (lifted 2026-07-25 for legibility)
        fontFamily: "'SF Pro', sans-serif",
        fontSize: 10,
        attributionLogo: true,
      },
      // No grid (Noah, 2026-08-22): the nodes and the levels ARE the
      // structure; a grid behind them competes with the ribbons
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
      },
    });

    const t0 = getCandleTheme();
    const candles = chart.addSeries(CandlestickSeries, {
      ...candleSeriesOptions(t0),
      priceLineVisible: true,
      priceLineColor: 'rgba(237,237,237,0.4)',
      priceLineStyle: LineStyle.Dotted,
      // Widen the visible price range to always include the walls/king so several
      // strike-node bands are on screen, not just the couple around spot — and
      // the FOCUS strike, when one is set (a strike sent here to be SEEN
      // cannot be off-screen; Noah, 2026-08-22).
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const lv = levelsRef.current;
        const extras = [lv.putWall, lv.callWall, lv.king, lv.spot, focusPriceRef.current ?? NaN].filter(v => Number.isFinite(v));
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

    const trails = new GexTrailsPrimitive();
    candles.attachPrimitive(trails);
    const drawingsPrim = new DrawingsPrimitive();
    candles.attachPrimitive(drawingsPrim);

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    trailsRef.current = trails;
    drawingsRef.current = drawingsPrim;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      trailsRef.current = null;
      drawingsRef.current = null;
      printLinesRef.current = [];
      levelLinesRef.current = {};
      shownLevelsRef.current = null;
      cancelAnimationFrame(levelRafRef.current);
      loadedRef.current = { ticker: '', timeframe: '1m', theme: '' };
    };
  }, []);

  // Volume overlay toggle — series stays mounted, just hides
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  // Recolor the candle series AND the chart surface in place when the theme
  // picker changes — gallery themes carry their own background tint.
  useEffect(() => {
    const t = getCandleTheme();
    candleSeriesRef.current?.applyOptions(candleSeriesOptions(t));
    const s = chartSurface(t);
    chartRef.current?.applyOptions({
      layout: { background: { color: s.bg } },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    });
  }, [themeKey]);

  // Candle data + trails: full load on ticker/timeframe/theme change, incremental
  // per tick (theme forces a reload because volume bars carry per-bar colors)
  useEffect(() => {
    if (replayRef.current) return; // replay owns the series while active
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const trails = trailsRef.current;
    if (!chart || !candleSeries || !volumeSeries || !trails) return;

    const base = Feed.getCandles(ticker);
    if (!base || base.length === 0) return;

    const theme = getCandleTheme();
    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(base, mins);
    barCountRef.current = bars.length;
    drawingsRef.current?.setBarTimes(bars.map(b => b.time));

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe || loaded.theme !== themeKey;
    const newWorld = loaded.ticker !== ticker || loaded.timeframe !== timeframe;

    if (changed) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(b => toVolume(b, theme)));
      if (newWorld) {
        showRecent(); // theme swaps must not yank the user's pan/zoom
        /* A timeframe change BREATHES in (Noah, 2026-08-22: "should have a
           smooth transition, not quick"): the new world lands at zero and
           fades up on the house curve. Ticker changes are keyed by the host
           and already soft-fade; the first load is not a transition. */
        const el = containerRef.current;
        if (el && loaded.ticker === ticker) {
          el.style.transition = 'none';
          el.style.opacity = '0';
          // Lift on the next frame — or a timer, whichever comes first: a
          // background tab gets no frames, and a chart must never stay dark
          let lifted = false;
          const lift = () => {
            if (lifted) return;
            lifted = true;
            el.style.transition = 'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1)';
            el.style.opacity = '1';
          };
          requestAnimationFrame(lift);
          window.setTimeout(lift, 40);
        }
      }
      loadedRef.current = { ticker, timeframe, theme: themeKey };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last, theme));
    }

    // LED trails are intraday-only — dailies would smear the session structure.
    // The field keeps a FINER clock than the bars (Noah, 2026-08-22: one bead
    // per 30m/1h bar was a row of pearls): every 5 minutes of real history
    // is a bead, tiled across its bar by its time — six to a 30m bar, twelve
    // to an hour. More beads, same data.
    const baseGex = Feed.getGexHistory(ticker);
    const snaps = aggregateSnapshots(baseGex ?? [], Math.min(mins, TRAIL_TEXTURE_MINUTES));
    const showTrails = overlays.trails && mins <= INTRADAY_MAX_MINUTES;
    trails.setData(snaps, snapshotsMaxAbs(snaps), showTrails, mins * 60);
  }, [ticker, revision, timeframe, themeKey, overlays.trails, showRecent, reloadNonce]);

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

    // Levels are LIVE values — hidden during replay so history isn't lied about
    if (!overlays.levels || replay) return;

    // Chips, not lines: the level lives as a colored tag on the price axis.
    // Hovering its legend chip flashes the full line for orientation.
    const L = levelsRef.current;
    for (const spec of LEVEL_SPEC) {
      levelLinesRef.current[spec.key] = candleSeries.createPriceLine({
        price: L[spec.key],
        color: spec.color,
        title: spec.title,
        lineStyle: spec.style,
        lineWidth: spec.width,
        lineVisible: false,
        axisLabelVisible: true,
      });
    }
    shownLevelsRef.current = { ...L };
    levelTickerRef.current = ticker;
  }, [ticker, overlays.levels, replay]);

  // Dark-pool whisper lines — same grammar as the flow board minis
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    for (const line of printLinesRef.current) candleSeries.removePriceLine(line);
    printLinesRef.current = [];
    if (!overlays.darkpool || replay) return;
    // Teal, the app-wide dark-pool ink (Live Tape dot, landing accent) — the
    // old 65% white whisper vanished against the candles (Noah, 2026-08-18).
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
  }, [prints, overlays.darkpool, replay]);

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
  }, [levels, ticker]);

  // Transient FOCUS line — "what you clicked", drawn via the chart's native API
  useEffect(() => {
    focusPriceRef.current = focusPrice;
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    if (focusLineRef.current) {
      candleSeries.removePriceLine(focusLineRef.current);
      focusLineRef.current = null;
    }
    if (focusPrice != null) {
      // With the trails drawn, the painted band IS the focus — a line across
      // the whole tape under it read as a smear joining the band to the label
      // (Noah, 2026-08-22). The axis label stays; the line only returns when
      // no band can be drawn (overlay off, or a timeframe above intraday).
      const trailsDrawn = overlays.trails && tfMinutes(timeframe) <= INTRADAY_MAX_MINUTES;
      focusLineRef.current = candleSeries.createPriceLine({
        price: focusPrice,
        // The ink at creation too — a trails toggle recreates the line, and
        // the ink effect below only re-runs when the focus or the king moves
        color: Math.abs(levelsRef.current.king - focusPrice) < 1e-9 ? KING : FOCUS,
        title: 'FOCUS',
        lineVisible: !trailsDrawn,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        axisLabelVisible: true,
      });
    }
    // Re-run autoscale now, not on the next tick — the provider above reads
    // the new focus and brings the line into frame immediately.
    candleSeries.priceScale().applyOptions({ autoScale: true });
  }, [focusPrice, overlays.trails, timeframe]);

  /* The focus INK follows the strike's standing, re-read every scan: magenta
     while the focused strike is the king, lime otherwise. The focus itself
     never moves — if 510 loses the crown, 510 turns lime and stays (Noah,
     2026-08-22); the new king keeps its own line. Line and trail agree. */
  useEffect(() => {
    const isKing = focusPrice != null && Math.abs(levels.king - focusPrice) < 1e-9;
    trailsRef.current?.setFocus(focusPrice, isKing ? 'king' : 'focus');
    trailsRef.current?.setKing(Number.isFinite(levels.king) ? levels.king : null);
    focusLineRef.current?.applyOptions({ color: isKing ? KING : FOCUS });
  }, [focusPrice, levels.king]);

  // ---- replay lifecycle -----------------------------------------------------
  // Enter: snapshot the aggregated world and rewind. Exit: hand the series
  // back to the live effect (reloadNonce forces a full refresh).
  useEffect(() => {
    replayRef.current = replay;
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    if (replay) {
      const mins = tfMinutes(timeframe);
      const bars = aggregateCandles(Feed.getCandles(ticker) ?? [], mins);
      const snaps = aggregateSnapshots(Feed.getGexHistory(ticker) ?? [], Math.min(mins, TRAIL_TEXTURE_MINUTES));
      if (bars.length < 40) return;
      replayDataRef.current = { bars, snaps, maxAbs: snapshotsMaxAbs(snaps) };
      const startIdx = Math.max(30, bars.length - 180);
      replayAppliedRef.current = 0;
      setReplayIdx(startIdx);
      setReplaySpeed(2);
      setReplayPlaying(true);
      chart.timeScale().setVisibleLogicalRange({ from: startIdx - 110, to: startIdx + 10 });
    } else {
      replayDataRef.current = null;
      setReplayPlaying(false);
      loadedRef.current = { ticker: '', timeframe: '1m', theme: '' };
      setReloadNonce(n => n + 1);
    }
  }, [replay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ticker/timeframe switches end the replay — it was recorded in another world
  useEffect(() => {
    if (replayRef.current) onExitReplay?.();
  }, [ticker, timeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the current replay position to the series (append fast-path when
  // stepping forward one bar; full slice on scrubs/jumps).
  useEffect(() => {
    if (!replay) return;
    const data = replayDataRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const trails = trailsRef.current;
    if (!data || !candleSeries || !volumeSeries || !trails) return;

    // replayIdx still holds its pre-entry value on the entry commit (the
    // lifecycle effect's setReplayIdx lands NEXT commit) — never touch the
    // series until a real position arrives, and never fast-append onto a
    // series that hasn't been sliced yet.
    if (replayIdx < 31) return;
    const theme = getCandleTheme();
    const idx = Math.max(1, Math.min(replayIdx, data.bars.length));
    if (idx === replayAppliedRef.current + 1 && replayAppliedRef.current >= 1) {
      const bar = data.bars[idx - 1];
      candleSeries.update(toCandle(bar));
      volumeSeries.update(toVolume(bar, theme));
    } else {
      const visible = data.bars.slice(0, idx);
      candleSeries.setData(visible.map(toCandle));
      volumeSeries.setData(visible.map(b => toVolume(b, theme)));
    }
    replayAppliedRef.current = idx;
    barCountRef.current = idx;

    const cutoff = data.bars[idx - 1].time;
    const mins = tfMinutes(timeframe);
    // The replay's last bar is complete — its sub-bar beads belong to it
    trails.setData(
      data.snaps.filter(s => s.time < cutoff + mins * 60),
      data.maxAbs,
      overlays.trails && mins <= INTRADAY_MAX_MINUTES,
      mins * 60
    );
  }, [replay, replayIdx, overlays.trails, timeframe]);

  // Playback clock
  useEffect(() => {
    if (!replay || !replayPlaying) return;
    const id = window.setInterval(() => {
      setReplayIdx(i => {
        const len = replayDataRef.current?.bars.length ?? 0;
        if (i >= len) {
          setReplayPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.round(480 / replaySpeed));
    return () => window.clearInterval(id);
  }, [replay, replayPlaying, replaySpeed]);

  // ---- drawings -------------------------------------------------------------
  // Per-ticker load; marks are the user's, so they persist across sessions
  useEffect(() => {
    shapesRef.current = loadDrawings(ticker);
    drawingsRef.current?.setDrawings([...shapesRef.current]);
  }, [ticker]);

  const commitDrawing = useCallback(
    (d: Drawing) => {
      shapesRef.current = [...shapesRef.current, d];
      drawingsRef.current?.setDrawings(shapesRef.current);
      saveDrawings(ticker, shapesRef.current);
    },
    [ticker]
  );

  const clearDrawings = useCallback(() => {
    shapesRef.current = [];
    drawingsRef.current?.setDrawings([]);
    saveDrawings(ticker, []);
  }, [ticker]);

  const pointAt = (e: ReactPointerEvent<HTMLDivElement>): { time: number; price: number } | null => {
    const container = containerRef.current;
    const candleSeries = candleSeriesRef.current;
    const prim = drawingsRef.current;
    if (!container || !candleSeries || !prim) return null;
    const rect = container.getBoundingClientRect();
    const time = prim.xToTime(e.clientX - rect.left);
    const price = candleSeries.coordinateToPrice(e.clientY - rect.top);
    if (time === null || price === null) return null;
    return { time, price };
  };

  const onDrawDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointAt(e);
    if (!p) return;
    if (drawTool === 'hline') {
      commitDrawing({ kind: 'hline', p1: p });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { kind: 'trend', p1: p, p2: p };
    drawingsRef.current?.setDraft(dragRef.current);
  };

  const onDrawMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const p = pointAt(e);
    if (!p) return;
    dragRef.current = { ...dragRef.current, p2: p };
    drawingsRef.current?.setDraft(dragRef.current);
  };

  const onDrawUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    drawingsRef.current?.setDraft(null);
    if (!d || !d.p2) return;
    // a real segment, not a click
    if (d.p1.time !== d.p2.time || Math.abs(d.p1.price - d.p2.price) > 1e-9) commitDrawing(d);
  };

  const flashLevel = (key: 'callWall' | 'putWall' | 'flip' | 'king', on: boolean) => {
    levelLinesRef.current[key]?.applyOptions({ lineVisible: on });
  };

  const fmtLevel = (v: number) => (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2 px-1 flex-wrap select-none">
        {overlays.levels &&
          ([
            // Each chip wears its LINE's ink (palette.CALL_WALL = BULL since
            // Noah retired the mint wall, 2026-08-18).
            { key: 'callWall', label: 'CW', cls: 'bg-bull', text: 'text-bull' },
            { key: 'putWall', label: 'PW', cls: 'bg-bear', text: 'text-bear' },
            { key: 'flip', label: 'FLIP', cls: 'bg-[#7DD3FC]', text: 'text-[#7DD3FC]' },
            // Matches the magenta king LINE (palette.KING) — one king color everywhere
            { key: 'king', label: 'KING', cls: 'bg-[#EA00FF]', text: 'text-[#EA00FF]' },
          ] as const).map(item => (
            <button
              key={item.key}
              onMouseEnter={() => flashLevel(item.key, true)}
              onMouseLeave={() => flashLevel(item.key, false)}
              title="Hover to flash this level on the chart"
              className="inline-flex items-center gap-1.5 rounded border border-borderSubtle bg-inset px-2 py-1 font-mono text-[10px] hover:border-borderMuted transition-colors cursor-default"
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${item.cls}`} />
              <span className={`font-semibold ${item.text}`}>{item.label}</span>
              <span className="text-textPrimary tnum">{fmtLevel(levels[item.key])}</span>
            </button>
          ))}
        {overlays.trails && (
          <span className="flex items-center gap-2.5 ml-1 font-mono text-[10px] text-textSecondary">
            {/* The field's own inks (the house steel-gold): gold = put side,
                amplifies; steel = call side, absorbs; magenta = the king.
                Not the candles' red/green — on this surface those are the tape's. */}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
                <span className="inline-block w-[5px] h-[3px] rounded-full" style={{ background: 'rgba(245,197,66,0.5)' }} />
                <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: 'rgba(245,197,66,0.75)' }} />
                <span className="inline-block w-[5px] h-[7px] rounded-full" style={{ background: '#F5C542' }} />
              </span>
              put walls
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
                <span className="inline-block w-[5px] h-[3px] rounded-full" style={{ background: 'rgba(226,234,244,0.5)' }} />
                <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: 'rgba(226,234,244,0.75)' }} />
                <span className="inline-block w-[5px] h-[7px] rounded-full" style={{ background: '#E2EAF4' }} />
              </span>
              call walls
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: KING }} aria-hidden="true" />
              king
            </span>
            <span className="text-textMuted">· brighter is heavier</span>
          </span>
        )}
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

        {/* Draw mode: pointer sketches instead of panning */}
        {drawing && (
          <div
            className="absolute inset-0 z-20 cursor-crosshair touch-none"
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
          />
        )}
        {drawing && (
          <div className="absolute top-2 left-2 z-30 flex items-center gap-1 border border-borderMuted bg-panel/95 rounded-md p-1 shadow-xl shadow-black/50">
            {(
              [
                { tool: 'trend' as DrawingKind, icon: <TrendingUp className="w-3.5 h-3.5" />, label: 'Trend' },
                { tool: 'hline' as DrawingKind, icon: <Minus className="w-3.5 h-3.5" />, label: 'Level' },
              ] as const
            ).map(item => (
              <button
                key={item.tool}
                onClick={() => setDrawTool(item.tool)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  drawTool === item.tool
                    ? 'bg-select/15 text-select'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-white/[0.04]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <span className="w-px h-4 bg-borderMuted mx-0.5" />
            <button
              onClick={clearDrawings}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              onClick={onExitDraw}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider text-select hover:bg-select/10 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Done
            </button>
          </div>
        )}

        {/* Replay transport */}
        {replay && (
          <div className="absolute bottom-2 inset-x-0 z-30 flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-1.5 border border-borderMuted bg-panel/95 rounded-md px-2 py-1.5 shadow-xl shadow-black/50">
              <button
                onClick={() => setReplayIdx(i => Math.max(31, i - 1))}
                title="Step back"
                className="p-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
              >
                <StepBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setReplayPlaying(p => !p)}
                title={replayPlaying ? 'Pause' : 'Play'}
                className="p-1 rounded text-select hover:bg-select/10 transition-colors"
              >
                {replayPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setReplayIdx(i => Math.min(replayDataRef.current?.bars.length ?? i, i + 1))}
                title="Step forward"
                className="p-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setReplaySpeed(s => (s >= 8 ? 1 : s * 2))}
                title="Playback speed"
                className="px-1.5 py-0.5 rounded font-mono text-[10px] text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors tnum"
              >
                {replaySpeed}×
              </button>
              <input
                type="range"
                min={31}
                max={Math.max(31, replayDataRef.current?.bars.length ?? 31)}
                value={replayIdx}
                onChange={e => setReplayIdx(Number(e.target.value))}
                className="w-40 accent-[#D2FF00]"
              />
              <span className="font-mono text-[10px] text-textSecondary tnum">
                {replayIdx}/{replayDataRef.current?.bars.length ?? 0}
              </span>
              <span className="w-px h-4 bg-borderMuted mx-0.5" />
              <button
                onClick={onExitReplay}
                title="Exit replay"
                className="p-1 rounded text-textSecondary hover:text-textPrimary hover:bg-white/[0.04] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StrikeChart;
