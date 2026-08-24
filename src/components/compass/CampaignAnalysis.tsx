/*
==================================================
  SLAYER TERMINAL - CAMPAIGN ANALYSIS (Compass)
  Full analysis for the slow scanners: the campaign
  on a live chart. TP1–TP4 underlying milestones and
  the calculated floor are drawn on the candles
  (TradingView's lightweight-charts — the house
  engine), with the premium ladder, thesis and floor
  rule alongside. States, never orders.
==================================================
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { AlertTriangle, ArrowLeft, Bookmark, Check, Droplets, Info, LayoutGrid, ShieldAlert } from 'lucide-react';
import Feed from '../../core/feed';
import { getCandleTheme, useCandleThemeKey, candleSeriesOptions, chartSurface } from '../gex/candleTheme';
import ChartToolbar from '../gex/ChartToolbar';
import type { ChartOverlays } from '../gex/StrikeChart';
import { CALL_WALL, PUT_WALL, FLIP, KING } from '../gex/palette';
import { TIMEFRAMES, tfMinutes, aggregateCandles, type Timeframe } from '../../data/timeframe';
import { buildLevelsFor } from '../../data/gex';
import Panel from '../ui/Panel';
import CardTabs from '../ui/CardTabs';
import SignalBadge from '../ui/SignalBadge';
import AnimatedNumber from '../ui/AnimatedNumber';
import RichRead from '../ui/RichRead';
import GreeksRow from './GreeksRow';
import VerdictBadge from './VerdictBadge';
import ContractFacts from './ContractFacts';
import ContractTrack from './ContractTrack';
import SetupDrivers from './SetupDrivers';
import { buildSetupDrivers, estimatePremium } from '../../data/compass';
import { spotForPremium } from './trackModel';
import { useTracker } from '../../context/TrackerContext';
import {
  VERDICT_LABEL,
  type DriverRow,
  type OptionRight,
  type ScannerKey,
  type Setup,
  type SleeveKey,
} from '../../types/compass';

interface CampaignAnalysisProps {
  setup: Setup;
  /** Bumps every simulator tick — drives incremental candle updates */
  revision: number;
  /** The underlying, live — the facts strip and ladder inversions speak in it */
  spot: number;
  /** The lens that graded this setup — tracking files under it */
  scanner: ScannerKey;
  /** The tenor — it decides which exit-clock copy the floor panel speaks */
  sleeve: SleeveKey;
  /** Provenance: the sweep this row was opened with */
  gradedAt?: string;
  /** One step back along the trail — the previous contract, or the board at the root */
  onBack: () => void;
  /** Where Back goes, named on the button: a contract, or "Board" */
  backLabel?: string;
  /** The way home when Back means something else — only offered deeper in a trail */
  home?: { label: string; onClick: () => void };
  /** Re-point this page at another contract on the same book (a driver row click). */
  onOpenContract?: (strike: number, right: OptionRight) => void;
}

/** The driver list sweeps on the scan tier — structure must not vibrate with every tick. */
const DRIVERS_SCAN_MS = 10_000;

/** The campaign's story, stamped ON the tape (Noah's sketch, 2026-08-09):
    the entry premium on the bar it was graded, and each banked TP on the
    candle that actually crossed it. */
export interface CampaignEntry {
  /** Bar time (UTC seconds) of the sweep that opened this review */
  time: number;
  /** The graded mid — frozen at open, like the provenance line */
  mid: number;
}
export interface CampaignHit {
  /** TP rung, 1-based */
  level: number;
  /** Bar time (UTC seconds) of the candle that crossed the target */
  time: number;
}
export interface CampaignBreak {
  /** Bar time (UTC seconds) of the candle that CLOSED through the floor */
  time: number;
  /** That bar's close */
  price: number;
  /** The floor as it stood when it broke — frozen for the post-mortem */
  floor: number;
}

interface CampaignChartProps {
  setup: Setup;
  revision: number;
  entry: CampaignEntry | null;
  hits: CampaignHit[];
  brk: CampaignBreak | null;
  timeframe: Timeframe;
  overlays: ChartOverlays;
}

/** Campaign chart preferences — persisted like Pulse's ('slayer_chart_overlays'
    is Pulse's key; the campaign map keeps its own diet). Trails and dark pool
    are deliberately NOT offered here: whole-market texture drowns a one-trade
    story. Volume is on by default; structural levels are opt-in axis chips. */
const CAMPAIGN_CHART_LS = 'slayer_campaign_chart';
const CAMPAIGN_OVERLAY_DEFAULTS: ChartOverlays = { trails: false, levels: false, darkpool: false, volume: true };
const loadChartPrefs = (): { timeframe: Timeframe; overlays: ChartOverlays } => {
  try {
    const raw = localStorage.getItem(CAMPAIGN_CHART_LS);
    if (raw) {
      const p = JSON.parse(raw) as Partial<{ timeframe: Timeframe; overlays: Partial<ChartOverlays> }>;
      return {
        timeframe: TIMEFRAMES.some(t => t.value === p.timeframe) ? (p.timeframe as Timeframe) : '1m',
        overlays: { ...CAMPAIGN_OVERLAY_DEFAULTS, ...(p.overlays && typeof p.overlays === 'object' ? p.overlays : {}) },
      };
    }
  } catch {
    /* corrupted prefs fall back to defaults */
  }
  return { timeframe: '1m', overlays: { ...CAMPAIGN_OVERLAY_DEFAULTS } };
};

/** Candles with the campaign's levels: TP milestones (lime), floor (red). */
const CampaignChart = ({ setup, revision, entry, hits, brk, timeframe, overlays }: CampaignChartProps) => {
  const themeKey = useCandleThemeKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** Structural level chips (CW/PW/flip/king) — separate from the campaign's
      own TP/floor lines so the two layers never fight over one ref. */
  const structLinesRef = useRef<IPriceLine[]>([]);
  /** Levels the OPENING view must include (TP1 + the floor) — read by the
      candle series' autoscale provider, updated when the setup changes. */
  const scaleLevelsRef = useRef<number[]>([]);
  /** Which setup the chart last framed itself for — the ONLY trigger that
      may re-engage autoscale. Values drift per tick; identity doesn't. */
  const framedForRef = useRef<string | null>(null);
  const loadedRef = useRef<{ ticker: string; tf: string; length: number }>({ ticker: '', tf: '', length: 0 });

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
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: s0.grid } },
      rightPriceScale: { borderColor: '#1c1c1c' },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 6 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#262626' },
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      ...candleSeriesOptions(getCandleTheme()),
      /* The opening view must SHOW the campaign: TP1 and the floor join the
         visible range (Noah, 2026-08-10 — "I have to scroll out quite a bit
         to see the tp and floor lines"). Same pattern as StrikeChart's
         walls/king. The user still pans and zooms freely from there — manual
         interaction suspends autoscale as usual. */
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        const extras = scaleLevelsRef.current.filter(v => Number.isFinite(v));
        if (!base || extras.length === 0) return base;
        let { minValue, maxValue } = base.priceRange;
        for (const v of extras) {
          if (v < minValue) minValue = v;
          if (v > maxValue) maxValue = v;
        }
        const pad = Math.max((maxValue - minValue) * 0.06, 0.01);
        return { priceRange: { minValue: minValue - pad, maxValue: maxValue + pad } };
      },
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
    markersRef.current = createSeriesMarkers(candles);

    /* The frame belongs to the user after first touch (Noah, 2026-08-09 —
       "only on first open/load... after that its on the user"). The library
       only suspends price autoscale on an AXIS drag; wheel-zooming the
       candles keeps it on, so every tick would re-fit around TP1+floor and
       yank the view back. First wheel/pointer on the chart freezes the price
       scale outright. Re-frames: a new setup (effect below) or the built-in
       double-click on the price axis — both deliberate. */
    const freezeScale = () => chart.priceScale('right').applyOptions({ autoScale: false });
    container.addEventListener('wheel', freezeScale, { passive: true });
    container.addEventListener('pointerdown', freezeScale);

    return () => {
      container.removeEventListener('wheel', freezeScale);
      container.removeEventListener('pointerdown', freezeScale);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
      linesRef.current = [];
      structLinesRef.current = [];
      loadedRef.current = { ticker: '', tf: '', length: 0 };
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
    const bars = aggregateCandles(Feed.getCandles(setup.ticker) ?? [], tfMinutes(timeframe));
    if (bars.length > 0 && volumeRef.current) {
      volumeRef.current.setData(
        bars.map(b => ({
          time: b.time as UTCTimestamp,
          value: b.volume,
          color: b.close >= b.open ? t.volUp : t.volDown,
        }))
      );
    }
  }, [themeKey, setup.ticker, timeframe]);

  // Volume overlay toggle — the series stays mounted, it just goes quiet
  useEffect(() => {
    volumeRef.current?.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  // Structural levels (CW/PW/flip/king) as QUIET AXIS CHIPS — lineVisible off,
  // label on. The campaign's own TP/floor lines keep the chart's ink; these
  // let the user check the thesis against the structure without a second
  // layer of full-width lines fighting it. Redrawn per tick while enabled
  // (the book drifts), removed entirely when toggled off.
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries) return;
    for (const line of structLinesRef.current) candleSeries.removePriceLine(line);
    structLinesRef.current = [];
    if (!overlays.levels) return;
    const lv = buildLevelsFor(setup.ticker);
    const chip = (price: number, title: string, color: string) =>
      candleSeries.createPriceLine({
        price,
        color,
        title,
        lineStyle: LineStyle.Solid,
        lineWidth: 1,
        lineVisible: false,
        axisLabelVisible: true,
        axisLabelColor: color,
        axisLabelTextColor: '#0a0a0a',
      });
    structLinesRef.current = [
      chip(lv.callWall, 'CW', CALL_WALL),
      chip(lv.putWall, 'PW', PUT_WALL),
      chip(lv.flip, 'FLIP', FLIP),
      chip(lv.king, 'KING', KING),
    ];
  }, [overlays.levels, setup.ticker, revision]);

  // Candles — incremental per tick, aggregated to the selected timeframe
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    const raw = Feed.getCandles(setup.ticker);
    if (!raw || raw.length === 0) return;
    const bars = aggregateCandles(raw, tfMinutes(timeframe));
    if (bars.length === 0) return;

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
    const reframe = loaded.ticker !== setup.ticker || loaded.tf !== timeframe;
    if (reframe || Math.abs(bars.length - loaded.length) > 1) {
      candleSeries.setData(bars.map(toCandle));
      volumeSeries.setData(bars.map(toVolume));
      if (reframe) {
        // New name or new interval — re-frame the TIME axis. The price
        // scale's frozen/live state is the user's and stays untouched.
        const len = bars.length;
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - 120), to: len + 4 });
      }
      loadedRef.current = { ticker: setup.ticker, tf: timeframe, length: bars.length };
    } else {
      const last = bars[bars.length - 1];
      candleSeries.update(toCandle(last));
      volumeSeries.update(toVolume(last));
      loaded.length = bars.length;
    }
  }, [setup.ticker, revision, timeframe]);

  // The campaign stamped on the tape: entry on the bar it was graded, each
  // banked TP on the candle that crossed it. Direction places them — a call
  // enters off a low and banks at highs; a put mirrors.
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;
    const call = setup.right === 'C';
    // Markers pin to BARS: event times are 1-minute truth, so on coarser
    // intervals they snap to their containing bucket's candle.
    const bucketSec = tfMinutes(timeframe) * 60;
    const bucket = (t: number) => (bucketSec <= 60 ? t : Math.floor(t / bucketSec) * bucketSec);
    const markers: SeriesMarker<Time>[] = [];
    if (entry) {
      markers.push({
        time: bucket(entry.time) as UTCTimestamp,
        position: call ? 'belowBar' : 'aboveBar',
        color: '#ededed',
        shape: 'circle',
        text: `ENTRY @${entry.mid.toFixed(2)}`,
        size: 1,
      });
    }
    for (const h of hits) {
      markers.push({
        time: bucket(h.time) as UTCTimestamp,
        position: call ? 'aboveBar' : 'belowBar',
        color: '#30D158',
        shape: call ? 'arrowUp' : 'arrowDown',
        text: `TP${h.level} ✓`,
        size: 1,
      });
    }
    if (brk) {
      markers.push({
        time: bucket(brk.time) as UTCTimestamp,
        position: call ? 'belowBar' : 'aboveBar',
        color: '#FF3B30',
        shape: call ? 'arrowDown' : 'arrowUp',
        text: 'FLOOR ✗',
        size: 1,
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    plugin.setMarkers(markers);
  }, [entry, hits, brk, setup.right, timeframe]);

  // Campaign levels — UN-BANKED TP milestones, the floor, and the strike.
  // A hit TP's line comes DOWN: the banked rung lives on its candle marker
  // now (Noah's sketch, 2026-08-09), so the chart only draws what's still
  // to be won.
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries) return;
    for (const line of linesRef.current) candleSeries.removePriceLine(line);
    const lines: IPriceLine[] = [];
    const banked = new Set(hits.map(h => h.level));

    // A retired campaign draws NO future business: un-banked TP lines come
    // down with the thesis; what was banked already lives on its candles.
    if (!brk) {
      setup.priceTargets.forEach((price, i) => {
        if (banked.has(i + 1)) return;
        lines.push(
          candleSeries.createPriceLine({
            price,
            color: 'rgba(48,209,88,0.55)',
            title: `TP${i + 1}`,
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            axisLabelVisible: true,
            axisLabelColor: 'rgba(48,209,88,0.6)',
            axisLabelTextColor: '#0a0a0a',
          })
        );
      });
    }

    // Broken: the floor freezes where it broke (the live value drifts with
    // spot, but the post-mortem must show the line that ended the campaign).
    lines.push(
      candleSeries.createPriceLine({
        price: brk ? brk.floor : setup.invalidationPrice,
        color: 'rgba(255,59,48,0.9)',
        title: brk ? 'FLOOR ✗' : 'FLOOR',
        lineStyle: LineStyle.Solid,
        lineWidth: 2,
        axisLabelVisible: true,
        axisLabelColor: '#FF3B30',
        axisLabelTextColor: '#0a0a0a',
      })
    );

    lines.push(
      candleSeries.createPriceLine({
        price: setup.strike,
        color: 'rgba(237,237,237,0.35)',
        title: 'STRIKE',
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        axisLabelVisible: false,
      })
    );

    linesRef.current = lines;

    /* Feed the autoscale provider: TP1 + the floor are the campaign's
       opening frame ("at least tp1 and floor" — TP2-4 stay reachable by
       zooming out, so the candles keep their room). Re-engage autoscale on
       a NEW SETUP ONLY — the levels themselves drift with spot every tick
       (invalidation/targets derive from it), so comparing values re-framed
       every second and yanked the user's zoom (Noah caught it live). After
       the first frame, the view belongs to the user. */
    scaleLevelsRef.current = [setup.priceTargets[0], setup.invalidationPrice];
    if (framedForRef.current !== setup.id) {
      framedForRef.current = setup.id;
      chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    }
  }, [setup.id, setup.priceTargets, setup.invalidationPrice, setup.strike, hits, brk]);

  return <div ref={containerRef} className="absolute inset-0" />;
};

const CampaignAnalysis = ({
  setup,
  revision,
  spot,
  scanner,
  sleeve,
  gradedAt,
  onBack,
  backLabel = 'Back',
  home,
  onOpenContract,
}: CampaignAnalysisProps) => {
  const { trackSetup, untrackSetup, isTracked } = useTracker();
  const tracked = isTracked(setup.id);
  const active = setup.verdict === 'ENTER';

  /* ENTRY = the bar on the tape when this review opened — and with it, THE
     WHOLE CAMPAIGN FROZEN: entry premium, price targets, premium ladder,
     floor. The engine derives targets as a percentage OF SPOT and this page
     regrades every tick, so live targets recede exactly as fast as price
     approaches them (Noah caught it: "same side magnets" — measured: spot
     +0.29 toward TP1 while TP1 fled +0.41). A campaign whose milestones move
     is unhittable by construction. Frozen at open, the same anchor as the
     provenance line: the numbers that earned the click must not silently
     become other numbers. */
  const entryRef = useRef<
    | (CampaignEntry & {
        id: string;
        priceTargets: number[];
        invalidationPrice: number;
        takeProfits: Setup['takeProfits'];
      })
    | null
  >(null);
  {
    const bars = Feed.getCandles(setup.ticker);
    if (entryRef.current?.id !== setup.id && bars && bars.length > 0) {
      entryRef.current = {
        id: setup.id,
        time: bars[bars.length - 1].time,
        mid: setup.mid,
        priceTargets: setup.priceTargets,
        invalidationPrice: setup.invalidationPrice,
        takeProfits: setup.takeProfits,
      };
    }
  }
  const entry = entryRef.current && entryRef.current.id === setup.id ? entryRef.current : null;

  /* The campaign view of the setup: defining fields frozen at open, market
     reads (liveMid, score, greeks, spread) live. Every campaign surface on
     this page — chart lines, ladder, floor panel, facts, track — speaks c,
     never the regrading setup. */
  const c = useMemo<Setup>(
    () =>
      entry
        ? {
            ...setup,
            mid: entry.mid,
            priceTargets: entry.priceTargets,
            invalidationPrice: entry.invalidationPrice,
            takeProfits: entry.takeProfits,
          }
        : setup,
    [setup, entry]
  );

  /* TP hits AND the floor break are read off the TAPE, not the simulator's
     rolled status flags — every event must have a candle to point at, and
     the chart, the ladder and the count must all tell one story. Judged
     against the FROZEN campaign levels (c), latched with a scan watermark
     for cheap incremental sweeps — and once the floor breaks, nothing banks
     after it: the campaign died first. */
  const tapeRef = useRef<{ id: string; scanned: number; hits: Map<number, number>; brk: CampaignBreak | null }>({
    id: '',
    scanned: 0,
    hits: new Map(),
    brk: null,
  });
  const { tpHits, floorBreak } = useMemo(() => {
    if (!entry) return { tpHits: [] as CampaignHit[], floorBreak: null as CampaignBreak | null };
    if (tapeRef.current.id !== setup.id) {
      tapeRef.current = { id: setup.id, scanned: entry.time, hits: new Map(), brk: null };
    }
    const st = tapeRef.current;
    if (!st.brk) {
      const bars = Feed.getCandles(setup.ticker) ?? [];
      for (const b of bars) {
        if (b.time <= st.scanned) continue;
        st.scanned = b.time;
        c.priceTargets.forEach((target, i) => {
          if (!st.hits.has(i + 1) && (setup.right === 'C' ? b.high >= target : b.low <= target)) {
            st.hits.set(i + 1, b.time);
          }
        });
        if (setup.right === 'C' ? b.close < c.invalidationPrice : b.close > c.invalidationPrice) {
          st.brk = { time: b.time, price: b.close, floor: c.invalidationPrice };
          break;
        }
      }
    }
    return {
      tpHits: [...st.hits.entries()].map(([level, time]) => ({ level, time })).sort((a, b) => a.level - b.level),
      floorBreak: st.brk,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, c, setup.id, setup.right, setup.ticker, revision]);
  const retired = floorBreak != null;

  /* The contracts driving THIS setup — its own strike, the walls, king, pin,
     and the heaviest hedging between spot and the final target — read off
     the name's live book on the scan clock (a 1s rebuild would make the
     table vibrate), re-read at once when the contract changes. */
  const driversRef = useRef<{ key: string; at: number; rows: DriverRow[] }>({ key: '', at: 0, rows: [] });
  const drivers = useMemo(() => {
    const st = driversRef.current;
    const key = `${setup.ticker}-${setup.strike}-${setup.right}-${sleeve}`;
    const now = Date.now();
    if (st.key !== key || now - st.at >= DRIVERS_SCAN_MS) {
      st.key = key;
      st.at = now;
      try {
        st.rows = buildSetupDrivers(Feed.snapshotFor(setup.ticker), c, sleeve);
      } catch {
        st.rows = [];
      }
    }
    return st.rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.ticker, setup.strike, setup.right, sleeve, revision]);

  const breakTimeLabel = floorBreak
    ? new Date(floorBreak.time * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  const bankedLevels = useMemo(() => new Set(tpHits.map(h => h.level)), [tpHits]);
  /* Retired: no rung is "working" anymore — the ladder freezes. */
  const workingLevel = retired
    ? null
    : (c.takeProfits.map((_, i) => i + 1).find(l => !bankedLevels.has(l)) ?? null);
  const ladderStatus = (i: number): 'HIT' | 'IN PROGRESS' | 'PENDING' =>
    bankedLevels.has(i + 1) ? 'HIT' : i + 1 === workingLevel ? 'IN PROGRESS' : 'PENDING';
  const hitCount = bankedLevels.size;

  /* Chart controls — the Pulse kit (timeframes, overlays, candles) scoped to
     this chart's diet, persisted across opens. */
  const [timeframe, setTimeframe] = useState<Timeframe>(() => loadChartPrefs().timeframe);
  const [overlays, setOverlays] = useState<ChartOverlays>(() => loadChartPrefs().overlays);
  useEffect(() => {
    localStorage.setItem(CAMPAIGN_CHART_LS, JSON.stringify({ timeframe, overlays }));
  }, [timeframe, overlays]);

  /* Fullscreen chart takeover — the Pulse contract verbatim: 'contents'
     wrapper keeps the grid slot when docked, fullscreen lifts the SAME panel
     (no remount, the chart keeps its view), Esc exits, page scroll locks. */
  const [chartFull, setChartFull] = useState(false);
  /* The card speaks in tabs (Noah, 2026-08-17: "so over information doesnt
     hit the user") — Campaign = the trade's structure, Contract = the
     instrument's dollars. The verdict strip and confidence stay persistent. */
  const [cardTab, setCardTab] = useState<'campaign' | 'contract'>('campaign');
  /* The chart slot has two instruments (Noah, 2026-08-17: "i want a button
     ... that allows us to go to that chart"): Stock = the underlying's tape
     (the campaign map), Premium = the contract's modeled premium track
     (ContractTrack, resurrected). Same toggle rides on both panels. */
  const [chartView, setChartView] = useState<'stock' | 'premium'>('stock');
  useEffect(() => {
    if (!chartFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChartFull(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [chartFull]);

  /* Ladder inversions: each premium rung, restated as the underlying level
     that pays it — priced by THE model that minted the mid (one-pricer rule). */
  const iv = setup.greeks.iv / 100;
  const sessions = Math.max(setup.sessionsLeft, 0.5);
  const priceAt = (s: number, sess: number) =>
    estimatePremium(s, setup.strike, setup.right, iv, Math.max(sess, 0.05) / 252);
  const needFor = (target: number) => spotForPremium(target, setup.right, priceAt, sessions, spot);

  /* The exit clock speaks the HOLD's calendar — a year-long trade must never
     read "otherwise it runs into Friday", and a scalp's real clock is its own. */
  const clockCopy =
    scanner === 'quick-scalp'
      ? "Through it the scalp is over — and the scalp's own clock retires it well before the contract's expiry does."
      : sleeve === 'odte'
        ? "A close through it retires the campaign — and nothing here outlives today's close anyway."
        : sleeve === 'weekly'
          ? 'A close through it retires the campaign — otherwise it runs into Friday.'
          : 'The only exit clock this trade has: a close through it and the campaign retires.';

  return (
    <div className="flex flex-col gap-4">
      {/* Campaign header */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Back NAMES where it goes (Noah, 2026-08-19: from a driver contract,
            Back is the previous contract, not the board) — and when it means
            a contract, the board gets its own door beside it. */}
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:-translate-x-0.5" /> {backLabel}
        </button>
        {home && (
          <button
            onClick={home.onClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-borderSubtle bg-white/[0.02] hover:bg-white/[0.05] font-mono text-[11px] uppercase tracking-wider text-textSecondary hover:text-textPrimary transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5" /> {home.label}
          </button>
        )}
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[12px] font-semibold ${
            setup.right === 'C' ? 'border-bull/30 bg-bull/10 text-bull' : 'border-bear/30 bg-bear/10 text-bear'
          }`}
        >
          {setup.contract}
        </span>
        {/* A dead campaign never wears a live verdict — RETIRED is a tape
            fact and it outranks the engine's ongoing read of the contract. */}
        {retired ? (
          <span
            className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]"
            style={{ background: 'rgba(255,59,48,0.92)' }}
          >
            Retired
          </span>
        ) : (
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
              active ? 'text-[#0a0a0a]' : 'text-textPrimary bg-white/[0.08]'
            }`}
            style={active ? { background: 'rgba(48,209,88,0.92)' } : undefined}
          >
            {VERDICT_LABEL[setup.verdict]}
          </span>
        )}
        {/* CONFIDENCE meter (Noah, 2026-08-09 — and since 2026-08-16 the only
            grade-shaped thing a user ever sees; the raw score is internal):
            a bar whose color carries the read — bull strong, amber middle,
            bear weak — with the figure as a small tag that keeps the change
            flash. Same meter grammar as the browse card. */}
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-2.5 border border-borderSubtle bg-panel rounded-md px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Confidence</span>
            <span className="w-24 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <span
                className={`block h-full rounded-full transition-[width,background-color] duration-700 ease-out ${
                  setup.confidence >= 70 ? 'bg-bull/90' : setup.confidence >= 45 ? 'bg-warn/80' : 'bg-bear/80'
                }`}
                style={{ width: `${setup.confidence}%` }}
              />
            </span>
            <span className="font-mono text-[11px] font-bold tnum text-textSecondary">
              <AnimatedNumber value={setup.confidence} format={v => `${Math.round(v)}%`} flash />
            </span>
          </span>
          <span className="inline-flex items-center gap-2 border border-borderSubtle bg-panel rounded-md px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-textSecondary">Live premium</span>
            <span className="font-mono text-[13px] font-bold tnum text-textPrimary">
              <AnimatedNumber value={setup.liveMid} format={v => `$${v.toFixed(2)}`} flash />
            </span>
          </span>
        </span>
      </div>

      {/* Provenance without freezing: this page reads LIVE, and says so.
          The grade itself is engine-internal (Noah, 2026-08-16) — only the
          sweep that surfaced the row is named. */}
      {gradedAt != null && (
        <p className="-mt-1 font-mono text-[11px] text-textSecondary">
          Surfaced on the <span className="text-textPrimary tnum">{gradedAt}</span> sweep · reading live since
        </p>
      )}

      {/* The retirement banner — the loudest thing on a dead campaign's page.
          The user is never navigated away (states, not orders): the thesis
          died, the post-mortem is information, they leave when they're done. */}
      {retired && floorBreak && (
        <Panel flush tone="bear" className="animate-soft-in">
          <div className="p-3 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-bear/90 shrink-0" />
            <div>
              <span className="block font-mono text-[12px] font-bold uppercase tracking-wider text-bear">
                Floor broken — campaign retired
              </span>
              <p className="text-[12px] text-textPrimary leading-snug">
                <RichRead
                  text={`${setup.ticker} closed ${setup.right === 'C' ? 'below' : 'above'} ${floorBreak.floor.toFixed(2)} at ${breakTimeLabel} — the thesis is invalidated. ${
                    hitCount > 0
                      ? `${hitCount} of ${c.takeProfits.length} milestones banked before the break.`
                      : 'Nothing was banked.'
                  } What follows is the post-mortem.`}
                />
              </p>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* The chart slot — 60/40 with the card (Noah, 2026-08-17). Two
            instruments share it: the STOCK view is the campaign map on the
            underlying's tape; the PREMIUM view is the contract's own modeled
            premium track (ContractTrack, back from the 08-09 retirement by
            request). The same CardTabs toggle rides on whichever panel is
            up, so the way back is always in the same place. */}
        {chartView === 'premium' ? (
          /* View-level swap → the slow soft-in clock (house rule), so the
             chart change breathes instead of hard-cutting. */
          <div className="xl:col-span-7 min-w-0 flex flex-col animate-soft-in-slow">
            <ContractTrack
              setup={c}
              revision={revision}
              retired={retired}
              actions={
                <CardTabs
                  ariaLabel="Chart view"
                  options={[
                    { value: 'stock', label: 'Stock' },
                    { value: 'premium', label: 'Premium' },
                  ]}
                  value={chartView}
                  onChange={setChartView}
                />
              }
            />
          </div>
        ) : (
        <div className={chartFull ? 'fixed inset-0 z-[80] bg-canvas p-3 flex flex-col' : 'contents'}>
          <Panel
            title={`${setup.ticker} — campaign map`}
            subtitle="TP milestones & floor on the live tape"
            flush
            /* Docked re-entry from Premium soft-fades in (from-only keyframes
               + backwards fill — nothing retained, so fullscreen's fixed
               positioning stays safe per the containing-block law). */
            className={chartFull ? 'flex-1 w-full flex flex-col min-h-0' : 'xl:col-span-7 min-w-0 animate-soft-in-slow'}
            /* Docked: the body STRETCHES with the grid row (min 500 — toolbar
               strip + chart) so the chart always ends on the rails' bottom
               line — a fixed height left a void under the shorter rail. */
            bodyClassName={chartFull ? 'flex flex-col flex-grow min-h-0' : 'flex flex-col min-h-[500px]'}
          >
            {/* The Pulse control kit, campaign diet: timeframes, overlays
                (levels + volume only), candles, fullscreen. Its own strip —
                the panel header can't hold it at half-row width. Timeframes
                pinned left, everything else right with Expand furthest right
                (Noah, 2026-08-09). The Stock/Premium toggle leads the strip. */}
            <div className="px-3 py-1.5 border-b border-borderSubtle flex items-center gap-3">
              <CardTabs
                ariaLabel="Chart view"
                options={[
                  { value: 'stock', label: 'Stock' },
                  { value: 'premium', label: 'Premium' },
                ]}
                value={chartView}
                onChange={setChartView}
              />
              <span className="h-4 w-px bg-borderSubtle shrink-0" />
              <div className="flex-1 min-w-0">
                <ChartToolbar
                  minimal
                  candles
                  spread
                  overlayKeys={['levels', 'volume']}
                  timeframe={timeframe}
                  onTimeframe={setTimeframe}
                  overlays={overlays}
                  onOverlays={setOverlays}
                  fullscreen={chartFull}
                  onToggleFullscreen={() => setChartFull(f => !f)}
                />
              </div>
            </div>
            <div className="relative flex-1 min-h-0">
              <CampaignChart
                setup={c}
                revision={revision}
                entry={entry}
                hits={tpHits}
                brk={floorBreak}
                timeframe={timeframe}
                overlays={overlays}
              />
            </div>
          </Panel>
        </div>
        )}

        {/* THE CARD (Noah, 2026-08-17): the browse preview card, promoted.
            It left the setups page and became the campaign's contract
            surface — same grammar (inset cells, meters, ledger), with the
            premium ladder folded in where the Swing/Scalp shorthand used to
            sit and the dollarized contract facts kept. One panel where the
            two rails stood. 7/5 split (Noah: "the chart takes up more space
            ... but not by much. like 60/40") — 8/4 crushed the ladder's four
            columns at laptop widths. */}
        <div className="xl:col-span-5 min-w-0 flex flex-col">
          <Panel
            title={
              <span key={setup.id} className="inline-block font-mono text-base font-bold text-textPrimary tracking-tight animate-soft-in">
                {setup.contract}
              </span>
            }
            subtitle={
              retired
                ? `retired — ${hitCount}/${c.takeProfits.length} banked`
                : `${hitCount}/${c.takeProfits.length} milestones hit`
            }
            actions={
              <CardTabs
                options={[
                  { value: 'campaign', label: 'Campaign' },
                  { value: 'contract', label: 'Contract' },
                ]}
                value={cardTab}
                onChange={setCardTab}
              />
            }
            flush
            className="flex-1 min-h-0"
            bodyClassName="flex flex-col"
          >
            {/* Direction + conviction strip — a dead campaign never wears a
                live verdict (the retired rule). */}
            <div className="px-3 py-2.5 border-b border-borderSubtle flex items-center gap-2">
              {retired ? (
                <span
                  className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]"
                  style={{ background: 'rgba(255,59,48,0.92)' }}
                >
                  Retired
                </span>
              ) : (
                <VerdictBadge verdict={setup.verdict} dot />
              )}
              <span className="font-mono text-[11px] uppercase tracking-wider text-textSecondary">
                {setup.right === 'C' ? 'Bullish' : 'Bearish'} ·{' '}
                {setup.score >= 93 ? 'High' : setup.score >= 85 ? 'Medium' : 'Low'} Conviction
              </span>
            </div>

            {/* Persistent at-a-glance row — the engine's live opinion stays
                visible whichever tab is open. */}
            <div className="p-3 pb-0 grid grid-cols-2 gap-2">
              {/* Confidence as a METER (the approved shape): bar color
                  carries the read, the figure is a small tag. */}
              <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Confidence</div>
                  <div className="font-mono text-[10px] tnum text-textSecondary">
                    <AnimatedNumber value={setup.confidence} format={v => `${Math.round(v)}%`} flash />
                  </div>
                </div>
                <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span
                    className={`block h-full rounded-full transition-[width,background-color] duration-700 ease-out ${
                      setup.confidence >= 70 ? 'bg-bull/90' : setup.confidence >= 45 ? 'bg-warn/80' : 'bg-bear/80'
                    }`}
                    style={{ width: `${setup.confidence}%` }}
                  />
                </div>
              </div>
              <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
                <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Conviction</div>
                <div className="mt-1 font-mono text-sm font-semibold text-textPrimary">
                  {setup.score >= 93 ? 'High' : setup.score >= 85 ? 'Medium' : 'Low'}
                </div>
              </div>
            </div>

            {/* Tab body — BOTH panes stay mounted, stacked in one grid cell,
                the inactive one invisible. Height = the taller tab always, so
                switching never moves the row's bottom edge (the board-height
                lesson) — and every AnimatedNumber keeps rolling instead of
                remounting (persist-DOM doctrine). */}
            <div className="flex-1 p-3 grid">
              <div
                className={`col-start-1 row-start-1 flex flex-col gap-4 transition-opacity duration-300 ${
                  cardTab === 'campaign' ? 'opacity-100' : 'invisible opacity-0'
                }`}
              >
                <div className="border border-borderSubtle rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-borderSubtle bg-inset">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Premium ladder</span>
                  </div>
                  {/* The strict table (Noah, 2026-08-09, decoration stripped
                      2026-08-17 — the pulsing dot, edge insets and row tints
                      read as "AI slob"): right-aligned figures, hairline
                      rows, whisper headers. Ink alone carries state — banked
                      rungs check + bull, the working rung bright, pending
                      rungs quiet. The floor is the table's last row; its
                      clock lives in the caption underneath. */}
                  <table className="w-full">
                <thead>
                  <tr className="border-b border-borderSubtle">
                    <th className="text-left font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-3 py-1.5">Level</th>
                    <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-3 py-1.5">Premium</th>
                    <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-3 py-1.5">From entry</th>
                    <th className="text-right font-mono text-[9px] uppercase tracking-wider text-textMuted font-medium px-3 py-1.5">{setup.ticker} needs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderSubtle">
                  {[...c.takeProfits].reverse().map((tp, ri) => {
                    const i = c.takeProfits.length - 1 - ri;
                    // Status comes from the TAPE (same derivation as the
                    // chart's candle markers) — the rolled sim flags could
                    // claim a hit no candle ever printed.
                    const status = ladderStatus(i);
                    const hit = status === 'HIT';
                    const working = status === 'IN PROGRESS';
                    const need = hit || retired ? null : needFor(tp.target);
                    return (
                      <tr key={tp.level}>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
                              hit
                                ? 'text-bull font-semibold'
                                : working && !retired
                                  ? 'text-textPrimary font-semibold'
                                  : retired
                                    ? 'text-textMuted'
                                    : 'text-textSecondary'
                            }`}
                          >
                            {hit && <Check className="w-3 h-3" />}
                            TP{i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold tnum text-textPrimary">
                          ${tp.target.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[11px] tnum ${hit ? 'text-bull' : 'text-textSecondary'}`}>
                          +{tp.expectedPct}%
                        </td>
                        {/* The underlying level that pays this rung — a premium
                            target the user can't watch, inverted into a price
                            they can (per the pricer). Banked rungs are done:
                            nothing left to need. */}
                        <td className={`px-3 py-2 text-right font-mono text-[11px] tnum ${working && !retired ? 'text-textPrimary' : 'text-textSecondary'}`}>
                          {need != null ? need.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Entry — the reference row */}
                  <tr>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] text-textSecondary">Entry</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold tnum text-textPrimary">
                      ${c.mid.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textMuted">—</td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textMuted">—</td>
                  </tr>

                  {/* The floor — the table's base: through it, the campaign
                      retires. Its level is an UNDERLYING price, so it lives
                      in the needs column. */}
                  <tr>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] font-semibold text-bear">
                        {setup.right === 'C' ? 'Floor' : 'Ceiling'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textMuted">—</td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] tnum text-textMuted">—</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] font-semibold tnum text-textPrimary whitespace-nowrap">
                      {retired && floorBreak
                        ? `broke ${floorBreak.floor.toFixed(2)}`
                        : `${setup.right === 'C' ? 'below' : 'above'} ${c.invalidationPrice.toFixed(2)}`}
                    </td>
                  </tr>
                </tbody>
                  </table>

                  {/* The floor's clock, spoken once as a caption — not
                      shouted inside the row. */}
                  <p className="px-3 py-2 border-t border-borderSubtle text-[10px] leading-snug text-textSecondary">
                    {c.invalidationReason}.{' '}
                    {retired
                      ? 'A close through it retired the campaign — what remains is the post-mortem.'
                      : clockCopy}
                  </p>
                </div>

                {/* Why this is on the board — the read alone. The chip wall
                    (TREND ALIGNED / DEALER SUPPORT / RSI CONFIRM) died
                    2026-08-17 (Noah: redundant, explains nothing) — the
                    prose is the explanation. */}
                <div className="flex items-start gap-2 border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 text-[#C7D3E8] shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#C7D3E8] font-semibold">Why this is on the board</span>
                    <p key={setup.id} className="text-[11px] text-textSecondary leading-relaxed animate-soft-in">
                      <RichRead text={setup.whyText} />
                    </p>
                  </div>
                </div>

                {/* Liquidity + the line that ends it — invalidation speaks the
                    FROZEN campaign floor (the merged `c`), same number the
                    ladder's last row holds. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Droplets className="w-3 h-3 text-textMuted" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Liquidity</span>
                    </div>
                    <div
                      className={`font-mono text-sm font-semibold ${
                        setup.liquidityLabel === 'Tight' ? 'text-bull' : setup.liquidityLabel === 'Normal' ? 'text-warn' : 'text-bear'
                      }`}
                    >
                      {setup.liquidityLabel}
                    </div>
                    <div className="font-mono text-[10px] text-textMuted tnum">{setup.liquiditySpread}</div>
                  </div>
                  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-3 h-3 text-warn" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Invalidation</span>
                    </div>
                    <div className={`font-mono text-sm font-semibold tnum ${retired ? 'text-bear' : 'text-warn'}`}>
                      {retired && floorBreak
                        ? `Broke $${floorBreak.floor.toFixed(2)}`
                        : `${setup.right === 'C' ? 'Below' : 'Above'} $${c.invalidationPrice.toFixed(2)}`}
                    </div>
                    <div className="font-mono text-[10px] text-textMuted">{c.invalidationReason}</div>
                  </div>
                </div>
              </div>

              <div
                className={`col-start-1 row-start-1 flex flex-col gap-4 transition-opacity duration-300 ${
                  cardTab === 'contract' ? 'opacity-100' : 'invisible opacity-0'
                }`}
              >
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Premium</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
                      <AnimatedNumber value={setup.mid} format={v => `$${v.toFixed(2)}`} flash />
                    </div>
                  </div>
                  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Fair Value</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-textPrimary tnum">
                      <AnimatedNumber value={setup.liveMid} format={v => `$${v.toFixed(2)}`} flash />
                    </div>
                  </div>
                  <div className="border border-borderSubtle bg-inset rounded-md px-3 py-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted">Exp. Move</div>
                    <div
                      className={`mt-1 font-mono text-sm font-semibold tnum ${
                        setup.expectedMovePct >= 0 ? 'text-bull' : 'text-bear'
                      }`}
                    >
                      <AnimatedNumber value={setup.expectedMovePct} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted mb-1.5">Greeks</div>
                  <GreeksRow greeks={setup.greeks} fourth="iv" flash />
                </div>

                {/* The old contract panel's dollars as a LEDGER — values on
                    the same right rail as the greeks above, one instrument
                    (the 2-col grid read as "open spacing, alignment off"). */}
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted mb-1.5">Dollars, not grades</div>
                  <ContractFacts setup={c} spot={spot} ledger />
                </div>
              </div>
            </div>

            {/* Track Campaign — docked as the panel's footer: the action
                belongs to the campaign it acts on, never floating under it. */}
            <div className="border-t border-borderSubtle p-2">
              <button
                onClick={() => (tracked ? untrackSetup(setup.id) : trackSetup(setup, scanner))}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  tracked
                    ? 'border border-bear/40 text-bear hover:bg-bear/[0.06]'
                    : 'text-[#0a0a0a] holo-bg hover:brightness-105'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                {tracked ? 'Untrack campaign' : 'Track campaign'}
              </button>
            </div>
          </Panel>
        </div>
      </div>

      {/* "Top contracts driving the setup" (Mo, 2026-08-19) — here, where
          there is ONE setup for the phrase to be true of. Keyed on the
          contract so a re-point soft-fades the table in with the page. */}
      <div key={`drivers-${setup.ticker}-${setup.strike}-${setup.right}`} className="animate-soft-in-slow">
        <SetupDrivers ticker={setup.ticker} rows={drivers} onOpen={onOpenContract} />
      </div>
    </div>
  );
};

export default CampaignAnalysis;
