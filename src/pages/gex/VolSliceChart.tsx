import { useState, type MouseEvent } from 'react';

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

const W = 100;
const H = 46;

/**
 * A single 2D cross-section of the IV surface — one row (skew) or one column
 * (term) — with a movable crosshair and a live selected-point readout. Every
 * value shown is read directly from the points passed in; nothing is refit.
 */
const VolSliceChart = ({ points, xCaption, xTitle, refIndex, refLabel }: VolSliceChartProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinIdx, setPinIdx] = useState<number>(refIndex);

  const ys = points.map(p => p.y);
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const pad = (rawMax - rawMin) * 0.14 || 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;

  const px = (i: number) => (points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W);
  const py = (v: number) => H - ((v - min) / span) * H;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(2)},${py(p.y).toFixed(2)}`).join(' ');
  const area = `${line} L${W.toFixed(2)},${H} L0,${H} Z`;

  const activeIdx = hoverIdx ?? Math.min(pinIdx, points.length - 1);
  const active = points[activeIdx];
  const ref = points[Math.min(refIndex, points.length - 1)];
  const dIv = active.y - ref.y;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / (rect.width || 1);
    const idx = Math.round(rel * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const tickIdxs = Array.from(
    new Set(
      points.length <= 6
        ? points.map((_, i) => i)
        : [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (points.length - 1)))
    )
  );

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Selected-point readout */}
      <div className="flex items-baseline gap-x-5 gap-y-1 flex-wrap select-none">
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">{xCaption}</span>
          <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">{active.label}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">Implied Vol</span>
          <span className="font-mono text-[13px] font-semibold tnum text-textPrimary">{active.y.toFixed(2)}%</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-textMuted">vs {refLabel}</span>
          <span className="font-mono text-[13px] font-semibold tnum text-textSecondary">
            {dIv > 0 ? '+' : dIv < 0 ? '−' : ''}
            {Math.abs(dIv).toFixed(2)}
          </span>
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-textMuted">
          {hoverIdx === null ? 'hover to scan · click to pin' : 'click to pin'}
        </span>
      </div>

      {/* Curve + crosshair */}
      <div className="flex-grow min-h-0 relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-full cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          onClick={() => hoverIdx !== null && setPinIdx(hoverIdx)}
        >
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
          ))}
          {/* Reference (ATM / 30D) */}
          <line
            x1={px(refIndex)}
            y1="0"
            x2={px(refIndex)}
            y2={H}
            stroke="rgba(143,143,143,0.5)"
            strokeWidth="0.4"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          <path d={area} fill="rgba(151,136,196,0.12)" />
          <path d={line} fill="none" stroke="rgba(151,136,196,0.9)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
          {/* Crosshair */}
          <line x1={px(activeIdx)} y1="0" x2={px(activeIdx)} y2={H} stroke="rgba(237,237,237,0.5)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1={py(active.y)} x2={W} y2={py(active.y)} stroke="rgba(237,237,237,0.28)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Reference tag */}
        <span
          className="absolute top-0 -translate-x-1/2 font-mono text-[9px] uppercase tracking-wider text-textMuted pointer-events-none"
          style={{ left: `${px(refIndex)}%` }}
        >
          {refLabel}
        </span>
        {/* Selected point marker (HTML so it stays round under the stretched viewBox) */}
        <span
          className="absolute w-[9px] h-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-textPrimary ring-2 ring-panel pointer-events-none"
          style={{ left: `${px(activeIdx)}%`, top: `${(py(active.y) / H) * 100}%` }}
        />
        <span className="absolute left-0 top-0 font-mono text-[9px] tnum text-textMuted">{max.toFixed(0)}%</span>
        <span className="absolute left-0 bottom-0 font-mono text-[9px] tnum text-textMuted">{min.toFixed(0)}%</span>
      </div>

      {/* X axis */}
      <div className="flex justify-between font-mono text-[9px] tnum text-textMuted select-none">
        {tickIdxs.map(i => (
          <span key={i}>{points[i].label}</span>
        ))}
      </div>
      <div className="text-center font-mono text-[9px] uppercase tracking-wider text-textMuted select-none">{xTitle}</div>
    </div>
  );
};

export default VolSliceChart;
