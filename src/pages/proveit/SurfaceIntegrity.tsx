import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { useMarketData } from '../../context/MarketDataContext';
import Simulator from '../../core/simulator';
import { buildSurfaceIntegrity, type VariancePoint } from '../../data/surfaceIntegrity';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import SignalBadge from '../../components/ui/SignalBadge';
import ChartFrame, { Swatch } from '../../components/charts/ChartFrame';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { GRID, CURSOR, chartMargin, valueAxis, categoryAxis, paddedDomain } from '../../components/charts/chartTheme';
import { FOCUS } from '../../components/gex/palette';

/*
  SURFACE INTEGRITY — the arbitrage checks every desk should run before trusting
  a vol surface. Engine in data/surfaceIntegrity.ts. PASS/FAIL is data quality,
  not market direction, so a break takes amber (a caveat) and never bear red —
  green and red stay the market's.

  The page used to print each check twice: once as a stat card and once as a
  detail row, with the same label, the same verdict and the same counts. Six
  elements, three facts. The cards now carry the AGGREGATE (score, adjacencies,
  breaks, worst offender) and the rows carry the PER-CHECK detail — so nothing
  is stated twice and the page is shorter, not longer.
*/

const WARN = '#FF9500'; // `warn` token — data-quality amber, never bear red

const SurfaceIntegrity = () => {
  const { activeTicker, marketData } = useMarketData();
  const iv = Simulator.TICKERS[activeTicker]?.iv ?? 0.25;

  const view = useMemo(
    () => (marketData ? buildSurfaceIntegrity(activeTicker, marketData.spot, iv) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTicker, marketData?.spot && Math.round(marketData.spot * 4), iv]
  );

  if (!view) {
    return (
      <Panel className="h-64" bodyClassName="flex items-center justify-center">
        <span className="font-mono text-label text-textMuted uppercase tracking-widest">Checking the surface…</span>
      </Panel>
    );
  }

  const { checks, score, clean, adjacencies, breaks, varianceCurve, read } = view;

  // The single worst break anywhere, for the headline card. Ranked by the check
  // order (calendar > butterfly > smoothness): a calendar break is a harder
  // failure than a rough smile.
  const worstCheck = checks.find(c => !c.pass && c.worst) ?? null;
  const calendar = checks.find(c => c.key === 'calendar');
  const breakPoints = varianceCurve.filter(p => !p.holds);
  const vDomain = paddedDomain(varianceCurve.map(p => p.variance), 0.08);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Surface integrity" subtitle={`${activeTicker} · arbitrage-free checks on the vol surface`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="180px">
            <StatCard
              label="Integrity score"
              value={`${score}%`}
              sub={clean ? 'arbitrage-free' : 'breaks present'}
              tone={clean ? 'select' : 'warn'}
              emphasis
            />
            <StatCard label="Adjacencies examined" value={adjacencies.toLocaleString()} sub="across all three checks" />
            <StatCard
              label="Breaks found"
              value={breaks === 0 ? 'None' : breaks.toLocaleString()}
              sub={breaks === 0 ? 'every pair holds' : `${((breaks / adjacencies) * 100).toFixed(1)}% of pairs`}
              tone={breaks === 0 ? 'neutral' : 'warn'}
            />
            <StatCard
              label="Worst offender"
              value={worstCheck ? worstCheck.label : '—'}
              sub={worstCheck?.worst ? `${worstCheck.worst.dte}d · ${(worstCheck.worst.moneyness * 100).toFixed(0)}% K/F` : 'nothing to flag'}
              tone={worstCheck ? 'warn' : 'neutral'}
            />
          </MetricGrid>

          {/* The calendar check, drawn. It is the claim that this curve never
              falls — so plot it and the verdict is verifiable by eye. */}
          <ChartFrame
            title="ATM total variance"
            meta="σ²·t by tenor · must never fall · Modeled"
            height={190}
            legend={
              <>
                <Swatch color={FOCUS} label="Total variance" dash />
                {breakPoints.length > 0 ? (
                  <Swatch color={WARN} label={`${breakPoints.length} calendar break${breakPoints.length === 1 ? '' : 's'}`} />
                ) : (
                  <span className="font-mono text-micro uppercase tracking-wider text-textMuted">Monotone — no calendar arbitrage</span>
                )}
              </>
            }
            ariaLabel={`${activeTicker} at-the-money total variance by tenor, from ${varianceCurve[0]?.dte ?? 0} to ${varianceCurve[varianceCurve.length - 1]?.dte ?? 0} days. ${breakPoints.length === 0 ? 'The curve rises throughout, so there is no calendar arbitrage on the at-the-money column.' : `${breakPoints.length} tenors fall below the one before, each a calendar arbitrage.`}`}
          >
            <AreaChart data={varianceCurve} margin={chartMargin}>
              <CartesianGrid stroke={GRID} />
              <XAxis
                {...categoryAxis}
                type="number"
                dataKey="dte"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => `${v}d`}
              />
              <YAxis
                {...valueAxis}
                domain={vDomain}
                width={54}
                tickFormatter={(v: number) => v.toFixed(3)}
              />
              <Tooltip
                cursor={CURSOR}
                content={
                  <ChartTip<VariancePoint>
                    render={p => {
                      const i = varianceCurve.indexOf(p);
                      const prev = i > 0 ? varianceCurve[i - 1] : null;
                      const step = prev ? p.variance - prev.variance : null;
                      return (
                        <>
                          <TipHead sub={`${p.dte}D`}>{activeTicker} ATM</TipHead>
                          <TipRow label="Implied vol" value={`${p.iv.toFixed(2)}%`} />
                          <TipRow label="Total variance" value={p.variance.toFixed(5)} />
                          {step !== null && (
                            <TipRow
                              label={`Step from ${prev!.dte}d`}
                              value={`${step >= 0 ? '+' : ''}${step.toFixed(5)}`}
                              tone={p.holds ? 'text-textSecondary' : 'text-warn'}
                            />
                          )}
                          <TipNote>
                            {p.holds
                              ? 'Variance is at or above the shorter tenor, so no calendar arbitrage sits on this pair: the longer option is not selling variance cheaper than the shorter one.'
                              : 'Variance FELL going out in time. The longer-dated option prices less total variance than the shorter one — a calendar spread here would be free money, so the fit is wrong.'}
                          </TipNote>
                        </>
                      );
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="variance"
                stroke={FOCUS}
                strokeWidth={1.8}
                fill={FOCUS}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 3, fill: FOCUS, stroke: 'none' }}
                isAnimationActive={false}
              />
              {/* Every tenor that fell below its predecessor, marked where it broke. */}
              {breakPoints.map(p => (
                <ReferenceDot key={p.dte} x={p.dte} y={p.variance} r={3.5} fill={WARN} stroke="none" />
              ))}
            </AreaChart>
          </ChartFrame>

          {calendar && (
            <p className="font-mono text-micro uppercase tracking-wider text-textMuted">
              The curve above is the at-the-money column only · the calendar check runs it on all{' '}
              {calendar.total.toLocaleString()} tenor pairs across every moneyness rung
            </p>
          )}

          <div className="flex flex-col gap-2">
            {checks.map(c => (
              <div key={c.key} className="inst-surface rounded-md px-3 py-2.5 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-caption font-semibold text-textPrimary">{c.label}</span>
                  <SignalBadge tone={c.pass ? 'neutral' : 'warn'} dot={!c.pass}>
                    {c.pass ? `PASS · ${c.total.toLocaleString()}` : `${c.violations} / ${c.total.toLocaleString()}`}
                  </SignalBadge>
                </div>
                <p className="text-micro leading-relaxed text-textMuted">{c.note}</p>
                {!c.pass && c.worst && (
                  <p className="font-mono text-micro text-warn/90">
                    Worst at {c.worst.dte}d · {(c.worst.moneyness * 100).toFixed(0)}% K/F — {c.worst.detail}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-micro leading-relaxed text-textMuted">
            A surface that fails these is not just ugly — it prices free money or a probability below zero. The checks run
            on the same seeded surface the Vol Lab draws, at raw model prices rather than quotable ones, so a break cannot
            hide behind the $0.02 minimum increment. A real fitted feed would run them before it published a quote.
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default SurfaceIntegrity;
