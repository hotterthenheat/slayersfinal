import { BULL, BEAR } from '../gex/palette';

interface SparklineProps {
  data: number[];
  up: boolean;
  width?: number;
  height?: number;
}

/** Tiny inline trend line for group headers. */
const Sparkline = ({ data, up, width = 88, height = 24 }: SparklineProps) => {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  // Real direction: green when up, red when down — house bull/bear tokens.
  const color = up ? BULL : BEAR;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export default Sparkline;
