import { useRef, useState } from 'react';
import { FLIP, LONG_GAMMA, SHORT_GAMMA, SPOT } from '../palette';
import { fmtUsd } from '../../../data/gex';
import type { NetGexSeries } from '../../../data/gexSeries';

/*
==================================================
  SLAYER TERMINAL - NET GEX TIMELINE — P-3
  (components/gex/vannacharm/NetGexDrift.tsx)
==================================================

  Wall Drift's sibling, answering the other half of its question. The drift
  shows where the LEVELS moved through the session; this shows whether the
  gamma behind them GREW or DRAINED — and those are different facts: walls can
  hold position all day while the book behind them empties, which is a pin
  turning into a trend with nothing moving on the drift at all.

  WALL DRIFT'S GRAMMAR THROUGHOUT — same 100×40 viewBox, same hover, same
  card — because the two sit stacked on one page reading the same session,
  and a reader moving between them should not have to learn a second chart.

  THE LINE WEARS THE REGIME'S OWN INKS: red while the total is positive
  (put-dominant, dealers short, amplifying) and green while negative — the
  pair Noah fixed for exactly this number (palette.ts), already on the
  Positioning Map's headline. The ZERO LINE is the flip's blue: crossing it
  is the WHOLE BOOK changing sign — the aggregate flip event, rarer and
  heavier than spot crossing the flip line — and each crossing is marked on
  it. Spot rides along in white on its own scale, so "the book drained WHILE
  price climbed" is one glance rather than two charts.
*/

const W = 100;
const H = 40;

interface NetGexDriftProps {
  series: NetGexSeries;
}

const NetGexDrift = ({ series }: NetGexDriftProps) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { points, zeroCrossings } = series;

  if (points.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
        Awaiting session history…
      </div>
    );
  }

  /* The gamma scale MUST hold zero — the whole point is which side of it the
     session ran — so the domain is symmetric-capable rather than tight. */
  const pad = (series.max - series.min) * 0.08 || 1;
  const gMin = Math.min(series.min, 0) - pad;
  const gMax = Math.max(series.max, 0) + pad;
  const gSpan = gMax - gMin;
  const yOf = (v: number) => H - ((v - gMin) / gSpan) * H;
  const xOf = (i: number) => (i / (points.length - 1)) * W;
  const zeroY = yOf(0);

  /* One path per SIGN RUN, so each stretch wears its own regime ink. The
     boundary point between runs is drawn into both, so the line is continuous
     through the crossing rather than gapped at it. */
  const segments: { d: string; positive: boolean }[] = [];
  let d = `M${xOf(0).toFixed(2)},${yOf(points[0].netGex).toFixed(2)}`;
  let positive = points[0].netGex >= 0;
  for (let i = 1; i < points.length; i++) {
    const p = (points[i].netGex >= 0) === positive;
    if (!p) {
      d += ` L${xOf(i).toFixed(2)},${yOf(points[i].netGex).toFixed(2)}`;
      segments.push({ d, positive });
      d = `M${xOf(i).toFixed(2)},${yOf(points[i].netGex).toFixed(2)}`;
      positive = !positive;
    } else {
      d += ` L${xOf(i).toFixed(2)},${yOf(points[i].netGex).toFixed(2)}`;
    }
  }
  segments.push({ d, positive });

  /* Spot on its own scale — context, not the subject, so it is thin and
     unlabelled here; its numbers live in the hover card. */
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of points) {
    if (p.spot < sMin) sMin = p.spot;
    if (p.spot > sMax) sMax = p.spot;
  }
  const sPad = (sMax - sMin) * 0.08 || 1;
  sMin -= sPad;
  sMax += sPad;
  const spotPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${(H - ((p.spot - sMin) / (sMax - sMin)) * H).toFixed(2)}`)
    .join(' ');

  const timeLabel = (t: number) =>
    new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${SHORT_GAMMA}` }} />
          Net GEX +
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${LONG_GAMMA}` }} />
          Net GEX −
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px dashed ${FLIP}` }} />
          Zero — the book flips
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${SPOT}` }} />
          Spot
        </span>
        {zeroCrossings.length > 0 && (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted tnum">
            flipped {zeroCrossings.length}× today
          </span>
        )}
      </div>

      <div
        ref={areaRef}
        className="flex-grow min-h-0 relative cursor-crosshair"
        onMouseMove={e => {
          const rect = areaRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0) return;
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          setHover(Math.round(ratio * (points.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
          ))}
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke={FLIP} strokeWidth="0.5" strokeDasharray="2 2" strokeOpacity="0.55" vectorEffect="non-scaling-stroke" />
          <path d={spotPath} fill="none" stroke={SPOT} strokeWidth="0.6" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke={s.positive ? SHORT_GAMMA : LONG_GAMMA}
              strokeWidth="0.9"
              strokeOpacity="0.9"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* The book's own flips, marked ON the zero line where they happened. */}
          {zeroCrossings.map(i => (
            <circle key={i} cx={xOf(i)} cy={zeroY} r="0.9" fill={FLIP} fillOpacity="0.9" />
          ))}
        </svg>
        <span className="absolute left-0 top-0 font-mono text-[8px] tnum text-textMuted">{fmtUsd(gMax)}</span>
        <span className="absolute left-0 bottom-0 font-mono text-[8px] tnum text-textMuted">{fmtUsd(gMin)}</span>

        {hover != null &&
          (() => {
            const p = points[hover];
            const xPct = (hover / (points.length - 1)) * 100;
            const flipSide = xPct > 58;
            return (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none" style={{ left: `${xPct}%` }} />
                <div
                  className="absolute top-1 pointer-events-none border border-borderMuted bg-panel/95 rounded px-2 py-1.5 shadow-xl shadow-black/50"
                  style={flipSide ? { right: `${100 - xPct + 1.5}%` } : { left: `${xPct + 1.5}%` }}
                >
                  <div className="font-mono text-[9px] text-textMuted tnum mb-0.5">{timeLabel(p.time)}</div>
                  <div className="font-mono text-[10px] tnum font-semibold" style={{ color: p.netGex >= 0 ? SHORT_GAMMA : LONG_GAMMA }}>
                    {fmtUsd(p.netGex)}
                    <span className="ml-1 font-normal text-textSecondary">{p.netGex >= 0 ? 'amplifying' : 'absorbing'}</span>
                  </div>
                  <div className="font-mono text-[10px] tnum text-textSecondary">spot {p.spot.toFixed(2)}</div>
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
};

export default NetGexDrift;
