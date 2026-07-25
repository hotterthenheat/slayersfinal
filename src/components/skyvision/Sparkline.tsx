import { useState } from 'react';
import { BULL, BEAR } from '../gex/palette';
import HoverReadout from '../ui/HoverReadout';
import { svgHoverIndex } from '../ui/svgHover';

interface SparklineProps {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
  /** Optional hover heading (e.g. "30d RS", "hit rate") — series stays unlabeled without it. */
  label?: string;
}

/** Tiny inline trend line for group headers. Hover reads the point + change vs the series start. */
const Sparkline = ({ data, up, width = 88, height = 24, label }: SparklineProps) => {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const X = (i: number) => (i / (data.length - 1)) * width;
  const Yv = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  const pts = data.map((v, i) => `${X(i).toFixed(1)},${Yv(v).toFixed(1)}`).join(' ');
  // Real direction: green when up, red when down — house bull/bear tokens.
  const color = up ? BULL : BEAR;

  const hv = hover ? data[hover.i] : null;
  const delta = hv != null ? hv - data[0] : 0;
  const deltaPct = hv != null && data[0] !== 0 ? (delta / Math.abs(data[0])) * 100 : 0;

  return (
    <>
      <svg
        width={width}
        height={height}
        className="overflow-visible cursor-crosshair"
        onMouseMove={e => setHover({ i: svgHoverIndex(e, data.length), x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
      >
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <>
            <line x1={X(hover.i)} x2={X(hover.i)} y1={0} y2={height} stroke="rgba(255,255,255,0.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={X(hover.i)} cy={Yv(data[hover.i])} r={2.5} fill={color} />
          </>
        )}
      </svg>
      {hover && hv != null && (
        <HoverReadout x={hover.x} y={hover.y}>
          {label && <div className="font-mono text-micro text-textMuted uppercase tracking-wider">{label}</div>}
          <div className="font-mono text-caption font-bold text-textPrimary tnum">{hv.toFixed(2)}</div>
          <div className={`mt-0.5 font-mono text-micro tnum ${delta >= 0 ? 'text-bull' : 'text-bear'}`}>
            {delta >= 0 ? '+' : '−'}
            {Math.abs(delta).toFixed(2)} ({deltaPct >= 0 ? '+' : '−'}
            {Math.abs(deltaPct).toFixed(1)}%) vs start
          </div>
        </HoverReadout>
      )}
    </>
  );
};

export default Sparkline;
