import { useRef, useState } from 'react';
import { CALL_WALL, PUT_WALL, FLIP, SPOT } from '../palette';
import type { WallDriftPoint } from '../../../types/gex';

interface WallDriftProps {
  drift: WallDriftPoint[];
}

const W = 100;
const H = 40;

function linePath(points: WallDriftPoint[], pick: (p: WallDriftPoint) => number, min: number, span: number): string {
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((pick(p) - min) / span) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

const SERIES: { label: string; color: string; pick: (p: WallDriftPoint) => number; dash?: string; width: number }[] = [
  { label: 'Call wall', color: CALL_WALL, pick: p => p.callWall, width: 0.6 },
  { label: 'Put wall', color: PUT_WALL, pick: p => p.putWall, width: 0.6 },
  { label: 'Flip', color: FLIP, pick: p => p.flip, dash: '2 2', width: 0.7 },
  { label: 'Spot', color: SPOT, pick: p => p.spot, width: 0.9 },
];

/** Session timeline of the walls, flip and spot — proof the levels move. */
const WallDrift = ({ drift }: WallDriftProps) => {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (drift.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center font-mono text-[11px] text-textMuted uppercase tracking-widest">
        Awaiting session history…
      </div>
    );
  }

  let min = Infinity;
  let max = -Infinity;
  for (const p of drift) {
    for (const s of SERIES) {
      const v = s.pick(p);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const pad = (max - min) * 0.08 || 1;
  min -= pad;
  max += pad;
  const span = max - min;

  const timeLabel = (t: number) =>
    new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => drift[Math.min(drift.length - 1, Math.round(f * (drift.length - 1)))]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap select-none">
        {SERIES.map(s => (
          <span key={s.label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textSecondary">
            <span
              className="inline-block w-3 h-0"
              style={{ borderTop: `2px ${s.dash ? 'dashed' : 'solid'} ${s.color}` }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div
        ref={areaRef}
        className="flex-grow min-h-0 relative cursor-crosshair"
        onMouseMove={e => {
          const rect = areaRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0) return;
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          setHover(Math.round(ratio * (drift.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
          ))}
          {SERIES.map(s => (
            <path
              key={s.label}
              d={linePath(drift, s.pick, min, span)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              strokeOpacity={s.label === 'Spot' ? 0.9 : 0.85}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <span className="absolute left-0 top-0 font-mono text-[8px] tnum text-textMuted">{max.toFixed(0)}</span>
        <span className="absolute left-0 bottom-0 font-mono text-[8px] tnum text-textMuted">{min.toFixed(0)}</span>

        {/* Crosshair + reading card */}
        {hover != null &&
          (() => {
            const p = drift[hover];
            const xPct = (hover / (drift.length - 1)) * 100;
            const flipSide = xPct > 58;
            // Rows ordered the way the lines stack at this moment
            const rows = SERIES.map(s => ({ label: s.label, color: s.color, v: s.pick(p) })).sort((a, b) => b.v - a.v);
            return (
              <>
                <span
                  className="absolute top-0 bottom-0 w-px bg-white/20 pointer-events-none"
                  style={{ left: `${xPct}%` }}
                />
                {rows.map(r => (
                  <span
                    key={r.label}
                    className="absolute w-[7px] h-[7px] rounded-full border border-canvas pointer-events-none -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${xPct}%`, top: `${(1 - (r.v - min) / span) * 100}%`, background: r.color }}
                  />
                ))}
                <div
                  className="absolute top-1 z-10 pointer-events-none border border-borderSubtle bg-panelRaised/95 rounded-md px-2.5 py-2 shadow-lg min-w-[132px]"
                  style={flipSide ? { right: `${100 - xPct + 1.5}%` } : { left: `${xPct + 1.5}%` }}
                >
                  <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted tnum mb-1.5">
                    {timeLabel(p.time)}
                  </div>
                  <div className="flex flex-col gap-1">
                    {rows.map(r => (
                      <div key={r.label} className="flex items-center gap-2">
                        <span className="inline-block w-2 h-[2px] rounded-full shrink-0" style={{ background: r.color }} />
                        <span className="font-mono text-[9px] uppercase tracking-wider text-textSecondary">{r.label}</span>
                        <span className="ml-auto pl-3 font-mono text-[10px] font-semibold tnum text-textPrimary">
                          {r.v.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
      </div>
      <div className="flex justify-between font-mono text-[8px] tnum text-textMuted select-none">
        {ticks.map((p, i) => (
          <span key={`${p.time}-${i}`}>{timeLabel(p.time)}</span>
        ))}
      </div>
    </div>
  );
};

export default WallDrift;
