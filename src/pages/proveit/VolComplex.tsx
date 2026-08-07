import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildVolComplex } from '../../data/volComplex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import ChartFrame, { Swatch } from '../../components/charts/ChartFrame';
import { ChartTip, TipHead, TipRow, TipNote, TipSeries } from '../../components/charts/ChartTip';
import { GRID, CURSOR, chartMargin, valueAxis, categoryAxis, axisVol, paddedDomain, niceTicks, REF_LINE } from '../../components/charts/chartTheme';
import type { Tone } from '../../components/ui/tones';
import { FOCUS, MUTED_INK, SPOT } from '../../components/gex/palette';

/*
  THE VOLATILITY COMPLEX — the four numbers a vol trader reads first, per name.
  Data in data/volComplex.ts: term-structure regime, implied vs realized (the
  vol risk premium), the vol of the vol, IV rank (the one shared rank, P2.1) and
  skew — one synthesized verdict off measures that usually live on four screens.

  Both charts are recharts, on the house chart theme (components/charts). The
  term axis is LOG in time, the convention for a term structure: 7d to 360d is a
  50x range, and on a linear axis the front month — the part that actually moves —
  is crushed into the first eighth of the plot.
*/

const regimeTone: Record<string, Tone> = { CONTANGO: 'neutral', FLAT: 'neutral', BACKWARDATION: 'warn' };
const rcTone: Record<string, Tone> = { RICH: 'warn', CHEAP: 'select', FAIR: 'neutral' };

/*
  Vintages of the term curve. Older = dimmer AND more broken up.

  Opacity alone was not enough: at chart scale four near-parallel silver curves
  0.12 apart in alpha read as one thick line, which the render pass showed. Each
  vintage now carries its own dash signature too, so they separate by pattern
  even where they overlap.
*/
const VINTAGE = [
  { key: 'monthAgo' as const, label: '1mo ago', color: 'rgba(228,232,244,0.30)', dash: '2 4' },
  { key: 'weekAgo' as const, label: '1wk ago', color: 'rgba(228,232,244,0.45)', dash: '5 3' },
  { key: 'dayAgo' as const, label: '1d ago', color: 'rgba(228,232,244,0.62)', dash: '9 3' },
];

const TERM_TICKS = [7, 14, 30, 60, 90, 180, 360];

interface TermRow {
  dte: number;
  now: number;
  dayAgo: number;
  weekAgo: number;
  monthAgo: number;
}

const VolComplex = () => {
  const { activeTicker, marketData } = useMarketData();
  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const view = useMemo(
    () => (marketData ? buildVolComplex(activeTicker, marketData.spot, iv, Simulator.getCandles(activeTicker)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData?.spot && Math.round(marketData.spot * 4), iv]
  );

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Reading the vol complex…</span>
      </Panel>
    );
  }

  const { termHistory, frontIv, backIv, slope, termRegime, realizedVol, vrp, volOfVol, ivRank, skew, richCheap, read } = view;

  // Domain spans every vintage plus the realized line, so no series and no
  // reference rule can fall outside the plot.
  const allIvs = termHistory.flatMap(p => [p.now, p.dayAgo, p.weekAgo, p.monthAgo]).concat(realizedVol);
  const ivDomain = paddedDomain(allIvs, 0.1);
  const ticks = TERM_TICKS.filter(t => t >= termHistory[0].dte && t <= termHistory[termHistory.length - 1].dte);

  const front = termHistory.find(p => p.dte >= 30) ?? termHistory[0];
  const back = termHistory.find(p => p.dte >= 90) ?? termHistory[termHistory.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Volatility complex" subtitle={`${activeTicker} · term structure, vol risk premium, vol-of-vol and skew`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="170px">
            <StatCard label="Term structure" value={termRegime} sub={`${slope >= 0 ? '+' : ''}${slope.toFixed(1)} pt front→back`} tone={regimeTone[termRegime]} emphasis />
            <StatCard label="Implied vs realized" value={richCheap} sub={`${vrp >= 0 ? '+' : ''}${vrp.toFixed(1)} pt VRP`} tone={rcTone[richCheap]} />
            <StatCard label="Front / back IV" value={`${frontIv.toFixed(1)} / ${backIv.toFixed(1)}`} sub="30d vs 90d ATM, %" />
            <StatCard label="Realized vol" value={`${realizedVol.toFixed(1)}%`} sub="annualized, off the tape" />
            <StatCard label="IV rank" value={`${ivRank}`} sub="percentile of its own year" />
            <StatCard label="Vol-of-vol" value={`${volOfVol.toFixed(1)}`} sub={`skew RR ${skew.toFixed(1)}`} />
          </MetricGrid>

          {/* The term structure itself, with its own recent history behind it —
              the spread between those four lines at 30d IS the vol-of-vol stat
              above, so the number and the picture check each other. */}
          <ChartFrame
            title="ATM term structure"
            meta="7d → 360d · log time · Modeled"
            height={214}
            legend={
              <>
                <Swatch color={FOCUS} label="Now" dash />
                {VINTAGE.map(v => (
                  <Swatch key={v.key} color={v.color} label={v.label} dash />
                ))}
                <Swatch color={SPOT} label={`Realized ${realizedVol.toFixed(1)}%`} dash />
              </>
            }
            ariaLabel={`${activeTicker} ATM implied-vol term structure, ${termRegime.toLowerCase()}: ${frontIv.toFixed(1)}% at 30 days rising to ${backIv.toFixed(1)}% at 90 days, against ${realizedVol.toFixed(1)}% realized, with the curve as it stood a day, a week and a month ago behind it.`}
          >
            <LineChart data={termHistory} margin={chartMargin}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                {...categoryAxis}
                type="number"
                dataKey="dte"
                scale="log"
                domain={['dataMin', 'dataMax']}
                ticks={ticks}
                tickFormatter={(v: number) => `${v}d`}
              />
              <YAxis {...valueAxis} domain={ivDomain} ticks={niceTicks(ivDomain[0], ivDomain[1])} tickFormatter={axisVol} width={44} />
              {/* Realized is the bar implied has to clear — draw it, don't just quote it. */}
              <ReferenceLine
                y={realizedVol}
                stroke={REF_LINE}
                strokeDasharray="4 4"
                label={{ value: 'realized', position: 'insideBottomLeft', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTip<TermRow>
                    render={r => {
                      const vsFront = r.now - front.now;
                      const vsRealized = r.now - realizedVol;
                      const moved = r.now - r.monthAgo;
                      return (
                        <>
                          <TipHead sub={`${r.dte}D`}>{activeTicker} ATM</TipHead>
                          <TipRow label="Implied" value={`${r.now.toFixed(2)}%`} />
                          <TipSeries color={SPOT} label="vs realized" value={`${vsRealized >= 0 ? '+' : ''}${vsRealized.toFixed(2)} pt`} />
                          <TipRow label="vs 30d point" value={`${vsFront >= 0 ? '+' : ''}${vsFront.toFixed(2)} pt`} />
                          <TipSeries color={VINTAGE[0].color} label="1mo ago" value={`${r.monthAgo.toFixed(2)}%`} />
                          <TipNote>
                            {Math.abs(moved) < 0.25
                              ? 'This tenor has barely moved in a month.'
                              : `This tenor is ${Math.abs(moved).toFixed(1)} pt ${moved > 0 ? 'higher' : 'lower'} than a month ago.`}{' '}
                            {vsRealized >= 0
                              ? `Options here charge ${vsRealized.toFixed(1)} pt more vol than the tape delivered.`
                              : `Options here charge ${Math.abs(vsRealized).toFixed(1)} pt less vol than the tape delivered.`}
                          </TipNote>
                        </>
                      );
                    }}
                  />
                }
              />
              {VINTAGE.map(v => (
                <Line
                  key={v.key}
                  type="monotone"
                  dataKey={v.key}
                  stroke={v.color}
                  strokeDasharray={v.dash}
                  strokeWidth={1.3}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
              <Line type="monotone" dataKey="now" stroke={FOCUS} strokeWidth={1.9} dot={false} activeDot={{ r: 3, fill: FOCUS, stroke: 'none' }} isAnimationActive={false} />
              {/* Recharts draws these in its own square-aspect coordinate space,
                  so they are true circles — the hand-rolled version stretched
                  them into ellipses via preserveAspectRatio="none". */}
              <ReferenceDot
                x={front.dte}
                y={front.now}
                r={3.2}
                fill={FOCUS}
                stroke="none"
                label={{ value: '30d', position: 'top', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <ReferenceDot
                x={back.dte}
                y={back.now}
                r={3.2}
                fill={MUTED_INK}
                stroke="none"
                label={{ value: '90d', position: 'bottom', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </LineChart>
          </ChartFrame>

          <p className="text-micro leading-relaxed text-textMuted">
            The vol risk premium is implied minus REALIZED — what options charged for vol against what the tape actually
            delivered. Positive is the normal state; a negative premium means the market underpriced the move. Realized is
            measured off the modeled 1-minute series, and both sides come from the seeded surface, not a live quote.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default VolComplex;
