import { useRef, useState } from 'react';
import { ALERT, SPOT } from './palette';
import { fmtUsd } from '../../data/gex';
import type { ErrorPoint } from '../../data/modelError';

/*
==================================================
  SLAYER TERMINAL - MODEL ERROR TIMELINE — P-23
  (components/gex/ErrorDrift.tsx)
==================================================

  Wall Drift's grammar, third sibling — same viewBox, same hover, same
  card — because the competitor this tab audits (Periscope) IS a time
  chart of actualized gamma, and an audit that answers a chart with a
  table loses on sight. The first cut did exactly that.

  THE GAP IS THE SUBJECT. Two lines share one dollar scale — the model in
  the tape's own white, the reference in the gauge's alert orange — and
  the region BETWEEN them is filled in that orange: the wrongness itself,
  visibly widening and narrowing through the session. A reader who takes
  nothing else takes that shape.

  No regime ink here on purpose: both series are net GEX, but this page's
  question is not "which regime" — it is "how far apart are these two
  answers", and ALERT is the desk's ink for a warning about a measurement.
*/

const W = 100;
const H = 40;

const ErrorDrift = ({ points }: { points: ErrorPoint[] }) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
        Awaiting shared moments…
      </div>
    );
  }

  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of points) {
    vMin = Math.min(vMin, p.inferred, p.actualized);
    vMax = Math.max(vMax, p.inferred, p.actualized);
  }
  const pad = (vMax - vMin) * 0.08 || 1;
  vMin -= pad;
  vMax += pad;
  const yOf = (v: number) => H - ((v - vMin) / (vMax - vMin)) * H;
  const xOf = (i: number) => (i / (points.length - 1)) * W;

  const line = (pick: (p: ErrorPoint) => number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(pick(p)).toFixed(2)}`).join(' ');

  /* The wrongness, as a region: forward along the model, back along the
     reference. One polygon — the fill does not care which line is on top,
     and the crossings where they trade places pinch it to zero, which is
     exactly what a moment of agreement should look like. */
  const gap =
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(2)},${yOf(p.inferred).toFixed(2)}`).join(' ') +
    ' ' +
    [...points]
      .reverse()
      .map((p, i) => `L${xOf(points.length - 1 - i).toFixed(2)},${yOf(p.actualized).toFixed(2)}`)
      .join(' ') +
    ' Z';

  const timeLabel = (t: number) =>
    new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-full flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-3 flex-wrap select-none">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${SPOT}` }} />
          Textbook GEX — ours
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-0" style={{ borderTop: `2px solid ${ALERT}` }} />
          Reference — simulated
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: ALERT, opacity: 0.25 }} />
          The gap is the error
        </span>
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
          <path d={gap} fill={ALERT} fillOpacity="0.14" stroke="none" />
          <path d={line(p => p.actualized)} fill="none" stroke={ALERT} strokeWidth="0.9" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" />
          <path d={line(p => p.inferred)} fill="none" stroke={SPOT} strokeWidth="0.7" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-0 top-0 font-mono text-[8px] tnum text-textMuted">{fmtUsd(vMax)}</span>
        <span className="absolute left-0 bottom-0 font-mono text-[8px] tnum text-textMuted">{fmtUsd(vMin)}</span>

        {hover != null &&
          (() => {
            const p = points[hover];
            const xPct = (hover / (points.length - 1)) * 100;
            const flipSide = xPct > 58;
            const big = p.errorPct !== null && Math.abs(p.errorPct) >= 0.25;
            return (
              <>
                <span className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none" style={{ left: `${xPct}%` }} />
                <div
                  className="absolute top-1 pointer-events-none border border-borderMuted bg-panel/95 rounded px-2 py-1.5 shadow-xl shadow-black/50"
                  style={flipSide ? { right: `${100 - xPct + 1.5}%` } : { left: `${xPct + 1.5}%` }}
                >
                  <div className="font-mono text-[9px] text-textMuted tnum mb-0.5">{timeLabel(p.time)}</div>
                  <div className="font-mono text-[10px] tnum text-textSecondary">ours {fmtUsd(p.inferred)}</div>
                  <div className="font-mono text-[10px] tnum" style={{ color: ALERT }}>ref {fmtUsd(p.actualized)}</div>
                  <div className={`font-mono text-[10px] tnum font-semibold ${big ? '' : 'text-textPrimary'}`} style={big ? { color: ALERT } : undefined}>
                    {p.errorPct === null ? 'ref at zero' : `${p.errorPct > 0 ? '+' : ''}${(p.errorPct * 100).toFixed(1)}% off`}
                  </div>
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
};

export default ErrorDrift;
