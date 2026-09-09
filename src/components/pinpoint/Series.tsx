import { useState } from 'react';
import { INK } from './ink';
import { useSize } from './Desk';

/*
==================================================
  SLAYER TERMINAL - SERIES (components/pinpoint/Series.tsx)
  Lines over time, or over price. The section's other picture.
==================================================

  One to four lines on one y axis, a zero rule where the sign matters, a
  band where a dead zone does, marks where a moment does. The y gutter is
  on the right, the way a price scale is, and the x axis is two words at
  the ends. A crosshair follows the pointer and the values at that x go to
  the caller, who prints them in the inspector rather than in a tooltip.
*/

export interface SeriesLine {
  key: string;
  points: { x: number; y: number }[];
  ink: string;
  dashed?: boolean;
  area?: boolean;
  width?: number;
}

interface Props {
  lines: SeriesLine[];
  /** Draw the zero rule. */
  zero?: boolean;
  /** A horizontal band on y. */
  band?: { lo: number; hi: number };
  /** Vertical marks at x, with an ink. */
  marks?: { x: number; ink: string; label?: string }[];
  /** A vertical rule at x — spot on a price axis. */
  rule?: { x: number; ink: string; label?: string };
  fmtX: (x: number) => string;
  fmtY: (y: number) => string;
  onHover?: (x: number | null, values: Record<string, number | null>) => void;
  /** A fixed height; otherwise it fills its box. */
  height?: number;
  ariaLabel: string;
  className?: string;
}

const GUTTER_R = 52;
const AXIS = 16;
const PAD_T = 6;

const Series = ({ lines, zero = false, band, marks = [], rule, fmtX, fmtY, onHover, height, ariaLabel, className = '' }: Props) => {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hx, setHx] = useState<number | null>(null);
  const w = size.w;
  const h = height ?? size.h;
  const all = lines.flatMap(l => l.points);
  if (!all.length) return <div ref={ref} className={`flex-1 min-h-0 ${className}`} />;
  const xs = all.map(p => p.x);
  /* THE BAND DOES NOT SET THE SCALE. It is a highlight over the lines, and
     a band far outside them (Holders' two break-evens against four hours of
     price) used to stretch the domain until the line it was drawn under was
     a flat rule at the top of the box. It is clipped to the plot instead. */
  const ys = all.map(p => p.y).concat(zero ? [0] : []);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y1 === y0) {
    y0 -= 1;
    y1 += 1;
  }
  const padY = (y1 - y0) * 0.06;
  y0 -= padY;
  y1 += padY;
  const plotW = Math.max(20, w - GUTTER_R);
  const plotH = Math.max(20, h - AXIS - PAD_T);
  const X = (x: number) => (x1 === x0 ? plotW / 2 : ((x - x0) / (x1 - x0)) * plotW);
  const Y = (y: number) => PAD_T + plotH - ((y - y0) / (y1 - y0)) * plotH;
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const ticks = [y1 - padY, (y0 + y1) / 2, y0 + padY];

  const move = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    if (px < 0 || px > plotW) return;
    const x = x0 + (px / plotW) * (x1 - x0);
    setHx(x);
    if (onHover) {
      const values: Record<string, number | null> = {};
      for (const l of lines) {
        let best: { x: number; y: number } | null = null;
        for (const p of l.points) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
        values[l.key] = best ? best.y : null;
      }
      onHover(x, values);
    }
  };

  return (
    <div ref={ref} className={`relative ${height ? '' : 'flex-1 min-h-0'} ${className}`} style={height ? { height } : undefined} data-series-chart>
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          role="img"
          aria-label={ariaLabel}
          className="block select-none"
          onMouseMove={e => move(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => {
            setHx(null);
            onHover?.(null, {});
          }}
        >
          {band &&
            (() => {
              const top = Math.max(PAD_T, Math.min(PAD_T + plotH, Y(band.hi)));
              const bot = Math.max(PAD_T, Math.min(PAD_T + plotH, Y(band.lo)));
              return <rect x={0} y={top} width={plotW} height={Math.max(0, bot - top)} fill="rgba(255,255,255,0.05)" data-band />;
            })()}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={0} x2={plotW} y1={Y(t)} y2={Y(t)} stroke={INK.rule} strokeWidth={1} />
              <text x={w - 2} y={Y(t) + 3.5} textAnchor="end" fontSize={9} fontFamily="ui-monospace, monospace" fill={INK.muted}>
                {fmtY(t)}
              </text>
            </g>
          ))}
          {zero && y0 < 0 && y1 > 0 && <line x1={0} x2={plotW} y1={Y(0)} y2={Y(0)} stroke={INK.secondary} strokeWidth={1} strokeDasharray="2 3" data-zero />}
          {lines.map(l => (
            <g key={l.key} data-line={l.key}>
              {l.area && l.points.length > 1 && <path d={`${path(l.points)} L${X(l.points[l.points.length - 1].x).toFixed(1)},${Y(Math.max(y0, Math.min(0, y1))).toFixed(1)} L${X(l.points[0].x).toFixed(1)},${Y(Math.max(y0, Math.min(0, y1))).toFixed(1)} Z`} fill={l.ink} opacity={0.12} />}
              <path d={path(l.points)} fill="none" stroke={l.ink} strokeWidth={l.width ?? 1.5} strokeDasharray={l.dashed ? '3 3' : undefined} strokeLinejoin="round" />
            </g>
          ))}
          {marks.map((m, i) => (
            <g key={i} data-mark>
              <line x1={X(m.x)} x2={X(m.x)} y1={PAD_T} y2={PAD_T + plotH} stroke={m.ink} strokeWidth={1} opacity={0.8} />
              {/* A mark's name rides BELOW the rule's, so a break-even nine
                  points from spot does not print over "SPOT". */}
              {m.label && (
                <text x={X(m.x) + 3} y={PAD_T + 20} fontSize={9} fontFamily="ui-monospace, monospace" fontWeight={700} fill={m.ink}>
                  {m.label}
                </text>
              )}
            </g>
          ))}
          {rule && (
            <g data-rule>
              <line x1={X(rule.x)} x2={X(rule.x)} y1={PAD_T} y2={PAD_T + plotH} stroke={rule.ink} strokeWidth={1.5} opacity={0.9} />
              {rule.label && (
                <text x={X(rule.x) + 3} y={PAD_T + 9} fontSize={9} fontFamily="ui-monospace, monospace" fontWeight={700} fill={rule.ink}>
                  {rule.label}
                </text>
              )}
            </g>
          )}
          {hx !== null && <line x1={X(hx)} x2={X(hx)} y1={PAD_T} y2={PAD_T + plotH} stroke={INK.primary} strokeWidth={1} opacity={0.5} data-crosshair />}
          <text x={0} y={h - 3} fontSize={9} fontFamily="ui-monospace, monospace" fill={INK.muted}>
            {fmtX(x0)}
          </text>
          <text x={plotW} y={h - 3} textAnchor="end" fontSize={9} fontFamily="ui-monospace, monospace" fill={INK.muted}>
            {fmtX(x1)}
          </text>
        </svg>
      )}
    </div>
  );
};

export default Series;
