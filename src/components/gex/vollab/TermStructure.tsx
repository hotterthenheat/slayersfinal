import type { TermPoint, TermStructureData } from '../../../types/gex';

interface TermStructureProps {
  data: TermStructureData;
}

const W = 100;
const H = 44;

function pathFor(curve: TermPoint[], min: number, span: number): string {
  return curve
    .map((p, i) => {
      const x = (p.dte / 360) * W;
      const y = H - ((p.iv - min) / span) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

const GHOSTS: { key: keyof Pick<TermStructureData, 'monthAgo' | 'weekAgo' | 'dayAgo'>; label: string; stroke: string; dash?: string }[] = [
  { key: 'monthAgo', label: '1M ago', stroke: 'rgba(143,143,143,0.35)', dash: '2 2' },
  { key: 'weekAgo', label: '1W ago', stroke: 'rgba(143,143,143,0.55)', dash: '3 2' },
  { key: 'dayAgo', label: '1D ago', stroke: 'rgba(188,169,209,0.7)' },
];

/** ATM IV vs DTE — current curve over its own history ghosts. */
const TermStructure = ({ data }: TermStructureProps) => {
  const all = [...data.current, ...data.dayAgo, ...data.weekAgo, ...data.monthAgo];
  const min = Math.min(...all.map(p => p.iv)) - 1;
  const max = Math.max(...all.map(p => p.iv)) + 1;
  const span = max - min || 1;

  const stats: { label: string; value: string }[] = [
    { label: 'ATM IV 30D', value: `${data.stats.atm30.toFixed(2)}%` },
    { label: 'IV 1M', value: `${data.stats.iv1m.toFixed(2)}%` },
    { label: 'IV 3M', value: `${data.stats.iv3m.toFixed(2)}%` },
    { label: 'IV 6M', value: `${data.stats.iv6m.toFixed(2)}%` },
    { label: 'IV 1Y', value: `${data.stats.iv1y.toFixed(2)}%` },
    { label: 'IV Rank 1Y', value: `${data.stats.ivRank}%` },
    { label: 'IV %ile', value: `${data.stats.ivPercentile}%` },
  ];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap select-none">
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textPrimary">
          <span className="inline-block w-3 h-[2px] rounded-full bg-textPrimary" /> Current
        </span>
        {GHOSTS.slice().reverse().map(g => (
          <span key={g.key} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-textMuted">
            <span className="inline-block w-3 h-px rounded-full" style={{ background: g.stroke }} /> {g.label}
          </span>
        ))}
      </div>

      {/* Curves */}
      <div className="flex-grow min-h-0 relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" />
          ))}
          {GHOSTS.map(g => (
            <path
              key={g.key}
              d={pathFor(data[g.key], min, span)}
              fill="none"
              stroke={g.stroke}
              strokeWidth="0.5"
              strokeDasharray={g.dash}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={pathFor(data.current, min, span)} fill="none" stroke="#ededed" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-0 top-0 font-mono text-[8px] tnum text-textMuted">{max.toFixed(0)}%</span>
        <span className="absolute left-0 bottom-0 font-mono text-[8px] tnum text-textMuted">{min.toFixed(0)}%</span>
      </div>
      <div className="flex justify-between font-mono text-[8px] tnum text-textMuted select-none">
        {[7, 90, 180, 270, 360].map(t => (
          <span key={t}>{t}d</span>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-2 border-t border-borderSubtle">
        {stats.map(s => (
          <span key={s.label} className="min-w-0">
            <span className="block font-mono text-[8px] uppercase tracking-widest text-textMuted truncate">{s.label}</span>
            <span className="block font-mono text-[10px] font-semibold tnum text-textPrimary">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default TermStructure;
