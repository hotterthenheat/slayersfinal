import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import SignalBadge from '../../ui/SignalBadge';
import ChartLegend from '../../ui/ChartLegend';
import { ChartTip, TipHead, TipSeries, TipNote } from '../../charts/ChartTip';
import { GRID, CURSOR, chartMargin, categoryAxis, axisPct } from '../../charts/chartTheme';
import type { RegimeData, VolRegime } from '../../../types/gex';
import type { Tone } from '../../ui/tones';

interface RegimePanelProps {
  data: RegimeData;
}

/*
  Vol-regime probability history (stacked to 100%) + the current regime read.
  On recharts, on the house chart theme.

  The three bands ARE a market read — low vol is the benign state and high vol
  the stressed one — so this is one of the few charts where green and red are
  the correct inks rather than borrowed ones.
*/

const LOW = 'rgba(48,209,88,0.5)';
const NORMAL = 'rgba(255,255,255,0.18)';
const HIGH = 'rgba(255,59,48,0.45)';

const regimeTone: Record<VolRegime, Tone> = {
  'LOW VOL': 'bull',
  NORMAL: 'neutral',
  'HIGH VOL': 'bear',
};

interface Row {
  month: string;
  /** Percent, 0-100, summing to 100 across the three. */
  low: number;
  normal: number;
  high: number;
}

const RegimePanel = ({ data }: RegimePanelProps) => {
  const { series, current, prob, since, avgDurationDays, nextLow, nextHigh } = data;

  const rows: Row[] = useMemo(
    () => series.map(s => ({ month: s.month, low: s.low * 100, normal: s.normal * 100, high: s.high * 100 })),
    [series]
  );

  const stats: { label: string; value: string }[] = [
    { label: 'Confidence', value: `${prob}%` },
    { label: 'Since', value: since },
    { label: 'Avg Duration', value: `${avgDurationDays}d` },
    { label: 'Next Low 1M', value: `${nextLow}%` },
    { label: 'Next High 1M', value: `${nextHigh}%` },
  ];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <ChartLegend
          items={[
            { label: 'Low vol', swatchClass: 'bg-bull/60' },
            { label: 'Normal', swatchClass: 'bg-white/[0.18]' },
            { label: 'High vol', swatchClass: 'bg-bear/50' },
          ]}
        />
        <span className="ml-auto">
          <SignalBadge tone={regimeTone[current]} dot>
            {current}
          </SignalBadge>
        </span>
      </div>

      <div
        className="flex-grow min-h-0"
        role="img"
        aria-label={`Volatility-regime probability history across ${rows.length} months, stacked to one hundred percent. The current regime is ${current.toLowerCase()} at ${prob} percent confidence, held since ${since}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={chartMargin} stackOffset="expand">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis {...categoryAxis} dataKey="month" minTickGap={28} />
            {/* stackOffset="expand" normalises to 0-1, so the axis reads as a share. */}
            <YAxis
              orientation="right"
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tickFormatter={(v: number) => axisPct(v * 100)}
              tick={{ fill: '#7d7d7d', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              width={38}
            />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTip<Row>
                  render={r => {
                    const i = rows.indexOf(r);
                    const prev = i > 0 ? rows[i - 1] : null;
                    const top = r.high >= r.low && r.high >= r.normal ? 'high' : r.low >= r.normal ? 'low' : 'normal';
                    const dHigh = prev ? r.high - prev.high : 0;
                    return (
                      <>
                        <TipHead sub="regime odds">{r.month}</TipHead>
                        <TipSeries color={LOW} label="Low vol" value={`${Math.round(r.low)}%`} />
                        <TipSeries color={NORMAL} label="Normal" value={`${Math.round(r.normal)}%`} />
                        <TipSeries color={HIGH} label="High vol" value={`${Math.round(r.high)}%`} />
                        <TipNote>
                          {top === 'high'
                            ? 'The stressed state carried the month — the market priced range expansion as the base case.'
                            : top === 'low'
                              ? 'The benign state carried the month — vol was priced to stay compressed.'
                              : 'Neither tail state dominated; the market held the middle.'}
                          {prev && Math.abs(dHigh) >= 5
                            ? ` High-vol odds ${dHigh > 0 ? 'rose' : 'fell'} ${Math.abs(Math.round(dHigh))} points from the month before.`
                            : ''}
                        </TipNote>
                      </>
                    );
                  }}
                />
              }
            />
            {/* Order matters: low at the bottom, high on top, so the stack reads
                calm-to-stressed upward the way the legend lists it. */}
            <Area type="monotone" dataKey="low" stackId="r" stroke="none" fill={LOW} isAnimationActive={false} />
            <Area type="monotone" dataKey="normal" stackId="r" stroke="none" fill={NORMAL} isAnimationActive={false} />
            <Area type="monotone" dataKey="high" stackId="r" stroke="none" fill={HIGH} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-5 gap-2 pt-2 border-t border-borderSubtle">
        {stats.map(s => (
          <span key={s.label} className="min-w-0">
            <span className="block font-mono text-micro uppercase tracking-widest text-textMuted truncate">{s.label}</span>
            <span className="block font-mono text-micro font-semibold tnum text-textPrimary">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default RegimePanel;
