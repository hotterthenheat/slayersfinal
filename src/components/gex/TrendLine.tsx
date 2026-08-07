import { BULL, BEAR } from './palette';

/*
  Tiny trend line for hover cards — coloured by direction of travel.

  Deliberately NOT recharts, and the reason is structural rather than taste.
  This renders inside ui/HoverReadout, which is a portaled `position: fixed`
  card with no declared width — it sizes to its content. recharts'
  ResponsiveContainer measures its parent, and an auto-width parent measures
  zero on first layout, so the sparkline would render blank in exactly the place
  it is used. A 26-unit-tall polyline with no axes, no ticks and no tooltip also
  has nothing recharts would give it.

  Every chart with an axis, a scale or a read-out is on recharts
  (components/charts). This is the one shape that is not a chart.
*/
const TrendLine = ({ points }: { points: number[] }) => {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pts = points
    .map((v, i) => `${((i / (points.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / span) * 22 - 2).toFixed(1)}`)
    .join(' ');
  const rising = points[points.length - 1] >= points[0];
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-7" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={rising ? BULL : BEAR}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default TrendLine;
