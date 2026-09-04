import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import Panel from '../ui/Panel';
import Simulator from '../../core/simulator';
import { aggregateCandles } from '../../data/timeframe';
import { contractCandles } from '../../data/contractCandles';
import { candleSeriesOptions, chartSurface, getCandleTheme, useCandleThemeKey } from '../gex/candleTheme';
import { buildSetupTrack, barsToSpan, type TrackLevel } from './trackModel';
import { buildNodes } from './nodeReasons';
import type { Setup } from '../../types/compass';

/*
==================================================
  SLAYER TERMINAL - CONTRACT NODE CHART (ContractNodeChart.tsx)

  The campaign's premium tape, and the plan drawn on it.
==================================================

  WHAT THIS REPLACES, AND WHY. The premium panel was a Recharts area with a
  level table under it. Noah (2026-08-29): "remove the option contract chart
  we currently have and replace it with the one Weigher has from TradingView,
  but make it map out TPs and stop losses and reasons why it's doing what it
  does in node-like fashion."

  So the ENGINE is the Weigher's: lightweight-charts, the house candle theme,
  real contract candles on the same derivation the desk's premium pane uses
  (data/contractCandles.ts). Two premium charts in one app drawn by two
  different libraries, with two different crosshairs and two different type
  scales, was a seam a reader could see.

  THE PLAN IS DRAWN TWICE, on purpose, because it answers two questions.

  ON THE TAPE it is price lines: where each rung sits against what the
  contract is actually worth right now. That is the "how far" question, and
  it has to be on the same axis as the candles or it is not an answer.

  IN THE RAIL it is a node chain: the thesis at the root, then every rung as
  its own node down the spine with the REASON it exists — what the underlying
  has to reach, what it is worth there, and what makes it live or dead. That
  is the "why" question, and a price line cannot carry a sentence.

  THE ORDER IS THE CHART'S ORDER. Nodes run down the rail by PREMIUM, highest
  first, so a reader's eye moves between the two in the same direction — the
  top node is the top line. Sorting by rung number instead would have TP3
  above TP1 on the chart and below it in the rail, which is how two views of
  one plan end up disagreeing.

  NOTHING HERE INVENTS A NUMBER. The levels, the spot each one needs and the
  status of each rung all come from `buildSetupTrack`, which is the same
  model the campaign rail and the monitor read; this file decides ink and
  wording and nothing else.
*/

/* The campaign chart shows a session's worth of shape, not a tick tape: the
   rungs are hours-to-days decisions and a 1-minute candle draws noise around
   them. Five minutes is the interval the rest of Compass reads. */
const CHART_MINUTES = 5;
/** How many bars the chart opens on, before the reader pans. */
const OPENING_BARS = 130;

const LEVEL_INK: Record<TrackLevel['status'], string> = {
  HIT: '#30D158',
  'IN PROGRESS': '#D2FF00',
  PENDING: '#7d7d7d',
  STOP: '#FF9500',
  REF: '#ededed',
};

/** The shape of the node's dot — filled when the rung is settled, hollow
    while it is still a claim about the future. */
const isSettled = (s: TrackLevel['status']) => s === 'HIT' || s === 'REF';

interface ContractNodeChartProps {
  setup: Setup;
  /** Tick pulse — repins the candles and the live node on the newest mid. */
  revision: number;
  /** Campaign retired: the plan is history, and the rail says so rather than
      going on telling a reader what the underlying "has to reach". */
  retired?: boolean;
  /** Extra header controls — the campaign page mounts its chart toggle here. */
  actions?: React.ReactNode;
}

const ContractNodeChart = ({ setup, revision, retired = false, actions }: ContractNodeChartProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const loadedRef = useRef('');
  const themeKey = useCandleThemeKey();

  const track = useMemo(() => {
    void revision;
    return buildSetupTrack(setup, Simulator.getCandles(setup.ticker) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.id, setup.mid, revision]);

  /* ── the chart, created once ───────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const t = getCandleTheme();
    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { color: chartSurface(t).bg },
        textColor: '#7d7d7d',
        fontFamily: "'SF Pro', sans-serif",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      /* The rungs' labels ride the axis, and a narrow gutter clips them —
         this is the same reservation StrikeChart makes for its price tag. */
      rightPriceScale: { borderColor: '#1c1c1c', minimumWidth: 76 },
      timeScale: { borderColor: '#1c1c1c', timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 7 },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
        horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#262626' },
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      ...candleSeriesOptions(t),
      priceLineVisible: true,
      priceLineColor: 'rgba(237,237,237,0.4)',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      loadedRef.current = '';
    };
  }, []);

  /* Recolour in place when the app-wide theme changes — the house contract:
     a theme switch must never rebuild a chart and drop the reader's pan. */
  useEffect(() => {
    const t = getCandleTheme();
    seriesRef.current?.applyOptions(candleSeriesOptions(t));
    chartRef.current?.applyOptions({ layout: { background: { color: chartSurface(t).bg } } });
  }, [themeKey]);

  /* ── the candles ───────────────────────────────────────────────────── */
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const bars = aggregateCandles(Simulator.getCandles(setup.ticker) ?? [], CHART_MINUTES);
    if (bars.length === 0) return;
    const pts = contractCandles(
      bars,
      setup.strike,
      setup.right,
      setup.greeks.iv / 100,
      Math.max(setup.sessionsLeft, 0.5) / 252
    ).map(b => ({ ...b, time: b.time as UTCTimestamp }));
    if (pts.length === 0) return;
    const sig = `${setup.id}|${setup.strike}|${setup.right}|${themeKey}`;
    if (loadedRef.current !== sig) {
      series.setData(pts);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, pts.length - OPENING_BARS), to: pts.length + 5 });
      loadedRef.current = sig;
    } else {
      series.update(pts[pts.length - 1]);
    }
  }, [setup.id, setup.strike, setup.right, setup.greeks.iv, setup.sessionsLeft, setup.ticker, revision, themeKey]);

  /* ── the rungs, as price lines on the same axis ────────────────────── */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    /* Torn down and rebuilt rather than diffed: there are five or six of
       them, they change together when the campaign does, and a diff would be
       more code than the thing it saves. */
    for (const line of linesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* the series went with the chart */
      }
    }
    const onChart = track.levels.filter(l => !l.docked);

    /*
      AND THE SCALE HAS TO REACH THEM, which the first cut did not do.

      `docked` is the track model's word for "too far above the frame to
      draw" — it is computed against that model's own ceiling. The candles,
      meanwhile, autoscale to themselves. So the two disagreed: a screenshot
      had TP1 at $3.22 marked as ON the chart by the rail while the chart's
      own axis stopped at $3.00 and never drew it. A rung the rail says is
      there and the chart does not show is the two views of one plan
      contradicting each other, which is the thing this whole file is trying
      not to do.

      So the series' autoscale is widened to cover every rung the rail calls
      on-chart, and only the docked ones — the genuinely far-off targets that
      would squash the tape flat — are called off scale in both places.
    */
    series.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
        const base = original();
        if (!base || !base.priceRange || onChart.length === 0) return base;
        const prices = onChart.map(l => l.premium);
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, ...prices),
            maxValue: Math.max(base.priceRange.maxValue, ...prices),
          },
        };
      },
    });

    linesRef.current = onChart
      .map(l =>
        series.createPriceLine({
          price: l.premium,
          color: LEVEL_INK[l.status],
          lineWidth: 1,
          /* The reference is the reader's own entry and sits UNDER the plan;
             the rungs are the plan. Different dashes so the two do not read
             as one family of lines. */
          lineStyle: l.status === 'REF' ? 3 : 2,
          axisLabelVisible: true,
          title: l.label,
        })
      );
  }, [track]);

  /* ── the node chain ────────────────────────────────────────────────── */
  const nodes = useMemo(
    () => buildNodes(track.levels, { setup, spotNow: track.spotNow, retired }),
    [track, setup, retired]
  );

  const up = track.sessionChangePct >= 0;
  const changeAbs = Math.abs((setup.mid * track.sessionChangePct) / 100);
  const docked = track.levels.filter(l => l.docked);

  return (
    <Panel
      title={`${setup.contract} · ${setup.expiry}`}
      className="w-full flex-1 min-h-0"
      bodyClassName="flex flex-col flex-1 min-h-0"
      actions={actions}
    >
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-xl font-bold tnum text-textPrimary">${setup.mid.toFixed(2)}</span>
          <span className={`font-mono text-[12px] font-semibold tnum ${up ? 'text-bull' : 'text-bear'}`}>
            {up ? '+' : '−'}${changeAbs.toFixed(2)} ({up ? '+' : '−'}
            {Math.abs(track.sessionChangePct).toFixed(1)}%)
          </span>
          <span className="font-mono text-[10px] text-textMuted">
            over {barsToSpan(track.pastMinutes)} · reference ${track.ref.toFixed(2)} ·{' '}
            {retired ? 'campaign retired' : `${barsToSpan(track.forwardMinutes)} left`}
          </span>
          {docked.length > 0 && (
            <span className="ml-auto font-mono text-[10px] text-textMuted tnum">
              Off scale ↑ {docked.map(l => `${l.label} $${l.premium.toFixed(2)}`).join(' · ')}
            </span>
          )}
        </div>

        {/* Chart and rail side by side on a desk, stacked on a phone: the
            rail is sentences, and a 200px column of them is unreadable. */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0 min-h-[240px]">
            <div ref={hostRef} className="absolute inset-0" />
          </div>

          <div className="lg:w-[290px] shrink-0 lg:border-l border-borderSubtle lg:pl-3 min-h-0 overflow-y-auto">
            {/* THE ROOT NODE: the thesis the rungs hang off. Without it the
                rail answers "what has to happen" and never "why we are
                here", which is half of what was asked for. */}
            <div className="relative pl-4 pb-3">
              <span aria-hidden className="absolute left-[3px] top-[5px] w-[7px] h-[7px] rounded-full bg-select" />
              <span aria-hidden className="absolute left-[6px] top-[12px] bottom-0 w-px bg-borderSubtle" />
              <div className="font-mono text-[10px] uppercase tracking-widest text-select">Thesis</div>
              <p className="mt-0.5 text-[11px] leading-snug text-textSecondary">{setup.whyText}</p>
              {setup.whyChips.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {setup.whyChips.map(c => (
                    <span key={c} className="rounded border border-borderSubtle px-1 py-px font-mono text-[9px] text-textMuted">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <ol className="list-none m-0 p-0">
              {nodes.map(({ level, reason }, i) => {
                const ink = LEVEL_INK[level.status];
                const last = i === nodes.length - 1;
                return (
                  <li key={level.key} className="relative pl-4 pb-3">
                    {/* The spine. It stops at the last node rather than
                        running off the end of the list — a line to nowhere
                        reads as a rung that failed to render. */}
                    {!last && <span aria-hidden className="absolute left-[6px] top-[12px] bottom-0 w-px bg-borderSubtle" />}
                    <span
                      aria-hidden
                      className="absolute left-[3px] top-[5px] w-[7px] h-[7px] rounded-full border"
                      style={{ borderColor: ink, background: isSettled(level.status) ? ink : 'transparent' }}
                    />
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold" style={{ color: ink }}>
                        {level.label}
                      </span>
                      <span className="font-mono text-[11px] tnum text-textPrimary">${level.premium.toFixed(2)}</span>
                      {level.status !== 'REF' && (
                        <span className={`font-mono text-[10px] tnum ${level.fromRefPct >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {level.fromRefPct >= 0 ? '+' : ''}
                          {Math.round(level.fromRefPct)}%
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted">
                        {level.docked ? 'off scale' : level.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-textMuted">{reason}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <p className="font-mono text-[10px] text-textMuted">
          Candles are {setup.ticker}&apos;s own {CHART_MINUTES}-minute bars repriced through the model that quoted this
          contract — premium is monotone in spot, so a bar&apos;s open, high, low and close map straight through. Not a
          traded tape.
        </p>
      </div>
    </Panel>
  );
};

export default ContractNodeChart;
