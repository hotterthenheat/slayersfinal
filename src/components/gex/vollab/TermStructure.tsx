import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TermStructureData } from '../../../types/gex';
import { ChartTip, TipHead, TipRow, TipSeries, TipNote } from '../../charts/ChartTip';
import { GRID, CURSOR, chartMargin, valueAxis, categoryAxis, axisVol, paddedDomain, niceTicks } from '../../charts/chartTheme';
import { Swatch } from '../../charts/ChartFrame';

interface TermStructureProps {
  data: TermStructureData;
}

/*
  ATM IV vs DTE — the current curve over its own history.

  On recharts, on the house chart theme. Two things changed with the port:

  The x axis is LOG in time. 7d to 360d is a fifty-fold range, and the old
  linear axis (x = dte/360) put the entire front month — the part that actually
  moves, and the part every other panel quotes — inside the first eighth of the
  plot. Log time is the convention for a term structure for exactly that reason.

  The vintages are silver at descending opacity rather than grey-plus-a-lilac.
  The lilac (rgba(188,169,209,·)) was the last off-palette ink in the Vol Lab;
  a curve's AGE is not a category that deserves its own hue.
*/

/** Older vintages, dimmer. Drawn back-to-front so "now" reads first. */
const VINTAGE = [
  { key: 'monthAgo' as const, label: '1M ago', color: 'rgba(228,232,244,0.30)', dash: '2 4' },
  { key: 'weekAgo' as const, label: '1W ago', color: 'rgba(228,232,244,0.45)', dash: '5 3' },
  { key: 'dayAgo' as const, label: '1D ago', color: 'rgba(228,232,244,0.62)', dash: '9 3' },
];

const TICKS = [7, 14, 30, 60, 90, 180, 270, 360];

interface Row {
  dte: number;
  now: number;
  dayAgo: number;
  weekAgo: number;
  monthAgo: number;
}

const TermStructure = ({ data }: TermStructureProps) => {
  // All four vintages come off one DTE ladder (data/vollab builds them from the
  // same TERM_DTE array), so index alignment is exact — no interpolation.
  const rows: Row[] = data.current.map((p, i) => ({
    dte: p.dte,
    now: p.iv,
    dayAgo: data.dayAgo[i]?.iv ?? p.iv,
    weekAgo: data.weekAgo[i]?.iv ?? p.iv,
    monthAgo: data.monthAgo[i]?.iv ?? p.iv,
  }));

  const domain = paddedDomain(rows.flatMap(r => [r.now, r.dayAgo, r.weekAgo, r.monthAgo]), 0.1);
  const ticks = TICKS.filter(t => t >= rows[0].dte && t <= rows[rows.length - 1].dte);
  const front = rows.find(r => r.dte >= 30) ?? rows[0];

  const stats: { label: string; value: string }[] = [
    { label: 'ATM IV 30D', value: `${data.stats.atm30.toFixed(2)}%` },
    { label: 'IV 1M', value: `${data.stats.iv1m.toFixed(2)}%` },
    { label: 'IV 3M', value: `${data.stats.iv3m.toFixed(2)}%` },
    { label: 'IV 6M', value: `${data.stats.iv6m.toFixed(2)}%` },
    { label: 'IV 1Y', value: `${data.stats.iv1y.toFixed(2)}%` },
    { label: 'IV Rank 1Y', value: `${data.stats.ivRank}%` },
    { label: 'IV %ile', value: `${data.stats.ivPercentile}%` },
  ];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <Swatch color="#ededed" label="Current" dash />
        {VINTAGE.slice().reverse().map(v => (
          <Swatch key={v.key} color={v.color} label={v.label} dash />
        ))}
        <span className="ml-auto font-mono text-micro uppercase tracking-wider text-textMuted">Log time</span>
      </div>

      <div
        className="flex-grow min-h-0"
        role="img"
        aria-label={`Implied volatility term structure: at-the-money implied vol from ${rows[0].now.toFixed(1)}% at ${rows[0].dte} days to ${rows[rows.length - 1].now.toFixed(1)}% at ${rows[rows.length - 1].dte} days, with the curve as it stood a day, a week and a month ago behind it.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={chartMargin}>
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
            <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={axisVol} width={40} />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTip<Row>
                  render={r => {
                    const dDay = r.now - r.dayAgo;
                    const dMonth = r.now - r.monthAgo;
                    const vsFront = r.now - front.now;
                    return (
                      <>
                        <TipHead sub={`${r.dte}D`}>ATM implied</TipHead>
                        <TipRow label="Now" value={`${r.now.toFixed(2)}%`} />
                        <TipRow
                          label="Since yesterday"
                          value={`${dDay >= 0 ? '+' : ''}${dDay.toFixed(2)} pt`}
                          tone={Math.abs(dDay) < 0.05 ? 'text-textMuted' : 'text-textSecondary'}
                        />
                        <TipSeries color={VINTAGE[1].color} label="1W ago" value={`${r.weekAgo.toFixed(2)}%`} />
                        <TipSeries color={VINTAGE[0].color} label="1M ago" value={`${r.monthAgo.toFixed(2)}%`} />
                        <TipRow label="vs 30d point" value={`${vsFront >= 0 ? '+' : ''}${vsFront.toFixed(2)} pt`} tone="text-textMuted" />
                        <TipNote>
                          {Math.abs(dMonth) < 0.25
                            ? 'This tenor has barely moved in a month.'
                            : `This tenor is ${Math.abs(dMonth).toFixed(1)} pt ${dMonth > 0 ? 'higher' : 'lower'} than a month ago.`}{' '}
                          {Math.abs(vsFront) < 0.25
                            ? 'It prices about the same vol as the 30-day point.'
                            : vsFront > 0
                              ? 'Longer-dated vol is bid over the front here — the calm shape.'
                              : 'It sits under the 30-day point, the shape of near-term stress.'}
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
                strokeWidth={1.2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="now"
              stroke="#ededed"
              strokeWidth={1.9}
              dot={false}
              activeDot={{ r: 3, fill: '#ededed', stroke: 'none' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-2 border-t border-borderSubtle">
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

export default TermStructure;
