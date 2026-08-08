import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { RndData } from '../../../types/gex';
import { preserveGreek } from '../../ui/greek';
import { ChartTip, TipHead, TipRow, TipNote } from '../../charts/ChartTip';
import { GRID, CURSOR, chartMargin, categoryAxis, axisTick } from '../../charts/chartTheme';
import { FOCUS, BULL, BEAR, SPOT, MUTED_INK } from '../palette';

interface RiskNeutralDistProps {
  data: RndData;
}

/*
  Options-implied price density with sigma markers — where the market prices the
  odds. On recharts, on the house chart theme.

  Two things the port fixes beyond the furniture:

  The density curve was lilac (rgba(151,136,196,·)), an ink that appears nowhere
  else in the system. A modelled distribution is not a direction and not a
  selection; it takes holo-silver like every other model output.

  The cumulative probability under the cursor was recomputed by summing the
  density from index 0 on every mouse move — O(n) per hover, O(n^2) across a
  sweep. It is now a prefix sum computed once, which is also what lets the
  read-out afford to show the local probability mass as well as the tails.
*/

interface Row {
  price: number;
  density: number;
  /** Market-implied probability of settling at or below this price, %. */
  cumBelow: number;
  /** Probability mass in this grid cell alone, %. */
  mass: number;
}

const RiskNeutralDist = ({ data }: RiskNeutralDistProps) => {
  const { prices, density, forward, sigma1, sigma2, stats } = data;

  const rows: Row[] = useMemo(() => {
    // `density` is the plotting-normalised curve, so its running share IS the CDF.
    const total = density.reduce((s, d) => s + d, 0) || 1;
    let run = 0;
    return prices.map((price, i) => {
      run += density[i];
      return { price, density: density[i], cumBelow: (run / total) * 100, mass: (density[i] / total) * 100 };
    });
  }, [prices, density]);

  const lo = prices[0];
  const hi = prices[prices.length - 1];

  const markers: { price: number; label: string; color: string; dash?: string }[] = [
    { price: sigma2[0], label: '−2σ', color: BEAR, dash: '2 2' },
    { price: sigma1[0], label: '−1σ', color: MUTED_INK, dash: '3 2' },
    { price: forward, label: 'Fwd', color: SPOT },
    { price: sigma1[1], label: '+1σ', color: MUTED_INK, dash: '3 2' },
    { price: sigma2[1], label: '+2σ', color: BULL, dash: '2 2' },
  ];

  // `full` is the long name for the `title` tooltip. Seven cells of a panel-width
  // strip are ~100px each, and "RISK REV 25Δ" at tracking-widest needed ~110 —
  // so the Δ was the character that got cut off, on the two cells whose whole
  // meaning is the 25-delta wing. Abbreviated to the desk shorthand instead of
  // truncated to something that reads as a different statistic.
  const statCells: { label: string; value: string; tone?: string; full?: string }[] = [
    { label: 'Exp Move', value: `±${stats.expMoveAbs.toFixed(1)} (±${stats.expMovePct.toFixed(2)}%)` },
    { label: 'Skew', value: stats.skew.toFixed(2), tone: 'text-bear' },
    { label: 'Kurtosis', value: stats.kurtosis.toFixed(2) },
    { label: 'P(>+2σ)', value: `${stats.pAbove2.toFixed(2)}%` },
    { label: 'P(<-2σ)', value: `${stats.pBelow2.toFixed(2)}%` },
    { label: 'RR 25Δ', full: 'Risk reversal, 25-delta wings', value: `${stats.riskReversal.toFixed(2)} vol`, tone: 'text-bear' },
    { label: 'Fly 25Δ', full: 'Butterfly, 25-delta wings', value: `${stats.butterfly.toFixed(2)} vol` },
  ];

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div
        className="flex-grow min-h-0"
        role="img"
        aria-label={`Options-implied risk-neutral price density from ${lo.toFixed(0)} to ${hi.toFixed(0)}, centred on a forward of ${forward.toFixed(0)}, with one and two sigma markers. Expected move plus or minus ${stats.expMovePct.toFixed(2)} percent.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ ...chartMargin, top: 16 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              {...categoryAxis}
              type="number"
              dataKey="price"
              domain={[lo, hi]}
              ticks={markers.map(m => m.price)}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            {/* The y value is a normalised density — the NUMBER carries no unit a
                reader can use, so the axis is hidden and the read-out gives the
                probability instead. Keeping the axis for layout only. */}
            <YAxis hide domain={[0, 'dataMax']} tick={axisTick} />
            {markers.map(m => (
              <ReferenceLine
                key={m.label}
                x={m.price}
                stroke={m.color}
                strokeOpacity={m.label === 'Fwd' ? 0.9 : 0.6}
                strokeDasharray={m.dash}
                label={{
                  value: m.label,
                  position: 'top',
                  fill: m.label === 'Fwd' ? SPOT : MUTED_INK,
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            ))}
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTip<Row>
                  render={r => {
                    const vsFwd = ((r.price - forward) / forward) * 100;
                    const above = 100 - r.cumBelow;
                    const inside = r.price >= sigma1[0] && r.price <= sigma1[1];
                    return (
                      <>
                        <TipHead sub={`${vsFwd >= 0 ? '+' : ''}${vsFwd.toFixed(1)}% vs fwd`}>{r.price.toFixed(0)}</TipHead>
                        <TipRow label="Settles below" value={`${r.cumBelow.toFixed(1)}%`} tone="text-bear" />
                        <TipRow label="Settles above" value={`${above.toFixed(1)}%`} tone="text-bull" />
                        <TipRow label="Mass at this price" value={`${r.mass.toFixed(2)}%`} tone="text-textSecondary" />
                        <TipNote>
                          {inside
                            ? 'Inside the one-sigma band — the market prices roughly two thirds of outcomes into this range.'
                            : r.price < sigma2[0] || r.price > sigma2[1]
                              ? 'Beyond two sigma. The market prices this as a tail, and tail pricing is where the surface is thinnest.'
                              : 'Between one and two sigma — a move the market considers possible but not the base case.'}
                        </TipNote>
                      </>
                    );
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="density"
              stroke={FOCUS}
              strokeWidth={1.5}
              fill={FOCUS}
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 3, fill: FOCUS, stroke: 'none' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-center font-mono text-micro uppercase tracking-wider text-textMuted select-none">
        underlying price
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-2 border-t border-borderSubtle">
        {statCells.map(s => (
          <span key={s.label} className="min-w-0">
            <span title={s.full} className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">
              {preserveGreek(s.label)}
            </span>
            <span className={`block font-mono text-micro font-semibold tnum ${s.tone ?? 'text-textPrimary'}`}>{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default RiskNeutralDist;
