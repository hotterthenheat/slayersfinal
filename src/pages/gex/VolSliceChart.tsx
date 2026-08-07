import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts';
import { ChartTip, TipHead, TipRow, TipNote } from '../../components/charts/ChartTip';
import { GRID, CURSOR, chartMargin, valueAxis, categoryAxis, axisVol, paddedDomain, niceTicks, REF_LINE } from '../../components/charts/chartTheme';
import { FOCUS, MUTED_INK, SPOT } from '../../components/gex/palette';

export interface SlicePoint {
  /** numeric position on the x axis (moneyness or DTE) */
  x: number;
  /** implied vol at this point, % — read straight from the surface grid */
  y: number;
  /** display label for the axis + readout */
  label: string;
}

interface VolSliceChartProps {
  points: SlicePoint[];
  /** short caption for the x descriptor in the readout, e.g. 'Moneyness' / 'Tenor' */
  xCaption: string;
  /** axis title under the chart */
  xTitle: string;
  /** index of the reference point (ATM column / 30D tenor) */
  refIndex: number;
  /** label for the reference marker, e.g. 'ATM' / '30D' */
  refLabel: string;
}

/**
 * A single 2D cross-section of the IV surface — one row (skew) or one column
 * (term) — with a pinned point and a live read-out. Every value shown is read
 * directly from the points passed in; nothing is refit.
 *
 * On recharts, on the house chart theme. Two things the port fixes:
 *
 * The curve was lilac (rgba(151,136,196,·)), an ink used nowhere else in the
 * system. A slice of a modelled surface takes holo-silver like every other
 * model output.
 *
 * The vol axis was two corner labels — the min at the bottom-left and the max at
 * the top-left — with nothing between them, so a reader could see the shape but
 * could not read a value off it without hovering. It is a real axis now.
 *
 * Click-to-pin survives the port: recharts reports the active index on both
 * move and click, so the pin is set from the same index the tooltip is showing.
 */
const VolSliceChart = ({ points, xCaption, xTitle, refIndex, refLabel }: VolSliceChartProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinIdx, setPinIdx] = useState<number>(refIndex);

  const activeIdx = Math.min(hoverIdx ?? pinIdx, points.length - 1);
  const active = points[activeIdx];
  const ref = points[Math.min(refIndex, points.length - 1)];
  const dIv = active.y - ref.y;
  const domain = paddedDomain(points.map(p => p.y), 0.14);

  // Up to five x ticks, evenly spaced through the slice — enough to locate a
  // point, few enough that the labels never collide.
  const tickIdxs = Array.from(
    new Set(
      points.length <= 6
        ? points.map((_, i) => i)
        : [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (points.length - 1)))
    )
  );

  /** recharts 3 widens activeTooltipIndex to number | TooltipIndex | null. */
  const idxOf = (raw: unknown): number | null => {
    const n = typeof raw === 'number' ? raw : raw != null ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.min(points.length - 1, n)) : null;
  };

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Selected-point readout */}
      <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap select-none">
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">{xCaption}</span>
          <span className="font-mono text-data font-semibold tnum text-textPrimary">{active.label}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">Implied Vol</span>
          <span className="font-mono text-data font-semibold tnum text-textPrimary">{active.y.toFixed(2)}%</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-label uppercase tracking-widest text-textMuted">vs {refLabel}</span>
          <span className="font-mono text-data font-semibold tnum text-textSecondary">
            {dIv > 0 ? '+' : dIv < 0 ? '−' : ''}
            {Math.abs(dIv).toFixed(2)}
          </span>
        </span>
        <span className="ml-auto font-mono text-micro uppercase tracking-wider text-textMuted">
          {hoverIdx === null ? 'hover to scan · click to pin' : 'click to pin'}
        </span>
      </div>

      <div
        className="flex-grow min-h-0 cursor-crosshair"
        role="img"
        aria-label={`Implied volatility slice across ${xTitle.toLowerCase()}, from ${points[0].y.toFixed(1)}% at ${points[0].label} to ${points[points.length - 1].y.toFixed(1)}% at ${points[points.length - 1].label}, referenced to ${refLabel} at ${ref.y.toFixed(1)}%.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ ...chartMargin, top: 14 }}
            onMouseMove={s => setHoverIdx(idxOf(s?.activeTooltipIndex))}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={s => {
              const i = idxOf(s?.activeTooltipIndex);
              if (i !== null) setPinIdx(i);
            }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              {...categoryAxis}
              type="category"
              dataKey="label"
              interval={0}
              ticks={tickIdxs.map(i => points[i].label)}
            />
            <YAxis {...valueAxis} domain={domain} ticks={niceTicks(domain[0], domain[1])} tickFormatter={axisVol} width={40} />
            {/* The reference column (ATM / 30D) the read-out measures against. */}
            <ReferenceLine
              x={ref.label}
              stroke={MUTED_INK}
              strokeOpacity={0.6}
              strokeDasharray="2 2"
              label={{ value: refLabel, position: 'top', fill: MUTED_INK, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
            />
            {/* The pinned point stays marked while the cursor scans elsewhere. */}
            <ReferenceLine x={points[Math.min(pinIdx, points.length - 1)].label} stroke={REF_LINE} />
            <Tooltip
              cursor={CURSOR}
              content={
                <ChartTip<SlicePoint>
                  render={p => {
                    const d = p.y - ref.y;
                    return (
                      <>
                        <TipHead sub={xCaption}>{p.label}</TipHead>
                        <TipRow label="Implied vol" value={`${p.y.toFixed(2)}%`} />
                        <TipRow
                          label={`vs ${refLabel}`}
                          value={`${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(2)} pt`}
                          tone={Math.abs(d) < 0.05 ? 'text-textMuted' : 'text-textSecondary'}
                        />
                        <TipNote>
                          {Math.abs(d) < 0.05
                            ? `This point prices the same vol as ${refLabel}.`
                            : `Options here price ${Math.abs(d).toFixed(1)} vol points ${d > 0 ? 'more' : 'less'} than ${refLabel} — read straight off the surface, not refit.`}
                        </TipNote>
                      </>
                    );
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="y"
              stroke={FOCUS}
              strokeWidth={1.6}
              fill={FOCUS}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 3.5, fill: SPOT, stroke: 'none' }}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={points[Math.min(pinIdx, points.length - 1)].label}
              y={points[Math.min(pinIdx, points.length - 1)].y}
              r={3.5}
              fill={SPOT}
              stroke="none"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-center font-mono text-micro uppercase tracking-wider text-textMuted select-none">{xTitle}</div>
    </div>
  );
};

export default VolSliceChart;
