import { useMemo } from 'react';
import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { useMarketData } from '../../context/MarketDataContext';
import { buildGammaRolloff, type RolloffExpiry } from '../../data/gammaRolloff';
import { fmtUsd } from '../../data/gex';
import Panel from '../../components/ui/Panel';
import StatCard from '../../components/ui/StatCard';
import MetricGrid from '../../components/ui/MetricGrid';
import EmptyState from '../../components/ui/EmptyState';
import ChartFrame, { Swatch } from '../../components/charts/ChartFrame';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { BAR_CURSOR, CHART_FONT, GRID, REF_LINE, axisPct, axisUsd, categoryAxis, chartMargin, valueAxisLeft } from '../../components/charts/chartTheme';
import { FOCUS } from '../../components/gex/palette';

/*
  GAMMA ROLL-OFF — the schedule of dealer gamma leaving the book by expiry.

  Data in data/gammaRolloff.ts; this is the read. The near rungs carry the most
  gamma (density scales ~1/sqrt(t)), with a bump on the standard monthlies where
  open interest concentrates. The pin holding price this week is on the calendar
  above, and so is the afternoon it disappears.

  Every number on this page is scoped to the LISTED HORIZON the calendar returns
  (core/expiryCalendar caps at six rungs), never to "the book" or "the board".
  A share of six modelled expiries is not a share of the root's whole open
  interest, and the copy must not let a reader believe otherwise.

  Colour: gamma expiring is not a direction, so the bars take holo-silver, not
  green or red. The monthly (OPEX) rungs take amber — the same amber the OPEX
  tag in the table already uses — because a concentration is a caveat about the
  distribution, not a bullish or bearish fact.
*/

const OPEX_INK = '#FF9500'; // `warn` — matches the OPEX tag in the table below
const CUM_INK = 'rgba(228,232,244,0.45)';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

interface RolloffRow extends RolloffExpiry {
  /** cumShare as a percent, for the secondary axis. */
  cumPct: number;
}

const GammaRolloff = () => {
  const { marketData } = useMarketData();
  const view = useMemo(() => (marketData ? buildGammaRolloff(marketData) : null), [marketData]);

  const rows: RolloffRow[] = useMemo(
    () => (view ? view.expiries.map(e => ({ ...e, cumPct: e.cumShare * 100 })) : []),
    [view]
  );

  if (!view || view.expiries.length === 0) {
    return (
      <Panel title="Gamma roll-off" subtitle="When dealer gamma expires">
        <EmptyState title="No listed expiries" body="This root has no upcoming expiries to schedule." />
      </Panel>
    );
  }

  const { ticker, convention, expiries, totalGamma, biggest, halfLifeSessions } = view;
  const maxG = Math.max(...expiries.map(e => e.gamma), 1);
  const horizon = expiries.length;
  const lastRung = expiries[horizon - 1];

  // Share expiring inside a week — a distinct fact from "the biggest rung",
  // which on a 1/sqrt(t) density is almost always the front one. The two cards
  // used to print the identical number on every symbol.
  const weekShare = expiries.filter(e => e.dte <= 7).reduce((a, e) => a + e.share, 0);
  const weekCount = expiries.filter(e => e.dte <= 7).length;

  const read = biggest
    ? `${pct(biggest.share)} of the ${ticker} gamma on the next ${horizon} listed expiries rolls off on ${biggest.label}${biggest.opex ? ' (monthly OPEX)' : ''} — the largest single rung of the ${horizon}. Half of this horizon is gone within ${halfLifeSessions} session${halfLifeSessions === 1 ? '' : 's'}, and the pin holding price today expires with the front rung.`
    : '';

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Gamma roll-off" subtitle={`When ${ticker}'s dealer gamma expires · next ${horizon} ${convention} expiries`}>
        <div className="flex flex-col gap-4">
          <p className="text-caption leading-relaxed text-textSecondary">{read}</p>

          <MetricGrid min="170px">
            <StatCard label="Horizon gamma" value={fmtUsd(totalGamma)} sub={`across ${horizon} listed expiries`} emphasis />
            <StatCard
              label="Biggest roll-off"
              value={biggest ? pct(biggest.share) : '—'}
              sub={biggest ? `${biggest.label} · ${fmtUsd(biggest.gamma)}` : 'awaiting chain'}
              tone="warn"
            />
            <StatCard
              label="Gone within a week"
              value={pct(weekShare)}
              sub={weekCount === 0 ? 'no rung inside 7d' : `${weekCount} rung${weekCount === 1 ? '' : 's'} ≤ 7 DTE`}
            />
            <StatCard label="Gamma half-life" value={`${halfLifeSessions} sess`} sub="half the horizon gone by" />
          </MetricGrid>

          {/* The schedule as a shape: bars are what leaves on each date, the
              silver line is how much of the horizon has gone by then. */}
          <ChartFrame
            title="Roll-off schedule"
            meta={`${horizon} rungs → ${lastRung.label} · Modeled`}
            height={200}
            legend={
              <>
                <Swatch color={FOCUS} label="Gamma expiring" />
                <Swatch color={OPEX_INK} label="Monthly OPEX" />
                <Swatch color={CUM_INK} label="Cumulative %" dash />
              </>
            }
            ariaLabel={`Dealer gamma expiring on each of ${ticker}'s next ${horizon} listed expiries, largest on ${biggest?.label ?? 'the front rung'} at ${biggest ? pct(biggest.share) : '0%'} of the horizon, with half gone within ${halfLifeSessions} sessions.`}
          >
            <ComposedChart data={rows} margin={chartMargin}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis {...categoryAxis} dataKey="label" interval={0} />
              <YAxis {...valueAxisLeft} yAxisId="g" tickFormatter={axisUsd} width={56} />
              <YAxis
                yAxisId="cum"
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={axisPct}
                tick={{ fill: CUM_INK, fontSize: 10, fontFamily: CHART_FONT }}
                tickLine={false}
                axisLine={false}
                width={38}
              />
              {/* The half-life the stat card quotes, drawn where it lands. */}
              <ReferenceLine yAxisId="cum" y={50} stroke={REF_LINE} strokeDasharray="4 4" />
              <Tooltip
                cursor={BAR_CURSOR}
                content={
                  <ChartTip<RolloffRow>
                    render={r => (
                      <>
                        <TipHead sub={r.dte === 0 ? '0 DTE' : `${r.dte}D · ${r.sessions} sess`}>
                          {r.label}
                          {r.opex ? ' · OPEX' : ''}
                        </TipHead>
                        <TipRow label="Gamma expiring" value={fmtUsd(r.gamma)} />
                        <TipRow label="Share of horizon" value={pct(r.share)} tone={r.opex ? 'text-warn' : 'text-textPrimary'} />
                        <TipRow label="Cumulative by then" value={pct(r.cumShare)} tone="text-textSecondary" />
                        <TipRow label="Still live after" value={pct(1 - r.cumShare)} tone="text-textSecondary" />
                        <TipNote>
                          {r.opex
                            ? 'A standard monthly: open interest concentrates here, so the rung carries more than its position on the curve alone would give it. '
                            : ''}
                          {r.cumShare >= 0.5
                            ? `By this date more than half the modelled horizon has expired — whatever pinning survives past it comes from the ${horizon - (rows.indexOf(r) + 1)} rungs further out.`
                            : `${pct(1 - r.cumShare)} of the horizon is still live the morning after — the book does not empty here.`}
                        </TipNote>
                      </>
                    )}
                  />
                }
              />
              <Bar yAxisId="g" dataKey="gamma" radius={[2, 2, 0, 0]} maxBarSize={54} isAnimationActive={false}>
                {rows.map(r => (
                  <Cell key={r.date.getTime()} fill={r.opex ? OPEX_INK : FOCUS} fillOpacity={r.opex ? 0.85 : 0.55} />
                ))}
              </Bar>
              <Line
                yAxisId="cum"
                type="monotone"
                dataKey="cumPct"
                stroke={CUM_INK}
                strokeWidth={1.5}
                dot={{ r: 2, fill: CUM_INK, stroke: 'none' }}
                activeDot={{ r: 3.2, fill: FOCUS, stroke: 'none' }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartFrame>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-borderSubtle text-textMuted">
                  <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Expiry</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">DTE</th>
                  <th className="px-2 py-2 text-left font-mono text-label font-semibold uppercase tracking-wider">Gamma rolling off</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Share</th>
                  <th className="px-2 py-2 text-right font-mono text-label font-semibold uppercase tracking-wider">Cum.</th>
                </tr>
              </thead>
              <tbody>
                {expiries.map(e => (
                  <tr key={e.date.getTime()} className="border-b border-borderSubtle/40 hover:bg-rowHover">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-mono text-caption font-semibold text-textPrimary">{e.label}</span>
                      {e.opex && (
                        <span className="ml-1.5 font-mono text-micro font-bold uppercase tracking-wider text-warn">opex</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textMuted">{e.dte}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="relative h-[6px] flex-1 min-w-[60px] rounded-full bg-white/[0.06] overflow-hidden">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-select/80"
                            style={{ width: `${(e.gamma / maxG) * 100}%` }}
                          />
                        </span>
                        <span className="w-16 shrink-0 text-right font-mono text-caption tnum text-textSecondary">{fmtUsd(e.gamma)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textPrimary">{pct(e.share)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-caption tnum text-textMuted">{pct(e.cumShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="font-mono text-micro uppercase tracking-wider text-textMuted">
            Modeled from the book's gross gamma and the {convention} expiry ladder · shares are of these {horizon} rungs, not
            of the root's full open interest · not a traded schedule
          </p>
        </div>
      </Panel>
    </div>
  );
};

export default GammaRolloff;
