import {
  useCallback, useEffect, useRef, useState,
  type MutableRefObject, type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Eraser, Minus, Pause, Play, StepBack, StepForward, TrendingUp, X } from 'lucide-react';
import {
  createChart,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesType,
  type UTCTimestamp,
  type MouseEventParams,
  type Time,
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
import { GexTrailsPrimitive } from './gexNodesPrimitive';
import { DrawingsPrimitive, loadDrawings, saveDrawings, type Drawing, type DrawingKind } from './drawingsPrimitive';
import { getCandleTheme, useCandleThemeKey, candleSeriesOptions, chartSurface, type CandleTheme } from './candleTheme';
import { markFired, useAlerts } from './alertStore';
import type { Candle } from '../../types/market';
import type { DarkPoolPrint, KeyLevels } from '../../types/gex';
import { bucketFlow, flowMaxLeg } from '../../data/flowBars';
import { cumulativeDrift, driftPeak } from '../../data/driftSeries';
import { impliedVolLine, realizedVol, volCeiling } from '../../data/volDrift';
import type { FlowPrint } from '../../types/trace';

/* The shape this chart needs off a print: whatever FlowPrint is, plus the
   instant it arrived. Declared here rather than imported from the provider so a
   chart never depends on a React context it does not use. */
type StampedFlowPrint = FlowPrint & { at: number };

/*
  The band's share of the chart, as a STRETCH FACTOR against the price pane's.

  `setHeight(90)` was the first attempt and it does not hold: measured, the pane
  came back at 201px on a 900px window — lightweight-charts lays panes out by
  stretch and redistributes an explicit height away. A constant that names a
  pixel count it does not produce is worse than no constant, so this says what
  the library actually honours. 4:1 gives the tape four fifths, which is the
  reference's proportion, and a reader can still drag the separator.

  3 and not 4, and the reason is a coupling worth naming: the compare effect
  normalises EVERY pane whenever more than one exists — `panes[0]` to 3, all the
  rest to 1 — so whatever is set here is re-applied as 3:1 the next time
  comparisons rebuild. Asking for 4:1 measured 3:1 anyway. Matching it means the
  two places agree instead of silently fighting over the layout.
*/
const FLOW_STRETCH = 1;
const PRICE_STRETCH = 3;

/*
  A comparison in PANE mode goes BELOW the flow band when there is one.

  It was hard-coded to index 1. The flow band is built on demand, so 1 is
  sometimes the flow band and sometimes free — a compare line dropped into the
  flow pane would share its scale (pinned to +/- the heaviest premium leg) and
  render as a flat line on the zero rule while squashing the bars it landed on.
  Asking the flow series where it actually is beats assuming.
*/

/*
  THE FLOW LEGS DO NOT TAKE THE CANDLE THEME'S VOLUME INK, and that was the
  first thing I tried.

  Volume is ONE quantity, so it can be monochrome and still be readable — and
  in several themes it is: the Chrome theme paints volUp `rgba(238,241,245,.22)`
  and volDown `rgba(86,92,104,.30)`, two greys. Driven live with the legs on
  those, the flow band rendered with ZERO green and ZERO red pixels: calls and
  puts became the same colour, which is the one thing a two-sided histogram
  cannot survive. The whole point of drawing both legs is telling them apart.

  So the legs wear the house DIRECTION inks, always. That is the right register
  as well as the readable one: call premium arriving is bullish and put premium
  arriving is bearish, which is direction, not dealer side — gold and steel
  would be the wrong vocabulary here.
*/
const FLOW_CALL_INK = BULL;
const FLOW_PUT_INK = PUT_WALL;

/*
  THE DRIFT LINES WEAR THE SAME TWO INKS AS THE FLOW LEGS, and they should:
  they are the same two quantities. The band draws call and put premium per
  bar; the drift lines draw the running totals of exactly those bars. Giving
  the totals their own colours would ask a reader to learn a second vocabulary
  for a number they already know.
*/
const DRIFT_CALL_INK = BULL;
const DRIFT_PUT_INK = PUT_WALL;

/*
  THE TWO VOLATILITY LINES ADD NO NEW HUE.

  Both values already exist in this file as INDICATOR_INKS — the pale violet
  the ema21 wears and the warm cream the ema50 wears — and that is the correct
  register rather than a convenient one: realised vol is a line COMPUTED from
  the bars, which is what every ink in that set marks. The reference happens to
  draw the same pair as saturated purple and yellow; these are the house's
  muted version of the same two positions.

  Written out rather than read from INDICATOR_INKS on purpose. Reaching into
  that map would couple the vol pane to the EMA palette, so recolouring an
  indicator would silently recolour a different pane in a different unit.
*/
const RV_INK = '#BBB2E8';
const IV_INK = '#EDE4CD';

/** Height of a pane's name chip, and its inset from the pane's top edge. */
const PANE_LABEL_H = 17;
const PANE_LABEL_INSET = 3;

/* Every product pane names itself, the way the reference does — an unlabelled
   strip of bars under a chart is a puzzle. The fills are the faintest wash of
   each pane's own subject so the chip reads as belonging to its band. */
const PANE_LABEL_LOOK: Record<string, { text: string; bg: string; fg: string }> = {
  flow: { text: 'Flow', bg: 'rgba(120,110,40,0.35)', fg: '#E8E4C8' },
  netDrift: { text: 'Net drift', bg: 'rgba(40,90,60,0.35)', fg: '#CFE8D8' },
  volDrift: { text: 'Vol drift', bg: 'rgba(70,60,110,0.35)', fg: '#DCD6F0' },
};

/** What the user chose to draw — every overlay is independent. */
export interface ChartOverlays {
  trails: boolean;
  levels: boolean;
  darkpool: boolean;
  volume: boolean;
  /** Trace's option prints, bucketed to these bars — calls up, puts down. */
  flow: boolean;
  /** Running call/put premium totals for the session — the flow band summed. */
  netDrift: boolean;
  /** Realised vol measured off these bars against the feed's implied. */
  volDrift: boolean;
  /*
    Exposure by STRIKE, docked under the chart rather than drawn inside it.

    It lives on this type and not on a second one because the reader toggles it
    from the same menu as the panes and expects it saved with them — but this
    component never reads it. Every pane lightweight-charts draws shares one
    TIME axis, and this band's axis is the strike; the host renders it below.
  */
  dexStrike: boolean;
}

/* Chart styles, TradingView's picker (Noah, 2026-08-23: "notice how candles
   is different from the themes") — the SHAPE of the tape, orthogonal to the
   candle color theme. Every style draws from the same bars. */
export type ChartStyle = 'candles' | 'hollow' | 'bars' | 'line' | 'step' | 'area' | 'baseline';

export const CHART_STYLES: { value: ChartStyle; label: string }[] = [
  { value: 'candles', label: 'Candles' },
  { value: 'hollow', label: 'Hollow candles' },
  { value: 'bars', label: 'Bars' },
  { value: 'line', label: 'Line' },
  { value: 'step', label: 'Step line' },
  { value: 'area', label: 'Area' },
  { value: 'baseline', label: 'Baseline' },
];

/* Indicator overlays — computed chart-side from the same aggregated bars the
   tape draws, so they agree with it on every timeframe. */
export interface ChartIndicators {
  ema9: boolean;
  ema21: boolean;
  ema50: boolean;
  vwap: boolean;
}

export const DEFAULT_INDICATORS: ChartIndicators = { ema9: false, ema21: false, ema50: false, vwap: false };

/* One categorical ink family for auxiliary lines (indicators here, compare
   lines in the widget) — hues that carry no house meaning. */
export const INDICATOR_INKS: Record<keyof ChartIndicators, string> = {
  ema9: '#5B9CF6',
  ema21: '#BBB2E8',
  ema50: '#EDE4CD',
  vwap: '#6BD3C7',
};

/* Compare symbols, TradingView's three flavors (Noah, 2026-08-23):
   percent = ride the SAME pane with the whole right scale in % change;
   scale   = same pane, its own LEFT price scale;
   pane    = its own pane below the tape, own scale. */
export type CompareMode = 'percent' | 'scale' | 'pane';
export interface CompareEntry {
  ticker: string;
  mode: CompareMode;
  /** Line + legend ink — assigned by the host so both stay in agreement */
  ink: string;
}

export const DEFAULT_OVERLAYS: ChartOverlays = {
  trails: true,
  levels: true,
  darkpool: false,
  volume: true,
  /* OFF by default, and not out of caution — the tape has no history. It
     accumulates from the moment the app opens, so on a cold load this pane has
     nothing to draw. Defaulting it on would greet every reader with an empty
     band under their chart and no clue why. */
  flow: false,
  /* Off for the same reason — it reads the same tape. */
  netDrift: false,
  /* Off because realised vol needs RV_MODEL.window bars before it can say
     anything, and because a reader who has not asked for a third band should
     not get one: every extra pane is height taken off the tape. */
  volDrift: false,
  /* Off because it costs the tape real height rather than sharing it. */
  dexStrike: false,
};

/*
  WHERE A PRICE LANDS ON THIS CHART, published live.

  A column drawn beside the tape has to agree with the tape's own price scale
  or it is a second, contradicting set of numbers 54px away. Rather than have
  the neighbour re-derive the mapping — it cannot; autoscale, a price-scale
  drag and percent mode all move it — the chart hands out the mapping itself.

  Every member reads at CALL time, so a consumer polling this in its own frame
  loop always gets the live answer and nothing goes stale across a style swap,
  a re-fit or a resize.

  yFor is NOT clamped: a price outside the visible range returns an off-plot y,
  including a negative one, because the caller has to be able to tell "above
  the top" from "at the top". It returns 0 for EVERY price while the scale is
  still empty, which is why a consumer must check the spacing between two
  prices rather than trusting a single coordinate.
*/
export interface PriceProjection {
  /** y in CSS px from the top of the plot, or null if the series is gone. */
  yFor(price: number): number | null;
  /** The plot's own height — NOT the container's; the time axis is below it. */
  plotHeight(): number;
  /** The time axis's height, for a neighbour that has to stop above it. */
  axisHeight(): number;
}

interface StrikeChartProps {
  ticker: string;
  /** Bumped every simulator tick so the chart folds in the newest bar */
  revision: number;
  levels: KeyLevels;
  timeframe: Timeframe;
  height?: number;
  /** Drop the container's own border/fill/rounding — the host supplies ONE
      surface and the tape bleeds to its edges (Noah, 2026-08-23: "i notice
      different layers of black"). */
  frameless?: boolean;
  /** Transient user-focused price — renders a cyan FOCUS line while set */
  focusPrice?: number | null;
  overlays?: ChartOverlays;
  /** Dark-pool prints for the DP overlay (whisper lines, MiniPane grammar) */
  prints?: DarkPoolPrint[];
  /**
   * Trace's option prints, for the FLOW pane.
   *
   * Handed in rather than read here, and that is the point: the tape desk and
   * this pane are two readers of ONE accumulated tape (the provider owns it),
   * so they cannot end up quoting different premium for the same session.
   * Every print, unfiltered — this component narrows to its own ticker, because
   * a host with four panes should not bucket the same tape four times.
   */
  flowPrints?: readonly StampedFlowPrint[];
  /** Comparison symbols drawn as lines over/under the tape */
  compares?: CompareEntry[];
  /** The tape's shape — candles, bars, line, area… (theme-independent) */
  chartStyle?: ChartStyle;
  /** Indicator overlays computed from the same bars */
  indicators?: ChartIndicators;
  /** Draw mode — pointer sketches trendlines/levels instead of panning */
  drawing?: boolean;
  onExitDraw?: () => void;
  /** Replay mode — scrub through history bar by bar, trails included */
  replay?: boolean;
  onExitReplay?: () => void;
  /** The live price on the right scale as a soft two-line card — the price, a
      rule, and the time left in the current bar — in place of the library's
      flat last-value tag. Off by default; Terrain turns it on. */
  priceTag?: boolean;
  /** Fired on REAL pointer input only — the hovered bar's time, or null when
      the pointer leaves the plot. The library re-fires its crosshair event on
      every model update, and this chart updates four series a tick; those
      echoes are filtered out before this is called. */
  onCrosshair?: CrosshairSync;
  /** Handed this chart's own "mark that moment" function on mount and null on
      unmount, so a host can call it when a DIFFERENT pane is hovered. */
  syncRegister?: (apply: CrosshairSync | null) => void;
  /** Filled with this chart's live price projection on mount, nulled on
      unmount. A REF rather than a callback on purpose: a ref object's identity
      never changes, so it can sit in the mount effect's dep array without
      rebuilding the chart on every parent render. */
  projectionRef?: MutableRefObject<PriceProjection | null>;
  /**
   * SHRINK THE PRICE-SCALE FURNITURE — for a chart on a phone.
   *
   * The axis labels and the strike chips are fixed sizes, tuned on a chart
   * about 550px wide. They do not scale with the tape, so on a narrow one they
   * take a far larger share of it. Measured on `/pulse`: the price gutter is
   * 54px on BOTH — 4.2% of a 1280px desktop chart and 13.8% of a 390px phone
   * screen, three times the proportional cost for the same information.
   *
   * `compact` is the same idea as `ChartToolbar`'s: not a different design,
   * the same one at the size the host can afford.
   */
  compact?: boolean;
}

/** Mark a moment on this chart on another pane's behalf; null clears it. */
export type CrosshairSync = (time: UTCTimestamp | null) => void;

// Wall / flip / king overlay colors (independent of candle theme)
import { BULL, CALL_WALL, PUT_WALL, FLIP, KING, FOCUS, DARK_POOL, ALERT as ALERT_INK } from './palette';

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
  { key: 'flip', color: FLIP, title: 'FLIP ZONE', style: LineStyle.Dashed, width: 1 },
  { key: 'king', color: KING, title: 'KING', style: LineStyle.Solid, width: 2 },
];
/* NO axis chips at all now — the king's capsule left the right pane too
   (Noah, 2026-08-23: "we will have a separate section of the website where
   we explain everything"). The field alone carries every identity: magenta
   band = king, green/red beads = walls, blue ticks = flip. LEVEL_SPEC stays
   for the tween plumbing and any future re-enable. */
const LINE_LEVELS: typeof LEVEL_SPEC = [];

/*
  NOTHING IS NAMED ON THE PRICE AXIS — not the walls, not the flip, not the
  king (Noah, 2026-08-25: "you can remove the flip zone and king node if you
  have it on the screen with its own UI touch that should be enough").

  That is the argument that took the walls off, carried the rest of the way.
  Every one of these levels already has a treatment ON the field: a green node
  band is the call wall, a red one the put wall, a dashed blue rule the flip,
  a magenta band the king. A capsule in the gutter repeats a fact the chart
  has already made, in the loudest form available, on top of the tape.

  LEVEL_SPEC above stays for the tween plumbing and any future re-enable; the
  pre-blending helper that went with the capsules is gone with them rather
  than left behind as scenery.
*/

const toCandle = (b: Candle) => ({
  time: b.time as UTCTimestamp,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
});

/** Styles that eat whole bars; the rest eat closes. */
const OHLC_STYLES: ReadonlySet<ChartStyle> = new Set(['candles', 'hollow', 'bars']);
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
  compact = false,
  frameless = false,
  focusPrice = null,
  overlays = DEFAULT_OVERLAYS,
  prints = [],
  flowPrints,
  compares = [],
  chartStyle = 'candles',
  indicators = DEFAULT_INDICATORS,
  drawing = false,
  onExitDraw,
  replay = false,
  onExitReplay,
  priceTag = false,
  onCrosshair,
  syncRegister,
  projectionRef,
}: StrikeChartProps) => {
  const themeKey = useCandleThemeKey();
  /* Read straight from the store rather than taken as a prop: alerts belong to
     the SYMBOL, and two panes showing the same symbol must draw the same set.
     The drawings store is read the same way, from this same component. */
  const alerts = useAlerts(ticker);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /* Read at CREATE time by the mount effect, which must not take `compact` as
     a dep — that effect builds the whole chart, and rebuilding it on a prop
     change would drop the reader's pan, zoom and drawings. An effect below
     applies later changes with `applyOptions` instead. */
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  /* Two series, not one signed one: the reference draws BOTH legs around a zero
     line, and a single net bar cannot say whether a quiet bucket was quiet or
     whether a billion dollars hit each side and cancelled. */
  const flowCallsRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const flowPutsRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  /* The two drift lines and the two vol lines, each pair sharing one pane. */
  const driftCallsRef = useRef<ISeriesApi<'Line'> | null>(null);
  const driftPutsRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rvRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ivRef = useRef<ISeriesApi<'Line'> | null>(null);
  /* Where each product pane's top edge sits, in px up from the container's
     bottom. MEASURED off the chart rather than computed from a constant: a
     reader can drag the separators, the time axis's height is the library's to
     decide, and with three optional panes the offsets depend on which of them
     happen to be open. */
  const [paneLabels, setPaneLabels] = useState<{ key: string; bottom: number }[]>([]);
  /*
    THE RUNWAY — a series that draws nothing and holds only WHITESPACE.

    lightweight-charts labels the time axis from the time points its series
    hold, and it has none past the last bar. That is why the axis stopped 62%
    of the way across and the room this chart deliberately keeps open ahead of
    the market came out blank: not a spacing problem, a data problem. There is
    literally nothing there to label.

    Whitespace items — `{ time }` and no value — are the library's own answer.
    They are real time points to the scale and invisible to the plot, so the
    ticks continue past the last bar and keep continuing as the reader zooms
    out, which is what every platform does and what was asked for.

    It is a SEPARATE series on purpose. Appending whitespace to the candles
    would put the newest data point in the future, and `update()` refuses a
    point older than the last one — every live tick would be rejected and the
    tape would freeze. Keeping the runway beside the candles leaves that path
    exactly as it was.
  */
  const runwaySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  /** Bar time the runway was last built from, and how far it reaches. */
  const runwayRef = useRef<{ from: number; slots: number }>({ from: 0, slots: 0 });
  /** Close of the newest bar — what the price card prints. */
  const lastCloseRef = useRef<number | null>(null);
  const priceTagRef = useRef<HTMLDivElement | null>(null);
  const priceTagRafRef = useRef(0);
  const trailsRef = useRef<GexTrailsPrimitive | null>(null);
  const compareSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const compareLoadedRef = useRef('');
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const indicatorLoadedRef = useRef('');
  /* The main series' style — a ref for the one-time creation effect, a
     nonce so every effect that hangs price lines off the main series knows
     to re-hang them after a style swap replaces it. */
  const styleRef = useRef<ChartStyle>(chartStyle);
  styleRef.current = chartStyle;
  const styleBuiltRef = useRef<ChartStyle | null>(null);
  const [mainNonce, setMainNonce] = useState(0);
  const printLinesRef = useRef<IPriceLine[]>([]);
  const levelLinesRef = useRef<Partial<Record<'callWall' | 'putWall' | 'flip' | 'king', IPriceLine>>>({});
  const shownLevelsRef = useRef<KeyLevels | null>(null);
  const levelRafRef = useRef(0);
  /** Time of that bar, and the seconds one bar covers — what the runway is
      built from, kept in refs so the time-scale subscription can read them
      without being torn down and rebuilt on every tick. */
  const lastBarTimeRef = useRef(0);
  const bucketSecRef = useRef(60);
  const levelTickerRef = useRef('');
  const focusLineRef = useRef<IPriceLine | null>(null);
  /** One price line per alert, by alert id. */
  const alertLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  /** The focus price, readable from the autoscale provider (a closure built
      once at chart creation) — a focused strike must never sit off-screen. */
  const focusPriceRef = useRef<number | null>(focusPrice);
  const levelsRef = useRef<KeyLevels>(levels);
  const barCountRef = useRef(0);
  /* Mirrored every render, read from a subscription installed once — the same
     pattern levelsRef and focusPriceRef use, and the reason the mount effect
     never has to re-subscribe. `revision` bumps every 1500ms and an effect
     keyed on the prop would tear the handler down ten times a minute. */
  const onCrosshairRef = useRef(onCrosshair);
  onCrosshairRef.current = onCrosshair;
  const syncRegisterRef = useRef(syncRegister);
  syncRegisterRef.current = syncRegister;
  /** The moment this chart is currently marking for another pane, or null. */
  const syncedRef = useRef<UTCTimestamp | null>(null);
  /** Whether the horizontal crosshair arm is currently hidden because this
      chart is following another pane. Tracked SEPARATELY from syncedRef: a
      follower that is told to clear still has to get its own arm back, and
      hanging that off "am I marking a time" loses it the moment the time
      goes null. */
  const followerRef = useRef(false);
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

  /*
    ══ RE-FIT WHEN THE PANE CHANGES WIDTH ═══════════════════════════════════

    `showRecent` splits the visible span 64% history / 36% runway, and it ran
    ONLY on mount, on a ticker/timeframe/theme change, and on a double-click
    reset. Nothing watched the container.

    That is fine until a pane changes size under a chart that is already
    mounted — which is what every Terrain layout change does. lightweight-
    charts preserves BAR SPACING across a resize, not the logical range, so a
    narrowed pane shows fewer bars while the runway, fixed in bars, keeps its
    pixel width. A 36% runway sized for a 1240px pane is ~446px; drop it into
    the 522px pane that "3 charts" produces and it is 85% of the chart.

    Measured across 24 transitions at 1280/1440/1760, candle occupancy of the
    pane that was already open:

      1 -> 2, 1 -> 3, 1 -> 4    0.60  ->  0.03-0.17   (1760 1->3 was 3%)
      2 -> 4, 4 -> 2            unchanged  (width is equal, only height moves)
      4 -> 1, 3 -> 1, 2 -> 1    0.49-0.61 -> 0.66-0.81  (wider: it IMPROVES)

    The asymmetry is the proof: it tracks WIDTH, not layout, and it never
    self-healed — identical at +2s and +17s, nine live ticks later.

    WIDTH ONLY. A height change is harmless (the 2<->4 row above), and re-
    fitting on one would throw the reader's view away for nothing.
  */
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastWidth = el.clientWidth;
    let raf = 0;
    const obs = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (!w) return; // a pane being torn down reports 0 — re-fitting to it is meaningless
      // 2%: a layout change is a third of the width or more; this is well clear
      // of sub-pixel reflow noise without needing to guess at a pixel count.
      if (Math.abs(w - lastWidth) < lastWidth * 0.02) return;
      lastWidth = w;
      // Coalesce: a drag fires this every frame, and setVisibleLogicalRange
      // mid-drag would fight the browser's own layout.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (chartRef.current) showRecent();
      });
    });
    obs.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [showRecent]);

  /*
    Keep enough whitespace ahead of the last bar that the time axis is labelled
    all the way to the right edge, at whatever zoom the reader is at.

    GROW-ONLY, and that is what stops it oscillating. `setData` on the runway
    can itself nudge the visible range, and a routine that recomputes a
    smaller number on the way back would sit in a loop shrinking and growing
    forever. It only ever extends, and rebuilds from scratch when a new bar
    forms and the anchor moves.

    The margin is a full screen's worth beyond the right edge, so dragging the
    scale does not outrun the labels between frames — the thing that would
    show up as ticks appearing a beat late.
  */
  /*
    The ceiling was 4000 and a reader found the end of it: at 2560px wide,
    fully zoomed out with the tape dragged off the left edge, the visible span
    was 5011 bars and the right fifth of the axis went unlabelled — the exact
    symptom the runway exists to remove. A cap is still needed (this is a
    runaway guard, not a budget), but it has to sit above any span a scale can
    actually reach: barSpacing bottoms out around 0.5, so a 4K-wide plot tops
    out near 8000 bars.
  */
  const RUNWAY_MAX = 12000;
  const ensureRunway = useCallback((lastTime: number, bucketSec: number) => {
    const chart = chartRef.current;
    const series = runwaySeriesRef.current;
    if (!chart || !series || !lastTime || bucketSec <= 0) return;

    const len = barCountRef.current;
    const range = chart.timeScale().getVisibleLogicalRange();
    const span = range ? Math.max(60, range.to - range.from) : 200;
    const reach = range ? range.to - (len - 1) : 0;
    const cur = runwayRef.current;
    const want = Math.min(
      RUNWAY_MAX,
      Math.max(120, Math.ceil(reach + span), cur.from === lastTime ? cur.slots : 0)
    );
    if (cur.from === lastTime && cur.slots >= want) return;

    const pts = [];
    for (let i = 1; i <= want; i++) pts.push({ time: (lastTime + i * bucketSec) as UTCTimestamp });
    series.setData(pts);
    runwayRef.current = { from: lastTime, slots: want };
  }, []);

  const resetView = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale('right').applyOptions({ autoScale: true });
    showRecent();
  }, [showRecent]);

  /* The horizontal arm goes off while this chart is following another pane —
     a full crosshair reads as "your cursor is here", and it is not. Guarded so
     the option write only happens on a real change, not on every mousemove of
     whichever pane is leading. */
  const setFollower = useCallback((on: boolean) => {
    if (followerRef.current === on) return;
    followerRef.current = on;
    chartRef.current?.applyOptions({
      crosshair: { horzLine: { visible: !on, labelVisible: !on } },
    });
  }, []);

  /* Mark a moment that belongs to ANOTHER pane. TIME ONLY, and that is forced
     rather than chosen: setCrosshairPosition demands a price, but crosshair
     mode defaults to Magnet and this chart never overrides it, so the magnet
     throws the price away and snaps to the RECEIVING chart's own close. No
     price can cross a pane boundary here — which is right, since two panes are
     usually two symbols. The horizontal arm goes off while this chart is a
     follower: a full crosshair reads as "your cursor is here", and it is not.

     Reads only refs, so the empty dep list is honest and the mount effect can
     list it without churn. */
  const applySync = useCallback((time: UTCTimestamp | null) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;
    syncedRef.current = time;
    const price = lastCloseRef.current;
    /* Not a nicety: setCrosshairPosition on a series whose price scale has no
       first value throws. Terrain boots through a splash and panes reload on
       every ticker and timeframe change, so this window is real. lastCloseRef
       is written from the same bars that feed setData. */
    if (time === null || price == null) {
      chart.clearCrosshairPosition();
      setFollower(false);
      return;
    }
    /* THIS chart's bucket, FLOORED — the bar the moment is inside of. The
       library's own lookup rounds UP, so a 12:07 hover would land on a 15m
       neighbour's 12:15 bar: one that had not happened at 12:07. Same formula
       aggregateCandles uses, so the result is an exact grid hit or nothing. */
    const bucket = Math.max(60, tfMinutes(timeframeRef.current) * 60);
    const target = (Math.floor(time / bucket) * bucket) as UTCTimestamp;
    const ts = chart.timeScale();
    const idx = ts.timeToIndex(target, false); // exact hit or null — never nearest
    const vis = ts.getVisibleLogicalRange();
    /* Outside this chart's data, or outside what it is currently showing, draw
       NOTHING. setCrosshairPosition clamps the index to the visible range and
       would otherwise print a confident mark on the wrong bar. Panes here pan
       and zoom independently, so this is the common case. */
    if (idx === null || vis === null || idx < vis.from || idx > vis.to) {
      chart.clearCrosshairPosition();
      setFollower(false);
      return;
    }
    setFollower(true);
    chart.setCrosshairPosition(price, target, series);
  }, [setFollower]);

  /* One datum mapper for every main-series write: OHLC styles get whole
     bars, value styles get closes. Typed `never` so the same call sites
     feed whichever series the style built (the ref stays nominally
     'Candlestick'; the payload is always correct for the REAL series). */
  const toMain = useCallback(
    (b: Candle) =>
      (OHLC_STYLES.has(styleRef.current)
        ? toCandle(b)
        : { time: b.time as UTCTimestamp, value: b.close }) as never,
    []
  );

  // Widen the visible price range to always include the walls/king so several
  // strike-node bands are on screen, not just the couple around spot — and
  // the FOCUS strike, when one is set (a strike sent here to be SEEN
  // cannot be off-screen; Noah, 2026-08-22).
  const autoscaleProvider = useCallback(
    (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
      const base = original();
      const lv = levelsRef.current;
      const extras = [lv.putWall, lv.callWall, lv.king, lv.spot, focusPriceRef.current ?? NaN].filter(v =>
        Number.isFinite(v)
      );
      let min = base?.priceRange.minValue ?? Math.min(...extras);
      let max = base?.priceRange.maxValue ?? Math.max(...extras);
      for (const v of extras) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const pad = Math.max((max - min) * 0.08, 0.01);
      return { priceRange: { minValue: min - pad, maxValue: max + pad } };
    },
    []
  );

  /* Build the main series for a style. Always returned as the nominal
     'Candlestick' handle — every consumer routes data through toMain and
     hangs price lines, which every series type supports. */
  const makeMain = useCallback(
    (chart: IChartApi, style: ChartStyle, t: CandleTheme): ISeriesApi<'Candlestick'> => {
      const base = {
        priceLineVisible: true,
        priceLineColor: 'rgba(237,237,237,0.4)',
        priceLineStyle: LineStyle.Dotted,
        autoscaleInfoProvider: autoscaleProvider,
      };
      let s: ISeriesApi<SeriesType>;
      switch (style) {
        case 'hollow': {
          // Up bodies filled with the surface = hollow; down bodies solid
          const surface = chartSurface(t).bg;
          s = chart.addSeries(CandlestickSeries, {
            ...candleSeriesOptions(t),
            upColor: surface === 'transparent' ? 'rgba(0,0,0,0)' : surface,
            borderUpColor: t.borderUp ?? t.up,
            wickUpColor: t.wickUp,
            ...base,
          });
          break;
        }
        case 'bars':
          s = chart.addSeries(BarSeries, { upColor: t.up, downColor: t.down, thinBars: false, ...base });
          break;
        case 'line':
          s = chart.addSeries(LineSeries, { color: t.up, lineWidth: 2, ...base });
          break;
        case 'step':
          s = chart.addSeries(LineSeries, { color: t.up, lineWidth: 2, lineType: LineType.WithSteps, ...base });
          break;
        case 'area':
          s = chart.addSeries(AreaSeries, {
            lineColor: t.up,
            lineWidth: 2,
            topColor: `${t.up}40`,
            bottomColor: `${t.up}05`,
            ...base,
          });
          break;
        case 'baseline':
          // Above/below the session open IS a price-direction read → the
          // house bull/bear pair (the one style allowed to speak it)
          s = chart.addSeries(BaselineSeries, {
            topLineColor: '#30D158',
            topFillColor1: 'rgba(48,209,88,0.20)',
            topFillColor2: 'rgba(48,209,88,0.02)',
            bottomLineColor: '#FF3B30',
            bottomFillColor1: 'rgba(255,59,48,0.02)',
            bottomFillColor2: 'rgba(255,59,48,0.20)',
            lineWidth: 2,
            ...base,
          });
          break;
        default:
          s = chart.addSeries(CandlestickSeries, { ...candleSeriesOptions(t), ...base });
      }
      return s as ISeriesApi<'Candlestick'>;
    },
    [autoscaleProvider]
  );

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
        // 9 on a phone. lightweight-charts sizes the price gutter from its
        // widest label, so this is what actually buys the tape its width back.
        fontSize: compactRef.current ? 9 : 10,
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

    const candles = makeMain(chart, styleRef.current, getCandleTheme());
    styleBuiltRef.current = styleRef.current;

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    /* Its own price scale, so an empty series cannot drag the tape's autoscale
       around, and every visible affordance off. */
    const runway = chart.addSeries(LineSeries, {
      priceScaleId: 'runway',
      visible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    const trails = new GexTrailsPrimitive();
    candles.attachPrimitive(trails);
    const drawingsPrim = new DrawingsPrimitive();
    candles.attachPrimitive(drawingsPrim);

    /* Zooming out reaches past the runway's end; extend it as they go. The
       handler reads refs rather than closing over the bar time, so it is
       installed once with the chart and never re-subscribed. */
    const onRange = () => {
      ensureRunway(lastBarTimeRef.current, bucketSecRef.current);
      /* A synthetic crosshair is anchored to a PIXEL, not to a time: the model
         re-derives its bar from the saved x on the next update, so panning this
         pane slides someone else's mark onto a different bar without a word.
         Re-apply from the time we were actually told. applySync touches only
         the crosshair, so this cannot recurse. */
      if (syncedRef.current !== null) applySync(syncedRef.current);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    /*
      HOVER, OUT — and only REAL hover.

      The library re-fires this handler on every model update while a crosshair
      is live, twice per series.update(); this chart updates candles, volume,
      indicators and compares on every 1500ms tick. Left unfiltered, a follower
      pane's own tick would look like a hover and it would broadcast straight
      back. Only pointer-driven fires carry `sourceEvent`, and a pointer LEAVING
      carries neither `point` nor `sourceEvent`. setCrosshairPosition itself
      never reaches here at all — it skips the event internally — so the fan-out
      cannot reflect even once.
    */
    const onCross = (param: MouseEventParams<Time>) => {
      if (!param.point) {              // the pointer left the plot
        onCrosshairRef.current?.(null);
        return;
      }
      if (!param.sourceEvent) return;  // a model echo, not a hover
      // This pane owns its crosshair again — give the horizontal arm back.
      syncedRef.current = null;
      setFollower(false);
      onCrosshairRef.current?.(typeof param.time === 'number' ? (param.time as UTCTimestamp) : null);
    };
    chart.subscribeCrosshairMove(onCross);
    syncRegisterRef.current?.(applySync);

    chartRef.current = chart;
    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    runwaySeriesRef.current = runway;
    trailsRef.current = trails;
    drawingsRef.current = drawingsPrim;

    /* Reads candleSeriesRef rather than closing over `candles`: the style swap
       removes and replaces the main series in place, and a captured series
       would leave the neighbour projecting against a dead one. */
    if (projectionRef) {
      projectionRef.current = {
        yFor: price => candleSeriesRef.current?.priceToCoordinate(price) ?? null,
        plotHeight: () => chart.paneSize(0).height,
        axisHeight: () => chart.timeScale().height(),
      };
    }

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onCross);
      syncRegisterRef.current?.(null);
      syncedRef.current = null;
      if (projectionRef) projectionRef.current = null;
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      flowCallsRef.current = null;
      flowPutsRef.current = null;
      driftCallsRef.current = null;
      driftPutsRef.current = null;
      rvRef.current = null;
      ivRef.current = null;
      runwaySeriesRef.current = null;
      runwayRef.current = { from: 0, slots: 0 };
      trailsRef.current = null;
      drawingsRef.current = null;
      compareSeriesRef.current.clear();
      compareLoadedRef.current = '';
      indicatorSeriesRef.current.clear();
      indicatorLoadedRef.current = '';
      styleBuiltRef.current = null;
      printLinesRef.current = [];
      levelLinesRef.current = {};
      shownLevelsRef.current = null;
      cancelAnimationFrame(levelRafRef.current);
      loadedRef.current = { ticker: '', timeframe: '1m', theme: '' };
    };
    // ensureRunway and applySync are stable useCallback([])s — listed so the
    // subscriptions installed here are never reading a stale one.
  }, [makeMain, ensureRunway, applySync, setFollower, projectionRef]);

  /* Style swap (Noah, 2026-08-23): replace ONLY the main series in place —
     price lines and primitives die with the old one, so the nonce tells the
     level/focus/print/data effects to re-hang everything on the new series.
     Pan/zoom survives; the tape reloads on the next pass of the data
     effect. */
  useEffect(() => {
    const chart = chartRef.current;
    const prev = candleSeriesRef.current;
    if (!chart || !prev) return;
    if (styleBuiltRef.current === chartStyle) return;
    const trails = trailsRef.current;
    const drawingsPrim = drawingsRef.current;
    chart.removeSeries(prev);
    const next = makeMain(chart, chartStyle, getCandleTheme());
    if (trails) next.attachPrimitive(trails);
    if (drawingsPrim) next.attachPrimitive(drawingsPrim);
    candleSeriesRef.current = next;
    styleBuiltRef.current = chartStyle;
    levelLinesRef.current = {};
    shownLevelsRef.current = null;
    focusLineRef.current = null;
    printLinesRef.current = [];
    loadedRef.current = { ticker: '', timeframe: '1m', theme: '' }; // force full reload
    setMainNonce(n => n + 1);
  }, [chartStyle, makeMain]);

  // Volume overlay toggle — series stays mounted, just hides
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  /*
    THE LAST PANE ANY PRODUCT OCCUPIES, or 0 when none of them are open.

    Three optional panes open and close in any order, so "the pane below the
    products" cannot be a constant and cannot be read off any one of them.
    Every product series is asked where it actually is and the deepest answer
    wins; with none open the answer is the tape's own pane, and the caller's
    +1 puts the compare band directly under it — the behaviour before any of
    these panes existed.
  */
  const lastProductPaneIndex = useCallback(() => {
    let deepest = 0;
    for (const s of [flowCallsRef.current, driftCallsRef.current, rvRef.current] as const) {
      if (!s) continue;
      try {
        const i = s.getPane().paneIndex();
        if (Number.isFinite(i) && i > deepest) deepest = i;
      } catch {
        /* a series mid-teardown has no pane to report */
      }
    }
    return deepest;
  }, []);

  /*
    WHERE EVERY PRODUCT PANE'S NAME CHIP GOES, measured in one pass.

    Each product effect calls this when it finishes, and it re-measures ALL of
    them rather than only its own — which is the point. Turning the drift pane
    on moves the flow band up by the drift pane's height, so a chip that only
    moved when its own effect ran would be left floating over its neighbour.

    Walking up from the container's bottom: the time axis first, then every
    pane at or below this one. The chip is then dropped just inside that pane's
    top edge, INSIDE the band rather than on its separator.

    The result is compared before it is stored. The flow effect re-runs on every
    tick of the tape, and handing React a fresh array each time would re-render
    the whole chart shell per tick for a set of numbers that had not changed.
  */
  const remeasurePaneLabels = useCallback(() => {
    const chart = chartRef.current;
    const wanted: { key: string; series: ISeriesApi<'Histogram'> | ISeriesApi<'Line'> | null }[] = [
      { key: 'flow', series: flowCallsRef.current },
      { key: 'netDrift', series: driftCallsRef.current },
      { key: 'volDrift', series: rvRef.current },
    ];
    let next: { key: string; bottom: number }[] = [];
    if (chart) {
      try {
        const panes = chart.panes();
        const heights = panes.map(pane => pane.getHeight());
        const axisH = chart.timeScale().height();
        for (const w of wanted) {
          if (!w.series) continue;
          const idx = w.series.getPane().paneIndex();
          /* Pane 0 is the tape. A product series that somehow landed there has
             no band of its own to label. */
          if (idx <= 0 || idx >= heights.length) continue;
          /* A band collapsed to a sliver has no room for a chip, and one drawn
             anyway would sit over the pane above it. */
          if (heights[idx] <= 8) continue;
          let up = axisH;
          for (let j = idx; j < heights.length; j++) up += heights[j];
          next.push({ key: w.key, bottom: up - PANE_LABEL_H - PANE_LABEL_INSET });
        }
      } catch {
        /* the chart is mid-teardown; no chips rather than a thrown render */
        next = [];
      }
    }
    setPaneLabels(prev =>
      prev.length === next.length && prev.every((p, i) => p.key === next[i].key && p.bottom === next[i].bottom)
        ? prev
        : next
    );
  }, []);

  /*
    THE FLOW BAND: Trace's premium, in this chart's own buckets.

    Rebuilt whenever the tape grows, the timeframe changes or the symbol
    changes. `bucketFlow` does the summing and is proved separately
    (scripts/flow-bars-proof.ts); this only decides ink and sign.

    Puts are NEGATED here rather than in the bucketer, which hands back two
    magnitudes. Which leg hangs below the axis is a drawing decision, and a
    module that answers "how much traded" should not be the one making it.
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    /*
      THE BAND IS BUILT ON DEMAND AND TORN DOWN WHEN IT IS OFF.

      The first cut created the pane at mount and collapsed it to 1px when the
      overlay was off. That looked equivalent and was not: a second pane adds a
      SEPARATOR, and the time axis grew 26px -> 30px for every chart in the app,
      including charts whose reader never turns flow on. The desk's floating
      chrome clears a hard-coded 26px, so it started landing on the axis — which
      is exactly what `scripts/ui-sweep.mjs` asserts, and it failed there.

      Removing the series removes the pane, so a chart with flow off is the
      chart that existed before this feature. A toggle nobody touches costs
      nothing.
    */
    if (!overlays.flow) {
      const oldCalls = flowCallsRef.current;
      const oldPuts = flowPutsRef.current;
      /* Refs cleared BEFORE the removals, not after: removing a series can
         throw on a chart that is already tearing down, and a ref still holding
         a destroyed series is one the label measurer would ask for a pane. */
      flowCallsRef.current = null;
      flowPutsRef.current = null;
      try {
        if (oldCalls) chart.removeSeries(oldCalls);
        if (oldPuts) chart.removeSeries(oldPuts);
      } catch {
        /* already gone */
      }
      remeasurePaneLabels();
      return;
    }

    let calls = flowCallsRef.current;
    let puts = flowPutsRef.current;
    if (!calls || !puts) {
      /* APPENDED, never a fixed index. Compare-in-pane mode may already own a
         pane, and hard-coding 1 is how two features end up in the same band. */
      const opts = {
        priceFormat: { type: 'volume' as const },
        lastValueVisible: false,
        priceLineVisible: false,
        base: 0,
      };
      const paneIndex = chart.panes().length;
      calls = chart.addSeries(HistogramSeries, opts, paneIndex);
      puts = chart.addSeries(HistogramSeries, opts, paneIndex);
      flowCallsRef.current = calls;
      flowPutsRef.current = puts;
      try {
        chart.panes()[0]?.setStretchFactor(PRICE_STRETCH);
        calls.getPane().setStretchFactor(FLOW_STRETCH);
      } catch {
        /* pane sizing is a nicety; never lose the chart over it */
      }
    }

    const barSec = tfMinutes(timeframe) * 60;
    const bars = bucketFlow(flowPrints ?? [], { barSec, ticker });

    calls.setData(
      bars
        .filter(b => b.callPrem > 0)
        .map(b => ({ time: b.time as UTCTimestamp, value: b.callPrem, color: FLOW_CALL_INK }))
    );
    puts.setData(
      bars
        .filter(b => b.putPrem > 0)
        .map(b => ({ time: b.time as UTCTimestamp, value: -b.putPrem, color: FLOW_PUT_INK }))
    );

    /*
      ONE SCALE ACROSS BOTH LEGS, and symmetric about zero.

      Left to autoscale, lightweight-charts fits each series to its own extent,
      so a $10k call bucket would be drawn exactly as tall as a $10M put bucket
      and the zero line would wander off centre. The heaviest leg anywhere sets
      both halves.
    */
    const max = flowMaxLeg(bars);
    if (max > 0) {
      const range = () => ({ priceRange: { minValue: -max, maxValue: max } });
      calls.applyOptions({ autoscaleInfoProvider: range });
      puts.applyOptions({ autoscaleInfoProvider: range });
    }

    remeasurePaneLabels();
  }, [overlays.flow, flowPrints, timeframe, ticker, themeKey, remeasurePaneLabels]);

  /*
    THE NET DRIFT: the same premium the flow band bars, kept as a running total.

    Two LINES, not a histogram, and they share the flow legs' inks because they
    are the flow legs' numbers. The gap between them is the session's lean; the
    slope of each is where money is arriving right now.

    `cumulativeDrift` does the summing and is proved separately
    (scripts/drift-series-proof.ts); this only decides ink, scale and the pane.
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    /* Built on demand and torn down when off — the flow band's rule, and for
       the same measured reason: a pane that is always present adds a separator
       and grows the time axis for every chart in the app, including charts
       whose reader never turns this on. */
    if (!overlays.netDrift) {
      const oldCalls = driftCallsRef.current;
      const oldPuts = driftPutsRef.current;
      driftCallsRef.current = null;
      driftPutsRef.current = null;
      try {
        if (oldCalls) chart.removeSeries(oldCalls);
        if (oldPuts) chart.removeSeries(oldPuts);
      } catch {
        /* already gone */
      }
      remeasurePaneLabels();
      return;
    }

    let calls = driftCallsRef.current;
    let puts = driftPutsRef.current;
    if (!calls || !puts) {
      /* APPENDED, never a fixed index — three optional panes can be open in any
         combination, and hard-coding one is how two of them end up sharing a
         scale that belongs to neither. */
      const paneIndex = chart.panes().length;
      const opts = {
        lineWidth: 2 as const,
        priceFormat: { type: 'volume' as const },
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      };
      calls = chart.addSeries(LineSeries, { ...opts, color: DRIFT_CALL_INK, title: 'Calls' }, paneIndex);
      puts = chart.addSeries(LineSeries, { ...opts, color: DRIFT_PUT_INK, title: 'Puts' }, paneIndex);
      driftCallsRef.current = calls;
      driftPutsRef.current = puts;
      try {
        chart.panes()[0]?.setStretchFactor(PRICE_STRETCH);
        calls.getPane().setStretchFactor(FLOW_STRETCH);
      } catch {
        /* pane sizing is a nicety; never lose the chart over it */
      }
    }

    const barSec = tfMinutes(timeframe) * 60;
    const points = cumulativeDrift(flowPrints ?? [], { barSec, ticker });
    calls.setData(points.map(p => ({ time: p.time as UTCTimestamp, value: p.calls })));
    puts.setData(points.map(p => ({ time: p.time as UTCTimestamp, value: p.puts })));

    /*
      ONE SCALE ACROSS BOTH LINES, anchored at zero.

      Left to autoscale, lightweight-charts fits each series to its own extent,
      so a session where calls took $50M and puts took $2M would draw the two
      lines at the same height and hide the entire story. Both are cumulative
      dollars — the same unit — so they share one range, and the range starts at
      zero because a running total that starts mid-axis exaggerates every wiggle
      in it.
    */
    const peak = driftPeak(points);
    if (peak > 0) {
      const range = () => ({ priceRange: { minValue: 0, maxValue: peak * 1.05 } });
      calls.applyOptions({ autoscaleInfoProvider: range });
      puts.applyOptions({ autoscaleInfoProvider: range });
    }

    remeasurePaneLabels();
  }, [overlays.netDrift, flowPrints, timeframe, ticker, themeKey, remeasurePaneLabels]);

  /*
    THE VOLATILITY DRIFT: what the underlying is doing against what the option
    market says it expects.

    Realised is MEASURED from the same aggregated bars the tape draws, so the
    two agree on every timeframe. Implied is REPORTED by the feed and drawn as
    it arrives — see data/volDrift.ts for why the implied line is currently
    flat and why nothing here invents movement for it.
  */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    /* Frozen during replay, like the compares and the indicators: the vol lines
       are computed off live bars, and letting them run forward while the tape
       is rewound would put two different clocks in one window. */
    if (replayRef.current) return;

    if (!overlays.volDrift) {
      const oldRv = rvRef.current;
      const oldIv = ivRef.current;
      rvRef.current = null;
      ivRef.current = null;
      try {
        if (oldRv) chart.removeSeries(oldRv);
        if (oldIv) chart.removeSeries(oldIv);
      } catch {
        /* already gone */
      }
      remeasurePaneLabels();
      return;
    }

    let rv = rvRef.current;
    let iv = ivRef.current;
    if (!rv || !iv) {
      const paneIndex = chart.panes().length;
      const opts = {
        lineWidth: 1 as const,
        priceFormat: { type: 'custom' as const, formatter: (v: number) => `${v.toFixed(2)}%`, minMove: 0.01 },
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      };
      rv = chart.addSeries(LineSeries, { ...opts, color: RV_INK, title: 'RV' }, paneIndex);
      iv = chart.addSeries(LineSeries, { ...opts, color: IV_INK, title: 'IV' }, paneIndex);
      rvRef.current = rv;
      ivRef.current = iv;
      try {
        chart.panes()[0]?.setStretchFactor(PRICE_STRETCH);
        rv.getPane().setStretchFactor(FLOW_STRETCH);
      } catch {
        /* pane sizing is a nicety; never lose the chart over it */
      }
    }

    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(Simulator.getCandles(ticker) ?? [], mins);
    const rvPoints = realizedVol(bars, mins * 60);
    /* The implied line is drawn only where realised is, so the pane never shows
       a lone flat line hanging over an empty half — the two are read as a PAIR,
       and a spread against nothing is not a spread. */
    const ivPoints = impliedVolLine(Simulator.TICKERS[ticker]?.iv, rvPoints);
    rv.setData(rvPoints.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));
    iv.setData(ivPoints.map(p => ({ time: p.time as UTCTimestamp, value: p.value })));

    /*
      ONE SCALE, FROM ZERO. Both lines are percent, and the distance between
      them is the whole reading — two independently autoscaled lines would put
      realised and implied on top of each other whatever the spread actually
      was, which is the one thing this pane exists to show.
    */
    const ceiling = volCeiling(rvPoints, ivPoints);
    if (ceiling > 0) {
      const range = () => ({ priceRange: { minValue: 0, maxValue: ceiling } });
      rv.applyOptions({ autoscaleInfoProvider: range });
      iv.applyOptions({ autoscaleInfoProvider: range });
    }

    remeasurePaneLabels();
  }, [overlays.volDrift, revision, timeframe, ticker, themeKey, remeasurePaneLabels]);

  /* Indicator overlays (Noah, 2026-08-23) — EMAs and a session-anchored
     VWAP, computed from the SAME aggregated bars the tape draws so they
     agree on every timeframe. Full rebuild when the set/world changes; per
     revision the math re-runs (O(n), trivial) but only the last point is
     pushed to the series. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (replayRef.current) return; // frozen during replay, like compares
    const mins = tfMinutes(timeframe);
    const active = (Object.keys(INDICATOR_INKS) as (keyof ChartIndicators)[]).filter(k => indicators[k]);
    const sig = `${ticker}|${timeframe}|${active.join(',')}|${mainNonce}`;
    const rebuild = indicatorLoadedRef.current !== sig;
    if (rebuild) {
      for (const s of indicatorSeriesRef.current.values()) {
        try {
          chart.removeSeries(s);
        } catch {
          /* chart already torn down */
        }
      }
      indicatorSeriesRef.current.clear();
      for (const key of active) {
        indicatorSeriesRef.current.set(
          key,
          chart.addSeries(LineSeries, {
            color: INDICATOR_INKS[key],
            lineWidth: 1,
            priceScaleId: 'right',
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
        );
      }
      indicatorLoadedRef.current = sig;
    }
    if (active.length === 0) return;
    const bars = aggregateCandles(Simulator.getCandles(ticker) ?? [], mins);
    if (bars.length === 0) return;
    const pointsFor = (key: keyof ChartIndicators) => {
      if (key === 'vwap') {
        // Session-anchored: cumulative typical×volume over cumulative volume,
        // reset at every overnight gap
        const pts: { time: UTCTimestamp; value: number }[] = [];
        let pv = 0;
        let vol = 0;
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          if (i > 0 && b.time - bars[i - 1].time > mins * 60 * 1.5) {
            pv = 0;
            vol = 0;
          }
          const typical = (b.high + b.low + b.close) / 3;
          pv += typical * b.volume;
          vol += b.volume;
          pts.push({ time: b.time as UTCTimestamp, value: vol > 0 ? pv / vol : b.close });
        }
        return pts;
      }
      const period = key === 'ema9' ? 9 : key === 'ema21' ? 21 : 50;
      const k = 2 / (period + 1);
      let ema = bars[0].close;
      return bars.map(b => {
        ema = b.close * k + ema * (1 - k);
        return { time: b.time as UTCTimestamp, value: ema };
      });
    };
    for (const key of active) {
      const s = indicatorSeriesRef.current.get(key);
      if (!s) continue;
      const pts = pointsFor(key);
      if (rebuild) s.setData(pts);
      else s.update(pts[pts.length - 1]);
    }
  }, [indicators, ticker, revision, timeframe, mainNonce]);

  /* Compare lines (Noah, 2026-08-23, TradingView's three flavors). Rebuilt
     when the roster/timeframe/ticker changes, ticked per revision otherwise —
     the same full-load/incremental split the candles use. Scales follow the
     roster: any percent compare flips the WHOLE right scale to % change (the
     levels ride along, exactly as TV does it); any own-scale compare shows
     the left axis; pane compares live in pane 1, which lightweight-charts
     creates and removes with its series. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (replayRef.current) return; // replay owns the tape; compares freeze
    const mins = tfMinutes(timeframe);
    const sig = `${ticker}|${timeframe}|${compares.map(c => `${c.ticker}:${c.mode}:${c.ink}`).join(',')}`;
    const rebuild = compareLoadedRef.current !== sig;
    if (rebuild) {
      for (const s of compareSeriesRef.current.values()) {
        try {
          chart.removeSeries(s);
        } catch {
          /* chart already torn down */
        }
      }
      compareSeriesRef.current.clear();
      for (const c of compares) {
        Simulator.ensureTicker(c.ticker);
        const series = chart.addSeries(
          LineSeries,
          {
            color: c.ink,
            lineWidth: 2,
            priceScaleId: c.mode === 'scale' ? 'left' : 'right',
            priceLineVisible: false,
            lastValueVisible: true,
            title: c.ticker,
          },
          /* Below every product pane that is open, not below the flow band
             alone. The original asked the flow series where it was, which was
             right when flow was the only optional pane; with three of them a
             compare line would land inside whichever one happened to be last
             and inherit a scale pinned to dollars or percent. */
          c.mode === 'pane' ? lastProductPaneIndex() + 1 : 0
        );
        compareSeriesRef.current.set(`${c.ticker}:${c.mode}`, series);
      }
      chart
        .priceScale('right')
        .applyOptions({ mode: compares.some(c => c.mode === 'percent') ? PriceScaleMode.Percentage : PriceScaleMode.Normal });
      chart.applyOptions({
        leftPriceScale: { visible: compares.some(c => c.mode === 'scale'), borderColor: '#1c1c1c' },
      });
      // TV proportions: the tape keeps ~3/4 of the window, the compare pane
      // rides below at ~1/4 (lightweight-charts defaults to an even split)
      const panes = chart.panes();
      if (panes.length > 1) {
        panes[0].setStretchFactor(3);
        for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
      }
      compareLoadedRef.current = sig;
    }
    for (const c of compares) {
      const s = compareSeriesRef.current.get(`${c.ticker}:${c.mode}`);
      if (!s) continue;
      const bars = aggregateCandles(Simulator.getCandles(c.ticker) ?? [], mins);
      if (bars.length === 0) continue;
      if (rebuild) {
        s.setData(bars.map(b => ({ time: b.time as UTCTimestamp, value: b.close })));
      } else {
        const last = bars[bars.length - 1];
        s.update({ time: last.time as UTCTimestamp, value: last.close });
      }
    }
  }, [compares, ticker, revision, timeframe]);

  // Recolor the candle series AND the chart surface in place when the theme
  // picker changes — gallery themes carry their own background tint.
  useEffect(() => {
    const t = getCandleTheme();
    const main = candleSeriesRef.current;
    if (main) {
      // Recolor IN the active style's vocabulary — baseline keeps its fixed
      // bull/bear pair and needs nothing
      const style = styleRef.current;
      if (style === 'candles') main.applyOptions(candleSeriesOptions(t));
      else if (style === 'hollow') {
        const surface = chartSurface(t).bg;
        main.applyOptions({
          ...candleSeriesOptions(t),
          upColor: surface === 'transparent' ? 'rgba(0,0,0,0)' : surface,
          borderUpColor: t.borderUp ?? t.up,
          wickUpColor: t.wickUp,
        });
      } else if (style === 'bars') (main as unknown as ISeriesApi<'Bar'>).applyOptions({ upColor: t.up, downColor: t.down });
      else if (style === 'line' || style === 'step') (main as unknown as ISeriesApi<'Line'>).applyOptions({ color: t.up });
      else if (style === 'area')
        (main as unknown as ISeriesApi<'Area'>).applyOptions({ lineColor: t.up, topColor: `${t.up}40`, bottomColor: `${t.up}05` });
    }
    const s = chartSurface(t);
    chartRef.current?.applyOptions({
      layout: { background: { color: s.bg } },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    });
  }, [themeKey, mainNonce]);

  // Candle data + trails: full load on ticker/timeframe/theme change, incremental
  // per tick (theme forces a reload because volume bars carry per-bar colors)
  useEffect(() => {
    if (replayRef.current) return; // replay owns the series while active
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const trails = trailsRef.current;
    if (!chart || !candleSeries || !volumeSeries || !trails) return;

    const base = Simulator.getCandles(ticker);
    if (!base || base.length === 0) return;

    const theme = getCandleTheme();
    const mins = tfMinutes(timeframe);
    const bars = aggregateCandles(base, mins);
    barCountRef.current = bars.length;
    drawingsRef.current?.setBarTimes(bars.map(b => b.time));

    const loaded = loadedRef.current;
    const changed = loaded.ticker !== ticker || loaded.timeframe !== timeframe || loaded.theme !== themeKey;
    const newWorld = loaded.ticker !== ticker || loaded.timeframe !== timeframe;

    lastCloseRef.current = bars.length ? bars[bars.length - 1].close : null;
    if (bars.length) {
      lastBarTimeRef.current = bars[bars.length - 1].time;
      bucketSecRef.current = mins * 60;
      ensureRunway(lastBarTimeRef.current, bucketSecRef.current);
    }


    if (changed) {
      candleSeries.setData(bars.map(toMain));
      volumeSeries.setData(bars.map(b => toVolume(b, theme)));
      // Baseline style pivots on the CURRENT session's open — found at the
      // last overnight gap in the aggregated bars (intraday only; dailies
      // fall back to the buffer's first open)
      if (styleRef.current === 'baseline' && bars.length > 0) {
        let baseValue = bars[0].open;
        for (let i = bars.length - 1; i > 0; i--) {
          if (bars[i].time - bars[i - 1].time > mins * 60 * 1.5) {
            baseValue = bars[i].open;
            break;
          }
        }
        (candleSeries as unknown as ISeriesApi<'Baseline'>).applyOptions({ baseValue: { type: 'price', price: baseValue } });
      }
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
      candleSeries.update(toMain(last));
      volumeSeries.update(toVolume(last, theme));
    }

    // LED trails are intraday-only — dailies would smear the session structure.
    // The field keeps a FINER clock than the bars (Noah, 2026-08-22: one bead
    // per 30m/1h bar was a row of pearls): every 5 minutes of real history
    // is a bead, tiled across its bar by its time — six to a 30m bar, twelve
    // to an hour. More beads, same data.
    const baseGex = Simulator.getGexHistory(ticker);
    const snaps = aggregateSnapshots(baseGex ?? [], Math.min(mins, TRAIL_TEXTURE_MINUTES));
    const showTrails = overlays.trails && mins <= INTRADAY_MAX_MINUTES;
    trails.labelPx = compact ? 8.5 : 9.5;
    trails.setData(snaps, snapshotsMaxAbs(snaps), showTrails, mins * 60);
  }, [ticker, revision, timeframe, themeKey, overlays.trails, showRecent, reloadNonce, mainNonce, toMain, compact]);

  /* `compact` can change without the chart being rebuilt — a desktop window
     dragged across the phone line, a handset rotated. The mount effect read it
     once at create time, so apply later changes here. */
  useEffect(() => {
    chartRef.current?.applyOptions({ layout: { fontSize: compact ? 9 : 10 } });
  }, [compact]);

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
    for (const spec of LINE_LEVELS) {
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
  }, [ticker, overlays.levels, replay, mainNonce]);

  /*
    THE LIVE PRICE, as a card on the right scale.

    The library draws a flat one-line tag for the last value. This replaces it
    with the two-line card from the reference: the price, a hairline, and the
    time left in the current bar. So the library's own tag has to go, or there
    are two labels at the same y arguing with each other — `lastValueVisible`
    is turned off for exactly as long as the card is on, and restored if it
    ever goes off.

    Frame loop, not a one-second timer, and the reason is the position rather
    than the clock: the card's y is priceToCoordinate(lastClose), which moves
    when the price ticks, when the autoscale re-fits, AND when the reader pans
    or zooms. A timer leaves the card stranded on every one of those. It
    writes nothing it does not have to — price, countdown and transform are
    each compared before they are set — so a still chart on a still second
    does no DOM work at all.

    Hidden during replay: a countdown to the next live bar is a lie about
    history.
  */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const on = priceTag && !replay;
    series.applyOptions({ lastValueVisible: !on });
    if (!on) return;

    const chart = chartRef.current;
    const el = priceTagRef.current;
    if (!chart || !el) return;
    const priceEl = el.firstElementChild as HTMLElement | null;
    const timeEl = el.lastElementChild as HTMLElement | null;
    if (!priceEl || !timeEl) return;

    const bucket = Math.max(60, tfMinutes(timeframe) * 60);
    let shownPrice = '';
    let shownLeft = '';
    let shownY = Number.NaN;

    const frame = () => {
      priceTagRafRef.current = requestAnimationFrame(frame);
      const price = lastCloseRef.current;
      const y = price == null ? null : series.priceToCoordinate(price);
      if (price == null || y == null) {
        if (!Number.isNaN(shownY)) {
          el.style.opacity = '0';
          shownY = Number.NaN;
        }
        return;
      }

      const p = price.toFixed(2);
      if (p !== shownPrice) {
        priceEl.textContent = p;
        shownPrice = p;
      }

      const left = bucket - (Math.floor(Date.now() / 1000) % bucket);
      const pad = (v: number) => String(v).padStart(2, '0');
      const hh = Math.floor(left / 3600);
      const t = hh > 0
        ? `${hh}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
        : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      if (t !== shownLeft) {
        timeEl.textContent = t;
        shownLeft = t;
      }

      /* Centred on the price, the way the tag it replaces was. */
      const top = Math.round(y);
      if (top !== shownY) {
        el.style.transform = `translateY(${top}px) translateY(-50%)`;
        el.style.opacity = '1';
        shownY = top;
      }
    };

    priceTagRafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(priceTagRafRef.current);
      candleSeriesRef.current?.applyOptions({ lastValueVisible: true });
    };
  }, [priceTag, timeframe, replay, mainNonce]);

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
  }, [prints, overlays.darkpool, replay, mainNonce]);

  // Tween level prices to their new scan values — lines glide, never teleport
  useEffect(() => {
    const lines = levelLinesRef.current;
    if (!lines.king) return; // levels hidden

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
  }, [focusPrice, overlays.trails, timeframe, mainNonce]);

  /*
    ALERT LINES.

    Rehung whole whenever the set changes or the main series is replaced — a
    style swap destroys the old series and every price line hanging off it, and
    `mainNonce` is how the rest of this file already hears about that.

    An alert that has fired is drawn solid and named; one still waiting is
    dashed and quiet. The state lives HERE and not on the toolbar's bell,
    because the toolbar is hidden until the cursor is over its own pane — a
    badge there would be invisible almost all the time, which would make
    "you'll see it fire" untrue.
  */
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const live = alertLinesRef.current;
    for (const line of live.values()) {
      try {
        series.removePriceLine(line);
      } catch {
        /* series already gone with the old style */
      }
    }
    live.clear();
    for (const a of alerts) {
      live.set(
        a.id,
        series.createPriceLine({
          price: a.price,
          color: ALERT_INK,
          title: a.firedAt ? 'ALERT' : '',
          lineStyle: a.firedAt ? LineStyle.Solid : LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
        })
      );
    }
    return () => {
      for (const line of live.values()) {
        try {
          series.removePriceLine(line);
        } catch {
          /* chart already torn down */
        }
      }
      live.clear();
    };
  }, [alerts, mainNonce]);

  /*
    FIRING.

    Driven by the tape rather than by a timer: `revision` bumps on every tick
    and this runs with the close that tick produced. Replay is excluded — a
    price from history reaching a level the reader set today has not happened.

    `markFired` is idempotent, so a close that sits past an alert for the rest
    of the session does not repaint every pane on every tick.
  */
  useEffect(() => {
    if (replay) return;
    const close = lastCloseRef.current;
    if (close == null) return;
    const now = Date.now();
    for (const a of alerts) {
      if (a.firedAt) continue;
      if (a.above ? close >= a.price : close <= a.price) markFired(ticker, a.id, now);
    }
  }, [alerts, ticker, revision, replay]);

  /* The focus INK follows the strike's standing, re-read every scan: magenta
     while the focused strike is the king, lime otherwise. The focus itself
     never moves — if 510 loses the crown, 510 turns lime and stays (Noah,
     2026-08-22); the new king keeps its own line. Line and trail agree. */
  useEffect(() => {
    const isKing = focusPrice != null && Math.abs(levels.king - focusPrice) < 1e-9;
    trailsRef.current?.setFocus(focusPrice, isKing ? 'king' : 'focus');
    /*
      ══ "KEY LEVELS" IS A SWITCH THAT NOW SWITCHES SOMETHING ══════════════

      It did nothing. `overlays.levels` gated exactly one loop — over
      LINE_LEVELS, which is `[]` because the axis capsules were deliberately
      removed (see its comment above). So the toggle had nothing left to turn
      off, while its menu row went on offering "CW · PW · flip · king".

      Measured before this change: toggling it moved 23 pixels of a 1240x804
      plot, against 795 pixels of drift on an untouched chart over the same
      interval — its entire effect was 34x below the tape's own tick noise.

      The levels were never missing, though: they are ON THE FIELD, as the
      bead inks and the dotted flip line, and the primitive already keeps
      those as four settable prices. Feeding it nulls is exactly "draw the
      exposure field with nothing named on it", which is what the label
      promises. No primitive change, and `trails` still owns the field itself.
    */
    const showLevels = overlays.levels;
    trailsRef.current?.setKing(showLevels && Number.isFinite(levels.king) ? levels.king : null);
    trailsRef.current?.setWalls(
      showLevels && Number.isFinite(levels.callWall) ? levels.callWall : null,
      showLevels && Number.isFinite(levels.putWall) ? levels.putWall : null,
      showLevels && Number.isFinite(levels.flip) ? levels.flip : null
    );
    focusLineRef.current?.applyOptions({ color: isKing ? KING : FOCUS });
  }, [focusPrice, overlays.levels, levels.king, levels.callWall, levels.putWall, levels.flip]);

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
      const bars = aggregateCandles(Simulator.getCandles(ticker) ?? [], mins);
      const snaps = aggregateSnapshots(Simulator.getGexHistory(ticker) ?? [], Math.min(mins, TRAIL_TEXTURE_MINUTES));
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
      candleSeries.update(toMain(bar));
      volumeSeries.update(toVolume(bar, theme));
    } else {
      const visible = data.bars.slice(0, idx);
      candleSeries.setData(visible.map(toMain));
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

  return (
    <div className="flex flex-col h-full">
      {/* No legend row — the chart owns the whole widget; inks are taught by
          the field itself, dbl-click resets the view (Noah, 2026-08-23) */}
      <div
        className={`relative flex-grow overflow-hidden ${
          frameless ? '' : 'border border-borderSubtle bg-inset rounded-md'
        }`}
        style={{ minHeight: height }}
        onDoubleClick={resetView}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {/* Every band says its own name, the way the reference does. An
            unlabelled strip under a chart is a puzzle; `pointer-events-none` so
            the tape still pans straight through them. Positions are measured
            off the live layout — see remeasurePaneLabels. */}
        {paneLabels.map(l => {
          const look = PANE_LABEL_LOOK[l.key];
          if (!look) return null;
          return (
            <span
              key={l.key}
              aria-hidden
              className="pointer-events-none absolute left-2 z-10 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest"
              style={{ bottom: l.bottom, background: look.bg, color: look.fg }}
            >
              {look.text}
            </span>
          );
        })}

        {/* Pinned to the container's right edge and moved down it by
            transform, so it rides the price scale rather than being re-laid
            out. The soft slate fill and the hairline are the reference's. */}
        {priceTag && !replay && (
          <div
            ref={priceTagRef}
            aria-hidden
            className="pointer-events-none absolute top-0 right-1 z-10 min-w-[68px] rounded-[9px] border border-white/[0.14] px-2 py-1 text-center opacity-0 shadow-lg shadow-black/40"
            style={{ background: 'rgba(72,78,98,0.92)', backdropFilter: 'blur(2px)' }}
          >
            <div className="font-mono text-[12px] font-bold leading-[15px] tnum text-white" />
            <div className="mt-[3px] border-t border-white/25 pt-[3px] font-mono text-[11px] leading-[13px] tnum text-white/85" />
          </div>
        )}

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
