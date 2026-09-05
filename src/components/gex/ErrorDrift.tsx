import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ALERT, SPOT } from './palette';
import { fmtUsd } from '../../data/gex';
import { AXIS_TICK, AwaitingState, CURSOR_INK, GRID_INK, LegendKey, TipCard, TipRow, fiveTicks, timeTick } from './driftKit';
import type { ErrorPoint } from '../../data/modelError';

/*
==================================================
  SLAYER TERMINAL - MODEL ERROR TIMELINE — P-23
  (components/gex/ErrorDrift.tsx)
==================================================

  Wall Drift's grammar, third sibling — the shared kit, the same card —
  because the competitor this tab audits (Periscope) IS a time chart of
  actualized gamma, and an audit that answers a chart with a table loses on
  sight. The first cut did exactly that.

  THE GAP IS THE SUBJECT. Two lines share one dollar scale — the model in
  the tape's own white, the reference in the gauge's alert orange — and
  the region BETWEEN them is filled in that orange: the wrongness itself,
  visibly widening and narrowing through the session. Drawn as a range
  area between the per-moment min and max of the pair, so the crossings
  where the two trade places pinch it to zero, which is the honest picture
  of a moment the model was right.

  No regime ink here on purpose: both series are net GEX, but this page's
  question is not "which regime" — it is "how far apart are these two
  answers", and ALERT is the desk's ink for a warning about a measurement.
*/

interface ErrRow extends ErrorPoint {
  band: [number, number];
}

interface TipProps {
  active?: boolean;
  payload?: { payload?: ErrRow }[];
}

const ErrTip = ({ active, payload }: TipProps) => {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const big = p.errorPct !== null && Math.abs(p.errorPct) >= 0.25;
  return (
    <TipCard title={timeTick(p.time)}>
      <TipRow ink={SPOT} label="ours" value={fmtUsd(p.inferred)} />
      <TipRow ink={ALERT} label="ref" value={fmtUsd(p.actualized)} valueInk={ALERT} />
      <TipRow
        ink={big ? ALERT : SPOT}
        label="error"
        value={p.errorPct === null ? 'ref at zero' : `${p.errorPct > 0 ? '+' : ''}${(p.errorPct * 100).toFixed(1)}%`}
        valueInk={big ? ALERT : undefined}
      />
    </TipCard>
  );
};

const ErrorDrift = ({ points }: { points: ErrorPoint[] }) => {
  if (points.length < 2) {
    return <AwaitingState>Awaiting shared moments…</AwaitingState>;
  }

  /* The reading is the SIZE and SIGN of the typical gap, plus how often it
     leaves the dead zone — not "two lines and a shaded band". */
  const errs = points.map(p => p.errorPct).filter((v): v is number => v !== null);
  const meanErr = errs.length > 0 ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
  const outside = errs.filter(v => Math.abs(v) >= 0.25).length;
  const summary =
    meanErr === null
      ? 'Model error — not enough matured readings to draw.'
      : `Inferred against actualized: average error ${meanErr >= 0 ? '+' : '−'}${Math.abs(meanErr).toFixed(2)}, ` +
        `${outside} of ${errs.length} reading${errs.length === 1 ? '' : 's'} outside the ±0.05 dead zone.`;

  const rows: ErrRow[] = points.map(p => ({
    ...p,
    band: [Math.min(p.inferred, p.actualized), Math.max(p.inferred, p.actualized)],
  }));

  return (
    <div className="w-full flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <LegendKey ink={SPOT}>Textbook GEX — ours</LegendKey>
        <LegendKey ink={ALERT}>Reference</LegendKey>
        <LegendKey ink={ALERT} swatch>
          The gap is the error
        </LegendKey>
      </div>

      {/* 0.13 — the gap between the two lines IS the chart, and a reader
          who cannot see it has no other way to get the size of it. */}
      <div className="flex-grow min-h-0" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_INK} vertical={false} />
            <XAxis
              dataKey="time"
              ticks={fiveTicks(rows.map(p => p.time))}
              tickFormatter={timeTick}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              height={16}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => fmtUsd(v)}
              tickLine={false}
              axisLine={false}
              width={56}
              tickCount={4}
            />
            <Tooltip content={<ErrTip />} isAnimationActive={false} cursor={{ stroke: CURSOR_INK, strokeWidth: 1 }} />
            <Area dataKey="band" fill={ALERT} fillOpacity={0.14} stroke="none" isAnimationActive={false} activeDot={false} />
            <Line dataKey="actualized" stroke={ALERT} strokeWidth={1.8} strokeOpacity={0.9} dot={false} activeDot={{ r: 3.5, strokeWidth: 1, stroke: '#0c0c0c' }} isAnimationActive={false} />
            <Line dataKey="inferred" stroke={SPOT} strokeWidth={1.4} strokeOpacity={0.85} dot={false} activeDot={{ r: 3.5, strokeWidth: 1, stroke: '#0c0c0c' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ErrorDrift;
