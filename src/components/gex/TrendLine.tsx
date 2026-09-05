/*
  Tiny trend line for hover cards — coloured by direction of travel.

  0.13 · DELIBERATELY HIDDEN FROM SCREEN READERS, and the distinction is
  the point of that item rather than an exception to it. This sparkline sits
  beside a figure that already states the reading; describing it would make
  a reader who cannot see it hear the same fact twice, once in a worse
  form. A chart that carries information a screen reader cannot otherwise
  get needs a summary (see OrderFlowPanel); a chart that decorates one
  needs to get out of the way.

  The DIRECTION is the one thing the colour carries alone, so the caller's
  own text has to say it — which the hover cards do, in words, beside this.
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
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full h-7" aria-hidden="true" focusable="false">
      <polyline
        points={pts}
        fill="none"
        stroke={rising ? '#30D158' : '#FF3B30'}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default TrendLine;
