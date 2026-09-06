import { useMemo } from 'react';
import { INK, SELECT } from './ink';

/*
  A small line with a zero rule — today's net gamma, the error series,
  a wall's drift. Wide enough to read a shape, never a chart to read
  numbers off: the numbers are printed beside it.
*/
interface SparkProps {
  points: { x: number; y: number }[];
  width?: number;
  height?: number;
  ink?: string;
  /** Draw a rule at this y (usually 0) and mark the crossings. */
  zero?: number | null;
  /** Fill under the line to the zero rule. */
  area?: boolean;
  /** Indexes to mark with a dot. */
  marks?: number[];
  markInk?: string;
  /** A second line, drawn thinner — dashed when the two inks are close. */
  second?: { points: { x: number; y: number }[]; ink: string; dashed?: boolean };
  /** A shaded band between two y values — a dead zone. */
  band?: { lo: number; hi: number; fill: string } | null;
  className?: string;
  ariaLabel?: string;
}

const Spark = ({ points, width = 320, height = 72, ink = INK.primary, zero = 0, area = true, marks = [], markInk = SELECT, second, band = null, className = '', ariaLabel }: SparkProps) => {
  const geo = useMemo(() => {
    const all = [...points, ...(second?.points ?? [])];
    if (all.length === 0) return null;
    const xs = all.map(p => p.x);
    const ys = all.map(p => p.y).concat(zero !== null ? [zero] : []).concat(band ? [band.lo, band.hi] : []);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs);
    let y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const padY = 4;
    const sx = (x: number) => (x1 === x0 ? width / 2 : ((x - x0) / (x1 - x0)) * (width - 2)) + 1;
    const sy = (y: number) => padY + (1 - (y - y0) / (y1 - y0)) * (height - padY * 2);
    const path = (ps: { x: number; y: number }[]) => ps.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    return { sx, sy, path };
  }, [points, second, zero, band, width, height]);
  if (!geo || points.length === 0) return null;
  const { sx, sy, path } = geo;
  const zy = zero !== null ? sy(zero) : null;
  const line = path(points);
  const areaPath = zy !== null && area ? `${line} L${sx(points[points.length - 1].x).toFixed(1)},${zy.toFixed(1)} L${sx(points[0].x).toFixed(1)},${zy.toFixed(1)} Z` : null;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`block ${className}`} role="img" aria-label={ariaLabel}>
      {band && <rect x={0} y={sy(band.hi)} width={width} height={Math.max(1, sy(band.lo) - sy(band.hi))} fill={band.fill} />}
      {zy !== null && <line x1={0} x2={width} y1={zy} y2={zy} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      {areaPath && <path d={areaPath} fill={ink} opacity={0.12} />}
      {second && <path d={path(second.points)} fill="none" stroke={second.ink} strokeWidth={1} strokeDasharray={second.dashed ? '4 3' : undefined} vectorEffect="non-scaling-stroke" opacity={0.9} />}
      <path d={line} fill="none" stroke={ink} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {marks.map(i => points[i] && <circle key={i} cx={sx(points[i].x)} cy={sy(points[i].y)} r={2.6} fill={markInk} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
};

export default Spark;
