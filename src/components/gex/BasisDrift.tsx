import { useRef, useState } from 'react';
import { CALL_SIDE, PUT_SIDE, SPOT } from './palette';
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
  Wall Drift's grammar (fourth sibling), the tape in the desk's white and
  each band as a dashed rule in its SIDE'S ink — steel for the call
  buyers' break-even, gold for the put buyers' — because whose basis it
  is IS a side read. The hover card carries the distance to each band,
  which is the number a reader is tracking as price walks toward one.
*/

const W = 100;
const H = 40;

const BasisDrift = ({
  bars,
  callBe,
  putBe,
}: {
  bars: Candle[];
  /** Break-even SPOTS, from the band inversion — null when unreadable. */
  callBe: number | null;
  putBe: number | null;
}) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (bars.length < 2) {
    return (
      <div className="h-36 flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
        Awaiting the tape…
      </div>
    );
  }

  /*
    THE FRAME BELONGS TO THE TAPE. The first cut held the bands in frame
    unconditionally, and a basis parked 147 points below spot flattened the
    whole session into one pixel of line — the subject destroyed to keep a
    far level visible. A band within reach of the frame is worth stretching
    for (up to half the tape's own range beyond it); one further out draws
    as an EDGE MARKER carrying its distance, which is the number a reader
    actually wants about a far level anyway.
  */
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
  const yOf = (v: number) => H - ((v - vMin) / (vMax - vMin)) * H;
  const xOf = (i: number) => (i / (bars.length - 1)) * W;
  const path = bars.map((b, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(b.close).toFixed(2)}`).join(' ');

  const timeLabel = (t: number) =>
    new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${SPOT}` }} />
          Price
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px dashed ${CALL_SIDE}` }} />
          Call buyers flip
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px dashed ${PUT_SIDE}` }} />
          Put buyers flip
        </span>
      </div>

      <div
        ref={areaRef}
        className="h-36 relative cursor-crosshair"
        onMouseMove={e => {
          const rect = areaRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0) return;
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          setHover(Math.round(ratio * (bars.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
          ))}
          {callBe !== null && callBe >= vMin && callBe <= vMax && (
            <line x1="0" y1={yOf(callBe)} x2={W} y2={yOf(callBe)} stroke={CALL_SIDE} strokeWidth="0.6" strokeDasharray="2 2" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" />
          )}
          {putBe !== null && putBe >= vMin && putBe <= vMax && (
            <line x1="0" y1={yOf(putBe)} x2={W} y2={yOf(putBe)} stroke={PUT_SIDE} strokeWidth="0.6" strokeDasharray="2 2" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" />
          )}
          <path d={path} fill="none" stroke={SPOT} strokeWidth="0.8" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-0 top-0 font-mono text-[8px] tnum text-textMuted">{vMax.toFixed(2)}</span>
        <span className="absolute left-0 bottom-0 font-mono text-[8px] tnum text-textMuted">{vMin.toFixed(2)}</span>
        {/* Far bands: an edge marker with the distance — the frame stays the
            tape's. */}
        {edgeBands.map(e => (
          <span
            key={e.side}
            className={`absolute right-0 font-mono text-[8px] tnum ${e.band > vMax ? 'top-0' : 'bottom-0'}`}
            style={{ color: e.ink }}
          >
            {e.band > vMax ? '↑' : '↓'} {e.side} flip {e.band.toFixed(2)} · {Math.abs(last - e.band).toFixed(2)} away
          </span>
        ))}

        {hover != null &&
          (() => {
            const b = bars[hover];
            const xPct = (hover / (bars.length - 1)) * 100;
            const flipSide = xPct > 58;
            return (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none" style={{ left: `${xPct}%` }} />
                <div
                  className="absolute top-1 pointer-events-none border border-borderMuted bg-panel/95 rounded px-2 py-1.5 shadow-xl shadow-black/50"
                  style={flipSide ? { right: `${100 - xPct + 1.5}%` } : { left: `${xPct + 1.5}%` }}
                >
                  <div className="font-mono text-[9px] text-textMuted tnum mb-0.5">{timeLabel(b.time)}</div>
                  <div className="font-mono text-[10px] tnum text-textPrimary">{b.close.toFixed(2)}</div>
                  {callBe !== null && (
                    <div className="font-mono text-[10px] tnum" style={{ color: CALL_SIDE }}>
                      {Math.abs(b.close - callBe).toFixed(2)} to call flip
                    </div>
                  )}
                  {putBe !== null && (
                    <div className="font-mono text-[10px] tnum" style={{ color: PUT_SIDE }}>
                      {Math.abs(b.close - putBe).toFixed(2)} to put flip
                    </div>
                  )}
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
};

export default BasisDrift;
