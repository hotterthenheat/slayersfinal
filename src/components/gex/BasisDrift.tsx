import { ComposedChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CALL_SIDE, PUT_SIDE, SPOT } from './palette';
import { AXIS_TICK, AwaitingState, CURSOR_INK, GRID_INK, LegendKey, TipCard, TipRow, fiveTicks, timeTick } from './driftKit';
import type { Candle } from '../../types/market';

/*
==================================================
  SLAYER TERMINAL - THE BASIS BANDS ON THE TAPE — P-16
  (components/gex/BasisDrift.tsx)
==================================================

  The directive's own words: "Companion chart overlay: volume-weighted
  cost basis of all open calls and all open puts as two bands. When price
  crosses the call-holder basis band, every call holder above it flips
  red→green at once — a mechanical supply event you can watch approach."

  The first cut shipped the bands as SENTENCES. This is the watching:
  Wall Drift's grammar (fourth sibling, on the shared kit), the tape in
  the desk's white and each band as a dashed rule in its SIDE'S ink —
  steel for the call buyers' break-even, gold for the put buyers' —
  because whose basis it is IS a side read. The hover card carries the
  distance to each band, which is the number a reader is tracking as
  price walks toward one.

  THE FRAME BELONGS TO THE TAPE. A basis parked 147 points below spot
  once flattened the whole session into one pixel of line — the subject
  destroyed to keep a far level visible. A band within half the tape's
  own range of the frame is worth stretching for; one further out draws
  as an EDGE MARKER carrying its distance, which is the number a reader
  actually wants about a far level anyway.
*/

interface BasisDriftProps {
  bars: Candle[];
  /** Break-even SPOTS, from the band inversion — null when unreadable. */
  callBe: number | null;
  putBe: number | null;
}

interface TipProps {
  active?: boolean;
  payload?: { payload?: Candle }[];
  callBe: number | null;
  putBe: number | null;
}

const BasisTip = ({ active, payload, callBe, putBe }: TipProps) => {
  const b = payload?.[0]?.payload;
  if (!active || !b) return null;
  return (
    <TipCard title={timeTick(b.time)}>
      <TipRow ink={SPOT} label="Price" value={b.close.toFixed(2)} />
      {callBe !== null && (
        <TipRow ink={CALL_SIDE} label="to call flip" value={Math.abs(b.close - callBe).toFixed(2)} valueInk={CALL_SIDE} />
      )}
      {putBe !== null && (
        <TipRow ink={PUT_SIDE} label="to put flip" value={Math.abs(b.close - putBe).toFixed(2)} valueInk={PUT_SIDE} />
      )}
    </TipCard>
  );
};

const BasisDrift = ({ bars, callBe, putBe }: BasisDriftProps) => {
  if (bars.length < 2) {
    return <AwaitingState tall={false}>Awaiting the tape…</AwaitingState>;
  }

  /*
    COPIES, NOT THE LIVE BARS. Recharts freezes the rows it is handed (its
    state runs on immer), and the first cut passed the simulator's own
    candle array — whose LAST BAR the simulator mutates every tick. The
    freeze made those objects read-only and the SIM crashed four times a
    second trying to update its own tape. Anything recharts draws must own
    its rows.
  */
  const rows = bars.map(b => ({ ...b }));

  let tMin = Infinity;
  let tMax = -Infinity;
  for (const b of bars) {
    tMin = Math.min(tMin, b.close);
    tMax = Math.max(tMax, b.close);
  }
  const range = tMax - tMin || 1;
  let vMin = tMin;
  let vMax = tMax;
  for (const band of [callBe, putBe]) {
    if (band !== null && band >= tMin - range * 0.5 && band <= tMax + range * 0.5) {
      vMin = Math.min(vMin, band);
      vMax = Math.max(vMax, band);
    }
  }
  const pad = (vMax - vMin) * 0.08 || 1;
  vMin -= pad;
  vMax += pad;
  const last = bars[bars.length - 1].close;
  const edgeBands: { side: string; band: number; ink: string }[] = [];
  for (const [side, band, ink] of [
    ['call', callBe, CALL_SIDE],
    ['put', putBe, PUT_SIDE],
  ] as [string, number | null, string][]) {
    if (band !== null && (band < vMin || band > vMax)) edgeBands.push({ side, band, ink });
  }
  const inFrame = (band: number | null): band is number => band !== null && band >= vMin && band <= vMax;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <LegendKey ink={SPOT}>Price</LegendKey>
        <LegendKey ink={CALL_SIDE} dash>
          Call buyers flip
        </LegendKey>
        <LegendKey ink={PUT_SIDE} dash>
          Put buyers flip
        </LegendKey>
      </div>

      <div className="h-36 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_INK} vertical={false} />
            <XAxis
              dataKey="time"
              ticks={fiveTicks(rows.map(b => b.time))}
              tickFormatter={timeTick}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              height={16}
            />
            <YAxis
              domain={[vMin, vMax]}
              tick={AXIS_TICK}
              tickFormatter={(v: number) => v.toFixed(2)}
              tickLine={false}
              axisLine={false}
              width={48}
              tickCount={4}
            />
            <Tooltip
              content={<BasisTip callBe={callBe} putBe={putBe} />}
              isAnimationActive={false}
              cursor={{ stroke: CURSOR_INK, strokeWidth: 1 }}
            />
            {inFrame(callBe) && (
              <ReferenceLine y={callBe} stroke={CALL_SIDE} strokeOpacity={0.75} strokeDasharray="3 3" />
            )}
            {inFrame(putBe) && <ReferenceLine y={putBe} stroke={PUT_SIDE} strokeOpacity={0.75} strokeDasharray="3 3" />}
            <Line
              dataKey="close"
              stroke={SPOT}
              strokeWidth={1.6}
              strokeOpacity={0.9}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 1, stroke: '#0c0c0c' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {/* Far bands: an edge marker with the distance — the frame stays the
            tape's. */}
        {edgeBands.map(e => (
          <span
            key={e.side}
            className={`absolute right-1 font-mono text-[8px] tnum ${e.band > vMax ? 'top-0' : 'bottom-4'}`}
            style={{ color: e.ink }}
          >
            {e.band > vMax ? '↑' : '↓'} {e.side} flip {e.band.toFixed(2)} · {Math.abs(last - e.band).toFixed(2)} away
          </span>
        ))}
      </div>
    </div>
  );
};

export default BasisDrift;
